import type { RunState, Skills, SkillName } from "../types/game.ts";

interface RunSummaryModalProps {
  run: RunState;
  skills: Skills;
  skillsAtRunStart: Skills;
  lastRunYear: number;
  totalRuns: number;
  autoRestarting: boolean;
  onDismiss: () => void;
}

const SKILL_META: { id: SkillName; name: string; color: string }[] = [
  { id: "farming", name: "Farming", color: "#5e7a53" },
  { id: "building", name: "Building", color: "#867e74" },
  { id: "research", name: "Research", color: "#527a8c" },
  { id: "military", name: "Military", color: "#8b5555" },
];

export function RunSummaryModal({
  run,
  skills,
  skillsAtRunStart,
  lastRunYear,
  totalRuns,
  autoRestarting,
  onDismiss,
}: RunSummaryModalProps) {
  const isVictory = run.status === "victory";
  const yearDelta = lastRunYear > 0 ? run.year - lastRunYear : null;

  const skillDeltas = SKILL_META.map(({ id, name, color }) => {
    const start = skillsAtRunStart[id];
    const end = skills[id];
    const levelGain = end.level - start.level;
    const xpGain = end.xp - start.xp;
    return { id, name, color, levelGain, xpGain, endLevel: end.level };
  }).filter((s) => s.levelGain > 0 || s.xpGain > 0);

  return (
    <div className="run-summary-overlay" onClick={onDismiss}>
      <div
        className={`run-summary-modal ${isVictory ? "victory" : "collapse"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="run-summary-header">
          <h3>{isVictory ? "Victory!" : "Civilization Collapsed"}</h3>
          <span className="run-summary-run">Run #{totalRuns}</span>
        </div>

        {!isVictory && run.collapseReason && (
          <p className="run-summary-reason">{run.collapseReason}</p>
        )}

        <div className="run-summary-year">
          <div className="run-summary-year-reached">
            <span className="run-summary-label">Year Reached</span>
            <span className="run-summary-value">{run.year.toLocaleString()}</span>
          </div>
          {lastRunYear > 0 && (
            <div className="run-summary-year-compare">
              <span className="run-summary-label">Last Run</span>
              <span className="run-summary-value">
                {lastRunYear.toLocaleString()}
                {yearDelta !== null && (
                  <span
                    className={`run-summary-delta ${yearDelta >= 0 ? "positive" : "negative"}`}
                  >
                    {yearDelta >= 0 ? "+" : ""}{yearDelta.toLocaleString()}
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {skillDeltas.length > 0 && (
          <div className="run-summary-skills">
            <span className="run-summary-label">Skills Gained</span>
            <div className="run-summary-skill-list">
              {skillDeltas.map((s) => (
                <div key={s.id} className="run-summary-skill-row">
                  <span className="run-summary-skill-name" style={{ color: s.color }}>
                    {s.name}
                  </span>
                  <span className="run-summary-skill-info">
                    Lv {s.endLevel}
                    {s.levelGain > 0 && (
                      <span className="run-summary-delta positive"> +{s.levelGain}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="run-summary-btn" onClick={onDismiss}>
          {autoRestarting ? "Restarting..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
