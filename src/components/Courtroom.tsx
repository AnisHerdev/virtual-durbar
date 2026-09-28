import { RoomContext } from '@livekit/components-react';
import { RoomEvent, type Participant } from 'livekit-client';
import { useContext, useEffect, useState } from 'react';
import { useContent } from '../content/loadContent';
import type { RoleId } from '../content/types';
import type { Court } from '../game/useCourt';
import { CourtLog } from './Chronicle';
import { Debrief } from './Debrief';
import { KingdomBar } from './KingdomBar';
import { LoyaltyOffer, SecretAgenda } from './SecretAgenda';
import { Seat, type SeatBadge } from './Seat';
import { CenterStage } from './stage/CenterStage';
import { PHASE_LABEL } from './stage/common';

// The council forms an open "C" with the throne: three seats above, three below.
const TOP_ROW: RoleId[] = ['mahamantri', 'treasurer', 'senapati'];
const BOTTOM_ROW: RoleId[] = ['spy', 'nyayadhish', 'sitadhyaksha'];

function useActiveSpeakers(): Set<string> {
  const room = useContext(RoomContext);
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!room) return;
    const on = (ps: Participant[]) => setSpeakers(new Set(ps.map((p) => p.identity)));
    room.on(RoomEvent.ActiveSpeakersChanged, on);
    return () => void room.off(RoomEvent.ActiveSpeakersChanged, on);
  }, [room]);
  return speakers;
}

function badgesFor(court: Court, identity: string | undefined): SeatBadge[] {
  const task = court.view?.task;
  if (!identity || !task) return [];
  const out: SeatBadge[] = [];
  switch (task.kind) {
    case 'petition':
      if (task.assignee === identity) out.push({ text: task.stage === 'resolved' ? 'Ruled' : 'Judging', tone: 'gold' });
      break;
    case 'riddle':
      if (task.winner === identity) out.push({ text: 'Solved it!', tone: 'peacock' });
      if (task.lockedOut.includes(identity)) out.push({ text: 'Silenced', tone: 'sindoor' });
      break;
    case 'trial':
      if (task.votes[identity]) out.push({ text: 'Voted', tone: 'lapis' });
      break;
    case 'famine':
      if (task.pledgedBy.includes(identity)) out.push({ text: 'Pledged', tone: 'peacock' });
      break;
    case 'fort':
      if (task.dispatches.some((d) => d.by === identity)) out.push({ text: 'Sent dispatch', tone: 'lapis' });
      break;
    case 'sunset':
      break;
  }
  return out;
}

export function Courtroom({ court, onLeaveSeat }: { court: Court; onLeaveSeat: () => void }) {
  const content = useContent();
  const speaking = useActiveSpeakers();
  const view = court.view;
  const idFor = (role: RoleId) => view?.players.find((p) => p.role === role)?.identity ?? [...court.roles].find(([, r]) => r === role)?.[0];
  const seat = (role: RoleId, throne?: boolean) => (
    <Seat key={role} court={court} role={role} throne={throne} speaking={speaking} badges={badgesFor(court, idFor(role))} />
  );
  const taskTitle = view?.task ? content.tasks.tasks.find((t) => t.id === view.task!.taskId)?.title : undefined;

  return (
    <div className="flex min-h-full flex-col xl:h-full">
      <KingdomBar court={court} />
      {court.lastError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-sindoor px-4 py-1 text-parchment">
          <span>{court.lastError}</span>
          <button className="text-sm underline" onClick={court.clearError}>
            Dismiss
          </button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] xl:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.4fr)_minmax(400px,1.3fr)]">
        {/* Throne */}
        <aside className="flex flex-col gap-3 lg:col-span-2 xl:col-span-1 xl:min-h-0" aria-label="The throne">
          <div className="mx-auto w-full max-w-[200px] sm:max-w-[280px] xl:max-w-none">{seat('raja', true)}</div>
          <SecretAgenda court={court} />
          {view?.status === 'lobby' && (
            <button className="btn btn-ghost text-sm text-parchment/80" onClick={onLeaveSeat}>
              ← Back to the antechamber
            </button>
          )}
        </aside>

        {/* Council */}
        <section className="flex min-h-0 flex-col gap-3" aria-label="The council">
          <div className="grid grid-cols-3 gap-3">{TOP_ROW.map((r) => seat(r))}</div>
          <div
            className="flex items-center justify-center gap-3 rounded-md border-2 border-gold bg-sindoor-deep px-3 py-2 text-center"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgb(201 162 39 / 0.25) 0 2px, transparent 2px 22px), repeating-linear-gradient(0deg, rgb(201 162 39 / 0.18) 0 2px, transparent 2px 22px)',
            }}
          >
            <span aria-hidden className="text-gold-light">❖</span>
            <p className="font-display text-gold-light">
              {PHASE_LABEL[view?.phase ?? 'lobby']}
              {taskTitle && <span className="text-parchment"> — {taskTitle}</span>}
            </p>
            <span aria-hidden className="text-gold-light">❖</span>
          </div>
          <div className="grid grid-cols-3 gap-3">{BOTTOM_ROW.map((r) => seat(r))}</div>
          <div className="flex min-h-64 flex-1 flex-col xl:min-h-0">
            <CourtLog court={court} />
          </div>
        </section>

        {/* Centre stage: on a single-column phone layout, your next move comes before the gallery of seats. */}
        <div className="order-first min-h-[480px] lg:order-none lg:row-span-1 xl:min-h-0">
          <CenterStage court={court} />
        </div>
      </div>
      <LoyaltyOffer court={court} />
      {view?.status === 'ended' && view.debrief && <Debrief court={court} />}
    </div>
  );
}
