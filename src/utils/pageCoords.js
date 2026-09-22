import { isSyncleElement } from "./isolatedMount.js";

/** Collapse a chat bubble into a centroid dot after this much page scroll. */
export const POPUP_COLLAPSE_SCROLL_PX = 100;

/** Document / visualViewport scroll (not nested overflow boxes). */
export function getWindowScrollOffset() {
  const vv = window.visualViewport;
  return {
    x: vv?.pageLeft ?? window.scrollX ?? 0,
    y: vv?.pageTop ?? window.scrollY ?? 0,
  };
}

function isScrollContainer(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el === document.documentElement || el === document.body) return false;
  const { overflowX, overflowY } = getComputedStyle(el);
  return (
    /(auto|scroll|overlay)/.test(overflowX) ||
    /(auto|scroll|overlay)/.test(overflowY)
  );
}

/** Nested overflow scrollers between `node` and the document (bottom → top). */
export function getScrollParents(node) {
  const parents = [];
  let el =
    node?.nodeType === Node.ELEMENT_NODE
      ? node
      : node?.parentElement ?? null;
  while (el && el !== document.documentElement && el !== document.body) {
    if (isScrollContainer(el)) parents.push(el);
    el = el.parentElement;
  }
  return parents;
}

/** Prefer page content under the point; skip Syncle overlay UI. */
export function elementFromPointDeep(clientX, clientY) {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    if (isSyncleElement(el)) continue;
    return el;
  }
  return stack[0] instanceof Element ? stack[0] : null;
}

export function resolveScrollParentsFromPoint(clientX, clientY) {
  return getScrollParents(elementFromPointDeep(clientX, clientY));
}

export function resolveScrollParentsFromNode(node) {
  return getScrollParents(node);
}

/**
 * Window scroll + nested scrollLeft/Top for the given overflow ancestors.
 * Pass the same parent list used when the coords were captured.
 */
export function getScrollOffset(scrollParents = []) {
  const s = getWindowScrollOffset();
  let x = s.x;
  let y = s.y;
  for (const el of scrollParents) {
    if (!el || !el.isConnected) continue;
    x += el.scrollLeft || 0;
    y += el.scrollTop || 0;
  }
  return { x, y };
}

export function clientToPage(clientX, clientY, scrollParents = []) {
  const s = getScrollOffset(scrollParents);
  return { x: clientX + s.x, y: clientY + s.y };
}

export function pageToClient(pageX, pageY, scrollParents = []) {
  const s = getScrollOffset(scrollParents);
  return { x: pageX - s.x, y: pageY - s.y };
}

/** Coalesce any scroll (window or nested, via capture) to one rAF callback. */
export function onPageScroll(callback) {
  let frame = 0;
  const run = () => {
    frame = 0;
    callback();
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(run);
  };

  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule, { capture: true });
    window.visualViewport?.removeEventListener("scroll", schedule);
  };
}
