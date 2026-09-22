/**
 * MiniLM sentence embeddings via Transformers.js (WASM) in the offscreen doc.
 */

import { env, pipeline } from "@xenova/transformers";

export const MINILM_MODEL = "Xenova/all-MiniLM-L6-v2";
export const MINILM_DIM = 384;

let extractorPromise = null;
let ready = false;
let lastError = "";

function configureEnv() {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  // Bundle WASM next to offscreen.js in dist/
  try {
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("/");
    env.backends.onnx.wasm.numThreads = 1;
  } catch {
    /* ignore */
  }
}

export function getEmbedStatus() {
  return {
    ready,
    model: MINILM_MODEL,
    dim: MINILM_DIM,
    error: lastError || null,
  };
}

export async function ensureExtractor(progress_callback) {
  if (extractorPromise) return extractorPromise;
  configureEnv();
  extractorPromise = (async () => {
    try {
      const extractor = await pipeline("feature-extraction", MINILM_MODEL, {
        quantized: true,
        progress_callback,
      });
      ready = true;
      lastError = "";
      return extractor;
    } catch (err) {
      extractorPromise = null;
      ready = false;
      lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  })();
  return extractorPromise;
}

/**
 * @param {string} text
 * @returns {Promise<number[]>} L2-normalized 384-d vector
 */
export async function embedWithMiniLM(text) {
  const extractor = await ensureExtractor();
  const input = String(text || "").trim();
  if (!input) {
    return new Array(MINILM_DIM).fill(0);
  }
  const output = await extractor(input.slice(0, 3500), {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}
