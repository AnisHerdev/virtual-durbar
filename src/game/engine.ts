// The authoritative game engine. Pure functions over a plain-JSON GameState;
// only the host (the Raja's client) runs it. Clients send ClientActions and
// receive redacted ClientViews (see views.ts).

import { type Content, type RoleId, type StatDelta, type Stats, type TaskDef } from '../content/types';
import type {
  ClientAction,
  Duty,
  FamineRun,
  FortRun,
  GameState,
  LogEntry,
  PetitionRun,
  PlayerSeed,
  PlayerState,
  RiddleRun,
  SunsetRun,
  TaskRun,
  TrialRun,
} from './types';

export const ASSIGN_SECONDS = 30;
export const AUTO_ADVANCE_MS = 25_000;
export const WAVE_RESULT_MS = 9_000;
export const BRIBE_AMOUNT = 60;
export const LOYALTY_OFFER = 150;
export const SABOTAGE_TROOPS = 3;
export const PARLEY_REDUCTION = 3;
export const FORT_SUCCESS_HP = 40;

export interface EngineCtx {
  content: Content;
  now: number;
  timeScale: number;
}

export class ActionError extends Error {}
function fail(msg: string): never {
  throw new ActionError(msg);
}

// ── helpers ────────────────────────────────────────────────────────────────

/** mulberry32: small deterministic PRNG whose state lives in GameState. */
function random(state: GameState): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const ms = (ctx: EngineCtx, seconds: number) => Math.round(seconds * 1000 * ctx.timeScale);

function taskDef<K extends TaskDef['kind']>(ctx: EngineCtx, id: string, kind: K): Extract<TaskDef, { kind: K }> {
  const t = ctx.content.tasks.tasks.find((x) => x.id === id);
  if (!t || t.kind !== kind) throw new Error(`task ${id} is not a ${kind}`);
  return t as Extract<TaskDef, { kind: K }>;
}

export function scheduleAt(ctx: EngineCtx, index: number) {
  const flat = ctx.content.tasks.days.flatMap((d) => d.tasks.map((t) => ({ ...t, day: d.day })));
  return { entry: flat[index], total: flat.length };
}

export function playersList(state: GameState): PlayerState[] {
  return Object.values(state.players).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

const ROLE_ORDER: Record<RoleId, number> = {
  raja: 0,
  mahamantri: 1,
  treasurer: 2,
  senapati: 3,
  spy: 4,
  nyayadhish: 5,
  sitadhyaksha: 6,
};

export function holderOf(state: GameState, role: RoleId): string | undefined {
  return Object.values(state.players).find((p) => p.role === role && p.connected)?.identity
    ?? Object.values(state.players).find((p) => p.role === role)?.identity;
}

export function ministers(state: GameState): PlayerState[] {
  return playersList(state).filter((p) => p.role !== 'raja');
}

export function rajaId(state: GameState): string | undefined {
  return holderOf(state, 'raja');
}

const DUTY_CHAIN: Record<Duty, RoleId[]> = {
  spy: ['spy', 'mahamantri', 'nyayadhish', 'sitadhyaksha', 'treasurer', 'raja'],
  senapati: ['senapati', 'raja'],
  parley: ['mahamantri', 'nyayadhish', 'sitadhyaksha', 'treasurer'],
  reinforce: ['treasurer', 'raja'],
  granary: ['treasurer', 'raja'],
  knowsNeed: ['sitadhyaksha', 'mahamantri', 'raja'],
};

/** Who performs a mission duty, falling back when a role is not in court. */
export function dutyHolder(state: GameState, duty: Duty): string | undefined {
  for (const role of DUTY_CHAIN[duty]) {
    const id = holderOf(state, role);
    if (id) return id;
  }
  return undefined;
}

export function dutiesOf(state: GameState, identity: string): Duty[] {
  return (Object.keys(DUTY_CHAIN) as Duty[]).filter((d) => dutyHolder(state, d) === identity);
}

function applyEffects(state: GameState, effects: StatDelta | undefined) {
  if (!effects) return;
  for (const [k, v] of Object.entries(effects) as [keyof Stats, number][]) {
    let next = state.stats[k] + v;
    if (k === 'morale' || k === 'fort') next = Math.min(100, next);
    state.stats[k] = Math.max(0, Math.round(next));
  }
}

export function describeEffects(effects: StatDelta | undefined): string {
  if (!effects) return '';
  return Object.entries(effects)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k}`)
    .join(', ');
}

function unlock(state: GameState, codexId: string | undefined) {
  if (codexId && !state.codexUnlocked.includes(codexId)) state.codexUnlocked.push(codexId);
}

function log(state: GameState, ctx: EngineCtx, entry: Omit<LogEntry, 'id' | 'at' | 'day' | 'phase'>) {
  state.log.push({ id: state.nextId++, at: ctx.now, day: state.day, phase: state.phase, ...entry });
}

const nameOf = (state: GameState, id: string | undefined) => (id && state.players[id]?.name) || 'Someone';

// ── lifecycle ──────────────────────────────────────────────────────────────

export function createGame(seed: number, ctx: EngineCtx): GameState {
  return {
    version: 1,
    status: 'lobby',
    seed,
    rngState: seed,
    day: 0,
    phase: 'lobby',
    taskIndex: -1,
    stats: { ...ctx.content.tasks.startingStats },
    players: {},
    traitor: null,
    task: null,
    log: [],
    nextId: 1,
    loyalty: { used: false },
    codexUnlocked: [],
  };
}

/** Reconciles the roster with who is in the room. Roles are locked once play starts. */
export function syncPlayers(state: GameState, seeds: PlayerSeed[], ctx: EngineCtx): GameState {
  const next = structuredClone(state);
  const present = new Set(seeds.map((s) => s.identity));
  for (const seed of seeds) {
    const existing = next.players[seed.identity];
    if (existing) {
      existing.connected = true;
      existing.name = seed.name;
      if (next.status === 'lobby') existing.role = seed.role;
    } else {
      const taken = next.status !== 'lobby' && Object.values(next.players).some((p) => p.role === seed.role);
      if (taken) continue; // a role already held in this game cannot be re-seated by someone new
      next.players[seed.identity] = {
        ...seed,
        purse: { ...ctx.content.tasks.startingPurse },
        connected: true,
      };
      if (next.status === 'playing') log(next, ctx, { public: `${seed.name} joins the court.` });
    }
  }
  for (const p of Object.values(next.players)) {
    if (!present.has(p.identity)) {
      if (next.status === 'lobby') delete next.players[p.identity];
      else p.connected = false;
    }
  }
  return next;
}

function startGame(state: GameState, ctx: EngineCtx) {
  if (!rajaId(state)) fail('A Raja or Rani must take the throne first.');
  state.status = 'playing';
  state.startedAt = ctx.now;
  state.stats = { ...ctx.content.tasks.startingStats };
  for (const p of Object.values(state.players)) p.purse = { ...ctx.content.tasks.startingPurse };
  const mins = ministers(state);
  // One secret traitor among ministers; a lone minister is a traitor half the time.
  const traitorOdds = mins.length >= 2 ? 1 : mins.length === 1 ? 0.5 : 0;
  state.traitor = random(state) < traitorOdds ? mins[Math.floor(random(state) * mins.length)].identity : null;
  log(state, ctx, {
    public: 'The court is assembled. Three days of rule begin.',
    hidden: state.traitor
      ? `${nameOf(state, state.traitor)} was secretly in the pay of a rival kingdom.`
      : 'There was no traitor in this court — every suspicion was misplaced.',
    actor: state.traitor ?? undefined,
  });
  enterTask(state, 0, ctx);
}

function enterTask(state: GameState, index: number, ctx: EngineCtx) {
  const { entry, total } = scheduleAt(ctx, index);
  if (index >= total || !entry) return endGame(state, ctx);
  state.taskIndex = index;
  state.day = entry.day;
  state.phase = entry.phase;
  const def = ctx.content.tasks.tasks.find((t) => t.id === entry.taskId)!;
  const base = { taskId: def.id };
  let run: TaskRun;
  switch (def.kind) {
    case 'petition': {
      const p: PetitionRun = { ...base, kind: 'petition', stage: 'assign', deadline: ctx.now + ms(ctx, ASSIGN_SECONDS) };
      run = p;
      if (!ministers(state).length) {
        p.assignee = rajaId(state);
        p.stage = 'active';
        p.deadline = ctx.now + ms(ctx, def.seconds);
      }
      break;
    }
    case 'riddle':
      run = { ...base, kind: 'riddle', stage: 'active', deadline: ctx.now + ms(ctx, def.seconds), lockedOut: [] };
      break;
    case 'trial':
      run = {
        ...base,
        kind: 'trial',
        stage: 'active',
        deadline: ctx.now + ms(ctx, def.seconds),
        dealt: dealClues(state, def.clues),
        reports: [],
        votes: {},
      };
      break;
    case 'famine': {
      const n = Object.values(state.players).filter((p) => p.connected).length;
      run = {
        ...base,
        kind: 'famine',
        stage: 'active',
        deadline: ctx.now + ms(ctx, def.seconds),
        need: { gold: def.need.gold + def.needPerPlayer.gold * n, grain: def.need.grain + def.needPerPlayer.grain * n },
        pledges: {},
        granary: 0,
        diverted: { gold: 0, grain: 0 },
      };
      break;
    }
    case 'fort': {
      const even = Math.floor(def.troopsPerWave / def.gates.length);
      const allocation = def.gates.map(() => even);
      allocation[0] += def.troopsPerWave - even * def.gates.length;
      run = {
        ...base,
        kind: 'fort',
        stage: 'plan',
        deadline: ctx.now + ms(ctx, def.secondsPerWave),
        wave: 0,
        allocation,
        reinforcements: 0,
        parleyed: false,
        dispatches: [],
        results: [],
        fortHp: state.stats.fort,
      };
      break;
    }
    case 'sunset':
      run = { ...base, kind: 'sunset', stage: 'decree' };
      break;
  }
  state.task = run;
  log(state, ctx, { public: `Day ${state.day}, ${state.phase}: ${def.title}.` });
}

/** Each player receives their role's clue; clues for empty seats are dealt round-robin. */
function dealClues(state: GameState, clues: { id: string; role: RoleId }[]): Record<string, string[]> {
  const dealt: Record<string, string[]> = {};
  const players = playersList(state).filter((p) => p.connected);
  if (!players.length) return dealt;
  for (const p of players) dealt[p.identity] = [];
  const orphans: string[] = [];
  for (const clue of clues) {
    const holder = players.find((p) => p.role === clue.role);
    if (holder) dealt[holder.identity].push(clue.id);
    else orphans.push(clue.id);
  }
  // Give orphaned clues to whoever holds the fewest, ministers first.
  for (const id of orphans) {
    const target = [...players].sort(
      (a, b) => dealt[a.identity].length - dealt[b.identity].length || (a.role === 'raja' ? 1 : 0) - (b.role === 'raja' ? 1 : 0),
    )[0];
    dealt[target.identity].push(id);
  }
  return dealt;
}

function resolveTask(state: GameState, ctx: EngineCtx) {
  if (state.task) {
    state.task.stage = 'resolved';
    state.task.resolvedAt = ctx.now;
    state.task.deadline = undefined;
  }
}

function advance(state: GameState, ctx: EngineCtx) {
  if (state.loyalty.status === 'offered') {
    state.loyalty.status = 'ignored';
    log(state, ctx, { hidden: `${nameOf(state, state.loyalty.target)} never answered the envoy's offer.` });
  }
  enterTask(state, state.taskIndex + 1, ctx);
}

function prosperityOf(stats: Stats): number {
  return Math.round(stats.morale * 2 + stats.gold / 10 + stats.grain / 10 + stats.troops + stats.workers / 4 + stats.fort);
}

function endGame(state: GameState, ctx: EngineCtx) {
  state.status = 'ended';
  state.phase = 'debrief';
  state.task = null;
  unlock(state, 'kautilya');
  const prosperity = prosperityOf(state.stats);
  const title =
    prosperity >= 480 ? 'A Golden Age' : prosperity >= 400 ? 'A Stable Realm' : prosperity >= 320 ? 'A Troubled Kingdom' : 'A Fallen Realm';
  const caught = !!state.traitor && state.accusation?.target === state.traitor;
  const verdict = state.traitor
    ? caught
      ? `The traitor ${nameOf(state, state.traitor)} was unmasked and exiled.`
      : `The traitor ${nameOf(state, state.traitor)} escaped with their secret.`
    : 'The court held no traitor.';
  state.result = { prosperity, title, verdict, traitor: state.traitor, traitorCaught: caught };
  log(state, ctx, { public: `The three days are done: ${title}. ${verdict}` });
}

// ── actions ────────────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: ClientAction, actor: string, ctx: EngineCtx): GameState {
  const s = structuredClone(state);
  const me = s.players[actor];
  const isRaja = me?.role === 'raja';
  const isTraitor = !!me && s.traitor === actor;
  const requireRaja = () => void (isRaja || fail('Only the Raja may do that.'));

  if (action.type === 'restart') {
    requireRaja();
    const fresh = createGame(Math.floor(ctx.now % 2147483647), ctx);
    fresh.players = Object.fromEntries(
      Object.values(s.players).filter((p) => p.connected).map((p) => [p.identity, { ...p, purse: { ...ctx.content.tasks.startingPurse } }]),
    );
    return fresh;
  }
  if (!me) fail('You are not seated in this court.');

  if (action.type === 'start') {
    requireRaja();
    if (s.status !== 'lobby') fail('The game has already begun.');
    startGame(s, ctx);
    return s;
  }
  if (s.status !== 'playing' || !s.task) fail('No task is in progress.');
  const task = s.task!;

  // Loyalty test can happen at any sunset, independently of the edict.
  if (action.type === 'loyalty/test') {
    requireRaja();
    if (task.kind !== 'sunset') fail('The Loyalty Test may only be set at sunset.');
    if (s.loyalty.used) fail('The Loyalty Test has already been used this game.');
    const target = s.players[action.target];
    if (!target || target.role === 'raja') fail('Choose a minister to test.');
    s.loyalty = { used: true, target: action.target, status: 'offered', day: s.day };
    unlock(s, 'arthashastra-upadha');
    log(s, ctx, { hidden: `The Raja secretly tested ${target!.name} with a false bribe of ${LOYALTY_OFFER} gold.` });
    return s;
  }
  if (action.type === 'loyalty/answer') {
    if (s.loyalty.status !== 'offered' || s.loyalty.target !== actor) fail('No offer awaits you.');
    s.loyalty.status = action.accept ? 'accepted' : 'refused';
    log(s, ctx, {
      hidden: action.accept
        ? `${me!.name} accepted the foreign envoy's bribe — not knowing it was the Raja's test.`
        : `${me!.name} refused the foreign envoy's bribe.`,
      actor,
      tactic: action.accept ? 'susceptible-to-bribe' : 'loyalty-proven',
    });
    return s;
  }

  if (action.type === 'advance') {
    requireRaja();
    if (task.stage !== 'resolved') fail('Finish the current task first.');
    advance(s, ctx);
    return s;
  }

  switch (task.kind) {
    case 'petition':
      petitionAction(s, task, action, actor, isRaja, isTraitor, ctx);
      break;
    case 'riddle':
      riddleAction(s, task, action, actor, ctx);
      break;
    case 'trial':
      trialAction(s, task, action, actor, isRaja, isTraitor, ctx);
      break;
    case 'famine':
      famineAction(s, task, action, actor, isRaja, isTraitor, ctx);
      break;
    case 'fort':
      fortAction(s, task, action, actor, isTraitor, ctx);
      break;
    case 'sunset':
      sunsetAction(s, task, action, isRaja, ctx);
      break;
  }
  return s;
}

function petitionAction(
  s: GameState,
  task: PetitionRun,
  action: ClientAction,
  actor: string,
  isRaja: boolean,
  isTraitor: boolean,
  ctx: EngineCtx,
) {
  const def = taskDef(ctx, task.taskId, 'petition');
  if (action.type === 'petition/assign') {
    if (!isRaja) fail('Only the Raja assigns petitions.');
    if (task.stage !== 'assign') fail('This petition is already assigned.');
    const p = s.players[action.assignee];
    if (!p || (p.role === 'raja' && ministers(s).length)) fail('Assign the petition to a minister.');
    task.assignee = action.assignee;
    task.stage = 'active';
    task.deadline = ctx.now + ms(ctx, def.seconds);
    log(s, ctx, { public: `The Raja entrusts "${def.title}" to ${p!.name}.` });
    return;
  }
  if (action.type === 'petition/choose') {
    if (task.stage !== 'active') fail('This petition is not awaiting judgement.');
    if (task.assignee !== actor) fail('This petition was entrusted to someone else.');
    const option = def.options.find((o) => o.id === action.optionId) ?? fail('Unknown option.');
    if (action.bribe) {
      if (!isTraitor) fail('No one has offered you a bribe.');
      if (option.id !== bribeOptionFor(s, task, ctx)) fail('The briber wanted a different ruling.');
      s.players[actor].purse.gold += BRIBE_AMOUNT;
      task.bribed = true;
      log(s, ctx, {
        hidden: `${nameOf(s, actor)} took ${BRIBE_AMOUNT} gold to rule "${option.label}" on "${def.title}".`,
        actor,
        tactic: 'bribery',
      });
    }
    task.choice = option.id;
    task.success = def.mode === 'puzzle' ? !!option.correct : (option.wisdom ?? 0) >= 2;
    task.outcome = option.outcome;
    applyEffects(s, option.effects);
    if (task.success) unlock(s, def.codexId);
    log(s, ctx, {
      public: `${nameOf(s, actor)} rules: "${option.label}". ${describeEffects(option.effects)}`,
      actor,
    });
    resolveTask(s, ctx);
    return;
  }
  fail('That action does not fit a petition.');
}

/** The ruling a briber would pay for: a wrong answer, or the least wise policy. */
export function bribeOptionFor(s: GameState, task: PetitionRun, ctx: EngineCtx): string {
  const def = taskDef(ctx, task.taskId, 'petition');
  const candidates =
    def.mode === 'puzzle'
      ? def.options.filter((o) => !o.correct)
      : [...def.options].sort((a, b) => (a.wisdom ?? 0) - (b.wisdom ?? 0)).slice(0, 1);
  // Stable per game and task so the offer doesn't change between renders.
  const h = [...task.taskId].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, s.seed);
  return candidates[Math.abs(h) % candidates.length].id;
}

function riddleAction(s: GameState, task: RiddleRun, action: ClientAction, actor: string, ctx: EngineCtx) {
  if (action.type !== 'riddle/answer') return fail('That action does not fit a riddle.');
  const def = taskDef(ctx, task.taskId, 'riddle');
  if (task.stage !== 'active') fail('The riddle is already settled.');
  const player = s.players[actor];
  if (player.role === 'raja' && ministers(s).length) fail('The Raja poses the riddle; ministers answer it.');
  if (task.lockedOut.includes(actor)) fail('You have already answered wrongly.');
  if (action.optionId === def.answerId) {
    task.winner = actor;
    player.purse.gold += def.goldBonus;
    unlock(s, def.codexId);
    log(s, ctx, { public: `${player.name} answers first and wins ${def.goldBonus} gold!`, actor });
    resolveTask(s, ctx);
  } else {
    task.lockedOut.push(actor);
    log(s, ctx, { public: `${player.name} answers wrongly and falls silent.`, actor });
    const eligible = Object.values(s.players).filter((p) => p.connected && (p.role !== 'raja' || !ministers(s).length));
    if (eligible.every((p) => task.lockedOut.includes(p.identity))) resolveTask(s, ctx);
  }
}

export const FORGED_REPORT = (suspect: string) =>
  `A watchman swears he saw ${suspect} slipping out of the vault passage at the third watch.`;

function trialAction(
  s: GameState,
  task: TrialRun,
  action: ClientAction,
  actor: string,
  isRaja: boolean,
  isTraitor: boolean,
  ctx: EngineCtx,
) {
  const def = taskDef(ctx, task.taskId, 'trial');
  if (task.stage !== 'active') fail('The trial is over.');
  const suspect = (id: string) => def.suspects.find((x) => x.id === id) ?? fail('Unknown suspect.');
  switch (action.type) {
    case 'trial/vote': {
      if (isRaja) fail('The Raja pronounces the verdict; ministers vote.');
      suspect(action.suspectId);
      task.votes[actor] = action.suspectId;
      return;
    }
    case 'trial/forge': {
      if (!isTraitor) fail('You have no forged report to plant.');
      if (task.reports.some((r) => r.forged)) fail('You have already planted a report.');
      const sus = suspect(action.suspectId);
      task.reports.push({ id: s.nextId++, by: actor, suspectId: sus.id, text: FORGED_REPORT(sus.name), forged: true });
      log(s, ctx, {
        public: `${nameOf(s, actor)} lays a new report before the court implicating ${sus.name}.`,
        hidden: `The report was forged by ${nameOf(s, actor)} to frame ${sus.name}.`,
        actor,
        tactic: 'false-intelligence',
      });
      return;
    }
    case 'trial/verdict': {
      if (!isRaja) fail('Only the Raja pronounces the verdict.');
      settleTrial(s, task, action.suspectId, ctx);
      return;
    }
    default:
      fail('That action does not fit the trial.');
  }
}

function settleTrial(s: GameState, task: TrialRun, suspectId: string | undefined, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'trial');
  task.verdict = suspectId;
  task.success = suspectId === def.culpritId;
  const branch = task.success ? def.success : def.failure;
  applyEffects(s, branch.effects);
  if (task.success) unlock(s, def.codexId);
  const name = def.suspects.find((x) => x.id === suspectId)?.name;
  log(s, ctx, {
    public: name ? `The Raja finds ${name} guilty. ${branch.outcome}` : `No verdict was reached in time. ${branch.outcome}`,
  });
  resolveTask(s, ctx);
}

function famineAction(
  s: GameState,
  task: FamineRun,
  action: ClientAction,
  actor: string,
  isRaja: boolean,
  isTraitor: boolean,
  ctx: EngineCtx,
) {
  const def = taskDef(ctx, task.taskId, 'famine');
  if (task.stage !== 'active') fail('The relief carts have already left.');
  const purse = s.players[actor].purse;
  const whole = (n: number) => Math.max(0, Math.floor(Number(n) || 0));
  switch (action.type) {
    case 'famine/pledge': {
      const gold = whole(action.gold);
      const grain = whole(action.grain);
      if (gold > purse.gold || grain > purse.grain) fail('You cannot pledge more than your purse holds.');
      const first = !task.pledges[actor];
      task.pledges[actor] = { gold, grain };
      if (first) log(s, ctx, { public: `${nameOf(s, actor)} seals a pledge for the relief carts.`, actor });
      return;
    }
    case 'famine/granary': {
      if (dutyHolder(s, 'granary') !== actor) fail('Only the Treasurer may open the royal granary.');
      task.granary = Math.min(whole(action.amount), def.maxGranaryRelease, s.stats.grain);
      return;
    }
    case 'famine/divert': {
      if (!isTraitor) fail('You have no agents among the carters.');
      task.diverted = { gold: Math.min(whole(action.gold), def.maxDivert), grain: Math.min(whole(action.grain), def.maxDivert), by: actor };
      return;
    }
    case 'famine/seal': {
      if (!isRaja) fail('Only the Raja may send the carts early.');
      settleFamine(s, task, ctx);
      return;
    }
    default:
      fail('That action does not fit the famine.');
  }
}

function settleFamine(s: GameState, task: FamineRun, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'famine');
  let gold = 0;
  let grain = 0;
  s.pledgeLedger = [];
  for (const [id, pledge] of Object.entries(task.pledges)) {
    const purse = s.players[id]?.purse;
    if (!purse) continue;
    const g = Math.min(pledge.gold, purse.gold);
    const r = Math.min(pledge.grain, purse.grain);
    purse.gold -= g;
    purse.grain -= r;
    gold += g;
    grain += r;
    s.pledgeLedger.push({ identity: id, gold: g, grain: r });
  }
  s.stats.grain -= task.granary;
  grain += task.granary;
  const stolenGold = Math.min(task.diverted.gold, gold);
  const stolenGrain = Math.min(task.diverted.grain, grain);
  gold -= stolenGold;
  grain -= stolenGrain;
  if (task.diverted.by && (stolenGold || stolenGrain)) {
    const purse = s.players[task.diverted.by].purse;
    purse.gold += stolenGold;
    purse.grain += stolenGrain;
    log(s, ctx, {
      hidden: `${nameOf(s, task.diverted.by)} diverted ${stolenGold} gold and ${stolenGrain} grain from the relief carts.`,
      actor: task.diverted.by,
      tactic: 'embezzlement',
    });
  }
  task.delivered = { gold, grain };
  task.success = gold >= task.need.gold && grain >= task.need.grain;
  const branch = task.success ? def.success : def.failure;
  applyEffects(s, branch.effects);
  if (task.success) unlock(s, def.codexId);
  log(s, ctx, {
    public: `The carts leave carrying ${gold} gold and ${grain} grain against a need of ${task.need.gold} gold and ${task.need.grain} grain. ${branch.outcome}`,
  });
  resolveTask(s, ctx);
}

function fortAction(s: GameState, task: FortRun, action: ClientAction, actor: string, isTraitor: boolean, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'fort');
  const isRaja = s.players[actor].role === 'raja';
  if (action.type === 'fort/hold' && task.stage === 'wave-result') {
    // "Next wave" from the result screen.
    if (!isRaja && dutyHolder(s, 'senapati') !== actor) fail('Only the Senapati or Raja can call the next wave.');
    return nextWave(s, task, ctx);
  }
  if (task.stage !== 'plan') fail('The wave has already struck.');
  const gates = def.gates.length;
  switch (action.type) {
    case 'fort/allocate': {
      if (dutyHolder(s, 'senapati') !== actor) fail('Only the Senapati commands the troops.');
      const alloc = action.allocation.slice(0, gates).map((n) => Math.max(0, Math.floor(Number(n) || 0)));
      while (alloc.length < gates) alloc.push(0);
      if (alloc.reduce((a, b) => a + b, 0) > def.troopsPerWave + task.reinforcements) fail('Not enough troops.');
      task.allocation = alloc;
      return;
    }
    case 'fort/dispatch': {
      if (dutyHolder(s, 'spy') !== actor) fail('Only the Spy Chief sends dispatches.');
      const estimates = action.estimates.slice(0, gates).map((n) => Math.max(0, Math.floor(Number(n) || 0)));
      task.dispatches.push({ id: s.nextId++, by: actor, estimates });
      const truth = currentEnemies(task, def);
      const off = estimates.reduce((sum, e, i) => sum + Math.abs(e - (truth[i] ?? 0)), 0);
      log(s, ctx, {
        public: `${nameOf(s, actor)} sends a dispatch: ${def.gates.map((g, i) => `${g} ${estimates[i]}`).join(', ')}.`,
        hidden: isTraitor && off >= 3 ? `The dispatch was deliberately false — the true numbers were ${truth.join(', ')}.` : undefined,
        actor,
        tactic: isTraitor && off >= 3 ? 'false-intelligence' : undefined,
      });
      return;
    }
    case 'fort/parley': {
      if (dutyHolder(s, 'parley') !== actor) fail('Only the Mahamantri may parley.');
      if (task.parleyed) fail('The envoys have already been received this wave.');
      task.parleyed = true;
      log(s, ctx, { public: `${nameOf(s, actor)} parleys with the enemy envoys; their largest host wavers.`, actor });
      return;
    }
    case 'fort/reinforce': {
      if (dutyHolder(s, 'reinforce') !== actor) fail('Only the Treasurer pays for reinforcements.');
      if (task.reinforcements >= def.maxReinforcements) fail('No more mercenaries can be found this wave.');
      if (s.stats.gold < def.reinforcementCost) fail('The treasury is empty.');
      s.stats.gold -= def.reinforcementCost;
      task.reinforcements++;
      log(s, ctx, { public: `${nameOf(s, actor)} pays ${def.reinforcementCost} gold for a mercenary company.`, actor });
      return;
    }
    case 'fort/sabotage': {
      if (!isTraitor) fail('You have no gatekeeper in your pay.');
      if (task.sabotage) fail('Your gatekeeper has already been used.');
      if (action.gate < 0 || action.gate >= gates) fail('Unknown gate.');
      task.sabotage = { by: actor, gate: action.gate, wave: task.wave };
      return;
    }
    case 'fort/hold': {
      if (!isRaja && dutyHolder(s, 'senapati') !== actor) fail('Only the Senapati or Raja can sound the drums.');
      return resolveWave(s, task, ctx);
    }
    default:
      fail('That action does not fit the siege.');
  }
}

export function currentEnemies(task: FortRun, def: Extract<TaskDef, { kind: 'fort' }>): number[] {
  const enemies = [...(def.waves[task.wave] ?? [])];
  if (task.parleyed) {
    const max = enemies.indexOf(Math.max(...enemies));
    enemies[max] = Math.max(0, enemies[max] - PARLEY_REDUCTION);
  }
  return enemies;
}

function resolveWave(s: GameState, task: FortRun, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'fort');
  const raw = def.waves[task.wave];
  const enemies = currentEnemies(task, def);
  const parleyGate = task.parleyed ? raw.indexOf(Math.max(...raw)) : undefined;
  const defended = [...task.allocation];
  const sab = task.sabotage?.wave === task.wave ? task.sabotage : undefined;
  if (sab) {
    defended[sab.gate] = Math.max(0, defended[sab.gate] - SABOTAGE_TROOPS);
    log(s, ctx, {
      hidden: `${nameOf(s, sab.by)} bribed the ${def.gates[sab.gate]} gatekeeper, pulling ${SABOTAGE_TROOPS} defenders from the wall.`,
      actor: sab.by,
      tactic: 'sabotage',
    });
  }
  const breaches = enemies.reduce((sum, e, i) => sum + Math.max(0, e - (defended[i] ?? 0)), 0);
  const damage = breaches * def.damagePerBreach;
  task.fortHp = Math.max(0, task.fortHp - damage);
  task.results.push({ enemies, defended, breaches, damage, parleyGate });
  const held = def.gates.filter((_, i) => (defended[i] ?? 0) >= enemies[i]);
  log(s, ctx, {
    public:
      breaches === 0
        ? `Wave ${task.wave + 1} breaks against every gate. The fort stands unharmed.`
        : `Wave ${task.wave + 1}: ${breaches} enemy companies break through (${held.length}/${def.gates.length} gates held). The fort takes ${damage} damage.`,
  });
  task.stage = 'wave-result';
  task.deadline = ctx.now + Math.round(WAVE_RESULT_MS * ctx.timeScale);
}

function nextWave(s: GameState, task: FortRun, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'fort');
  if (task.wave + 1 >= def.waves.length || task.fortHp <= 0) {
    task.success = task.fortHp > FORT_SUCCESS_HP;
    s.stats.fort = task.fortHp;
    const branch = task.success ? def.success : def.failure;
    applyEffects(s, branch.effects);
    if (task.success) unlock(s, def.codexId);
    log(s, ctx, { public: branch.outcome });
    resolveTask(s, ctx);
    return;
  }
  task.wave++;
  task.stage = 'plan';
  task.parleyed = false;
  task.reinforcements = 0;
  task.dispatches = [];
  const total = task.allocation.reduce((a, b) => a + b, 0);
  if (total > def.troopsPerWave) {
    // Mercenaries leave after each wave; trim from the largest gates.
    let excess = total - def.troopsPerWave;
    while (excess-- > 0) task.allocation[task.allocation.indexOf(Math.max(...task.allocation))]--;
  }
  task.deadline = ctx.now + ms(ctx, def.secondsPerWave);
}

function sunsetAction(s: GameState, task: SunsetRun, action: ClientAction, isRaja: boolean, ctx: EngineCtx) {
  const def = taskDef(ctx, task.taskId, 'sunset');
  if (!isRaja) fail('Only the Raja issues edicts.');
  const finalDay = s.day === ctx.content.tasks.days.length;
  if (action.type === 'sunset/edict') {
    if (task.stage !== 'decree') fail('The edict has been issued.');
    const edict = def.edicts.find((e) => e.id === action.edictId) ?? fail('Unknown edict.');
    task.edictId = edict.id;
    applyEffects(s, edict.effects);
    unlock(s, edict.codexId);
    log(s, ctx, { public: `Edict: ${edict.label}. ${describeEffects(edict.effects)}` });
    if (finalDay) task.stage = 'accuse';
    else resolveTask(s, ctx);
    return;
  }
  if (action.type === 'sunset/accuse') {
    if (task.stage !== 'accuse') fail('There is no accusation to make now.');
    const target = action.target ? s.players[action.target] : null;
    if (action.target && (!target || target.role === 'raja')) fail('Accuse a minister, or no one.');
    const correct = !!target && target.identity === s.traitor;
    task.accusation = { target: action.target, correct };
    s.accusation = task.accusation;
    if (target) {
      if (correct) {
        applyEffects(s, { morale: 10 });
        log(s, ctx, { public: `The Raja names ${target.name} a traitor.`, hidden: `${target.name} was indeed the traitor.` });
      } else {
        applyEffects(s, { morale: -10 });
        log(s, ctx, { public: `The Raja names ${target.name} a traitor.`, hidden: `${target.name} was loyal — the accusation was false.` });
      }
    } else {
      log(s, ctx, { public: 'The Raja names no traitor.' });
    }
    resolveTask(s, ctx);
    return;
  }
  fail('That action does not fit the sunset court.');
}

// ── timers ─────────────────────────────────────────────────────────────────

/** Applies deadline-driven transitions. Returns the same object if nothing changed. */
export function tick(state: GameState, ctx: EngineCtx): GameState {
  const task = state.task;
  if (state.status !== 'playing' || !task) return state;
  if (task.stage === 'resolved') {
    if (task.resolvedAt && ctx.now - task.resolvedAt >= AUTO_ADVANCE_MS * ctx.timeScale) {
      const s = structuredClone(state);
      advance(s, ctx);
      return s;
    }
    return state;
  }
  if (!task.deadline || ctx.now < task.deadline) return state;

  const s = structuredClone(state);
  const t = s.task!;
  switch (t.kind) {
    case 'petition': {
      const def = taskDef(ctx, t.taskId, 'petition');
      if (t.stage === 'assign') {
        const assignee = holderOf(s, def.suggestedRole) ?? ministers(s)[0]?.identity ?? rajaId(s);
        t.assignee = assignee && s.players[assignee].role === 'raja' && ministers(s).length ? ministers(s)[0].identity : assignee;
        t.stage = 'active';
        t.deadline = ctx.now + ms(ctx, def.seconds);
        log(s, ctx, { public: `The petition falls to ${nameOf(s, t.assignee)} by custom.` });
      } else {
        t.success = false;
        t.outcome = 'No ruling was given. The petitioner leaves the court in despair.';
        applyEffects(s, def.timeoutEffects);
        log(s, ctx, { public: `No ruling on "${def.title}". ${describeEffects(def.timeoutEffects)}` });
        resolveTask(s, ctx);
      }
      break;
    }
    case 'riddle':
      log(s, ctx, { public: 'The sand runs out; no one solves the riddle.' });
      resolveTask(s, ctx);
      break;
    case 'trial': {
      const tally = new Map<string, number>();
      for (const v of Object.values(t.votes)) tally.set(v, (tally.get(v) ?? 0) + 1);
      const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      const plurality = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : undefined;
      settleTrial(s, t, plurality, ctx);
      break;
    }
    case 'famine':
      settleFamine(s, t, ctx);
      break;
    case 'fort':
      if (t.stage === 'plan') resolveWave(s, t, ctx);
      else nextWave(s, t, ctx);
      break;
    case 'sunset':
      break;
  }
  return s;
}
