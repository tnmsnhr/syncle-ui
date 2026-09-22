/**
 * Lightweight local embedder + overlap boost for topic matching.
 */

import { EMBED_DIM, EMBED_MODEL, MAX_EMBED_CHARS } from "./embedConfig.js";

const STOP = new Set(
  `a an the and or or but if in on at to for of as is was are were be been being
  this that these those it its with from by into over after before about
  between through during without within along than then so such only just
  also very can could should would will may might must do does did done
  have has had having not no nor too more most some any all each few other
  your you we they he she them their our my me i am etc via using use used
  how what when where which who why guide complete from someone who just
  spent hours debugging article post blog read more click here`
    .split(/\s+/)
    .filter(Boolean),
);

function clipEmbedText(raw) {
  const t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (t.length <= MAX_EMBED_CHARS) return t;
  return t.slice(0, MAX_EMBED_CHARS);
}

function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/gi, " ")
    .split(/\s+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function lightStem(tok) {
  if (tok.length < 5) return tok;
  return tok.replace(/(ing|ed|ly|tions|tion|ments|ment|ness|ers|er|es|s)$/i, "");
}

export function significantTokens(text) {
  return tokenize(text)
    .map(lightStem)
    .filter((t) => t.length >= 3);
}

/**
 * Build embed text from memory fields (quote + note first).
 */
export function buildMemoryEmbedText(memory) {
  const parts = [];
  if (memory?.note) parts.push(String(memory.note), String(memory.note));
  if (memory?.quote) parts.push(String(memory.quote), String(memory.quote));
  if (memory?.heading) parts.push(String(memory.heading), String(memory.heading));
  if (memory?.title) parts.push(String(memory.title));
  const msgs = Array.isArray(memory?.messages) ? memory.messages : [];
  for (const m of msgs.slice(-4)) {
    if (m?.text) parts.push(String(m.text));
  }
  return clipEmbedText(parts.filter(Boolean).join("\n"));
}

function addFeature(tf, feat, weight = 1) {
  tf.set(feat, (tf.get(feat) || 0) + weight);
}

export function embedTextSync(raw) {
  const text = clipEmbedText(raw);
  const vec = new Float32Array(EMBED_DIM);
  if (!text) {
    return {
      embedding: Array.from(vec),
      embedModel: EMBED_MODEL,
      embedDim: EMBED_DIM,
      embedText: "",
    };
  }

  const tokens = significantTokens(text);
  const tf = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const w = t.length >= 6 ? 1.8 : 1.1;
    addFeature(tf, t, w);
    if (i + 1 < tokens.length) {
      addFeature(tf, `${t}_${tokens[i + 1]}`, 2.4);
    }
    if (i + 2 < tokens.length) {
      addFeature(tf, `${t}_${tokens[i + 1]}_${tokens[i + 2]}`, 1.5);
    }
  }

  const compact = tokens.join("");
  for (let i = 0; i + 3 < compact.length; i += 2) {
    addFeature(tf, `#${compact.slice(i, i + 4)}`, 0.5);
  }

  const N = Math.max(tokens.length, 1);
  for (const [feat, count] of tf) {
    const h = hash32(feat);
    const idx = h % EMBED_DIM;
    const sign = h & 1 ? 1 : -1;
    const tfw = 1 + Math.log(1 + count);
    const idf = Math.log(1 + N / (1 + Math.min(count, N)));
    vec[idx] += sign * tfw * idf;
  }

  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) out[i] = vec[i] / norm;

  return {
    embedding: out,
    embedModel: EMBED_MODEL,
    embedDim: EMBED_DIM,
    embedText: text.slice(0, 240),
  };
}

export async function embedText(raw) {
  return embedTextSync(raw);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  if (!d) return 0;
  return dot / d;
}

/**
 * Jaccard-like overlap on significant tokens (0–1).
 * Helps when vector cosine is middling but titles share “deep link / expo”.
 */
export function tokenOverlapScore(aText, bText) {
  const a = new Set(significantTokens(aText));
  const b = new Set(significantTokens(bText));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  if (!union) return 0;
  // Prefer precision: weight by intersection over smaller set.
  const dens = inter / Math.min(a.size, b.size);
  const jac = inter / union;
  return Math.max(dens * 0.65 + jac * 0.35, 0);
}

/** Blend cosine with token overlap for friendlier same-topic hits. */
export function relatednessScore(vecA, textA, vecB, textB) {
  const cos = cosineSimilarity(vecA, vecB);
  const ov = tokenOverlapScore(textA, textB);
  // Overlap can lift a near-miss cosine without letting pasta through.
  return Math.min(1, cos * 0.72 + ov * 0.45);
}
