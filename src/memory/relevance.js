/**
 * Page-context embedding cache + semantic hit scoring.
 */

import {
  HASH_SEMANTIC_THRESHOLD,
  MAX_SEMANTIC_HITS,
  PAGE_CONTEXT_CACHE_KEY,
  PAGE_CONTEXT_TTL_MS,
  SEMANTIC_THRESHOLD,
} from "./embedConfig.js";
import {
  embedText,
  buildMemoryEmbedText,
  relatednessScore,
  cosineSimilarity,
  isNeuralEmbedModel,
  warmMiniLM,
  MINILM_MODEL,
} from "./embedClient.js";
import { extractPageContext } from "./pageContext.js";
import { isSemanticDismissedToday } from "./semanticDismiss.js";
import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { pageKeyFromUrl } from "../utils/pageIdentity.js";

function buildFallbackMemText(m) {
  return [m?.note, m?.quote, m?.heading, m?.title].filter(Boolean).join(" ");
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
    now - mem.at < PAGE_CONTEXT_TTL_MS &&
    isNeuralEmbedModel(mem.embedModel)
  ) {
    return mem;
  }

  const stored = await storageGet(PAGE_CONTEXT_CACHE_KEY);
  if (
    !force &&
    stored?.pageKey === pageKey &&
    isNeuralEmbedModel(stored?.embedModel) &&
    Array.isArray(stored?.embedding) &&
    now - (stored.at || 0) < PAGE_CONTEXT_TTL_MS
  ) {
    memoryCache.set(pageKey, stored);
    return stored;
  }

  const ctx = extractPageContext();
  const { embedding, embedModel, embedDim, embedText: preview } =
    await embedText(ctx.text);
  const entry = {
    pageKey,
    at: now,
    title: ctx.title,
    text: preview,
    embedding,
    embedModel,
    embedDim,
  };
  memoryCache.set(pageKey, entry);
  await storageSet(PAGE_CONTEXT_CACHE_KEY, entry);
  return entry;
}

async function ensureMemoryVector(m, wantModel) {
  if (
    Array.isArray(m.embedding) &&
    m.embedding.length >= 32 &&
    m.embedModel === wantModel
  ) {
    return m;
  }
  const raw = buildMemoryEmbedText(m) || buildFallbackMemText(m);
  if (!raw) return null;
  try {
    const fresh = await embedText(raw, {
      allowHashFallback: !isNeuralEmbedModel(wantModel),
    });
    const next = {
      ...m,
      embedding: fresh.embedding,
      embedModel: fresh.embedModel,
      embedDim: fresh.embedDim,
      embedText: fresh.embedText,
    };
    void LocalMemoryRepository.upsert(next).catch(() => {});
    return next;
  } catch (err) {
    console.warn("[syncle] live re-embed failed", m.id, err);
    return null;
  }
}

/**
 * Rank memories by similarity vs page context.
 */
export async function findSemanticHits({
  memories,
  excludeIds,
  origin,
  href = location.href,
  threshold,
  allowCrossOrigin = true,
  limit = MAX_SEMANTIC_HITS,
} = {}) {
  if (await isSemanticDismissedToday(origin)) {
    console.info("[syncle] semantic dismissed for origin today", origin);
    return [];
  }

  const pageCtx = await getPageContextEmbedding(href, { force: false });
  if (!Array.isArray(pageCtx?.embedding) || !pageCtx.embedding.length) {
    console.warn("[syncle] no page context embedding");
    return [];
  }

  const neural = isNeuralEmbedModel(pageCtx.embedModel);
  // Always pick gate from the *actual* model used — never force MiniLM
  // threshold onto hash fallback vectors.
  const gate =
    typeof threshold === "number" && neural
      ? threshold
      : neural
        ? SEMANTIC_THRESHOLD
        : HASH_SEMANTIC_THRESHOLD;

  const exclude =
    excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
  const scored = [];
  const wantModel = pageCtx.embedModel || MINILM_MODEL;
  let considered = 0;
  let skippedModel = 0;

  for (const raw of memories || []) {
    if (!raw?.id || exclude.has(raw.id)) continue;
    if (!allowCrossOrigin && origin && raw.origin && raw.origin !== origin) {
      continue;
    }

    const m = await ensureMemoryVector(raw, wantModel);
    if (!m?.embedding?.length) {
      skippedModel += 1;
      continue;
    }
    considered += 1;

    let score;
    if (neural) {
      score = cosineSimilarity(pageCtx.embedding, m.embedding);
    } else {
      score = relatednessScore(
        pageCtx.embedding,
        pageCtx.text || "",
        m.embedding,
        m.embedText || buildFallbackMemText(m),
      );
    }

    if (score < gate) continue;

    scored.push({
      id: m.id,
      score,
      title: m.title || "",
      quote: m.quote || m.note || "",
      kind: m.kind,
      sourceUrl: m.url || "",
      origin: m.origin || "",
      pageKey: m.pageKey || "",
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, limit);
  console.info("[syncle] semantic score", {
    model: pageCtx.embedModel,
    gate,
    considered,
    skippedModel,
    hits: hits.map((h) => ({
      id: h.id,
      score: Number(h.score.toFixed(3)),
      quote: String(h.quote || "").slice(0, 48),
    })),
  });
  return hits;
}
