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

export function pageKeyFromUrl(raw = location.href) {
  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return String(raw || "").split("#")[0];
  }

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (STRIP_QUERY.test(key)) params.delete(key);
  }
  const qs = params.toString();
  let path = url.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return `${url.origin}${path}${qs ? `?${qs}` : ""}`;
}

/**
 * Same-docs / section family for related subpages.
 * Prefer origin + docs-like prefix; else origin + first path segment.
 */
export function familyKeyFromUrl(raw = location.href) {
  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return pageKeyFromUrl(raw);
  }

  const parts = (url.pathname || "/")
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

export function currentPageIdentity() {
  const href = location.href;
  return {
    url: href.split("#")[0],
    origin: location.origin,
    pageKey: pageKeyFromUrl(href),
    familyKey: familyKeyFromUrl(href),
    title: document.title || "",
  };
}

/** Watch SPA navigations; callback when pageKey changes. */
export function onPageKeyChange(callback) {
  let last = pageKeyFromUrl();
  const check = () => {
    const next = pageKeyFromUrl();
    if (next === last) return;
    last = next;
    callback(next);
  };

  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  const iv = window.setInterval(check, 1200);

  const wrap = (fn) =>
    function patched(...args) {
      const ret = fn.apply(this, args);
      queueMicrotask(check);
      return ret;
    };
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = wrap(origPush);
  history.replaceState = wrap(origReplace);

  return () => {
    window.removeEventListener("popstate", check);
    window.removeEventListener("hashchange", check);
    window.clearInterval(iv);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}
