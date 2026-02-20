import { useEffect, useRef } from "react";
import type { RunState, Skills, SkillName } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";
import { getEffectiveDuration } from "../engine/simulation.ts";

interface RunSummaryModalProps {
  run: RunState;
  skills: Skills;
  skillsAtRunStart: Skills;
  lastRunYear: number;
  totalRuns: number;
  autoRestarting: boolean;
  autoDismiss: boolean;
  onDismiss: () => void;
  onDismissNoPause: () => void;
}

const SKILL_META: { id: SkillName; name: string; color: string }[] = [
  { id: "farming", name: "Farming", color: "#6a8f5c" },
  { id: "building", name: "Building", color: "#9a8a72" },
  { id: "research", name: "Research", color: "#6a8faa" },
  { id: "military", name: "Military", color: "#b07070" },
];

export function RunSummaryModal({
  run,
  skills,
  skillsAtRunStart,
  lastRunYear,
  totalRuns,
  autoRestarting,
  autoDismiss,
  onDismiss,
  onDismissNoPause,
}: RunSummaryModalProps) {
  const timerRef = useRef<number | null>(null);
  const isVictory = run.status === "victory";
  const yearDelta = lastRunYear > 0 ? run.year - lastRunYear : null;

  useEffect(() => {
    if (autoDismiss) {
      timerRef.current = window.setTimeout(onDismiss, 7000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoDismiss, onDismiss]);

  // Compute years remaining on the last action in progress
  let lastActionInfo: { name: string; yearsDone: number; totalDuration: number; yearsRemaining: number } | null = null;
  if (run.currentActionProgress > 0 && run.queue.length > 0) {
    let arrayIdx = -1;
    let logicalPos = 0;
    for (let i = 0; i < run.queue.length; i++) {
      const reps = run.queue[i].repeat;
      if (reps === -1 || logicalPos + reps > run.currentQueueIndex) {
        arrayIdx = i;
        break;
      }
      logicalPos += reps;
    }
    if (arrayIdx === -1 && run.repeatLastAction) {
      arrayIdx = run.queue.length - 1;
    }
    if (arrayIdx >= 0) {
      const activeEntry = run.queue[arrayIdx];
      const def = getActionDef(activeEntry.actionId);
      if (def) {
        const skillLevel = skills[def.skill].level;
        const duration = getEffectiveDuration(def.baseDuration, skillLevel, run.resources.population, def.category);
        lastActionInfo = {
          name: def.name,
          yearsDone: run.currentActionProgress,
          totalDuration: duration,
          yearsRemaining: duration - run.currentActionProgress,
        };
      }
    }
  }

  const skillDeltas = SKILL_META.map(({ id, name, color }) => {
    const start = skillsAtRunStart[id];
    const end = skills[id];
    const levelGain = end.level - start.level;
    const xpGain = end.xp - start.xp;
    return { id, name, color, levelGain, xpGain, endLevel: end.level };
  }).filter((s) => s.levelGain > 0 || s.xpGain > 0);

  if (autoDismiss) {
    // Toast-style notification
    return (
      <div
        className={`run-summary-toast ${isVictory ? "victory" : "collapse"}`}
        onClick={onDismiss}
      >
        <div className="run-summary-toast-header">
          <span className="run-summary-toast-title">
            {isVictory ? "Victory!" : "Collapsed"}
          </span>
          <span className="run-summary-toast-detail">
            Run #{totalRuns} — Year {run.year.toLocaleString()}
            {yearDelta !== null && (
              <span className={`run-summary-delta ${yearDelta >= 0 ? "positive" : "negative"}`}>
                {" "}{yearDelta >= 0 ? "+" : ""}{yearDelta.toLocaleString()}
              </span>
            )}
          </span>
        </div>
        {!isVictory && run.collapseReason && (
          <p className="run-summary-toast-reason">{run.collapseReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="run-summary-overlay" onClick={onDismiss}>
      <div
        className={`run-summary-modal ${isVictory ? "victory" : "collapse"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="run-summary-header">
          <h3>{isVictory ? "Victory!" : "Civilization Collapsed"}</h3>
          <button className="run-summary-close" onClick={onDismiss} aria-label="Close">
            ✕
          </button>
        </div>

        <span className="run-summary-run">Run #{totalRuns}</span>

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

        {lastActionInfo && (
          <div className="run-summary-last-action">
            <span className="run-summary-label">Incomplete Action</span>
            <span className="run-summary-value">
              {lastActionInfo.name} — {lastActionInfo.yearsDone}/{lastActionInfo.totalDuration} yrs ({lastActionInfo.yearsRemaining} remaining)
            </span>
          </div>
        )}

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

        <div className="run-summary-actions">
          <button className="run-summary-btn" onClick={onDismiss}>
            {autoRestarting ? "Restarting..." : "Continue"}
          </button>
          <button className="run-summary-btn-secondary" onClick={onDismissNoPause}>
            Show as brief notification next time
          </button>
        </div>
      </div>
    </div>
  );
}
