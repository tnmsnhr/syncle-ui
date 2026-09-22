const MEMORIES_KEY = "syncle_memories_v1";

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (items) => resolve(items || {}));
    } catch {
      resolve({});
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function readAll() {
  const items = await storageGet([MEMORIES_KEY]);
  const list = items[MEMORIES_KEY];
  return Array.isArray(list) ? list : [];
}

async function writeAll(list) {
  await storageSet({ [MEMORIES_KEY]: list });
}

/** Local-as-server MemoryRepository (chrome.storage.local, extension-wide). */
export const LocalMemoryRepository = {
  async list() {
    const list = await readAll();
    return [...list].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
  },

  async get(id) {
    const list = await readAll();
    return list.find((m) => m.id === id) || null;
  },

  async upsert(memory) {
    if (!memory?.id) throw new Error("memory.id required");
    const list = await readAll();
    const now = new Date().toISOString();
    const idx = list.findIndex((m) => m.id === memory.id);
    const next = {
      ...memory,
      updatedAt: now,
      createdAt: memory.createdAt || (idx >= 0 ? list[idx].createdAt : now),
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    await writeAll(list);
    return next;
  },

  async remove(id) {
    const list = await readAll();
    const next = list.filter((m) => m.id !== id);
    await writeAll(next);
    return list.length !== next.length;
  },

  async removeMany(ids) {
    const set = new Set(ids);
    const list = await readAll();
    await writeAll(list.filter((m) => !set.has(m.id)));
  },

  async listByPageKey(pageKey) {
    const list = await readAll();
    return list
      .filter((m) => m.pageKey === pageKey)
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      );
  },

  /** Related in family, excluding the current exact page. */
  async listByFamilyKey(familyKey, { excludePageKey, limit = 20 } = {}) {
    const list = await readAll();
    return list
      .filter(
        (m) =>
          m.familyKey === familyKey &&
          (!excludePageKey || m.pageKey !== excludePageKey),
      )
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      )
      .slice(0, limit);
  },

  async clearAll() {
    await writeAll([]);
  },
};

export default LocalMemoryRepository;
