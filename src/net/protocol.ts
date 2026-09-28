import type { RoleId } from '../content/types';
import type { ClientAction, ClientView, RoomSummary } from '../game/types';

/** Stored in each participant's LiveKit metadata (JSON). */
export interface PeerMeta {
  role?: RoleId;
  /** When the role was claimed; the earliest claim wins a conflict. */
  claimedAt?: number;
  /** Written by the host only: public room state for late joiners. */
  summary?: RoomSummary;
}

export interface PeerInfo {
  identity: string;
  name: string;
  meta: PeerMeta;
  isLocal: boolean;
}

/** Everything sent over the data channel (topic "durbar"). */
export type WireMessage =
  | { t: 'action'; id: string; action: ClientAction }
  | { t: 'action-error'; id: string; message: string }
  /** `epoch` changes whenever the host restarts, which resets `seq`. */
  | { t: 'view'; epoch: string; seq: number; now: number; view: ClientView }
  | { t: 'sync' }
  | { t: 'whisper'; id: string; text: string; at: number };

export const TOPIC = 'durbar';

export function parseMeta(raw: string | undefined): PeerMeta {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw);
    return m && typeof m === 'object' ? (m as PeerMeta) : {};
  } catch {
    return {};
  }
}

/**
 * Role locking. Every client computes the same answer from the same metadata:
 * for each role, the earliest claim (tie → lower identity) owns it.
 */
export function resolveRoles(peers: PeerInfo[]): Map<string, RoleId> {
  const owners = new Map<RoleId, PeerInfo>();
  for (const p of peers) {
    const role = p.meta.role;
    if (!role) continue;
    const cur = owners.get(role);
    const at = p.meta.claimedAt ?? Number.MAX_SAFE_INTEGER;
    const curAt = cur?.meta.claimedAt ?? Number.MAX_SAFE_INTEGER;
    if (!cur || at < curAt || (at === curAt && p.identity < cur.identity)) owners.set(role, p);
  }
  const byIdentity = new Map<string, RoleId>();
  for (const [role, p] of owners) byIdentity.set(p.identity, role);
  return byIdentity;
}
