/**
 * Embed queue: attach vectors on memory upsert + backfill missing.
 */

import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { buildMemoryEmbedText, embedText } from "./embedClient.js";
import { EMBED_MODEL } from "./embedConfig.js";

const memoryRepo = LocalMemoryRepository;

let chain = Promise.resolve();
let backfillStarted = false;

function enqueue(task) {
  chain = chain.then(task).catch((err) => {
    console.warn("[syncle] embed queue task failed", err);
  });
  return chain;
}

export async function embedAndPersistMemory(memory) {
  if (!memory?.id) return null;
  const embedTextRaw = buildMemoryEmbedText(memory);
  if (!embedTextRaw) {
    return memoryRepo.upsert({
      ...memory,
      embedding: null,
      embedModel: EMBED_MODEL,
      embedDim: 0,
      embedText: "",
    });
  }
  const { embedding, embedModel, embedDim, embedText: preview } =
    await embedText(embedTextRaw);
  return memoryRepo.upsert({
    ...memory,
    embedding,
    embedModel,
    embedDim,
    embedText: preview,
  });
}

/** Fire-and-forget after save / message append. */
export function queueEmbedMemory(memoryOrId) {
  enqueue(async () => {
    const mem =
      typeof memoryOrId === "string"
        ? await memoryRepo.get(memoryOrId)
        : memoryOrId;
    if (!mem) return;
    if (
      Array.isArray(mem.embedding) &&
      mem.embedding.length > 0 &&
      mem.embedModel === EMBED_MODEL
    ) {
      // Still refresh when quote/note likely changed.
      const nextText = buildMemoryEmbedText(mem);
      if (mem.embedText && nextText.startsWith(String(mem.embedText).slice(0, 80))) {
        return;
      }
    }
    await embedAndPersistMemory(mem);
  });
}

/** Backfill memories missing MiniLM vectors (idle). */
export function startEmbedBackfill({ limit = 80, onDone } = {}) {
  if (backfillStarted) return;
  backfillStarted = true;
  enqueue(async () => {
    // Wait for MiniLM warm so we don't write hash vectors during backfill.
    try {
      const { warmMiniLM } = await import("./embedClient.js");
      await warmMiniLM();
    } catch {
      /* continue */
    }
    const all = await memoryRepo.list();
    const missing = all.filter(
      (m) =>
        !Array.isArray(m.embedding) ||
        !m.embedding.length ||
        m.embedModel !== EMBED_MODEL,
    );
    console.info("[syncle] embed backfill", { total: all.length, missing: missing.length });
    for (const m of missing.slice(0, limit)) {
      await embedAndPersistMemory(m);
    }
    try {
      onDone?.(missing.length);
    } catch {
      /* ignore */
    }
  });
}
