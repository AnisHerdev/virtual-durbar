import { useEffect, useState } from 'react';
import type { FamineRun, PublicTask } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { Effects, ProceedBar, SecretBox, StageFrame, Verdict, playerName, proceedMove, useTaskDef, type Move } from './common';

type FamineView = Extract<PublicTask, Pick<FamineRun, 'kind'>>;

function Slider({
  label,
  value,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-20 text-sm font-semibold">{label}</span>
      <input
        type="range"
        min={0}
        max={Math.max(0, max)}
        step={5}
        value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled || max <= 0}
        className="flex-1 accent-sindoor"
      />
      <span className="w-16 text-right font-display tabular-nums">
        {Math.min(value, max)}/{max}
      </span>
    </label>
  );
}

function Progress({ label, value, need }: { label: string; value: number; need?: number }) {
  const pct = need ? Math.min(100, (value / need) * 100) : Math.min(100, value / 6);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums">
          {value}
          {need !== undefined && ` / ${need}`}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-ink/15">
        <div className={`h-full ${need && value >= need ? 'bg-peacock' : 'bg-marigold'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FamineStage({ court, task }: { court: Court; task: FamineView }) {
  const view = court.view!;
  const def = useTaskDef(task, 'famine');
  const me = view.me;
  const duties = me.task.duties;
  const active = task.stage === 'active';
  const [gold, setGold] = useState(me.task.myPledge?.gold ?? 0);
  const [grain, setGrain] = useState(me.task.myPledge?.grain ?? 0);
  const [granary, setGranary] = useState(task.granary);
  const [divGold, setDivGold] = useState(me.task.canDivert?.current.gold ?? 0);
  const [divGrain, setDivGrain] = useState(me.task.canDivert?.current.grain ?? 0);
  useEffect(() => {
    setGranary(task.granary);
  }, [task.granary]);

  const need = me.task.exactNeed;
  const totalGrain = task.declared.grain + task.granary;
  const pledged = me.task.myPledge;
  const changed = !pledged || pledged.gold !== gold || pledged.grain !== grain;
  const move: Move = !active
    ? proceedMove(court)
    : duties.includes('knowsNeed') && !pledged
      ? { act: true, text: 'Only you know the true need. Tell the court, then seal your own pledge.' }
      : !pledged
        ? { act: true, text: 'Seal a secret pledge of gold and grain from your own purse.' }
        : court.myRole === 'raja'
          ? { act: true, text: 'Pledge sealed. Send the carts when the court has given enough.' }
          : { act: false, text: 'Pledge sealed. You may change it until the carts leave.' };

  return (
    <StageFrame kicker="Team Mission · The Famine" title={def.title} court={court} deadline={task.deadline} move={move}>
      <p className="leading-snug">{def.summary}</p>

      <div className="grid gap-2 rounded-md bg-parchment-deep/70 p-3">
        <p className="label">Relief carts (as declared)</p>
        <Progress label="Gold" value={task.declared.gold} need={need?.gold} />
        <Progress label="Grain (incl. royal granary)" value={totalGrain} need={need?.grain} />
        <p className="text-sm">
          {need ? (
            <>
              {duties.includes('knowsNeed') && active && <b>Only you know the true need. </b>}
              The villages need <b>{need.gold} gold</b> and <b>{need.grain} grain</b>.
            </>
          ) : (
            <i>{def.rumouredNeed}</i>
          )}
        </p>
        <p className="text-sm text-ink-soft">
          Pledged so far: {task.pledgedBy.length ? task.pledgedBy.map((id) => playerName(view, id)).join(', ') : 'no one'} · Royal granary opened:{' '}
          {task.granary} grain
        </p>
      </div>

      {active && (
        <div className="grid gap-2">
          <p className="label">Your secret pledge (from your own purse)</p>
          <Slider label="Gold" value={gold} max={me.purse.gold} onChange={setGold} />
          <Slider label="Grain" value={grain} max={me.purse.grain} onChange={setGrain} />
          <button
            className="btn btn-royal self-start"
            disabled={!changed}
            onClick={() => court.act({ type: 'famine/pledge', gold, grain })}
          >
            {pledged ? (changed ? 'Change my pledge' : 'Pledge sealed') : 'Seal my pledge'}
          </button>
        </div>
      )}

      {active && duties.includes('granary') && (
        <div className="grid gap-2 rounded-md border-2 border-peacock/50 p-3">
          <p className="label text-peacock">Royal granary · treasury holds {view.stats.grain} grain</p>
          <Slider label="Release" value={granary} max={Math.min(def.maxGranaryRelease, view.stats.grain)} onChange={setGranary} />
          <button
            className="btn btn-gold self-start"
            disabled={granary === task.granary}
            onClick={() => court.act({ type: 'famine/granary', amount: granary })}
          >
            Open the granary
          </button>
        </div>
      )}

      {active && me.task.canDivert && (
        <SecretBox title="Your men among the carters">
          <p className="mb-2">Quietly divert relief into your own purse. The court will only see the shortfall when the carts arrive.</p>
          <Slider label="Gold" value={divGold} max={me.task.canDivert.max} onChange={setDivGold} />
          <Slider label="Grain" value={divGrain} max={me.task.canDivert.max} onChange={setDivGrain} />
          <button className="btn btn-gold mt-2" onClick={() => court.act({ type: 'famine/divert', gold: divGold, grain: divGrain })}>
            Give the order
          </button>
        </SecretBox>
      )}

      {active && court.myRole === 'raja' && (
        <button className="btn btn-ghost self-start" onClick={() => court.act({ type: 'famine/seal' })}>
          Send the carts now
        </button>
      )}

      {task.stage === 'resolved' && task.delivered && (
        <>
          <Verdict success={task.success}>
            <p>
              Delivered <b>{task.delivered.gold} gold</b> and <b>{task.delivered.grain} grain</b>
              {need && (
                <>
                  {' '}
                  against a need of {need.gold} gold and {need.grain} grain
                </>
              )}
              .
            </p>
            {(task.delivered.gold < task.declared.gold || task.delivered.grain < totalGrain) && (
              <p className="font-semibold text-sindoor">
                Less arrived than was pledged. Someone’s hands were in the carts…
              </p>
            )}
            <p>{task.success ? def.success.outcome : def.failure.outcome}</p>
            <Effects effects={task.success ? def.success.effects : def.failure.effects} />
          </Verdict>
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
