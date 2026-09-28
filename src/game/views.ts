// Redaction: builds what one player is allowed to see from the host's full state.

import type { Content } from '../content/types';
import { bribeOptionFor, BRIBE_AMOUNT, currentEnemies, dutiesOf, LOYALTY_OFFER, playersList } from './engine';
import type { ClientView, GameState, PrivateTask, PublicTask, RoomSummary } from './types';

const LIVE_LOG_SIZE = 40;

export function viewFor(state: GameState, identity: string, content: Content): ClientView {
  const me = state.players[identity];
  const isTraitor = !!me && state.traitor === identity;
  const ended = state.status === 'ended';
  const duties = me && state.status === 'playing' ? dutiesOf(state, identity) : [];
  const priv: PrivateTask = { duties };
  let task: PublicTask | null = null;
  const t = state.task;

  if (t) {
    switch (t.kind) {
      case 'petition': {
        const { bribed: _bribed, ...pub } = t;
        task = pub;
        if (isTraitor && t.assignee === identity && t.stage === 'active') {
          priv.bribeOffer = { amount: BRIBE_AMOUNT, optionId: bribeOptionFor(state, t, { content, now: 0, timeScale: 1 }) };
        }
        break;
      }
      case 'riddle':
      case 'sunset':
        task = t;
        break;
      case 'trial': {
        const { dealt, reports, ...pub } = t;
        task = { ...pub, reports: reports.map(({ forged: _forged, ...r }) => r) };
        priv.clues = dealt[identity] ?? [];
        priv.canForge = isTraitor && !reports.some((r) => r.forged);
        break;
      }
      case 'famine': {
        const { need, pledges, diverted, ...pub } = t;
        const declared = Object.values(pledges).reduce(
          (acc, p) => ({ gold: acc.gold + p.gold, grain: acc.grain + p.grain }),
          { gold: 0, grain: 0 },
        );
        task = { ...pub, pledgedBy: Object.keys(pledges), declared };
        priv.myPledge = pledges[identity];
        if (duties.includes('knowsNeed') || t.stage === 'resolved') priv.exactNeed = need;
        if (isTraitor) {
          const def = content.tasks.tasks.find((x) => x.id === t.taskId);
          priv.canDivert = {
            max: def?.kind === 'famine' ? def.maxDivert : 0,
            current: { gold: diverted.gold, grain: diverted.grain },
          };
        }
        break;
      }
      case 'fort': {
        const { sabotage, ...pub } = t;
        task = pub;
        if (duties.includes('spy') && t.stage === 'plan') {
          const def = content.tasks.tasks.find((x) => x.id === t.taskId);
          if (def?.kind === 'fort') priv.enemies = currentEnemies(t, def);
        }
        priv.canSabotage = isTraitor && !sabotage;
        break;
      }
    }
  }

  const loyalty = state.loyalty;
  const view: ClientView = {
    status: state.status,
    day: state.day,
    phase: state.phase,
    taskIndex: state.taskIndex,
    stats: state.stats,
    players: playersList(state).map(({ identity: id, name, role, connected }) => ({ identity: id, name, role, connected })),
    task,
    log: state.log
      .filter((e) => e.public)
      .slice(-LIVE_LOG_SIZE)
      .map((e) => ({ id: e.id, at: e.at, text: e.public!, day: e.day, phase: e.phase })),
    loyaltyUsed: loyalty.used,
    codexUnlocked: state.codexUnlocked,
    me: {
      identity,
      role: me?.role ?? null,
      purse: me?.purse ?? { gold: 0, grain: 0 },
      isTraitor,
      task: priv,
      offer: loyalty.status === 'offered' && loyalty.target === identity ? { amount: LOYALTY_OFFER } : undefined,
      loyaltyReport:
        me?.role === 'raja' && loyalty.target ? { target: loyalty.target, status: loyalty.status } : undefined,
    },
  };

  if (ended && state.result) {
    view.debrief = {
      traitor: state.traitor,
      log: state.log,
      result: state.result,
      pledges: state.pledgeLedger ?? [],
      purses: Object.fromEntries(Object.values(state.players).map((p) => [p.identity, p.purse])),
    };
  }
  return view;
}

export function summaryOf(state: GameState): RoomSummary {
  return { status: state.status, day: state.day, phase: state.phase, stats: state.stats };
}
