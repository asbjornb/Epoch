import { useMemo } from "react";
import type {
  ActionId,
  GameState,
  QueueEntry,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked } from "../engine/skills.ts";
import { simulateQueuePreview, getEffectiveDuration, getTotalDefense, getBuildingCount, getScaledWoodCost } from "../engine/simulation.ts";
import type { GameAction } from "../hooks/useGame.ts";


interface QueuePanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  draftMode: boolean;
  onDraftModeChange: (mode: boolean) => void;
  draftQueue: QueueEntry[];
  onDraftQueueChange: (queue: QueueEntry[]) => void;
  draftRepeatLast: boolean;
  onDraftRepeatLastChange: (val: boolean) => void;
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

export function ActionPalette({
  state,
  onActionClick,
  currentQueue,
}: {
  state: GameState;
  onActionClick: (actionId: ActionId) => void;
  currentQueue?: QueueEntry[];
}) {
  // Only show actions that are both in unlockedActions and meet skill level requirements
  const visible = ACTION_DEFS.filter(
    (a) =>
      state.unlockedActions.includes(a.id) &&
      isActionUnlocked(state.skills, a.unlockSkill ?? a.skill, a.unlockLevel),
  );

  const queuedIds = (currentQueue ?? state.run.queue).map((e) => e.actionId);

  return (
    <div className="action-palette">
      <div className="palette-label">
        <span className="palette-label-text">Actions</span>
      </div>
      <div className="palette-grid">
        {visible.map((a) => {
          const dur = getEffectiveDuration(
            a.baseDuration,
            state.skills[a.skill].level,
            state.run.resources.population,
            a.category,
            a.completionOnly,
          );
          // Research techs are single-use: disabled if already queued
          const isResearch = a.category === "research";
          const alreadyQueued = isResearch && queuedIds.includes(a.id);
          return (
            <button
              key={a.id}
              className={`palette-action${alreadyQueued ? " palette-action-disabled" : ""}`}
              style={{ borderTopColor: SKILL_COLORS[a.skill], opacity: alreadyQueued ? 0.4 : 1 }}
              onClick={() => !alreadyQueued && onActionClick(a.id)}
              title={alreadyQueued ? `${a.name} already queued (single-use)` : a.description}
              disabled={alreadyQueued}
            >
              <span className="palette-action-icon">{SKILL_ICONS[a.skill]}</span>
              <span className="palette-action-name">{a.name}</span>
              <span className="palette-action-dur">{dur} years</span>
              {a.woodCost && (
                <span className="palette-action-cost">{getScaledWoodCost(a.woodCost, getBuildingCount(state.run.resources, a.id))} wood</span>
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
  currentRepeat,
  isRepeatingLast,
  isFirst,
  isLast,
  onSetRepeat,
  onMove,
  onRemove,
}: {
  entry: QueueEntry;
  index: number;
  isActive: boolean;
  progress: number;
  duration: number;
  currentRepeat: number;
  isRepeatingLast: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSetRepeat: (uid: string, repeat: number) => void;
  onMove: (uid: string, direction: "up" | "down") => void;
  onRemove: (uid: string) => void;
}) {
  const def = getActionDef(entry.actionId);
  if (!def) return null;

  const pct = isActive ? Math.min(100, (progress / duration) * 100) : 0;
  const showRepeatProgress = isActive && entry.repeat > 1 && !isRepeatingLast;
  const repeatPct = showRepeatProgress
    ? Math.min(100, ((currentRepeat - 1 + pct / 100) / entry.repeat) * 100)
    : 0;
  const showRepeatLastCount = isActive && isRepeatingLast;
  const totalRepeatCount = isRepeatingLast ? entry.repeat + currentRepeat : 0;
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
          {def.category !== "research" && (
            <span className="queue-repeat-control">
              <button
                className="queue-repeat-btn"
                onClick={() => {
                  const next = Math.max(1, entry.repeat - 1);
                  onSetRepeat(entry.uid, next);
                }}
                title="Decrease"
              >
                -
              </button>
              <input
                type="number"
                className="queue-repeat-input"
                value={entry.repeat}
                min={1}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    onSetRepeat(entry.uid, val);
                  }
                }}
              />
              <button
                className="queue-repeat-btn"
                onClick={() => {
                  onSetRepeat(entry.uid, entry.repeat + 1);
                }}
                title="Increase"
              >
                +
              </button>
            </span>
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
            onClick={() => onMove(entry.uid, "up")}
            disabled={isFirst}
            title="Move up"
          >
            ▲
          </button>
          <button
            className="queue-btn"
            onClick={() => onMove(entry.uid, "down")}
            disabled={isLast}
            title="Move down"
          >
            ▼
          </button>
          <button
            className="queue-btn danger"
            onClick={() => onRemove(entry.uid)}
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
      {showRepeatProgress && (
        <div className="queue-repeat-progress">
          <div className="queue-repeat-progress-track">
            <div
              className="queue-repeat-progress-fill"
              style={{ width: `${repeatPct}%` }}
            />
            {Array.from({ length: entry.repeat - 1 }, (_, i) => (
              <div
                key={i}
                className="queue-repeat-progress-divider"
                style={{ left: `${((i + 1) / entry.repeat) * 100}%` }}
              />
            ))}
          </div>
          <span className="queue-repeat-progress-label">
            {currentRepeat} of {entry.repeat}
          </span>
        </div>
      )}
      {showRepeatLastCount && (
        <div className="queue-repeat-progress">
          <span className="queue-repeat-progress-label">
            ×{totalRepeatCount}
          </span>
        </div>
      )}
    </div>
  );
}

function QueuePreviewDisplay({
  queue,
  skills,
  repeatLastAction,
  label,
}: {
  queue: QueueEntry[];
  skills: GameState["skills"];
  repeatLastAction: boolean;
  label?: string;
}) {
  const preview = useMemo(
    () => simulateQueuePreview(queue, skills, repeatLastAction),
    [queue, skills, repeatLastAction],
  );

  if (queue.length === 0) return null;

  const r = preview.resources;

  const items: { label: string; value: string }[] = [];

  items.push({ label: "Food", value: `${Math.floor(r.food)}` });
  if (r.preservedFood > 0) {
    items.push({ label: "Preserved", value: `${Math.floor(r.preservedFood)}` });
  }
  items.push({ label: "Wood", value: `${Math.floor(r.wood)}` });

  const totalDef = Math.floor(getTotalDefense(r));
  if (totalDef > 0) {
    items.push({ label: "Defense", value: `${totalDef}` });
  }

  items.push({ label: "Storage", value: `${Math.floor(r.foodStorage)}` });

  return (
    <div className={`queue-preview${preview.collapsed ? " queue-preview-collapsed" : ""}`}>
      <div className="queue-preview-header">
        <span className="queue-preview-label">{label ?? "Projected outcome"}</span>
        <span className="queue-preview-years">
          {preview.yearsUsed.toLocaleString()} years
          {preview.collapsed && " (collapses)"}
        </span>
      </div>
      <div className="queue-preview-items">
        {items.map((item) => (
          <div key={item.label} className="queue-preview-item">
            <span className="queue-preview-item-label">{item.label}</span>
            <span className="queue-preview-item-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueuePanel({
  state,
  dispatch,
  draftMode,
  onDraftModeChange,
  draftQueue,
  onDraftQueueChange,
  draftRepeatLast,
  onDraftRepeatLastChange,
}: QueuePanelProps) {
  const { run, skills } = state;
  const queue = run.queue;

  const isIdle = run.status === "idle";
  const isRunning = run.status === "running";
  const isPaused = run.status === "paused";
  const isEnded = run.status === "collapsed" || run.status === "victory";

  const getEffDuration = (actionId: ActionId) => {
    const def = getActionDef(actionId);
    if (!def) return 1;
    return getEffectiveDuration(
      def.baseDuration,
      skills[def.skill].level,
      run.resources.population,
      def.category,
      def.completionOnly,
    );
  };

  // Live queue callbacks
  const liveSetRepeat = (uid: string, repeat: number) =>
    dispatch({ type: "queue_set_repeat", uid, repeat });
  const liveMove = (uid: string, direction: "up" | "down") =>
    dispatch({ type: "queue_move", uid, direction });
  const liveRemove = (uid: string) =>
    dispatch({ type: "queue_remove", uid });

  // Draft queue callbacks
  const draftSetRepeat = (uid: string, repeat: number) =>
    onDraftQueueChange(draftQueue.map((e) => {
      if (e.uid !== uid) return e;
      // Research techs are single-use
      const eDef = getActionDef(e.actionId);
      if (eDef?.category === "research") return e;
      return { ...e, repeat };
    }));
  const draftMove = (uid: string, direction: "up" | "down") => {
    const q = [...draftQueue];
    const idx = q.findIndex((e) => e.uid === uid);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= q.length) return;
    [q[idx], q[swapIdx]] = [q[swapIdx], q[idx]];
    onDraftQueueChange(q);
  };
  const draftRemove = (uid: string) =>
    onDraftQueueChange(draftQueue.filter((e) => e.uid !== uid));

  const applyDraft = () => {
    const status = run.status;

    // Collapse the current run if it's active
    if (status === "running" || status === "paused") {
      dispatch({ type: "force_collapse", reason: "Restarted with new queue." });
    }

    // Reset to save history and create a fresh run (skip if never started)
    if (status !== "idle") {
      dispatch({ type: "reset_run" });
    }

    // Load the draft queue into the new run
    dispatch({ type: "queue_load", queue: draftQueue, repeatLastAction: draftRepeatLast });

    // Start the new run
    dispatch({ type: "start_run" });

    onDraftModeChange(false);
  };

  const copyFromLive = () => {
    onDraftQueueChange(queue.map((e) => ({ ...e })));
    onDraftRepeatLastChange(run.repeatLastAction);
  };

  // Queue stats
  const computeQueueStats = (q: QueueEntry[]) => {
    const hasInfinite = q.some((e) => e.repeat === -1);
    const total = hasInfinite
      ? null
      : q.reduce((sum, e) => sum + getEffDuration(e.actionId) * e.repeat, 0);
    return { count: q.length, totalYears: total };
  };

  const liveStats = computeQueueStats(queue);
  const draftStats = computeQueueStats(draftQueue);

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <div className="queue-header-left">
          <div className="queue-tabs">
            <button
              className={`queue-tab ${!draftMode ? "active" : ""}`}
              onClick={() => onDraftModeChange(false)}
            >
              Queue
            </button>
            <button
              className={`queue-tab ${draftMode ? "active" : ""}`}
              onClick={() => onDraftModeChange(true)}
            >
              Draft
            </button>
          </div>
          <div className="queue-meta">
            {draftMode ? (
              <>
                <span className="queue-count">{draftStats.count} actions</span>
                {draftStats.totalYears !== null && (
                  <span className="queue-total-years">~{draftStats.totalYears} years</span>
                )}
              </>
            ) : (
              <>
                <span className="queue-count">{liveStats.count} actions</span>
                {liveStats.totalYears !== null && (
                  <span className="queue-total-years">~{liveStats.totalYears} years</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="queue-header-right">
          {!draftMode && (
            <>
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
              {(isRunning || isPaused) && (
                <button
                  className="ctrl-btn danger"
                  onClick={() => dispatch({ type: "force_collapse" })}
                  title="Abandon this run and start fresh"
                >
                  Collapse
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
            </>
          )}
          {draftMode && (
            <button
              className="ctrl-btn primary"
              onClick={applyDraft}
              disabled={draftQueue.length === 0}
              title="Replace live queue with this draft"
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {!draftMode && isEnded && (
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

      {/* ===== Live Queue View ===== */}
      {!draftMode && (
        <>
          <div className="queue-list-container">
            {queue.length === 0 ? (
              <div className="queue-empty">
                <p>No actions queued.</p>
                <p className="queue-empty-hint">
                  Select an action to add it to the queue.
                </p>
              </div>
            ) : (
              <div className="queue-list">
                {(() => {
                  let activeArrayIdx = -1;
                  let activeLogicalStart = 0;
                  let logicalPos = 0;
                  for (let j = 0; j < queue.length; j++) {
                    const reps = queue[j].repeat;
                    if (logicalPos + reps > run.currentQueueIndex) {
                      activeArrayIdx = j;
                      activeLogicalStart = logicalPos;
                      break;
                    }
                    logicalPos += reps;
                  }
                  let isRepeatingLast = false;
                  if (activeArrayIdx === -1 && run.repeatLastAction) {
                    activeArrayIdx = queue.length - 1;
                    activeLogicalStart = logicalPos;
                    isRepeatingLast = true;
                  }
                  const currentRepeat = run.currentQueueIndex - activeLogicalStart + 1;

                  return queue.map((entry, i) => {
                    const isActive = run.status === "running" && i === activeArrayIdx;
                    const duration = getEffDuration(entry.actionId);
                    return (
                      <QueueItem
                        key={entry.uid}
                        entry={entry}
                        index={i}
                        isActive={isActive}
                        progress={isActive ? run.currentActionProgress : 0}
                        duration={duration}
                        currentRepeat={isActive ? currentRepeat : 0}
                        isRepeatingLast={isRepeatingLast && i === activeArrayIdx}
                        isFirst={i === 0}
                        isLast={i === queue.length - 1}
                        onSetRepeat={liveSetRepeat}
                        onMove={liveMove}
                        onRemove={liveRemove}
                      />
                    );
                  });
                })()}
                <div className="queue-toggles">
                  <button
                    className={`queue-toggle-row ${run.repeatLastAction ? "active" : ""}`}
                    onClick={() => dispatch({ type: "toggle_repeat_last_action" })}
                    title={run.repeatLastAction
                      ? "Currently repeating last action until collapse. Click to pause at queue end instead."
                      : "Currently pausing at queue end. Click to repeat last action until collapse."}
                  >
                    <span className="queue-toggle-label">
                      {run.repeatLastAction
                        ? "Repeat last action until collapse"
                        : "Pause at queue end"}
                    </span>
                    <span className="queue-toggle-switch">
                      <span className="queue-toggle-track">
                        <span className="queue-toggle-knob" />
                      </span>
                    </span>
                  </button>
                  <button
                    className={`queue-toggle-row ${run.autoRestart ? "active" : ""}`}
                    onClick={() => dispatch({ type: "toggle_auto_restart" })}
                    title={run.autoRestart
                      ? "Automatically restarting on collapse. Click to stop at end instead."
                      : "Stopping on collapse. Click to auto-restart instead."}
                  >
                    <span className="queue-toggle-label">
                      {run.autoRestart
                        ? "Auto-restart on collapse"
                        : "Stop on collapse"}
                    </span>
                    <span className="queue-toggle-switch">
                      <span className="queue-toggle-track">
                        <span className="queue-toggle-knob" />
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <QueuePreviewDisplay
            queue={queue}
            skills={skills}
            repeatLastAction={run.repeatLastAction}
          />

          <div className="queue-actions-bar">
            <button
              className="queue-clear-btn"
              onClick={() => dispatch({ type: "queue_clear" })}
              disabled={queue.length === 0}
            >
              Clear Queue
            </button>
          </div>
        </>
      )}

      {/* ===== Draft Queue View ===== */}
      {draftMode && (
        <>
          <div className="queue-list-container">
            {draftQueue.length === 0 ? (
              <div className="queue-empty">
                <p>Draft is empty.</p>
                <p className="queue-empty-hint">
                  Add actions to plan your next queue, or copy the current one.
                </p>
              </div>
            ) : (
              <div className="queue-list">
                {draftQueue.map((entry, i) => {
                  const duration = getEffDuration(entry.actionId);
                  return (
                    <QueueItem
                      key={entry.uid}
                      entry={entry}
                      index={i}
                      isActive={false}
                      progress={0}
                      duration={duration}
                      currentRepeat={0}
                      isRepeatingLast={false}
                      isFirst={i === 0}
                      isLast={i === draftQueue.length - 1}
                      onSetRepeat={draftSetRepeat}
                      onMove={draftMove}
                      onRemove={draftRemove}
                    />
                  );
                })}
                <div className="queue-toggles">
                  <button
                    className={`queue-toggle-row ${draftRepeatLast ? "active" : ""}`}
                    onClick={() => onDraftRepeatLastChange(!draftRepeatLast)}
                    title={draftRepeatLast
                      ? "Draft: repeating last action. Click to pause at queue end."
                      : "Draft: pausing at queue end. Click to repeat last action."}
                  >
                    <span className="queue-toggle-label">
                      {draftRepeatLast
                        ? "Repeat last action until collapse"
                        : "Pause at queue end"}
                    </span>
                    <span className="queue-toggle-switch">
                      <span className="queue-toggle-track">
                        <span className="queue-toggle-knob" />
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <QueuePreviewDisplay
            queue={draftQueue}
            skills={skills}
            repeatLastAction={draftRepeatLast}
            label="Draft projection"
          />

          <div className="queue-actions-bar">
            <button
              className="queue-clear-btn"
              onClick={copyFromLive}
              title="Copy current live queue into draft"
            >
              Copy Current
            </button>
            <button
              className="queue-clear-btn"
              onClick={() => onDraftQueueChange([])}
              disabled={draftQueue.length === 0}
            >
              Clear Draft
            </button>
          </div>
        </>
      )}
    </div>
  );
}
