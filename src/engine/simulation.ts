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
const PRESERVED_SPOILAGE_DIVISOR = 800; // preserved food spoils at half the rate

/** Smooth spoilage: scales quadratically with food, reduced by foodStorage.
 *  At base storage (200): ~0.5/tick at 200 food, ~2/tick at 400, ~3.1/tick at 500. */
function calculateSpoilage(food: number, foodStorage: number): number {
  if (food <= 0 || foodStorage <= 0) return 0;
  return (food * food) / (SPOILAGE_DIVISOR * foodStorage);
}

/** Preserved food spoils separately at a lower rate. */
function calculatePreservedSpoilage(preservedFood: number, foodStorage: number): number {
  if (preservedFood <= 0 || foodStorage <= 0) return 0;
  return (preservedFood * preservedFood) / (PRESERVED_SPOILAGE_DIVISOR * foodStorage);
}

export const DISASTERS: DisasterInfo[] = [
  { id: "raider", name: "Raider Era", year: RAIDER_YEAR, color: "#8b5555" },
  { id: "winter", name: "Great Cold", year: WINTER_START, color: "#7a9aad" },
];

export function createInitialResources(): Resources {
  return {
    food: 2,
    preservedFood: 0,
    population: 2,
    maxPopulation: INITIAL_MAX_POP,
    wood: 0,
    militaryStrength: 0,
    wallsBuilt: 0,
    foodStorage: INITIAL_FOOD_STORAGE,
    granariesBuilt: 0,
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
  if (researchedTechs.includes("research_tools") && actionId === "gather_wood") {
    mult *= 1.15;
  }
  if (researchedTechs.includes("research_irrigation") && actionId === "farm") {
    mult *= 1.15;
  }
  return mult;
}

/** Military strength multiplier from tactics research */
function getMilitaryStrengthMultiplier(researchedTechs: string[]): number {
  return researchedTechs.includes("research_tactics") ? 1.15 : 1.0;
}

/** Wall defense multiplier: each wall gives +15%, stacking multiplicatively */
function getWallDefenseMultiplier(wallsBuilt: number): number {
  return Math.pow(1.15, wallsBuilt);
}

/** Fortification defense multiplier: +20% total defense when researched */
function getFortificationMultiplier(researchedTechs: string[]): number {
  return researchedTechs.includes("research_fortification") ? 1.20 : 1.0;
}

/** Calculate total defense from all sources */
export function getTotalDefense(resources: Resources): number {
  const tacticsMult = getMilitaryStrengthMultiplier(resources.researchedTechs);
  const wallMult = getWallDefenseMultiplier(resources.wallsBuilt);
  const fortMult = getFortificationMultiplier(resources.researchedTechs);
  return resources.militaryStrength * tacticsMult * wallMult * fortMult;
}

/** Check if an action is a research tech (single-use) */
function isResearchTech(actionId: string): boolean {
  return actionId.startsWith("research_");
}

/** Population output multiplier: linear for resource/military, none for building/research.
 *  Normalized so starting pop (2) gives 1x — matches the baseline per-tick values were tuned for. */
function getPopulationOutputMultiplier(population: number, category: ActionCategory): number {
  if (category === "resource" || category === "military") {
    return population / 2;
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
  // Eat from normal food first, then preserved food
  const foodPerPop = isWinter ? WINTER_FOOD_PER_POP : FOOD_PER_POP;
  let foodNeeded = resources.population * foodPerPop;
  const fromFood = Math.min(resources.food, foodNeeded);
  resources.food -= fromFood;
  foodNeeded -= fromFood;
  if (foodNeeded > 0) {
    const fromPreserved = Math.min(resources.preservedFood, foodNeeded);
    resources.preservedFood -= fromPreserved;
    foodNeeded -= fromPreserved;
  }

  // Population starvation (foodNeeded > 0 means not enough food of any kind)
  if (foodNeeded > 0) {
    const deaths = Math.min(
      resources.population,
      Math.ceil(foodNeeded / 2),
    );
    resources.population = Math.max(0, resources.population - deaths);
    if (deaths > 0) {
      log.push({
        year: run.year,
        message: `${deaths} people starved.`,
        type: "danger",
      });
    }
  }

  // Food spoilage: smooth quadratic curve, always applies
  // Regular food and preserved food spoil independently
  const spoiled = calculateSpoilage(resources.food, resources.foodStorage);
  const preservedSpoiled = calculatePreservedSpoilage(resources.preservedFood, resources.foodStorage);
  const totalSpoiled = spoiled + preservedSpoiled;
  if (totalSpoiled > 0.001) {
    resources.food -= spoiled;
    resources.preservedFood -= preservedSpoiled;
    run.totalFoodSpoiled = (run.totalFoodSpoiled || 0) + totalSpoiled;
    // Log spoilage periodically (every 500 years)
    if (run.year % 500 === 0) {
      log.push({
        year: run.year,
        message: `Food spoilage: ${totalSpoiled.toFixed(1)}/yr lost. Total spoiled: ${Math.floor(run.totalFoodSpoiled)}.`,
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

        // Check wood cost at start of action
        if (run.currentActionProgress === 0 && def.woodCost && def.woodCost > resources.wood) {
          log.push({
            year: run.year,
            message: `Cannot ${def.name}: need ${def.woodCost} wood (have ${Math.floor(resources.wood)}).`,
            type: "warning",
          });
          run.currentActionProgress = 0;
          run.currentQueueIndex++;
        } else {
          // Deduct wood at start of action
          if (run.currentActionProgress === 0 && def.woodCost) {
            resources.wood -= def.woodCost;
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

  // Raider event - walls and fortification multiply total defense
  if (run.year === RAIDER_YEAR) {
    const totalDefense = getTotalDefense(resources);
    const baseMilitary = Math.floor(resources.militaryStrength);
    const totalMult = (getMilitaryStrengthMultiplier(resources.researchedTechs) * getWallDefenseMultiplier(resources.wallsBuilt) * getFortificationMultiplier(resources.researchedTechs));
    if (totalDefense < RAIDER_STRENGTH_REQUIRED) {
      run.status = "collapsed";
      const defenseDetail = `Total defense ${Math.floor(totalDefense)} (${baseMilitary} base × ${totalMult.toFixed(2)})`;
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
      const woodBonus = 20;
      resources.food += foodBonus;
      resources.wood += woodBonus;
      skills.military = addXp(skills.military, 50);
      const raidMsg = `Raiders repelled! Defense held (${Math.floor(totalDefense)}/${RAIDER_STRENGTH_REQUIRED}). Gained ${foodBonus} food, ${woodBonus} wood, and military XP.`;
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
    const preservedNote = resources.preservedFood > 0 ? ` Preserved: ${Math.floor(resources.preservedFood)}.` : "";
    const winterMsg = `The Great Cold begins. Farming disabled, food consumption doubled. Food: ${Math.floor(resources.food)} (spoilage: ${winterSpoilage.toFixed(1)}/yr).${preservedNote}`;
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
    if (resources.population > 0 && (resources.food > 0 || resources.preservedFood > 0)) {
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
    case "gather_wood":
      resources.wood += 0.5 * outputMult;
      break;
    case "train_militia":
      resources.militaryStrength += 0.2 * outputMult;
      break;
    case "scout":
      resources.militaryStrength += 0.05 * outputMult;
      break;
    case "winter_hunt":
      resources.food += 0.2 * outputMult;
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
    case "build_granary": {
      const bonus = Math.floor(150 * outputMult / Math.sqrt(1 + resources.granariesBuilt));
      resources.foodStorage += bonus;
      resources.granariesBuilt++;
      log.push({ year, message: `Granary built (+${bonus} storage). Food storage now ${Math.floor(resources.foodStorage)}.`, type: "info" });
      break;
    }
    case "build_wall":
      resources.wallsBuilt += 1;
      log.push({ year, message: `Wall built (${resources.wallsBuilt} total). Defense ×${getWallDefenseMultiplier(resources.wallsBuilt).toFixed(2)}.`, type: "info" });
      break;
    case "research_tools":
      if (!resources.researchedTechs.includes("research_tools")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tools"];
      }
      log.push({ year, message: "Improved Tools researched. Wood gathering +15%.", type: "info" });
      break;
    case "research_irrigation":
      if (!resources.researchedTechs.includes("research_irrigation")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_irrigation"];
      }
      log.push({ year, message: "Irrigation researched. Farming output +15%.", type: "info" });
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
      log.push({ year, message: `Fortification researched. Total defense ×1.20.`, type: "info" });
      break;
    case "research_tactics":
      if (!resources.researchedTechs.includes("research_tactics")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tactics"];
      }
      log.push({ year, message: "Tactics researched. Military strength +15%.", type: "info" });
      break;
    case "cure_food": {
      const amount = Math.min(100, resources.food);
      if (amount > 0) {
        resources.food -= amount;
        resources.preservedFood += amount;
        log.push({ year, message: `Cured ${Math.floor(amount)} food into preserved stores. Preserved: ${Math.floor(resources.preservedFood)}.`, type: "info" });
      } else {
        log.push({ year, message: `No food available to cure.`, type: "warning" });
      }
      break;
    }
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
    case "build_granary": {
      const bonus = Math.floor(150 * outputMult / Math.sqrt(1 + resources.granariesBuilt));
      resources.foodStorage += bonus;
      resources.granariesBuilt++;
      break;
    }
    case "build_wall":
      resources.wallsBuilt += 1;
      break;
    case "research_tools":
      if (!resources.researchedTechs.includes("research_tools")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tools"];
      }
      break;
    case "research_irrigation":
      if (!resources.researchedTechs.includes("research_irrigation")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_irrigation"];
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
      break;
    case "research_tactics":
      if (!resources.researchedTechs.includes("research_tactics")) {
        resources.researchedTechs = [...resources.researchedTechs, "research_tactics"];
      }
      break;
    case "cure_food": {
      const amount = Math.min(100, resources.food);
      if (amount > 0) {
        resources.food -= amount;
        resources.preservedFood += amount;
      }
      break;
    }
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

    // Food consumption — eat from normal food first, then preserved
    const foodPerPop = isWinter ? WINTER_FOOD_PER_POP : FOOD_PER_POP;
    let previewFoodNeeded = resources.population * foodPerPop;
    const previewFromFood = Math.min(resources.food, previewFoodNeeded);
    resources.food -= previewFromFood;
    previewFoodNeeded -= previewFromFood;
    if (previewFoodNeeded > 0) {
      const previewFromPreserved = Math.min(resources.preservedFood, previewFoodNeeded);
      resources.preservedFood -= previewFromPreserved;
      previewFoodNeeded -= previewFromPreserved;
    }

    // Starvation
    if (previewFoodNeeded > 0) {
      const deaths = Math.min(
        resources.population,
        Math.ceil(previewFoodNeeded / 2),
      );
      resources.population = Math.max(0, resources.population - deaths);
    }

    if (resources.population <= 0) {
      collapsed = true;
      break;
    }

    // Spoilage (smooth quadratic) — separate for normal and preserved food
    const spoilage = calculateSpoilage(resources.food, resources.foodStorage);
    if (spoilage > 0.001) {
      resources.food -= spoilage;
    }
    const preservedSpoilagePreview = calculatePreservedSpoilage(resources.preservedFood, resources.foodStorage);
    if (preservedSpoilagePreview > 0.001) {
      resources.preservedFood -= preservedSpoilagePreview;
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

    // Wood cost check at start of action
    if (actionProgress === 0 && def.woodCost) {
      if (def.woodCost > resources.wood) {
        // Skip this action
        actionProgress = 0;
        queueLogicalIndex++;
        continue;
      }
      resources.wood -= def.woodCost;
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
