import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateContent } from '../content/loadContent';
import type { Content } from '../content/types';
import { ActionError, applyAction, createGame, syncPlayers, tick, type EngineCtx } from './engine';
import type { ClientAction, GameState } from './types';
import { viewFor } from './views';

const assets = join(dirname(fileURLToPath(import.meta.url)), '../../public/assets');
const read = (p: string) => JSON.parse(readFileSync(join(assets, p), 'utf8'));
const content: Content = {
  roles: read('content/roles.json'),
  tasks: read('content/tasks.json'),
  codex: read('content/codex.json'),
  tactics: read('content/kautilya.json'),
  ragas: read('content/ragas.json'),
  manifest: read('manifest.json'),
};

let now = 1_000_000;
const ctx = (): EngineCtx => ({ content, now, timeScale: 1 });
const seats = [
  { identity: 'raja-1', name: 'Asha', role: 'raja' as const },
  { identity: 'mm-1', name: 'Bhanu', role: 'mahamantri' as const },
  { identity: 'tr-1', name: 'Chitra', role: 'treasurer' as const },
];

function newGame(seed = 7): GameState {
  return syncPlayers(createGame(seed, ctx()), seats, ctx());
}
const act = (s: GameState, who: string, a: ClientAction) => applyAction(s, a, who, ctx());

describe('content', () => {
  it('is internally consistent', () => {
    expect(() => validateContent(content)).not.toThrow();
  });
});

describe('engine', () => {
  it('only lets the Raja start, and picks one secret traitor among ministers', () => {
    const s = newGame();
    expect(() => act(s, 'mm-1', { type: 'start' })).toThrow(ActionError);
    const started = act(s, 'raja-1', { type: 'start' });
    expect(started.status).toBe('playing');
    expect(['mm-1', 'tr-1']).toContain(started.traitor);
    // Nobody but the traitor learns who it is.
    for (const id of ['raja-1', 'mm-1', 'tr-1']) {
      expect(viewFor(started, id, content).me.isTraitor).toBe(id === started.traitor);
      expect(JSON.stringify(viewFor(started, id, content))).not.toContain('"traitor"');
    }
  });

  it('plays all 15 tasks to a debrief with betrayals exposed', () => {
    let s = act(newGame(), 'raja-1', { type: 'start' });
    const traitor = s.traitor!;
    const loyal = traitor === 'mm-1' ? 'tr-1' : 'mm-1';
    const seen: string[] = [];

    for (let guard = 0; guard < 200 && s.status === 'playing'; guard++) {
      const task = s.task!;
      seen.push(`${task.kind}:${task.stage}`);
      if (task.stage === 'resolved') {
        s = act(s, 'raja-1', { type: 'advance' });
        continue;
      }
      switch (task.kind) {
        case 'petition': {
          if (task.stage === 'assign') {
            s = act(s, 'raja-1', { type: 'petition/assign', assignee: traitor });
          } else {
            const offer = viewFor(s, traitor, content).me.task.bribeOffer!;
            expect(offer).toBeDefined();
            s = act(s, traitor, { type: 'petition/choose', optionId: offer.optionId, bribe: true });
          }
          break;
        }
        case 'riddle': {
          const def = content.tasks.tasks.find((t) => t.id === task.taskId)!;
          if (def.kind !== 'riddle') throw new Error();
          expect(() => act(s, 'raja-1', { type: 'riddle/answer', optionId: def.answerId })).toThrow();
          s = act(s, loyal, { type: 'riddle/answer', optionId: def.answerId });
          break;
        }
        case 'trial':
          s = act(s, traitor, { type: 'trial/forge', suspectId: 'bhima' });
          s = act(s, loyal, { type: 'trial/vote', suspectId: 'vishnudatta' });
          s = act(s, 'raja-1', { type: 'trial/verdict', suspectId: 'vishnudatta' });
          break;
        case 'famine':
          s = act(s, loyal, { type: 'famine/pledge', gold: 80, grain: 60 });
          s = act(s, traitor, { type: 'famine/pledge', gold: 10, grain: 0 });
          s = act(s, traitor, { type: 'famine/divert', gold: 50, grain: 50 });
          s = act(s, 'tr-1', { type: 'famine/granary', amount: 200 });
          s = act(s, 'raja-1', { type: 'famine/seal' });
          break;
        case 'fort':
          if (task.stage === 'plan') {
            if (task.wave === 0) s = act(s, traitor, { type: 'fort/sabotage', gate: 1 });
            s = act(s, 'raja-1', { type: 'fort/allocate', allocation: [3, 3, 3, 3] });
            s = act(s, 'raja-1', { type: 'fort/hold' });
          } else {
            s = act(s, 'raja-1', { type: 'fort/hold' });
          }
          break;
        case 'sunset':
          if (task.stage === 'decree') {
            const def = content.tasks.tasks.find((t) => t.id === task.taskId)!;
            if (def.kind !== 'sunset') throw new Error();
            if (!s.loyalty.used) {
              s = act(s, 'raja-1', { type: 'loyalty/test', target: loyal });
              expect(viewFor(s, loyal, content).me.offer).toBeDefined();
              s = act(s, loyal, { type: 'loyalty/answer', accept: false });
            }
            s = act(s, 'raja-1', { type: 'sunset/edict', edictId: def.edicts[0].id });
          } else {
            s = act(s, 'raja-1', { type: 'sunset/accuse', target: traitor });
          }
          break;
      }
    }

    expect(s.status).toBe('ended');
    expect(seen.filter((x) => x.endsWith(':resolved')).length).toBe(15);
    expect(s.result!.traitorCaught).toBe(true);
    const tactics = new Set(s.log.map((e) => e.tactic).filter(Boolean));
    for (const t of ['bribery', 'false-intelligence', 'embezzlement', 'sabotage', 'loyalty-proven']) {
      expect(tactics).toContain(t);
    }
    const debrief = viewFor(s, loyal, content).debrief!;
    expect(debrief.traitor).toBe(traitor);
    expect(debrief.pledges.find((p) => p.identity === loyal)).toEqual({ identity: loyal, gold: 80, grain: 60 });
    expect(s.codexUnlocked).toContain('kautilya');
    expect(s.codexUnlocked).toContain('arthashastra-upadha');
  });

  it('keeps famine pledges and the true need secret until the carts leave', () => {
    let s = act(newGame(), 'raja-1', { type: 'start' });
    // Jump straight to the famine task.
    const famineIndex = content.tasks.days.flatMap((d) => d.tasks).findIndex((t) => t.taskId === 'famine');
    s = { ...s, taskIndex: famineIndex - 1, task: { ...s.task!, stage: 'resolved', resolvedAt: now } };
    s = act(s, 'raja-1', { type: 'advance' });
    expect(s.task!.kind).toBe('famine');
    s = act(s, 'mm-1', { type: 'famine/pledge', gold: 40, grain: 10 });
    const trView = viewFor(s, 'tr-1', content);
    expect(JSON.stringify(trView.task)).not.toContain('"pledges"');
    expect(trView.task && 'declared' in trView.task && trView.task.declared).toEqual({ gold: 40, grain: 10 });
    // No Sitadhyaksha in this court → the Mahamantri inherits the true need.
    expect(viewFor(s, 'mm-1', content).me.task.exactNeed).toBeDefined();
    expect(trView.me.task.exactNeed).toBeUndefined();
  });

  it('times out petitions by auto-assigning, then applying the timeout effects', () => {
    let s = act(newGame(), 'raja-1', { type: 'start' });
    const morale = s.stats.morale;
    now += 31_000;
    s = tick(s, ctx());
    expect(s.task).toMatchObject({ kind: 'petition', stage: 'active', assignee: 'mm-1' });
    now += 80_000;
    s = tick(s, ctx());
    expect(s.task!.stage).toBe('resolved');
    expect(s.stats.morale).toBe(morale - 4);
  });

  it('locks roles once play starts', () => {
    let s = act(newGame(), 'raja-1', { type: 'start' });
    s = syncPlayers(s, [...seats, { identity: 'x', name: 'Late', role: 'treasurer' }], ctx());
    expect(s.players.x).toBeUndefined();
    s = syncPlayers(s, [...seats, { identity: 'y', name: 'Late', role: 'spy' }], ctx());
    expect(s.players.y.role).toBe('spy');
  });
});
