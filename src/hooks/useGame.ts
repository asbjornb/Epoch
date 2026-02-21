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
import { createInitialRun, tick, getEffectiveDuration } from "../engine/simulation.ts";

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
  | { type: "queue_clear" }
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
  };
}

/** Compute how many times each queue entry actually completed during a run. */
function computeQueueCompletions(
  queue: QueueEntry[],
  currentQueueIndex: number,
  repeatLastAction: boolean,
): number[] {
  const completions: number[] = new Array(queue.length).fill(0);
  if (queue.length === 0) return completions;

  let logicalPos = 0;
  for (let i = 0; i < queue.length; i++) {
    const repeats = queue[i].repeat;

    if (repeats === -1) {
      // Infinite repeat: all remaining completions go to this entry
      completions[i] = Math.max(0, currentQueueIndex - logicalPos);
      return completions;
    }

    if (logicalPos + repeats > currentQueueIndex) {
      // Partially completed entry — entries after this never started
      completions[i] = Math.max(0, currentQueueIndex - logicalPos);
      return completions;
    }

    completions[i] = repeats;
    logicalPos += repeats;
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
        let entryLogicalStart = 0;
        let reachable = true;
        for (let i = 0; i < entryIdx; i++) {
          const r = state.run.queue[i].repeat;
          if (r === -1) { reachable = false; break; }
          entryLogicalStart += r;
        }

        if (reachable) {
          const entryEnd = entryLogicalStart + removedEntry.repeat;
          if (currentQueueIndex >= entryEnd) {
            // Past the removed entry: shift back
            currentQueueIndex -= removedEntry.repeat;
          } else if (currentQueueIndex >= entryLogicalStart) {
            // Inside the removed entry: snap to its start (now the next entry)
            currentQueueIndex = entryLogicalStart;
            currentActionProgress = 0;
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_move": {
      const queue = [...state.run.queue];
      const idx = queue.findIndex((e) => e.uid === action.uid);
      if (idx < 0) return state;
      const swapIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= queue.length) return state;

      let { currentQueueIndex, currentActionProgress } = state.run;

      // Before swap: find which entry+repeat the index currently points to
      let activeEntryUid: string | null = null;
      let repeatWithinEntry = 0;
      if (state.run.status === "running" || state.run.status === "paused") {
        let logicalPos = 0;
        for (const entry of queue) {
          const r = entry.repeat;
          if (r === -1 || logicalPos + r > currentQueueIndex) {
            activeEntryUid = entry.uid;
            repeatWithinEntry = currentQueueIndex - logicalPos;
            break;
          }
          logicalPos += r;
        }
      }

      [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];

      // After swap: recompute index to keep pointing at the same entry+repeat
      if (activeEntryUid) {
        let logicalPos = 0;
        for (const entry of queue) {
          if (entry.uid === activeEntryUid) {
            currentQueueIndex = logicalPos + repeatWithinEntry;
            break;
          }
          const r = entry.repeat;
          if (r === -1) break;
          logicalPos += r;
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
        let entryLogicalStart = 0;
        let reachable = true;
        for (let i = 0; i < entryIdx; i++) {
          const r = state.run.queue[i].repeat;
          if (r === -1) { reachable = false; break; } // infinite entry before; this one is unreachable
          entryLogicalStart += r;
        }

        if (reachable && oldRepeat !== -1 && newRepeat !== -1) {
          const entryEnd = entryLogicalStart + oldRepeat;
          if (currentQueueIndex >= entryEnd) {
            // Already past this entry: shift index by the delta
            currentQueueIndex += newRepeat - oldRepeat;
          } else if (currentQueueIndex >= entryLogicalStart && newRepeat < oldRepeat) {
            // Currently inside this entry and reducing repeats
            const repeatWithinEntry = currentQueueIndex - entryLogicalStart;
            if (repeatWithinEntry >= newRepeat) {
              // Current position no longer exists; advance to next entry
              currentQueueIndex = entryLogicalStart + newRepeat;
              currentActionProgress = 0;
            }
          }
        }
      }

      const run = { ...state.run, queue, currentQueueIndex, currentActionProgress };
      return { ...state, run };
    }

    case "queue_clear": {
      const run = { ...state.run, queue: [], currentQueueIndex: 0, currentActionProgress: 0 };
      return { ...state, run };
    }

    case "queue_load": {
      const newQueue = action.queue.map((e) => ({ ...e, uid: makeUid() }));
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
