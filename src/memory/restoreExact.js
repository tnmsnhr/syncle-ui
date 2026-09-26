/**
 * Exact-page restore helpers.
 * - Text (comment / ask / annotation): reattach highlight via text anchors.
 * - Lasso: centroid marker only (no polygon — layout drift is unreliable).
 */

import { LocalAnnotationRepository } from "./localAnnotationRepository.js";
import { pageKeyFromUrl } from "../utils/pageIdentity.js";
import { resolveTextAnchor } from "../utils/textAnchors.js";
import {
  resolveScrollParentsFromNode,
  resolveScrollParentsFromPoint,
  clientToPage,
  pageToClient,
  getScrollParents,
} from "../utils/pageCoords.js";
import { rangeClientBox } from "../utils/textSelection.js";
import { placePopupPosition } from "../utils/placePopupPosition.js";
import { getViewportSize } from "../utils/viewport.js";
import { getLassoTheme, DEFAULT_LASSO_THEME_ID } from "../utils/lassoThemes.js";
import { resolveLassoClientPoints } from "../utils/lassoAnchors.js";

const annotationRepo = LocalAnnotationRepository;

function centroidOfAnn(ann) {
  if (
    ann?.centroidPage &&
    Number.isFinite(ann.centroidPage.x) &&
    Number.isFinite(ann.centroidPage.y)
  ) {
    return { x: ann.centroidPage.x, y: ann.centroidPage.y };
  }
  if (ann?.bboxPage) {
    const b = ann.bboxPage;
    return {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
    };
  }
  if (ann?.popup) {
    return { x: ann.popup.pageX, y: ann.popup.pageY };
  }
  return null;
}

/** Bounding-box center of the lasso, re-read from the anchor element. */
function lassoLiveCentroid(ann) {
  const live = resolveLassoClientPoints(ann?.lassoAnchor);
  if (!live?.clients?.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of live.clients) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const client = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const parents = live.scrollParents || [];
  return {
    client,
    parents,
    page: clientToPage(client.x, client.y, parents),
  };
}

/** Client point of a lasso anchor, re-read so resize/reflow stays aligned. */
export function lassoClientCentroid(anchor) {
  const live = lassoLiveCentroid({ lassoAnchor: anchor });
  return live?.client || null;
}

function lassoRestorePoint(ann) {
  const live = lassoLiveCentroid(ann);
  if (live) {
    return {
      centroidPage: live.page,
      scrollParents: live.parents,
      clientX: live.client.x,
      clientY: live.client.y,
    };
  }

  const c = centroidOfAnn(ann);
  if (!c) return null;
  const client = pageToClient(c.x, c.y, []);
  const inView =
    client.x >= 0 &&
    client.x <= (window.innerWidth || 0) &&
    client.y >= 0 &&
    client.y <= (window.innerHeight || 0);
  return {
    centroidPage: c,
    scrollParents: inView ? resolveScrollParentsFromPoint(client.x, client.y) : [],
    clientX: client.x,
    clientY: client.y,
  };
}

/**
 * @returns {{
 *   textRestores: Array,
 *   lassoRestores: Array,
 *   failed: Array,
 * }}
 */
export async function loadExactRestores(href = location.href) {
  const pageKey = pageKeyFromUrl(href);
  const anns = await annotationRepo.listByPageKey(pageKey);
  const view = getViewportSize();
  const textRestores = [];
  const lassoRestores = [];
  const failed = [];

  for (const ann of anns) {
    const theme = getLassoTheme(ann.themeId || DEFAULT_LASSO_THEME_ID);
    const messages = Array.isArray(ann.messages) ? ann.messages : [];

    if (ann.kind === "text" || ann.textAnchor || (ann.quote && ann.kind !== "lasso")) {
      const range = resolveTextAnchor(
        ann.textAnchor || { quote: ann.quote, prefix: "", suffix: "" },
      );
      if (!range) {
        failed.push({ id: ann.id, kind: "text", reason: "anchor-miss" });
        // Fall back to centroid bubble so the note isn't lost.
        const c = centroidOfAnn(ann);
        if (c) {
          const client = pageToClient(c.x, c.y, []);
          const inView =
            client.x >= 0 &&
            client.x <= (window.innerWidth || 0) &&
            client.y >= 0 &&
            client.y <= (window.innerHeight || 0);
          const parents = inView
            ? resolveScrollParentsFromPoint(client.x, client.y)
            : [];
          lassoRestores.push({
            id: ann.id,
            kind: "text-fallback",
            mode: ann.mode || "comment",
            quote: ann.quote || "",
            centroidPage: c,
            clientX: client.x,
            clientY: client.y,
            pageX: ann.popup?.pageX ?? c.x,
            pageY: ann.popup?.pageY ?? c.y,
            scrollParents: parents,
            messages,
            theme,
            startCollapsed: true,
            weak: true,
          });
        }
        continue;
      }

      const box = rangeClientBox(range);
      if (!box) {
        failed.push({ id: ann.id, kind: "text", reason: "no-box" });
        continue;
      }

      const parents = resolveScrollParentsFromNode(range.commonAncestorContainer);
      const placed = placePopupPosition(box, view);
      const pagePos = clientToPage(placed.x, placed.y, parents);
      const centroid = clientToPage(
        box.minX + box.w / 2,
        box.minY + box.h / 2,
        parents,
      );

      textRestores.push({
        id: ann.id,
        kind: "text",
        mode: ann.mode || "comment",
        quote: ann.quote || range.toString().replace(/\s+/g, " ").trim(),
        range,
        pageX: pagePos.x,
        pageY: pagePos.y,
        centroidPage: centroid,
        scrollParents: parents,
        messages,
        theme,
        startCollapsed: true,
      });
      continue;
    }

    // Lasso → centroid on the original element, not a stale page coordinate.
    const point = lassoRestorePoint(ann);
    if (!point) {
      failed.push({ id: ann.id, kind: "lasso", reason: "no-centroid" });
      continue;
    }
    const { centroidPage: c } = point;

    lassoRestores.push({
      id: ann.id,
      kind: "lasso",
      mode: ann.mode || "ask",
      quote: ann.quote || ann.lassoAnchor?.primaryQuote || "",
      centroidPage: c,
      clientX: point.clientX,
      clientY: point.clientY,
      lassoAnchor: ann.lassoAnchor || null,
      pageX: ann.popup?.pageX ?? c.x + 16,
      pageY: ann.popup?.pageY ?? c.y - 12,
      scrollParents: point.scrollParents,
      messages,
      theme,
      startCollapsed: true,
      weak: false,
    });
  }

  return { pageKey, textRestores, lassoRestores, failed };
}

function firstClientRect(range) {
  const list = range?.getClientRects?.();
  if (list && list.length) return list[0];
  const rect = range?.getBoundingClientRect?.();
  if (rect && (rect.width || rect.height)) return rect;
  return null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

let scrollFrame = 0;
let releaseScrollLock = () => {};

function cancelScrollAnimation() {
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }
  releaseScrollLock();
  releaseScrollLock = () => {};
}

function lockScrollBehavior(elements) {
  const saved = elements.map((el) => ({
    el,
    value: el.style.getPropertyValue("scroll-behavior"),
    priority: el.style.getPropertyPriority("scroll-behavior"),
  }));
  for (const el of elements) {
    el.style.setProperty("scroll-behavior", "auto", "important");
  }
  return () => {
    for (const item of saved) {
      if (item.value) {
        item.el.style.setProperty("scroll-behavior", item.value, item.priority);
      } else {
        item.el.style.removeProperty("scroll-behavior");
      }
    }
  };
}

/**
 * One eased animation to the measured targets.
 * Each frame writes the absolute position, so a long trip is not cut short.
 */
function animateScroll(moves, onDone) {
  const active = moves.filter(
    (move) =>
      Math.abs(move.toTop - move.fromTop) >= 1 ||
      Math.abs(move.toLeft - move.fromLeft) >= 1,
  );
  if (!active.length) {
    onDone?.();
    return;
  }

  cancelScrollAnimation();

  const distance = Math.max(
    ...active.map((move) =>
      Math.hypot(move.toTop - move.fromTop, move.toLeft - move.fromLeft),
    ),
  );
  const duration = clamp(320 + distance * 0.22, 420, 900);
  const started = performance.now();
  const elements = [
    ...new Set(
      [document.documentElement, document.body, ...active.map((move) => move.el)].filter(
        Boolean,
      ),
    ),
  ];
  const unlock = lockScrollBehavior(elements);
  releaseScrollLock = unlock;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("wheel", stopUser, { capture: true });
    window.removeEventListener("touchmove", stopUser, { capture: true });
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    unlock();
    if (releaseScrollLock === unlock) releaseScrollLock = () => {};
  };
  const stopUser = () => {
    stop();
  };
  window.addEventListener("wheel", stopUser, { capture: true, passive: true });
  window.addEventListener("touchmove", stopUser, { capture: true, passive: true });

  const step = (now) => {
    if (stopped) return;
    const t = clamp((now - started) / duration, 0, 1);
    const eased = easeInOut(t);
    for (const move of active) {
      if (!move.el.isConnected && move.el !== document.scrollingElement) continue;
      move.el.scrollTop = move.fromTop + (move.toTop - move.fromTop) * eased;
      move.el.scrollLeft = move.fromLeft + (move.toLeft - move.fromLeft) * eased;
    }
    if (t < 1) {
      scrollFrame = requestAnimationFrame(step);
      return;
    }
    stop();
    onDone?.();
  };
  scrollFrame = requestAnimationFrame(step);
}

function planRangeMoves(range) {
  const node = range?.startContainer;
  const el =
    node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement || null;
  const rect = firstClientRect(range);
  if (!rect) return [];

  let dy = rect.top + rect.height / 2 - (window.innerHeight || 0) / 2;
  let dx = rect.left + rect.width / 2 - (window.innerWidth || 0) / 2;
  const moves = [];

  if (el) {
    for (const parent of getScrollParents(el)) {
      const maxTop = Math.max(0, parent.scrollHeight - parent.clientHeight);
      const maxLeft = Math.max(0, parent.scrollWidth - parent.clientWidth);
      const roomTop = dy > 0 ? maxTop - parent.scrollTop : parent.scrollTop;
      const roomLeft = dx > 0 ? maxLeft - parent.scrollLeft : parent.scrollLeft;
      const takeY = dy > 0 ? Math.min(dy, roomTop) : dy < 0 ? -Math.min(-dy, roomTop) : 0;
      const takeX = dx > 0 ? Math.min(dx, roomLeft) : dx < 0 ? -Math.min(-dx, roomLeft) : 0;
      if (Math.abs(takeY) < 1 && Math.abs(takeX) < 1) continue;
      moves.push({
        el: parent,
        fromTop: parent.scrollTop,
        toTop: clamp(parent.scrollTop + takeY, 0, maxTop),
        fromLeft: parent.scrollLeft,
        toLeft: clamp(parent.scrollLeft + takeX, 0, maxLeft),
      });
      dy -= takeY;
      dx -= takeX;
    }
  }

  if (Math.abs(dy) >= 1 || Math.abs(dx) >= 1) {
    const scrolling = document.scrollingElement || document.documentElement;
    const maxTop = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
    const maxLeft = Math.max(0, scrolling.scrollWidth - scrolling.clientWidth);
    moves.push({
      el: scrolling,
      fromTop: scrolling.scrollTop,
      toTop: clamp(scrolling.scrollTop + dy, 0, maxTop),
      fromLeft: scrolling.scrollLeft,
      toLeft: clamp(scrolling.scrollLeft + dx, 0, maxLeft),
    });
  }

  return moves;
}

function scrollRangeIntoView(range, allowFollowUp = true) {
  const moves = planRangeMoves(range);
  animateScroll(moves, () => {
    if (!allowFollowUp) return;
    const rect = firstClientRect(range);
    if (!rect) return;
    const dy = rect.top + rect.height / 2 - (window.innerHeight || 0) / 2;
    const dx = rect.left + rect.width / 2 - (window.innerWidth || 0) / 2;
    if (Math.abs(dy) > 80 || Math.abs(dx) > 80) {
      scrollRangeIntoView(range, false);
    }
  });
}

function planClientMoves(clientX, clientY, parents) {
  let dy = clientY - (window.innerHeight || 0) / 2;
  let dx = clientX - (window.innerWidth || 0) / 2;
  // A lasso's page X is not a horizontal scroll offset. Leave X alone when
  // the point is already on screen so the page is not shoved sideways.
  if (clientX >= 0 && clientX <= (window.innerWidth || 0)) dx = 0;
  const moves = [];

  for (const parent of parents || []) {
    if (!parent?.isConnected) continue;
    const maxTop = Math.max(0, parent.scrollHeight - parent.clientHeight);
    const maxLeft = Math.max(0, parent.scrollWidth - parent.clientWidth);
    const roomTop = dy > 0 ? maxTop - parent.scrollTop : parent.scrollTop;
    const roomLeft = dx > 0 ? maxLeft - parent.scrollLeft : parent.scrollLeft;
    const takeY = dy > 0 ? Math.min(dy, roomTop) : dy < 0 ? -Math.min(-dy, roomTop) : 0;
    const takeX = dx > 0 ? Math.min(dx, roomLeft) : dx < 0 ? -Math.min(-dx, roomLeft) : 0;
    if (Math.abs(takeY) < 1 && Math.abs(takeX) < 1) continue;
    moves.push({
      el: parent,
      fromTop: parent.scrollTop,
      toTop: clamp(parent.scrollTop + takeY, 0, maxTop),
      fromLeft: parent.scrollLeft,
      toLeft: clamp(parent.scrollLeft + takeX, 0, maxLeft),
    });
    dy -= takeY;
    dx -= takeX;
  }

  if (Math.abs(dy) >= 1 || Math.abs(dx) >= 1) {
    const scrolling = document.scrollingElement || document.documentElement;
    const maxTop = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
    const maxLeft = Math.max(0, scrolling.scrollWidth - scrolling.clientWidth);
    moves.push({
      el: scrolling,
      fromTop: scrolling.scrollTop,
      toTop: clamp(scrolling.scrollTop + dy, 0, maxTop),
      fromLeft: scrolling.scrollLeft,
      toLeft: clamp(scrolling.scrollLeft + dx, 0, maxLeft),
    });
  }

  return moves;
}

function scrollClientIntoView(clientX, clientY, parents) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  animateScroll(planClientMoves(clientX, clientY, parents));
}

/** Bring a restored text range or centroid into the middle of the viewport. */
export function scrollRestoreTarget(item) {
  if (!item) return;
  if (item.range) {
    scrollRangeIntoView(item.range);
    return;
  }
  const parents = Array.isArray(item.scrollParents) ? item.scrollParents : [];
  let clientX = item.clientX;
  let clientY = item.clientY;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    const c = item.centroidPage;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) return;
    const client = pageToClient(c.x, c.y, parents);
    clientX = client.x;
    clientY = client.y;
  }
  scrollClientIntoView(clientX, clientY, parents);
}
