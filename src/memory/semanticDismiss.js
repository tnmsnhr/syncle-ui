/**
 * Semantic “don’t remind on this site today” suppress store.
 */

import { SEMANTIC_DISMISS_KEY } from "./embedConfig.js";

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function readMap() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([SEMANTIC_DISMISS_KEY], (items) => {
        const raw = items?.[SEMANTIC_DISMISS_KEY];
        resolve(raw && typeof raw === "object" ? raw : {});
      });
    } catch {
      resolve({});
    }
  });
}

function writeMap(map) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [SEMANTIC_DISMISS_KEY]: map }, () => resolve());
    } catch {
      resolve();
    }
  });
}

export async function isSemanticDismissedToday(origin) {
  if (!origin) return false;
  const map = await readMap();
  return map[origin] === todayKey();
}

export async function dismissSemanticForOriginToday(origin) {
  if (!origin) return;
  const map = await readMap();
  map[origin] = todayKey();
  // Prune stale days
  const today = todayKey();
  for (const [k, v] of Object.entries(map)) {
    if (v !== today) delete map[k];
  }
  await writeMap(map);
}

const REJECT_KEY = "syncle_semantic_reject_v1";

function readRejects() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([REJECT_KEY], (items) => {
        const raw = items?.[REJECT_KEY];
        resolve(raw && typeof raw === "object" ? raw : {});
      });
    } catch {
      resolve({});
    }
  });
}

/** Memory ids the user marked "not related" on this site. */
export async function rejectedMemoryIds(origin) {
  if (!origin) return new Set();
  const map = await readRejects();
  const ids = map[origin];
  return new Set(Array.isArray(ids) ? ids : []);
}

export async function rejectSemanticMemory(origin, memoryId) {
  if (!origin || !memoryId) return;
  const map = await readRejects();
  const ids = new Set(Array.isArray(map[origin]) ? map[origin] : []);
  ids.add(memoryId);
  map[origin] = [...ids].slice(-200);
  await new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [REJECT_KEY]: map }, () => resolve());
    } catch {
      resolve();
    }
  });
}
