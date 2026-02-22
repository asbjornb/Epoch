import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  GameState,
  QueueEntry,
  ActionId,
  RunHistoryEntry,
  SkillName,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { initialSkills, isActionUnlocked } from "../engine/skills.ts";
import { createInitialRun, tick, getEffectiveDuration, getAchievementBonuses } from "../engine/simulation.ts";
import {
  getGroupRange,
  getSegmentLogicalSize,
  resolveLogicalIndex,
  getLogicalStartOfSegment,
} from "../engine/queueGroups.ts";

export type GameAction =
  | { type: "tick" }
  | { type: "start_run" }
  | { type: "pause_run" }
  | { type: "resume_run" }
  | { type: "reset_run" }
  | { type: "toggle_auto_restart" }
  | { type: "toggle_repeat_last_action" }
  | { type: "dismiss_event" }
  | { type: "dismiss_event_no_pause" }
  | { type: "dismiss_event_by_id"; eventId: string }
  | { type: "dismiss_event_no_pause_by_id"; eventId: string }
  | { type: "queue_add"; actionId: ActionId; repeat?: number }
  | { type: "queue_remove"; uid: string }
  | { type: "queue_move"; uid: string; direction: "up" | "down" }
  | { type: "queue_set_repeat"; uid: string; repeat: number }
  | { type: "queue_duplicate"; uid: string }
  | { type: "queue_clear" }
  | { type: "queue_merge"; uids: string[] }
  | { type: "queue_split"; groupId: string }
  | { type: "queue_set_group_repeat"; groupId: string; repeat: number }
  | { type: "queue_move_group"; groupId: string; direction: "up" | "down" }
  | { type: "queue_duplicate_group"; groupId: string }
  | { type: "queue_load"; queue: QueueEntry[]; repeatLastAction: boolean }
  | { type: "force_collapse"; reason?: string }
  | { type: "import_save"; state: GameState }
  | { type: "hard_reset" }
  | { type: "dismiss_summary" }
  | { type: "reset_auto_dismiss"; eventId: string }
  | { type: "reset_all_auto_dismiss" }
  | { type: "set_auto_dismiss_run_summary"; value: boolean };

let uidCounter = 0;
export function makeUid(): string {
  return `q_${++uidCounter}_${Date.now()}`;
}

let groupCounter = 0;
export function makeGroupId(): string {
  return `g_${++groupCounter}_${Date.now()}`;
}

function loadSkills(): GameState["skills"] {
  try {
    const saved = localStorage.getItem("epoch_skills");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return initialSkills();
}

function loadTotalRuns(): number {
  try {
    const saved = localStorage.getItem("epoch_total_runs");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

function loadTotalWinterYears(): number {
  try {
    const saved = localStorage.getItem("epoch_total_winter_years");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

const WINTER_START = 4000;
const WINTER_END = 4500;
const WINTER_HUNT_UNLOCK_THRESHOLD = 1500;

const DEFAULT_UNLOCKED_ACTIONS: ActionId[] = ["farm"];

function loadUnlockedActions(): ActionId[] {
  try {
    const saved = localStorage.getItem("epoch_unlocked_actions");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [...DEFAULT_UNLOCKED_ACTIONS];
}

/** Check if any new actions should be unlocked based on current skills and researched techs */
function computeSkillUnlocks(current: ActionId[], skills: GameState["skills"], researchedTechs?: ActionId[], wallsBuilt?: number, barracksBuilt?: number): ActionId[] {
  let updated = current;
  for (const def of ACTION_DEFS) {
    if (!updated.includes(def.id)) {
      const skillName = def.unlockSkill ?? def.skill;
      const skillMet = isActionUnlocked(skills, skillName, def.unlockLevel);
      const techMet = !def.requiredTech || (researchedTechs?.includes(def.requiredTech) ?? false);
      const wallsMet = !def.requiredWalls || (wallsBuilt ?? 0) >= def.requiredWalls;
      const barracksMet = !def.requiredBarracks || (barracksBuilt ?? 0) >= def.requiredBarracks;
      // Auto-unlock when gated by skill level, required tech, required walls, or required barracks
      if (skillMet && techMet && wallsMet && barracksMet && (def.unlockLevel > 0 || def.requiredTech || def.requiredWalls || def.requiredBarracks)) {
        updated = updated === current ? [...current] : updated;
        updated.push(def.id);
      }
    }
  }
  return updated;
}

function loadEncounteredDisasters(): string[] {
  try {
    const saved = localStorage.getItem("epoch_encountered_disasters");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function loadSeenEventTypes(): string[] {
  try {
    const saved = localStorage.getItem("epoch_seen_event_types");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function loadAutoDismissEventTypes(): string[] {
  try {
    const saved = localStorage.getItem("epoch_auto_dismiss_event_types");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function loadAutoDismissRunSummary(): boolean {
  try {
    const saved = localStorage.getItem("epoch_auto_dismiss_run_summary");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return false;
}

function loadLastRunYear(): number {
  try {
    const saved = localStorage.getItem("epoch_last_run_year");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

function loadRunHistory(): RunHistoryEntry[] {
  try {
    const saved = localStorage.getItem("epoch_run_history");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function loadBestRunYear(): number {
  try {
    const saved = localStorage.getItem("epoch_best_run_year");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

function loadTotalYearsPlayed(): number {
  try {
    const saved = localStorage.getItem("epoch_total_years_played");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

function cloneSkills(skills: GameState["skills"]): GameState["skills"] {
  return {
    farming: { ...skills.farming },
    building: { ...skills.building },
    research: { ...skills.research },
    military: { ...skills.military },
  };
}

const SAVE_KEY = "epoch_save";

/** Holds raw JSON of an incompatible save so the user can export it before it's lost. */
let incompatibleSaveJson: string | null = null;

export function getIncompatibleSave(): string | null {
  return incompatibleSaveJson;
}

export function clearIncompatibleSave(): void {
  incompatibleSaveJson = null;
}

function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

export function loadGameState(): GameState | null {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate that the save has the current schema — stash incompatible saves for user export
      if (
        !parsed?.run?.resources ||
        !Array.isArray(parsed.run.resources.researchedTechs) ||
        typeof parsed.run.resources.wood !== "number" ||
        typeof parsed.run.resources.militaryStrength !== "number"
      ) {
        incompatibleSaveJson = saved;
        localStorage.removeItem(SAVE_KEY);
        return null;
      }
      // Migrate older saves missing new fields
      if (typeof parsed.bestRunYear !== "number") parsed.bestRunYear = 0;
      if (typeof parsed.totalYearsPlayed !== "number") parsed.totalYearsPlayed = 0;
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state);
}

export function validateSave(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json);
    // Basic shape validation
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.skills &&
      parsed.run &&
      typeof parsed.totalRuns === "number" &&
      Array.isArray(parsed.unlockedActions)
    ) {
      // Ensure new fields exist for saves from older versions
      if (parsed.endedRunSnapshot === undefined) parsed.endedRunSnapshot = null;
      if (typeof parsed.bestRunYear !== "number") parsed.bestRunYear = 0;
      if (typeof parsed.totalYearsPlayed !== "number") parsed.totalYearsPlayed = 0;
      if (parsed.achievements === undefined) parsed.achievements = [];
      return parsed as GameState;
    }
  } catch { /* ignore */ }
  return null;
}

function createInitialState(): GameState {
  // Try to restore full game state from auto-save
  const saved = loadGameState();
  if (saved) {
    // If the run was running when we saved, pause it so the player can resume
    if (saved.run.status === "running") {
      saved.run.status = "paused";
    }
    if (!saved.achievements) saved.achievements = [];
    return saved;
  }

  const skills = loadSkills();
  const unlocked = loadUnlockedActions();
  return {
    skills,
    run: createInitialRun(),
    totalRuns: loadTotalRuns(),
    totalWinterYearsSurvived: loadTotalWinterYears(),
    unlockedActions: computeSkillUnlocks(unlocked, skills),
    encounteredDisasters: loadEncounteredDisasters(),
    seenEventTypes: loadSeenEventTypes(),
    autoDismissEventTypes: loadAutoDismissEventTypes(),
    autoDismissRunSummary: loadAutoDismissRunSummary(),
    lastRunYear: loadLastRunYear(),
    skillsAtRunStart: cloneSkills(skills),
    runHistory: loadRunHistory(),
    bestRunYear: loadBestRunYear(),
    totalYearsPlayed: loadTotalYearsPlayed(),
    endedRunSnapshot: null,
    achievements: [],
  };
}

/** Compute how many times each queue entry actually completed during a run.
 *  Group-aware: accounts for groupRepeat cycling through group members. */
function computeQueueCompletions(
  queue: QueueEntry[],
  currentQueueIndex: number,
  repeatLastAction: boolean,
): number[] {
  const completions: number[] = new Array(queue.length).fill(0);
  if (queue.length === 0) return completions;

  let logicalPos = 0;
  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];

    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;
      const totalSize = range.iterationSize * range.groupRepeat;

      if (logicalPos + totalSize > currentQueueIndex) {
        // Partially completed group
        const offset = currentQueueIndex - logicalPos;
        const fullIters = Math.floor(offset / range.iterationSize);
        let remainingInIter = offset - fullIters * range.iterationSize;

        // Full iterations: each member got its full repeat count
        for (let j = range.startIdx; j < range.endIdx; j++) {
          completions[j] = fullIters * queue[j].repeat;
        }

        // Partial iteration
        for (let j = range.startIdx; j < range.endIdx; j++) {
          if (remainingInIter <= 0) break;
          const used = Math.min(queue[j].repeat, remainingInIter);
          completions[j] += used;
          remainingInIter -= used;
        }
        return completions;
      }

      // Fully completed group
      for (let j = range.startIdx; j < range.endIdx; j++) {
        completions[j] = range.groupRepeat * queue[j].repeat;
      }
      logicalPos += totalSize;
      i = range.endIdx;
    } else {
      const repeats = entry.repeat;

      if (repeats === -1) {
        completions[i] = Math.max(0, currentQueueIndex - logicalPos);
        return completions;
      }

      if (logicalPos + repeats > currentQueueIndex) {
        completions[i] = Math.max(0, currentQueueIndex - logicalPos);
        return completions;
      }

      completions[i] = repeats;
      logicalPos += repeats;
      i++;
    }
  }

  // Queue fully exhausted — if repeatLastAction, extra completions go to last entry
  if (repeatLastAction && currentQueueIndex > logicalPos) {
    completions[queue.length - 1] += currentQueueIndex - logicalPos;
  }

  return completions;
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "tick": {
      let tickedState = tick(state);

      // When food cap is reached, unlock the other starting actions
      const { resources } = tickedState.run;
      if (resources.food >= resources.foodStorage) {
        const startingUnlocks: ActionId[] = ["gather_wood", "research_tools"];
        const missing = startingUnlocks.filter(id => !tickedState.unlockedActions.includes(id));
        if (missing.length > 0) {
          const unlockedActions = [...tickedState.unlockedActions, ...missing];
          localStorage.setItem("epoch_unlocked_actions", JSON.stringify(unlockedActions));

          const shouldPause = !tickedState.autoDismissEventTypes.includes("food_cap_unlock");
          const firstTime = !tickedState.seenEventTypes.includes("food_cap_unlock");
          const run = { ...tickedState.run };
          run.pendingEvents = [...run.pendingEvents, {
            eventId: "food_cap_unlock",
            title: "New Skills Discovered",
            message: "Your food stores are full. Your people now have time to explore new pursuits: gathering wood and tool research. Build structures to unlock more.",
            type: "success" as const,
            year: run.year,
            firstTime,
          }];
          if (shouldPause) {
            run.status = "paused";
            run.pausedByEvent = true;
          }
          run.log = [...run.log, {
            year: run.year,
            message: "Food storage full — new skills unlocked: Building, Research.",
            type: "success" as const,
          }];

          tickedState = { ...tickedState, unlockedActions, run };
        }
      }

      // Check if skills unlocked new actions
      const newUnlocks = computeSkillUnlocks(tickedState.unlockedActions, tickedState.skills, tickedState.run.resources.researchedTechs, tickedState.run.resources.wallsBuilt, tickedState.run.resources.barracksBuilt);
      if (newUnlocks !== tickedState.unlockedActions) {
        localStorage.setItem("epoch_unlocked_actions", JSON.stringify(newUnlocks));
        tickedState = { ...tickedState, unlockedActions: newUnlocks };
      }

      // Snapshot state when a run ends so the summary modal persists through auto-restart
      const ended = tickedState.run.status === "collapsed" || tickedState.run.status === "victory";
      if (ended && state.run.status !== "collapsed" && state.run.status !== "victory") {
        tickedState = {
          ...tickedState,
          endedRunSnapshot: {
            run: tickedState.run,
            skills: tickedState.skills,
            skillsAtRunStart: tickedState.skillsAtRunStart,
            lastRunYear: tickedState.lastRunYear,
            totalRuns: tickedState.totalRuns + 1,
          },
        };
      }
      return tickedState;
    }

    case "start_run": {
      const run = { ...state.run, status: "running" as const };
      return { ...state, run, skillsAtRunStart: cloneSkills(state.skills) };
    }

    case "pause_run": {
      const run = { ...state.run, status: "paused" as const };
      return { ...state, run };
    }

    case "resume_run": {
      const run = { ...state.run, status: "running" as const };
      return { ...state, run };
    }

    case "reset_run": {
      // Persist skills
      localStorage.setItem("epoch_skills", JSON.stringify(state.skills));
      const totalRuns = state.totalRuns + 1;
      localStorage.setItem("epoch_total_runs", String(totalRuns));

      // Save the year reached in the ending run
      const lastRunYear = state.run.year;
      localStorage.setItem("epoch_last_run_year", String(lastRunYear));

      // Capture run history entry before resetting
      let outcome: RunHistoryEntry["outcome"] = "abandoned";
      if (state.run.status === "collapsed") outcome = "collapsed";
      else if (state.run.status === "victory") outcome = "victory";

      // Compute actual completions per queue entry from currentQueueIndex
      const queueCompletions = computeQueueCompletions(
        state.run.queue,
        state.run.currentQueueIndex,
        state.run.repeatLastAction,
      );

      // Compute skill levels gained during this run
      const skillNames: SkillName[] = ["farming", "building", "research", "military"];
      const skillsGained: Partial<Record<SkillName, number>> = {};
      for (const name of skillNames) {
        const gained = state.skills[name].level - state.skillsAtRunStart[name].level;
        if (gained > 0) skillsGained[name] = gained;
      }

      // Compute years remaining on the last action in progress
      let lastActionId: ActionId | undefined;
      let lastActionYearsRemaining: number | undefined;
      let lastActionYearsDone: number | undefined;
      if (state.run.currentActionProgress > 0 && state.run.queue.length > 0) {
        // Find the queue entry that was in progress
        let arrayIdx = -1;
        let logicalPos = 0;
        for (let i = 0; i < state.run.queue.length; i++) {
          const reps = state.run.queue[i].repeat;
          if (reps === -1 || logicalPos + reps > state.run.currentQueueIndex) {
            arrayIdx = i;
            break;
          }
          logicalPos += reps;
        }
        if (arrayIdx === -1 && state.run.repeatLastAction) {
          arrayIdx = state.run.queue.length - 1;
        }
        if (arrayIdx >= 0) {
          const activeEntry = state.run.queue[arrayIdx];
          const def = getActionDef(activeEntry.actionId);
          if (def) {
            const skillLevel = state.skills[def.skill].level;
            const pop = state.run.lastActionPopulation ?? state.run.resources.population;
            const duration = getEffectiveDuration(def.baseDuration, skillLevel, pop, def.category, def.completionOnly);
            lastActionId = activeEntry.actionId;
            lastActionYearsRemaining = duration - state.run.currentActionProgress;
            lastActionYearsDone = state.run.currentActionProgress;
          }
        }
      }

      const historyEntry: RunHistoryEntry = {
        runNumber: totalRuns,
        year: state.run.year,
        outcome,
        collapseReason: state.run.collapseReason,
        queue: state.run.queue.map((e, i) => ({
          actionId: e.actionId,
          repeat: e.repeat,
          completions: queueCompletions[i],
        })),
        resources: { ...state.run.resources },
        totalFoodSpoiled: state.run.totalFoodSpoiled || 0,
        ...(Object.keys(skillsGained).length > 0 && { skillsGained }),
        ...(lastActionId && lastActionYearsRemaining != null && { lastActionId, lastActionYearsRemaining, lastActionYearsDone }),
      };
      const runHistory = [historyEntry, ...state.runHistory].slice(0, 10);
      localStorage.setItem("epoch_run_history", JSON.stringify(runHistory));

      // Update all-time year stats
      const bestRunYear = Math.max(state.bestRunYear, state.run.year);
      localStorage.setItem("epoch_best_run_year", String(bestRunYear));
      const totalYearsPlayed = state.totalYearsPlayed + state.run.year;
      localStorage.setItem("epoch_total_years_played", String(totalYearsPlayed));

      // Tally winter years survived this run
      const winterYearsThisRun = Math.max(0, Math.min(state.run.year, WINTER_END) - WINTER_START);
      const totalWinterYearsSurvived = (state.totalWinterYearsSurvived || 0) + winterYearsThisRun;
      localStorage.setItem("epoch_total_winter_years", String(totalWinterYearsSurvived));

      // Check skill-based unlocks
      let unlockedActions = computeSkillUnlocks(state.unlockedActions, state.skills);

      // Unlock winter_hunt when enough winter years survived
      if (totalWinterYearsSurvived >= WINTER_HUNT_UNLOCK_THRESHOLD && !unlockedActions.includes("winter_hunt")) {
        unlockedActions = [...unlockedActions, "winter_hunt"];
      }
      localStorage.setItem("epoch_unlocked_actions", JSON.stringify(unlockedActions));

      // Preserve queue and settings from previous run
      const newRun = createInitialRun();
      // Apply achievement starting bonuses
      const bonuses = getAchievementBonuses(state.achievements);
      newRun.resources.food += bonuses.food;
      newRun.resources.wood += bonuses.wood;
      newRun.queue = state.run.queue.map((e) => ({ ...e }));
      newRun.autoRestart = state.run.autoRestart;
      newRun.repeatLastAction = state.run.repeatLastAction;
      return {
        ...state,
        run: newRun,
        totalRuns,
        totalWinterYearsSurvived,
        unlockedActions,
        lastRunYear,
        runHistory,
        bestRunYear,
        totalYearsPlayed,
      };
    }

    case "dismiss_event": {
      const dismissed = state.run.pendingEvents[0];
      if (!dismissed) return state;
      const pendingEvents = state.run.pendingEvents.slice(1);
      let seenEventTypes = state.seenEventTypes;
      if (!seenEventTypes.includes(dismissed.eventId)) {
        seenEventTypes = [...seenEventTypes, dismissed.eventId];
        localStorage.setItem("epoch_seen_event_types", JSON.stringify(seenEventTypes));
      }
      const shouldResume = state.run.pausedByEvent && pendingEvents.length === 0;
      const run = {
        ...state.run,
        pendingEvents,
        pausedByEvent: pendingEvents.length > 0 ? state.run.pausedByEvent : false,
        status: shouldResume ? "running" as const : state.run.status,
      };
      return { ...state, run, seenEventTypes };
    }

    case "dismiss_event_no_pause": {
      const dismissed = state.run.pendingEvents[0];
      if (!dismissed) return state;
      const pendingEvents = state.run.pendingEvents.slice(1);
      let seenEventTypes = state.seenEventTypes;
      if (!seenEventTypes.includes(dismissed.eventId)) {
        seenEventTypes = [...seenEventTypes, dismissed.eventId];
        localStorage.setItem("epoch_seen_event_types", JSON.stringify(seenEventTypes));
      }
      let autoDismissEventTypes = state.autoDismissEventTypes;
      if (!autoDismissEventTypes.includes(dismissed.eventId)) {
        autoDismissEventTypes = [...autoDismissEventTypes, dismissed.eventId];
        localStorage.setItem("epoch_auto_dismiss_event_types", JSON.stringify(autoDismissEventTypes));
      }
      const shouldResume = state.run.pausedByEvent && pendingEvents.length === 0;
      const run = {
        ...state.run,
        pendingEvents,
        pausedByEvent: pendingEvents.length > 0 ? state.run.pausedByEvent : false,
        status: shouldResume ? "running" as const : state.run.status,
      };
      return { ...state, run, seenEventTypes, autoDismissEventTypes };
    }

    case "dismiss_event_by_id": {
      const targetId = action.eventId;
      const filteredEvents = state.run.pendingEvents.filter(e => e.eventId !== targetId);
      let seenById = state.seenEventTypes;
      if (!seenById.includes(targetId)) {
        seenById = [...seenById, targetId];
        localStorage.setItem("epoch_seen_event_types", JSON.stringify(seenById));
      }
      const resumeById = state.run.pausedByEvent && filteredEvents.length === 0;
      const runById = {
        ...state.run,
        pendingEvents: filteredEvents,
        pausedByEvent: filteredEvents.length > 0 ? state.run.pausedByEvent : false,
        status: resumeById ? "running" as const : state.run.status,
      };
      return { ...state, run: runById, seenEventTypes: seenById };
    }

    case "dismiss_event_no_pause_by_id": {
      const npTargetId = action.eventId;
      const npFilteredEvents = state.run.pendingEvents.filter(e => e.eventId !== npTargetId);
      let npSeen = state.seenEventTypes;
      if (!npSeen.includes(npTargetId)) {
        npSeen = [...npSeen, npTargetId];
        localStorage.setItem("epoch_seen_event_types", JSON.stringify(npSeen));
      }
      let npAutoDismiss = state.autoDismissEventTypes;
      if (!npAutoDismiss.includes(npTargetId)) {
        npAutoDismiss = [...npAutoDismiss, npTargetId];
        localStorage.setItem("epoch_auto_dismiss_event_types", JSON.stringify(npAutoDismiss));
      }
      const npResume = state.run.pausedByEvent && npFilteredEvents.length === 0;
      const npRun = {
        ...state.run,
        pendingEvents: npFilteredEvents,
        pausedByEvent: npFilteredEvents.length > 0 ? state.run.pausedByEvent : false,
        status: npResume ? "running" as const : state.run.status,
      };
      return { ...state, run: npRun, seenEventTypes: npSeen, autoDismissEventTypes: npAutoDismiss };
    }

    case "toggle_auto_restart": {
      const run = { ...state.run, autoRestart: !state.run.autoRestart };
      return { ...state, run };
    }

    case "toggle_repeat_last_action": {
      const run = { ...state.run, repeatLastAction: !state.run.repeatLastAction };
      return { ...state, run };
    }

    case "queue_add": {
      const def = getActionDef(action.actionId);
      // Research techs are single-use: don't add if already in queue
      if (def?.category === "research" && state.run.queue.some((e) => e.actionId === action.actionId)) {
        return state;
      }
      const entry: QueueEntry = {
        uid: makeUid(),
        actionId: action.actionId,
        repeat: def?.category === "research" ? 1 : (action.repeat ?? 1),
      };
      const run = { ...state.run, queue: [...state.run.queue, entry] };
      return { ...state, run };
    }

    case "queue_remove": {
      const entryIdx = state.run.queue.findIndex((e) => e.uid === action.uid);
      if (entryIdx < 0) return state;
      const removedEntry = state.run.queue[entryIdx];
      const queue = state.run.queue.filter((e) => e.uid !== action.uid);

      let { currentQueueIndex, currentActionProgress } = state.run;

      if ((state.run.status === "running" || state.run.status === "paused") && removedEntry.repeat !== -1) {
        // Use group-aware logical size computation on the OLD queue
        const segStart = getLogicalStartOfSegment(state.run.queue, entryIdx);
        const seg = getSegmentLogicalSize(state.run.queue, removedEntry.groupId ? (() => {
          // Find group start
          let s = entryIdx;
          while (s > 0 && state.run.queue[s - 1].groupId === removedEntry.groupId) s--;
          return s;
        })() : entryIdx);
        const segEnd = segStart + seg.size;

        // Compute new segment size after removal (if item was in a group, group shrinks)
        let newSegSize: number;
        if (removedEntry.groupId) {
          // Recalculate the group size in the new queue without this entry
          const groupRange = getGroupRange(state.run.queue, entryIdx)!;
          const newIterSize = groupRange.iterationSize - removedEntry.repeat;
          const membersLeft = groupRange.endIdx - groupRange.startIdx - 1;
          if (membersLeft <= 1) {
            // Group dissolved to single item — no groupRepeat
            newSegSize = newIterSize;
          } else {
            newSegSize = newIterSize * groupRange.groupRepeat;
          }
        } else {
          newSegSize = 0;
        }

        const sizeDelta = seg.size - newSegSize;

        if (currentQueueIndex >= segEnd) {
          // Past the segment: shift back by the size reduction
          currentQueueIndex -= sizeDelta;
        } else if (currentQueueIndex >= segStart) {
          // Inside the segment — need to check if we're still in a valid position
          if (!removedEntry.groupId) {
            // Standalone entry removed: snap to its start
            currentQueueIndex = segStart;
            currentActionProgress = 0;
          } else {
            // Group member removed: try to keep position, but clamp if needed
            const offsetInSeg = currentQueueIndex - segStart;
            if (newSegSize === 0 || offsetInSeg >= newSegSize) {
              currentQueueIndex = segStart + Math.max(0, newSegSize);
              currentActionProgress = 0;
            }
            // Otherwise position is still valid within the smaller group
          }
        }
      }

      // If removing leaves a group with just 1 member, dissolve the group
      if (removedEntry.groupId) {
        const remaining = queue.filter((e) => e.groupId === removedEntry.groupId);
        if (remaining.length === 1) {
          remaining[0].groupId = undefined;
          remaining[0].groupRepeat = undefined;
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_move": {
      const queue = [...state.run.queue];
      const idx = queue.findIndex((e) => e.uid === action.uid);
      if (idx < 0) return state;

      // If item is in a group, move the whole group
      const entry = queue[idx];
      if (entry.groupId) {
        // Delegate to group move
        return gameReducer(state, { type: "queue_move_group", groupId: entry.groupId, direction: action.direction });
      }

      const swapIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= queue.length) return state;

      // Can't swap into middle of a group — skip over it
      const swapEntry = queue[swapIdx];
      let actualSwapStart: number, actualSwapEnd: number;
      if (swapEntry.groupId) {
        const range = getGroupRange(queue, swapIdx)!;
        if (action.direction === "up") {
          actualSwapStart = range.startIdx;
          actualSwapEnd = range.endIdx;
        } else {
          actualSwapStart = range.startIdx;
          actualSwapEnd = range.endIdx;
        }
      } else {
        actualSwapStart = swapIdx;
        actualSwapEnd = swapIdx + 1;
      }

      let { currentQueueIndex } = state.run;
      const { currentActionProgress } = state.run;

      // Before move: find which entry+repeat the index currently points to
      const resolved = (state.run.status === "running" || state.run.status === "paused")
        ? resolveLogicalIndex(queue, currentQueueIndex) : null;
      const activeEntryUid = resolved ? queue[resolved.arrayIndex].uid : null;
      const repeatWithinEntry = resolved ? resolved.repeatWithinEntry : 0;
      const activeGroupIter = resolved ? resolved.groupIteration : 0;

      // Perform the move: remove the item and insert it on the other side of the swap target
      const [removed] = queue.splice(idx, 1);
      if (action.direction === "up") {
        queue.splice(actualSwapStart, 0, removed);
      } else {
        // Insert after the group/item we're jumping over
        const insertAt = idx < actualSwapStart ? actualSwapEnd - 1 : actualSwapEnd - 1;
        queue.splice(insertAt, 0, removed);
      }

      // After move: recompute index to keep pointing at the same entry+repeat
      if (activeEntryUid) {
        const newResolved = resolveLogicalIndex(queue, 0); // dummy, we'll search
        void newResolved;
        let logicalPos = 0;
        let qi = 0;
        while (qi < queue.length) {
          const e = queue[qi];
          if (e.uid === activeEntryUid && !e.groupId) {
            currentQueueIndex = logicalPos + repeatWithinEntry;
            break;
          }
          if (e.groupId) {
            const range = getGroupRange(queue, qi)!;
            let found = false;
            for (let j = range.startIdx; j < range.endIdx; j++) {
              if (queue[j].uid === activeEntryUid) {
                // Within a group: restore the full position
                let posInIter = 0;
                for (let k = range.startIdx; k < j; k++) posInIter += queue[k].repeat;
                currentQueueIndex = logicalPos + activeGroupIter * range.iterationSize + posInIter + repeatWithinEntry;
                found = true;
                break;
              }
            }
            if (found) break;
            logicalPos += range.iterationSize * range.groupRepeat;
            qi = range.endIdx;
          } else {
            if (e.repeat === -1) break;
            logicalPos += e.repeat;
            qi++;
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_set_repeat": {
      const entryIdx = state.run.queue.findIndex((e) => e.uid === action.uid);
      if (entryIdx < 0) return state;
      const entry = state.run.queue[entryIdx];
      const eDef = getActionDef(entry.actionId);
      if (eDef?.category === "research") return state;

      const oldRepeat = entry.repeat;
      const newRepeat = action.repeat;
      if (oldRepeat === newRepeat) return state;

      const queue = state.run.queue.map((e, i) =>
        i === entryIdx ? { ...e, repeat: newRepeat } : e,
      );

      let { currentQueueIndex, currentActionProgress } = state.run;

      // Adjust currentQueueIndex so it keeps pointing at the same action instance
      if (state.run.status === "running" || state.run.status === "paused") {
        // Use group-aware segment sizes
        const oldSegStart = getLogicalStartOfSegment(state.run.queue, entryIdx);
        const oldSeg = getSegmentLogicalSize(state.run.queue, entry.groupId ? (() => {
          let s = entryIdx;
          while (s > 0 && state.run.queue[s - 1].groupId === entry.groupId) s--;
          return s;
        })() : entryIdx);
        const oldSegEnd = oldSegStart + oldSeg.size;

        const newSeg = getSegmentLogicalSize(queue, entry.groupId ? (() => {
          let s = entryIdx;
          while (s > 0 && queue[s - 1].groupId === entry.groupId) s--;
          return s;
        })() : entryIdx);
        const sizeDelta = newSeg.size - oldSeg.size;

        if (currentQueueIndex >= oldSegEnd) {
          // Past this segment: shift by delta
          currentQueueIndex += sizeDelta;
        } else if (currentQueueIndex >= oldSegStart && sizeDelta < 0) {
          // Inside this segment and it shrank — check if position is still valid
          const offsetInSeg = currentQueueIndex - oldSegStart;
          if (offsetInSeg >= newSeg.size) {
            currentQueueIndex = oldSegStart + newSeg.size;
            currentActionProgress = 0;
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_duplicate": {
      const entryIdx = state.run.queue.findIndex((e) => e.uid === action.uid);
      if (entryIdx < 0) return state;
      const original = state.run.queue[entryIdx];

      // If item is in a group, duplicate the whole group
      if (original.groupId) {
        return gameReducer(state, { type: "queue_duplicate_group", groupId: original.groupId });
      }

      // Research techs are single-use: don't duplicate
      const oDef = getActionDef(original.actionId);
      if (oDef?.category === "research") return state;

      const duplicate: QueueEntry = {
        uid: makeUid(),
        actionId: original.actionId,
        repeat: original.repeat,
      };
      const queue = [...state.run.queue];
      queue.splice(entryIdx + 1, 0, duplicate);

      let { currentQueueIndex } = state.run;

      // If the run is active and the duplicate was inserted at or before the
      // current logical position, shift the index forward by the duplicate's repeats.
      if (state.run.status === "running" || state.run.status === "paused") {
        const segStart = getLogicalStartOfSegment(state.run.queue, entryIdx);
        const seg = getSegmentLogicalSize(state.run.queue, entryIdx);
        const insertLogicalPos = segStart + seg.size;
        if (currentQueueIndex >= insertLogicalPos) {
          currentQueueIndex += duplicate.repeat;
        }
      }

      const run = { ...state.run, queue, currentQueueIndex };
      return { ...state, run };
    }

    case "queue_merge": {
      // Merge selected UIDs into a group. They must be contiguous in the queue.
      const uids = action.uids;
      if (uids.length < 2) return state;

      const indices = uids.map((uid) => state.run.queue.findIndex((e) => e.uid === uid));
      if (indices.some((i) => i < 0)) return state;
      indices.sort((a, b) => a - b);

      // Check contiguity
      for (let k = 1; k < indices.length; k++) {
        if (indices[k] !== indices[k - 1] + 1) return state;
      }

      // Items already in a group cannot be merged with others
      if (indices.some((idx) => state.run.queue[idx].groupId)) return state;

      const groupId = makeGroupId();
      const queue = state.run.queue.map((e, idx) => {
        if (indices.includes(idx)) {
          return { ...e, groupId, groupRepeat: 1 };
        }
        return e;
      });

      const run = { ...state.run, queue };
      return { ...state, run };
    }

    case "queue_split": {
      // Split a group back into individual items
      const { groupId } = action;
      const queue = state.run.queue.map((e) => {
        if (e.groupId === groupId) {
          return { ...e, groupId: undefined, groupRepeat: undefined };
        }
        return e;
      });

      // Adjust currentQueueIndex: splitting doesn't change the logical sequence if groupRepeat=1
      // but if groupRepeat > 1, the expansion changes. We need to map the current position.
      let { currentQueueIndex } = state.run;
      const { currentActionProgress } = state.run;

      if (state.run.status === "running" || state.run.status === "paused") {
        // Find the group in the OLD queue
        const firstIdx = state.run.queue.findIndex((e) => e.groupId === groupId);
        if (firstIdx >= 0) {
          const range = getGroupRange(state.run.queue, firstIdx)!;
          const segStart = getLogicalStartOfSegment(state.run.queue, firstIdx);
          const oldSize = range.iterationSize * range.groupRepeat;
          const newSize = range.iterationSize; // After split, groupRepeat is gone = 1 iteration

          if (currentQueueIndex >= segStart + oldSize) {
            // Past the group: shift by delta
            currentQueueIndex -= (oldSize - newSize);
          } else if (currentQueueIndex >= segStart) {
            // Inside the group: map position
            const offset = currentQueueIndex - segStart;
            // Map to position within one iteration (wrap if needed)
            const posInIter = offset % range.iterationSize;
            currentQueueIndex = segStart + posInIter;
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_set_group_repeat": {
      const { groupId, repeat: newRepeat } = action;
      if (newRepeat < 1) return state;

      const firstIdx = state.run.queue.findIndex((e) => e.groupId === groupId);
      if (firstIdx < 0) return state;
      const range = getGroupRange(state.run.queue, firstIdx)!;
      const oldRepeat = range.groupRepeat;
      if (oldRepeat === newRepeat) return state;

      const queue = state.run.queue.map((e) => {
        if (e.groupId === groupId) return { ...e, groupRepeat: newRepeat };
        return e;
      });

      let { currentQueueIndex, currentActionProgress } = state.run;

      if (state.run.status === "running" || state.run.status === "paused") {
        const segStart = getLogicalStartOfSegment(state.run.queue, firstIdx);
        const oldSize = range.iterationSize * oldRepeat;
        const newSize = range.iterationSize * newRepeat;
        const segEnd = segStart + oldSize;

        if (currentQueueIndex >= segEnd) {
          currentQueueIndex += (newSize - oldSize);
        } else if (currentQueueIndex >= segStart && newRepeat < oldRepeat) {
          const offset = currentQueueIndex - segStart;
          if (offset >= newSize) {
            currentQueueIndex = segStart + newSize;
            currentActionProgress = 0;
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_move_group": {
      const { groupId, direction } = action;
      const firstIdx = state.run.queue.findIndex((e) => e.groupId === groupId);
      if (firstIdx < 0) return state;
      const range = getGroupRange(state.run.queue, firstIdx)!;

      const queue = [...state.run.queue];
      const groupItems = queue.splice(range.startIdx, range.endIdx - range.startIdx);

      let insertIdx: number;
      if (direction === "up") {
        if (range.startIdx === 0) return state;
        // Find the segment above
        const aboveIdx = range.startIdx - 1;
        if (queue[aboveIdx]?.groupId) {
          const aboveRange = getGroupRange([...queue], aboveIdx)!;
          insertIdx = aboveRange.startIdx;
        } else {
          insertIdx = aboveIdx;
        }
      } else {
        if (range.startIdx >= queue.length) return state; // group was at end
        // After splice, the item at range.startIdx is what was after the group
        const belowIdx = range.startIdx;
        if (belowIdx >= queue.length) return state;
        if (queue[belowIdx]?.groupId) {
          const belowRange = getGroupRange([...queue], belowIdx)!;
          insertIdx = belowRange.endIdx;
        } else {
          insertIdx = belowIdx + 1;
        }
      }

      queue.splice(insertIdx, 0, ...groupItems);

      // Recompute currentQueueIndex to keep pointing at the same active entry
      let { currentQueueIndex } = state.run;
      const { currentActionProgress } = state.run;
      if (state.run.status === "running" || state.run.status === "paused") {
        const resolved = resolveLogicalIndex(state.run.queue, currentQueueIndex);
        if (resolved) {
          const activeUid = state.run.queue[resolved.arrayIndex].uid;
          // Find the same UID in the new queue and compute its logical position
          let logicalPos = 0;
          let qi = 0;
          let found = false;
          while (qi < queue.length) {
            const e = queue[qi];
            if (e.groupId) {
              const r = getGroupRange(queue, qi)!;
              for (let j = r.startIdx; j < r.endIdx; j++) {
                if (queue[j].uid === activeUid) {
                  let posInIter = 0;
                  for (let k = r.startIdx; k < j; k++) posInIter += queue[k].repeat;
                  currentQueueIndex = logicalPos + resolved.groupIteration * r.iterationSize + posInIter + resolved.repeatWithinEntry;
                  found = true;
                  break;
                }
              }
              if (found) break;
              logicalPos += r.iterationSize * r.groupRepeat;
              qi = r.endIdx;
            } else {
              if (e.uid === activeUid) {
                currentQueueIndex = logicalPos + resolved.repeatWithinEntry;
                found = true;
                break;
              }
              if (e.repeat === -1) break;
              logicalPos += e.repeat;
              qi++;
            }
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_duplicate_group": {
      const { groupId } = action;
      const firstIdx = state.run.queue.findIndex((e) => e.groupId === groupId);
      if (firstIdx < 0) return state;
      const range = getGroupRange(state.run.queue, firstIdx)!;

      // Don't duplicate groups containing research techs
      const groupEntries = state.run.queue.slice(range.startIdx, range.endIdx);
      if (groupEntries.some((e) => getActionDef(e.actionId)?.category === "research")) return state;

      const newGroupId = makeGroupId();
      const duplicates: QueueEntry[] = groupEntries.map((e) => ({
        uid: makeUid(),
        actionId: e.actionId,
        repeat: e.repeat,
        groupId: newGroupId,
        groupRepeat: e.groupRepeat,
      }));

      const queue = [...state.run.queue];
      queue.splice(range.endIdx, 0, ...duplicates);

      let { currentQueueIndex } = state.run;

      if (state.run.status === "running" || state.run.status === "paused") {
        const segStart = getLogicalStartOfSegment(state.run.queue, firstIdx);
        const segSize = range.iterationSize * range.groupRepeat;
        if (currentQueueIndex >= segStart + segSize) {
          currentQueueIndex += segSize; // duplicate has same size
        }
      }

      const run = { ...state.run, queue, currentQueueIndex };
      return { ...state, run };
    }

    case "queue_clear": {
      const run = { ...state.run, queue: [], currentQueueIndex: 0, currentActionProgress: 0 };
      return { ...state, run };
    }

    case "queue_load": {
      // Remap group IDs so loaded groups get fresh consistent IDs
      const groupIdMap = new Map<string, string>();
      const newQueue = action.queue.map((e) => {
        const newEntry = { ...e, uid: makeUid() };
        if (e.groupId) {
          if (!groupIdMap.has(e.groupId)) {
            groupIdMap.set(e.groupId, makeGroupId());
          }
          newEntry.groupId = groupIdMap.get(e.groupId);
        }
        return newEntry;
      });
      const run = {
        ...state.run,
        queue: newQueue,
        currentQueueIndex: 0,
        currentActionProgress: 0,
        repeatLastAction: action.repeatLastAction,
      };
      return { ...state, run };
    }

    case "force_collapse": {
      if (state.run.status !== "running" && state.run.status !== "paused") return state;
      const run = {
        ...state.run,
        status: "collapsed" as const,
        collapseReason: action.reason ?? "You abandoned your civilization.",
      };
      const newState = { ...state, run };
      return {
        ...newState,
        endedRunSnapshot: {
          run,
          skills: newState.skills,
          skillsAtRunStart: newState.skillsAtRunStart,
          lastRunYear: newState.lastRunYear,
          totalRuns: newState.totalRuns + 1,
        },
      };
    }

    case "import_save": {
      const imported = action.state;
      // Pause if it was running
      if (imported.run.status === "running") {
        imported.run.status = "paused";
      }
      if (imported.endedRunSnapshot === undefined) imported.endedRunSnapshot = null;
      return imported;
    }

    case "hard_reset": {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem("epoch_skills");
      localStorage.removeItem("epoch_total_runs");
      localStorage.removeItem("epoch_total_winter_years");
      localStorage.removeItem("epoch_unlocked_actions");
      localStorage.removeItem("epoch_encountered_disasters");
      localStorage.removeItem("epoch_seen_event_types");
      localStorage.removeItem("epoch_auto_dismiss_event_types");
      localStorage.removeItem("epoch_auto_dismiss_run_summary");
      localStorage.removeItem("epoch_last_run_year");
      localStorage.removeItem("epoch_run_history");
      localStorage.removeItem("epoch_best_run_year");
      localStorage.removeItem("epoch_total_years_played");
      const skills = initialSkills();
      return {
        skills,
        run: createInitialRun(),
        totalRuns: 0,
        totalWinterYearsSurvived: 0,
        unlockedActions: [...DEFAULT_UNLOCKED_ACTIONS],
        encounteredDisasters: [],
        seenEventTypes: [],
        autoDismissEventTypes: [],
        autoDismissRunSummary: false,
        lastRunYear: 0,
        skillsAtRunStart: cloneSkills(skills),
        runHistory: [],
        bestRunYear: 0,
        totalYearsPlayed: 0,
        endedRunSnapshot: null,
        achievements: [],
      };
    }

    case "dismiss_summary":
      return { ...state, endedRunSnapshot: null };

    case "reset_auto_dismiss": {
      const autoDismissEventTypes = state.autoDismissEventTypes.filter(
        (id) => id !== action.eventId,
      );
      localStorage.setItem("epoch_auto_dismiss_event_types", JSON.stringify(autoDismissEventTypes));
      return { ...state, autoDismissEventTypes };
    }

    case "reset_all_auto_dismiss": {
      const autoDismissEventTypes: string[] = [];
      localStorage.setItem("epoch_auto_dismiss_event_types", JSON.stringify(autoDismissEventTypes));
      return { ...state, autoDismissEventTypes };
    }

    case "set_auto_dismiss_run_summary": {
      localStorage.setItem("epoch_auto_dismiss_run_summary", JSON.stringify(action.value));
      return { ...state, autoDismissRunSummary: action.value };
    }

    default:
      return state;
  }
}

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const intervalRef = useRef<number | null>(null);
  const autoRestartTimerRef = useRef<number | null>(null);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Manage interval based on run status
  useEffect(() => {
    if (state.run.status === "running") {
      stopInterval();
      intervalRef.current = window.setInterval(() => {
        dispatch({ type: "tick" });
      }, 100); // 10 ticks per second
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [state.run.status, stopInterval]);

  // Auto-save skills and unlocks on collapse/victory
  useEffect(() => {
    if (state.run.status === "collapsed" || state.run.status === "victory") {
      localStorage.setItem("epoch_skills", JSON.stringify(state.skills));
      localStorage.setItem("epoch_unlocked_actions", JSON.stringify(state.unlockedActions));
    }
  }, [state.run.status, state.skills, state.unlockedActions]);

  // Auto-save full game state periodically and on tab hide
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    const saveInterval = window.setInterval(() => {
      saveGameState(stateRef.current);
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveGameState(stateRef.current);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(saveInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Save on unmount too
      saveGameState(stateRef.current);
    };
  }, []);

  // Persist encountered disasters
  useEffect(() => {
    localStorage.setItem("epoch_encountered_disasters", JSON.stringify(state.encounteredDisasters));
  }, [state.encounteredDisasters]);

  // Auto-restart on collapse
  useEffect(() => {
    if (state.run.status === "collapsed" && state.run.autoRestart) {
      autoRestartTimerRef.current = window.setTimeout(() => {
        dispatch({ type: "reset_run" });
        // Start the new run after a brief delay for state to settle
        window.setTimeout(() => {
          dispatch({ type: "start_run" });
        }, 50);
      }, 1500);
    }
    return () => {
      if (autoRestartTimerRef.current !== null) {
        clearTimeout(autoRestartTimerRef.current);
        autoRestartTimerRef.current = null;
      }
    };
  }, [state.run.status, state.run.autoRestart]);

  return { state, dispatch };
}
