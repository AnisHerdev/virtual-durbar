// Data models for everything under public/assets/content/*.json.

export type RoleId =
  | 'raja'
  | 'mahamantri'
  | 'treasurer'
  | 'senapati'
  | 'spy'
  | 'nyayadhish'
  | 'sitadhyaksha';

export const ROLE_IDS: RoleId[] = [
  'raja',
  'mahamantri',
  'treasurer',
  'senapati',
  'spy',
  'nyayadhish',
  'sitadhyaksha',
];
export const MINISTER_ROLES = ROLE_IDS.filter((r) => r !== 'raja');

export interface RoleDef {
  id: RoleId;
  title: string;
  sanskrit: string;
  epithet: string;
  description: string;
  naturalFit: string[];
  headwear: string; // prop id in props manifest
  color: string; // accent (flat miniature palette)
  emblem: string; // single glyph for tiles without video
}

export type StatKey = 'gold' | 'grain' | 'troops' | 'workers' | 'morale' | 'fort';
export type Stats = Record<StatKey, number>;
export type StatDelta = Partial<Stats>;

export interface Option {
  id: string;
  label: string;
  /** Puzzles: exactly one option is correct. Policies: omit. */
  correct?: boolean;
  effects: StatDelta;
  /** Wisdom 0..3 for policy choices; drives the verdict tone. */
  wisdom?: number;
  outcome: string;
}

export interface PetitionDef {
  id: string;
  kind: 'petition';
  mode: 'puzzle' | 'policy';
  title: string;
  petitioner: string;
  summary: string;
  clues: string[];
  suggestedRole: RoleId;
  seconds: number;
  options: Option[];
  /** Effects if nobody decides before the deadline. */
  timeoutEffects: StatDelta;
  codexId?: string;
}

export interface RiddleDef {
  id: string;
  kind: 'riddle';
  title: string;
  source: string;
  prompt: string;
  seconds: number;
  options: { id: string; label: string }[];
  answerId: string;
  explanation: string;
  goldBonus: number;
  codexId?: string;
}

export interface Suspect {
  id: string;
  name: string;
  description: string;
}

export interface Clue {
  id: string;
  /** Role whose ledger/report this is. Missing roles' clues are dealt to others. */
  role: RoleId;
  source: string;
  text: string;
}

export interface TrialDef {
  id: string;
  kind: 'trial';
  title: string;
  summary: string;
  seconds: number;
  suspects: Suspect[];
  culpritId: string;
  /** Shown after the verdict: how the clues fit together. */
  explanation: string;
  clues: Clue[];
  success: { effects: StatDelta; outcome: string };
  failure: { effects: StatDelta; outcome: string };
  codexId?: string;
}

export interface FamineDef {
  id: string;
  kind: 'famine';
  title: string;
  summary: string;
  seconds: number;
  /** True need = need + needPerPlayer × players in court. */
  need: { gold: number; grain: number };
  needPerPlayer: { gold: number; grain: number };
  /** What everyone except the agriculture minister sees. */
  rumouredNeed: string;
  maxGranaryRelease: number;
  maxDivert: number;
  success: { effects: StatDelta; outcome: string };
  failure: { effects: StatDelta; outcome: string };
  codexId?: string;
}

export interface FortDef {
  id: string;
  kind: 'fort';
  title: string;
  summary: string;
  secondsPerWave: number;
  gates: string[];
  troopsPerWave: number;
  reinforcementCost: number;
  maxReinforcements: number;
  damagePerBreach: number;
  /** Enemy strength per gate for each wave. */
  waves: number[][];
  success: { effects: StatDelta; outcome: string };
  failure: { effects: StatDelta; outcome: string };
  codexId?: string;
}

export interface EdictDef {
  id: string;
  label: string;
  description: string;
  effects: StatDelta;
  codexId?: string;
}

export interface SunsetDef {
  id: string;
  kind: 'sunset';
  title: string;
  summary: string;
  edicts: EdictDef[];
  codexId?: string;
}

export type TaskDef = PetitionDef | RiddleDef | TrialDef | FamineDef | FortDef | SunsetDef;
export type TaskKind = TaskDef['kind'];

export type Phase = 'morning' | 'midday' | 'afternoon' | 'sunset';

export interface DayDef {
  day: number;
  theme: string;
  tasks: { phase: Phase; taskId: string }[];
}

export interface TasksFile {
  startingStats: Stats;
  startingPurse: { gold: number; grain: number };
  days: DayDef[];
  tasks: TaskDef[];
}

export interface CodexCard {
  id: string;
  title: string;
  era: string;
  region: string;
  tale: string;
  lesson: string;
  source: string;
}

export type TacticId =
  | 'false-intelligence'
  | 'embezzlement'
  | 'bribery'
  | 'sabotage'
  | 'susceptible-to-bribe'
  | 'loyalty-proven';

export interface TacticDef {
  id: TacticId;
  label: string;
  sanskrit: string;
  betrayal: boolean;
  explanation: string;
  arthashastra: { citation: string; text: string };
}

export interface RagaDef {
  id: string;
  name: string;
  prahar: string;
  mood: string;
  phases: (Phase | 'lobby' | 'debrief')[];
  /** Optional recorded track under public/assets/audio; synthesised if missing. */
  file?: string;
  tonicHz: number;
  /** Semitone offsets from Sa used for the melodic phrase generator. */
  aroha: number[];
  avaroha: number[];
  /** Characteristic phrase (semitone offsets) repeated as a motif. */
  pakad: number[];
  tempo: number;
}

export interface BackgroundDef {
  id: string;
  label: string;
  file: string;
  phases: (Phase | 'lobby' | 'debrief')[];
}

export interface PropDef {
  id: string;
  label: string;
  file: string;
  /** Width relative to the detected face width. */
  scale: number;
  /** Vertical anchor: fraction of prop height that sits below the forehead point. */
  anchorY: number;
}

export interface Manifest {
  backgrounds: BackgroundDef[];
  props: PropDef[];
  borders: { id: string; file: string }[];
}

export interface Content {
  roles: RoleDef[];
  tasks: TasksFile;
  codex: CodexCard[];
  tactics: TacticDef[];
  ragas: RagaDef[];
  manifest: Manifest;
}
