import React from "react";
import { createRoot } from "react-dom/client";
import OverlayApp from "./OverlayApp.jsx";
import overlayCss from "./overlay.css?inline";
import popupBubbleCss from "./components/popupBubble.css?inline";
import selectionToolbarCss from "./components/selectionToolbar.css?inline";
import memoryNudgeCss from "./components/memoryNudge.css?inline";
import { installMainWorldSpaHook } from "./utils/spaNavigation.js";
import {
  createIsolatedMount,
} from "./utils/isolatedMount.js";

const extensionCss = `${overlayCss}\n${popupBubbleCss}\n${selectionToolbarCss}\n${memoryNudgeCss}`;

/**
 * Shadow-isolated overlay + light-portal mounts so host page CSS cannot
 * restyle Syncle UI (and Syncle rules never sit on document).
 */
(function inject() {
  installMainWorldSpaHook();

  const existingHost = document.getElementById("draw-on-web-root-host");
  const existingOverlay = document.getElementById("syncle-overlay-mount");
  const existingToolbar = document.getElementById("syncle-toolbar-mount");
  const mountsAlive =
    existingHost?.isConnected &&
    existingOverlay?.isConnected &&
    existingToolbar?.isConnected;

  if (window.__DRAW_ON_WEB_MOUNTED__ && mountsAlive) return;

  if (existingHost) existingHost.remove();
  if (existingOverlay) existingOverlay.remove();
  if (existingToolbar) existingToolbar.remove();
  document.getElementById("syncle-page-styles")?.remove();

  window.__DRAW_ON_WEB_MOUNTED__ = true;

  // Drawing canvases + draw cursor (already shadow-isolated).
  const canvas = createIsolatedMount({
    id: "draw-on-web-root-host",
    css: extensionCss,
    zIndex: 2147483646,
  });

  // Popups portal here.
  const overlay = createIsolatedMount({
    id: "syncle-overlay-mount",
    css: extensionCss,
    zIndex: 2147483647,
  });

  // Floating toolbar + selection toolbar portal here.
  const toolbar = createIsolatedMount({
    id: "syncle-toolbar-mount",
    css: extensionCss,
    zIndex: 2147483647,
  });

  document.documentElement.appendChild(canvas.host);
  document.documentElement.appendChild(overlay.host);
  document.documentElement.appendChild(toolbar.host);

  const root = createRoot(canvas.mount);
  root.render(
    <OverlayApp
      toolbarMount={overlay.mount}
      toolbarControlsMount={toolbar.mount}
    />,
  );
})();
