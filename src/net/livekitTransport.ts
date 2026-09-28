import { DisconnectReason, Participant, Room, RoomEvent, Track, type LocalTrackPublication } from 'livekit-client';
import { config } from '../lib/config';
import { parseMeta, TOPIC, type PeerInfo, type PeerMeta, type WireMessage } from './protocol';
import type { Transport } from './transport';

export async function fetchToken(room: string, identity: string, name: string): Promise<{ token: string; url: string }> {
  const qs = new URLSearchParams({ room, identity, name });
  const res = await fetch(`${config.tokenEndpoint}?${qs}`);
  const body = (await res.json().catch(() => ({}))) as { token?: string; url?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error || `Token endpoint returned ${res.status}`);
  const url = config.livekitUrlOverride || body.url;
  if (!url) throw new Error('No LiveKit URL configured.');
  return { token: body.token, url };
}

function describeDisconnect(reason?: DisconnectReason): string {
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'You joined this court again from another tab or device, so this one was closed.';
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'You were removed from the room.';
    case DisconnectReason.ROOM_DELETED:
      return 'The room was closed.';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'The LiveKit server restarted.';
    case DisconnectReason.JOIN_FAILURE:
      return 'Could not finish joining the room (network or firewall blocking WebRTC?).';
    default:
      return `Lost the connection to the court (${reason !== undefined ? DisconnectReason[reason] : 'network'}).`;
  }
}

export class LiveKitTransport implements Transport {
  readonly kind = 'livekit' as const;
  private peerListeners = new Set<(p: PeerInfo[]) => void>();
  private messageListeners = new Set<(m: WireMessage, from: string) => void>();
  private cameraPub: Promise<LocalTrackPublication> | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private disconnectListeners = new Set<(reason: string) => void>();
  private closing = false;
  private metaQueue: Promise<void> = Promise.resolve();
  private requestedMeta: string | null = null;

  private constructor(readonly room: Room) {
    const emit = () => {
      const peers = this.getPeers();
      for (const fn of this.peerListeners) fn(peers);
    };
    room
      .on(RoomEvent.ParticipantConnected, emit)
      .on(RoomEvent.ParticipantDisconnected, emit)
      .on(RoomEvent.ParticipantMetadataChanged, emit)
      .on(RoomEvent.ParticipantNameChanged, emit)
      .on(RoomEvent.Reconnected, emit)
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.closing) return; // we asked for it
        const message = describeDisconnect(reason);
        for (const fn of this.disconnectListeners) fn(message);
      });
    room.registerTextStreamHandler(TOPIC, async (reader, info) => {
      try {
        const msg = JSON.parse(await reader.readAll()) as WireMessage;
        for (const fn of this.messageListeners) fn(msg, info.identity);
      } catch (e) {
        console.warn('[livekit] bad message', e);
      }
    });
  }

  static async connect(roomId: string, identity: string, name: string): Promise<LiveKitTransport> {
    const { token, url } = await fetchToken(roomId, identity, name);
    const room = new Room({ adaptiveStream: true, dynacast: true });
    await room.connect(url, token);
    return new LiveKitTransport(room);
  }

  get selfIdentity() {
    return this.room.localParticipant.identity;
  }

  private toPeer(p: Participant, isLocal: boolean): PeerInfo {
    return { identity: p.identity, name: p.name || p.identity, meta: parseMeta(p.metadata), isLocal };
  }

  getPeers(): PeerInfo[] {
    return [
      this.toPeer(this.room.localParticipant, true),
      ...[...this.room.remoteParticipants.values()].map((p) => this.toPeer(p, false)),
    ];
  }

  onPeers(cb: (p: PeerInfo[]) => void) {
    this.peerListeners.add(cb);
    return () => void this.peerListeners.delete(cb);
  }

  getMeta(): PeerMeta {
    return this.requestedMeta ? (JSON.parse(this.requestedMeta) as PeerMeta) : parseMeta(this.room.localParticipant.metadata);
  }

  /**
   * LiveKit's setMetadata waits for the server to echo the new value, so a
   * duplicate or overlapping update times out (and can clobber the other).
   * Writes are therefore de-duplicated and applied one at a time, latest wins.
   */
  setMeta(meta: PeerMeta): Promise<void> {
    const json = JSON.stringify(meta);
    if (json === this.requestedMeta) return this.metaQueue;
    this.requestedMeta = json;
    this.metaQueue = this.metaQueue.then(async () => {
      if (json !== this.requestedMeta) return; // superseded by a newer write
      if (this.room.localParticipant.metadata !== json) {
        try {
          await this.room.localParticipant.setMetadata(json);
        } catch (e) {
          console.warn('[livekit] metadata update failed', e);
        }
      }
      // The local participant's own change is not always echoed as an event.
      const peers = this.getPeers();
      for (const fn of this.peerListeners) fn(peers);
    });
    return this.metaQueue;
  }

  async send(msg: WireMessage, to?: string[]) {
    if (to && !to.length) return;
    await this.room.localParticipant.sendText(JSON.stringify(msg), { topic: TOPIC, destinationIdentities: to });
  }

  onMessage(cb: (m: WireMessage, from: string) => void) {
    this.messageListeners.add(cb);
    return () => void this.messageListeners.delete(cb);
  }

  async publishCamera(stream: MediaStream) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    // Idempotent even while a publish is still in flight (React may call twice).
    if (this.cameraTrack === track && this.cameraPub) {
      await this.cameraPub;
      return;
    }
    const previous = this.cameraPub;
    this.cameraTrack = track;
    this.cameraPub = (async () => {
      const old = await previous?.catch(() => null);
      if (old?.track) await this.room.localParticipant.unpublishTrack(old.track, false);
      return this.room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        name: 'durbar-ar',
        simulcast: true,
      });
    })();
    try {
      await this.cameraPub;
    } catch (e) {
      this.cameraPub = null;
      this.cameraTrack = null;
      throw e;
    }
  }

  async setMicrophone(enabled: boolean) {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  onDisconnected(cb: (reason: string) => void) {
    this.disconnectListeners.add(cb);
    return () => void this.disconnectListeners.delete(cb);
  }

  disconnect() {
    this.closing = true;
    void this.room.disconnect();
    this.peerListeners.clear();
    this.messageListeners.clear();
    this.disconnectListeners.clear();
  }
}
