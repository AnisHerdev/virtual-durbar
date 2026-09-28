// The court session: role locking over participant metadata, a host-authoritative
// game engine on the Raja's client, and secret actions/whispers over the data channel.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Content, RoleId } from '../content/types';
import { config } from '../lib/config';
import { resolveRoles, type PeerInfo, type WireMessage } from '../net/protocol';
import type { Transport } from '../net/transport';
import { ActionError, applyAction, createGame, syncPlayers, tick, type EngineCtx } from './engine';
import type { ClientAction, ClientView, GameState, PlayerSeed, RoomSummary } from './types';
import { summaryOf, viewFor } from './views';

const TICK_MS = 250;

export interface Whisper {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
}

export interface Court {
  roomId: string;
  transport: Transport;
  selfIdentity: string;
  peers: PeerInfo[];
  roles: Map<string, RoleId>;
  myRole: RoleId | null;
  hostIdentity: string | null;
  isHost: boolean;
  view: ClientView | null;
  summary: RoomSummary | null;
  claimRole: (role: RoleId | null) => Promise<void>;
  roleConflict: RoleId | null;
  act: (action: ClientAction) => void;
  lastError: string | null;
  clearError: () => void;
  serverNow: () => number;
  whispers: Whisper[];
  whisper: (to: string, text: string) => void;
}

const storageKey = (room: string, identity: string) => `durbar:host:${room}:${identity}`;

function loadHostState(room: string, identity: string): GameState | null {
  try {
    const raw = localStorage.getItem(storageKey(room, identity));
    const s = raw ? (JSON.parse(raw) as GameState) : null;
    return s?.version === 1 ? s : null;
  } catch {
    return null;
  }
}

function saveHostState(room: string, identity: string, state: GameState) {
  try {
    localStorage.setItem(storageKey(room, identity), JSON.stringify(state));
  } catch {
    /* storage full or blocked: the game continues in memory */
  }
}

const claimKey = (room: string) => `durbar:claim:${room}`;
function loadClaim(room: string): { role?: RoleId; claimedAt?: number } {
  try {
    return JSON.parse(sessionStorage.getItem(claimKey(room)) ?? '{}');
  } catch {
    return {};
  }
}
function saveClaim(room: string, claim: { role?: RoleId; claimedAt?: number }) {
  try {
    sessionStorage.setItem(claimKey(room), JSON.stringify(claim));
  } catch {
    /* ignore */
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

export function useCourt(transport: Transport, content: Content, roomId: string): Court {
  const self = transport.selfIdentity;
  const [peers, setPeers] = useState<PeerInfo[]>(() => transport.getPeers());
  const [view, setView] = useState<ClientView | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const clockOffset = useRef(0);
  const lastSeq = useRef(-1);
  const lastEpoch = useRef('');

  useEffect(() => transport.onPeers(setPeers), [transport]);

  const roles = useMemo(() => resolveRoles(peers), [peers]);
  const myClaim = peers.find((p) => p.isLocal)?.meta.role ?? null;
  const myRole = roles.get(self) ?? null;
  const roleConflict = myClaim && myRole !== myClaim ? myClaim : null;
  const hostIdentity = useMemo(() => [...roles].find(([, r]) => r === 'raja')?.[0] ?? null, [roles]);
  const isHost = hostIdentity === self;
  const summary = useMemo(
    () => (hostIdentity ? peers.find((p) => p.identity === hostIdentity)?.meta.summary ?? null : null),
    [peers, hostIdentity],
  );

  // Lost a simultaneous claim → release it so the lobby shows us as unseated.
  useEffect(() => {
    if (!roleConflict) return;
    const t = setTimeout(() => {
      saveClaim(roomId, {});
      void transport.setMeta({});
    }, 1500);
    return () => clearTimeout(t);
  }, [roleConflict, transport, roomId]);

  const claimRole = useCallback(
    async (role: RoleId | null) => {
      const claim = role ? { role, claimedAt: Date.now() } : {};
      saveClaim(roomId, claim);
      await transport.setMeta(claim);
    },
    [transport, roomId],
  );

  // After a refresh, re-take the same seat with the original claim time, so
  // whoever held it first (e.g. the Raja, who hosts the game) gets it back.
  useEffect(() => {
    const saved = loadClaim(roomId);
    if (saved.role) void transport.setMeta(saved);
  }, [transport, roomId]);

  // ── host engine ──────────────────────────────────────────────────────────
  const hostState = useRef<GameState | null>(null);
  const sentViews = useRef(new Map<string, string>());
  const seq = useRef(0);
  const epoch = useRef(newId());
  const lastSummary = useRef('');
  const peersRef = useRef(peers);
  peersRef.current = peers;
  const rolesRef = useRef(roles);
  rolesRef.current = roles;

  const ctx = useCallback((): EngineCtx => ({ content, now: Date.now(), timeScale: config.timeScale }), [content]);

  const publish = useCallback(
    (state: GameState, force = false) => {
      hostState.current = state;
      saveHostState(roomId, self, state);
      const now = Date.now();
      const audience = new Set([...Object.keys(state.players), ...peersRef.current.map((p) => p.identity)]);
      for (const id of audience) {
        const v = viewFor(state, id, content);
        const json = JSON.stringify(v);
        if (!force && sentViews.current.get(id) === json) continue;
        sentViews.current.set(id, json);
        if (id === self) {
          setView(v);
        } else if (peersRef.current.some((p) => p.identity === id)) {
          void transport.send({ t: 'view', epoch: epoch.current, seq: seq.current++, now, view: v }, [id]);
        }
      }
      const sum = summaryOf(state);
      const sumJson = JSON.stringify(sum);
      if (sumJson !== lastSummary.current) {
        lastSummary.current = sumJson;
        // Merge into what we last requested, not the (possibly un-echoed) peer list,
        // so the summary never overwrites a fresh seat claim.
        void transport.setMeta({ ...transport.getMeta(), summary: sum });
      }
    },
    [content, roomId, self, transport],
  );

  const seeds = useCallback(
    (): PlayerSeed[] =>
      peersRef.current.flatMap((p) => {
        const role = rolesRef.current.get(p.identity);
        return role ? [{ identity: p.identity, name: p.name, role }] : [];
      }),
    [],
  );

  // Become (or stop being) the host.
  useEffect(() => {
    if (!isHost) {
      hostState.current = null;
      return;
    }
    const restored = loadHostState(roomId, self);
    const initial = restored ?? createGame(Math.floor(Math.random() * 2 ** 31), ctx());
    sentViews.current.clear();
    lastSummary.current = '';
    publish(syncPlayers(initial, seeds(), ctx()), true);
    const timer = setInterval(() => {
      const s = hostState.current;
      if (!s) return;
      const next = tick(s, ctx());
      if (next !== s) publish(next);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [isHost, roomId, self, ctx, publish, seeds]);

  // Roster changes → reconcile players on the host.
  useEffect(() => {
    if (!isHost || !hostState.current) return;
    publish(syncPlayers(hostState.current, seeds(), ctx()));
  }, [isHost, peers, roles, publish, seeds, ctx]);

  const hostApply = useCallback(
    (action: ClientAction, actor: string): string | null => {
      const s = hostState.current;
      if (!s) return 'The court is not in session.';
      try {
        publish(applyAction(s, action, actor, ctx()));
        return null;
      } catch (e) {
        if (e instanceof ActionError) return e.message;
        console.error('[host] action failed', action, e);
        return 'Something went wrong in the court.';
      }
    },
    [ctx, publish],
  );

  // ── messages ─────────────────────────────────────────────────────────────
  useEffect(
    () =>
      transport.onMessage((msg: WireMessage, from: string) => {
        switch (msg.t) {
          case 'action':
            if (!isHost) return;
            {
              const err = hostApply(msg.action, from);
              if (err) void transport.send({ t: 'action-error', id: msg.id, message: err }, [from]);
            }
            return;
          case 'sync':
            if (isHost && hostState.current) {
              const v = viewFor(hostState.current, from, content);
              sentViews.current.set(from, JSON.stringify(v));
              void transport.send({ t: 'view', epoch: epoch.current, seq: seq.current++, now: Date.now(), view: v }, [from]);
            }
            return;
          case 'view':
            if (from !== hostIdentity) return; // only the throne speaks for the court
            if (msg.epoch !== lastEpoch.current) {
              lastEpoch.current = msg.epoch;
              lastSeq.current = -1;
            }
            if (msg.seq <= lastSeq.current) return;
            lastSeq.current = msg.seq;
            clockOffset.current = msg.now - Date.now();
            setView(msg.view);
            return;
          case 'action-error':
            setLastError(msg.message);
            return;
          case 'whisper':
            setWhispers((w) => [...w, { id: msg.id, from, to: self, text: msg.text, at: msg.at }].slice(-100));
            return;
        }
      }),
    [transport, isHost, hostApply, hostIdentity, content, self],
  );

  // New host (or we just arrived) → ask for a fresh view.
  useEffect(() => {
    lastSeq.current = -1;
    if (!isHost) setView(null);
    if (hostIdentity && !isHost) void transport.send({ t: 'sync' }, [hostIdentity]);
  }, [hostIdentity, isHost, transport]);

  const act = useCallback(
    (action: ClientAction) => {
      setLastError(null);
      if (isHost) {
        const err = hostApply(action, self);
        if (err) setLastError(err);
      } else if (hostIdentity) {
        void transport.send({ t: 'action', id: newId(), action }, [hostIdentity]);
      } else {
        setLastError('The throne is empty — someone must take the Raja’s seat.');
      }
    },
    [isHost, hostApply, self, hostIdentity, transport],
  );

  const whisper = useCallback(
    (to: string, text: string) => {
      const w = { id: newId(), text: text.slice(0, 500), at: Date.now() };
      void transport.send({ t: 'whisper', ...w }, [to]);
      setWhispers((all) => [...all, { ...w, from: self, to }].slice(-100));
    },
    [transport, self],
  );

  const serverNow = useCallback(() => (isHost ? Date.now() : Date.now() + clockOffset.current), [isHost]);

  return {
    roomId,
    transport,
    selfIdentity: self,
    peers,
    roles,
    myRole,
    hostIdentity,
    isHost,
    view,
    summary,
    claimRole,
    roleConflict,
    act,
    lastError,
    clearError: () => setLastError(null),
    serverNow,
    whispers,
    whisper,
  };
}
