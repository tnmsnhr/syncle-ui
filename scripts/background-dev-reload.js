// DEV ONLY — appended by scripts/dev-extension.mjs. Not included in production builds.
(() => {
  const WAIT_URL = "http://127.0.0.1:5179/wait";

  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "update") return;
    chrome.tabs.query({ active: true }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id != null && /^https?:/.test(tab.url || "")) {
          chrome.tabs.reload(tab.id);
        }
      }
    });
  });

  async function poll() {
    try {
      const res = await fetch(WAIT_URL, { cache: "no-store" });
      const text = await res.text();
      if (text === "reload") {
        chrome.runtime.reload();
        return;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
    poll();
  }

  poll();
})();
