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

const BOILER =
  "nav, footer, aside, [role='navigation'], [role='contentinfo'], [role='complementary']";

function isBoilerplate(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest(BOILER)) return true;
  const bad =
    /^(cookie|cookies|newsletter|subscribe|related|sidebar|share|shares|breadcrumb|promo|advert|ads)$/;
  let node = el;
  for (let i = 0; node && i < 6; i++) {
    const raw = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""}`;
    const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some((t) => bad.test(t))) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Title plus each heading with the paragraph under it.
 * Boilerplate (nav, related rails, cookies) is left out.
 */
export function extractPageChunks() {
  const title = clip(document.title || "", 200);
  const chunks = [];
  if (title) chunks.push({ role: "title", text: title });

  let root = document.body;
  try {
    root =
      document.querySelector("article, main, [role='main']") || document.body;
  } catch {
    root = document.body;
  }

  const headings = [...root.querySelectorAll("h1, h2, h3")]
    .filter((h) => !isBoilerplate(h))
    .slice(0, 8);

  for (const headingEl of headings) {
    const heading = clip(headingEl.innerText || headingEl.textContent || "", 140);
    if (!heading) continue;
    let para = "";
    let node = headingEl.nextElementSibling;
    let hops = 0;
    while (node && hops < 5 && !/^H[1-3]$/.test(node.tagName)) {
      if (!isBoilerplate(node)) {
        const bit = clip(node.innerText || node.textContent || "", 420);
        if (bit.length > 40) {
          para = bit;
          break;
        }
      }
      node = node.nextElementSibling;
      hops += 1;
    }
    const text = clip([heading, para].filter(Boolean).join(". "), 520);
    if (text.length > 12) chunks.push({ role: "section", text });
  }

  if (chunks.length < 2) {
    try {
      const fallback = clip(root?.innerText || "", 800);
      if (fallback) chunks.push({ role: "body", text: fallback });
    } catch {
      /* ignore */
    }
  }

  return {
    title,
    chunks: chunks.slice(0, 8),
    text: clip(
      chunks.map((c) => c.text).join("\n"),
      MAX_EMBED_CHARS,
    ),
  };
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
