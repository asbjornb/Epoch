import type {
  GameState,
  RunState,
  Resources,
  LogEntry,
  QueueEntry,
  EventPopup,
  ActionCategory,
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
const RAIDER_YEAR = 1500;
const RAIDER_STRENGTH_REQUIRED = 250;
const WINTER_START = 4000;
const WINTER_END = 4500;
const INITIAL_MAX_POP = 2;
const INITIAL_FOOD_STORAGE = 200;
const SPOILAGE_DIVISOR = 400; // tuning constant for quadratic spoilage curve

/** Smooth spoilage: scales quadratically with food, reduced by foodStorage.
 *  At base storage (200): ~0.5/tick at 200 food, ~2/tick at 400, ~3.1/tick at 500. */
function calculateSpoilage(food: number, foodStorage: number): number {
  if (food <= 0 || foodStorage <= 0) return 0;
  return (food * food) / (SPOILAGE_DIVISOR * foodStorage);
}

export const DISASTERS: DisasterInfo[] = [
  { id: "raider", name: "Raider Era", year: RAIDER_YEAR, color: "#8b5555" },
  { id: "winter", name: "Great Cold", year: WINTER_START, color: "#7a9aad" },
];

export function createInitialResources(): Resources {
  return {
    food: 2,
    population: 2,
    maxPopulation: INITIAL_MAX_POP,
    materials: 0,
    militaryStrength: 0,
    wallDefense: 0,
    foodStorage: INITIAL_FOOD_STORAGE,
    researchedTechs: [],
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
    repeatLastAction: true,
    pendingEvents: [],
    pausedByEvent: false,
    totalFoodSpoiled: 0,
  };
}

export function getEffectiveDuration(
  baseDuration: number,
  skillLevel: number,
  population: number = 1,
  category: ActionCategory = "resource",
): number {
  const skillDuration = baseDuration * getSkillDurationMultiplier(skillLevel);
  if (category === "building") {
    return Math.max(1, Math.ceil(skillDuration / population));
  }
  if (category === "research") {
    return Math.max(1, Math.ceil(skillDuration / Math.pow(population, 0.8)));
  }
  // Resource and military: population doesn't affect duration
  return Math.max(1, Math.round(skillDuration));
}

/** Per-action tech multiplier based on which techs have been researched */
function getTechMultiplierForAction(researchedTechs: string[], actionId: string): number {
  let mult = 1.0;
  if (researchedTechs.includes("research_tools") && actionId === "gather_materials") {
    mult *= 1.5;
  }
  if (researchedTechs.includes("research_agriculture") && actionId === "farm") {
    mult *= 1.5;
  }
  if (researchedTechs.includes("research_tactics") && (actionId === "train_militia" || actionId === "scout")) {
    mult *= 1.5;
  }
  return mult;
}

/** Check if an action is a research tech (single-use) */
function isResearchTech(actionId: string): boolean {
  return actionId.startsWith("research_");
}

/** Population output multiplier: linear for resource/military, none for building/research */
function getPopulationOutputMultiplier(population: number, category: ActionCategory): number {
  if (category === "resource" || category === "military") {
    return population;
  }
  return 1;
}

function getCurrentQueueEntry(run: RunState): { entry: QueueEntry; index: number } | null {
  if (run.queue.length === 0) return null;

  let queueIdx = 0;

  let logicalPos = 0;
  for (let i = 0; i < run.queue.length; i++) {
    const entry = run.queue[i];
    const repeats = entry.repeat;
    if (repeats === -1 || logicalPos + repeats > run.currentQueueIndex) {
      queueIdx = i;
      break;
    }
    logicalPos += repeats;
    if (i === run.queue.length - 1) {
      // Queue exhausted — repeat last action or signal end
      if (run.repeatLastAction) {
        return { entry: run.queue[run.queue.length - 1], index: run.currentQueueIndex };
      }
      return null;
    }
  }

  return { entry: run.queue[queueIdx], index: run.currentQueueIndex };
}

export function tick(state: GameState): GameState {
  const run = { ...state.run };
  const resources = { ...run.resources };
  const skills = { ...state.skills };
  const log: LogEntry[] = [...run.log];
  const pendingEvents: EventPopup[] = [...run.pendingEvents];

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

  // Food spoilage: smooth quadratic curve, always applies
  const spoiled = calculateSpoilage(resources.food, resources.foodStorage);
  if (spoiled > 0.001) {
    resources.food -= spoiled;
    run.totalFoodSpoiled = (run.totalFoodSpoiled || 0) + spoiled;
    // Log spoilage periodically (every 500 years)
    if (run.year % 500 === 0) {
      log.push({
        year: run.year,
        message: `Food spoilage: ${spoiled.toFixed(1)}/yr lost. Total spoiled: ${Math.floor(run.totalFoodSpoiled)}.`,
        type: "warning",
      });
    }
  }

  // Population growth (not during winter, respects housing cap)
  if (
    !isWinter &&
    resources.population < resources.maxPopulation &&
    resources.food > resources.population * FOOD_PER_POP + POP_GROWTH_THRESHOLD
  ) {
    resources.population++;
  }

  // Process current action
  const current = getCurrentQueueEntry(run);
  if (!current && !run.repeatLastAction && run.queue.length > 0) {
    // Queue exhausted and not repeating — pause for player input
    run.status = "paused";
    log.push({
      year: run.year,
      message: "Queue complete. Add more actions or toggle repeat.",
      type: "info",
    });
  } else if (current) {
    const { entry } = current;
    const def = getActionDef(entry.actionId);
    if (def) {
      // Skip already-researched techs
      if (run.currentActionProgress === 0 && isResearchTech(entry.actionId) && resources.researchedTechs.includes(entry.actionId)) {
        run.currentActionProgress = 0;
        run.currentQueueIndex++;
      } else {
        const skillLevel = skills[def.skill].level;
        const duration = getEffectiveDuration(def.baseDuration, skillLevel, resources.population, def.category);
        const popMult = getPopulationOutputMultiplier(resources.population, def.category);
        const techMult = getTechMultiplierForAction(resources.researchedTechs, entry.actionId);
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
            run.currentActionProgress = 0;
            run.currentQueueIndex++;
          }
        }
      }
    }
  }

  // Raider event - wall defense counts toward total defense
  if (run.year === RAIDER_YEAR) {
    const totalDefense = resources.militaryStrength + resources.wallDefense;
    if (totalDefense < RAIDER_STRENGTH_REQUIRED) {
      run.status = "collapsed";
      const defenseDetail = `Total defense ${Math.floor(totalDefense)} (military ${Math.floor(resources.militaryStrength)} + walls ${Math.floor(resources.wallDefense)})`;
      const hasSeenDefense = state.seenEventTypes.includes("raider_survived");
      run.collapseReason = hasSeenDefense
        ? `Raiders attacked at year ${RAIDER_YEAR}. ${defenseDetail} < ${RAIDER_STRENGTH_REQUIRED} required.`
        : `Raiders attacked at year ${RAIDER_YEAR}. ${defenseDetail} was not enough.`;
      log.push({
        year: run.year,
        message: run.collapseReason,
        type: "danger",
      });
    } else {
      // Reward for surviving raiders
      const foodBonus = 50;
      const materialBonus = 20;
      resources.food += foodBonus;
      resources.materials += materialBonus;
      skills.military = addXp(skills.military, 50);
      const raidMsg = `Raiders repelled! Defense held (${Math.floor(totalDefense)}/${RAIDER_STRENGTH_REQUIRED}). Gained ${foodBonus} food, ${materialBonus} materials, and military XP.`;
      log.push({ year: run.year, message: raidMsg, type: "success" });
      const firstTime = !state.seenEventTypes.includes("raider_survived");
      const shouldPause = !state.autoDismissEventTypes.includes("raider_survived");
      pendingEvents.push({
        eventId: "raider_survived",
        title: "Raiders Repelled!",
        message: raidMsg,
        type: "success",
        year: run.year,
        firstTime,
      });
      if (shouldPause) {
        run.status = "paused";
        run.pausedByEvent = true;
      }
    }
  }

  // Winter event
  if (run.year === WINTER_START) {
    const winterSpoilage = calculateSpoilage(resources.food, resources.foodStorage);
    const winterMsg = `The Great Cold begins. Farming disabled, food consumption doubled. Food: ${Math.floor(resources.food)} (spoilage: ${winterSpoilage.toFixed(1)}/yr).`;
    log.push({ year: run.year, message: winterMsg, type: "warning" });
    const firstTime = !state.seenEventTypes.includes("winter_start");
    const shouldPause = !state.autoDismissEventTypes.includes("winter_start");
    pendingEvents.push({
      eventId: "winter_start",
      title: "The Great Cold",
      message: winterMsg,
      type: "warning",
      year: run.year,
      firstTime,
    });
    if (shouldPause) {
      run.status = "paused";
      run.pausedByEvent = true;
    }
  }
  if (run.year === WINTER_END) {
    if (resources.population > 0 && resources.food > 0) {
      const winterEndMsg = "The Great Cold ends. Your civilization survived!";
      log.push({ year: run.year, message: winterEndMsg, type: "success" });
      const firstTime = !state.seenEventTypes.includes("winter_end");
      const shouldPause = !state.autoDismissEventTypes.includes("winter_end");
      pendingEvents.push({
        eventId: "winter_end",
        title: "Spring Returns",
        message: winterEndMsg,
        type: "success",
        year: run.year,
        firstTime,
      });
      if (shouldPause) {
        run.status = "paused";
        run.pausedByEvent = true;
      }
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
  run.pendingEvents = pendingEvents;

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
        resources.food += 2 * outputMult;
      }
      break;
    case "gather_materials":
      resources.materials += 1 * outputMult;
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
        resources.food += 1 * outputMult;
      } else {
        resources.food += 0.5 * outputMult;
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
      if (!resources.researchedTechs.includes("research_tools")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tools"];
      }
      log.push({ year, message: "Improved Tools researched. Material gathering +50%.", type: "info" });
      break;
    case "research_agriculture":
      if (!resources.researchedTechs.includes("research_agriculture")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_agriculture"];
      }
      log.push({ year, message: "Agriculture researched. Farming output +50%.", type: "info" });
      break;
    case "research_storage":
      if (!resources.researchedTechs.includes("research_storage")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_storage"];
      }
      resources.foodStorage += 200;
      log.push({ year, message: `Storage researched. Food storage +200 (now ${Math.floor(resources.foodStorage)}).`, type: "info" });
      break;
    case "research_fortification":
      if (!resources.researchedTechs.includes("research_fortification")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_fortification"];
      }
      resources.wallDefense += 20;
      log.push({ year, message: `Fortification researched. Wall defense +20 (now ${Math.floor(resources.wallDefense)}).`, type: "info" });
      break;
    case "research_tactics":
      if (!resources.researchedTechs.includes("research_tactics")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tactics"];
      }
      log.push({ year, message: "Tactics researched. Military training +50%.", type: "info" });
      break;
    case "preserve_food":
      resources.foodStorage += Math.floor(30 * outputMult);
      log.push({ year, message: `Food preservation improved. Storage now ${Math.floor(resources.foodStorage)}.`, type: "info" });
      break;
  }
}

function applyCompletionPreview(
  actionId: string,
  resources: Resources,
  outputMult: number,
): void {
  switch (actionId) {
    case "build_hut":
      resources.maxPopulation += 3;
      break;
    case "build_granary":
      resources.foodStorage += Math.floor(150 * outputMult);
      break;
    case "build_wall":
      resources.wallDefense += Math.floor(8 * outputMult);
      break;
    case "research_tools":
      if (!resources.researchedTechs.includes("research_tools")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tools"];
      }
      break;
    case "research_agriculture":
      if (!resources.researchedTechs.includes("research_agriculture")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_agriculture"];
      }
      break;
    case "research_storage":
      if (!resources.researchedTechs.includes("research_storage")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_storage"];
      }
      resources.foodStorage += 200;
      break;
    case "research_fortification":
      if (!resources.researchedTechs.includes("research_fortification")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_fortification"];
      }
      resources.wallDefense += 20;
      break;
    case "research_tactics":
      if (!resources.researchedTechs.includes("research_tactics")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tactics"];
      }
      break;
    case "preserve_food":
      resources.foodStorage += Math.floor(30 * outputMult);
      break;
  }
}

export interface QueuePreview {
  resources: Resources;
  yearsUsed: number;
  /** true if population hit 0 during simulation */
  collapsed: boolean;
}

/**
 * Simulate the queue from a fresh run to project resource outcomes.
 * Includes food consumption, pop growth, spoilage, winter effects.
 * Does NOT include event pauses or collapse-ending logic — just resources.
 * Caps infinite-repeat entries at enough ticks to fill the remaining epoch.
 */
export function simulateQueuePreview(
  queue: QueueEntry[],
  skills: GameState["skills"],
  repeatLastAction: boolean = true,
): QueuePreview {
  if (queue.length === 0) {
    return { resources: createInitialResources(), yearsUsed: 0, collapsed: false };
  }

  const resources = createInitialResources();
  const simSkills = {
    farming: { ...skills.farming },
    building: { ...skills.building },
    research: { ...skills.research },
    military: { ...skills.military },
  };
  let year = 0;
  const MAX_YEAR = 10000;
  let queueLogicalIndex = 0;
  let actionProgress = 0;
  let collapsed = false;

  // Expand queue into a flat action list (cap infinite at remaining years worth)
  // Instead, simulate tick-by-tick with the same queue index logic

  while (year < MAX_YEAR) {
    // Find current queue entry
    let arrayIdx = -1;
    let logicalPos = 0;
    for (let i = 0; i < queue.length; i++) {
      const reps = queue[i].repeat;
      if (reps === -1 || logicalPos + reps > queueLogicalIndex) {
        arrayIdx = i;
        break;
      }
      logicalPos += reps;
    }

    // If queue is exhausted, repeat last action or stop
    if (arrayIdx === -1) {
      if (repeatLastAction) {
        arrayIdx = queue.length - 1;
      } else {
        break;
      }
    }

    const entry = queue[arrayIdx];
    const def = getActionDef(entry.actionId);
    if (!def) break;

    year++;
    const isWinter = year >= WINTER_START && year <= WINTER_END;

    // Food consumption
    const foodPerPop = isWinter ? WINTER_FOOD_PER_POP : FOOD_PER_POP;
    resources.food -= resources.population * foodPerPop;

    // Starvation
    if (resources.food < 0) {
      const deaths = Math.min(
        resources.population,
        Math.ceil(Math.abs(resources.food) / 2),
      );
      resources.population = Math.max(0, resources.population - deaths);
      resources.food = 0;
    }

    if (resources.population <= 0) {
      collapsed = true;
      break;
    }

    // Spoilage (smooth quadratic)
    const spoilage = calculateSpoilage(resources.food, resources.foodStorage);
    if (spoilage > 0.001) {
      resources.food -= spoilage;
    }

    // Pop growth
    if (
      !isWinter &&
      resources.population < resources.maxPopulation &&
      resources.food > resources.population * FOOD_PER_POP + POP_GROWTH_THRESHOLD
    ) {
      resources.population++;
    }

    // Skip already-researched techs
    if (actionProgress === 0 && isResearchTech(entry.actionId) && resources.researchedTechs.includes(entry.actionId)) {
      actionProgress = 0;
      queueLogicalIndex++;
      continue;
    }

    // Multipliers
    const techMult = getTechMultiplierForAction(resources.researchedTechs, entry.actionId);
    const skillLevel = simSkills[def.skill].level;
    const duration = getEffectiveDuration(def.baseDuration, skillLevel, resources.population, def.category);
    const popMult = getPopulationOutputMultiplier(resources.population, def.category);
    const outputMult = getSkillOutputMultiplier(skillLevel) * techMult * popMult;

    // Material cost check at start of action
    if (actionProgress === 0 && def.materialCost) {
      if (def.materialCost > resources.materials) {
        // Skip this action
        actionProgress = 0;
        queueLogicalIndex++;
        continue;
      }
      resources.materials -= def.materialCost;
    }

    // Per-tick effects
    applyActionPerTick(entry.actionId, resources, outputMult, isWinter);

    // XP
    simSkills[def.skill] = addXp(simSkills[def.skill], 1);

    actionProgress++;

    // Action complete
    if (actionProgress >= duration) {
      applyCompletionPreview(entry.actionId, resources, outputMult);
      actionProgress = 0;
      queueLogicalIndex++;
    }
  }

  return { resources, yearsUsed: year, collapsed };
}
