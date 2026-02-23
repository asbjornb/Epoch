import type { ActionId, SavedQueueEntry } from "../types/game.ts";
import { getActionDef } from "../types/actions.ts";

const SKILL_COLORS: Record<string, string> = {
  farming: "#6a8f5c",
  building: "#9a8a72",
  research: "#6a8faa",
  military: "#b07070",
};

interface SharedQueueModalProps {
  queue: SavedQueueEntry[];
  repeatLastAction: boolean;
  unlockedActions: ActionId[];
  onLoad: () => void;
  onDismiss: () => void;
}

export function SharedQueueModal({
  queue,
  repeatLastAction,
  unlockedActions,
  onLoad,
  onDismiss,
}: SharedQueueModalProps) {
  // Build display items, grouping contiguous group members
  const items: {
    name: string;
    color: string;
    repeat: number;
    locked: boolean;
    grouped: boolean;
    isGroupStart?: boolean;
    isGroupEnd?: boolean;
    groupRepeat?: number;
  }[] = [];

  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];
    if (entry.groupId) {
      const gid = entry.groupId;
      const groupStart = i;
      while (i < queue.length && queue[i].groupId === gid) {
        const e = queue[i];
        const locked = !unlockedActions.includes(e.actionId);
        const def = locked ? undefined : getActionDef(e.actionId);
        items.push({
          name: locked ? "Unknown Action" : (def?.name ?? e.actionId),
          color: locked ? "#666" : SKILL_COLORS[def?.skill ?? "farming"],
          repeat: e.repeat,
          locked,
          grouped: true,
          isGroupStart: i === groupStart,
          isGroupEnd: i + 1 >= queue.length || queue[i + 1].groupId !== gid,
          groupRepeat: e.groupRepeat ?? 1,
        });
        i++;
      }
    } else {
      const locked = !unlockedActions.includes(entry.actionId);
      const def = locked ? undefined : getActionDef(entry.actionId);
      items.push({
        name: locked ? "Unknown Action" : (def?.name ?? entry.actionId),
        color: locked ? "#666" : SKILL_COLORS[def?.skill ?? "farming"],
        repeat: entry.repeat,
        locked,
        grouped: false,
      });
      i++;
    }
  }

  const lockedCount = items.filter((it) => it.locked).length;

  return (
    <div className="event-modal-overlay" onClick={onDismiss}>
      <div
        className="event-modal event-modal-warning"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <h3 className="event-modal-title">Shared Queue</h3>
        <p className="event-modal-message">
          Someone shared a queue with you. Load it into your draft to try it out.
        </p>
        <div className="shared-queue-preview">
          {items.map((item, k) => (
            <div
              key={k}
              className={`saved-queue-preview-action${item.grouped ? " grouped" : ""}${item.isGroupStart ? " group-start" : ""}${item.isGroupEnd ? " group-end" : ""}${item.locked ? " locked" : ""}`}
            >
              <span
                className="queue-item-dot"
                style={{ background: item.color }}
              />
              <span className="saved-queue-preview-action-name">
                {item.name}
              </span>
              {item.repeat > 1 && (
                <span className="saved-queue-preview-action-repeat">
                  &times;{item.repeat}
                </span>
              )}
              {item.isGroupEnd && item.groupRepeat && item.groupRepeat > 1 && (
                <span className="saved-queue-preview-group-repeat">
                  group &times;{item.groupRepeat}
                </span>
              )}
            </div>
          ))}
          {repeatLastAction && (
            <div className="shared-queue-repeat-last">Repeat last action</div>
          )}
        </div>
        {lockedCount > 0 && (
          <p className="shared-queue-locked-note">
            {lockedCount} action{lockedCount !== 1 ? "s" : ""} you haven't
            unlocked yet {lockedCount !== 1 ? "are" : "is"} shown as "Unknown
            Action".
          </p>
        )}
        <div className="event-modal-actions">
          <button className="event-modal-btn" onClick={onLoad}>
            Load to Draft
          </button>
          <button className="event-modal-btn-secondary" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
