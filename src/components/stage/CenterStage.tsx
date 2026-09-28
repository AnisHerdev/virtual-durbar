import type { Court } from '../../game/useCourt';
import { FamineStage } from './FamineStage';
import { FortStage } from './FortStage';
import { PetitionStage } from './PetitionStage';
import { RiddleStage } from './RiddleStage';
import { SunsetStage } from './SunsetStage';
import { TrialStage } from './TrialStage';
import { StageFrame, useRoleTitles } from './common';

export function CenterStage({ court }: { court: Court }) {
  const view = court.view;
  if (!view) {
    return (
      <StageFrame kicker="The court assembles" title="Awaiting the throne" court={court}>
        <p>{court.hostIdentity ? 'Receiving the court scrolls…' : 'No one sits on the throne. The game begins once a Raja or Rani takes the seat.'}</p>
      </StageFrame>
    );
  }
  const task = view.task;
  if (view.status === 'lobby' || !task) return <AssemblyStage court={court} />;
  // Keyed by task so per-task local UI state (selections, sliders) resets.
  const key = `${view.taskIndex}:${task.taskId}`;
  switch (task.kind) {
    case 'petition':
      return <PetitionStage key={key} court={court} task={task} />;
    case 'riddle':
      return <RiddleStage key={key} court={court} task={task} />;
    case 'trial':
      return <TrialStage key={key} court={court} task={task} />;
    case 'famine':
      return <FamineStage key={key} court={court} task={task} />;
    case 'fort':
      return <FortStage key={key} court={court} task={task} />;
    case 'sunset':
      return <SunsetStage key={key} court={court} task={task} />;
  }
}

function AssemblyStage({ court }: { court: Court }) {
  const view = court.view!;
  const titles = useRoleTitles();
  const isRaja = court.myRole === 'raja';
  const ministers = view.players.filter((p) => p.role !== 'raja');
  return (
    <StageFrame kicker="The court assembles" title="Before the three days" court={court}>
      <p className="leading-snug">
        Over three accelerated days you will hear petitions each morning, test your wits at midday, face a team mission
        each afternoon, and at sunset the Raja issues an edict. Fifteen matters in all.
      </p>
      <p className="leading-snug">
        <b>Beware:</b> when the game begins, one minister may secretly be taken into the pay of a rival kingdom. Watch for
        false reports, missing grain and thin gates. At the final sunset, the Raja may name the traitor.
      </p>
      <div>
        <p className="label mb-1">Seated ({view.players.length}/7)</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {view.players.map((p) => (
            <li key={p.identity} className="rounded bg-parchment-deep px-2 py-1">
              <b>{titles[p.role]}</b> — {p.name}
            </li>
          ))}
        </ul>
      </div>
      {isRaja ? (
        <>
          <button className="btn btn-royal self-start text-lg" onClick={() => court.act({ type: 'start' })}>
            Begin the three days
          </button>
          {ministers.length === 0 && (
            <p className="text-sm text-ink-soft">You may begin alone to explore, but the court is best with 3–7 players.</p>
          )}
        </>
      ) : (
        <p className="italic">When the court is ready, the Raja will begin.</p>
      )}
    </StageFrame>
  );
}
