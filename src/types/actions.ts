import type { ActionDef } from "./game.ts";

export const ACTION_DEFS: ActionDef[] = [
  {
    id: "farm",
    name: "Farm",
    description: "Work the land. Produces food each year.",
    skill: "farming",
    baseDuration: 100,
    unlockLevel: 0,
  },
  {
    id: "gather_wood",
    name: "Gather Wood",
    description: "Collect wood for building.",
    skill: "building",
    baseDuration: 80,
    unlockLevel: 0,
  },
  {
    id: "build_hut",
    name: "Build Hut",
    description: "Shelter for population. Increases pop capacity. Costs 20 wood.",
    skill: "building",
    baseDuration: 120,
    unlockLevel: 2,
    woodCost: 20,
  },
  {
    id: "build_granary",
    name: "Build Granary",
    description: "Stores extra food. Critical for winter prep. Costs 50 wood.",
    skill: "building",
    baseDuration: 200,
    unlockLevel: 5,
    woodCost: 50,
  },
  {
    id: "build_wall",
    name: "Build Wall",
    description: "Fortify defenses. Adds wall defense against raiders. Costs 30 wood.",
    skill: "building",
    baseDuration: 160,
    unlockLevel: 4,
    woodCost: 30,
  },
  {
    id: "train_militia",
    name: "Train Militia",
    description: "Raise military strength. Needed to repel raiders.",
    skill: "military",
    baseDuration: 150,
    unlockLevel: 0,
  },
  {
    id: "research_tools",
    name: "Research Tools",
    description: "Improve technology. Each completion boosts all output by 10%.",
    skill: "research",
    baseDuration: 180,
    unlockLevel: 0,
  },
  {
    id: "scout",
    name: "Scout",
    description: "Explore surroundings. Small military & research XP.",
    skill: "military",
    baseDuration: 60,
    unlockLevel: 3,
  },
  {
    id: "preserve_food",
    name: "Preserve Food",
    description: "Apply preservation techniques. Produces food even in winter.",
    skill: "research",
    baseDuration: 140,
    unlockLevel: 5,
  },
];

export function getActionDef(id: string): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.id === id);
}
