import { useEffect, useState } from 'react';
import { SABOTAGE_TROOPS } from '../../game/engine';
import type { FortRun, PublicTask } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { Effects, ProceedBar, SecretBox, StageFrame, Verdict, playerName, useTaskDef } from './common';

type FortView = Extract<PublicTask, Pick<FortRun, 'kind'>>;

// Gate positions around the fort diagram (N, E, S, W).
const GATE_POS = [
  { x: 50, y: 8 },
  { x: 92, y: 50 },
  { x: 50, y: 92 },
  { x: 8, y: 50 },
];

export function FortStage({ court, task }: { court: Court; task: FortView }) {
  const view = court.view!;
  const def = useTaskDef(task, 'fort');
  const duties = view.me.task.duties;
  const enemies = view.me.task.enemies;
  const planning = task.stage === 'plan';
  const isSenapati = duties.includes('senapati');
  const troops = def.troopsPerWave + task.reinforcements;
  const [alloc, setAlloc] = useState(task.allocation);
  const [estimates, setEstimates] = useState<number[]>(enemies ?? def.gates.map(() => 0));
  const [sabGate, setSabGate] = useState(0);
  useEffect(() => {
    setAlloc(task.allocation);
  }, [task.allocation, task.wave]);
  const enemiesKey = enemies?.join(',') ?? '';
  useEffect(() => {
    if (enemiesKey) setEstimates(enemiesKey.split(',').map(Number));
  }, [task.wave, enemiesKey]);
  const used = alloc.reduce((a, b) => a + b, 0);
  const last = task.results[task.results.length - 1];
  const shownDefended = task.stage === 'wave-result' && last ? last.defended : task.allocation;

  const bump = (i: number, d: number) => {
    const next = [...alloc];
    next[i] = Math.max(0, next[i] + d);
    if (next.reduce((a, b) => a + b, 0) > troops) return;
    setAlloc(next);
    court.act({ type: 'fort/allocate', allocation: next });
  };

  return (
    <StageFrame
      kicker={`Team Mission · Wave ${Math.min(task.wave + 1, def.waves.length)} of ${def.waves.length}`}
      title={def.title}
      court={court}
      deadline={task.deadline}
    >
      <p className="leading-snug">{def.summary}</p>

      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-72" aria-label="Fort map">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <rect x="18" y="18" width="64" height="64" fill="#e6cf9f" stroke="#7a4b0c" strokeWidth="2.5" />
            <rect x="30" y="30" width="40" height="40" fill="#d9bb83" stroke="#7a4b0c" strokeWidth="1.5" />
            {[18, 82].flatMap((x) => [18, 82].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="5" fill="#b3202a" stroke="#7a4b0c" />))}
            <path d="M50,38 l-7,10 h14 Z M44,48 h12 v12 h-12 Z" fill="#b3202a" />
          </svg>
          {def.gates.map((g, i) => {
            const pos = GATE_POS[i];
            const enemy = task.stage === 'wave-result' ? last?.enemies[i] : enemies?.[i];
            const breach = task.stage === 'wave-result' && last ? Math.max(0, last.enemies[i] - last.defended[i]) : 0;
            return (
              <div
                key={g}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <span className="rounded bg-ink px-1.5 text-xs text-parchment">{g}</span>
                <span className="font-display text-lg leading-none text-peacock" title="Defenders">
                  ⛨{shownDefended[i]}
                </span>
                {enemy !== undefined && (
                  <span className="font-display text-lg leading-none text-sindoor" title="Enemy companies">
                    ⚔{enemy}
                  </span>
                )}
                {breach > 0 && <span className="rounded bg-sindoor px-1 text-xs text-parchment">breach {breach}</span>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Fort strength</span>
              <span>{task.fortHp}/100</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-ink/15">
              <div className={`h-full ${task.fortHp > 40 ? 'bg-peacock' : 'bg-sindoor'}`} style={{ width: `${task.fortHp}%` }} />
            </div>
          </div>
          <p className="text-sm">
            Troops this wave: <b>{troops}</b>
            {task.reinforcements > 0 && ` (incl. ${task.reinforcements} mercenaries)`}
            {task.parleyed && ' · Envoys received: the largest host is weakened'}
          </p>
          {enemies ? (
            <p className="text-sm font-semibold text-lapis">Your spies see the enemy (red). No one else can.</p>
          ) : (
            planning && <p className="text-sm italic">You cannot see the enemy. Trust the Spy Chief — or don’t.</p>
          )}
        </div>
      </div>

      {planning && isSenapati && (
        <div className="rounded-md border-2 border-peacock/60 p-3">
          <p className="label mb-2 text-peacock">
            Your orders, Senapati · {used}/{troops} posted
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {def.gates.map((g, i) => (
              <div key={g} className="flex items-center justify-between gap-1 rounded bg-parchment-deep px-2 py-1">
                <span className="text-sm font-semibold">{g}</span>
                <span className="flex items-center gap-1">
                  <button className="btn btn-ghost size-7 p-0" onClick={() => bump(i, -1)} aria-label={`Fewer at ${g}`}>
                    −
                  </button>
                  <span className="w-5 text-center font-display tabular-nums">{alloc[i]}</span>
                  <button className="btn btn-ghost size-7 p-0" onClick={() => bump(i, 1)} aria-label={`More at ${g}`} disabled={used >= troops}>
                    +
                  </button>
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn-royal mt-2" onClick={() => court.act({ type: 'fort/hold' })}>
            Sound the war drums (resolve wave now)
          </button>
        </div>
      )}

      {planning && duties.includes('spy') && (
        <div className="rounded-md border-2 border-lapis/60 p-3">
          <p className="label mb-2 text-lapis">Send an official dispatch to the court</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {def.gates.map((g, i) => (
              <label key={g} className="flex items-center justify-between gap-1 rounded bg-parchment-deep px-2 py-1 text-sm font-semibold">
                {g}
                <input
                  type="number"
                  min={0}
                  max={20}
                  className="field w-14 px-1 py-0.5"
                  value={estimates[i] ?? 0}
                  onChange={(e) => {
                    const next = [...estimates];
                    next[i] = Number(e.target.value);
                    setEstimates(next);
                  }}
                />
              </label>
            ))}
          </div>
          <button className="btn btn-gold mt-2" onClick={() => court.act({ type: 'fort/dispatch', estimates })}>
            Send dispatch
          </button>
        </div>
      )}

      {planning && task.dispatches.length > 0 && (
        <div>
          <p className="label">Dispatches this wave</p>
          {task.dispatches.map((d) => (
            <p key={d.id} className="rounded bg-parchment-deep px-2 py-1 text-sm">
              <b>{playerName(view, d.by)}</b>: {def.gates.map((g, i) => `${g} ${d.estimates[i]}`).join(' · ')}
            </p>
          ))}
        </div>
      )}

      {planning && (duties.includes('parley') || duties.includes('reinforce')) && (
        <div className="flex flex-wrap gap-2">
          {duties.includes('parley') && (
            <button className="btn btn-ghost" disabled={task.parleyed} onClick={() => court.act({ type: 'fort/parley' })}>
              Parley with the envoys (−3 to the largest host)
            </button>
          )}
          {duties.includes('reinforce') && (
            <button
              className="btn btn-ghost"
              disabled={task.reinforcements >= def.maxReinforcements || view.stats.gold < def.reinforcementCost}
              onClick={() => court.act({ type: 'fort/reinforce' })}
            >
              Hire mercenaries ({def.reinforcementCost} gold · {def.maxReinforcements - task.reinforcements} left)
            </button>
          )}
        </div>
      )}

      {planning && view.me.task.canSabotage && (
        <SecretBox title="A gatekeeper in your pay">
          <p>Once in this siege, have a gatekeeper quietly pull {SABOTAGE_TROOPS} defenders from a gate as this wave strikes.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select className="field w-auto" value={sabGate} onChange={(e) => setSabGate(Number(e.target.value))} aria-label="Gate to weaken">
              {def.gates.map((g, i) => (
                <option key={g} value={i}>
                  {g} gate
                </option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={() => court.act({ type: 'fort/sabotage', gate: sabGate })}>
              Pay the gatekeeper
            </button>
          </div>
        </SecretBox>
      )}

      {task.stage === 'wave-result' && last && (
        <div className="rise rounded-md border-2 border-gold bg-gold/10 p-3">
          <p className="font-display text-lg">
            Wave {task.results.length}: {last.breaches ? `${last.breaches} companies broke through — ${last.damage} damage` : 'every gate held!'}
          </p>
          {(duties.includes('senapati') || court.myRole === 'raja') && (
            <button className="btn btn-royal mt-2" onClick={() => court.act({ type: 'fort/hold' })}>
              {task.results.length >= def.waves.length ? 'See the outcome' : 'Prepare the next wave'}
            </button>
          )}
        </div>
      )}

      {task.stage === 'resolved' && (
        <>
          <Verdict success={task.success}>
            <p>{task.success ? def.success.outcome : def.failure.outcome}</p>
            <Effects effects={task.success ? def.success.effects : def.failure.effects} />
          </Verdict>
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
