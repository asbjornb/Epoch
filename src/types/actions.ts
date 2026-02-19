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
    id: "gather_materials",
    name: "Gather Materials",
    description: "Collect wood, stone, and basic materials.",
    skill: "building",
    baseDuration: 80,
    unlockLevel: 0,
  },
  {
    id: "build_hut",
    name: "Build Hut",
    description: "Shelter for population. Increases pop capacity.",
    skill: "building",
    baseDuration: 120,
    unlockLevel: 2,
  },
  {
    id: "build_granary",
    name: "Build Granary",
    description: "Reduces food spoilage. Critical for winter prep.",
    skill: "building",
    baseDuration: 200,
    unlockLevel: 5,
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
    description: "Improve technology. Boosts all skill efficiency.",
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
];

export function getActionDef(id: string): ActionDef | undefined {
  return ACTION_DEFS.find((a) => a.id === id);
}
