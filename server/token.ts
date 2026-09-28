// LiveKit access-token minting with WebCrypto (HS256). Runs unchanged in the
// Cloudflare Workers runtime (Pages Function) and in Node 20+ (Vite dev server),
// so no server SDK dependency is needed.

export interface TokenEnv {
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_URL?: string;
}

export const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
  let bin = '';
  for (const b of data) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signLiveKitToken(
  apiKey: string,
  apiSecret: string,
  opts: { room: string; identity: string; name: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + TOKEN_TTL_SECONDS,
    video: {
      room: opts.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Roles and the room summary live in participant metadata.
      canUpdateOwnMetadata: true,
    },
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return `${signingInput}.${base64url(sig)}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Handles GET /api/token?room=&identity=&name= and returns { token, url }. */
export async function handleTokenRequest(request: Request, env: TokenEnv): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = env;
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return json(
      { error: 'LiveKit is not configured: set LIVEKIT_API_KEY, LIVEKIT_API_SECRET and LIVEKIT_URL.' },
      503,
    );
  }
  const params = new URL(request.url).searchParams;
  const room = (params.get('room') ?? '').toLowerCase();
  const identity = params.get('identity') ?? '';
  const name = (params.get('name') ?? '').trim().slice(0, 32);
  if (!ROOM_PATTERN.test(room)) return json({ error: 'invalid room id' }, 400);
  if (!IDENTITY_PATTERN.test(identity)) return json({ error: 'invalid identity' }, 400);
  if (!name) return json({ error: 'name required' }, 400);

  const token = await signLiveKitToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { room, identity, name });
  return json({ token, url: LIVEKIT_URL });
}
