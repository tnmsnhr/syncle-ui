import React from "react";
import { createRoot } from "react-dom/client";
import OverlayApp from "./OverlayApp.jsx";
import overlayCss from "./overlay.css?inline";
import popupBubbleCss from "./components/popupBubble.css?inline";
import selectionToolbarCss from "./components/selectionToolbar.css?inline";
import memoryNudgeCss from "./components/memoryNudge.css?inline";

const extensionCss = `${overlayCss}\n${popupBubbleCss}\n${selectionToolbarCss}\n${memoryNudgeCss}`;

/**
 * Inject a Shadow DOM root to isolate styles from the host page.
 * Mount the React OverlayApp there; toolbar renders in light DOM so it stays visible.
 */
(function inject() {
  if (window.__DRAW_ON_WEB_MOUNTED__) return;
  window.__DRAW_ON_WEB_MOUNTED__ = true;

  const host = document.createElement("div");
  host.setAttribute("id", "draw-on-web-root-host");
  host.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100vh",
    "overflow:visible",
    "pointer-events:none",
    "z-index:2147483646",
  ].join(";");

  const overlayMount = document.createElement("div");
  overlayMount.id = "syncle-overlay-mount";
  overlayMount.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");

  const toolbarMount = document.createElement("div");
  toolbarMount.id = "syncle-toolbar-mount";
  toolbarMount.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");

  const pageStyle = document.createElement("style");
  pageStyle.id = "syncle-page-styles";
  pageStyle.textContent = extensionCss;

  document.documentElement.appendChild(host);
  document.documentElement.appendChild(overlayMount);
  document.documentElement.appendChild(toolbarMount);
  document.documentElement.appendChild(pageStyle);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = extensionCss;
  shadow.appendChild(style);

  const mount = document.createElement("div");
  mount.className = "draw-root";
  shadow.appendChild(mount);

  const root = createRoot(mount);
  root.render(
    <OverlayApp toolbarMount={overlayMount} toolbarControlsMount={toolbarMount} />
  );
})();
