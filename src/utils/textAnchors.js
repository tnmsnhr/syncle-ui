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

export function buildTextAnchor(range) {
  if (!range || range.collapsed) return null;
  try {
    const quote = range.toString().replace(/\s+/g, " ").trim();
    if (!quote) return null;

    const preRange = range.cloneRange();
    preRange.selectNodeContents(document.body);
    preRange.setEnd(range.startContainer, range.startOffset);
    const prefix = preRange.toString().slice(-40).replace(/\s+/g, " ");

    const postRange = range.cloneRange();
    postRange.selectNodeContents(document.body);
    postRange.setStart(range.endContainer, range.endOffset);
    const suffix = postRange.toString().slice(0, 40).replace(/\s+/g, " ");

    return {
      quote: quote.slice(0, 500),
      prefix,
      suffix,
      startPath: nodePath(range.startContainer),
      endPath: nodePath(range.endContainer),
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    };
  } catch {
    return null;
  }
}

function findQuoteRange(quote, prefix, suffix) {
  if (!quote) return null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const chunks = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue?.trim()) continue;
    chunks.push({ node, text: node.nodeValue });
  }
  const hay = chunks.map((c) => c.text).join("");
  const normHay = hay;
  let idx = normHay.indexOf(quote);
  if (idx < 0 && prefix) {
    const withPre = `${prefix}${quote}`;
    const i = normHay.indexOf(withPre);
    if (i >= 0) idx = i + prefix.length;
  }
  if (idx < 0) return null;

  let pos = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  const endIdx = idx + quote.length;

  for (const c of chunks) {
    const next = pos + c.text.length;
    if (!startNode && idx >= pos && idx < next) {
      startNode = c.node;
      startOff = idx - pos;
    }
    if (!endNode && endIdx > pos && endIdx <= next) {
      endNode = c.node;
      endOff = endIdx - pos;
      break;
    }
    pos = next;
  }

  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    if (range.collapsed) return null;
    return range;
  } catch {
    return null;
  }
}

/** Best-effort restore Range from stored anchor. */
export function resolveTextAnchor(anchor) {
  if (!anchor?.quote) return null;
  return findQuoteRange(anchor.quote, anchor.prefix, anchor.suffix);
}
