/** Lightweight text anchors for restore (quote + prefix/suffix + path). */

function nodePath(node) {
  const parts = [];
  let n = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (n && n !== document.body && n !== document.documentElement) {
    if (!(n instanceof Element)) break;
    const parent = n.parentElement;
    if (!parent) break;
    const siblings = [...parent.children].filter((c) => c.tagName === n.tagName);
    const idx = siblings.indexOf(n);
    parts.push(`${n.tagName.toLowerCase()}[${idx}]`);
    n = parent;
  }
  return parts.reverse().join("/");
}

/** Index of this text node among element's text-node descendants (direct + nested leaf). */
function textNodeIndexInParent(textNode) {
  const parent =
    textNode?.nodeType === Node.TEXT_NODE
      ? textNode.parentElement
      : textNode;
  if (!parent) return 0;
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  let i = 0;
  let n;
  while ((n = walker.nextNode())) {
    if (n === textNode) return i;
    i += 1;
  }
  return 0;
}

function resolveElementPath(path) {
  if (!path || typeof path !== "string") return null;
  let el = document.body;
  if (!el) return null;
  for (const part of path.split("/").filter(Boolean)) {
    const m = /^([a-zA-Z0-9]+)\[(\d+)\]$/.exec(part);
    if (!m) return null;
    const tag = m[1].toUpperCase();
    const idx = Number(m[2]);
    const kids = [...el.children].filter((c) => c.tagName === tag);
    el = kids[idx];
    if (!el) return null;
  }
  return el;
}

function textNodeAt(el, index) {
  if (!el) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let i = 0;
  let n;
  while ((n = walker.nextNode())) {
    if (i === index) return n;
    i += 1;
  }
  return null;
}

export function buildTextAnchor(range) {
  if (!range || range.collapsed) return null;
  try {
    const quote = range.toString().replace(/\s+/g, " ").trim();
    if (!quote) return null;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(document.body);
    preRange.setEnd(range.startContainer, range.startOffset);
    const prefix = preRange.toString().slice(-48).replace(/\s+/g, " ");

    const postRange = range.cloneRange();
    postRange.selectNodeContents(document.body);
    postRange.setStart(range.endContainer, range.endOffset);
    const suffix = postRange.toString().slice(0, 48).replace(/\s+/g, " ");

    const startIsText = range.startContainer.nodeType === Node.TEXT_NODE;
    const endIsText = range.endContainer.nodeType === Node.TEXT_NODE;

    return {
      quote: quote.slice(0, 500),
      prefix,
      suffix,
      startPath: nodePath(range.startContainer),
      endPath: nodePath(range.endContainer),
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startTextIndex: startIsText
        ? textNodeIndexInParent(range.startContainer)
        : 0,
      endTextIndex: endIsText
        ? textNodeIndexInParent(range.endContainer)
        : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Build a whitespace-collapsed haystack with a map back to (node, offset).
 */
function buildNormalizedCorpus() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const map = []; // normIndex → { node, offset }
  let hay = "";
  let node;
  while ((node = walker.nextNode())) {
    const raw = node.nodeValue || "";
    if (!raw) continue;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (/\s/.test(ch)) {
        if (hay.endsWith(" ") || hay.length === 0) continue;
        map.push({ node, offset: i });
        hay += " ";
      } else {
        map.push({ node, offset: i });
        hay += ch;
      }
    }
  }
  return { hay: hay.trimEnd(), map };
}

function rangeFromNormSpan(map, start, end) {
  if (start < 0 || end > map.length || start >= end) return null;
  const a = map[start];
  const b = map[end - 1];
  if (!a || !b) return null;
  try {
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset + 1);
    if (range.collapsed) return null;
    return range;
  } catch {
    return null;
  }
}

function findQuoteRange(quote, prefix, suffix) {
  if (!quote) return null;
  const q = String(quote).replace(/\s+/g, " ").trim();
  if (!q) return null;
  const pre = String(prefix || "").replace(/\s+/g, " ");
  const suf = String(suffix || "").replace(/\s+/g, " ");

  const { hay, map } = buildNormalizedCorpus();
  if (!hay || !map.length) return null;

  let idx = -1;
  if (pre) {
    const withPre = `${pre}${q}`;
    const i = hay.indexOf(withPre);
    if (i >= 0) idx = i + pre.length;
  }
  if (idx < 0) idx = hay.indexOf(q);
  if (idx < 0 && suf) {
    const withSuf = `${q}${suf}`;
    const i = hay.indexOf(withSuf);
    if (i >= 0) idx = i;
  }
  if (idx < 0) {
    // Soft: first 80 chars of quote (short unique slice).
    const soft = q.slice(0, Math.min(80, q.length));
    if (soft.length >= 12) idx = hay.indexOf(soft);
    if (idx >= 0) {
      return rangeFromNormSpan(map, idx, Math.min(idx + soft.length, map.length));
    }
    return null;
  }

  return rangeFromNormSpan(map, idx, Math.min(idx + q.length, map.length));
}

function findPathRange(anchor) {
  if (!anchor?.startPath) return null;
  try {
    const startEl = resolveElementPath(anchor.startPath);
    const endEl = resolveElementPath(anchor.endPath || anchor.startPath);
    if (!startEl || !endEl) return null;

    const startNode =
      textNodeAt(startEl, anchor.startTextIndex ?? 0) || startEl;
    const endNode = textNodeAt(endEl, anchor.endTextIndex ?? 0) || endEl;

    const range = document.createRange();
    const startOff = Math.min(
      Math.max(0, Number(anchor.startOffset) || 0),
      startNode.nodeType === Node.TEXT_NODE
        ? startNode.nodeValue?.length || 0
        : startNode.childNodes.length,
    );
    const endOff = Math.min(
      Math.max(0, Number(anchor.endOffset) || 0),
      endNode.nodeType === Node.TEXT_NODE
        ? endNode.nodeValue?.length || 0
        : endNode.childNodes.length,
    );
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    if (range.collapsed) return null;
    const got = range.toString().replace(/\s+/g, " ").trim();
    const want = String(anchor.quote || "").replace(/\s+/g, " ").trim();
    // Accept path restore if quote overlaps meaningfully, or no quote stored.
    if (want && got) {
      const a = want.slice(0, 40);
      const b = got.slice(0, 40);
      if (!got.includes(a.slice(0, 20)) && !want.includes(b.slice(0, 20))) {
        return null;
      }
    }
    return range;
  } catch {
    return null;
  }
}

/**
 * Resolve stored text anchor → live Range.
 * Prefer quote (+ prefix/suffix); fall back to path + offsets.
 */
export function resolveTextAnchor(anchor) {
  if (!anchor) return null;
  const byQuote = findQuoteRange(anchor.quote, anchor.prefix, anchor.suffix);
  if (byQuote) return byQuote;
  return findPathRange(anchor);
}
