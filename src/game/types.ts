import type { Phase, RoleId, StatDelta, Stats, TacticId } from '../content/types';

export type GameStatus = 'lobby' | 'playing' | 'ended';
export type AnyPhase = Phase | 'lobby' | 'debrief';

export interface Purse {
  gold: number;
  grain: number;
}

export interface PlayerState {
  identity: string;
  name: string;
  role: RoleId;
  purse: Purse;
  connected: boolean;
}

export interface LogEntry {
  id: number;
  at: number;
  day: number;
  phase: AnyPhase;
  /** Shown live to everyone. */
  public?: string;
  /** The hidden truth, revealed only in the Kautilya's Lens debrief. */
  hidden?: string;
  actor?: string;
  tactic?: TacticId;
}

// ── Task runtimes (host-side, contain secrets) ─────────────────────────────

export interface PetitionRun {
  kind: 'petition';
  taskId: string;
  stage: 'assign' | 'active' | 'resolved';
  deadline?: number;
  assignee?: string;
  choice?: string;
  bribed?: boolean; // secret
  success?: boolean;
  outcome?: string;
  resolvedAt?: number;
}

export interface RiddleRun {
  kind: 'riddle';
  taskId: string;
  stage: 'active' | 'resolved';
  deadline?: number;
  lockedOut: string[];
  winner?: string;
  resolvedAt?: number;
}

export interface TrialReport {
  id: number;
  by: string;
  suspectId: string;
  text: string;
  forged: boolean; // secret
}

export interface TrialRun {
  kind: 'trial';
  taskId: string;
  stage: 'active' | 'resolved';
  deadline?: number;
  dealt: Record<string, string[]>; // secret: identity → clue ids
  reports: TrialReport[];
  votes: Record<string, string>;
  verdict?: string;
  success?: boolean;
  resolvedAt?: number;
}

export interface FamineRun {
  kind: 'famine';
  taskId: string;
  stage: 'active' | 'resolved';
  deadline?: number;
  need: Purse; // secret except to the agriculture minister
  pledges: Record<string, Purse>; // secret amounts
  granary: number;
  diverted: Purse & { by?: string }; // secret
  delivered?: Purse;
  success?: boolean;
  resolvedAt?: number;
}

export interface WaveResult {
  enemies: number[];
  defended: number[];
  breaches: number;
  damage: number;
  parleyGate?: number;
}

export interface FortDispatch {
  id: number;
  by: string;
  estimates: number[];
}

export interface FortRun {
  kind: 'fort';
  taskId: string;
  stage: 'plan' | 'wave-result' | 'resolved';
  deadline?: number;
  wave: number;
  allocation: number[];
  reinforcements: number;
  parleyed: boolean;
  dispatches: FortDispatch[];
  sabotage?: { by: string; gate: number; wave: number }; // secret
  results: WaveResult[];
  fortHp: number;
  success?: boolean;
  resolvedAt?: number;
}

export interface SunsetRun {
  kind: 'sunset';
  taskId: string;
  stage: 'decree' | 'accuse' | 'resolved';
  deadline?: number;
  edictId?: string;
  accusation?: { target: string | null; correct: boolean };
  resolvedAt?: number;
}

export type TaskRun = PetitionRun | RiddleRun | TrialRun | FamineRun | FortRun | SunsetRun;

export interface LoyaltyTest {
  used: boolean;
  target?: string;
  status?: 'offered' | 'accepted' | 'refused' | 'ignored';
  day?: number;
}

export interface EndResult {
  prosperity: number;
  title: string;
  verdict: string;
  traitor: string | null;
  traitorCaught: boolean;
}

export interface GameState {
  version: 1;
  status: GameStatus;
  seed: number;
  rngState: number;
  day: number;
  phase: AnyPhase;
  taskIndex: number;
  stats: Stats;
  players: Record<string, PlayerState>;
  traitor: string | null; // secret
  task: TaskRun | null;
  log: LogEntry[];
  nextId: number;
  loyalty: LoyaltyTest;
  codexUnlocked: string[];
  accusation?: { target: string | null; correct: boolean };
  /** Famine pledges as actually delivered; secret until the debrief. */
  pledgeLedger?: { identity: string; gold: number; grain: number }[];
  result?: EndResult;
  startedAt?: number;
}

// ── Actions (client → host) ────────────────────────────────────────────────

export type ClientAction =
  | { type: 'start' }
  | { type: 'advance' }
  | { type: 'restart' }
  | { type: 'petition/assign'; assignee: string }
  | { type: 'petition/choose'; optionId: string; bribe?: boolean }
  | { type: 'riddle/answer'; optionId: string }
  | { type: 'trial/vote'; suspectId: string }
  | { type: 'trial/forge'; suspectId: string }
  | { type: 'trial/verdict'; suspectId: string }
  | { type: 'famine/pledge'; gold: number; grain: number }
  | { type: 'famine/granary'; amount: number }
  | { type: 'famine/divert'; gold: number; grain: number }
  | { type: 'famine/seal' }
  | { type: 'fort/allocate'; allocation: number[] }
  | { type: 'fort/dispatch'; estimates: number[] }
  | { type: 'fort/parley' }
  | { type: 'fort/reinforce' }
  | { type: 'fort/sabotage'; gate: number }
  | { type: 'fort/hold' }
  | { type: 'sunset/edict'; edictId: string }
  | { type: 'sunset/accuse'; target: string | null }
  | { type: 'loyalty/test'; target: string }
  | { type: 'loyalty/answer'; accept: boolean };

export interface PlayerSeed {
  identity: string;
  name: string;
  role: RoleId;
}

export type Duty = 'spy' | 'senapati' | 'parley' | 'reinforce' | 'granary' | 'knowsNeed';

// ── Views (host → each client; secrets stripped) ───────────────────────────

export interface PublicPlayer {
  identity: string;
  name: string;
  role: RoleId;
  connected: boolean;
}

export type PublicTask =
  | Omit<PetitionRun, 'bribed'>
  | RiddleRun
  | (Omit<TrialRun, 'dealt' | 'reports'> & { reports: Omit<TrialReport, 'forged'>[] })
  | (Omit<FamineRun, 'need' | 'pledges' | 'diverted'> & {
      pledgedBy: string[];
      declared: Purse;
    })
  | Omit<FortRun, 'sabotage'>
  | SunsetRun;

export interface PrivateTask {
  bribeOffer?: { amount: number; optionId: string };
  clues?: string[];
  canForge?: boolean;
  exactNeed?: Purse;
  myPledge?: Purse;
  canDivert?: { max: number; current: Purse };
  enemies?: number[];
  canSabotage?: boolean;
  duties: Duty[];
}

export interface Debrief {
  traitor: string | null;
  log: LogEntry[];
  result: EndResult;
  pledges: { identity: string; gold: number; grain: number }[];
  purses: Record<string, Purse>;
}

export interface ClientView {
  status: GameStatus;
  day: number;
  phase: AnyPhase;
  taskIndex: number;
  stats: Stats;
  players: PublicPlayer[];
  task: PublicTask | null;
  log: { id: number; at: number; text: string; day: number; phase: AnyPhase }[];
  loyaltyUsed: boolean;
  codexUnlocked: string[];
  me: {
    identity: string;
    role: RoleId | null;
    purse: Purse;
    isTraitor: boolean;
    task: PrivateTask;
    offer?: { amount: number };
    loyaltyReport?: { target: string; status: LoyaltyTest['status'] };
  };
  debrief?: Debrief;
}

/** Compact public summary written to the host's LiveKit participant metadata. */
export interface RoomSummary {
  status: GameStatus;
  day: number;
  phase: AnyPhase;
  stats: Stats;
}

export type { StatDelta };
