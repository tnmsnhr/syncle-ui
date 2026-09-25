/**
 * Offscreen document entry: image crop + MiniLM embeddings.
 */

import { cropPolygonDataUrl, cropRectDataUrl } from "./crop.js";
import {
  embedWithMiniLM,
  ensureExtractor,
  getEmbedStatus,
  MINILM_DIM,
  MINILM_MODEL,
} from "./minilm.js";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "OFFSCREEN_PING") {
    sendResponse({ ok: true, from: "offscreen", ts: Date.now(), embed: getEmbedStatus() });
    return false;
  }

  if (msg?.type === "OFFSCREEN_EMBED_STATUS") {
    sendResponse({ ok: true, ...getEmbedStatus() });
    return false;
  }

  if (msg?.type === "OFFSCREEN_EMBED_WARM") {
    ensureExtractor()
      .then(() => sendResponse({ ok: true, ...getEmbedStatus() }))
      .catch((e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          ...getEmbedStatus(),
        }),
      );
    return true;
  }

  if (msg?.type === "OFFSCREEN_EMBED") {
    (async () => {
      try {
        const text = String(msg.text || msg.payload?.text || "");
        const embedding = await embedWithMiniLM(text);
        sendResponse({
          ok: true,
          embedding,
          embedModel: MINILM_MODEL,
          embedDim: MINILM_DIM,
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "OFFSCREEN_EMBED_BATCH") {
    (async () => {
      try {
        const texts = Array.isArray(msg.texts) ? msg.texts : [];
        const embeddings = [];
        for (const text of texts.slice(0, 24)) {
          embeddings.push(await embedWithMiniLM(String(text || "")));
        }
        sendResponse({
          ok: true,
          embeddings,
          embedModel: MINILM_MODEL,
          embedDim: MINILM_DIM,
        });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return true;
  }

  if (msg?.type === "OFFSCREEN_READ_IMAGE_DIMS") {
    (async () => {
      try {
        const { dataUrl } = msg.payload;
        const blob = await (await fetch(dataUrl)).blob();
        const bmp = await createImageBitmap(blob);
        sendResponse({ width: bmp.width, height: bmp.height });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "OFFSCREEN_CROP_RECT") {
    (async () => {
      try {
        const {
          dataUrl,
          rect,
          devicePixelRatio = 1,
          maxWidth = 1280,
          quality = 0.82,
        } = msg.payload || {};
        const result = await cropRectDataUrl(
          dataUrl,
          rect,
          devicePixelRatio,
          maxWidth,
          quality,
        );
        sendResponse(result);
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "OFFSCREEN_CROP") {
    (async () => {
      try {
        const { dataUrl, polygon, dpr, withPreview } = msg.payload;
        const result = await cropPolygonDataUrl(
          dataUrl,
          polygon,
          dpr || 1,
          withPreview,
        );
        sendResponse(result);
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }

  return false;
});

// Warm the model in the background so the first page visit isn't cold.
void ensureExtractor().catch((err) => {
  console.warn("[syncle offscreen] MiniLM warm failed", err);
});
