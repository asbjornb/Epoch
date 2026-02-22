/**
 * Utility functions for queue groups (merged queue items).
 *
 * Groups are contiguous runs of QueueEntry items that share the same `groupId`.
 * A group repeats its entire sequence `groupRepeat` times before moving on.
 *
 * Logical index layout for a queue like:
 *   [Farm(repeat=3), {Group: [Build(repeat=1), Train(repeat=2)], groupRepeat=2}, Scout(repeat=1)]
 *
 * Flattened:
 *   Farm,Farm,Farm, Build,Train,Train, Build,Train,Train, Scout
 *   positions: 0-2, 3, 4-5, 6, 7-8, 9
 *   Total: 10 logical positions
 */

import type { QueueEntry } from "../types/game.ts";

/** Info about a contiguous group in the queue array. */
export interface GroupRange {
  groupId: string;
  startIdx: number; // inclusive array index
  endIdx: number; // exclusive array index
  groupRepeat: number;
  /** Logical positions consumed by one iteration of the group. */
  iterationSize: number;
}

/** Find the array index range for a group given any member index. */
export function getGroupRange(queue: QueueEntry[], memberIdx: number): GroupRange | null {
  const entry = queue[memberIdx];
  if (!entry?.groupId) return null;
  const groupId = entry.groupId;

  let startIdx = memberIdx;
  while (startIdx > 0 && queue[startIdx - 1].groupId === groupId) startIdx--;

  let endIdx = memberIdx + 1;
  while (endIdx < queue.length && queue[endIdx].groupId === groupId) endIdx++;

  let iterationSize = 0;
  for (let i = startIdx; i < endIdx; i++) {
    iterationSize += queue[i].repeat;
  }

  return {
    groupId,
    startIdx,
    endIdx,
    groupRepeat: entry.groupRepeat ?? 1,
    iterationSize,
  };
}

/** Get all group ranges in the queue. */
export function getAllGroupRanges(queue: QueueEntry[]): GroupRange[] {
  const ranges: GroupRange[] = [];
  let i = 0;
  while (i < queue.length) {
    if (queue[i].groupId) {
      const range = getGroupRange(queue, i)!;
      ranges.push(range);
      i = range.endIdx;
    } else {
      i++;
    }
  }
  return ranges;
}

/**
 * Compute the logical size of a queue segment.
 * For ungrouped entries, this is just `repeat`.
 * For groups, this is `iterationSize * groupRepeat`.
 */
export function getSegmentLogicalSize(queue: QueueEntry[], startIdx: number): { size: number; nextIdx: number } {
  const entry = queue[startIdx];
  if (entry.groupId) {
    const range = getGroupRange(queue, startIdx)!;
    return {
      size: range.iterationSize * range.groupRepeat,
      nextIdx: range.endIdx,
    };
  }
  return { size: entry.repeat, nextIdx: startIdx + 1 };
}

/** Get total logical size of the entire queue. */
export function getQueueLogicalSize(queue: QueueEntry[]): number {
  let size = 0;
  let i = 0;
  while (i < queue.length) {
    const seg = getSegmentLogicalSize(queue, i);
    size += seg.size;
    i = seg.nextIdx;
  }
  return size;
}

/** Result of resolving a logical index to a physical queue position. */
export interface ResolvedPosition {
  arrayIndex: number;
  groupIteration: number; // 0-based, 0 for ungrouped
  repeatWithinEntry: number; // 0-based
}

/**
 * Map a logical queue index to a physical (arrayIndex, groupIteration, repeatWithinEntry).
 * Returns null if the logical index is past the end of the queue.
 */
export function resolveLogicalIndex(queue: QueueEntry[], logicalIndex: number): ResolvedPosition | null {
  let pos = 0;
  let i = 0;

  while (i < queue.length) {
    const entry = queue[i];

    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;
      const totalSize = range.iterationSize * range.groupRepeat;

      if (pos + totalSize > logicalIndex) {
        // Target is within this group
        const offsetInGroup = logicalIndex - pos;
        const groupIter = Math.floor(offsetInGroup / range.iterationSize);
        let offsetInIter = offsetInGroup - groupIter * range.iterationSize;

        for (let j = range.startIdx; j < range.endIdx; j++) {
          if (offsetInIter < queue[j].repeat) {
            return { arrayIndex: j, groupIteration: groupIter, repeatWithinEntry: offsetInIter };
          }
          offsetInIter -= queue[j].repeat;
        }
      }

      pos += totalSize;
      i = range.endIdx;
    } else {
      // Ungrouped entry
      if (entry.repeat === -1) {
        // Infinite repeat
        return { arrayIndex: i, groupIteration: 0, repeatWithinEntry: Math.max(0, logicalIndex - pos) };
      }
      if (pos + entry.repeat > logicalIndex) {
        return { arrayIndex: i, groupIteration: 0, repeatWithinEntry: logicalIndex - pos };
      }
      pos += entry.repeat;
      i++;
    }
  }

  return null;
}

/**
 * Compute the logical start position of a queue array index.
 * For group members, returns the start of the specific entry within its current group iteration.
 * This returns the start of the first occurrence of this entry (group iteration 0).
 */
export function getLogicalStartOfEntry(queue: QueueEntry[], arrayIndex: number): number {
  let pos = 0;
  let i = 0;

  while (i < queue.length && i < arrayIndex) {
    const entry = queue[i];

    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;

      if (arrayIndex >= range.startIdx && arrayIndex < range.endIdx) {
        // Target is within this group — add offset within the first iteration
        for (let j = range.startIdx; j < arrayIndex; j++) {
          pos += queue[j].repeat;
        }
        return pos;
      }

      pos += range.iterationSize * range.groupRepeat;
      i = range.endIdx;
    } else {
      if (entry.repeat === -1) return pos;
      pos += entry.repeat;
      i++;
    }
  }

  return pos;
}

/**
 * Compute the logical start of a "segment" — either a standalone entry or the start of its group.
 */
export function getLogicalStartOfSegment(queue: QueueEntry[], arrayIndex: number): number {
  let pos = 0;
  let i = 0;

  while (i < queue.length) {
    const entry = queue[i];

    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;
      if (arrayIndex >= range.startIdx && arrayIndex < range.endIdx) {
        return pos;
      }
      pos += range.iterationSize * range.groupRepeat;
      i = range.endIdx;
    } else {
      if (i === arrayIndex) return pos;
      if (entry.repeat === -1) return pos;
      pos += entry.repeat;
      i++;
    }
  }

  return pos;
}

/**
 * Given a logical index, find which "segment" (standalone entry or group) it belongs to,
 * and return the segment's logical start, size, and array range.
 */
export function findSegmentAtLogicalIndex(
  queue: QueueEntry[],
  logicalIndex: number,
): { segStart: number; segSize: number; arrayStart: number; arrayEnd: number } | null {
  let pos = 0;
  let i = 0;

  while (i < queue.length) {
    const entry = queue[i];

    if (entry.groupId) {
      const range = getGroupRange(queue, i)!;
      const totalSize = range.iterationSize * range.groupRepeat;
      if (pos + totalSize > logicalIndex) {
        return { segStart: pos, segSize: totalSize, arrayStart: range.startIdx, arrayEnd: range.endIdx };
      }
      pos += totalSize;
      i = range.endIdx;
    } else {
      const size = entry.repeat === -1 ? Infinity : entry.repeat;
      if (pos + size > logicalIndex) {
        return { segStart: pos, segSize: entry.repeat, arrayStart: i, arrayEnd: i + 1 };
      }
      pos += entry.repeat;
      i++;
    }
  }

  return null;
}
