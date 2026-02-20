import type { GameState, ActionId } from "../types/game.ts";
import { ACTION_DEFS } from "../types/actions.ts";

export function getSkillHint(state: GameState): string {
  const { skills, unlockedActions, run } = state;
  const isIdle = run.status === "idle";

  // Very first state: no queue, nothing started
  if (isIdle && run.queue.length === 0 && run.year === 0) {
    if (unlockedActions.length === 1 && unlockedActions[0] === "farm") {
      return "Add Farm to the queue and press Start to begin your civilization.";
    }
    return "Add actions to the queue and press Start to begin.";
  }

  // Queue exists but run hasn't started
  if (isIdle && run.queue.length > 0 && run.year === 0) {
    return "Press Start to begin your run.";
  }

  // Only farming unlocked — need to fill food storage
  const basicUnlocks: ActionId[] = ["gather_wood", "train_militia", "research_tools"];
  const hasBasicUnlocks = basicUnlocks.every((id) => unlockedActions.includes(id));

  if (!hasBasicUnlocks) {
    return "Fill your food storage to capacity to unlock new skills.";
  }

  // Find locked actions and sort by how close the player is to unlocking them
  const lockedActions = ACTION_DEFS.filter(
    (a) =>
      a.unlockLevel > 0 &&
      !unlockedActions.includes(a.id),
  );

  if (lockedActions.length > 0) {
    // Sort by how close (smallest gap between current level and required level)
    const ranked = lockedActions
      .map((a) => ({
        action: a,
        gap: a.unlockLevel - skills[a.unlockSkill ?? a.skill].level,
      }))
      .filter((r) => r.gap > 0)
      .sort((a, b) => a.gap - b.gap);

    if (ranked.length > 0) {
      const best = ranked[0];
      const unlockSkill = best.action.unlockSkill ?? best.action.skill;
      const skillName = unlockSkill.charAt(0).toUpperCase() + unlockSkill.slice(1);
      if (best.gap === 1) {
        return `Almost there! One more ${skillName} level will unlock ${best.action.name}.`;
      }
      return `Raise ${skillName} to level ${best.action.unlockLevel} to unlock ${best.action.name}.`;
    }
  }

  // All actions unlocked — give general progression tips
  const totalDefense = run.resources.militaryStrength + run.resources.wallDefense;
  if (state.encounteredDisasters.length === 0 && totalDefense < 250) {
    return "Build up your defenses. Raiders will test your civilization at year 1500.";
  }

  if (run.resources.researchedTechs.length < 3) {
    return "Research more technologies to boost your civilization's output.";
  }

  return "Keep leveling your skills. Higher levels mean faster actions and greater output.";
}
