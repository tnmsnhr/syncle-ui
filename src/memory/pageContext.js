/**
 * Temporary page context for semantic matching (title, headings, viewport text).
 */

import { MAX_EMBED_CHARS } from "./embedConfig.js";

function clip(s, n) {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1);
}

/** Nearest heading above a node (or document). */
export function nearestHeading(fromNode = null) {
  try {
    const headings = [...document.querySelectorAll("h1, h2, h3")];
    if (!headings.length) return "";
    if (!fromNode) {
      return clip(headings[0].innerText || headings[0].textContent || "", 160);
    }
    const el =
      fromNode.nodeType === Node.ELEMENT_NODE
        ? fromNode
        : fromNode.parentElement;
    if (!el) return clip(headings[0].innerText || "", 160);

    let best = null;
    let bestDist = Infinity;
    const r0 = el.getBoundingClientRect();
    for (const h of headings) {
      const r = h.getBoundingClientRect();
      if (r.bottom > r0.top + 8) continue;
      const dist = r0.top - r.bottom;
      if (dist >= 0 && dist < bestDist) {
        bestDist = dist;
        best = h;
      }
    }
    const pick = best || headings[0];
    return clip(pick.innerText || pick.textContent || "", 160);
  } catch {
    return "";
  }
}

/**
 * Build a capped context blob for the current viewport / page.
 */
export function extractPageContext() {
  const title = clip(document.title || "", 200);
  const headings = [...document.querySelectorAll("h1, h2, h3")]
    .slice(0, 12)
    .map((h) => clip(h.innerText || h.textContent || "", 120))
    .filter(Boolean);

  let bodyText = "";
  try {
    const root =
      document.querySelector("main, article, [role='main']") || document.body;
    bodyText = clip(root?.innerText || "", 2800);
  } catch {
    bodyText = "";
  }

  // Prefer visible viewport slice when body is huge.
  let viewportText = "";
  try {
    const vh = window.innerHeight || 800;
    const nodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const parts = [];
    let n;
    let budget = 1200;
    while ((n = nodes.nextNode()) && budget > 0) {
      const t = (n.nodeValue || "").replace(/\s+/g, " ").trim();
      if (t.length < 20) continue;
      const el = n.parentElement;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      if (r.width < 2 || r.height < 2) continue;
      parts.push(t.slice(0, 200));
      budget -= t.length;
    }
    viewportText = clip(parts.join(" "), 1400);
  } catch {
    viewportText = "";
  }

  const blob = clip(
    [
      title,
      title,
      headings.join(" · "),
      headings.slice(0, 4).join(" · "),
      viewportText || bodyText,
    ]
      .filter(Boolean)
      .join("\n"),
    MAX_EMBED_CHARS,
  );

  return {
    title,
    headings,
    text: blob,
  };
}
