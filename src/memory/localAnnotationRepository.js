const ANNOTATIONS_KEY = "syncle_annotations_v1";

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
  const items = await storageGet([ANNOTATIONS_KEY]);
  const list = items[ANNOTATIONS_KEY];
  return Array.isArray(list) ? list : [];
}

async function writeAll(list) {
  await storageSet({ [ANNOTATIONS_KEY]: list });
}

/** Local annotation geometry store (extension-wide). */
export const LocalAnnotationRepository = {
  async list() {
    return readAll();
  },

  async get(id) {
    const list = await readAll();
    return list.find((a) => a.id === id) || null;
  },

  async upsert(record) {
    if (!record?.id) throw new Error("annotation.id required");
    const list = await readAll();
    const now = new Date().toISOString();
    const idx = list.findIndex((a) => a.id === record.id);
    const next = {
      ...record,
      updatedAt: now,
      createdAt: record.createdAt || (idx >= 0 ? list[idx].createdAt : now),
    };
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    await writeAll(list);
    return next;
  },

  async remove(id) {
    const list = await readAll();
    await writeAll(list.filter((a) => a.id !== id));
  },

  async removeMany(ids) {
    const set = new Set(ids);
    const list = await readAll();
    await writeAll(list.filter((a) => !set.has(a.id)));
  },

  async removeByPageKey(pageKey) {
    const list = await readAll();
    await writeAll(list.filter((a) => a.pageKey !== pageKey));
  },

  async listByPageKey(pageKey) {
    const list = await readAll();
    return list.filter((a) => a.pageKey === pageKey);
  },

  async clearAll() {
    await writeAll([]);
  },
};

export default LocalAnnotationRepository;
