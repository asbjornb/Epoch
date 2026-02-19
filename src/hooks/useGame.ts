import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  GameState,
  QueueEntry,
  ActionId,
  SavedQueue,
} from "../types/game.ts";
import { initialSkills } from "../engine/skills.ts";
import { createInitialRun, tick } from "../engine/simulation.ts";

type GameAction =
  | { type: "tick" }
  | { type: "start_run" }
  | { type: "pause_run" }
  | { type: "resume_run" }
  | { type: "reset_run" }
  | { type: "set_speed"; speed: number }
  | { type: "queue_add"; actionId: ActionId; repeat?: number }
  | { type: "queue_remove"; uid: string }
  | { type: "queue_move"; uid: string; direction: "up" | "down" }
  | { type: "queue_set_repeat"; uid: string; repeat: number }
  | { type: "queue_clear" }
  | { type: "queue_load"; entries: QueueEntry[] }
  | { type: "save_queue"; name: string }
  | { type: "delete_saved_queue"; name: string };

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

function loadSavedQueues(): SavedQueue[] {
  try {
    const saved = localStorage.getItem("epoch_saved_queues");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

function loadTotalRuns(): number {
  try {
    const saved = localStorage.getItem("epoch_total_runs");
    if (saved) return parseInt(saved, 10);
  } catch { /* ignore */ }
  return 0;
}

function createInitialState(): GameState {
  return {
    skills: loadSkills(),
    run: createInitialRun(),
    totalRuns: loadTotalRuns(),
    savedQueues: loadSavedQueues(),
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "tick":
      return tick(state);

    case "start_run": {
      const run = { ...state.run, status: "running" as const };
      return { ...state, run };
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
      return {
        ...state,
        run: createInitialRun(),
        totalRuns,
      };
    }

    case "set_speed": {
      const run = { ...state.run, speed: action.speed };
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

    case "queue_load": {
      const queue = action.entries.map((e) => ({ ...e, uid: makeUid() }));
      const run = { ...state.run, queue, currentQueueIndex: 0, currentActionProgress: 0 };
      return { ...state, run };
    }

    case "save_queue": {
      const savedQueues = [
        ...state.savedQueues.filter((q) => q.name !== action.name),
        { name: action.name, entries: state.run.queue.map((e) => ({ ...e })) },
      ];
      localStorage.setItem("epoch_saved_queues", JSON.stringify(savedQueues));
      return { ...state, savedQueues };
    }

    case "delete_saved_queue": {
      const savedQueues = state.savedQueues.filter((q) => q.name !== action.name);
      localStorage.setItem("epoch_saved_queues", JSON.stringify(savedQueues));
      return { ...state, savedQueues };
    }

    default:
      return state;
  }
}

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, null, createInitialState);
  const intervalRef = useRef<number | null>(null);

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
      const ms = Math.max(10, Math.floor(1000 / state.run.speed));
      intervalRef.current = window.setInterval(() => {
        dispatch({ type: "tick" });
      }, ms);
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [state.run.status, state.run.speed, stopInterval]);

  // Auto-save skills on collapse/victory
  useEffect(() => {
    if (state.run.status === "collapsed" || state.run.status === "victory") {
      localStorage.setItem("epoch_skills", JSON.stringify(state.skills));
    }
  }, [state.run.status, state.skills]);

  return { state, dispatch };
}
