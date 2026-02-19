import type { Skills, SkillName } from "../types/game.ts";
import { xpForLevel } from "../engine/skills.ts";

interface SkillsPanelProps {
  skills: Skills;
}

const SKILL_META: { id: SkillName; name: string; color: string }[] = [
  { id: "farming", name: "Farming", color: "#4a7c3f" },
  { id: "building", name: "Building", color: "#8b6914" },
  { id: "research", name: "Research", color: "#3a5f8a" },
  { id: "military", name: "Military", color: "#8a3a3a" },
];

export function SkillsPanel({ skills }: SkillsPanelProps) {
  return (
    <div className="skills-panel">
      <h3>Skills <span className="skills-persist-tag">persist</span></h3>
      <div className="skills-list">
        {SKILL_META.map(({ id, name, color }) => {
          const s = skills[id];
          const xpNeeded = xpForLevel(s.level + 1);
          const xpPrev = xpForLevel(s.level);
          const pct =
            xpNeeded > xpPrev
              ? ((s.xp - xpPrev) / (xpNeeded - xpPrev)) * 100
              : 100;

          return (
            <div key={id} className="skill-row">
              <div className="skill-header">
                <span className="skill-name" style={{ color }}>
                  {name}
                </span>
                <span className="skill-level">Lv {s.level}</span>
              </div>
              <div className="skill-xp-track">
                <div
                  className="skill-xp-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
