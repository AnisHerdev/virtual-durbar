import { useEffect, useRef } from 'react';
import { useContent } from '../content/loadContent';
import type { TacticDef, TacticId } from '../content/types';
import type { Court } from '../game/useCourt';
import { CodexGrid } from './Codex';
import { playerName, useRoleTitles } from './stage/common';

const PHASE_SHORT: Record<string, string> = {
  lobby: 'Assembly',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  sunset: 'Sunset',
  debrief: 'End',
};

/** Kautilya's Lens: the replay that exposes every hidden move. */
export function Debrief({ court }: { court: Court }) {
  const content = useContent();
  const titles = useRoleTitles();
  const view = court.view!;
  const d = view.debrief!;
  const ref = useRef<HTMLDialogElement>(null);
  const tactics = new Map<TacticId, TacticDef>(content.tactics.map((t) => [t.id, t]));
  const traitor = view.players.find((p) => p.identity === d.traitor);
  const betrayals = d.log.filter((e) => e.tactic && tactics.get(e.tactic)?.betrayal);

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      className="m-0 h-full max-h-none w-full max-w-none bg-stone-deep/95 p-0 text-parchment backdrop:bg-black/80"
      aria-labelledby="lens-title"
    >
      <div className="scroll-thin mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto px-4 py-8">
        <header className="text-center">
          <p className="font-deva text-xl text-gold-light">कौटिल्य दृष्टि</p>
          <h1 id="lens-title" className="text-5xl">
            Kautilya’s Lens
          </h1>
          <p className="mt-2 text-lg text-parchment/80">Three days of rule, seen as the Arthashastra would see them.</p>
        </header>

        <section className="folio grid gap-4 p-5 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="label text-sindoor">The realm’s fate</p>
            <h2 className="text-4xl text-ink">{d.result.title}</h2>
            <p className="text-lg">Prosperity {d.result.prosperity}</p>
            <p className="mt-2 text-lg font-semibold">{d.result.verdict}</p>
            {traitor ? (
              <p className="mt-1">
                The traitor was <b>{traitor.name}</b>, the {titles[traitor.role]}. {betrayals.length} betrayal
                {betrayals.length === 1 ? '' : 's'} recorded.
              </p>
            ) : (
              <p className="mt-1">Every minister was loyal. Suspicion itself can be a weapon — did it divide your court?</p>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {Object.entries(view.stats).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="capitalize text-ink-soft">{k}</dt>
                <dd className="text-right font-display tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="folio-plain rounded-md p-4">
            <h3 className="text-xl text-lapis">Purses at the end</h3>
            <ul>
              {view.players.map((p) => (
                <li key={p.identity} className="flex justify-between">
                  <span>
                    {p.name} <span className="text-ink-soft">· {titles[p.role]}</span>
                  </span>
                  <span className="tabular-nums">{d.purses[p.identity]?.gold ?? 0} gold</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="folio-plain rounded-md p-4">
            <h3 className="text-xl text-lapis">Famine pledges, unsealed</h3>
            {d.pledges.length ? (
              <ul>
                {d.pledges.map((p) => (
                  <li key={p.identity} className="flex justify-between">
                    <span>{playerName(view, p.identity)}</span>
                    <span className="tabular-nums">
                      {p.gold} gold · {p.grain} grain
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="italic text-ink-soft">No one pledged to the relief carts.</p>
            )}
          </div>
        </section>

        <section aria-label="Replay timeline">
          <h2 className="rule-ornament mb-3 text-2xl">
            <span>The replay</span>
          </h2>
          <ol className="relative space-y-3 border-l-2 border-gold/60 pl-5">
            {d.log.map((e) => {
              const tactic = e.tactic ? tactics.get(e.tactic) : undefined;
              if (!e.public && !e.hidden) return null;
              return (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[27px] top-1.5 size-3 rounded-full border-2 border-gold ${tactic ? (tactic.betrayal ? 'bg-sindoor' : 'bg-peacock') : 'bg-stone'}`}
                  />
                  <p className="text-xs uppercase tracking-wider text-gold-light/80">
                    {e.day ? `Day ${e.day} · ${PHASE_SHORT[e.phase] ?? e.phase}` : 'Assembly'}
                  </p>
                  <div className={`grid gap-2 ${tactic ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
                    <div>
                      {e.public && <p className="leading-snug text-parchment/90">{e.public}</p>}
                      {e.hidden && (
                        <p className="mt-1 rounded border border-lapis bg-lapis/40 px-2 py-1 leading-snug">
                          <span className="label mr-1 text-gold-light">Hidden truth</span>
                          {e.hidden}
                        </p>
                      )}
                    </div>
                    {tactic && (
                      <aside
                        className={`folio-plain rounded-md p-3 ${tactic.betrayal ? '' : 'outline-peacock'}`}
                        aria-label={`Tactic: ${tactic.label}`}
                      >
                        <p className={`font-display text-lg ${tactic.betrayal ? 'text-sindoor' : 'text-peacock'}`}>
                          {tactic.label} <span className="font-deva text-base text-ink-soft">{tactic.sanskrit}</span>
                        </p>
                        <p className="text-sm">{tactic.explanation}</p>
                        <blockquote className="mt-2 border-l-4 border-gold pl-2 text-sm italic">“{tactic.arthashastra.text}”</blockquote>
                        <p className="mt-1 text-xs text-ink-soft">— {tactic.arthashastra.citation}</p>
                      </aside>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-label="Itihas Codex unlocks">
          <h2 className="rule-ornament mb-3 text-2xl">
            <span>Itihas Codex · {view.codexUnlocked.length} tales unlocked this game</span>
          </h2>
          <div className="rounded-md bg-parchment/5 p-3">
            <CodexGrid unlocked={view.codexUnlocked} fresh={view.codexUnlocked} />
          </div>
          <p className="mt-2 text-center text-sm text-parchment/70">Unlocked tales are saved to your collection in this browser.</p>
        </section>

        <footer className="flex flex-wrap justify-center gap-3 pb-6">
          {court.myRole === 'raja' ? (
            <button className="btn btn-royal text-lg" onClick={() => court.act({ type: 'restart' })}>
              Hold another court
            </button>
          ) : (
            <p className="italic text-parchment/70">The Raja may summon the court again.</p>
          )}
        </footer>
      </div>
    </dialog>
  );
}
