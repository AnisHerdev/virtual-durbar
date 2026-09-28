import type { RiddleRun } from '../../game/types';
import type { Court } from '../../game/useCourt';
import { ProceedBar, StageFrame, playerName, useTaskDef } from './common';

export function RiddleStage({ court, task }: { court: Court; task: RiddleRun }) {
  const view = court.view!;
  const def = useTaskDef(task, 'riddle');
  const hasMinisters = view.players.some((p) => p.role !== 'raja');
  const canAnswer = task.stage === 'active' && (court.myRole !== 'raja' || !hasMinisters) && !task.lockedOut.includes(court.selfIdentity);

  return (
    <StageFrame kicker={`Royal Challenge · ${def.source}`} title={def.title} court={court} deadline={task.deadline}>
      <blockquote className="border-l-4 border-gold pl-3 text-xl italic leading-snug">{def.prompt}</blockquote>
      <p className="text-sm text-ink-soft">
        First minister to answer correctly wins <b>{def.goldBonus} gold</b> for their purse. A wrong answer silences you
        for this riddle.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {def.options.map((o) => {
          const revealed = task.stage === 'resolved' && o.id === def.answerId;
          return (
            <button
              key={o.id}
              className={`btn btn-choice ${revealed ? '!border-peacock !bg-peacock !text-parchment' : ''}`}
              disabled={!canAnswer}
              onClick={() => court.act({ type: 'riddle/answer', optionId: o.id })}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {task.lockedOut.length > 0 && (
        <p className="text-sm text-sindoor">Silenced: {task.lockedOut.map((id) => playerName(view, id)).join(', ')}</p>
      )}
      {court.myRole === 'raja' && hasMinisters && task.stage === 'active' && (
        <p className="italic">You pose the riddle, Raja. Watch who answers first.</p>
      )}
      {task.stage === 'resolved' && (
        <>
          <div className="rise rounded-md border-2 border-gold bg-gold/10 p-3">
            <p className="font-display text-lg">
              {task.winner ? `${playerName(view, task.winner)} wins the gold!` : 'No one solved it.'}
            </p>
            <p>{def.explanation}</p>
          </div>
          <ProceedBar court={court} />
        </>
      )}
    </StageFrame>
  );
}
