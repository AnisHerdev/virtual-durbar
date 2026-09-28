# Virtual Durbar

A browser-based royal court video game. Players take the seats of a Raja/Rani and six ministers, govern a realm through
an accelerated three-day cycle of 15 tasks, and learn to see through betrayal with **Kautilya's Lens**. Each webcam is
painted into a miniature-style courtroom on the player's own device, and a Hindustani raga follows the time of day.

All gold, grain and troops are imaginary. There is no real-money integration and no login.

## Quick start

```bash
npm install          # also copies the MediaPipe WASM runtime into public/mediapipe
npm run dev          # http://localhost:5173
npm test             # engine tests: plays a full 15-task game
npm run build        # type-check + production build to dist/
```

**No LiveKit server?** Pick **Rehearsal** on the landing page. Every tab of the same browser that opens the same room
joins one court over `BroadcastChannel`, so you can play all seats yourself. Video isn't shared between tabs in
rehearsal mode; everything else, including secret actions and whispers, runs exactly as it does online.

**Camera on another device (phone, laptop on the same Wi-Fi):** browsers only allow the camera on `https://` or
`localhost`. Run `npm run dev:https` (self-signed certificate, listens on your LAN) and open the `https://192.168…`
address. Accept the certificate warning once.

### Online play (LiveKit)

1. Create a LiveKit Cloud project (or run `livekit-server`).
2. `cp .env.example .env.local` and fill in `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`.
3. `npm run dev`. The Vite dev server serves `/api/token` from the same code as the production Pages Function.

## Deploying to Cloudflare Pages

- Build command `npm run build`, output directory `dist`.
- Set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (encrypted) and `LIVEKIT_URL` under *Settings → Environment variables*.
- `functions/api/token.ts` becomes `GET /api/token?room=&identity=&name=` → `{ token, url }`. It signs HS256 JWTs with
  WebCrypto, so no server SDK is needed.
- `wrangler pages dev dist` runs it locally (put secrets in `.dev.vars`).

Every variable is documented in [`.env.example`](.env.example). No credentials live in the code.

> Rooms have no passwords, by design. Anyone who knows a room ID can join it. Put Cloudflare rate limiting in front of
> `/api/token` if you expose it publicly.

## How it works

```
webcam ─▶ ImageSegmenter (person mask) ─▶ court background ─┐
       └▶ FaceLandmarker (head pose)   ─▶ role headwear   ──┴▶ hidden <canvas> ─▶ captureStream(30) ─▶ LiveKit
```

| Area | Where | Notes |
| --- | --- | --- |
| AR pipeline | `src/ar/ARPipeline.ts`, `headPose.ts`, `visionModels.ts` | GPU delegate with CPU fallback. Without a camera or models, it publishes a painted emblem instead. MediaPipe is lazy-loaded. |
| Raga soundtrack | `src/audio/RagaEngine.ts` | Uses `public/assets/audio/*.mp3` if present. Otherwise it synthesises a tanpura drone and phrases from each raga's aroha/avaroha/pakad, with crossfades between phases. |
| Transport | `src/net/` | `Transport` interface with two implementations: `LiveKitTransport` (participant metadata plus `sendText` data streams on topic `durbar`) and `RehearsalTransport` (`BroadcastChannel`). |
| Role locking | `src/net/protocol.ts` → `resolveRoles` | Each player claims a role in their participant metadata. The earliest claim wins, and every client computes the same result. Claims survive a refresh. |
| Game engine | `src/game/engine.ts` | Pure reducer run only by the host (the Raja's client). It validates every action against the sender's identity and role. |
| Redaction | `src/game/views.ts` | The host sends each player a personal `ClientView`: traitor identity, clues, pledges and enemy positions are stripped unless that player may see them. |
| Session | `src/game/useCourt.ts` | Host election, per-player view broadcast, public room summary in the host's metadata, clock sync, and peer-to-peer whispers (these skip the host). |

### The game

Each of the 3 days runs **Morning petitions ×2 → Midday riddle → Afternoon team mission → Sunset edict**.

- **Petitions:** the Raja assigns a minister, who solves a mystery or picks a policy against a timer.
- **Riddles:** the first minister to answer correctly wins gold. A wrong answer silences you for that riddle.
- **Missions:**
  - *Court Trial:* each seat holds different evidence.
  - *Famine:* secret pledges. Only the Sitadhyaksha knows the true need.
  - *Defend the Fort:* the Spy Chief sees the enemy while the Senapati moves troops blind; there are also parleys and mercenaries.
  - When a role is empty, its duty passes down a fallback chain (see `DUTY_CHAIN`).
- **Traitor:** one minister is secretly in a rival's pay. They can take bribes, forge reports, embezzle relief and bribe a gatekeeper.
- **Sunset:** the Raja issues an edict. Once per game they can run the **Loyalty Test** (a false bribe from a "foreign envoy"), and at the final sunset they may name the traitor.
- **Kautilya's Lens:** the end-game replay reveals every hidden move. Each betrayal is labelled with its tactic and an Arthashastra passage (adapted from Shamasastry's 1915 public-domain translation).
- **Itihas Codex:** successful tasks unlock 18 history cards (Ashoka's edicts, Kallanai, Sher Shah Suri, Harappan weights, …), kept in `localStorage`.

### Content & assets

Everything is data under `public/assets/`:

```
backgrounds/  durbar-{night,morning,midday,afternoon,sunset}.svg
props/        crown-chola.svg, turban-*.svg, helmet-senapati.svg, border-miniature.svg
audio/        (optional) recorded ragas — see audio/README.md
content/      tasks.json (15 tasks), codex.json, kautilya.json, roles.json, ragas.json
manifest.json backgrounds/props per phase and role
```

The SVG art is generated by `node scripts/generate-assets.mjs`. To use painted `.jpg`/`.png` files instead, change the
paths in `manifest.json`. `validateContent` checks task/codex cross-references at load time and in `npm test`.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `/api/token` returns **503** | The dev server can't see `LIVEKIT_*`. Put them in `.env` or `.env.local` at the project root and restart `npm run dev`. |
| "The camera needs HTTPS or localhost" | You opened a `http://192.168…` address. Use `http://localhost:…` on the same PC, or `npm run dev:https` for other devices. |
| "You joined this court again from another tab or device" | LiveKit allows one connection per identity. Each tab gets its own identity (a duplicated tab picks a new one); click *Rejoin the court*. |
| A player's video is stuck on "Camera arriving…" | Their browser hasn't published yet. Check their console for `publishing track`, and make sure WebRTC (UDP) isn't blocked by a firewall or VPN. |

## Known limitations

- Game secrets are hidden by the UI and by per-player views, but the host (the Raja's browser) holds the full state.
  Task JSON, including riddle answers, is also public to anyone who inspects network traffic. It's a party game played
  on the honour system.
- If the Raja leaves mid-game, the court pauses until they rejoin from the same tab. Their state resumes from
  `localStorage`.
- Background tabs throttle timers, so a player's published video slows down while their tab is hidden.
