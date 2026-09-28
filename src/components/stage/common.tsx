import { useEffect, useState, type ReactNode } from 'react';
import { useContent } from '../../content/loadContent';
import type { RoleId, StatDelta, TaskDef } from '../../content/types';
import type { ClientView, PublicTask } from '../../game/types';
import type { Court } from '../../game/useCourt';

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({ court, deadline, total }: { court: Court; deadline?: number; total?: number }) {
  useNow();
  if (!deadline) return null;
  const left = Math.max(0, deadline - court.serverNow());
  const secs = Math.ceil(left / 1000);
  const frac = total ? Math.min(1, left / total) : 1;
  const urgent = secs <= 10;
  return (
    <div className="flex min-w-28 items-center gap-2" role="timer" aria-label={`${secs} seconds left`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/20">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${urgent ? 'bg-sindoor' : 'bg-peacock'}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <span className={`w-12 text-right font-display tabular-nums ${urgent ? 'text-sindoor' : ''}`}>
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

/** Remembers the full duration of the current deadline for the progress bar. */
export function useDeadlineTotal(court: Court, deadline?: number): number | undefined {
  const [state, setState] = useState<{ deadline?: number; total?: number }>({});
  useEffect(() => {
    if (deadline && deadline !== state.deadline) setState({ deadline, total: deadline - court.serverNow() });
  }, [deadline, state.deadline, court]);
  return state.total;
}

/** What this player should do right now: act, or wait on someone else. */
export interface Move {
  act: boolean;
  text: ReactNode;
}

export function StageFrame({
  kicker,
  title,
  court,
  deadline,
  move,
  children,
}: {
  kicker: string;
  title: string;
  court: Court;
  deadline?: number;
  move?: Move;
  children: ReactNode;
}) {
  const total = useDeadlineTotal(court, deadline);
  return (
    <section className="folio flex h-full min-h-0 flex-col" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-gold/60 px-4 pb-2 pt-3">
        <div>
          <p className="label text-sindoor">{kicker}</p>
          <h2 className="text-2xl leading-tight">{title}</h2>
        </div>
        <Countdown court={court} deadline={deadline} total={total} />
      </header>
      {move && <YourMove move={move} />}
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
    </section>
  );
}

/** Pinned under the stage header so the next step is never scrolled away. */
function YourMove({ move }: { move: Move }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 px-4 py-2.5 leading-snug ${
        move.act ? 'bg-sindoor text-parchment' : 'border-b border-gold/40 bg-parchment-deep text-ink-soft'
      }`}
    >
      <span
        className={`mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 font-display text-[0.7rem] uppercase tracking-[0.12em] ${
          move.act ? 'move-pulse bg-gold-light text-ink' : 'bg-ink/10 text-ink-soft'
        }`}
      >
        {move.act ? 'Your move' : 'Waiting'}
      </span>
      <p className={move.act ? 'font-semibold' : 'italic'}>{move.text}</p>
    </div>
  );
}

/** The move once a matter is settled: only the Raja calls the next one. */
export function proceedMove(court: Court): Move {
  return court.myRole === 'raja'
    ? { act: true, text: 'Read the outcome, then call the next matter.' }
    : { act: false, text: 'The Raja will call the next matter shortly.' };
}

export function Effects({ effects }: { effects?: StatDelta }) {
  if (!effects) return null;
  const entries = Object.entries(effects).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className={`rounded px-1.5 text-sm font-semibold ${v! > 0 ? 'bg-peacock/15 text-peacock' : 'bg-sindoor/15 text-sindoor'}`}>
          {v! > 0 ? '+' : ''}
          {v} {k}
        </span>
      ))}
    </span>
  );
}

export function Verdict({ success, children }: { success?: boolean; children: ReactNode }) {
  return (
    <div
      className={`rise rounded-md border-2 p-3 ${success ? 'border-peacock bg-peacock/10' : 'border-sindoor bg-sindoor/10'}`}
      role="status"
    >
      <p className={`font-display text-lg ${success ? 'text-peacock' : 'text-sindoor'}`}>{success ? 'Wisely done' : 'The realm suffers'}</p>
      {children}
    </div>
  );
}

export function ProceedBar({ court }: { court: Court }) {
  if (court.myRole !== 'raja') return null;
  return (
    <button className="btn btn-royal self-start" onClick={() => court.act({ type: 'advance' })}>
      Call the next matter →
    </button>
  );
}

export function SecretBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border-2 border-dashed border-lapis bg-lapis/10 p-3">
      <p className="label mb-1 text-lapis">🔒 {title}</p>
      {children}
    </div>
  );
}

export function useTaskDef<K extends TaskDef['kind']>(task: PublicTask, kind: K): Extract<TaskDef, { kind: K }> {
  const content = useContent();
  const def = content.tasks.tasks.find((t) => t.id === task.taskId);
  if (!def || def.kind !== kind) throw new Error(`Expected ${kind} task`);
  return def as Extract<TaskDef, { kind: K }>;
}

export function playerName(view: ClientView, identity: string | undefined): string {
  return view.players.find((p) => p.identity === identity)?.name ?? 'Someone';
}

export function roleName(view: ClientView, identity: string | undefined, titles: Record<RoleId, string>): string {
  const p = view.players.find((x) => x.identity === identity);
  return p ? `${p.name} (${titles[p.role]})` : 'Someone';
}

export function useRoleTitles(): Record<RoleId, string> {
  const { roles } = useContent();
  return Object.fromEntries(roles.map((r) => [r.id, r.title])) as Record<RoleId, string>;
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: 'The court assembles',
  morning: 'Morning · Petitions',
  midday: 'Midday · Royal Challenge',
  afternoon: 'Afternoon · Team Mission',
  sunset: 'Sunset · Judgment & Loyalty',
  debrief: "Kautilya's Lens",
};
