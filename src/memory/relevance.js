/**
 * Page-section scoring for the highly-related nudge.
 * Each saved piece is compared with each page section; the best pair wins.
 * A hit also needs a distinctive shared term, and a close race stays quiet.
 */

import {
  HASH_SEMANTIC_THRESHOLD,
  MAX_SEMANTIC_HITS,
  PAGE_CONTEXT_CACHE_KEY,
  PAGE_CONTEXT_TTL_MS,
  SEMANTIC_GAP,
  SEMANTIC_STRONG,
  SEMANTIC_THRESHOLD,
} from "./embedConfig.js";
import {
  cosineSimilarity,
  embedTexts,
  isNeuralEmbedModel,
  relatednessScore,
  warmMiniLM,
  MINILM_MODEL,
} from "./embedClient.js";
import { extractPageChunks } from "./pageContext.js";
import {
  isSemanticDismissedToday,
  rejectedMemoryIds,
} from "./semanticDismiss.js";
import { memoryPieceSources } from "./embedQueue.js";
import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { pageKeyFromUrl } from "../utils/pageIdentity.js";

const STOP = new Set(
  `a an the and or but if in on at to for of as is was are were be been being
  this that these those it its with from by into over after before about
  between through during without within along than then so such only just
  also very can could should would will may might must do does did done
  have has had having not no nor too more most some any all each few other
  your you we they he she them their our my me i am etc via using use used
  how what when where which who why guide complete article post blog page
  click here read more react native app apps application code make build
  learn using with from your this that into`
    .split(/\s+/)
    .filter(Boolean),
);

function stem(tok) {
  if (tok.length < 5) return tok;
  return tok.replace(/(ing|ed|ly|tions|tion|ments|ment|ness|ers|er|es|s)$/i, "");
}

function termsOf(text) {
  const toks = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((t) => stem(t))
    .filter((t) => t.length >= 4 && !STOP.has(t));
  const set = new Set(toks);
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].length >= 4 && toks[i + 1].length >= 4) {
      set.add(`${toks[i]}_${toks[i + 1]}`);
    }
  }
  return set;
}

/** True when both sides share a specific word or two-word phrase. */
export function sharesDistinctiveTerm(aText, bText) {
  const a = termsOf(aText);
  const b = termsOf(bText);
  if (!a.size || !b.size) return false;
  for (const term of a) {
    if (!b.has(term)) continue;
    if (term.includes("_")) return true;
    if (term.length >= 5) return true;
  }
  return false;
}

const memoryCache = new Map();

function storageGet(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([key], (items) => resolve(items?.[key] || null));
    } catch {
      resolve(null);
    }
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch {
      resolve();
    }
  });
}

export async function getPageContextEmbedding(
  href = location.href,
  { force = false } = {},
) {
  await warmMiniLM();

  const pageKey = pageKeyFromUrl(href);
  const now = Date.now();
  const mem = memoryCache.get(pageKey);
  if (
    !force &&
    mem &&
    Array.isArray(mem.chunks) &&
    mem.chunks.length &&
    now - mem.at < PAGE_CONTEXT_TTL_MS &&
    isNeuralEmbedModel(mem.embedModel)
  ) {
    return mem;
  }

  const stored = await storageGet(PAGE_CONTEXT_CACHE_KEY);
  if (
    !force &&
    stored?.pageKey === pageKey &&
    Array.isArray(stored?.chunks) &&
    stored.chunks.length &&
    isNeuralEmbedModel(stored?.embedModel) &&
    now - (stored.at || 0) < PAGE_CONTEXT_TTL_MS
  ) {
    memoryCache.set(pageKey, stored);
    return stored;
  }

  const ctx = extractPageChunks();
  const embedded = await embedTexts(ctx.chunks.map((c) => c.text));
  const chunks = ctx.chunks.map((chunk, i) => ({
    role: chunk.role,
    text: chunk.text,
    embedding: embedded[i]?.embedding || [],
  }));
  const entry = {
    pageKey,
    at: now,
    title: ctx.title,
    text: ctx.text.slice(0, 240),
    chunks,
    embedding: chunks[0]?.embedding || [],
    embedModel: embedded[0]?.embedModel || MINILM_MODEL,
    embedDim: embedded[0]?.embedDim || chunks[0]?.embedding?.length || 0,
  };
  memoryCache.set(pageKey, entry);
  await storageSet(PAGE_CONTEXT_CACHE_KEY, entry);
  return entry;
}

async function ensurePieces(memory, wantModel) {
  const ready =
    Array.isArray(memory.pieces) &&
    memory.pieces.length > 0 &&
    memory.pieces.every((p) => Array.isArray(p.embedding) && p.embedding.length >= 32) &&
    memory.embedModel === wantModel;
  if (ready) return memory.pieces;

  const sources = memoryPieceSources(memory);
  if (!sources.length) return [];
  const embedded = await embedTexts(sources.map((s) => s.text));
  if (embedded[0]?.embedModel !== wantModel) return [];
  const pieces = sources.map((src, i) => ({
    role: src.role,
    text: src.text,
    embedding: embedded[i]?.embedding || [],
  }));
  const primary = pieces.find((p) => p.role === "quote") || pieces[0];
  void LocalMemoryRepository.upsert({
    ...memory,
    pieces,
    embedding: primary?.embedding || memory.embedding,
    embedModel: embedded[0]?.embedModel || wantModel,
    embedDim: embedded[0]?.embedDim || primary?.embedding?.length || 0,
    embedText: (primary?.text || "").slice(0, 240),
  }).catch(() => {});
  return pieces;
}

function bestPair(pieces, chunks) {
  let best = null;
  for (const piece of pieces) {
    if (!piece?.embedding?.length) continue;
    for (const chunk of chunks) {
      if (!chunk?.embedding?.length) continue;
      const score = cosineSimilarity(piece.embedding, chunk.embedding);
      if (!best || score > best.score) {
        best = {
          score,
          pieceRole: piece.role,
          pieceText: piece.text,
          chunkText: chunk.text,
        };
      }
    }
  }
  return best;
}

function applyLeadGap(hits) {
  if (hits.length < 2) return hits.slice(0, MAX_SEMANTIC_HITS);
  const lead = hits[0].score - hits[1].score;
  if (hits[0].score >= SEMANTIC_STRONG || lead >= SEMANTIC_GAP) {
    return hits.slice(0, MAX_SEMANTIC_HITS);
  }
  return [];
}

export async function findSemanticHits({
  memories,
  excludeIds,
  origin,
  href = location.href,
  allowCrossOrigin = true,
  limit = MAX_SEMANTIC_HITS,
} = {}) {
  if (await isSemanticDismissedToday(origin)) {
    console.info("[syncle] semantic dismissed for origin today", origin);
    return [];
  }

  const rejected = await rejectedMemoryIds(origin);
  const pageCtx = await getPageContextEmbedding(href);
  const chunks = Array.isArray(pageCtx?.chunks) ? pageCtx.chunks : [];
  if (!chunks.length || !isNeuralEmbedModel(pageCtx?.embedModel)) {
    return hashFallbackHits({
      memories,
      excludeIds,
      origin,
      allowCrossOrigin,
      rejected,
      pageCtx,
      limit,
    });
  }

  const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
  const scored = [];

  for (const raw of memories || []) {
    if (!raw?.id || exclude.has(raw.id) || rejected.has(raw.id)) continue;
    if (!allowCrossOrigin && origin && raw.origin && raw.origin !== origin) continue;

    const pieces = await ensurePieces(raw, pageCtx.embedModel);
    const pair = bestPair(pieces, chunks);
    if (!pair || pair.score < SEMANTIC_THRESHOLD) continue;

    const memoryText = pieces.map((p) => p.text).join(" ");
    if (!sharesDistinctiveTerm(memoryText, pair.chunkText)) continue;
    if (pair.pieceRole === "heading" && pair.score < SEMANTIC_STRONG) continue;

    scored.push({
      id: raw.id,
      score: pair.score,
      title: raw.title || "",
      quote: raw.quote || raw.note || pair.pieceText || "",
      kind: raw.kind,
      sourceUrl: raw.url || "",
      origin: raw.origin || "",
      pageKey: raw.pageKey || "",
      createdAt: raw.createdAt || "",
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const hits = applyLeadGap(scored).slice(0, limit);
  console.info("[syncle] semantic score", {
    model: pageCtx.embedModel,
    chunks: chunks.length,
    gate: SEMANTIC_THRESHOLD,
    hits: hits.map((h) => ({
      id: h.id,
      score: Number(h.score.toFixed(3)),
      quote: String(h.quote || "").slice(0, 48),
    })),
  });
  return hits;
}

async function hashFallbackHits({
  memories,
  excludeIds,
  origin,
  allowCrossOrigin,
  rejected,
  pageCtx,
  limit,
}) {
  if (!pageCtx?.embedding?.length) return [];
  const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
  const scored = [];
  for (const raw of memories || []) {
    if (!raw?.id || exclude.has(raw.id) || rejected.has(raw.id)) continue;
    if (!allowCrossOrigin && origin && raw.origin && raw.origin !== origin) continue;
    if (!Array.isArray(raw.embedding) || raw.embedModel !== pageCtx.embedModel) continue;
    const score = relatednessScore(
      pageCtx.embedding,
      pageCtx.text || "",
      raw.embedding,
      raw.embedText || raw.quote || "",
    );
    if (score < HASH_SEMANTIC_THRESHOLD) continue;
    scored.push({
      id: raw.id,
      score,
      title: raw.title || "",
      quote: raw.quote || raw.note || "",
      kind: raw.kind,
      sourceUrl: raw.url || "",
      origin: raw.origin || "",
      pageKey: raw.pageKey || "",
      createdAt: raw.createdAt || "",
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
