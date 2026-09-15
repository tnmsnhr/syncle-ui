const SESSION_KEY = "syncle_session";

export function loadSession() {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      reject(new Error("chrome.storage is unavailable in this context"));
      return;
    }
    chrome.storage.local.get(SESSION_KEY, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items[SESSION_KEY] ?? null);
    });
  });
}

export function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, () => resolve());
  });
}

export function clearSession() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(SESSION_KEY, () => resolve());
  });
}
