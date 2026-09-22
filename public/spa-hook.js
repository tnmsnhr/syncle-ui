/* MAIN-world SPA hook — injected via chrome.runtime.getURL (CSP-safe). */
(() => {
  if (window.__syncleSpaHooked) return;
  window.__syncleSpaHooked = true;

  const fire = () => {
    try {
      window.postMessage(
        { type: "syncle:spa-nav", href: String(location.href) },
        "*",
      );
    } catch (_) {}
    try {
      window.dispatchEvent(
        new CustomEvent("syncle:locationchange", {
          detail: { href: String(location.href) },
        }),
      );
    } catch (_) {}
  };

  const wrap = (type) => {
    const orig = history[type];
    if (typeof orig !== "function") return;
    history[type] = function synclePatched() {
      const ret = orig.apply(this, arguments);
      queueMicrotask(fire);
      return ret;
    };
  };

  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", fire);
  window.addEventListener("hashchange", fire);
})();
