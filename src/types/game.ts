export type SkillName = "farming" | "building" | "research" | "military";
export type ActionCategory = "resource" | "building" | "research" | "military";

export interface SkillState {
  level: number;
  xp: number;
}

export type Skills = Record<SkillName, SkillState>;

export interface Resources {
  food: number;
  preservedFood: number;
  population: number;
  maxPopulation: number;
  wood: number;
  militaryStrength: number;
  wallsBuilt: number;
  barracksBuilt: number;
  smokehousesBuilt: number;
  foodStorage: number;
  granariesBuilt: number;
  researchedTechs: ActionId[];
}

export type ActionId =
  | "farm"
  | "build_hut"
  | "build_granary"
  | "build_wall"
  | "build_barracks"
  | "build_smokehouse"
  | "train_militia"
  | "research_tools"
  | "research_irrigation"
  | "research_storage"
  | "research_fortification"
  | "research_tactics"
  | "gather_wood"
  | "scout"
  | "cure_food"
  | "winter_hunt";

export interface ActionDef {
  id: ActionId;
  name: string;
  description: string;
  skill: SkillName;
  category: ActionCategory;
  baseDuration: number;
  unlockLevel: number;
  woodCost?: number;
  /** Override which skill gates unlocking (defaults to `skill`) */
  unlockSkill?: SkillName;
  /** Tech that must be researched before this action unlocks */
  requiredTech?: ActionId;
  /** Minimum walls built before this action unlocks */
  requiredWalls?: number;
  /** Minimum barracks built before this action unlocks */
  requiredBarracks?: number;
  /** Action only produces results on completion; duration scales with pop instead of output.
   *  "building" = linear scaling, "research" = sublinear (diminishing returns past 2 pop). */
  completionOnly?: "building" | "research";
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
  lastActionPopulation?: number; // population when action last progressed (for display on collapse)
  status: "idle" | "running" | "paused" | "collapsed" | "victory";
  log: LogEntry[];
  collapseReason?: string;
  autoRestart: boolean;
  repeatLastAction: boolean;
  pendingEvents: EventPopup[];
  pausedByEvent: boolean;
  totalFoodSpoiled: number;
}

export interface LogEntry {
  year: number;
  message: string;
  type: "info" | "warning" | "danger" | "success";
}

export interface EventPopup {
  eventId: string;
  title: string;
  message: string;
  type: "warning" | "success" | "danger";
  year: number;
  firstTime: boolean;
}

export interface DisasterInfo {
  id: string;
  name: string;
  year: number;
  color: string;
}

export interface RunHistoryQueueEntry {
  actionId: ActionId;
  repeat: number;
  completions: number;
}

export interface RunHistoryEntry {
  runNumber: number;
  year: number;
  outcome: "collapsed" | "victory" | "abandoned";
  collapseReason?: string;
  queue: RunHistoryQueueEntry[];
  resources: Resources;
  totalFoodSpoiled?: number;
  skillsGained?: Partial<Record<SkillName, number>>;
  lastActionId?: ActionId;
  lastActionYearsRemaining?: number;
  lastActionYearsDone?: number;
}

/** Snapshot of state at the moment a run ends (collapse/victory). */
export interface EndedRunSnapshot {
  run: RunState;
  skills: Skills;
  skillsAtRunStart: Skills;
  lastRunYear: number;
  totalRuns: number;
}

export interface GameState {
  skills: Skills;
  run: RunState;
  totalRuns: number;
  totalWinterYearsSurvived: number;
  unlockedActions: ActionId[];
  encounteredDisasters: string[];
  seenEventTypes: string[];
  autoDismissEventTypes: string[];
  autoDismissRunSummary: boolean;
  lastRunYear: number;
  skillsAtRunStart: Skills;
  runHistory: RunHistoryEntry[];
  /** Present while the run-summary modal should be visible. */
  endedRunSnapshot: EndedRunSnapshot | null;
}
