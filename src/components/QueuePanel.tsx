import { useState, useEffect, useRef, useMemo } from "react";
import type {
  ActionId,
  GameState,
  QueueEntry,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked, getSkillDurationMultiplier } from "../engine/skills.ts";
import { simulateQueue } from "../engine/simulation.ts";
import type { QueuePreview } from "../engine/simulation.ts";
import type { GameAction } from "../hooks/useGame.ts";

interface QueuePanelProps {
  state: GameState;
  totalRuns: number;
  dispatch: React.Dispatch<GameAction>;
}

const SKILL_COLORS: Record<string, string> = {
  farming: "#6a8f5c",
  building: "#9a8a72",
  research: "#6a8faa",
  military: "#b07070",
};

const SKILL_ICONS: Record<string, string> = {
  farming: "\u{1F33E}",
  building: "\u{1F3D7}",
  research: "\u{1F4D6}",
  military: "\u{2694}",
};

function ActionPalette({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}) {
  // Only show actions that are both in unlockedActions and meet skill level requirements
  const visible = ACTION_DEFS.filter(
    (a) =>
      state.unlockedActions.includes(a.id) &&
      isActionUnlocked(state.skills, a.skill, a.unlockLevel),
  );

  return (
    <div className="action-palette">
      <div className="palette-label">Actions</div>
      <div className="palette-grid">
        {visible.map((a) => {
          const dur = Math.max(
            1,
            Math.round(
              a.baseDuration *
                getSkillDurationMultiplier(state.skills[a.skill].level),
            ),
          );
          return (
            <button
              key={a.id}
              className="palette-action"
              style={{ borderTopColor: SKILL_COLORS[a.skill] }}
              onClick={() => dispatch({ type: "queue_add", actionId: a.id })}
              title={a.description}
            >
              <span className="palette-action-icon">{SKILL_ICONS[a.skill]}</span>
              <span className="palette-action-name">{a.name}</span>
              <span className="palette-action-dur">{dur} years</span>
              {a.materialCost && (
                <span className="palette-action-cost">{a.materialCost} materials</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QueueItem({
  entry,
  index,
  isActive,
  progress,
  duration,
  isFirst,
  isLast,
  dispatch,
}: {
  entry: QueueEntry;
  index: number;
  isActive: boolean;
  progress: number;
  duration: number;
  isFirst: boolean;
  isLast: boolean;
  dispatch: React.Dispatch<GameAction>;
}) {
  const def = getActionDef(entry.actionId);
  const [editingRepeat, setEditingRepeat] = useState(false);
  const [repeatInput, setRepeatInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingRepeat && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingRepeat]);

  if (!def) return null;

  const pct = isActive ? Math.min(100, (progress / duration) * 100) : 0;
  const repeatLabel = entry.repeat === -1 ? "\u221E" : `\u00D7${entry.repeat}`;

  const handleRepeatClick = () => {
    setEditingRepeat(true);
    setRepeatInput(entry.repeat === -1 ? "" : String(entry.repeat));
  };

  const commitRepeat = () => {
    setEditingRepeat(false);
    const val = parseInt(repeatInput, 10);
    if (isNaN(val) || val < 1) return;
    dispatch({ type: "queue_set_repeat", uid: entry.uid, repeat: val });
  };

  const handleRepeatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitRepeat();
    if (e.key === "Escape") setEditingRepeat(false);
  };

  return (
    <div className={`queue-item ${isActive ? "active" : ""}`}>
      {isActive && (
        <div className="queue-item-progress" style={{ width: `${pct}%` }} />
      )}
      <div className="queue-item-content">
        <div className="queue-item-left">
          <span className="queue-item-index">{index + 1}</span>
          <span
            className="queue-item-dot"
            style={{ background: SKILL_COLORS[def.skill] }}
          />
          <span className="queue-item-name">{def.name}</span>
          {editingRepeat ? (
            <span className="queue-item-repeat-edit">
              <input
                ref={inputRef}
                type="number"
                min="1"
                value={repeatInput}
                onChange={(e) => setRepeatInput(e.target.value)}
                onBlur={commitRepeat}
                onKeyDown={handleRepeatKeyDown}
                className="repeat-input"
              />
              <button
                className="repeat-inf-btn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  dispatch({ type: "queue_set_repeat", uid: entry.uid, repeat: -1 });
                  setEditingRepeat(false);
                }}
                title="Repeat forever"
              >
                {"\u221E"}
              </button>
            </span>
          ) : (
            <button
              className="queue-item-repeat"
              onClick={handleRepeatClick}
              title="Click to set repeat count"
            >
              {repeatLabel}
            </button>
          )}
          {isActive && (
            <span className="queue-item-timer">
              {progress}/{duration} years
            </span>
          )}
        </div>
        <div className="queue-item-right">
          <button
            className="queue-btn"
            onClick={() =>
              dispatch({ type: "queue_move", uid: entry.uid, direction: "up" })
            }
            disabled={isFirst}
            title="Move up"
          >
            {"\u25B2"}
          </button>
          <button
            className="queue-btn"
            onClick={() =>
              dispatch({
                type: "queue_move",
                uid: entry.uid,
                direction: "down",
              })
            }
            disabled={isLast}
            title="Move down"
          >
            {"\u25BC"}
          </button>
          <button
            className="queue-btn danger"
            onClick={() =>
              dispatch({ type: "queue_remove", uid: entry.uid })
            }
            title="Remove"
          >
            {"\u2715"}
          </button>
        </div>
      </div>
    </div>
  );
}

function QueuePreviewDisplay({ preview }: { preview: QueuePreview }) {
  const { resources, yearReached, collapsed } = preview;

  return (
    <div className="queue-preview">
      <div className="queue-preview-header">
        <span className="queue-preview-label">Projected outcome</span>
        <span className="queue-preview-year">
          {collapsed
            ? `collapses year ${yearReached.toLocaleString()}`
            : `year ${yearReached.toLocaleString()}`}
        </span>
      </div>
      <div className="queue-preview-resources">
        <span className="queue-preview-item">
          <span className="queue-preview-icon">{"\uD83C\uDF3E"}</span>
          <span className="queue-preview-val">{Math.floor(resources.food)}</span>
          <span className="queue-preview-extra">/{Math.floor(resources.foodStorage)}</span>
        </span>
        <span className="queue-preview-item">
          <span className="queue-preview-icon">{"\uD83D\uDC65"}</span>
          <span className="queue-preview-val">{resources.population}</span>
          <span className="queue-preview-extra">/{resources.maxPopulation}</span>
        </span>
        {resources.materials > 0 && (
          <span className="queue-preview-item">
            <span className="queue-preview-icon">{"\uD83E\uDEA8"}</span>
            <span className="queue-preview-val">{Math.floor(resources.materials)}</span>
          </span>
        )}
        {(resources.militaryStrength > 0 || resources.wallDefense > 0) && (
          <span className="queue-preview-item">
            <span className="queue-preview-icon">{"\u2694"}</span>
            <span className="queue-preview-val">
              {Math.floor(resources.militaryStrength + resources.wallDefense)}
            </span>
          </span>
        )}
        {resources.techLevel > 0 && (
          <span className="queue-preview-item">
            <span className="queue-preview-icon">{"\uD83D\uDD2C"}</span>
            <span className="queue-preview-val">{resources.techLevel}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function QueuePanel({ state, totalRuns, dispatch }: QueuePanelProps) {
  const { run, skills } = state;
  const queue = run.queue;

  const isIdle = run.status === "idle";
  const isRunning = run.status === "running";
  const isPaused = run.status === "paused";
  const isEnded = run.status === "collapsed" || run.status === "victory";

  const getEffectiveDuration = (actionId: ActionId) => {
    const def = getActionDef(actionId);
    if (!def) return 1;
    return Math.max(
      1,
      Math.round(
        def.baseDuration * getSkillDurationMultiplier(skills[def.skill].level),
      ),
    );
  };

  const totalYears = queue.reduce(
    (sum, e) => {
      const dur = getEffectiveDuration(e.actionId);
      const reps = e.repeat === -1 ? 1 : e.repeat; // show 1x for infinite in total
      return sum + dur * reps;
    },
    0,
  );

  // Memoize on skill levels + queue contents to avoid recomputing every tick
  const queueKey = queue.map(e => `${e.actionId}:${e.repeat}`).join(",");
  const preview = useMemo(() => {
    if (queue.length === 0) return null;
    return simulateQueue(skills, queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    skills.farming.level, skills.building.level,
    skills.research.level, skills.military.level,
    queueKey,
  ]);

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <div className="queue-header-left">
          <h2>Queue</h2>
          <div className="queue-meta">
            <span className="queue-count">{queue.length} actions</span>
            <span className="queue-total-years">~{totalYears} years</span>
          </div>
        </div>
        <div className="queue-header-right">
          <span className="run-counter">Run #{totalRuns + 1}</span>
          <label className="auto-restart-toggle" title="Automatically restart on collapse">
            <input
              type="checkbox"
              checked={run.autoRestart}
              onChange={() => dispatch({ type: "toggle_auto_restart" })}
            />
            <span className="auto-restart-label">Auto</span>
          </label>
          {isIdle && (
            <button
              className="ctrl-btn primary"
              onClick={() => dispatch({ type: "start_run" })}
              disabled={run.queue.length === 0}
            >
              Start
            </button>
          )}
          {isRunning && (
            <button
              className="ctrl-btn"
              onClick={() => dispatch({ type: "pause_run" })}
            >
              Pause
            </button>
          )}
          {isPaused && (
            <button
              className="ctrl-btn primary"
              onClick={() => dispatch({ type: "resume_run" })}
            >
              Resume
            </button>
          )}
          {isEnded && (
            <button
              className="ctrl-btn primary"
              onClick={() => dispatch({ type: "reset_run" })}
            >
              New Run
            </button>
          )}
        </div>
      </div>

      {isEnded && (
        <div
          className={`run-result ${run.status === "victory" ? "victory" : "collapse"}`}
        >
          {run.status === "victory"
            ? "Victory!"
            : `Collapsed: ${run.collapseReason ?? "Unknown"}`}
          {run.status === "collapsed" && run.autoRestart && (
            <span className="auto-restart-notice"> (restarting...)</span>
          )}
        </div>
      )}

      <ActionPalette state={state} dispatch={dispatch} />

      <div className="queue-list-container">
        {queue.length === 0 ? (
          <div className="queue-empty">
            <p>No actions queued.</p>
            <p className="queue-empty-hint">
              Click an action above to add it to the queue.
            </p>
          </div>
        ) : (
          <div className="queue-list">
            {queue.map((entry, i) => {
              // Determine which queue array index is currently active
              // currentQueueIndex is a logical position counting repeats
              let activeArrayIdx = -1;
              let logicalPos = 0;
              for (let j = 0; j < queue.length; j++) {
                const reps = queue[j].repeat === -1 ? Infinity : queue[j].repeat;
                if (logicalPos + reps > run.currentQueueIndex) {
                  activeArrayIdx = j;
                  break;
                }
                logicalPos += reps;
              }
              if (activeArrayIdx === -1) activeArrayIdx = queue.length - 1;

              const isActive =
                run.status === "running" && i === activeArrayIdx;
              const duration = getEffectiveDuration(entry.actionId);
              return (
                <QueueItem
                  key={entry.uid}
                  entry={entry}
                  index={i}
                  isActive={isActive}
                  progress={isActive ? run.currentActionProgress : 0}
                  duration={duration}
                  isFirst={i === 0}
                  isLast={i === queue.length - 1}
                  dispatch={dispatch}
                />
              );
            })}
            <div className="queue-repeat-indicator">
              {"\u21BB"} Last action repeats until collapse
            </div>
          </div>
        )}
      </div>

      {preview && <QueuePreviewDisplay preview={preview} />}

      <div className="queue-actions-bar">
        <button
          className="queue-clear-btn"
          onClick={() => dispatch({ type: "queue_clear" })}
          disabled={queue.length === 0}
        >
          Clear Queue
        </button>
      </div>

    </div>
  );
}
