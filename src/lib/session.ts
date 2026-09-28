// Tiny routing + identity helpers. No auth: a room id and a display name are enough.
import { useEffect, useState } from 'react';
import type { TransportKind } from '../net/transport';

export interface Route {
  room: string | null;
  mode: TransportKind;
}

export const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function normaliseRoom(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function parse(): Route {
  const m = location.pathname.match(/^\/durbar\/([^/]+)\/?$/);
  const room = m ? normaliseRoom(decodeURIComponent(m[1])) : null;
  const mode = new URLSearchParams(location.search).get('mode') === 'rehearsal' ? 'rehearsal' : 'livekit';
  return { room: room && ROOM_PATTERN.test(room) ? room : null, mode };
}

export function navigate(room: string | null, mode: TransportKind = 'livekit') {
  const path = room ? `/durbar/${room}${mode === 'rehearsal' ? '?mode=rehearsal' : ''}` : '/';
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return route;
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

function freshIdentity(room: string): string {
  // getRandomValues works in insecure contexts too (e.g. http://192.168.x.x),
  // unlike crypto.randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const id = `p_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  safe(() => sessionStorage.setItem(`durbar:identity:${room}`, id), undefined);
  return id;
}

/** Per-tab identity for a room, so a refresh rejoins as the same participant. */
export function identityFor(room: string): string {
  return safe(() => sessionStorage.getItem(`durbar:identity:${room}`), null) || freshIdentity(room);
}

// "Duplicate tab" copies sessionStorage, which would give two live tabs the
// same identity — LiveKit then kicks one of them. Tabs answer "who has X?"
// on this channel so a duplicate can notice and take a new identity.
const identityChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('durbar:identities') : null;
const liveIdentities = new Set<string>();
identityChannel?.addEventListener('message', (e: MessageEvent<{ type: string; id: string }>) => {
  if (e.data?.type === 'who' && liveIdentities.has(e.data.id)) identityChannel.postMessage({ type: 'here', id: e.data.id });
});
const identityClaims = new Map<string, Promise<string>>();

/** Like identityFor, but guaranteed not to clash with another open tab. Memoised per room. */
export function claimTabIdentity(room: string): Promise<string> {
  let p = identityClaims.get(room);
  if (!p) {
    p = (async () => {
      let id = identityFor(room);
      if (identityChannel) {
        const taken = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => done(false), 250);
          const onMsg = (e: MessageEvent<{ type: string; id: string }>) => {
            if (e.data?.type === 'here' && e.data.id === id) done(true);
          };
          const done = (v: boolean) => {
            clearTimeout(timer);
            identityChannel.removeEventListener('message', onMsg);
            resolve(v);
          };
          identityChannel.addEventListener('message', onMsg);
          identityChannel.postMessage({ type: 'who', id });
        });
        if (taken) {
          id = freshIdentity(room);
          // The copied seat claim belongs to the original tab.
          safe(() => sessionStorage.removeItem(`durbar:claim:${room}`), undefined);
        }
      }
      liveIdentities.add(id);
      return id;
    })();
    identityClaims.set(room, p);
  }
  return p;
}

/** Last name typed on the landing page; the default for new rooms. */
export const savedName = () => safe(() => localStorage.getItem('durbar:name') ?? '', '');
export const saveName = (name: string) => safe(() => localStorage.setItem('durbar:name', name), undefined);

/**
 * The name this tab uses in a room. Pinned per tab so a refresh keeps it even
 * if another tab has since saved a different default name.
 */
export function nameFor(room: string): string {
  const key = `durbar:name:${room}`;
  const pinned = safe(() => sessionStorage.getItem(key), null);
  if (pinned) return pinned;
  const name = savedName();
  if (name) safe(() => sessionStorage.setItem(key, name), undefined);
  return name;
}
export function pinName(room: string, name: string) {
  safe(() => sessionStorage.setItem(`durbar:name:${room}`, name), undefined);
}

const REALMS = ['magadha', 'kalinga', 'vijayanagara', 'chola', 'avanti', 'kosala', 'gandhara', 'mewar', 'hampi', 'kashi'];
export function suggestRoom(): string {
  const realm = REALMS[Math.floor(Math.random() * REALMS.length)];
  return `${realm}-${100 + Math.floor(Math.random() * 900)}`;
}

// ── Itihas Codex: persistent per-browser collection ────────────────────────
const CODEX_KEY = 'durbar:codex';
export function loadCodex(): string[] {
  return safe(() => JSON.parse(localStorage.getItem(CODEX_KEY) ?? '[]') as string[], []);
}
export function addToCodex(ids: string[]): string[] {
  const merged = [...new Set([...loadCodex(), ...ids])];
  safe(() => localStorage.setItem(CODEX_KEY, JSON.stringify(merged)), undefined);
  return merged;
}
