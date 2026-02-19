import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  GameState,
  QueueEntry,
  ActionId,
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
  | { type: "dismiss_event" }
  | { type: "queue_add"; actionId: ActionId; repeat?: number }
  | { type: "queue_remove"; uid: string }
  | { type: "queue_move"; uid: string; direction: "up" | "down" }
  | { type: "queue_set_repeat"; uid: string; repeat: number }
  | { type: "queue_clear" };

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

function loadLastRunYear(): number {
  try {
    const saved = localStorage.getItem("epoch_last_run_year");
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

function createInitialState(): GameState {
  const skills = loadSkills();
  const unlocked = loadUnlockedActions();
  return {
    skills,
    run: createInitialRun(),
    totalRuns: loadTotalRuns(),
    unlockedActions: computeSkillUnlocks(unlocked, skills),
    encounteredDisasters: loadEncounteredDisasters(),
    seenEventTypes: loadSeenEventTypes(),
    lastRunYear: loadLastRunYear(),
    skillsAtRunStart: cloneSkills(skills),
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "tick": {
      const tickedState = tick(state);
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

      // After first run, unlock the other three starting actions
      let unlockedActions = state.unlockedActions;
      if (state.totalRuns === 0) {
        const firstRunUnlocks: ActionId[] = ["gather_materials", "train_militia", "research_tools"];
        unlockedActions = [...unlockedActions];
        for (const id of firstRunUnlocks) {
          if (!unlockedActions.includes(id)) {
            unlockedActions.push(id);
          }
        }
      }
      // Also check skill-based unlocks
      unlockedActions = computeSkillUnlocks(unlockedActions, state.skills);
      localStorage.setItem("epoch_unlocked_actions", JSON.stringify(unlockedActions));

      // Preserve queue and autoRestart setting from previous run
      const newRun = createInitialRun();
      newRun.queue = state.run.queue.map((e) => ({ ...e }));
      newRun.autoRestart = state.run.autoRestart;
      return {
        ...state,
        run: newRun,
        totalRuns,
        unlockedActions,
        lastRunYear,
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

    case "toggle_auto_restart": {
      const run = { ...state.run, autoRestart: !state.run.autoRestart };
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
