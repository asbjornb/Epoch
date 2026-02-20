import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  GameState,
  QueueEntry,
  ActionId,
  RunHistoryEntry,
} from "../types/game.ts";
import { ACTION_DEFS } from "../types/actions.ts";
import { initialSkills, isActionUnlocked } from "../engine/skills.ts";
import { createInitialRun, tick } from "../engine/simulation.ts";

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
  | { type: "queue_add"; actionId: ActionId; repeat?: number }
  | { type: "queue_remove"; uid: string }
  | { type: "queue_move"; uid: string; direction: "up" | "down" }
  | { type: "queue_set_repeat"; uid: string; repeat: number }
  | { type: "queue_clear" }
  | { type: "force_collapse" }
  | { type: "import_save"; state: GameState }
  | { type: "hard_reset" };

let uidCounter = 0;
function makeUid(): string {
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

const DEFAULT_UNLOCKED_ACTIONS: ActionId[] = ["farm"];

function loadUnlockedActions(): ActionId[] {
  try {
    const saved = localStorage.getItem("epoch_unlocked_actions");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [...DEFAULT_UNLOCKED_ACTIONS];
}

/** Check if any new actions should be unlocked based on current skills */
function computeSkillUnlocks(current: ActionId[], skills: GameState["skills"]): ActionId[] {
  let updated = current;
  for (const def of ACTION_DEFS) {
    if (!updated.includes(def.id) && isActionUnlocked(skills, def.skill, def.unlockLevel)) {
      // Only auto-unlock skill-gated actions (unlockLevel > 0) when skill level is met
      if (def.unlockLevel > 0) {
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

function cloneSkills(skills: GameState["skills"]): GameState["skills"] {
  return {
    farming: { ...skills.farming },
    building: { ...skills.building },
    research: { ...skills.research },
    military: { ...skills.military },
  };
}

const SAVE_KEY = "epoch_save";

function saveGameState(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

export function loadGameState(): GameState | null {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) return JSON.parse(saved);
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
    unlockedActions: computeSkillUnlocks(unlocked, skills),
    encounteredDisasters: loadEncounteredDisasters(),
    seenEventTypes: loadSeenEventTypes(),
    autoDismissEventTypes: loadAutoDismissEventTypes(),
    lastRunYear: loadLastRunYear(),
    skillsAtRunStart: cloneSkills(skills),
    runHistory: loadRunHistory(),
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "tick": {
      let tickedState = tick(state);

      // When food cap is reached, unlock the other starting actions
      const { resources } = tickedState.run;
      if (resources.food >= resources.foodStorage) {
        const startingUnlocks: ActionId[] = ["gather_materials", "train_militia", "research_tools"];
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
            message: "Your food stores are full. Your people now have time to explore new pursuits: gathering materials, military training, and tool research.",
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
            message: "Food storage full — new skills unlocked: Building, Military, Research.",
            type: "success" as const,
          }];

          tickedState = { ...tickedState, unlockedActions, run };
        }
      }

      // Check if skills unlocked new actions
      const newUnlocks = computeSkillUnlocks(tickedState.unlockedActions, tickedState.skills);
      if (newUnlocks !== tickedState.unlockedActions) {
        localStorage.setItem("epoch_unlocked_actions", JSON.stringify(newUnlocks));
        return { ...tickedState, unlockedActions: newUnlocks };
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
      const historyEntry: RunHistoryEntry = {
        runNumber: totalRuns,
        year: state.run.year,
        outcome,
        collapseReason: state.run.collapseReason,
        queue: state.run.queue.map((e) => ({ actionId: e.actionId, repeat: e.repeat })),
        resources: { ...state.run.resources },
        totalFoodSpoiled: state.run.totalFoodSpoiled || 0,
      };
      const runHistory = [historyEntry, ...state.runHistory].slice(0, 10);
      localStorage.setItem("epoch_run_history", JSON.stringify(runHistory));

      // Check skill-based unlocks
      const unlockedActions = computeSkillUnlocks(state.unlockedActions, state.skills);
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
        unlockedActions,
        lastRunYear,
        runHistory,
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

    case "toggle_auto_restart": {
      const run = { ...state.run, autoRestart: !state.run.autoRestart };
      return { ...state, run };
    }

    case "toggle_repeat_last_action": {
      const run = { ...state.run, repeatLastAction: !state.run.repeatLastAction };
      return { ...state, run };
    }

    case "queue_add": {
      const entry: QueueEntry = {
        uid: makeUid(),
        actionId: action.actionId,
        repeat: action.repeat ?? 1,
      };
      const run = { ...state.run, queue: [...state.run.queue, entry] };
      return { ...state, run };
    }

    case "queue_remove": {
      const queue = state.run.queue.filter((e) => e.uid !== action.uid);
      const run = { ...state.run, queue };
      return { ...state, run };
    }

    case "queue_move": {
      const queue = [...state.run.queue];
      const idx = queue.findIndex((e) => e.uid === action.uid);
      if (idx < 0) return state;
      const swapIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= queue.length) return state;
      [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
      const run = { ...state.run, queue };
      return { ...state, run };
    }

    case "queue_set_repeat": {
      const queue = state.run.queue.map((e) =>
        e.uid === action.uid ? { ...e, repeat: action.repeat } : e,
      );
      const run = { ...state.run, queue };
      return { ...state, run };
    }

    case "queue_clear": {
      const run = { ...state.run, queue: [], currentQueueIndex: 0, currentActionProgress: 0 };
      return { ...state, run };
    }

    case "force_collapse": {
      if (state.run.status !== "running" && state.run.status !== "paused") return state;
      const run = {
        ...state.run,
        status: "collapsed" as const,
        collapseReason: "You abandoned your civilization.",
      };
      return { ...state, run };
    }

    case "import_save": {
      const imported = action.state;
      // Pause if it was running
      if (imported.run.status === "running") {
        imported.run.status = "paused";
      }
      return imported;
    }

    case "hard_reset": {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem("epoch_skills");
      localStorage.removeItem("epoch_total_runs");
      localStorage.removeItem("epoch_unlocked_actions");
      localStorage.removeItem("epoch_encountered_disasters");
      localStorage.removeItem("epoch_seen_event_types");
      localStorage.removeItem("epoch_auto_dismiss_event_types");
      localStorage.removeItem("epoch_last_run_year");
      localStorage.removeItem("epoch_run_history");
      const skills = initialSkills();
      return {
        skills,
        run: createInitialRun(),
        totalRuns: 0,
        unlockedActions: [...DEFAULT_UNLOCKED_ACTIONS],
        encounteredDisasters: [],
        seenEventTypes: [],
        autoDismissEventTypes: [],
        lastRunYear: 0,
        skillsAtRunStart: cloneSkills(skills),
        runHistory: [],
      };
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
