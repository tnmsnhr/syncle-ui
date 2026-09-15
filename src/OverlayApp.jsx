import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PopupBubble from "./components/PopupBubble.jsx";
import uid from "./utils/uid.js";
import { getViewportSize } from "./utils/viewport.js";
import { loadSettings, isDrawingEnabled } from "./utils/settings.js";
import {
  getLassoTheme,
  DEFAULT_LASSO_THEME_ID,
} from "./utils/lassoThemes.js";
import FloatingToolbar from "./components/FloatingToolbar.jsx";
import { isAiProductMode } from "./components/productModes.js";

const isHotkey = (e) => e.metaKey || e.ctrlKey;
const AI_DRAW_CURSOR =
  'url("data:image/svg+xml,%3Csvg xmlns%3D%27http%3A//www.w3.org/2000/svg%27 width%3D%2724%27 height%3D%2724%27 viewBox%3D%270 0 24 24%27%3E%3Ccircle cx%3D%279%27 cy%3D%279%27 r%3D%273%27 fill%3D%27none%27 stroke%3D%27%232563eb%27 stroke-width%3D%271.6%27/%3E%3Cpath d%3D%27M9 2v3M9 13v3M2 9h3M13 9h3%27 stroke%3D%27%232563eb%27 stroke-width%3D%271.6%27 stroke-linecap%3D%27round%27/%3E%3Cpath d%3D%27M17 4l.8 1.8L20 6.6l-2.2.8L17 9.2l-.8-1.8L14 6.6l2.2-.8z%27 fill%3D%27%23f59e0b%27/%3E%3Cpath d%3D%27M18 12l1 2.2 2.4.9-2.4.9-1 2.2-1-2.2-2.4-.9 2.4-.9z%27 fill%3D%27%23fde68a%27/%3E%3C/svg%3E") 9 9, crosshair';
const INTERACTIVE_OVERLAY_SELECTOR =
  ".popup-bubble, .syncle-floating-toolbar, #syncle-overlay-mount, #syncle-toolbar-mount";

const POPUP_Z_BASE = 2147483640;

export default function OverlayApp({ toolbarMount, toolbarControlsMount }) {
  const [hotkeyReady, setHotkeyReady] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [viewport, setViewport] = useState(getViewportSize());

  const drawingEnabledRef = useRef(true);
  const isDrawingRef = useRef(false);
  const lassoThemeRef = useRef(getLassoTheme(DEFAULT_LASSO_THEME_ID));
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const [productMode, setProductMode] = useState("ai");
  const productModeRef = useRef("ai");
  productModeRef.current = productMode;

  const [popups, setPopups] = useState([]);

  const liveCanvasRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const pointsRef = useRef([]);
  const polysRef = useRef([]);

  const liveCtx = () => liveCanvasRef.current?.getContext("2d");
  const inkCtx = () => inkCanvasRef.current?.getContext("2d");

  const redrawInk = () => {
    const ctx = inkCtx();
    if (!ctx) return;
    const { width, height } = viewportRef.current;
    ctx.clearRect(0, 0, width, height);
    const colors = lassoThemeRef.current;
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.border;
    ctx.fillStyle = colors.fill;

    for (const poly of polysRef.current) {
      const clientPts = poly.clientPts;
      if (!clientPts || clientPts.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(clientPts[0].x, clientPts[0].y);
      for (let i = 1; i < clientPts.length; i++) {
        ctx.lineTo(clientPts[i].x, clientPts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawLive = () => {
    const ctx = liveCtx();
    if (!ctx) return;
    const { width, height } = viewportRef.current;
    ctx.clearRect(0, 0, width, height);
    const pts = pointsRef.current;
    if (pts.length < 1) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].clientX, pts[0].clientY);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].clientX, pts[i].clientY);
    }
    if (pts.length > 1) {
      ctx.lineTo(pts[0].clientX, pts[0].clientY);
    }

    ctx.strokeStyle = lassoThemeRef.current.border;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const resizeCanvases = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = getViewportSize();
    setViewport({ width, height });

    for (const c of [liveCanvasRef.current, inkCanvasRef.current]) {
      if (!c) continue;
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
      c.width = Math.ceil(width * dpr);
      c.height = Math.ceil(height * dpr);
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
    }

    liveCtx()?.clearRect(0, 0, width, height);
    redrawInk();
  };

  const cancelLive = () => {
    isDrawingRef.current = false;
    pointsRef.current = [];
    const { width, height } = viewportRef.current;
    liveCtx()?.clearRect(0, 0, width, height);
  };

  useEffect(() => {
    resizeCanvases();
    const ro = new ResizeObserver(resizeCanvases);
    ro.observe(document.documentElement);

    const onWinResize = () => {
      if (onWinResize._r) cancelAnimationFrame(onWinResize._r);
      onWinResize._r = requestAnimationFrame(resizeCanvases);
    };

    window.addEventListener("resize", onWinResize, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onWinResize, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onWinResize);
      vv?.removeEventListener("resize", onWinResize);
      if (onWinResize._r) cancelAnimationFrame(onWinResize._r);
    };
  }, []);

  useEffect(() => {
    loadSettings().then((s) => {
      const on = isDrawingEnabled(s);
      drawingEnabledRef.current = on;
      setDrawingEnabled(on);
      lassoThemeRef.current = getLassoTheme(s.lassoTheme);
      redrawInk();
    });

    const onStorageChange = (changes, area) => {
      if (area !== "sync") return;

      if (changes.enabled !== undefined) {
        const on = changes.enabled.newValue !== false;
        drawingEnabledRef.current = on;
        setDrawingEnabled(on);
        if (!on) {
          cancelLive();
          setHotkeyReady(false);
        }
      }

      if (changes.lassoTheme !== undefined) {
        lassoThemeRef.current = getLassoTheme(changes.lassoTheme.newValue);
        redrawInk();
        if (isDrawingRef.current) drawLive();
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (!drawingEnabledRef.current) return;
      setHotkeyReady(isHotkey(e));
    };
    const up = () => setHotkeyReady(false);
    window.addEventListener("keydown", down, { capture: true });
    window.addEventListener("keyup", up, { capture: true });
    window.addEventListener("blur", up, { capture: true });
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState !== "visible") up();
      },
      { capture: true }
    );
    return () => {
      window.removeEventListener("keydown", down, { capture: true });
      window.removeEventListener("keyup", up, { capture: true });
      window.removeEventListener("blur", up, { capture: true });
    };
  }, []);

  useEffect(() => {
    const shouldShowDrawCursor =
      drawingEnabled && isAiProductMode(productMode) && hotkeyReady;
    if (!shouldShowDrawCursor) return;

    const rootStyle = document.documentElement.style;
    const bodyStyle = document.body?.style;
    const prevRootCursor = rootStyle.getPropertyValue("cursor");
    const prevRootPriority = rootStyle.getPropertyPriority("cursor");
    const prevBodyCursor = bodyStyle?.getPropertyValue("cursor") ?? "";
    const prevBodyPriority = bodyStyle?.getPropertyPriority("cursor") ?? "";

    rootStyle.setProperty("cursor", AI_DRAW_CURSOR, "important");
    bodyStyle?.setProperty("cursor", AI_DRAW_CURSOR, "important");

    return () => {
      if (prevRootCursor) {
        rootStyle.setProperty("cursor", prevRootCursor, prevRootPriority);
      } else {
        rootStyle.removeProperty("cursor");
      }

      if (!bodyStyle) return;
      if (prevBodyCursor) {
        bodyStyle.setProperty("cursor", prevBodyCursor, prevBodyPriority);
      } else {
        bodyStyle.removeProperty("cursor");
      }
    };
  }, [drawingEnabled, hotkeyReady, productMode]);

  useEffect(() => {
    const finishCommit = () => {
      const points = pointsRef.current;
      isDrawingRef.current = false;
      pointsRef.current = [];

      if (points.length >= 3) {
        const id = uid();
        const clientPts = points.map((p) => ({
          x: p.clientX,
          y: p.clientY,
        }));

        polysRef.current.push({ id, clientPts });
        redrawInk();

        const view = viewportRef.current;
        const { x, y } = placePopupPosition(bboxOf(clientPts), view);
        setPopups((prev) => [...prev, { id, x, y }]);
      }

      const { width, height } = viewportRef.current;
      liveCtx()?.clearRect(0, 0, width, height);
    };

    const start = (e) => {
      if (!(e instanceof PointerEvent)) return;
      if (!drawingEnabledRef.current) return;
      if (!isAiProductMode(productModeRef.current)) return;
      if (
        e.target instanceof Element &&
        e.target.closest(INTERACTIVE_OVERLAY_SELECTOR)
      ) {
        return;
      }
      if (!isHotkey(e)) return;
      if (e.button !== 0) return;
      isDrawingRef.current = true;
      pointsRef.current = [
        {
          clientX: e.clientX,
          clientY: e.clientY,
        },
      ];
      drawLive();
      e.preventDefault();
    };

    const move = (e) => {
      if (!isDrawingRef.current) return;
      if (!isHotkey(e)) return finishCommit();
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      if (
        (e.clientX - last.clientX) ** 2 + (e.clientY - last.clientY) ** 2 <
        2
      ) {
        return;
      }
      pts.push({
        clientX: e.clientX,
        clientY: e.clientY,
      });
      drawLive();
      e.preventDefault();
    };

    const end = (e) => {
      if (!isDrawingRef.current) return;
      if (e.type === "pointerup" && e.button !== 0) return;
      finishCommit();
      e.preventDefault();
    };

    const esc = (e) => {
      if (e.key !== "Escape") return;
      if (!isDrawingRef.current) return;
      cancelLive();
    };

    window.addEventListener("pointerdown", start, { capture: true });
    window.addEventListener("pointermove", move, { capture: true });
    window.addEventListener("pointerup", end, { capture: true });
    window.addEventListener("pointercancel", end, { capture: true });
    window.addEventListener("keydown", esc, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", start, { capture: true });
      window.removeEventListener("pointermove", move, { capture: true });
      window.removeEventListener("pointerup", end, { capture: true });
      window.removeEventListener("pointercancel", end, { capture: true });
      window.removeEventListener("keydown", esc, { capture: true });
    };
  }, []);

  const undo = () => {
    const last = polysRef.current.pop();
    if (last) {
      setPopups((prev) => prev.filter((p) => p.id !== last.id));
      redrawInk();
    }
  };

  const clearAll = () => {
    polysRef.current.length = 0;
    setPopups([]);
    redrawInk();
  };

  const popupNodes = popups.map((p, stackIndex) => {
    const poly = polysRef.current.find((poly) => poly.id === p.id);
    if (!poly) return null;

    const node = (
      <PopupBubble
        key={p.id}
        x={p.x}
        y={p.y}
        zIndex={POPUP_Z_BASE + stackIndex}
      />
    );

    return toolbarMount ? createPortal(node, toolbarMount) : node;
  });

  const handleProductModeChange = (mode) => {
    setProductMode(mode);
    if (!isAiProductMode(mode)) {
      cancelLive();
      setHotkeyReady(false);
    }
  };

  const toolbar = (
    <FloatingToolbar
      productMode={productMode}
      onProductModeChange={handleProductModeChange}
      drawingEnabled={drawingEnabled && isAiProductMode(productMode)}
      hotkeyReady={hotkeyReady && isAiProductMode(productMode)}
      onUndo={undo}
      onClear={clearAll}
      viewport={viewport}
    />
  );

  return (
    <div
      className="draw-root"
      style={{
        position: "fixed",
        inset: 0,
        width: viewport.width,
        height: viewport.height,
        pointerEvents: "none",
      }}
    >
      <canvas
        ref={inkCanvasRef}
        className="draw-canvas-wrap"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      />
      <canvas
        ref={liveCanvasRef}
        className="draw-canvas-wrap"
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      />

      {toolbarControlsMount
        ? createPortal(toolbar, toolbarControlsMount)
        : toolbarMount
          ? createPortal(toolbar, toolbarMount)
          : toolbar}

      {popupNodes}
    </div>
  );
}

function bboxOf(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function placePopupPosition(clientBox, view) {
  const margin = 8;
  const estW = 260;
  const estH = 160;

  let x = clientBox.maxX + margin;
  let y = clientBox.minY;

  if (x + estW > view.width) {
    x = Math.max(margin, clientBox.minX - estW - margin);
  }
  if (y + estH > view.height) {
    y = Math.max(margin, view.height - estH - margin);
  }
  if (y < margin) y = margin;

  return { x, y };
}
