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
} from "../utils/pageCoords.js";
import { rangeClientBox } from "../utils/textSelection.js";
import { placePopupPosition } from "../utils/placePopupPosition.js";
import { getViewportSize } from "../utils/viewport.js";
import { getLassoTheme, DEFAULT_LASSO_THEME_ID } from "../utils/lassoThemes.js";

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
          const parents = resolveScrollParentsFromPoint(client.x, client.y);
          lassoRestores.push({
            id: ann.id,
            kind: "text-fallback",
            mode: ann.mode || "comment",
            quote: ann.quote || "",
            centroidPage: c,
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

    // Lasso → centroid only
    const c = centroidOfAnn(ann);
    if (!c) {
      failed.push({ id: ann.id, kind: "lasso", reason: "no-centroid" });
      continue;
    }
    const client = pageToClient(c.x, c.y, []);
    const parents = resolveScrollParentsFromPoint(client.x, client.y);
    const pageX = ann.popup?.pageX ?? c.x + 16;
    const pageY = ann.popup?.pageY ?? c.y - 12;

    lassoRestores.push({
      id: ann.id,
      kind: "lasso",
      mode: ann.mode || "ask",
      quote: ann.quote || ann.lassoAnchor?.primaryQuote || "",
      centroidPage: c,
      pageX,
      pageY,
      scrollParents: parents,
      messages,
      theme,
      startCollapsed: true,
      weak: false,
    });
  }

  return { pageKey, textRestores, lassoRestores, failed };
}
