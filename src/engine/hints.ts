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
  const basicUnlocks: ActionId[] = ["gather_wood", "research_tools"];
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
        return `You're close to unlocking something new with ${skillName}. Keep going!`;
      }
      return `Raising your ${skillName} skill might unlock new options.`;
    }
  }

  // All actions unlocked
  return "You've unlocked all available actions. Keep growing your civilization!";
}
