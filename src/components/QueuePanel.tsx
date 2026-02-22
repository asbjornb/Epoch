import { useMemo, useState, useCallback } from "react";
import type {
  ActionId,
  GameState,
  QueueEntry,
} from "../types/game.ts";
import { ACTION_DEFS, getActionDef } from "../types/actions.ts";
import { isActionUnlocked } from "../engine/skills.ts";
import { simulateQueuePreview, getEffectiveDuration, getTotalDefense, getBuildingCount, getScaledWoodCost } from "../engine/simulation.ts";
import { resolveLogicalIndex, getGroupRange, getQueueLogicalSize } from "../engine/queueGroups.ts";
import type { GameAction } from "../hooks/useGame.ts";
import { makeGroupId, makeUid } from "../hooks/useGame.ts";


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
  selected,
  selectMode,
  onSetRepeat,
  onMove,
  onRemove,
  onDuplicate,
  onToggleSelect,
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
  selected: boolean;
  selectMode: boolean;
  onSetRepeat: (uid: string, repeat: number) => void;
  onMove: (uid: string, direction: "up" | "down") => void;
  onRemove: (uid: string) => void;
  onDuplicate: (uid: string) => void;
  onToggleSelect: (uid: string) => void;
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
    <div className={`queue-item ${isActive ? "active" : ""}${inGroup ? " in-group" : ""}${selected ? " selected" : ""}`}>
      {isActive && (
        <div className="queue-item-progress" style={{ width: `${pct}%` }} />
      )}
      <div className="queue-item-content">
        <div className="queue-item-left">
          {selectMode && !inGroup && (
            <input
              type="checkbox"
              className="queue-item-checkbox"
              checked={selected}
              onChange={() => onToggleSelect(entry.uid)}
            />
          )}
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

/** Check if selected UIDs are contiguous ungrouped items in the queue. */
function canMergeSelection(queue: QueueEntry[], selectedUids: Set<string>): boolean {
  if (selectedUids.size < 2) return false;
  const indices = queue
    .map((e, i) => selectedUids.has(e.uid) ? i : -1)
    .filter((i) => i >= 0);
  if (indices.length < 2) return false;
  // Check contiguity
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  // Check none are already grouped
  return indices.every((i) => !queue[i].groupId);
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

  // Selection state for merge
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const toggleSelect = useCallback((uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedUids(new Set());
    setSelectMode(false);
  }, []);

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
  const liveMerge = () => {
    const uids = Array.from(selectedUids);
    dispatch({ type: "queue_merge", uids });
    clearSelection();
  };
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
  const draftMerge = () => {
    const q = [...draftQueue];
    const indices = q
      .map((e, i) => selectedUids.has(e.uid) ? i : -1)
      .filter((i) => i >= 0);
    if (indices.length < 2) return;
    const groupId = makeGroupId();
    for (const idx of indices) {
      q[idx] = { ...q[idx], groupId, groupRepeat: 1 };
    }
    onDraftQueueChange(q);
    clearSelection();
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

  const currentQueue = draftMode ? draftQueue : queue;
  const mergeEnabled = canMergeSelection(currentQueue, selectedUids);

  /** Render queue items, wrapping groups in QueueGroup components. */
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
    activeInfo?: { activeArrayIdx: number; activeRepeatWithinEntry: number; activeGroupIter: number; isRepeatingLast: boolean },
    isLive?: boolean,
  ) => {
    const segments = buildSegments(q);
    const elements: React.ReactNode[] = [];

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      const seg = segments[segIdx];
      const isFirstSegment = segIdx === 0;
      const isLastSegment = segIdx === segments.length - 1;

      if (seg.type === "group") {
        const groupEntries = seg.entries;
        const groupId = seg.groupId!;
        const groupRepeat = seg.groupRepeat ?? 1;

        // Check if any item in the group is active
        let groupActiveIter = 0;
        if (activeInfo && isLive) {
          for (const { arrayIndex } of groupEntries) {
            if (arrayIndex === activeInfo.activeArrayIdx) {
              groupActiveIter = activeInfo.activeGroupIter + 1; // 1-based
              break;
            }
          }
        }

        elements.push(
          <QueueGroup
            key={groupId}
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
                  selected={false}
                  selectMode={false}
                  onSetRepeat={callbacks.onSetRepeat}
                  onMove={callbacks.onMove}
                  onRemove={callbacks.onRemove}
                  onDuplicate={callbacks.onDuplicate}
                  onToggleSelect={toggleSelect}
                />
              );
            })}
          </QueueGroup>,
        );
      } else {
        const { entry, arrayIndex } = seg.entries[0];
        const isActive = !!(isLive && run.status === "running" && arrayIndex === activeInfo?.activeArrayIdx);
        const duration = getEffDuration(entry.actionId);
        const currentRepeat = isActive ? (activeInfo?.activeRepeatWithinEntry ?? 0) + 1 : 0;
        const isRepeatingLast = isActive && !!activeInfo?.isRepeatingLast;

        elements.push(
          <QueueItem
            key={entry.uid}
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
            selected={selectedUids.has(entry.uid)}
            selectMode={selectMode}
            onSetRepeat={callbacks.onSetRepeat}
            onMove={callbacks.onMove}
            onRemove={callbacks.onRemove}
            onDuplicate={callbacks.onDuplicate}
            onToggleSelect={toggleSelect}
          />,
        );
      }
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
            {selectMode ? (
              <>
                <button
                  className="queue-clear-btn primary"
                  onClick={liveMerge}
                  disabled={!mergeEnabled}
                  title={mergeEnabled ? "Merge selected items into a group" : "Select 2+ contiguous ungrouped items to merge"}
                >
                  Merge
                </button>
                <button
                  className="queue-clear-btn"
                  onClick={clearSelection}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {queue.length >= 2 && (
                  <button
                    className="queue-clear-btn"
                    onClick={() => setSelectMode(true)}
                    title="Select items to merge into a group"
                  >
                    Select to Merge
                  </button>
                )}
                <button
                  className="queue-clear-btn"
                  onClick={() => dispatch({ type: "queue_clear" })}
                  disabled={queue.length === 0}
                >
                  Clear Queue
                </button>
              </>
            )}
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
            {selectMode ? (
              <>
                <button
                  className="queue-clear-btn primary"
                  onClick={draftMerge}
                  disabled={!mergeEnabled}
                  title={mergeEnabled ? "Merge selected items into a group" : "Select 2+ contiguous ungrouped items to merge"}
                >
                  Merge
                </button>
                <button
                  className="queue-clear-btn"
                  onClick={clearSelection}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {draftQueue.length >= 2 && (
                  <button
                    className="queue-clear-btn"
                    onClick={() => setSelectMode(true)}
                    title="Select items to merge into a group"
                  >
                    Select to Merge
                  </button>
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
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
