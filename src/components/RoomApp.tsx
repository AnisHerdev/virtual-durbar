import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ARPipeline } from '../ar/ARPipeline';
import { ragaForPhase, RagaEngine } from '../audio/RagaEngine';
import { roleDef, useContent } from '../content/loadContent';
import { useCourt } from '../game/useCourt';
import { addToCodex, claimTabIdentity, nameFor, navigate, pinName, saveName } from '../lib/session';
import { LiveKitTransport } from '../net/livekitTransport';
import { RehearsalTransport } from '../net/rehearsalTransport';
import type { Transport, TransportKind } from '../net/transport';
import { Courtroom } from './Courtroom';
import { Lobby } from './Lobby';
import { MediaContext, useMedia, type Media } from './media';

export function RoomApp({ room, mode }: { room: string; mode: TransportKind }) {
  const [name, setName] = useState(() => nameFor(room));
  if (!name) return <NameGate room={room} onName={setName} />;
  return <Connected room={room} mode={mode} name={name} />;
}

function NameGate({ room, onName }: { room: string; onName: (n: string) => void }) {
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim();
    if (!n) return;
    saveName(n);
    pinName(room, n);
    onName(n);
  };
  return (
    <main className="grid min-h-full place-items-center p-4">
      <form onSubmit={submit} className="folio flex w-full max-w-md flex-col gap-3 p-6">
        <h1 className="text-2xl text-sindoor">You are summoned to {room}</h1>
        <label className="flex flex-col gap-1">
          <span className="label">Your name at court</span>
          <input className="field" autoFocus value={value} onChange={(e) => setValue(e.target.value.slice(0, 32))} />
        </label>
        <button className="btn btn-royal" disabled={!value.trim()}>
          Continue
        </button>
      </form>
    </main>
  );
}

function Connected({ room, mode, name }: { room: string; mode: TransportKind; name: string }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [error, setError] = useState<{ title: string; message: string; config?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ar] = useState(() => new ARPipeline());
  const [raga] = useState(() => new RagaEngine());
  const [mic, setMic] = useState(mode === 'livekit');

  useEffect(() => {
    let live = true;
    void claimTabIdentity(room).then((id) => live && setIdentity(id));
    return () => {
      live = false;
    };
  }, [room]);

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    let t: Transport | null = null;
    let offDisconnect: (() => void) | undefined;
    setError(null);
    // Deferred so React StrictMode's throwaway first mount never connects:
    // two LiveKit connections with one identity would kick each other out.
    const timer = setTimeout(async () => {
      try {
        t = mode === 'rehearsal' ? new RehearsalTransport(room, identity, name) : await LiveKitTransport.connect(room, identity, name);
        if (cancelled) return t.disconnect();
        if (t instanceof LiveKitTransport) {
          offDisconnect = t.onDisconnected((message) => {
            setTransport(null);
            setError({ title: 'You have left the court', message });
          });
        }
        setTransport(t);
      } catch (e) {
        if (!cancelled) {
          const message = (e as Error).message || String(e);
          setError({ title: 'The palace gates are shut', message, config: /not configured|token/i.test(message) });
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      offDisconnect?.();
      t?.disconnect();
      setTransport(null);
    };
  }, [room, mode, identity, name, attempt]);

  useEffect(() => {
    void ar.start();
    return () => ar.stop();
  }, [ar]);

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlock = () => void raga.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    return () => {
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
      raga.stopAll();
    };
  }, [raga]);

  useEffect(() => {
    if (transport) void transport.setMicrophone(mic).catch(() => setMic(false));
  }, [transport, mic]);

  const media: Media = useMemo(() => ({ ar, raga, mic, setMic }), [ar, raga, mic]);

  if (error) {
    return (
      <main className="grid min-h-full place-items-center p-4">
        <div className="folio flex max-w-lg flex-col gap-3 p-6">
          <h1 className="text-2xl text-sindoor">{error.title}</h1>
          <pre className="whitespace-pre-wrap rounded bg-parchment-deep p-3 text-sm">{error.message}</pre>
          {error.config && (
            <p className="text-sm text-ink-soft">
              The server needs <code>LIVEKIT_API_KEY</code>, <code>LIVEKIT_API_SECRET</code> and <code>LIVEKIT_URL</code>{' '}
              (see <code>.env.example</code>). After editing <code>.env.local</code>, restart <code>npm run dev</code>. You
              can still play in Rehearsal mode across tabs of this browser.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-royal" onClick={() => setAttempt((a) => a + 1)}>
              {error.config ? 'Try again' : 'Rejoin the court'}
            </button>
            <button className="btn btn-gold" onClick={() => navigate(room, 'rehearsal')}>
              Rehearse offline
            </button>
            <button className="btn btn-ghost" onClick={() => navigate(null)}>
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (!transport) {
    return <div className="grid min-h-full place-items-center font-display text-2xl text-gold">Opening the palace gates…</div>;
  }

  const shell = (
    <MediaContext.Provider value={media}>
      <CourtShell transport={transport} room={room} name={name} />
    </MediaContext.Provider>
  );
  return transport instanceof LiveKitTransport ? (
    <RoomContext.Provider value={transport.room}>
      <RoomAudioRenderer />
      {shell}
    </RoomContext.Provider>
  ) : (
    shell
  );
}

function CourtShell({ transport, room, name }: { transport: Transport; room: string; name: string }) {
  const content = useContent();
  const court = useCourt(transport, content, room);
  const { ar, raga } = useMedia();
  const [entered, setEntered] = useState(false);
  const phase = court.view?.phase ?? court.summary?.phase ?? 'lobby';

  // Headwear and painted placeholder follow the seat you hold.
  useEffect(() => {
    const def = court.myRole ? roleDef(content, court.myRole) : null;
    void ar.setProp(def ? content.manifest.props.find((p) => p.id === def.headwear) ?? null : null);
    ar.setPlaceholder({ emblem: def?.emblem ?? '☀', name, color: def?.color ?? '#b8860b' });
  }, [ar, content, court.myRole, name]);

  // Background and raga follow the court's time of day.
  useEffect(() => {
    const bg = content.manifest.backgrounds.find((b) => b.phases.includes(phase)) ?? content.manifest.backgrounds[0];
    void ar.setBackground(bg.file);
    void raga.play(ragaForPhase(content.ragas, phase));
  }, [ar, raga, content, phase]);

  useEffect(() => {
    void transport.publishCamera(ar.getStream()).catch((e) => console.warn('[court] publish failed', e));
  }, [transport, ar]);

  const unlocked = court.view?.codexUnlocked;
  useEffect(() => {
    if (unlocked?.length) addToCodex(unlocked);
  }, [unlocked]);

  const seatedInGame = !!court.view?.players.some((p) => p.identity === court.selfIdentity) && court.view.status !== 'lobby';
  if (court.myRole && (entered || seatedInGame)) return <Courtroom court={court} onLeaveSeat={() => setEntered(false)} />;
  return <Lobby court={court} onEnter={() => setEntered(true)} />;
}

