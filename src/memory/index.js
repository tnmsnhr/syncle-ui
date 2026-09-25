import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { LocalAnnotationRepository } from "./localAnnotationRepository.js";
import { normalizeMemory, memoryMessage } from "../utils/normalizeMemory.js";
import {
  currentPageIdentity,
  pageKeyFromUrl,
  familyKeyFromUrl,
  isRelatedFamilyKey,
} from "../utils/pageIdentity.js";
import { onPageKeyChange } from "../utils/spaNavigation.js";
import { buildTextAnchor } from "../utils/textAnchors.js";
import { buildLassoAnchor } from "../utils/lassoAnchors.js";
import { nearestHeading } from "./pageContext.js";
import { queueEmbedMemory, startEmbedBackfill } from "./embedQueue.js";
import { findSemanticHits, getPageContextEmbedding } from "./relevance.js";
import {
  dismissSemanticForOriginToday,
  rejectSemanticMemory,
} from "./semanticDismiss.js";
import { warmMiniLM } from "./embedClient.js";
import { loadSettings } from "../utils/settings.js";
import uid from "../utils/uid.js";

export const memoryRepo = LocalMemoryRepository;
export const annotationRepo = LocalAnnotationRepository;

export async function saveCapture({
  id,
  kind,
  mode,
  quote = "",
  note = "",
  pagePts = null,
  lassoAnchor = null,
  textAnchor = null,
  bboxPage = null,
  centroidPage = null,
  popup = null,
  themeId = null,
  messages = [],
  /** Capture-time href so SPA URL drift mid-gesture can't mis-key the memory. */
  href = location.href,
}) {
  const identity = currentPageIdentity(href);
  const annotationId = id || uid();
  const now = new Date().toISOString();
  const heading = nearestHeading();

  const annotation = {
    id: annotationId,
    pageKey: identity.pageKey,
    url: identity.url,
    createdAt: now,
    updatedAt: now,
    kind: kind === "lasso" ? "lasso" : "text",
    mode: mode || (kind === "lasso" ? "ask" : "comment"),
    themeId,
    pagePts: pagePts || undefined,
    lassoAnchor: lassoAnchor || undefined,
    textAnchor: textAnchor || undefined,
    bboxPage: bboxPage || undefined,
    centroidPage: centroidPage || undefined,
    quote: quote || undefined,
    popup: popup || undefined,
    messages,
  };

  const memory = normalizeMemory({
    id: annotationId,
    annotationId,
    kind: kind === "lasso" ? "lasso" : mode === "ask" ? "ask" : "comment",
    title: identity.title,
    heading,
    quote,
    note,
    url: identity.url,
    origin: identity.origin,
    pageKey: identity.pageKey,
    familyKey: identity.familyKey,
    messages,
    createdAt: now,
    updatedAt: now,
  });

  await annotationRepo.upsert(annotation);
  const saved = await memoryRepo.upsert(memory);
  // Embed inline so the next page visit can match immediately.
  try {
    const { embedAndPersistMemory } = await import("./embedQueue.js");
    await embedAndPersistMemory(saved);
  } catch (err) {
    console.warn("[syncle] embed on save failed", err);
    queueEmbedMemory(saved);
  }
  return { annotation, memory: saved };
}

export async function appendMemoryMessage(annotationId, { role, text }) {
  const mem = await memoryRepo.get(annotationId);
  const ann = await annotationRepo.get(annotationId);
  if (!mem && !ann) return null;

  const msg = memoryMessage({ id: uid(), role, text });
  const messages = [...(mem?.messages || ann?.messages || []), msg];

  if (ann) {
    await annotationRepo.upsert({ ...ann, messages });
  }
  let nextMem = mem;
  if (mem) {
    nextMem = await memoryRepo.upsert({
      ...mem,
      messages,
      note: mem.note || (role === "user" ? text : mem.note),
    });
    queueEmbedMemory(nextMem);
  }
  return msg;
}

export async function deleteCapture(id) {
  await annotationRepo.remove(id);
  await memoryRepo.remove(id);
}

/** Wipe every annotation + memory for one pageKey (one write each). */
export async function clearCapturesForPage(href = location.href) {
  const pageKey = pageKeyFromUrl(href);
  const [anns, mems] = await Promise.all([
    annotationRepo.list(),
    memoryRepo.list(),
  ]);
  const annIds = new Set(
    anns
      .filter((a) => {
        if (a.pageKey === pageKey) return true;
        return pageKeyFromUrl(a.url || a.pageKey || "") === pageKey;
      })
      .map((a) => a.id),
  );
  const memIds = new Set(
    mems
      .filter((m) => {
        if (m.pageKey === pageKey) return true;
        return pageKeyFromUrl(m.url || m.pageKey || "") === pageKey;
      })
      .map((m) => m.id),
  );
  const ids = [...new Set([...annIds, ...memIds])];
  await Promise.all([
    annotationRepo.removeMany(ids),
    memoryRepo.removeMany(ids),
  ]);
  return { pageKey, removed: ids.length };
}

export async function clearAllCaptures() {
  await annotationRepo.clearAll();
  await memoryRepo.clearAll();
}

export async function getNudgePayload(href = location.href) {
  const pageKey = pageKeyFromUrl(href);
  const familyKey = familyKeyFromUrl(href);
  const origin = (() => {
    try {
      return new URL(href, location.href).origin;
    } catch {
      return location.origin;
    }
  })();

  const [all, settings] = await Promise.all([
    memoryRepo.list(),
    loadSettings(),
  ]);

  const exact = all.filter((m) => {
    const memKey = pageKeyFromUrl(m.url || m.pageKey || "");
    const storedKey = pageKeyFromUrl(m.pageKey || m.url || "");
    return memKey === pageKey || storedKey === pageKey;
  });

  let related = [];
  if (isRelatedFamilyKey(familyKey, origin)) {
    related = all
      .filter((m) => {
        const memFamily =
          m.familyKey || familyKeyFromUrl(m.url || m.pageKey || "");
        const memKey = pageKeyFromUrl(m.url || m.pageKey || "");
        return memFamily === familyKey && memKey !== pageKey;
      })
      .sort((a, b) =>
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
      )
      .slice(0, 20);
  }

  const excludeIds = new Set([
    ...exact.map((m) => m.id),
    ...related.map((m) => m.id),
  ]);

  let semantic = [];
  try {
    semantic = await findSemanticHits({
      memories: all,
      excludeIds,
      origin,
      href,
      // Let findSemanticHits choose gate from the model actually used.
      allowCrossOrigin: settings.semanticCrossOrigin !== false,
    });
  } catch (err) {
    console.warn("[syncle] semantic scoring failed", err);
  }

  return {
    pageKey,
    familyKey,
    origin,
    exactCount: exact.length,
    relatedCount: related.length,
    semanticCount: semantic.length,
    exact,
    related,
    semantic,
  };
}

/** Kick off MiniLM warm + idle backfill once per content-script lifetime. */
export function initSemanticMemory(onBackfillDone) {
  try {
    warmMiniLM();
    startEmbedBackfill({ onDone: onBackfillDone });
  } catch (err) {
    console.warn("[syncle] embed backfill failed to start", err);
  }
}

export {
  buildTextAnchor,
  buildLassoAnchor,
  currentPageIdentity,
  pageKeyFromUrl,
  familyKeyFromUrl,
  onPageKeyChange,
  isRelatedFamilyKey,
  getPageContextEmbedding,
  dismissSemanticForOriginToday,
  rejectSemanticMemory,
};
