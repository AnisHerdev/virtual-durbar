// Rehearsal mode: a serverless transport over BroadcastChannel. Every tab of
// this browser that opens the same room joins the same court. There is no
// video between tabs (each tab only sees its own AR camera), but the whole
// game — roles, secret actions, whispers — runs exactly as it does on LiveKit.

import { type PeerInfo, type PeerMeta, type WireMessage } from './protocol';
import type { Transport } from './transport';

type Packet =
  | { k: 'presence'; from: string; name: string; meta: PeerMeta; ask?: boolean }
  | { k: 'bye'; from: string }
  | { k: 'msg'; from: string; to?: string[]; msg: WireMessage };

const HEARTBEAT_MS = 1500;
const EXPIRE_MS = 5000;

export class RehearsalTransport implements Transport {
  readonly kind = 'rehearsal' as const;
  private channel: BroadcastChannel;
  private peers = new Map<string, PeerInfo & { seen: number }>();
  private meta: PeerMeta = {};
  private peerListeners = new Set<(p: PeerInfo[]) => void>();
  private messageListeners = new Set<(m: WireMessage, from: string) => void>();
  private timer: number;

  constructor(
    room: string,
    readonly selfIdentity: string,
    private name: string,
  ) {
    this.channel = new BroadcastChannel(`durbar:${room}`);
    this.channel.onmessage = (e: MessageEvent<Packet>) => this.receive(e.data);
    this.announce(true);
    this.timer = window.setInterval(() => {
      this.announce(false);
      const now = Date.now();
      let changed = false;
      for (const [id, p] of this.peers) {
        if (now - p.seen > EXPIRE_MS) {
          this.peers.delete(id);
          changed = true;
        }
      }
      if (changed) this.emitPeers();
    }, HEARTBEAT_MS);
    window.addEventListener('pagehide', this.bye);
  }

  private bye = () => this.channel.postMessage({ k: 'bye', from: this.selfIdentity } satisfies Packet);

  private announce(ask: boolean) {
    this.channel.postMessage({ k: 'presence', from: this.selfIdentity, name: this.name, meta: this.meta, ask } satisfies Packet);
  }

  private receive(p: Packet) {
    if (p.from === this.selfIdentity) return;
    switch (p.k) {
      case 'presence': {
        const before = this.peers.get(p.from);
        this.peers.set(p.from, { identity: p.from, name: p.name, meta: p.meta, isLocal: false, seen: Date.now() });
        if (p.ask) this.announce(false);
        if (!before || JSON.stringify(before.meta) !== JSON.stringify(p.meta) || before.name !== p.name) this.emitPeers();
        break;
      }
      case 'bye':
        if (this.peers.delete(p.from)) this.emitPeers();
        break;
      case 'msg':
        if (!p.to || p.to.includes(this.selfIdentity)) {
          for (const fn of this.messageListeners) fn(p.msg, p.from);
        }
        break;
    }
  }

  private emitPeers() {
    const peers = this.getPeers();
    for (const fn of this.peerListeners) fn(peers);
  }

  getPeers(): PeerInfo[] {
    const self: PeerInfo = { identity: this.selfIdentity, name: this.name, meta: this.meta, isLocal: true };
    return [self, ...[...this.peers.values()].map(({ seen: _seen, ...p }) => p)];
  }

  onPeers(cb: (p: PeerInfo[]) => void) {
    this.peerListeners.add(cb);
    return () => void this.peerListeners.delete(cb);
  }

  getMeta(): PeerMeta {
    return this.meta;
  }

  async setMeta(meta: PeerMeta) {
    this.meta = meta;
    this.announce(false);
    this.emitPeers();
  }

  async send(msg: WireMessage, to?: string[]) {
    if (to && !to.length) return;
    // Round-trip through JSON so rehearsal behaves like the real wire.
    this.channel.postMessage({ k: 'msg', from: this.selfIdentity, to, msg: JSON.parse(JSON.stringify(msg)) } satisfies Packet);
  }

  onMessage(cb: (m: WireMessage, from: string) => void) {
    this.messageListeners.add(cb);
    return () => void this.messageListeners.delete(cb);
  }

  async publishCamera() {}
  async setMicrophone() {}

  disconnect() {
    this.bye();
    clearInterval(this.timer);
    window.removeEventListener('pagehide', this.bye);
    this.channel.close();
    this.peerListeners.clear();
    this.messageListeners.clear();
  }
}
