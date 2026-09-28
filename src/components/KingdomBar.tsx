import { useState } from 'react';
import { ragaForPhase } from '../audio/RagaEngine';
import { useContent } from '../content/loadContent';
import type { StatKey } from '../content/types';
import type { Court } from '../game/useCourt';
import { navigate } from '../lib/session';
import { CodexDialog } from './Codex';
import { useMedia } from './media';

const STATS: { key: StatKey; label: string; sanskrit: string; bar?: boolean }[] = [
  { key: 'gold', label: 'Treasury', sanskrit: 'Kosha' },
  { key: 'grain', label: 'Grain', sanskrit: 'Anna' },
  { key: 'troops', label: 'Troops', sanskrit: 'Sena' },
  { key: 'workers', label: 'Workers', sanskrit: 'Karmakara' },
  { key: 'morale', label: 'People', sanskrit: 'Praja', bar: true },
  { key: 'fort', label: 'Fort', sanskrit: 'Durga', bar: true },
];

// Sun (or moon) position along the sky arc for each part of the day.
const SUN: Record<string, { x: number; y: number; night?: boolean }> = {
  lobby: { x: 50, y: 12, night: true },
  morning: { x: 14, y: 24 },
  midday: { x: 50, y: 6 },
  afternoon: { x: 80, y: 16 },
  sunset: { x: 92, y: 27 },
  debrief: { x: 50, y: 12, night: true },
};

export function KingdomBar({ court }: { court: Court }) {
  const content = useContent();
  const { raga, mic, setMic } = useMedia();
  const [muted, setMuted] = useState(false);
  const [codex, setCodex] = useState(false);
  const view = court.view;
  const phase = view?.phase ?? 'lobby';
  const sun = SUN[phase] ?? SUN.lobby;
  const currentRaga = ragaForPhase(content.ragas, phase);
  const day = content.tasks.days.find((d) => d.day === view?.day);

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-gold/70 bg-stone/90 px-3 py-2 shadow-lg">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 32" className="h-9 w-24 shrink-0" aria-hidden>
          <path d="M4,30 Q50,-8 96,30" fill="none" stroke="#c9a227" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="0" y1="30" x2="100" y2="30" stroke="#c9a227" strokeWidth="1.5" />
          {sun.night ? (
            <path d={`M${sun.x - 5},${sun.y} a6,6 0 1,0 8,-6 a5,5 0 1,1 -8,6`} fill="#f3ecd0" />
          ) : (
            <circle cx={sun.x} cy={sun.y} r="5" fill={phase === 'sunset' ? '#f04b2a' : '#f6c35b'} />
          )}
        </svg>
        <div className="leading-tight">
          <p className="font-display text-lg text-gold-light">
            {view && view.status !== 'lobby' && day ? `Day ${view.day} of 3 · ${day.theme}` : 'Virtual Durbar'}
          </p>
          <p className="text-sm text-parchment/70">
            Room <span className="font-mono">{court.roomId}</span>
          </p>
        </div>
      </div>

      {view && (
        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {STATS.map((s) => (
            <div key={s.key} className="flex flex-col gap-0.5 leading-none" title={`${s.label} · ${s.sanskrit}`}>
              <dt className="text-[0.72rem] uppercase tracking-wider text-parchment/70">{s.label}</dt>
              <dd className="font-display text-lg tabular-nums text-parchment">
                {s.bar ? (
                  <span className="flex items-center gap-1">
                    <span className="block h-2 w-14 overflow-hidden rounded-full bg-parchment/15">
                      <span
                        className={`block h-full ${view.stats[s.key] < 35 ? 'bg-sindoor' : 'bg-peacock'}`}
                        style={{ width: `${view.stats[s.key]}%` }}
                      />
                    </span>
                    {view.stats[s.key]}
                  </span>
                ) : (
                  view.stats[s.key].toLocaleString()
                )}
              </dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5 border-l border-gold/40 pl-3 leading-none" title="Your own gold and grain, separate from the realm's">
            <dt className="text-[0.72rem] uppercase tracking-wider text-gold-light/85">Your purse</dt>
            <dd className="font-display text-lg tabular-nums text-gold-light">
              {view.me.purse.gold}g · {view.me.purse.grain} grain
            </dd>
          </div>
        </dl>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          className="btn btn-ghost px-2 py-1 text-sm text-parchment"
          aria-pressed={!muted}
          onClick={() => {
            raga.setMuted(!muted);
            setMuted(!muted);
          }}
          title={`${currentRaga.prahar}. ${currentRaga.mood}.`}
        >
          {muted ? '♪̸' : '♪'} Raga {currentRaga.name}
        </button>
        {court.transport.kind === 'livekit' && (
          <button className="btn btn-ghost px-2 py-1 text-sm text-parchment" aria-pressed={mic} onClick={() => setMic(!mic)}>
            {mic ? 'Mic on' : 'Mic off'}
          </button>
        )}
        <button className="btn btn-ghost px-2 py-1 text-sm text-parchment" onClick={() => setCodex(true)}>
          Codex
        </button>
        <button className="btn btn-ghost px-2 py-1 text-sm text-parchment" onClick={() => navigate(null)}>
          Leave
        </button>
      </div>
      {codex && <CodexDialog onClose={() => setCodex(false)} />}
    </header>
  );
}
