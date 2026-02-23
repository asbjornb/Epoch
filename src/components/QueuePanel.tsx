import { useMemo, useState, useRef, useCallback } from "react";
import type {
  ActionId,
  GameState,
  QueueEntry,
  SavedQueue,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked } from "../engine/skills.ts";
import { simulateQueuePreview, getEffectiveDuration, getTotalDefense, getBuildingCount, getScaledWoodCost } from "../engine/simulation.ts";
import { resolveLogicalIndex, getGroupRange, getQueueLogicalSize } from "../engine/queueGroups.ts";
import type { GameAction } from "../hooks/useGame.ts";
import { makeGroupId, makeUid, loadSavedQueues, persistSavedQueues, stripQueueForSave } from "../hooks/useGame.ts";


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
  inGroup,
  onSetRepeat,
  onMove,
  onRemove,
  onDuplicate,
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
  inGroup: boolean;
  onSetRepeat: (uid: string, repeat: number) => void;
  onMove: (uid: string, direction: "up" | "down") => void;
  onRemove: (uid: string) => void;
  onDuplicate: (uid: string) => void;
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
    <div className={`queue-item ${isActive ? "active" : ""}${inGroup ? " in-group" : ""}`}>
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
          <span className="queue-item-timer">
            {isActive
              ? `${progress}/${duration} years`
              : `${(duration * entry.repeat).toLocaleString()} yrs`}
          </span>
        </div>
        <div className="queue-item-right">
          {!inGroup && (
            <>
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
              {def.category !== "research" && (
                <button
                  className="queue-btn"
                  onClick={() => onDuplicate(entry.uid)}
                  title="Duplicate"
                >
                  ⧉
                </button>
              )}
            </>
          )}
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

/** Group wrapper showing merged items with shared controls. */
function QueueGroup({
  groupId,
  groupRepeat,
  children,
  isFirstSegment,
  isLastSegment,
  activeGroupIter,
  totalGroupIters,
  onSetGroupRepeat,
  onMoveGroup,
  onDuplicateGroup,
  onSplitGroup,
}: {
  groupId: string;
  groupRepeat: number;
  children: React.ReactNode;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  activeGroupIter: number; // 0 if not active, 1-based iter if active
  totalGroupIters: number;
  onSetGroupRepeat: (groupId: string, repeat: number) => void;
  onMoveGroup: (groupId: string, direction: "up" | "down") => void;
  onDuplicateGroup: (groupId: string) => void;
  onSplitGroup: (groupId: string) => void;
}) {
  const showIterProgress = activeGroupIter > 0 && groupRepeat > 1;
  const iterPct = showIterProgress
    ? Math.min(100, ((activeGroupIter - 1) / groupRepeat) * 100)
    : 0;

  return (
    <div className="queue-group">
      <div className="queue-group-header">
        <div className="queue-group-header-left">
          <span className="queue-group-label">Group</span>
          <span className="queue-repeat-control">
            <button
              className="queue-repeat-btn"
              onClick={() => onSetGroupRepeat(groupId, Math.max(1, groupRepeat - 1))}
              title="Decrease group repeat"
            >
              -
            </button>
            <input
              type="number"
              className="queue-repeat-input"
              value={groupRepeat}
              min={1}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  onSetGroupRepeat(groupId, val);
                }
              }}
            />
            <button
              className="queue-repeat-btn"
              onClick={() => onSetGroupRepeat(groupId, groupRepeat + 1)}
              title="Increase group repeat"
            >
              +
            </button>
          </span>
          {groupRepeat > 1 && <span className="queue-group-repeat-label">&times;{groupRepeat}</span>}
        </div>
        <div className="queue-group-header-right">
          <button
            className="queue-btn"
            onClick={() => onMoveGroup(groupId, "up")}
            disabled={isFirstSegment}
            title="Move group up"
          >
            ▲
          </button>
          <button
            className="queue-btn"
            onClick={() => onMoveGroup(groupId, "down")}
            disabled={isLastSegment}
            title="Move group down"
          >
            ▼
          </button>
          <button
            className="queue-btn"
            onClick={() => onDuplicateGroup(groupId)}
            title="Duplicate group"
          >
            ⧉
          </button>
          <button
            className="queue-btn"
            onClick={() => onSplitGroup(groupId)}
            title="Split group into individual items"
          >
            ⤬
          </button>
        </div>
      </div>
      <div className="queue-group-items">
        {children}
      </div>
      {showIterProgress && (
        <div className="queue-repeat-progress queue-group-iter-progress">
          <div className="queue-repeat-progress-track">
            <div
              className="queue-repeat-progress-fill"
              style={{ width: `${iterPct}%` }}
            />
            {Array.from({ length: groupRepeat - 1 }, (_, i) => (
              <div
                key={i}
                className="queue-repeat-progress-divider"
                style={{ left: `${((i + 1) / groupRepeat) * 100}%` }}
              />
            ))}
          </div>
          <span className="queue-repeat-progress-label">
            cycle {activeGroupIter} of {totalGroupIters}
          </span>
        </div>
      )}
    </div>
  );
}

function QueuePreviewDisplay({
  queue,
  skills,
  encounteredDisasters,
  label,
}: {
  queue: QueueEntry[];
  skills: GameState["skills"];
  encounteredDisasters: string[];
  label?: string;
}) {
  const hasSeenWinter = encounteredDisasters.includes("winter");
  const preview = useMemo(
    () => simulateQueuePreview(queue, skills, hasSeenWinter),
    [queue, skills, hasSeenWinter],
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

  const collapseActionName = preview.collapseActionId
    ? getActionDef(preview.collapseActionId)?.name
    : undefined;

  return (
    <div className={`queue-preview${preview.collapsed ? " queue-preview-collapsed" : ""}`}>
      <div className="queue-preview-header">
        <span className="queue-preview-label">{label ?? "Projected outcome"}</span>
        <span className="queue-preview-years">
          {preview.yearsUsed.toLocaleString()} years
          {preview.collapsed && " (collapses)"}
        </span>
      </div>
      {preview.collapsed && collapseActionName && (
        <div className="queue-preview-collapse-detail">
          Starves during: {collapseActionName}
        </div>
      )}
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

/** Build segments from queue for rendering: groups and standalone items. */
interface Segment {
  type: "standalone" | "group";
  entries: { entry: QueueEntry; arrayIndex: number }[];
  groupId?: string;
  groupRepeat?: number;
}

function buildSegments(queue: QueueEntry[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];
    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;
      const entries: Segment["entries"] = [];
      for (let j = range.startIdx; j < range.endIdx; j++) {
        entries.push({ entry: queue[j], arrayIndex: j });
      }
      segments.push({
        type: "group",
        entries,
        groupId: entry.groupId,
        groupRepeat: range.groupRepeat,
      });
      i = range.endIdx;
    } else {
      segments.push({
        type: "standalone",
        entries: [{ entry, arrayIndex: i }],
      });
      i++;
    }
  }
  return segments;
}

/** Saved queues section: save current queue as a named preset, load or delete saved presets. */
function SavedQueuesSection({
  currentQueue,
  repeatLastAction,
  onLoad,
}: {
  currentQueue: QueueEntry[];
  repeatLastAction: boolean;
  onLoad: (queue: QueueEntry[], repeatLastAction: boolean) => void;
}) {
  const [savedQueues, setSavedQueues] = useState<SavedQueue[]>(loadSavedQueues);
  const [expanded, setExpanded] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name || currentQueue.length === 0) return;
    const newEntry: SavedQueue = {
      name,
      queue: stripQueueForSave(currentQueue),
      repeatLastAction,
    };
    const updated = [...savedQueues, newEntry];
    setSavedQueues(updated);
    persistSavedQueues(updated);
    setSaveName("");
    setShowSaveInput(false);
    setExpanded(true);
  };

  const handleDelete = (index: number) => {
    const updated = savedQueues.filter((_, i) => i !== index);
    setSavedQueues(updated);
    persistSavedQueues(updated);
  };

  const handleLoad = (sq: SavedQueue) => {
    // Hydrate entries with fresh UIDs and group IDs
    const groupIdMap = new Map<string, string>();
    const hydrated: QueueEntry[] = sq.queue.map((e) => {
      const entry: QueueEntry = { uid: makeUid(), actionId: e.actionId, repeat: e.repeat };
      if (e.groupId) {
        if (!groupIdMap.has(e.groupId)) {
          groupIdMap.set(e.groupId, makeGroupId());
        }
        entry.groupId = groupIdMap.get(e.groupId);
        entry.groupRepeat = e.groupRepeat;
      }
      return entry;
    });
    onLoad(hydrated, sq.repeatLastAction);
  };

  const handleOverwrite = (index: number) => {
    if (currentQueue.length === 0) return;
    const updated = [...savedQueues];
    updated[index] = {
      ...updated[index],
      queue: stripQueueForSave(currentQueue),
      repeatLastAction,
    };
    setSavedQueues(updated);
    persistSavedQueues(updated);
  };

  return (
    <div className="saved-queues-section">
      <div className="saved-queues-header">
        <button
          className="saved-queues-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="saved-queues-arrow">{expanded ? "\u25BE" : "\u25B8"}</span>
          Saved Queues
          {savedQueues.length > 0 && (
            <span className="saved-queues-count">({savedQueues.length})</span>
          )}
        </button>
        {!showSaveInput ? (
          <button
            className="queue-clear-btn"
            onClick={() => {
              setShowSaveInput(true);
              setExpanded(true);
              requestAnimationFrame(() => saveInputRef.current?.focus());
            }}
            disabled={currentQueue.length === 0}
            title="Save current queue as a preset"
          >
            Save As...
          </button>
        ) : (
          <div className="saved-queues-save-row">
            <input
              ref={saveInputRef}
              type="text"
              className="saved-queues-name-input"
              placeholder="Queue name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setShowSaveInput(false); setSaveName(""); }
              }}
              maxLength={30}
            />
            <button
              className="queue-clear-btn"
              onClick={handleSave}
              disabled={!saveName.trim()}
            >
              Save
            </button>
            <button
              className="queue-clear-btn"
              onClick={() => { setShowSaveInput(false); setSaveName(""); }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="saved-queues-list">
          {savedQueues.length === 0 ? (
            <div className="saved-queues-empty">No saved queues yet.</div>
          ) : (
            savedQueues.map((sq, i) => (
              <div key={i} className="saved-queue-item">
                <div className="saved-queue-info">
                  <span className="saved-queue-name">{sq.name}</span>
                  <span className="saved-queue-meta">
                    {sq.queue.length} action{sq.queue.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="saved-queue-actions">
                  <button
                    className="queue-clear-btn"
                    onClick={() => handleLoad(sq)}
                    title="Load this queue"
                  >
                    Load
                  </button>
                  <button
                    className="queue-clear-btn"
                    onClick={() => handleOverwrite(i)}
                    disabled={currentQueue.length === 0}
                    title="Overwrite with current queue"
                  >
                    Update
                  </button>
                  <button
                    className="queue-btn danger"
                    onClick={() => handleDelete(i)}
                    title="Delete saved queue"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
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

  // Drag-and-drop state (shared between mouse and touch)
  const [dragSourceSegIdx, setDragSourceSegIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ segIdx: number; position: "before" | "after" | "merge" } | null>(null);
  const dragCounterRef = useRef(0);

  // Touch drag state
  const touchDragActive = useRef(false);
  const touchStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchSourceSegIdx = useRef<number | null>(null);

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
  const liveDuplicate = (uid: string) =>
    dispatch({ type: "queue_duplicate", uid });
  const liveSplit = (groupId: string) =>
    dispatch({ type: "queue_split", groupId });
  const liveSetGroupRepeat = (groupId: string, repeat: number) =>
    dispatch({ type: "queue_set_group_repeat", groupId, repeat });
  const liveMoveGroup = (groupId: string, direction: "up" | "down") =>
    dispatch({ type: "queue_move_group", groupId, direction });
  const liveDuplicateGroup = (groupId: string) =>
    dispatch({ type: "queue_duplicate_group", groupId });

  // Draft queue callbacks
  const draftSetRepeat = (uid: string, repeat: number) =>
    onDraftQueueChange(draftQueue.map((e) => {
      if (e.uid !== uid) return e;
      const eDef = getActionDef(e.actionId);
      if (eDef?.category === "research") return e;
      return { ...e, repeat };
    }));
  const draftMove = (uid: string, direction: "up" | "down") => {
    const q = [...draftQueue];
    const idx = q.findIndex((e) => e.uid === uid);
    if (idx < 0) return;
    const entry = q[idx];
    // If in group, move the whole group
    if (entry.groupId) {
      draftMoveGroup(entry.groupId, direction);
      return;
    }
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= q.length) return;
    // Skip over groups
    const swapEntry = q[swapIdx];
    if (swapEntry.groupId) {
      const range = getGroupRange(q, swapIdx)!;
      if (direction === "up") {
        const [item] = q.splice(idx, 1);
        q.splice(range.startIdx, 0, item);
      } else {
        const [item] = q.splice(idx, 1);
        q.splice(range.endIdx - 1, 0, item);
      }
    } else {
      [q[idx], q[swapIdx]] = [q[swapIdx], q[idx]];
    }
    onDraftQueueChange(q);
  };
  const draftRemove = (uid: string) => {
    const q = draftQueue.filter((e) => e.uid !== uid);
    // Dissolve single-member groups
    const removed = draftQueue.find((e) => e.uid === uid);
    if (removed?.groupId) {
      const remaining = q.filter((e) => e.groupId === removed.groupId);
      if (remaining.length === 1) {
        remaining[0].groupId = undefined;
        remaining[0].groupRepeat = undefined;
      }
    }
    onDraftQueueChange(q);
  };
  const draftDuplicate = (uid: string) => {
    const idx = draftQueue.findIndex((e) => e.uid === uid);
    if (idx < 0) return;
    const original = draftQueue[idx];
    if (original.groupId) {
      draftDuplicateGroup(original.groupId);
      return;
    }
    const eDef = getActionDef(original.actionId);
    if (eDef?.category === "research") return;
    const copy = { ...original, uid: makeUid(), groupId: undefined, groupRepeat: undefined };
    const q = [...draftQueue];
    q.splice(idx + 1, 0, copy);
    onDraftQueueChange(q);
  };
  const draftSplit = (groupId: string) => {
    onDraftQueueChange(draftQueue.map((e) =>
      e.groupId === groupId ? { ...e, groupId: undefined, groupRepeat: undefined } : e,
    ));
  };
  const draftSetGroupRepeat = (groupId: string, repeat: number) => {
    onDraftQueueChange(draftQueue.map((e) =>
      e.groupId === groupId ? { ...e, groupRepeat: repeat } : e,
    ));
  };
  const draftMoveGroup = (groupId: string, direction: "up" | "down") => {
    const q = [...draftQueue];
    const firstIdx = q.findIndex((e) => e.groupId === groupId);
    if (firstIdx < 0) return;
    const range = getGroupRange(q, firstIdx)!;
    const groupItems = q.splice(range.startIdx, range.endIdx - range.startIdx);
    let insertIdx: number;
    if (direction === "up") {
      if (range.startIdx === 0) return;
      const aboveIdx = range.startIdx - 1;
      if (q[aboveIdx]?.groupId) {
        const aboveRange = getGroupRange(q, aboveIdx)!;
        insertIdx = aboveRange.startIdx;
      } else {
        insertIdx = aboveIdx;
      }
    } else {
      if (range.startIdx >= q.length) return;
      const belowIdx = range.startIdx;
      if (belowIdx >= q.length) return;
      if (q[belowIdx]?.groupId) {
        const belowRange = getGroupRange(q, belowIdx)!;
        insertIdx = belowRange.endIdx;
      } else {
        insertIdx = belowIdx + 1;
      }
    }
    q.splice(insertIdx, 0, ...groupItems);
    onDraftQueueChange(q);
  };
  const draftDuplicateGroup = (groupId: string) => {
    const q = [...draftQueue];
    const firstIdx = q.findIndex((e) => e.groupId === groupId);
    if (firstIdx < 0) return;
    const range = getGroupRange(q, firstIdx)!;
    const groupEntries = q.slice(range.startIdx, range.endIdx);
    if (groupEntries.some((e) => getActionDef(e.actionId)?.category === "research")) return;
    const newGroupId = makeGroupId();
    const duplicates: QueueEntry[] = groupEntries.map((e) => ({
      ...e,
      uid: makeUid(),
      groupId: newGroupId,
    }));
    q.splice(range.endIdx, 0, ...duplicates);
    onDraftQueueChange(q);
  };

  // Drag-and-drop: reorder segment in draft queue
  const draftReorderSegment = (sourceUid: string, targetUid: string, position: "before" | "after") => {
    const q = [...draftQueue];
    const sourceIdx = q.findIndex((e) => e.uid === sourceUid);
    const targetIdx = q.findIndex((e) => e.uid === targetUid);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const sourceEntry = q[sourceIdx];
    let sourceStart: number, sourceEnd: number;
    if (sourceEntry.groupId) {
      const range = getGroupRange(q, sourceIdx)!;
      sourceStart = range.startIdx;
      sourceEnd = range.endIdx;
    } else {
      sourceStart = sourceIdx;
      sourceEnd = sourceIdx + 1;
    }

    const targetEntry = q[targetIdx];
    let targetStart: number;
    if (targetEntry.groupId) {
      const range = getGroupRange(q, targetIdx)!;
      targetStart = range.startIdx;
    } else {
      targetStart = targetIdx;
    }

    if (sourceStart === targetStart) return;

    const sourceItems = q.splice(sourceStart, sourceEnd - sourceStart);

    let insertIdx: number;
    if (position === "before") {
      const newTargetIdx = q.findIndex((e) => e.uid === targetUid);
      if (newTargetIdx < 0) return;
      const te = q[newTargetIdx];
      insertIdx = te.groupId ? getGroupRange(q, newTargetIdx)!.startIdx : newTargetIdx;
    } else {
      const newTargetIdx = q.findIndex((e) => e.uid === targetUid);
      if (newTargetIdx < 0) return;
      const te = q[newTargetIdx];
      insertIdx = te.groupId ? getGroupRange(q, newTargetIdx)!.endIdx : newTargetIdx + 1;
    }

    q.splice(insertIdx, 0, ...sourceItems);
    onDraftQueueChange(q);
  };

  // Drag-and-drop: merge segments in draft queue
  const draftDragMerge = (sourceUid: string, targetUid: string) => {
    const q = [...draftQueue];
    const sourceIdx = q.findIndex((e) => e.uid === sourceUid);
    const targetIdx = q.findIndex((e) => e.uid === targetUid);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const sourceEntry = q[sourceIdx];
    const targetEntry = q[targetIdx];

    let sourceStart: number, sourceEnd: number;
    if (sourceEntry.groupId) {
      const range = getGroupRange(q, sourceIdx)!;
      sourceStart = range.startIdx;
      sourceEnd = range.endIdx;
    } else {
      sourceStart = sourceIdx;
      sourceEnd = sourceIdx + 1;
    }

    let targetStart: number;
    if (targetEntry.groupId) {
      targetStart = getGroupRange(q, targetIdx)!.startIdx;
    } else {
      targetStart = targetIdx;
    }

    if (sourceStart === targetStart) return;

    const sourceItems = q.splice(sourceStart, sourceEnd - sourceStart).map((e) => ({
      ...e,
      groupId: undefined as string | undefined,
      groupRepeat: undefined as number | undefined,
    }));

    const newTargetIdx = q.findIndex((e) => e.uid === targetUid);
    if (newTargetIdx < 0) return;
    const newTargetEntry = q[newTargetIdx];

    if (newTargetEntry.groupId) {
      const range = getGroupRange(q, newTargetIdx)!;
      const groupId = newTargetEntry.groupId;
      const groupRepeat = range.groupRepeat;
      const insertItems = sourceItems.map((e) => ({ ...e, groupId, groupRepeat }));
      q.splice(range.endIdx, 0, ...insertItems);
    } else {
      const groupId = makeGroupId();
      q[newTargetIdx] = { ...q[newTargetIdx], groupId, groupRepeat: 1 };
      const insertItems = sourceItems.map((e) => ({ ...e, groupId, groupRepeat: 1 }));
      q.splice(newTargetIdx + 1, 0, ...insertItems);
    }

    onDraftQueueChange(q);
  };

  const applyDraft = () => {
    const status = run.status;
    if (status === "running" || status === "paused") {
      dispatch({ type: "force_collapse", reason: "Restarted with new queue." });
    }
    if (status !== "idle") {
      dispatch({ type: "reset_run" });
    }
    dispatch({ type: "queue_load", queue: draftQueue, repeatLastAction: draftRepeatLast });
    dispatch({ type: "start_run" });
    onDraftModeChange(false);
  };

  const copyFromLive = () => {
    onDraftQueueChange(queue.map((e) => ({ ...e })));
    onDraftRepeatLastChange(run.repeatLastAction);
  };

  // Queue stats (group-aware)
  const computeQueueStats = (q: QueueEntry[]) => {
    const hasInfinite = q.some((e) => e.repeat === -1);
    if (hasInfinite) return { count: q.length, totalYears: null };
    let total = 0;
    const segments = buildSegments(q);
    for (const seg of segments) {
      const segYears = seg.entries.reduce((sum, { entry }) => sum + getEffDuration(entry.actionId) * entry.repeat, 0);
      total += segYears * (seg.groupRepeat ?? 1);
    }
    return { count: q.length, totalYears: total };
  };

  const liveStats = computeQueueStats(queue);
  const draftStats = computeQueueStats(draftQueue);

  // Active item tracking (group-aware)
  const resolveActive = (q: QueueEntry[], currentQueueIndex: number, repeatLastAction: boolean) => {
    const resolved = resolveLogicalIndex(q, currentQueueIndex);
    let activeArrayIdx = resolved ? resolved.arrayIndex : -1;
    let activeRepeatWithinEntry = resolved ? resolved.repeatWithinEntry : 0;
    const activeGroupIter = resolved ? resolved.groupIteration : 0;
    let isRepeatingLast = false;

    if (!resolved && repeatLastAction && q.length > 0) {
      activeArrayIdx = q.length - 1;
      const totalSize = getQueueLogicalSize(q);
      activeRepeatWithinEntry = currentQueueIndex - totalSize;
      isRepeatingLast = true;
    }

    return { activeArrayIdx, activeRepeatWithinEntry, activeGroupIter, isRepeatingLast };
  };

  // Drag-and-drop handlers
  const handleDragStart = (segIdx: number) => (e: React.DragEvent) => {
    setDragSourceSegIdx(segIdx);
    dragCounterRef.current = 0;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(segIdx));
    // Add a slight delay so the drag image renders before opacity changes
    requestAnimationFrame(() => {
      setDragSourceSegIdx(segIdx);
    });
  };

  const handleDragOver = (segIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragSourceSegIdx === null || dragSourceSegIdx === segIdx) {
      setDropTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const ratio = y / height;

    let position: "before" | "after" | "merge";
    if (ratio < 0.25) {
      position = "before";
    } else if (ratio > 0.75) {
      position = "after";
    } else {
      position = "merge";
    }

    setDropTarget({ segIdx, position });
  };

  const handleDragEnter = (segIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragSourceSegIdx !== null && dragSourceSegIdx !== segIdx) {
      // Will be set by dragOver
    }
  };

  const handleDragLeave = () => (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDropTarget(null);
    }
  };

  const handleDrop = (
    segments: Segment[],
    onReorder: (sourceUid: string, targetUid: string, position: "before" | "after") => void,
    onMerge: (sourceUid: string, targetUid: string) => void,
  ) => () => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragSourceSegIdx === null || !dropTarget) {
      clearDragState();
      return;
    }

    const sourceSeg = segments[dragSourceSegIdx];
    const targetSeg = segments[dropTarget.segIdx];
    if (!sourceSeg || !targetSeg) {
      clearDragState();
      return;
    }

    const sourceUid = sourceSeg.entries[0].entry.uid;
    const targetUid = targetSeg.entries[0].entry.uid;

    if (dropTarget.position === "merge") {
      onMerge(sourceUid, targetUid);
    } else {
      onReorder(sourceUid, targetUid, dropTarget.position);
    }

    clearDragState();
  };

  const handleDragEnd = () => {
    clearDragState();
  };

  const clearDragState = () => {
    setDragSourceSegIdx(null);
    setDropTarget(null);
    dragCounterRef.current = 0;
  };

  // --- Touch drag-and-drop handlers (mobile support) ---

  const clearTouchDrag = useCallback(() => {
    if (touchStartTimer.current) {
      clearTimeout(touchStartTimer.current);
      touchStartTimer.current = null;
    }
    touchDragActive.current = false;
    touchSourceSegIdx.current = null;
    touchStartPos.current = null;
    setDragSourceSegIdx(null);
    setDropTarget(null);
  }, []);

  const getSegIdxFromPoint = useCallback((x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const segEl = (el as HTMLElement).closest?.("[data-seg-idx]") as HTMLElement | null;
    if (!segEl) return null;
    const idx = parseInt(segEl.dataset.segIdx!, 10);
    return isNaN(idx) ? null : idx;
  }, []);

  const computeDropPosition = useCallback((clientY: number, segIdx: number): "before" | "after" | "merge" => {
    const el = document.querySelector(`[data-seg-idx="${segIdx}"]`);
    if (!el) return "merge";
    const rect = el.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "merge";
  }, []);

  const handleTouchStart = useCallback((segIdx: number) => (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchSourceSegIdx.current = segIdx;

    // Long-press delay to distinguish from scrolling (200ms)
    touchStartTimer.current = setTimeout(() => {
      touchDragActive.current = true;
      setDragSourceSegIdx(segIdx);
    }, 200);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];

    // If drag hasn't activated yet, check if finger moved too far (cancel → allow scroll)
    if (!touchDragActive.current) {
      if (touchStartPos.current) {
        const dx = touch.clientX - touchStartPos.current.x;
        const dy = touch.clientY - touchStartPos.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          // Moved before long-press fired → cancel, let browser scroll
          if (touchStartTimer.current) {
            clearTimeout(touchStartTimer.current);
            touchStartTimer.current = null;
          }
          touchSourceSegIdx.current = null;
          touchStartPos.current = null;
        }
      }
      return;
    }

    // Active drag – prevent scrolling
    e.preventDefault();

    const targetSegIdx = getSegIdxFromPoint(touch.clientX, touch.clientY);
    if (targetSegIdx === null || targetSegIdx === touchSourceSegIdx.current) {
      setDropTarget(null);
      return;
    }

    const position = computeDropPosition(touch.clientY, targetSegIdx);
    setDropTarget({ segIdx: targetSegIdx, position });
  }, [getSegIdxFromPoint, computeDropPosition]);

  const handleTouchEnd = (
    segments: Segment[],
    onReorder: (sourceUid: string, targetUid: string, position: "before" | "after") => void,
    onMerge: (sourceUid: string, targetUid: string) => void,
  ) => () => {
    if (touchStartTimer.current) {
      clearTimeout(touchStartTimer.current);
      touchStartTimer.current = null;
    }

    if (!touchDragActive.current || touchSourceSegIdx.current === null) {
      clearTouchDrag();
      return;
    }

    const sourceIdx = touchSourceSegIdx.current;

    // Use setState callback to read the latest dropTarget value
    setDropTarget(currentDropTarget => {
      if (currentDropTarget && segments.length > 0) {
        const sourceSeg = segments[sourceIdx];
        const targetSeg = segments[currentDropTarget.segIdx];
        if (sourceSeg && targetSeg) {
          const sourceUid = sourceSeg.entries[0].entry.uid;
          const targetUid = targetSeg.entries[0].entry.uid;
          if (currentDropTarget.position === "merge") {
            onMerge(sourceUid, targetUid);
          } else {
            onReorder(sourceUid, targetUid, currentDropTarget.position);
          }
        }
      }
      return null;
    });

    touchDragActive.current = false;
    touchSourceSegIdx.current = null;
    touchStartPos.current = null;
    setDragSourceSegIdx(null);
  };

  /** Render queue items, wrapping groups in QueueGroup components, with drag-and-drop. */
  const renderQueueItems = (
    q: QueueEntry[],
    callbacks: {
      onSetRepeat: (uid: string, repeat: number) => void;
      onMove: (uid: string, direction: "up" | "down") => void;
      onRemove: (uid: string) => void;
      onDuplicate: (uid: string) => void;
      onSetGroupRepeat: (groupId: string, repeat: number) => void;
      onMoveGroup: (groupId: string, direction: "up" | "down") => void;
      onDuplicateGroup: (groupId: string) => void;
      onSplitGroup: (groupId: string) => void;
    },
    dragCallbacks: {
      onReorder: (sourceUid: string, targetUid: string, position: "before" | "after") => void;
      onMerge: (sourceUid: string, targetUid: string) => void;
    },
    activeInfo?: { activeArrayIdx: number; activeRepeatWithinEntry: number; activeGroupIter: number; isRepeatingLast: boolean },
    isLive?: boolean,
  ) => {
    const segments = buildSegments(q);
    const elements: React.ReactNode[] = [];
    const dropHandler = handleDrop(segments, dragCallbacks.onReorder, dragCallbacks.onMerge);
    const touchEndHandler = handleTouchEnd(segments, dragCallbacks.onReorder, dragCallbacks.onMerge);

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const seg = segments[segIdx];
      const isFirstSegment = segIdx === 0;
      const isLastSegment = segIdx === segments.length - 1;

      const isDragSource = dragSourceSegIdx === segIdx;
      const isDropTarget = dropTarget?.segIdx === segIdx;
      const dropPosition = isDropTarget ? dropTarget.position : null;

      const segKey = seg.type === "group" ? seg.groupId! : seg.entries[0].entry.uid;

      // Drag wrapper classes
      let dragClass = "queue-drag-segment";
      if (isDragSource) dragClass += " dragging";
      if (isDropTarget && dropPosition === "before") dragClass += " drop-before";
      if (isDropTarget && dropPosition === "after") dragClass += " drop-after";
      if (isDropTarget && dropPosition === "merge") dragClass += " drop-merge";

      let segContent: React.ReactNode;

      if (seg.type === "group") {
        const groupEntries = seg.entries;
        const groupId = seg.groupId!;
        const groupRepeat = seg.groupRepeat ?? 1;

        let groupActiveIter = 0;
        if (activeInfo && isLive) {
          for (const { arrayIndex } of groupEntries) {
            if (arrayIndex === activeInfo.activeArrayIdx) {
              groupActiveIter = activeInfo.activeGroupIter + 1;
              break;
            }
          }
        }

        segContent = (
          <QueueGroup
            groupId={groupId}
            groupRepeat={groupRepeat}
            isFirstSegment={isFirstSegment}
            isLastSegment={isLastSegment}
            activeGroupIter={groupActiveIter}
            totalGroupIters={groupRepeat}
            onSetGroupRepeat={callbacks.onSetGroupRepeat}
            onMoveGroup={callbacks.onMoveGroup}
            onDuplicateGroup={callbacks.onDuplicateGroup}
            onSplitGroup={callbacks.onSplitGroup}
          >
            {groupEntries.map(({ entry, arrayIndex }, memberIdx) => {
              const isActive = isLive && run.status === "running" && arrayIndex === activeInfo?.activeArrayIdx;
              const duration = getEffDuration(entry.actionId);
              const currentRepeat = isActive ? (activeInfo?.activeRepeatWithinEntry ?? 0) + 1 : 0;
              return (
                <QueueItem
                  key={entry.uid}
                  entry={entry}
                  index={arrayIndex}
                  isActive={!!isActive}
                  progress={isActive ? run.currentActionProgress : 0}
                  duration={duration}
                  currentRepeat={currentRepeat}
                  isRepeatingLast={false}
                  isFirst={memberIdx === 0}
                  isLast={memberIdx === groupEntries.length - 1}
                  inGroup={true}
                  onSetRepeat={callbacks.onSetRepeat}
                  onMove={callbacks.onMove}
                  onRemove={callbacks.onRemove}
                  onDuplicate={callbacks.onDuplicate}
                />
              );
            })}
          </QueueGroup>
        );
      } else {
        const { entry, arrayIndex } = seg.entries[0];
        const isActive = !!(isLive && run.status === "running" && arrayIndex === activeInfo?.activeArrayIdx);
        const duration = getEffDuration(entry.actionId);
        const currentRepeat = isActive ? (activeInfo?.activeRepeatWithinEntry ?? 0) + 1 : 0;
        const isRepeatingLast = isActive && !!activeInfo?.isRepeatingLast;

        segContent = (
          <QueueItem
            entry={entry}
            index={arrayIndex}
            isActive={!!isActive}
            progress={isActive ? run.currentActionProgress : 0}
            duration={duration}
            currentRepeat={currentRepeat}
            isRepeatingLast={isRepeatingLast}
            isFirst={isFirstSegment}
            isLast={isLastSegment}
            inGroup={false}
            onSetRepeat={callbacks.onSetRepeat}
            onMove={callbacks.onMove}
            onRemove={callbacks.onRemove}
            onDuplicate={callbacks.onDuplicate}
          />
        );
      }

      elements.push(
        <div
          key={segKey}
          className={dragClass}
          data-seg-idx={segIdx}
          draggable
          onDragStart={handleDragStart(segIdx)}
          onDragOver={handleDragOver(segIdx)}
          onDragEnter={handleDragEnter(segIdx)}
          onDragLeave={handleDragLeave()}
          onDrop={dropHandler()}
          onDragEnd={handleDragEnd}
          onTouchStart={handleTouchStart(segIdx)}
          onTouchMove={handleTouchMove}
          onTouchEnd={touchEndHandler}
        >
          {segContent}
        </div>,
      );
    }

    return elements;
  };

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
                  const activeInfo = resolveActive(queue, run.currentQueueIndex, run.repeatLastAction);
                  return renderQueueItems(
                    queue,
                    {
                      onSetRepeat: liveSetRepeat,
                      onMove: liveMove,
                      onRemove: liveRemove,
                      onDuplicate: liveDuplicate,
                      onSetGroupRepeat: liveSetGroupRepeat,
                      onMoveGroup: liveMoveGroup,
                      onDuplicateGroup: liveDuplicateGroup,
                      onSplitGroup: liveSplit,
                    },
                    {
                      onReorder: (sourceUid, targetUid, position) =>
                        dispatch({ type: "queue_reorder_segment", sourceUid, targetUid, position }),
                      onMerge: (sourceUid, targetUid) =>
                        dispatch({ type: "queue_drag_merge", sourceUid, targetUid }),
                    },
                    activeInfo,
                    true,
                  );
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
            encounteredDisasters={state.encounteredDisasters}
          />

          <div className="queue-actions-bar">
            {queue.length >= 2 && (
              <span className="queue-drag-hint">Hold & drag to reorder · drop on item to group</span>
            )}
            <button
              className="queue-clear-btn"
              onClick={() => dispatch({ type: "queue_clear" })}
              disabled={queue.length === 0}
            >
              Clear Queue
            </button>
          </div>

          <SavedQueuesSection
            currentQueue={queue}
            repeatLastAction={run.repeatLastAction}
            onLoad={(hydrated, rla) => {
              dispatch({ type: "queue_load", queue: hydrated, repeatLastAction: rla });
            }}
          />
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
                {renderQueueItems(
                  draftQueue,
                  {
                    onSetRepeat: draftSetRepeat,
                    onMove: draftMove,
                    onRemove: draftRemove,
                    onDuplicate: draftDuplicate,
                    onSetGroupRepeat: draftSetGroupRepeat,
                    onMoveGroup: draftMoveGroup,
                    onDuplicateGroup: draftDuplicateGroup,
                    onSplitGroup: draftSplit,
                  },
                  {
                    onReorder: draftReorderSegment,
                    onMerge: draftDragMerge,
                  },
                )}
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
            encounteredDisasters={state.encounteredDisasters}
            label="Draft projection"
          />

          <div className="queue-actions-bar">
            {draftQueue.length >= 2 && (
              <span className="queue-drag-hint">Hold & drag to reorder · drop on item to group</span>
            )}
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

          <SavedQueuesSection
            currentQueue={draftQueue}
            repeatLastAction={draftRepeatLast}
            onLoad={(hydrated, rla) => {
              onDraftQueueChange(hydrated);
              onDraftRepeatLastChange(rla);
            }}
          />
        </>
      )}
    </div>
  );
}
