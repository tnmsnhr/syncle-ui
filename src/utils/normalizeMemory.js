const MAX_QUOTE = 500;
const MAX_NOTE = 500;

function clip(s, n) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/**
 * Build a MemoryObject from a capture event.
 * Embedding fields are filled asynchronously by embedQueue.
 */
export function normalizeMemory({
  id,
  annotationId,
  kind,
  title,
  quote,
  note,
  url,
  origin,
  pageKey,
  familyKey,
  heading = "",
  messages = [],
  tags = [],
  createdAt,
  updatedAt,
  embedding = undefined,
  embedModel = undefined,
  embedDim = undefined,
  embedText = undefined,
}) {
  const now = new Date().toISOString();
  return {
    id: id || annotationId,
    annotationId,
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
    pageKey,
    familyKey,
    url,
    origin,
    kind,
    title: clip(title || document.title || "", 200),
    heading: clip(heading, 160),
    quote: clip(quote, MAX_QUOTE),
    note: clip(note, MAX_NOTE),
    messages: Array.isArray(messages) ? messages : [],
    tags: Array.isArray(tags) ? tags : [],
    ...(embedding !== undefined ? { embedding } : {}),
    ...(embedModel !== undefined ? { embedModel } : {}),
    ...(embedDim !== undefined ? { embedDim } : {}),
    ...(embedText !== undefined ? { embedText } : {}),
  };
}

export function memoryMessage({ id, role, text }) {
  return {
    id,
    role,
    text: clip(text, MAX_NOTE),
    at: new Date().toISOString(),
  };
}
