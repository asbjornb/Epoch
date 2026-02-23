import type { ActionId, SavedQueueEntry } from "../types/game.ts";

/** Compact short codes for each action ID, used in shareable URLs. */
const ACTION_TO_CODE: Record<ActionId, string> = {
  farm: "f",
  gather_wood: "gw",
  build_hut: "bh",
  build_granary: "bg",
  build_barracks: "bb",
  build_smokehouse: "bs",
  build_wall: "bw",
  train_militia: "tm",
  research_tools: "rt",
  research_irrigation: "ri",
  research_storage: "rs",
  research_fortification: "rf",
  research_tactics: "rx",
  scout: "sc",
  loot: "lo",
  cure_food: "cf",
  winter_hunt: "wh",
};

const CODE_TO_ACTION: Record<string, ActionId> = Object.fromEntries(
  Object.entries(ACTION_TO_CODE).map(([k, v]) => [v, k as ActionId]),
) as Record<string, ActionId>;

/**
 * Encode a queue + repeatLastAction into a compact URL-safe string.
 *
 * Format:
 *   item       = code | code.repeat
 *   group      = (item,item,...)groupRepeat
 *   queue      = entry,entry,...[!]
 *   ! suffix   = repeatLastAction is on
 */
export function encodeQueue(
  queue: readonly (SavedQueueEntry | { actionId: ActionId; repeat: number; groupId?: string; groupRepeat?: number })[],
  repeatLastAction: boolean,
): string {
  if (queue.length === 0) return "";

  const parts: string[] = [];
  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];
    if (entry.groupId) {
      const gid = entry.groupId;
      const groupItems: string[] = [];
      const groupRepeat = entry.groupRepeat ?? 1;
      while (i < queue.length && queue[i].groupId === gid) {
        groupItems.push(encodeItem(queue[i]));
        i++;
      }
      let groupStr = `(${groupItems.join(",")})`;
      if (groupRepeat > 1) groupStr += String(groupRepeat);
      parts.push(groupStr);
    } else {
      parts.push(encodeItem(entry));
      i++;
    }
  }

  let result = parts.join(",");
  if (repeatLastAction) result += "!";
  return result;
}

function encodeItem(entry: { actionId: ActionId; repeat: number }): string {
  const code = ACTION_TO_CODE[entry.actionId];
  if (!code) return entry.actionId; // fallback to full ID
  if (entry.repeat === 1) return code;
  return `${code}.${entry.repeat}`;
}

export interface DecodedQueue {
  queue: SavedQueueEntry[];
  repeatLastAction: boolean;
}

/**
 * Decode a compact queue string back into SavedQueueEntry[].
 * Returns null if the string is malformed or empty.
 */
export function decodeQueue(encoded: string): DecodedQueue | null {
  if (!encoded) return null;

  let repeatLastAction = false;
  let str = encoded;
  if (str.endsWith("!")) {
    repeatLastAction = true;
    str = str.slice(0, -1);
  }
  if (!str) return null;

  try {
    const entries = parseEntries(str);
    if (entries.length === 0) return null;
    return { queue: entries, repeatLastAction };
  } catch {
    return null;
  }
}

/** Parse a comma-separated list of entries (items and groups), respecting parentheses. */
function parseEntries(str: string): SavedQueueEntry[] {
  const entries: SavedQueueEntry[] = [];
  let i = 0;

  while (i < str.length) {
    if (str[i] === ",") {
      i++;
      continue;
    }

    if (str[i] === "(") {
      // Parse group: (item,item,...)groupRepeat
      const closeIdx = str.indexOf(")", i);
      if (closeIdx === -1) throw new Error("Unmatched (");
      const inner = str.slice(i + 1, closeIdx);
      i = closeIdx + 1;

      // Parse optional group repeat number after )
      let groupRepeat = 1;
      let numStr = "";
      while (i < str.length && str[i] >= "0" && str[i] <= "9") {
        numStr += str[i];
        i++;
      }
      if (numStr) groupRepeat = parseInt(numStr, 10);

      // Parse inner items
      const items = parseItems(inner);
      if (items.length === 0) throw new Error("Empty group");

      const groupId = `shared_${entries.length}`;
      for (const item of items) {
        entries.push({ ...item, groupId, groupRepeat });
      }
    } else {
      // Parse single item
      let end = i;
      while (end < str.length && str[end] !== "," && str[end] !== "(") end++;
      const token = str.slice(i, end);
      i = end;
      entries.push(parseItem(token));
    }
  }

  return entries;
}

/** Parse comma-separated items (no groups allowed inside). */
function parseItems(str: string): SavedQueueEntry[] {
  return str.split(",").filter(Boolean).map(parseItem);
}

/** Parse a single item token like "f" or "f.3". */
function parseItem(token: string): SavedQueueEntry {
  const dotIdx = token.indexOf(".");
  let code: string;
  let repeat = 1;

  if (dotIdx !== -1) {
    code = token.slice(0, dotIdx);
    repeat = parseInt(token.slice(dotIdx + 1), 10);
    if (isNaN(repeat) || repeat < 1) repeat = 1;
  } else {
    code = token;
  }

  const actionId = CODE_TO_ACTION[code];
  if (!actionId) throw new Error(`Unknown code: ${code}`);

  return { actionId, repeat };
}

/** Build a full shareable URL from a queue. */
export function buildShareUrl(
  queue: readonly (SavedQueueEntry | { actionId: ActionId; repeat: number; groupId?: string; groupRepeat?: number })[],
  repeatLastAction: boolean,
): string {
  const encoded = encodeQueue(queue, repeatLastAction);
  if (!encoded) return "";
  const base = window.location.href.split("#")[0];
  return `${base}#q=${encoded}`;
}

/** Parse the current page URL for a shared queue. Returns null if not present or malformed. */
export function parseShareUrl(): DecodedQueue | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#q=")) return null;
  const encoded = hash.slice(3);
  return decodeQueue(decodeURIComponent(encoded));
}
