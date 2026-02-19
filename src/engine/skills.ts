import type { SkillName, Skills, SkillState } from "../types/game.ts";

const XP_BASE = 100;
const XP_EXPONENT = 1.5;

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(XP_BASE * Math.pow(level - 1, XP_EXPONENT));
}

export function xpToNextLevel(skill: SkillState): number {
  return xpForLevel(skill.level + 1) - skill.xp;
}

export function addXp(skill: SkillState, amount: number): SkillState {
  let xp = skill.xp + amount;
  let level = skill.level;
  while (xp >= xpForLevel(level + 1)) {
    level++;
  }
  return { level, xp };
}

export function getSkillDurationMultiplier(level: number): number {
  // At level 1: 1.0, at level 100: ~0.1
  return Math.max(0.1, 1.0 - level * 0.009);
}

export function getSkillOutputMultiplier(level: number): number {
  return 1.0 + level * 0.05;
}

export function initialSkills(): Skills {
  return {
    farming: { level: 1, xp: 0 },
    building: { level: 1, xp: 0 },
    research: { level: 1, xp: 0 },
    military: { level: 1, xp: 0 },
  };
}

export function isActionUnlocked(
  skills: Skills,
  skillName: SkillName,
  unlockLevel: number,
): boolean {
  return skills[skillName].level >= unlockLevel;
}
