import { LocalMemoryRepository } from "./localMemoryRepository.js";
import { LocalAnnotationRepository } from "./localAnnotationRepository.js";
import { normalizeMemory, memoryMessage } from "../utils/normalizeMemory.js";
import {
  currentPageIdentity,
  pageKeyFromUrl,
  familyKeyFromUrl,
  onPageKeyChange,
} from "../utils/pageIdentity.js";
import { buildTextAnchor } from "../utils/textAnchors.js";
import { buildLassoAnchor } from "../utils/lassoAnchors.js";
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
}) {
  const identity = currentPageIdentity();
  const annotationId = id || uid();
  const now = new Date().toISOString();

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
  await memoryRepo.upsert(memory);
  return { annotation, memory };
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
  if (mem) {
    await memoryRepo.upsert({
      ...mem,
      messages,
      note: mem.note || (role === "user" ? text : mem.note),
    });
  }
  return msg;
}

export async function deleteCapture(id) {
  await annotationRepo.remove(id);
  await memoryRepo.remove(id);
}

export async function clearAllCaptures() {
  await annotationRepo.clearAll();
  await memoryRepo.clearAll();
}

export async function getNudgePayload(href = location.href) {
  const pageKey = pageKeyFromUrl(href);
  const familyKey = familyKeyFromUrl(href);
  const exact = await memoryRepo.listByPageKey(pageKey);
  const related = await memoryRepo.listByFamilyKey(familyKey, {
    excludePageKey: pageKey,
    limit: 20,
  });
  return {
    pageKey,
    familyKey,
    exactCount: exact.length,
    relatedCount: related.length,
    exact,
    related,
  };
}

export {
  buildTextAnchor,
  buildLassoAnchor,
  currentPageIdentity,
  pageKeyFromUrl,
  familyKeyFromUrl,
  onPageKeyChange,
};
