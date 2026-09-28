import { useState } from 'react';
import type { PublicTask, TrialRun } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { Effects, ProceedBar, SecretBox, StageFrame, Verdict, playerName, proceedMove, useTaskDef, type Move } from './common';

type TrialView = Extract<PublicTask, Pick<TrialRun, 'kind'>>;

export function TrialStage({ court, task }: { court: Court; task: TrialView }) {
  const view = court.view!;
  const def = useTaskDef(task, 'trial');
  const [forgeTarget, setForgeTarget] = useState(def.suspects[0].id);
  const [confirming, setConfirming] = useState<string | null>(null);
  const isRaja = court.myRole === 'raja';
  const myClues = def.clues.filter((c) => view.me.task.clues?.includes(c.id));
  const tally = (id: string) => Object.values(task.votes).filter((v) => v === id).length;
  const myVote = task.votes[court.selfIdentity];
  const active = task.stage === 'active';
  const move: Move = !active
    ? proceedMove(court)
    : isRaja
      ? { act: true, text: 'Hear every record read aloud, then pronounce one suspect guilty.' }
      : myVote
        ? { act: false, text: 'Vote cast. You may change it until the Raja pronounces a verdict.' }
        : { act: true, text: 'Read your secret record to the court, then vote for a suspect.' };

  return (
    <StageFrame kicker="Team Mission · The Court Trial" title={def.title} court={court} deadline={task.deadline} move={move}>
      <p className="leading-snug">{def.summary}</p>

      <SecretBox title={myClues.length === 1 ? 'The record only you hold' : 'The records only you hold'}>
        {myClues.length ? (
          <ul className="space-y-2">
            {myClues.map((c) => (
              <li key={c.id}>
                <span className="label">{c.source}</span>
                <p className="leading-snug">{c.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic">You hold no record. Listen carefully to those who do.</p>
        )}
        <p className="mt-2 text-sm text-ink-soft">Read yours aloud to the court — or choose what to keep back.</p>
      </SecretBox>

      {task.reports.length > 0 && (
        <div>
          <p className="label mb-1">Reports laid before the court</p>
          {task.reports.map((r) => (
            <p key={r.id} className="rounded bg-parchment-deep px-2 py-1">
              <b>{playerName(view, r.by)}</b>: “{r.text}”
            </p>
          ))}
        </div>
      )}

      <div>
        <p className="label mb-1">The accused</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {def.suspects.map((s) => {
            const guilty = task.stage === 'resolved' && s.id === def.culpritId;
            return (
              <div
                key={s.id}
                className={`rounded-md border-2 p-2 ${guilty ? 'border-sindoor bg-sindoor/10' : task.verdict === s.id ? 'border-lapis' : 'border-ink-soft/40'}`}
              >
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-ink-soft">{s.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    {tally(s.id)} vote{tally(s.id) === 1 ? '' : 's'}
                  </span>
                  {active && !isRaja && (
                    <button
                      className="btn btn-ghost px-2 py-0.5 text-sm"
                      aria-pressed={myVote === s.id}
                      onClick={() => court.act({ type: 'trial/vote', suspectId: s.id })}
                    >
                      {myVote === s.id ? 'Your vote' : 'Vote'}
                    </button>
                  )}
                  {active && isRaja && (
                    <button
                      className="btn btn-royal px-2 py-0.5 text-sm"
                      onClick={() =>
                        confirming === s.id ? court.act({ type: 'trial/verdict', suspectId: s.id }) : setConfirming(s.id)
                      }
                    >
                      {confirming === s.id ? 'Confirm: guilty' : 'Pronounce guilty'}
                    </button>
                  )}
                  {guilty && <span className="text-sm font-semibold text-sindoor">The true culprit</span>}
                </div>
              </div>
            );
          })}
        </div>
        {active && isRaja && (
          <p className="mt-2 text-sm italic text-ink-soft">
            Ministers vote; you decide. If the lamps burn out, the plurality vote becomes the verdict.
          </p>
        )}
      </div>

      {active && view.me.task.canForge && (
        <SecretBox title="Your paymaster's forger">
          <p>Plant a false witness report that implicates a suspect. It will appear under your name as a genuine report.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select className="field w-auto" value={forgeTarget} onChange={(e) => setForgeTarget(e.target.value)} aria-label="Suspect to frame">
              {def.suspects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn btn-gold" onClick={() => court.act({ type: 'trial/forge', suspectId: forgeTarget })}>
              Plant the report
            </button>
          </div>
        </SecretBox>
      )}

      {task.stage === 'resolved' && (
        <>
          <Verdict success={task.success}>
            <p>{task.success ? def.success.outcome : def.failure.outcome}</p>
            <Effects effects={task.success ? def.success.effects : def.failure.effects} />
            <p className="mt-1 text-sm text-ink-soft">{def.explanation}</p>
          </Verdict>
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
