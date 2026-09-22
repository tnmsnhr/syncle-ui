/** Shared isolation CSS injected into every Syncle shadow root. */
export const SYNCLE_ISOLATION_CSS = `
:host {
  /* Cut off inherited page styles (fonts, color, line-height, etc.). */
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  font-style: normal !important;
  line-height: 1.4 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  text-transform: none !important;
  text-indent: 0 !important;
  text-decoration: none !important;
  text-shadow: none !important;
  text-align: left !important;
  color: #1c1c1e !important;
  -webkit-text-fill-color: currentColor !important;
  background: transparent !important;
  border: none !important;
  margin: 0 !important;
  padding: 0 !important;
  direction: ltr !important;
  writing-mode: horizontal-tb !important;
  white-space: normal !important;
  list-style: none !important;
  box-sizing: border-box !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:host *,
:host *::before,
:host *::after {
  box-sizing: border-box;
}

.syncle-shadow-mount {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: visible !important;
  pointer-events: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  font: inherit !important;
  color: inherit !important;
  line-height: inherit !important;
}
`.trim();

const HOST_STYLE = {
  position: "fixed",
  inset: "0",
  width: "100vw",
  height: "100vh",
  overflow: "visible",
  "pointer-events": "none",
  margin: "0",
  padding: "0",
  border: "none",
  background: "transparent",
  transform: "none",
  filter: "none",
  "clip-path": "none",
  contain: "none",
  isolation: "auto",
};

/**
 * Create a fixed overlay host with an open Shadow DOM so page CSS cannot
 * restyle Syncle UI (and Syncle CSS cannot leak onto the page).
 * Returns `{ host, mount }` — portal React into `mount`.
 */
export function createIsolatedMount({ id, css = "", zIndex = 2147483647 }) {
  const host = document.createElement("div");
  host.id = id;
  host.setAttribute("data-syncle-root", "");

  for (const [prop, value] of Object.entries(HOST_STYLE)) {
    host.style.setProperty(prop, value, "important");
  }
  host.style.setProperty("z-index", String(zIndex), "important");

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `${SYNCLE_ISOLATION_CSS}\n${css}`;
  shadow.appendChild(style);

  const mount = document.createElement("div");
  mount.className = "syncle-shadow-mount";
  shadow.appendChild(mount);

  return { host, shadow, mount };
}

/** True if an element is Syncle UI (including inside our shadow roots). */
export function isSyncleElement(el) {
  if (!(el instanceof Element)) return false;
  if (el.closest?.("[data-syncle-root], .syncle-shadow-mount")) return true;
  if (
    el.closest?.(
      ".popup-bubble, .syncle-floating-toolbar, .syncle-selection-toolbar, .syncle-memory-nudge, .syncle-draw-cursor, #draw-on-web-root-host, #syncle-overlay-mount, #syncle-toolbar-mount",
    )
  ) {
    return true;
  }
  const root = el.getRootNode?.();
  if (root instanceof ShadowRoot) {
    const host = root.host;
    if (host?.hasAttribute?.("data-syncle-root")) return true;
    if (
      host?.id === "draw-on-web-root-host" ||
      host?.id === "syncle-overlay-mount" ||
      host?.id === "syncle-toolbar-mount"
    ) {
      return true;
    }
  }
  return false;
}
