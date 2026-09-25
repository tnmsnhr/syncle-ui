/**
 * Embed queue: attach vectors on memory upsert + backfill missing.
 */

import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { buildMemoryEmbedText, embedTexts } from "./embedClient.js";
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

function clipPiece(raw, n) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n);
}

/** Quote, note, and heading stay separate so a short quote is not diluted. */
export function memoryPieceSources(memory) {
  const items = [];
  const quote = clipPiece(memory?.quote, 500);
  const note = clipPiece(memory?.note, 500);
  const heading = clipPiece(memory?.heading, 160);
  if (quote) items.push({ role: "quote", text: quote });
  if (note && note !== quote) items.push({ role: "note", text: note });
  if (heading) items.push({ role: "heading", text: heading });
  if (!items.length) {
    const title = clipPiece(memory?.title, 200);
    if (title) items.push({ role: "title", text: title });
  }
  return items;
}

function piecesReady(memory) {
  return (
    Array.isArray(memory?.pieces) &&
    memory.pieces.length > 0 &&
    memory.pieces.every(
      (p) => Array.isArray(p?.embedding) && p.embedding.length >= 32,
    ) &&
    memory.embedModel === EMBED_MODEL
  );
}

export async function embedAndPersistMemory(memory) {
  if (!memory?.id) return null;
  const sources = memoryPieceSources(memory);
  if (!sources.length) {
    return memoryRepo.upsert({
      ...memory,
      embedding: null,
      pieces: [],
      embedModel: EMBED_MODEL,
      embedDim: 0,
      embedText: "",
    });
  }
  const embedded = await embedTexts(sources.map((s) => s.text));
  const pieces = sources.map((src, i) => ({
    role: src.role,
    text: src.text,
    embedding: embedded[i]?.embedding || [],
  }));
  const primary = pieces.find((p) => p.role === "quote") || pieces[0];
  const model = embedded[0]?.embedModel || EMBED_MODEL;
  return memoryRepo.upsert({
    ...memory,
    pieces,
    embedding: primary?.embedding || null,
    embedModel: model,
    embedDim: embedded[0]?.embedDim || primary?.embedding?.length || 0,
    embedText: (primary?.text || buildMemoryEmbedText(memory)).slice(0, 240),
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
    if (piecesReady(mem)) {
      const next = memoryPieceSources(mem)
        .map((s) => `${s.role}:${s.text}`)
        .join("\n");
      const prev = mem.pieces.map((p) => `${p.role}:${p.text}`).join("\n");
      if (next === prev) return;
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
    const missing = all.filter((m) => !piecesReady(m));
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
