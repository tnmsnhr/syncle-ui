// background.js — service worker (API proxy for extension popup auth)

chrome.runtime.onInstalled.addListener(() => {
  console.log("[syncle] background installed & running");
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SYNCLE_FETCH") {
    (async () => {
      const { url, method = "GET", headers = {}, body, timeoutMs = 30000 } =
        msg.payload || {};
      if (!url) {
        sendResponse({ ok: false, networkError: "SYNCLE_FETCH: missing url" });
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: body ?? undefined,
          signal: controller.signal,
        });
        const text = await res.text();
        sendResponse({
          ok: res.ok,
          status: res.status,
          body: text,
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        const networkError =
          err.name === "AbortError"
            ? `Request timed out after ${timeoutMs}ms`
            : err.message;
        console.warn("[syncle] SYNCLE_FETCH failed:", url, networkError);
        sendResponse({ ok: false, status: 0, networkError });
      } finally {
        clearTimeout(timer);
      }
    })();
    return true;
  }

  if (msg?.type === "PING") {
    sendResponse({ ok: true, from: "background", ts: Date.now() });
  }
});
