import { useState } from 'react';
import { StreamVideo, useARState, useMedia } from './media';

/** Local AR preview: what the rest of the court will see (mirrored for you). */
export function PreviewMirror({ showMic }: { showMic: boolean }) {
  const { ar, mic, setMic, raga } = useMedia();
  const state = useARState(ar);
  const [bg, setBg] = useState(ar.backgroundEnabled);
  const [prop, setProp] = useState(ar.propEnabled);
  const [necklace, setNecklace] = useState(ar.necklaceEnabled);
  const [muted, setMuted] = useState(false);

  const statusText =
    state.status === 'running'
      ? state.segmentation
        ? `Painting you into the court · ${state.fps} fps`
        : `Camera on · loading court magic… ${state.fps} fps`
      : state.status === 'starting'
        ? 'Waking the camera…'
        : state.status === 'no-camera'
          ? 'No camera — the court will see your painted emblem.'
          : '';

  return (
    <section className="flex flex-col gap-3" aria-label="Preview mirror">
      <div className="seat-frame arch mx-auto w-full max-w-md">
        <StreamVideo stream={ar.getStream()} mirror={state.status === 'running'} className="arch block aspect-[4/3] w-full bg-stone object-cover" />
      </div>
      <p className="text-center text-sm text-parchment/80" aria-live="polite">
        {statusText}
      </p>
      {state.messages.map((m) => (
        <p key={m} className="rounded bg-sindoor-deep/60 px-3 py-1 text-sm text-parchment">
          {m}
        </p>
      ))}
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-labelledby="attire-label">
        <span id="attire-label" className="w-full text-center text-xs uppercase tracking-wider text-parchment/60 sm:w-auto">
          Attire
        </span>
        <Toggle
          on={bg}
          label="Background"
          onChange={(v) => {
            ar.backgroundEnabled = v;
            setBg(v);
          }}
          disabled={!state.segmentation}
        />
        <Toggle
          on={prop}
          label="Headwear"
          onChange={(v) => {
            ar.propEnabled = v;
            setProp(v);
          }}
        />
        <Toggle
          on={necklace}
          label="Necklace"
          onChange={(v) => {
            ar.necklaceEnabled = v;
            setNecklace(v);
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-labelledby="sound-label">
        <span id="sound-label" className="w-full text-center text-xs uppercase tracking-wider text-parchment/60 sm:w-auto">
          Sound
        </span>
        {showMic && <Toggle on={mic} label="Microphone" onChange={setMic} />}
        <Toggle
          on={!muted}
          label="Raga"
          onChange={(v) => {
            raga.setMuted(!v);
            setMuted(!v);
          }}
        />
      </div>
    </section>
  );
}

export function Toggle({
  on,
  label,
  onChange,
  disabled,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn px-3 py-1 text-sm ${on ? 'btn-gold' : 'btn-ghost text-parchment/80'}`}
      aria-pressed={on}
      onClick={() => onChange(!on)}
      disabled={disabled}
    >
      <span aria-hidden>{on ? '●' : '○'}</span> {label}
    </button>
  );
}
