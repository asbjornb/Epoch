import type {
  GameState,
  RunState,
  Resources,
  LogEntry,
  QueueEntry,
  EventPopup,
  ActionCategory,
  AchievementId,
} from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";
import {
  addXp,
  getSkillDurationMultiplier,
  getSkillOutputMultiplier,
} from "./skills.ts";
import {
  resolveLogicalIndex,
} from "./queueGroups.ts";

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

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  bonus: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "reach_raid", name: "The Raider Era", description: "Reach year 1,500", bonus: "+10 starting food" },
  { id: "survive_raid", name: "Raiders Repelled", description: "Survive the raider attack", bonus: "+10 starting food" },
  { id: "reach_winter", name: "The Great Cold", description: "Reach year 4,000", bonus: "+10 starting wood" },
];

/** Calculate starting resource bonuses from earned achievements. */
export function getAchievementBonuses(achievements: AchievementId[]): { food: number; wood: number } {
  let food = 0;
  let wood = 0;
  if (achievements.includes("reach_raid")) food += 10;
  if (achievements.includes("survive_raid")) food += 10;
  if (achievements.includes("reach_winter")) wood += 10;
  return { food, wood };
}

export function createInitialResources(): Resources {
  return {
    food: 2,
    preservedFood: 0,
    population: 2,
    maxPopulation: INITIAL_MAX_POP,
    wood: 0,
    militaryStrength: 0,
    wallsBuilt: 0,
    barracksBuilt: 0,
    smokehousesBuilt: 0,
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
  completionOnly?: "building" | "research",
): number {
  const skillDuration = baseDuration * getSkillDurationMultiplier(skillLevel);
  const safePopulation = Math.max(1, population);
  if (category === "building") {
    return Math.max(1, Math.ceil(skillDuration / safePopulation));
  }
  if (category === "research") {
    // First 2 pop contribute linearly; additional pop has diminishing returns (pow 0.8)
    // Normalized so 2 pop = baseDuration (the baseline the durations were tuned for)
    const effectiveWorkers = Math.min(safePopulation, 2) + Math.pow(Math.max(0, safePopulation - 2), 0.8);
    return Math.max(1, Math.ceil(skillDuration * 2 / effectiveWorkers));
  }
  // Completion-only resource/military actions: pop scales duration instead of output
  // Normalized so 2 pop = baseDuration (same speed as before this change)
  if (completionOnly === "building") {
    // Linear scaling
    return Math.max(1, Math.ceil(skillDuration * 2 / safePopulation));
  }
  if (completionOnly === "research") {
    // Sublinear scaling (diminishing returns past 2 pop)
    const effectiveWorkers = Math.min(safePopulation, 2) + Math.pow(Math.max(0, safePopulation - 2), 0.8);
    return Math.max(1, Math.ceil(skillDuration * 2 / effectiveWorkers));
  }
  // Per-tick resource and military: population doesn't affect duration (it scales output instead)
  return Math.max(1, Math.round(skillDuration));
}

/** Per-action tech multiplier based on which techs have been researched */
function getTechMultiplierForAction(researchedTechs: string[], actionId: string): number {
  let mult = 1.0;
  if (researchedTechs.includes("research_tools") && actionId === "gather_wood") {
    mult *= 1.25;
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

/** Wall defense multiplier: diminishing returns per wall (like granaries) */
function getWallDefenseMultiplier(wallsBuilt: number): number {
  let mult = 1.0;
  for (let i = 0; i < wallsBuilt; i++) {
    mult += 0.15 / Math.sqrt(1 + i);
  }
  return mult;
}

/** Fortification defense multiplier: +20% total defense when researched */
function getFortificationMultiplier(researchedTechs: string[]): number {
  return researchedTechs.includes("research_fortification") ? 1.20 : 1.0;
}

/** Smokehouse spoilage multiplier: each smokehouse reduces spoilage by 10% */
function getSmokehouseSpoilageMultiplier(smokehousesBuilt: number): number {
  return Math.pow(0.90, smokehousesBuilt);
}

/** Barracks XP multiplier: each barracks grants ×1.15 military XP per training tick, stacking multiplicatively */
function getBarracksXpMultiplier(barracksBuilt: number): number {
  return Math.pow(1.15, barracksBuilt);
}

/** Get the number of existing buildings of a given type */
export function getBuildingCount(resources: Resources, actionId: string): number {
  switch (actionId) {
    case "build_hut":
      return Math.max(0, Math.round((resources.maxPopulation - INITIAL_MAX_POP) / 3));
    case "build_granary":
      return resources.granariesBuilt ?? 0;
    case "build_smokehouse":
      return resources.smokehousesBuilt ?? 0;
    case "build_barracks":
      return resources.barracksBuilt ?? 0;
    case "build_wall":
      return resources.wallsBuilt ?? 0;
    default:
      return 0;
  }
}

/** Building cost scales +50% per existing building of the same type */
export function getScaledWoodCost(baseCost: number, existingCount: number): number {
  return Math.ceil(baseCost * (1 + existingCount * 0.5));
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

/** Append a concise run-end summary to the log, mirroring what Run History shows. */
function pushRunSummaryLog(
  log: LogEntry[],
  year: number,
  resources: Resources,
  totalFoodSpoiled: number,
): void {
  const defense = Math.floor(getTotalDefense(resources));
  const parts: string[] = [
    `Pop ${resources.population}/${resources.maxPopulation}`,
    `Defense ${defense}`,
  ];
  if (resources.researchedTechs.length > 0) {
    parts.push(`Tech ${resources.researchedTechs.length}`);
  }
  const foodLeft = Math.floor(resources.food);
  const woodLeft = Math.floor(resources.wood);
  const spoiled = Math.floor(totalFoodSpoiled);
  const wasteParts: string[] = [];
  if (foodLeft > 0) wasteParts.push(`${foodLeft} food`);
  if (woodLeft > 0) wasteParts.push(`${woodLeft} wood`);
  if (spoiled > 0) wasteParts.push(`${spoiled} spoiled`);
  if (wasteParts.length > 0) {
    parts.push(`Remaining: ${wasteParts.join(", ")}`);
  }
  log.push({
    year,
    message: parts.join(" · "),
    type: "info",
  });
}

function getCurrentQueueEntry(run: RunState): { entry: QueueEntry; index: number } | null {
  if (run.queue.length === 0) return null;

  const resolved = resolveLogicalIndex(run.queue, run.currentQueueIndex);

  if (resolved) {
    return { entry: run.queue[resolved.arrayIndex], index: run.currentQueueIndex };
  }

  // Queue exhausted — repeat last action or signal end
  if (run.repeatLastAction) {
    return { entry: run.queue[run.queue.length - 1], index: run.currentQueueIndex };
  }
  return null;
}

export function tick(state: GameState): GameState {
  const run = { ...state.run };
  const resources = { ...run.resources };
  const skills = { ...state.skills };
  const log: LogEntry[] = [...run.log];
  const pendingEvents: EventPopup[] = [...run.pendingEvents];
  let achievements = state.achievements;

  if (run.status !== "running") return state;

  const popAtTickStart = resources.population;
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
  // Smokehouses reduce spoilage rate
  const smokeMult = getSmokehouseSpoilageMultiplier(resources.smokehousesBuilt);
  const spoiled = calculateSpoilage(resources.food, resources.foodStorage) * smokeMult;
  const preservedSpoiled = calculatePreservedSpoilage(resources.preservedFood, resources.foodStorage) * smokeMult;
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
        const duration = getEffectiveDuration(def.baseDuration, skillLevel, resources.population, def.category, def.completionOnly);
        const popMult = getPopulationOutputMultiplier(resources.population, def.category);
        const techMult = getTechMultiplierForAction(resources.researchedTechs, entry.actionId);
        const outputMult = getSkillOutputMultiplier(skillLevel) * techMult * popMult;

        // Check wood cost at start of action (scaled for buildings)
        const scaledCost = def.woodCost ? getScaledWoodCost(def.woodCost, getBuildingCount(resources, entry.actionId)) : 0;
        if (run.currentActionProgress === 0 && scaledCost > 0 && scaledCost > resources.wood) {
          log.push({
            year: run.year,
            message: `Cannot ${def.name}: need ${scaledCost} wood (have ${Math.floor(resources.wood)}).`,
            type: "warning",
          });
          run.currentActionProgress = 0;
          run.currentQueueIndex++;
        } else {
          // Deduct wood at start of action
          if (run.currentActionProgress === 0 && scaledCost > 0) {
            resources.wood -= scaledCost;
          }

          // Per-tick effects
          applyActionPerTick(entry.actionId, resources, outputMult, isWinter);

          // XP per tick (barracks multiply military XP during training/scouting)
          let xpAmount = 1;
          if (entry.actionId === "train_militia" || entry.actionId === "scout") {
            xpAmount *= getBarracksXpMultiplier(resources.barracksBuilt);
          }
          skills[def.skill] = addXp(skills[def.skill], xpAmount);

          if (foodNeeded <= 0) {
            run.lastActionPopulation = popAtTickStart;
          }
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

  // Tutorial tips for first run (non-blocking toasts)
  if (state.totalRuns === 0) {
    if (run.year === 100) {
      pendingEvents.push({
        eventId: "tutorial_intro",
        title: "A New Beginning",
        message: "Your civilization starts small — just a few people and a patch of farmland. For now, farming is all you know. Don't worry. As your food stores fill, new skills will emerge. And when this generation eventually falls, some knowledge carries forward.",
        type: "success",
        year: run.year,
        firstTime: true,
      });
    }
    if (run.year === 500) {
      pendingEvents.push({
        eventId: "tutorial_skills",
        title: "Skills",
        message: "Check the Skills panel to see how your people are progressing. Skills persist between generations.",
        type: "success",
        year: run.year,
        firstTime: true,
      });
    }
    if (run.year === 1000) {
      pendingEvents.push({
        eventId: "tutorial_hints",
        title: "Hints",
        message: "Not sure what to do next? Press the ? button at the top of the screen for a hint on what to explore.",
        type: "success",
        year: run.year,
        firstTime: true,
      });
    }
  }

  // Raider event - walls and fortification multiply total defense
  if (run.year === RAIDER_YEAR) {
    // Achievement: reach the raid
    if (!achievements.includes("reach_raid")) {
      achievements = [...achievements, "reach_raid"];
      log.push({ year: run.year, message: "Achievement: The Raider Era — future runs start with +10 food.", type: "success" });
    }
    const totalDefense = getTotalDefense(resources);
    const baseMilitary = Math.floor(resources.militaryStrength);
    const totalMult = (getMilitaryStrengthMultiplier(resources.researchedTechs) * getWallDefenseMultiplier(resources.wallsBuilt) * getFortificationMultiplier(resources.researchedTechs));
    if (!(totalDefense >= RAIDER_STRENGTH_REQUIRED)) {
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
      pushRunSummaryLog(log, run.year, resources, run.totalFoodSpoiled);
    } else {
      // Reward for surviving raiders
      const foodBonus = 50;
      const woodBonus = 20;
      resources.food += foodBonus;
      resources.wood += woodBonus;
      skills.military = addXp(skills.military, 50);
      const raidMsg = `Raiders repelled! Defense held (${Math.floor(totalDefense)}/${RAIDER_STRENGTH_REQUIRED}). Gained ${foodBonus} food, ${woodBonus} wood, and military XP.`;
      log.push({ year: run.year, message: raidMsg, type: "success" });
      // Achievement: survive the raid
      if (!achievements.includes("survive_raid")) {
        achievements = [...achievements, "survive_raid"];
        log.push({ year: run.year, message: "Achievement: Raiders Repelled — future runs start with +10 food.", type: "success" });
      }
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
    // Achievement: reach the ice age
    if (!achievements.includes("reach_winter")) {
      achievements = [...achievements, "reach_winter"];
      log.push({ year: run.year, message: "Achievement: The Great Cold — future runs start with +10 wood.", type: "success" });
    }
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
    pushRunSummaryLog(log, run.year, resources, run.totalFoodSpoiled);
  }

  // Check victory
  if (run.year >= run.maxYear && run.status === "running") {
    run.status = "victory";
    log.push({
      year: run.year,
      message: "Civilization survived the full epoch! Victory!",
      type: "success",
    });
    pushRunSummaryLog(log, run.year, resources, run.totalFoodSpoiled);
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

  return { ...state, run, skills, encounteredDisasters, achievements };
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
      resources.wood += 0.4 * outputMult;
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
    case "build_smokehouse":
      resources.smokehousesBuilt += 1;
      log.push({ year, message: `Smokehouse built (${resources.smokehousesBuilt} total). Spoilage ×${getSmokehouseSpoilageMultiplier(resources.smokehousesBuilt).toFixed(2)}.`, type: "info" });
      break;
    case "build_barracks":
      resources.barracksBuilt += 1;
      log.push({ year, message: `Barracks built (${resources.barracksBuilt} total). Military XP ×${getBarracksXpMultiplier(resources.barracksBuilt).toFixed(2)} when training.`, type: "info" });
      break;
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
      resources.foodStorage += 100;
      log.push({ year, message: `Food Preservation researched. Food storage +100 (now ${Math.floor(resources.foodStorage)}).`, type: "info" });
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
    case "build_smokehouse":
      resources.smokehousesBuilt += 1;
      break;
    case "build_barracks":
      resources.barracksBuilt += 1;
      break;
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
      resources.foodStorage += 100;
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
  /** The action that was active when the simulation predicted collapse */
  collapseActionId?: string;
}

/**
 * Simulate the queue from a fresh run to project resource outcomes.
 * Includes food consumption, pop growth, spoilage, and optionally winter effects.
 * Does NOT include event pauses or collapse-ending logic — just resources.
 * Only simulates the finite queue (ignores repeatLastAction).
 */
export function simulateQueuePreview(
  queue: QueueEntry[],
  skills: GameState["skills"],
  hasSeenWinter: boolean = true,
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
  let collapseActionId: string | undefined;

  // Expand queue into a flat action list (cap infinite at remaining years worth)
  // Instead, simulate tick-by-tick with the same queue index logic

  while (year < MAX_YEAR) {
    // Find current queue entry (group-aware)
    const resolved = resolveLogicalIndex(queue, queueLogicalIndex);

    // Queue exhausted — stop simulation (don't repeat last action for preview)
    if (!resolved) {
      break;
    }

    const arrayIdx = resolved.arrayIndex;
    const entry = queue[arrayIdx];
    const def = getActionDef(entry.actionId);
    if (!def) break;

    year++;
    const isWinter = hasSeenWinter && year >= WINTER_START && year <= WINTER_END;

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
      collapseActionId = entry.actionId;
      break;
    }

    // Spoilage (smooth quadratic) — separate for normal and preserved food
    const previewSmokeMult = getSmokehouseSpoilageMultiplier(resources.smokehousesBuilt);
    const spoilage = calculateSpoilage(resources.food, resources.foodStorage) * previewSmokeMult;
    if (spoilage > 0.001) {
      resources.food -= spoilage;
    }
    const preservedSpoilagePreview = calculatePreservedSpoilage(resources.preservedFood, resources.foodStorage) * previewSmokeMult;
    if (preservedSpoilagePreview > 0.001) {
      resources.preservedFood -= preservedSpoilagePreview;
    }

    // Pop growth (not during winter)
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
    const duration = getEffectiveDuration(def.baseDuration, skillLevel, resources.population, def.category, def.completionOnly);
    const popMult = getPopulationOutputMultiplier(resources.population, def.category);
    const outputMult = getSkillOutputMultiplier(skillLevel) * techMult * popMult;

    // Wood cost check at start of action (scaled for buildings)
    const previewScaledCost = def.woodCost ? getScaledWoodCost(def.woodCost, getBuildingCount(resources, entry.actionId)) : 0;
    if (actionProgress === 0 && previewScaledCost > 0) {
      if (previewScaledCost > resources.wood) {
        // Skip this action
        actionProgress = 0;
        queueLogicalIndex++;
        continue;
      }
      resources.wood -= previewScaledCost;
    }

    // Per-tick effects
    applyActionPerTick(entry.actionId, resources, outputMult, isWinter);

    // XP (barracks multiply military XP during training/scouting)
    let simXpAmount = 1;
    if (entry.actionId === "train_militia" || entry.actionId === "scout") {
      simXpAmount *= getBarracksXpMultiplier(resources.barracksBuilt);
    }
    simSkills[def.skill] = addXp(simSkills[def.skill], simXpAmount);

    actionProgress++;

    // Action complete
    if (actionProgress >= duration) {
      applyCompletionPreview(entry.actionId, resources, outputMult);
      actionProgress = 0;
      queueLogicalIndex++;
    }
  }

  return { resources, yearsUsed: year, collapsed, collapseActionId };
}
