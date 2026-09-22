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
 * Build a Phase-1 MemoryObject from a capture event.
 * No embedding fields.
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
  messages = [],
  tags = [],
  createdAt,
  updatedAt,
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
    quote: clip(quote, MAX_QUOTE),
    note: clip(note, MAX_NOTE),
    messages: Array.isArray(messages) ? messages : [],
    tags: Array.isArray(tags) ? tags : [],
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
