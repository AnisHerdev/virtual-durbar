import { useState } from 'react';
import type { SunsetRun } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { Effects, ProceedBar, SecretBox, StageFrame, playerName, proceedMove, useRoleTitles, useTaskDef, type Move } from './common';

const LOYALTY_STATUS: Record<string, string> = {
  offered: 'The envoy has made the offer. You await their answer…',
  accepted: 'They ACCEPTED the bribe.',
  refused: 'They REFUSED the bribe.',
  ignored: 'They never answered the envoy.',
};

export function SunsetStage({ court, task }: { court: Court; task: SunsetRun }) {
  const view = court.view!;
  const def = useTaskDef(task, 'sunset');
  const titles = useRoleTitles();
  const isRaja = court.myRole === 'raja';
  const ministers = view.players.filter((p) => p.role !== 'raja');
  const [testTarget, setTestTarget] = useState(ministers[0]?.identity ?? '');
  const [accused, setAccused] = useState<string>('');
  const edict = def.edicts.find((e) => e.id === task.edictId);
  const report = view.me.loyaltyReport;
  const move: Move =
    task.stage === 'decree'
      ? isRaja
        ? { act: true, text: 'Issue one edict for the realm.' }
        : { act: false, text: 'The court waits for the Raja’s edict. Ministers, make your case!' }
      : task.stage === 'accuse'
        ? isRaja
          ? { act: true, text: 'Name the minister you believe betrayed the realm — or no one.' }
          : { act: false, text: 'The Raja weighs every word spoken these three days…' }
        : proceedMove(court);

  return (
    <StageFrame kicker="Sunset · Judgment & Loyalty" title={def.title} court={court} move={move}>
      <p className="leading-snug">{def.summary}</p>

      <div className="grid gap-2">
        {def.edicts.map((e) => (
          <div
            key={e.id}
            className={`rounded-md border-2 p-3 ${task.edictId === e.id ? 'border-gold bg-gold/15' : 'border-ink-soft/30'}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-lg">{e.label}</p>
              <Effects effects={e.effects} />
            </div>
            <p className="text-sm text-ink-soft">{e.description}</p>
            {isRaja && task.stage === 'decree' && (
              <button className="btn btn-royal mt-2 px-3 py-1 text-sm" onClick={() => court.act({ type: 'sunset/edict', edictId: e.id })}>
                Issue this edict
              </button>
            )}
          </div>
        ))}
        {edict && <p className="font-semibold text-peacock">The Raja has decreed: {edict.label}.</p>}
      </div>

      {isRaja && (task.stage !== 'resolved' || report) && (
        <SecretBox title="The Loyalty Test (once per game)">
          {view.loyaltyUsed ? (
            report && (
              <p>
                You tested <b>{playerName(view, report.target)}</b>. {LOYALTY_STATUS[report.status ?? 'offered']}
              </p>
            )
          ) : (
            <>
              <p className="mb-2">
                Send a disguised envoy to offer a minister a false bribe. They will not know it is you. Only you will learn
                their answer — as Kautilya advised: test ministers by secret temptation.
              </p>
              <div className="flex flex-wrap gap-2">
                <select className="field w-auto" value={testTarget} onChange={(e) => setTestTarget(e.target.value)} aria-label="Minister to test">
                  {ministers.map((m) => (
                    <option key={m.identity} value={m.identity}>
                      {m.name} — {titles[m.role]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-gold"
                  disabled={!testTarget}
                  onClick={() => court.act({ type: 'loyalty/test', target: testTarget })}
                >
                  Send the false envoy
                </button>
              </div>
            </>
          )}
        </SecretBox>
      )}

      {task.stage === 'accuse' && (
        <div className="rounded-md border-2 border-sindoor p-3">
          <p className="font-display text-lg text-sindoor">Name the traitor?</p>
          {isRaja ? (
            <>
              <p className="mb-2 text-sm">
                Name the minister you believe betrayed the realm. A true accusation lifts the people’s spirits; a false one
                shames the throne. You may also name no one.
              </p>
              <div className="flex flex-wrap gap-2">
                <select className="field w-auto" value={accused} onChange={(e) => setAccused(e.target.value)} aria-label="Accused minister">
                  <option value="">— choose —</option>
                  {ministers.map((m) => (
                    <option key={m.identity} value={m.identity}>
                      {m.name} — {titles[m.role]}
                    </option>
                  ))}
                </select>
                <button className="btn btn-royal" disabled={!accused} onClick={() => court.act({ type: 'sunset/accuse', target: accused })}>
                  Accuse
                </button>
                <button className="btn btn-ghost" onClick={() => court.act({ type: 'sunset/accuse', target: null })}>
                  Name no one
                </button>
              </div>
            </>
          ) : (
            <p className="italic">The Raja weighs every word spoken these three days…</p>
          )}
        </div>
      )}

      {task.stage === 'resolved' && (
        <>
          {task.accusation && (
            <p className="font-semibold">
              {task.accusation.target ? `The Raja named ${playerName(view, task.accusation.target)} a traitor.` : 'The Raja named no traitor.'}{' '}
              The truth will be revealed through Kautilya’s Lens.
            </p>
          )}
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
