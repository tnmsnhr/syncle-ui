/**
 * Content-script embed client.
 * Prefers MiniLM via background → offscreen; falls back to local hash embedder.
 */

import {
  embedTextSync,
  buildMemoryEmbedText,
  relatednessScore,
  cosineSimilarity,
} from "./hashEmbedder.js";
import { MAX_EMBED_CHARS } from "./embedConfig.js";

export { buildMemoryEmbedText, relatednessScore, cosineSimilarity };

export const MINILM_MODEL = "Xenova/all-MiniLM-L6-v2";

function clip(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= MAX_EMBED_CHARS) return t;
  return t.slice(0, MAX_EMBED_CHARS);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sendRuntime(message) {
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

let warmPromise = null;

/** Kick MiniLM download/load; resolves when warm succeeds or fails. */
export function warmMiniLM() {
  if (!warmPromise) {
    warmPromise = (async () => {
      try {
        const res = await sendRuntime({ type: "SYNCLE_EMBED_WARM" });
        if (res?.ok) return true;
        console.warn("[syncle] MiniLM warm not ok", res?.error || res);
        return false;
      } catch (err) {
        console.warn("[syncle] MiniLM warm failed", err);
        return false;
      }
    })();
  }
  return warmPromise;
}

/**
 * Primary embed API used by queue + relevance.
 * Retries MiniLM a few times before hash fallback.
 */
export async function embedText(raw, { allowHashFallback = true } = {}) {
  const text = clip(raw);
  if (!text) {
    return {
      embedding: new Array(384).fill(0),
      embedModel: MINILM_MODEL,
      embedDim: 384,
      embedText: "",
    };
  }

  // Ensure offscreen model is loading before first embed.
  void warmMiniLM();

  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt > 0) await delay(800 * attempt);
      const res = await sendRuntime({ type: "SYNCLE_EMBED", text });
      if (res?.ok && Array.isArray(res.embedding) && res.embedding.length >= 32) {
        return {
          embedding: res.embedding,
          embedModel: res.embedModel || MINILM_MODEL,
          embedDim: res.embedDim || res.embedding.length,
          embedText: text.slice(0, 240),
        };
      }
      lastErr = new Error(res?.error || "MiniLM embed failed");
    } catch (err) {
      lastErr = err;
    }
  }

  console.warn("[syncle] MiniLM unavailable, using hash fallback", lastErr);
  if (!allowHashFallback) throw lastErr || new Error("embed failed");
  return embedTextSync(text);
}

/** Embed several short strings in one offscreen pass. */
export async function embedTexts(raws) {
  const texts = (raws || []).map((t) => clip(t));
  if (!texts.length) return [];
  void warmMiniLM();
  try {
    const res = await sendRuntime({ type: "SYNCLE_EMBED_BATCH", texts });
    if (
      res?.ok &&
      Array.isArray(res.embeddings) &&
      res.embeddings.length === texts.length
    ) {
      return texts.map((text, i) => ({
        embedding: res.embeddings[i],
        embedModel: res.embedModel || MINILM_MODEL,
        embedDim: res.embedDim || res.embeddings[i]?.length || 384,
        embedText: text.slice(0, 240),
      }));
    }
  } catch (err) {
    console.warn("[syncle] batch embed failed", err);
  }
  const out = [];
  for (const text of texts) {
    out.push(await embedText(text));
  }
  return out;
}

export function isNeuralEmbedModel(model) {
  return Boolean(model && String(model).includes("MiniLM"));
}
