import { useState } from "react";
import type {
  ActionId,
  GameState,
  QueueEntry,
  SavedQueue,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked, getSkillDurationMultiplier } from "../engine/skills.ts";

interface QueuePanelProps {
  state: GameState;
  dispatch: React.Dispatch<any>;
}

const SKILL_COLORS: Record<string, string> = {
  farming: "#4a7c3f",
  building: "#8b6914",
  research: "#3a5f8a",
  military: "#8a3a3a",
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
  dispatch: React.Dispatch<any>;
}) {
  const available = ACTION_DEFS.filter((a) =>
    isActionUnlocked(state.skills, a.skill, a.unlockLevel),
  );
  const locked = ACTION_DEFS.filter(
    (a) => !isActionUnlocked(state.skills, a.skill, a.unlockLevel),
  );

  return (
    <div className="action-palette">
      <div className="palette-label">Actions</div>
      <div className="palette-grid">
        {available.map((a) => {
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
              style={{ borderLeftColor: SKILL_COLORS[a.skill] }}
              onClick={() => dispatch({ type: "queue_add", actionId: a.id })}
              title={a.description}
            >
              <span className="palette-action-icon">{SKILL_ICONS[a.skill]}</span>
              <span className="palette-action-name">{a.name}</span>
              <span className="palette-action-dur">{dur}y</span>
            </button>
          );
        })}
        {locked.map((a) => (
          <button
            key={a.id}
            className="palette-action locked"
            disabled
            title={`Requires ${a.skill} level ${a.unlockLevel}`}
          >
            <span className="palette-action-icon">🔒</span>
            <span className="palette-action-name">{a.name}</span>
            <span className="palette-action-dur">Lv{a.unlockLevel}</span>
          </button>
        ))}
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
  dispatch: React.Dispatch<any>;
}) {
  const def = getActionDef(entry.actionId);
  if (!def) return null;

  const pct = isActive ? Math.min(100, (progress / duration) * 100) : 0;

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
          {isActive && (
            <span className="queue-item-timer">
              {progress}/{duration}y
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

function SavedQueuesBar({
  savedQueues,
  currentQueue,
  dispatch,
}: {
  savedQueues: SavedQueue[];
  currentQueue: QueueEntry[];
  dispatch: React.Dispatch<any>;
}) {
  const [saveName, setSaveName] = useState("");

  return (
    <div className="saved-queues-bar">
      <div className="save-queue-form">
        <input
          type="text"
          placeholder="Queue name..."
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          className="save-queue-input"
        />
        <button
          className="save-queue-btn"
          disabled={!saveName.trim() || currentQueue.length === 0}
          onClick={() => {
            dispatch({ type: "save_queue", name: saveName.trim() });
            setSaveName("");
          }}
        >
          Save
        </button>
      </div>
      {savedQueues.length > 0 && (
        <div className="saved-queue-list">
          {savedQueues.map((sq) => (
            <div key={sq.name} className="saved-queue-chip">
              <button
                className="saved-queue-load"
                onClick={() =>
                  dispatch({ type: "queue_load", entries: sq.entries })
                }
                title={`Load "${sq.name}" (${sq.entries.length} actions)`}
              >
                {sq.name}
              </button>
              <button
                className="saved-queue-delete"
                onClick={() =>
                  dispatch({ type: "delete_saved_queue", name: sq.name })
                }
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QueuePanel({ state, dispatch }: QueuePanelProps) {
  const { run, skills } = state;
  const queue = run.queue;

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
    (sum, e) => sum + getEffectiveDuration(e.actionId),
    0,
  );

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <h2>Queue</h2>
        <div className="queue-meta">
          <span className="queue-count">{queue.length} actions</span>
          <span className="queue-total-years">{totalYears} years</span>
        </div>
      </div>

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
              const isActive =
                run.status === "running" &&
                (i === run.currentQueueIndex ||
                  (i === queue.length - 1 &&
                    run.currentQueueIndex >= queue.length));
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

      <SavedQueuesBar
        savedQueues={state.savedQueues}
        currentQueue={queue}
        dispatch={dispatch}
      />
    </div>
  );
}
