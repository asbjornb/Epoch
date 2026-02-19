export type SkillName = "farming" | "building" | "research" | "military";

export interface SkillState {
  level: number;
  xp: number;
}

export type Skills = Record<SkillName, SkillState>;

export interface Resources {
  food: number;
  population: number;
  maxPopulation: number;
  materials: number;
  militaryStrength: number;
  wallDefense: number;
  foodStorage: number;
  techLevel: number;
}

export type ActionId =
  | "farm"
  | "build_hut"
  | "build_granary"
  | "build_wall"
  | "train_militia"
  | "research_tools"
  | "gather_materials"
  | "scout"
  | "preserve_food";

export interface ActionDef {
  id: ActionId;
  name: string;
  description: string;
  skill: SkillName;
  baseDuration: number;
  unlockLevel: number;
  materialCost?: number;
}

export interface QueueEntry {
  uid: string;
  actionId: ActionId;
  repeat: number; // 1 = run once, -1 = repeat forever
}

export interface RunState {
  year: number;
  maxYear: number;
  resources: Resources;
  queue: QueueEntry[];
  currentQueueIndex: number;
  currentActionProgress: number; // ticks into current action
  status: "idle" | "running" | "paused" | "collapsed" | "victory";
  log: LogEntry[];
  collapseReason?: string;
  autoRestart: boolean;
}

export interface LogEntry {
  year: number;
  message: string;
  type: "info" | "warning" | "danger" | "success";
}

export interface DisasterInfo {
  id: string;
  name: string;
  year: number;
  color: string;
}

export interface GameState {
  skills: Skills;
  run: RunState;
  totalRuns: number;
  unlockedActions: ActionId[];
  savedQueues: SavedQueue[];
  encounteredDisasters: string[];
}

export interface SavedQueue {
  name: string;
  entries: QueueEntry[];
}
