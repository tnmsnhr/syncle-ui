/**
 * Just enough of chrome.* for overlay components to mount in Vite.
 * The extension build never imports this file.
 */
const memory = {};

function storageGet(keys, cb) {
  const result = {};
  if (keys && typeof keys === "object" && !Array.isArray(keys)) {
    for (const [key, fallback] of Object.entries(keys)) {
      result[key] = Object.prototype.hasOwnProperty.call(memory, key)
        ? memory[key]
        : fallback;
    }
  } else if (Array.isArray(keys)) {
    for (const key of keys) result[key] = memory[key];
  }
  queueMicrotask(() => cb?.(result));
}

function storageSet(items, cb) {
  Object.assign(memory, items);
  queueMicrotask(() => cb?.());
}

if (!globalThis.chrome?.storage?.local) {
  globalThis.chrome = {
    ...(globalThis.chrome || {}),
    runtime: {
      lastError: null,
      getURL: (path) => path,
      ...(globalThis.chrome?.runtime || {}),
    },
    storage: {
      local: { get: storageGet, set: storageSet },
      sync: { get: storageGet, set: storageSet },
    },
  };
}
