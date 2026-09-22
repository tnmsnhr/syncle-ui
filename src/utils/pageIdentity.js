/** Strip tracking params and normalize for exact page identity. */
const STRIP_QUERY =
  /^(utm_|fbclid|gclid|mc_|mkt_|ref|source|campaign|_ga)/i;

const DOC_SEGMENTS = new Set([
  "docs",
  "doc",
  "documentation",
  "guide",
  "guides",
  "api",
  "apis",
  "learn",
  "learning",
  "handbook",
  "manual",
  "reference",
  "tutorial",
  "tutorials",
  "help",
  "support",
  "wiki",
]);

function parseUrl(raw) {
  const fallback =
    typeof location !== "undefined" && location.href
      ? location.href
      : undefined;
  const input = raw || fallback || "";
  try {
    return new URL(input, fallback);
  } catch {
    try {
      return new URL(input);
    } catch {
      return null;
    }
  }
}

/** Normalize pathname: drop trailing slash; keep "/" only for site root. */
export function normalizePathname(pathname = "/") {
  let path = pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

/**
 * Exact page identity.
 * Root pages use `https://origin` (no trailing slash) so `/` and `` match.
 */
export function pageKeyFromUrl(raw = location.href) {
  const url = parseUrl(raw);
  if (!url) return String(raw || "").split("#")[0];

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (STRIP_QUERY.test(key)) params.delete(key);
  }
  const qs = params.toString();
  const path = normalizePathname(url.pathname);
  const pathPart = path === "/" ? "" : path;
  return `${url.origin}${pathPart}${qs ? `?${qs}` : ""}`;
}

/**
 * Same-docs / section family for related subpages.
 * Prefer origin + docs-like prefix; else origin + first path segment.
 * Site root (`/`) has familyKey === origin and is NOT used for related matching
 * (avoids “memory on /user showing on homepage”).
 */
export function familyKeyFromUrl(raw = location.href) {
  const url = parseUrl(raw);
  if (!url) return pageKeyFromUrl(raw);

  const parts = normalizePathname(url.pathname)
    .split("/")
    .filter(Boolean)
    .map((p) => p.toLowerCase());

  if (!parts.length) return url.origin;

  const docIdx = parts.findIndex((p) => DOC_SEGMENTS.has(p));
  if (docIdx >= 0) {
    const depth = Math.min(parts.length, docIdx + 1);
    return `${url.origin}/${parts.slice(0, depth).join("/")}`;
  }

  return `${url.origin}/${parts[0]}`;
}

/** True when familyKey is meaningful for related (not bare origin / site root). */
export function isRelatedFamilyKey(familyKey, origin) {
  if (!familyKey || !origin) return false;
  const fk = String(familyKey).replace(/\/$/, "");
  const o = String(origin).replace(/\/$/, "");
  if (!fk || !o || fk === o) return false;
  return fk.startsWith(`${o}/`);
}

export function currentPageIdentity(href = location.href) {
  const url = parseUrl(href) || parseUrl(location.href);
  const safeHref = href || location.href;
  return {
    url: String(safeHref).split("#")[0],
    origin: url?.origin || location.origin,
    pageKey: pageKeyFromUrl(safeHref),
    familyKey: familyKeyFromUrl(safeHref),
    title: document.title || "",
  };
}
