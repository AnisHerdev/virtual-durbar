import { useState } from 'react';
import type { PetitionRun } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { Effects, ProceedBar, SecretBox, StageFrame, Verdict, playerName, proceedMove, useRoleTitles, useTaskDef, type Move } from './common';

export function PetitionStage({ court, task }: { court: Court; task: Omit<PetitionRun, 'bribed'> }) {
  const view = court.view!;
  const def = useTaskDef(task, 'petition');
  const titles = useRoleTitles();
  const [pick, setPick] = useState<string | null>(null);
  const isRaja = court.myRole === 'raja';
  const mine = task.assignee === court.selfIdentity;
  const ministers = view.players.filter((p) => p.role !== 'raja');
  const bribe = view.me.task.bribeOffer;
  const chosen = def.options.find((o) => o.id === task.choice);
  const move: Move =
    task.stage === 'assign'
      ? isRaja
        ? { act: true, text: 'Choose a minister to judge this petition.' }
        : { act: false, text: <>The Raja is choosing a judge. By custom this falls to the {titles[def.suggestedRole]}.</> }
      : task.stage === 'active'
        ? mine
          ? { act: true, text: 'Pick a ruling below, then pronounce it before time runs out.' }
          : { act: false, text: `${playerName(view, task.assignee)} is deliberating. Advise them aloud!` }
        : proceedMove(court);

  return (
    <StageFrame kicker={`Petition · ${def.mode === 'puzzle' ? 'A mystery to solve' : 'A matter of policy'}`} title={def.title} court={court} deadline={task.deadline} move={move}>
      <p className="text-ink-soft">
        <b className="text-ink">{def.petitioner}</b> comes before the throne.
      </p>
      <p className="text-lg leading-snug">{def.summary}</p>
      <div>
        <p className="label mb-1">What the court knows</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {def.clues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      {task.stage === 'assign' && (
        <div className="rounded-md bg-parchment-deep/70 p-3">
          {isRaja ? (
            <>
              <p className="mb-2 font-semibold">Whom will you entrust with this petition?</p>
              <div className="flex flex-wrap gap-2">
                {ministers.map((m) => (
                  <button
                    key={m.identity}
                    className={`btn ${m.role === def.suggestedRole ? 'btn-royal' : 'btn-ghost'}`}
                    onClick={() => court.act({ type: 'petition/assign', assignee: m.identity })}
                  >
                    {m.name} · {titles[m.role]}
                    {m.role === def.suggestedRole && <span className="text-xs">(natural fit)</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="italic">
              The Raja is choosing a minister. By custom this falls to the <b>{titles[def.suggestedRole]}</b>.
            </p>
          )}
        </div>
      )}

      {task.stage === 'active' && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">
            {mine ? 'The court awaits your ruling:' : `${playerName(view, task.assignee)} deliberates. Advise them aloud!`}
          </p>
          {def.options.map((o) => (
            <button
              key={o.id}
              className="btn btn-choice"
              aria-pressed={pick === o.id}
              disabled={!mine}
              onClick={() => setPick(o.id)}
            >
              {o.label}
            </button>
          ))}
          {mine && (
            <button
              className="btn btn-royal self-start"
              disabled={!pick}
              onClick={() => pick && court.act({ type: 'petition/choose', optionId: pick })}
            >
              Pronounce the ruling
            </button>
          )}
          {bribe && (
            <SecretBox title="A purse slipped into your sleeve">
              <p>
                An agent of your foreign paymaster offers <b>{bribe.amount} gold</b> if you rule:{' '}
                <i>“{def.options.find((o) => o.id === bribe.optionId)?.label}”</i>.
              </p>
              <button
                className="btn btn-gold mt-2"
                onClick={() => court.act({ type: 'petition/choose', optionId: bribe.optionId, bribe: true })}
              >
                Take the gold and rule so
              </button>
            </SecretBox>
          )}
        </div>
      )}

      {task.stage === 'resolved' && (
        <>
          <Verdict success={task.success}>
            {chosen && (
              <p className="font-semibold">
                {playerName(view, task.assignee)} ruled: “{chosen.label}”
              </p>
            )}
            <p>{task.outcome}</p>
            <Effects effects={chosen?.effects ?? (task.choice ? undefined : def.timeoutEffects)} />
          </Verdict>
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
