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

import type { DisasterInfo } from "../types/game.ts";

const FOOD_PER_POP = 1;
const WINTER_FOOD_PER_POP = 2; // doubled consumption during Great Cold
const POP_GROWTH_THRESHOLD = 20; // surplus food needed for pop growth
const RAIDER_YEAR = 2000;
const RAIDER_STRENGTH_REQUIRED = 30;
const WINTER_START = 5000;
const WINTER_END = 5500;
const INITIAL_MAX_POP = 8;
const INITIAL_FOOD_STORAGE = 200;
const SPOILAGE_RATE = 0.02; // 2% of excess food spoils per tick

export const DISASTERS: DisasterInfo[] = [
  { id: "raider", name: "Raider Era", year: RAIDER_YEAR, color: "#8a3a3a" },
  { id: "winter", name: "Great Cold", year: WINTER_START, color: "#6aa8d0" },
];

export function createInitialResources(): Resources {
  return {
    food: 0,
    population: 5,
    maxPopulation: INITIAL_MAX_POP,
    materials: 0,
    militaryStrength: 0,
    wallDefense: 0,
    foodStorage: INITIAL_FOOD_STORAGE,
    techLevel: 0,
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

/** Tech level gives a 10% output bonus per level */
function getTechMultiplier(techLevel: number): number {
  return 1.0 + techLevel * 0.1;
}

/** Population productivity: gentle scaling, sqrt-based */
function getPopulationMultiplier(population: number): number {
  return Math.max(1.0, Math.sqrt(population / 5));
}

function getCurrentQueueEntry(run: RunState): { entry: QueueEntry; index: number } | null {
  if (run.queue.length === 0) return null;

  let queueIdx = 0;

  let logicalPos = 0;
  for (let i = 0; i < run.queue.length; i++) {
    const entry = run.queue[i];
    const repeats = entry.repeat === -1 ? Infinity : entry.repeat;
    if (logicalPos + repeats > run.currentQueueIndex) {
      queueIdx = i;
      break;
    }
    logicalPos += repeats;
    if (i === run.queue.length - 1) {
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
      resources.population,
      Math.ceil(Math.abs(resources.food) / 2),
    );
    resources.population = Math.max(0, resources.population - deaths);
    resources.food = 0;
    if (deaths > 0) {
      log.push({
        year: run.year,
        message: `${deaths} people starved.`,
        type: "danger",
      });
    }
  }

  // Food spoilage: food beyond storage cap decays
  if (resources.food > resources.foodStorage) {
    const excess = resources.food - resources.foodStorage;
    const spoiled = Math.ceil(excess * SPOILAGE_RATE);
    resources.food -= spoiled;
  }

  // Population growth (not during winter, respects housing cap)
  if (
    !isWinter &&
    resources.population < resources.maxPopulation &&
    resources.food > resources.population * FOOD_PER_POP + POP_GROWTH_THRESHOLD
  ) {
    resources.population++;
  }

  // Combined output multipliers from tech and population
  const techMult = getTechMultiplier(resources.techLevel);
  const popMult = getPopulationMultiplier(resources.population);

  // Process current action
  const current = getCurrentQueueEntry(run);
  if (current) {
    const { entry } = current;
    const def = getActionDef(entry.actionId);
    if (def) {
      const skillLevel = skills[def.skill].level;
      const duration = getEffectiveDuration(def.baseDuration, skillLevel);
      const outputMult = getSkillOutputMultiplier(skillLevel) * techMult * popMult;

      // Check material cost at start of action
      if (run.currentActionProgress === 0 && def.materialCost && def.materialCost > resources.materials) {
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
          run.currentQueueIndex++;
        }
      }
    }
  }

  // Raider event - wall defense counts toward total defense
  if (run.year === RAIDER_YEAR) {
    const totalDefense = resources.militaryStrength + resources.wallDefense;
    if (totalDefense < RAIDER_STRENGTH_REQUIRED) {
      run.status = "collapsed";
      run.collapseReason = `Raiders attacked at year ${RAIDER_YEAR}. Total defense ${Math.floor(totalDefense)} (military ${Math.floor(resources.militaryStrength)} + walls ${Math.floor(resources.wallDefense)}) < ${RAIDER_STRENGTH_REQUIRED} required.`;
      log.push({
        year: run.year,
        message: run.collapseReason,
        type: "danger",
      });
    } else {
      // Reward for surviving raiders
      const foodBonus = Math.floor(50 * techMult);
      const materialBonus = 20;
      resources.food += foodBonus;
      resources.materials += materialBonus;
      skills.military = addXp(skills.military, 50);
      log.push({
        year: run.year,
        message: `Raiders repelled! Defense held (${Math.floor(totalDefense)}/${RAIDER_STRENGTH_REQUIRED}). Gained ${foodBonus} food, ${materialBonus} materials, and military XP.`,
        type: "success",
      });
    }
  }

  // Winter event
  if (run.year === WINTER_START) {
    log.push({
      year: run.year,
      message: `The Great Cold begins. Farming disabled, food consumption doubled. Food stored: ${Math.floor(resources.food)}/${Math.floor(resources.foodStorage)}.`,
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
    run.collapseReason = "Your civilization starved. All population perished.";
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

  // Track encountered disasters
  let encounteredDisasters = state.encounteredDisasters;
  for (const d of DISASTERS) {
    if (run.year >= d.year && !encounteredDisasters.includes(d.id)) {
      encounteredDisasters = [...encounteredDisasters, d.id];
    }
  }

  return { ...state, run, skills, encounteredDisasters };
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
    case "preserve_food":
      // Produces food even in winter (at reduced rate when not winter)
      if (isWinter) {
        resources.food += Math.floor(1 * outputMult);
      } else {
        resources.food += Math.max(1, Math.floor(0.5 * outputMult));
      }
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
      resources.maxPopulation += 3;
      log.push({ year, message: `Hut built. Population capacity now ${resources.maxPopulation}.`, type: "info" });
      resources.population += 2;
      break;
    case "build_granary":
      resources.foodStorage += Math.floor(150 * outputMult);
      log.push({ year, message: `Granary built. Food storage now ${Math.floor(resources.foodStorage)}.`, type: "info" });
      break;
    case "build_wall":
      resources.wallDefense += Math.floor(8 * outputMult);
      log.push({ year, message: `Wall built. Wall defense now ${Math.floor(resources.wallDefense)}.`, type: "info" });
      break;
    case "research_tools":
      resources.techLevel += 1;
      log.push({ year, message: `Tool research complete. Tech level ${resources.techLevel} (+${resources.techLevel * 10}% output).`, type: "info" });
      break;
    case "preserve_food":
      resources.foodStorage += Math.floor(30 * outputMult);
      log.push({ year, message: `Food preservation improved. Storage now ${Math.floor(resources.foodStorage)}.`, type: "info" });
      break;
  }
}
