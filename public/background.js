// background.js — service worker (API proxy + offscreen MiniLM bridge)

chrome.runtime.onInstalled.addListener(() => {
  console.log("[syncle] background installed & running");
  void ensureOffscreen()
    .then(() => warmEmbedder())
    .catch((err) => {
      console.warn("[syncle] offscreen warm on install failed", err);
    });
});

chrome.runtime.onStartup?.addListener?.(() => {
  void ensureOffscreen()
    .then(() => warmEmbedder())
    .catch(() => {});
});

/** Notify content scripts when the tab URL changes (SPA pushState / soft nav). */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return;
  try {
    chrome.tabs.sendMessage(
      tabId,
      { type: "SYNCLE_URL_CHANGED", url: changeInfo.url },
      () => {
        void chrome.runtime.lastError;
      },
    );
  } catch {
    /* tab may have no content script */
  }
});

async function hasOffscreen() {
  try {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });
      return contexts.length > 0;
    }
  } catch {
    /* fall through */
  }
  try {
    const all = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    return all.some((c) => c.url?.includes("offscreen.html"));
  } catch {
    return false;
  }
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;

  const attempts = [
    {
      reasons: ["WORKERS"],
      justification:
        "Run local MiniLM embeddings for Syncle semantic memory matching",
    },
    {
      reasons: ["BLOBS"],
      justification:
        "Run local MiniLM embeddings (WASM blob URLs) for Syncle semantic memory",
    },
    {
      reasons: ["DOM_SCRAPING"],
      justification:
        "Host Transformers.js MiniLM pipeline for Syncle semantic memory",
    },
  ];

  let lastErr = null;
  for (const opts of attempts) {
    try {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        ...opts,
      });
      // Give the document a tick to register listeners.
      await new Promise((r) => setTimeout(r, 50));
      return;
    } catch (err) {
      lastErr = err;
      // Already exists
      if (String(err?.message || err).includes("Only a single offscreen")) {
        return;
      }
    }
  }
  throw lastErr || new Error("Failed to create offscreen document");
}

function sendToOffscreen(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(res);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function warmEmbedder() {
  await ensureOffscreen();
  return sendToOffscreen({ type: "OFFSCREEN_EMBED_WARM" });
}

async function embedViaOffscreen(text) {
  await ensureOffscreen();
  // Retry once if the offscreen listener wasn't ready.
  try {
    return await sendToOffscreen({
      type: "OFFSCREEN_EMBED",
      text: String(text || ""),
    });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 150));
    await ensureOffscreen();
    return sendToOffscreen({
      type: "OFFSCREEN_EMBED",
      text: String(text || ""),
    });
  }
}

async function embedBatchViaOffscreen(texts) {
  await ensureOffscreen();
  try {
    return await sendToOffscreen({
      type: "OFFSCREEN_EMBED_BATCH",
      texts,
    });
  } catch (err) {
    await new Promise((r) => setTimeout(r, 150));
    await ensureOffscreen();
    return sendToOffscreen({
      type: "OFFSCREEN_EMBED_BATCH",
      texts,
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Ignore messages that are meant for the offscreen document itself when
  // they bubble through this worker from another context incorrectly.
  if (
    msg?.type === "OFFSCREEN_EMBED" ||
    msg?.type === "OFFSCREEN_EMBED_BATCH" ||
    msg?.type === "OFFSCREEN_EMBED_WARM" ||
    msg?.type === "OFFSCREEN_PING"
  ) {
    return false;
  }

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

  if (msg?.type === "SYNCLE_EMBED") {
    (async () => {
      try {
        const res = await embedViaOffscreen(msg.text || "");
        sendResponse(res);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "SYNCLE_EMBED_BATCH") {
    (async () => {
      try {
        const texts = Array.isArray(msg.texts) ? msg.texts : [];
        const res = await embedBatchViaOffscreen(texts);
        sendResponse(res);
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "SYNCLE_EMBED_WARM") {
    warmEmbedder()
      .then((res) => sendResponse(res || { ok: true }))
      .catch((e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    return true;
  }

  if (msg?.type === "PING") {
    sendResponse({ ok: true, from: "background", ts: Date.now() });
  }

  return false;
});
