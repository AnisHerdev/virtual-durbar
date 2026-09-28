import { useState, type FormEvent } from 'react';
import { useContent } from '../content/loadContent';
import { loadCodex, navigate, normaliseRoom, pinName, ROOM_PATTERN, saveName, savedName, suggestRoom } from '../lib/session';
import type { TransportKind } from '../net/transport';
import { CodexDialog } from './Codex';

export function Landing() {
  const content = useContent();
  const [room, setRoom] = useState(suggestRoom);
  const [name, setName] = useState(savedName);
  const [mode, setMode] = useState<TransportKind>('livekit');
  const [codexOpen, setCodexOpen] = useState(false);
  const clean = normaliseRoom(room);
  const valid = ROOM_PATTERN.test(clean) && name.trim().length > 0;
  const collected = loadCodex().length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    saveName(name.trim());
    pinName(clean, name.trim());
    navigate(clean, mode);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <p className="font-deva text-xl text-gold-light">राजसभा</p>
        <h1 className="text-5xl text-parchment sm:text-6xl">Virtual Durbar</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-parchment/80">
          Take your seat in a royal court. Rule a realm for three days as Raja and ministers — judge petitions, solve
          Birbal's riddles, survive famine and siege — and learn to see through betrayal with Kautilya's Lens.
        </p>
      </header>

      <div className="grid w-full gap-6 md:grid-cols-[1.1fr_1fr]">
        <form onSubmit={submit} className="folio flex flex-col gap-4 p-6">
          <h2 className="text-2xl text-sindoor">Enter the court</h2>
          <label className="flex flex-col gap-1">
            <span className="label">Room ID</span>
            <input
              className="field font-mono"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="magadha-404"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="room-help"
            />
            <span id="room-help" className="text-sm text-ink-soft">
              {clean && clean !== room ? (
                <>
                  Will join <b className="font-mono">{clean}</b>.{' '}
                </>
              ) : null}
              Share this ID with your court. No passwords.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Your name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 32))}
              placeholder="Chandragupta"
              autoComplete="nickname"
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-1">Connection</legend>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="mode" checked={mode === 'livekit'} onChange={() => setMode('livekit')} className="mt-1.5 accent-sindoor" />
              <span>
                <b>Online court</b> — video and voice through LiveKit.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="mode" checked={mode === 'rehearsal'} onChange={() => setMode('rehearsal')} className="mt-1.5 accent-sindoor" />
              <span>
                <b>Rehearsal</b> — no server needed. Open several tabs of this browser to play every seat yourself.
              </span>
            </label>
          </fieldset>
          <button type="submit" className="btn btn-royal mt-1 text-lg" disabled={!valid}>
            Approach the throne
          </button>
        </form>

        <section className="folio-plain flex flex-col gap-3 rounded-md p-6">
          <h2 className="text-2xl text-lapis">The seven seats</h2>
          <ul className="grid gap-2">
            {content.roles.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3">
                <span aria-hidden className="w-6 text-center text-xl" style={{ color: r.color }}>
                  {r.emblem}
                </span>
                <span>
                  <b>{r.title}</b> <span className="font-deva text-ink-soft">{r.sanskrit}</span>
                  <span className="block text-sm text-ink-soft">{r.epithet}</span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost mt-auto text-lapis" onClick={() => setCodexOpen(true)}>
            Itihas Codex · {collected}/{content.codex.length} tales collected
          </button>
        </section>
      </div>

      <p className="max-w-2xl text-center text-sm text-parchment/60">
        All gold, grain and troops are imaginary. Your camera is processed on your own device; only the painted
        court video is sent to other players.
      </p>
      {codexOpen && <CodexDialog onClose={() => setCodexOpen(false)} />}
    </main>
  );
}
