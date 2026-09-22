/**
 * Lasso restore via XPath + element-relative points.
 * Absolute page x/y alone break when layout / viewport changes.
 *
 * Visual restore is the canvas polygon only — we never paint huge
 * containers (html/body/main) with DOM backgrounds.
 */

import {
  clientToPage,
  getScrollParents,
  pageToClient,
} from "./pageCoords.js";
import { bboxOf } from "./bboxOf.js";

const OVERLAY_HIT =
  ".popup-bubble, .syncle-floating-toolbar, .syncle-selection-toolbar, .syncle-memory-nudge, #syncle-overlay-mount, #syncle-toolbar-mount, #draw-on-web-root-host, .syncle-draw-cursor";

const SKIP_TAGS = new Set([
  "html",
  "body",
  "head",
  "script",
  "style",
  "link",
  "meta",
  "noscript",
  "svg",
  "path",
  "iframe",
]);

function textSnippet(el, max = 160) {
  const t = String(el?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function viewportArea() {
  return Math.max(window.innerWidth, 1) * Math.max(window.innerHeight, 1);
}

/** Reject page shells / giant wrappers that would "highlight the whole page". */
export function isOversizedElement(el, lassoBox = null) {
  if (!(el instanceof Element)) return true;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return true;
  if (el === document.documentElement || el === document.body) return true;

  const r = el.getBoundingClientRect();
  const area = Math.max(r.width, 0) * Math.max(r.height, 0);
  if (area < 4) return true;
  if (area > viewportArea() * 0.28) return true;
  if (r.width > window.innerWidth * 0.92 && r.height > window.innerHeight * 0.55) {
    return true;
  }
  if (lassoBox) {
    const lassoArea = Math.max(lassoBox.w * lassoBox.h, 64);
    if (area > lassoArea * 10 && area > 50000) return true;
  }
  return false;
}

/**
 * Deepest sensible content node under a point (skip overlay + page shells).
 */
export function pickAnchorElement(clientX, clientY, lassoBox = null) {
  let stack;
  try {
    stack = document.elementsFromPoint(clientX, clientY);
  } catch {
    return null;
  }
  if (!stack?.length) return null;

  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (el.closest?.(OVERLAY_HIT)) continue;
    if (isOversizedElement(el, lassoBox)) continue;
    return el;
  }

  // Soft fallback: non-shell, even if a bit large — still never html/body.
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (el.closest?.(OVERLAY_HIT)) continue;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;
    if (el === document.documentElement || el === document.body) continue;
    return el;
  }
  return null;
}

/** Stable absolute XPath (id shortcut when unique). */
export function getXPath(node) {
  let el =
    node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  if (!(el instanceof Element)) return "";

  try {
    if (el.id) {
      const id = el.id;
      const matches = document.querySelectorAll(
        `[id="${CSS.escape(id)}"]`,
      );
      if (matches.length === 1) return `//*[@id="${id}"]`;
    }
  } catch {
    /* ignore invalid id */
  }

  const parts = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    const tag = el.nodeName.toLowerCase();
    let index = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.nodeName === el.nodeName) index += 1;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${tag}[${index}]`);
    if (el === document.documentElement) break;
    el = el.parentElement;
  }
  return parts.length ? `/${parts.join("/")}` : "";
}

export function resolveXPath(xpath) {
  if (!xpath) return null;
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const node = result.singleNodeValue;
    if (node instanceof Element) return node;
    if (node?.parentElement) return node.parentElement;
  } catch {
    /* invalid xpath */
  }
  return null;
}

function pointOnElement(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const w = Math.max(rect.width, 1);
  const h = Math.max(rect.height, 1);
  return {
    xpath: getXPath(el),
    fx: (clientX - rect.left) / w,
    fy: (clientY - rect.top) / h,
  };
}

/**
 * Capture: each vertex is bound to a tight content node (xpath + fractional offset).
 */
export function buildLassoAnchor(pagePts, scrollParents = []) {
  if (!Array.isArray(pagePts) || pagePts.length < 2) return null;

  const clientPts = pagePts.map((p) =>
    pageToClient(p.x, p.y, scrollParents),
  );
  const box = bboxOf(clientPts);
  const cx = box.minX + box.w / 2;
  const cy = box.minY + box.h / 2;

  const primary = pickAnchorElement(cx, cy, box);
  if (!primary) return null;

  const relPts = clientPts.map((p) => {
    const el = pickAnchorElement(p.x, p.y, box) || primary;
    return pointOnElement(el, p.x, p.y);
  });

  return {
    primaryXPath: getXPath(primary),
    primaryQuote: textSnippet(primary, 240),
    relPts,
  };
}

/**
 * Restore page-space polygon from xpath-relative anchors.
 * Returns null if nothing can be resolved (caller may fall back to raw pagePts).
 */
export function resolveLassoAnchor(anchor) {
  if (!anchor?.relPts?.length) return null;

  const pagePts = [];
  let scrollParents = [];
  let primaryEl = null;

  for (const pt of anchor.relPts) {
    let el = resolveXPath(pt.xpath);
    if (el && isOversizedElement(el)) el = null;
    if (!el || !el.isConnected) {
      el = resolveXPath(anchor.primaryXPath);
      if (el && isOversizedElement(el)) el = null;
    }
    if (!el || !el.isConnected) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 && rect.height < 0.5) continue;

    const parents = getScrollParents(el);
    if (!scrollParents.length) scrollParents = parents;
    if (!primaryEl) primaryEl = el;

    const client = {
      x: rect.left + (Number(pt.fx) || 0) * Math.max(rect.width, 1),
      y: rect.top + (Number(pt.fy) || 0) * Math.max(rect.height, 1),
    };
    pagePts.push(clientToPage(client.x, client.y, parents));
  }

  if (pagePts.length < 2) return null;

  return {
    pagePts,
    scrollParents,
    element: primaryEl,
    targets: [],
  };
}

/** No-op kept for callers — DOM fill highlights were painting whole-page shells. */
export function applyLassoTargetMarks() {
  /* canvas polygon is the restore visual */
}

export function clearLassoTargetMarks(id) {
  const nodes = document.querySelectorAll(
    id ? `[data-syncle-lasso="${CSS.escape(id)}"]` : "[data-syncle-lasso]",
  );
  for (const el of nodes) {
    el.removeAttribute("data-syncle-lasso");
    el.style.removeProperty("--syncle-lasso-border");
    el.style.removeProperty("--syncle-lasso-fill");
  }
}

export function clearAllLassoTargetMarks() {
  clearLassoTargetMarks(null);
  const style = document.getElementById("syncle-lasso-anchor-style");
  style?.remove();
}
