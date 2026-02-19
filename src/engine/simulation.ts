import type {
  GameState,
  RunState,
  Resources,
  LogEntry,
  QueueEntry,
} from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";
import {
  addXp,
  getSkillDurationMultiplier,
  getSkillOutputMultiplier,
} from "./skills.ts";

const FOOD_PER_POP = 1;
const WINTER_FOOD_PER_POP = 2; // doubled consumption during Great Cold
const POP_GROWTH_THRESHOLD = 20; // surplus food needed for pop growth
const RAIDER_YEAR = 2000;
const RAIDER_STRENGTH_REQUIRED = 30;
const WINTER_START = 5000;
const WINTER_END = 5500;

export function createInitialResources(): Resources {
  return {
    food: 50,
    population: 5,
    materials: 0,
    militaryStrength: 0,
  };
}

export function createInitialRun(): RunState {
  return {
    year: 0,
    maxYear: 10000,
    resources: createInitialResources(),
    queue: [],
    currentQueueIndex: 0,
    currentActionProgress: 0,
    status: "idle",
    speed: 1,
    log: [],
    autoRestart: true,
  };
}

function getEffectiveDuration(
  baseDuration: number,
  skillLevel: number,
): number {
  return Math.max(1, Math.round(baseDuration * getSkillDurationMultiplier(skillLevel)));
}

function getCurrentQueueEntry(run: RunState): { entry: QueueEntry; index: number } | null {
  if (run.queue.length === 0) return null;

  // Walk through queue respecting repeat counts
  let queueIdx = 0;
  let repeatsDone = 0;

  // Reconstruct position from currentQueueIndex which tracks
  // the logical position (counting repeats)
  let logicalPos = 0;
  for (let i = 0; i < run.queue.length; i++) {
    const entry = run.queue[i];
    const repeats = entry.repeat === -1 ? Infinity : entry.repeat;
    if (logicalPos + repeats > run.currentQueueIndex) {
      queueIdx = i;
      repeatsDone = run.currentQueueIndex - logicalPos;
      break;
    }
    logicalPos += repeats;
    if (i === run.queue.length - 1) {
      // Past end of queue: repeat last action
      return { entry: run.queue[run.queue.length - 1], index: run.currentQueueIndex };
    }
  }

  return { entry: run.queue[queueIdx], index: run.currentQueueIndex };
}

export function tick(state: GameState): GameState {
  const run = { ...state.run };
  const resources = { ...run.resources };
  const skills = { ...state.skills };
  const log: LogEntry[] = [...run.log];

  if (run.status !== "running") return state;

  run.year++;

  const isWinter = run.year >= WINTER_START && run.year <= WINTER_END;

  // Food consumption (doubled during winter)
  const foodPerPop = isWinter ? WINTER_FOOD_PER_POP : FOOD_PER_POP;
  const foodConsumed = resources.population * foodPerPop;
  resources.food -= foodConsumed;

  // Population starvation
  if (resources.food < 0) {
    const deaths = Math.min(
      resources.population - 1,
      Math.ceil(Math.abs(resources.food) / 2),
    );
    resources.population = Math.max(1, resources.population - deaths);
    resources.food = 0;
    if (deaths > 0) {
      log.push({
        year: run.year,
        message: `${deaths} people starved.`,
        type: "danger",
      });
    }
  }

  // Population growth (not during winter)
  if (!isWinter && resources.food > resources.population * FOOD_PER_POP + POP_GROWTH_THRESHOLD) {
    resources.population++;
  }

  // Process current action
  const current = getCurrentQueueEntry(run);
  if (current) {
    const { entry } = current;
    const def = getActionDef(entry.actionId);
    if (def) {
      const skillLevel = skills[def.skill].level;
      const duration = getEffectiveDuration(def.baseDuration, skillLevel);
      const outputMult = getSkillOutputMultiplier(skillLevel);

      // Check material cost at start of action
      if (run.currentActionProgress === 0 && def.materialCost && def.materialCost > resources.materials) {
        // Not enough materials, skip this action and advance queue
        log.push({
          year: run.year,
          message: `Cannot ${def.name}: need ${def.materialCost} materials (have ${Math.floor(resources.materials)}).`,
          type: "warning",
        });
        run.currentActionProgress = 0;
        run.currentQueueIndex++;
      } else {
        // Deduct materials at start of action
        if (run.currentActionProgress === 0 && def.materialCost) {
          resources.materials -= def.materialCost;
        }

        // Per-tick effects
        applyActionPerTick(entry.actionId, resources, outputMult, isWinter);

        // XP per tick
        skills[def.skill] = addXp(skills[def.skill], 1);

        run.currentActionProgress++;

        // Action complete
        if (run.currentActionProgress >= duration) {
          applyActionCompletion(entry.actionId, resources, outputMult, log, run.year);
          skills[def.skill] = addXp(skills[def.skill], 5);
          run.currentActionProgress = 0;

          // Advance logical queue position
          run.currentQueueIndex++;
        }
      }
    }
  }

  // Raider event
  if (run.year === RAIDER_YEAR) {
    if (resources.militaryStrength < RAIDER_STRENGTH_REQUIRED) {
      run.status = "collapsed";
      run.collapseReason = `Raiders attacked at year ${RAIDER_YEAR}. Military strength ${Math.floor(resources.militaryStrength)} < ${RAIDER_STRENGTH_REQUIRED} required.`;
      log.push({
        year: run.year,
        message: run.collapseReason,
        type: "danger",
      });
    } else {
      log.push({
        year: run.year,
        message: "Raiders repelled! Military holds strong.",
        type: "success",
      });
    }
  }

  // Winter event
  if (run.year === WINTER_START) {
    log.push({
      year: run.year,
      message: "The Great Cold begins. Farming disabled, food consumption doubled.",
      type: "warning",
    });
  }
  if (run.year === WINTER_END) {
    if (resources.population > 0 && resources.food > 0) {
      log.push({
        year: run.year,
        message: "The Great Cold ends. Your civilization survived!",
        type: "success",
      });
    }
  }

  // Check collapse from depopulation
  if (resources.population <= 0) {
    run.status = "collapsed";
    run.collapseReason = "All population perished.";
    log.push({
      year: run.year,
      message: run.collapseReason,
      type: "danger",
    });
  }

  // Check victory
  if (run.year >= run.maxYear && run.status === "running") {
    run.status = "victory";
    log.push({
      year: run.year,
      message: "Civilization survived the full epoch! Victory!",
      type: "success",
    });
  }

  run.resources = resources;
  run.log = log;

  return { ...state, run, skills };
}

function applyActionPerTick(
  actionId: string,
  resources: Resources,
  outputMult: number,
  isWinter: boolean,
): void {
  switch (actionId) {
    case "farm":
      if (!isWinter) {
        resources.food += Math.floor(2 * outputMult);
      }
      break;
    case "gather_materials":
      resources.materials += Math.floor(1 * outputMult);
      break;
    case "train_militia":
      resources.militaryStrength += 0.2 * outputMult;
      break;
    case "scout":
      resources.militaryStrength += 0.05 * outputMult;
      break;
  }
}

function applyActionCompletion(
  actionId: string,
  resources: Resources,
  outputMult: number,
  log: LogEntry[],
  year: number,
): void {
  switch (actionId) {
    case "build_hut":
      log.push({ year, message: "Hut built. Population capacity increased.", type: "info" });
      resources.population += 2;
      break;
    case "build_granary":
      log.push({ year, message: "Granary built. Food preservation improved.", type: "info" });
      resources.food += Math.floor(50 * outputMult);
      break;
    case "research_tools":
      log.push({ year, message: "Tool research complete.", type: "info" });
      break;
  }
}
