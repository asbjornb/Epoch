import type {
  ActionId,
  GameState,
  QueueEntry,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked, getSkillDurationMultiplier } from "../engine/skills.ts";
import type { GameAction } from "../hooks/useGame.ts";

interface QueuePanelProps {
  state: GameState;
  totalRuns: number;
  dispatch: React.Dispatch<GameAction>;
}

const SKILL_COLORS: Record<string, string> = {
  farming: "#5e7a53",
  building: "#867e74",
  research: "#527a8c",
  military: "#8b5555",
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
  if (!def) return null;

  const pct = isActive ? Math.min(100, (progress / duration) * 100) : 0;
  const repeatLabel = entry.repeat === -1 ? "∞" : `×${entry.repeat}`;

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
          <span className="queue-item-repeat">{repeatLabel}</span>
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
              dispatch({
                type: "queue_set_repeat",
                uid: entry.uid,
                repeat: entry.repeat === -1 ? 1 : entry.repeat === 1 ? 3 : entry.repeat === 3 ? 5 : entry.repeat === 5 ? 10 : -1,
              })
            }
            title="Cycle repeat count (1, 3, 5, 10, ∞)"
          >
            ↻
          </button>
          <button
            className="queue-btn"
            onClick={() =>
              dispatch({ type: "queue_move", uid: entry.uid, direction: "up" })
            }
            disabled={isFirst}
            title="Move up"
          >
            ▲
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
            ▼
          </button>
          <button
            className="queue-btn danger"
            onClick={() =>
              dispatch({ type: "queue_remove", uid: entry.uid })
            }
            title="Remove"
          >
            ✕
          </button>
        </div>
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
              ↻ Last action repeats until collapse
            </div>
          </div>
        )}
      </div>

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
