import { clientToPage, resolveScrollParentsFromNode } from "./pageCoords.js";

const OVERLAY_UI =
  ".popup-bubble, .syncle-floating-toolbar, .syncle-selection-toolbar, #syncle-overlay-mount, #syncle-toolbar-mount, #draw-on-web-root-host";

const STYLE_ID = "syncle-text-highlight-style";

function hexToRgba(hex, alpha) {
  const n = String(hex || "").replace("#", "");
  if (n.length !== 6) return `rgba(34, 197, 94, ${alpha})`;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function highlightFill(theme) {
  return hexToRgba(theme?.border, 0.32);
}

function isOverlayNode(node) {
  const el =
    node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(el?.closest?.(OVERLAY_UI));
}

function isIgnoredField(node) {
  const el =
    node?.nodeType === 1 ? node : node?.parentElement;
  return Boolean(el?.closest?.("input, textarea, select"));
}

export function rangeClientBox(range) {
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const rects = [...range.getClientRects()];
    if (!rects.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of rects) {
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  return {
    minX: rect.left,
    minY: rect.top,
    maxX: rect.right,
    maxY: rect.bottom,
    w: rect.width,
    h: rect.height,
  };
}

export function readPageSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return null;

  const range = sel.getRangeAt(0);
  if (isOverlayNode(range.commonAncestorContainer)) return null;
  if (isIgnoredField(range.commonAncestorContainer)) return null;

  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;

  const box = rangeClientBox(range);
  if (!box || (box.w < 2 && box.h < 2)) return null;

  return {
    range: range.cloneRange(),
    text,
    box,
  };
}

export function placeSelectionToolbar(clientBox, view, size = { w: 198, h: 36 }) {
  const margin = 8;
  const gap = 8;
  const midX = (clientBox.minX + clientBox.maxX) / 2;
  let x = midX - size.w / 2;
  x = Math.min(Math.max(margin, x), Math.max(margin, view.width - size.w - margin));

  const topY = clientBox.minY - size.h - gap;
  if (topY >= margin) {
    return { x, y: topY, side: "top" };
  }

  const rightX = clientBox.maxX + gap;
  if (rightX + size.w <= view.width - margin) {
    const y = Math.min(
      Math.max(margin, clientBox.minY),
      view.height - size.h - margin,
    );
    return { x: rightX, y, side: "right" };
  }

  const leftX = clientBox.minX - size.w - gap;
  if (leftX >= margin) {
    const y = Math.min(
      Math.max(margin, clientBox.minY),
      view.height - size.h - margin,
    );
    return { x: leftX, y, side: "left" };
  }

  const bottomY = Math.min(
    clientBox.maxY + gap,
    view.height - size.h - margin,
  );
  return { x, y: Math.max(margin, bottomY), side: "bottom" };
}

export function selectionToPagePopup(box, range) {
  const centroidClient = {
    x: box.minX + box.w / 2,
    y: box.minY + box.h / 2,
  };
  const parents = range
    ? resolveScrollParentsFromNode(range.commonAncestorContainer)
    : [];
  return {
    centroidPage: clientToPage(centroidClient.x, centroidClient.y, parents),
    scrollParents: parents,
    box,
  };
}

function ensureHighlightSheet() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.documentElement.appendChild(el);
  }
  return el;
}

const highlightRules = new Map();

function renderHighlightSheet() {
  const el = ensureHighlightSheet();
  el.textContent = [...highlightRules.entries()]
    .map(
      ([name, fill]) =>
        `::highlight(${name}) { background-color: ${fill}; color: inherit; }`,
    )
    .join("\n");
}

export function applyTextHighlight(id, range, fill) {
  const name = `syncle-hl-${id}`;
  if (typeof Highlight === "undefined" || !CSS.highlights) return null;
  try {
    CSS.highlights.set(name, new Highlight(range));
    highlightRules.set(name, fill);
    renderHighlightSheet();
    return name;
  } catch {
    return null;
  }
}

export function removeTextHighlight(id) {
  const name = `syncle-hl-${id}`;
  try {
    CSS.highlights?.delete(name);
  } catch {
    /* ignore */
  }
  highlightRules.delete(name);
  if (highlightRules.size) renderHighlightSheet();
  else document.getElementById(STYLE_ID)?.remove();
}

export function clearAllTextHighlights() {
  try {
    if (CSS.highlights) {
      for (const name of [...CSS.highlights.keys()]) {
        if (String(name).startsWith("syncle-hl-")) CSS.highlights.delete(name);
      }
    }
  } catch {
    /* ignore */
  }
  highlightRules.clear();
  document.getElementById(STYLE_ID)?.remove();
}

export function clearNativeSelection() {
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    /* ignore */
  }
}
