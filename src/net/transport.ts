import type { PeerInfo, PeerMeta, WireMessage } from './protocol';

export type TransportKind = 'livekit' | 'rehearsal';

/**
 * What the game needs from the network. Implemented by LiveKit (the real
 * thing) and by a BroadcastChannel "rehearsal" transport for trying the game
 * across tabs of one browser without a LiveKit server.
 */
export interface Transport {
  readonly kind: TransportKind;
  readonly selfIdentity: string;
  getPeers(): PeerInfo[];
  onPeers(cb: (peers: PeerInfo[]) => void): () => void;
  /** The metadata most recently requested for ourselves (may not be echoed yet). */
  getMeta(): PeerMeta;
  setMeta(meta: PeerMeta): Promise<void>;
  /** `to` omitted → everyone else in the room. */
  send(msg: WireMessage, to?: string[]): Promise<void>;
  onMessage(cb: (msg: WireMessage, from: string) => void): () => void;
  publishCamera(stream: MediaStream): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  disconnect(): void;
}
