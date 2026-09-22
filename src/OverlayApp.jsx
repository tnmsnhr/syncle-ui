import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import PopupBubble from "./components/PopupBubble.jsx";
import uid from "./utils/uid.js";
import { getViewportSize } from "./utils/viewport.js";
import { bboxOf, centroidOf } from "./utils/bboxOf.js";
import { placePopupPosition } from "./utils/placePopupPosition.js";
import {
  clientToPage,
  onPageScroll,
  pageToClient,
  resolveScrollParentsFromPoint,
  resolveScrollParentsFromNode,
} from "./utils/pageCoords.js";
import { isSyncleElement } from "./utils/isolatedMount.js";
import { loadSettings, isDrawingEnabled, resolvePanelTheme } from "./utils/settings.js";
import {
  getLassoTheme,
  DEFAULT_LASSO_THEME_ID,
} from "./utils/lassoThemes.js";
import FloatingToolbar from "./components/FloatingToolbar.jsx";
import SelectionToolbar from "./components/SelectionToolbar.jsx";
import { isAiProductMode } from "./components/productModes.js";
import {
  subscribeMediaFullscreen,
  setOverlayHostsHidden,
} from "./utils/mediaFullscreen.js";
import {
  readPageSelection,
  placeSelectionToolbar,
  applyTextHighlight,
  removeTextHighlight,
  clearAllTextHighlights,
  clearNativeSelection,
  highlightFill,
} from "./utils/textSelection.js";
import {
  saveCapture,
  appendMemoryMessage,
  deleteCapture,
  clearCapturesForPage,
  getNudgePayload,
  currentPageIdentity,
  buildTextAnchor,
  buildLassoAnchor,
  onPageKeyChange,
  initSemanticMemory,
  getPageContextEmbedding,
  dismissSemanticForOriginToday,
} from "./memory/index.js";
import { loadExactRestores } from "./memory/restoreExact.js";
import { PAGE_CONTEXT_IDLE_MS } from "./memory/embedConfig.js";
import { clearAllLassoTargetMarks, clearLassoTargetMarks } from "./utils/lassoAnchors.js";
import { memoryMessage } from "./utils/normalizeMemory.js";
import pointerUrl from "./assets/svg/pointer.svg";

const isHotkey = (e) => e.metaKey || e.ctrlKey;
const INTERACTIVE_OVERLAY_SELECTOR =
  ".popup-bubble, .syncle-floating-toolbar, .syncle-selection-toolbar, .syncle-memory-nudge";

const POPUP_Z_BASE = 2147483640;

export default function OverlayApp({ toolbarMount, toolbarControlsMount }) {
  const [hotkeyReady, setHotkeyReady] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [viewport, setViewport] = useState(getViewportSize());

  const drawingEnabledRef = useRef(true);
  const isDrawingRef = useRef(false);
  const mediaFullscreenRef = useRef(false);
  const [lassoTheme, setLassoTheme] = useState(
    getLassoTheme(DEFAULT_LASSO_THEME_ID)
  );
  const [panelTheme, setPanelTheme] = useState(resolvePanelTheme("system"));
  const themePrefRef = useRef("system");
  const lassoThemeRef = useRef(lassoTheme);
  lassoThemeRef.current = lassoTheme;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const [productMode, setProductMode] = useState("ai");
  const productModeRef = useRef("ai");
  productModeRef.current = productMode;

  const [popups, setPopups] = useState([]);
  const [selectionUi, setSelectionUi] = useState(null);
  const [nudge, setNudge] = useState(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const pendingSelRef = useRef(null);
  const textHighlightsRef = useRef(new Map());
  const dismissedPageKeysRef = useRef(new Set());
  /** Suppress nudge for the rest of this page visit after first create. */
  const suppressNudgeThisVisitRef = useRef(false);
  const nudgeActiveRef = useRef(false);
  const persistCaptureRef = useRef(async () => {});
  const refreshNudgeRef = useRef(async () => {});
  const redrawInkRef = useRef(() => {});

  const liveCanvasRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const pointsRef = useRef([]);
  const polysRef = useRef([]);
  const drawScrollParentsRef = useRef([]);
  const captureHrefRef = useRef(location.href);
  const drawCursorRef = useRef(null);
  const pointerClientRef = useRef({ x: 0, y: 0 });

  const liveCtx = () => liveCanvasRef.current?.getContext("2d");
  const inkCtx = () => inkCanvasRef.current?.getContext("2d");
  const showDrawCursor =
    drawingEnabled && isAiProductMode(productMode) && hotkeyReady;

  const placeDrawCursor = (x, y) => {
    const el = drawCursorRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

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
      const pagePts = poly.pagePts;
      const parents = poly.scrollParents || [];
      if (!pagePts || pagePts.length < 2) continue;

      const first = pageToClient(pagePts[0].x, pagePts[0].y, parents);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < pagePts.length; i++) {
        const pt = pageToClient(pagePts[i].x, pagePts[i].y, parents);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    for (const { range, border } of textHighlightsRef.current.values()) {
      let rects;
      try {
        if (!range || range.collapsed) continue;
        rects = range.getClientRects();
      } catch {
        continue;
      }
      ctx.strokeStyle = border;
      for (const r of rects) {
        if (r.width < 1 || r.height < 1) continue;
        const x = r.left - 1.5;
        const y = r.top - 1.5;
        const w = r.width + 3;
        const h = r.height + 3;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, w, h, 3);
        } else {
          ctx.rect(x, y, w, h);
        }
        ctx.stroke();
      }
    }
  };
  redrawInkRef.current = redrawInk;

  const drawLive = () => {
    const ctx = liveCtx();
    if (!ctx) return;
    const { width, height } = viewportRef.current;
    ctx.clearRect(0, 0, width, height);
    const pts = pointsRef.current;
    if (pts.length < 1) return;
    const parents = drawScrollParentsRef.current;

    const first = pageToClient(pts[0].x, pts[0].y, parents);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length; i++) {
      const pt = pageToClient(pts[i].x, pts[i].y, parents);
      ctx.lineTo(pt.x, pt.y);
    }
    if (pts.length > 1) {
      ctx.lineTo(first.x, first.y);
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

    const stopScroll = onPageScroll(() => {
      redrawInk();
      if (isDrawingRef.current) drawLive();
    });

    return () => {
      ro.disconnect();
      stopScroll();
      window.removeEventListener("resize", onWinResize);
      vv?.removeEventListener("resize", onWinResize);
      if (onWinResize._r) cancelAnimationFrame(onWinResize._r);
    };
  }, []);

  useEffect(() => {
    return subscribeMediaFullscreen((hidden) => {
      mediaFullscreenRef.current = hidden;
      setOverlayHostsHidden(hidden);
      if (hidden) cancelLive();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSettings().then((s) => {
      const on = isDrawingEnabled(s);
      drawingEnabledRef.current = on;
      setDrawingEnabled(on);
      themePrefRef.current = s.theme || "system";
      setPanelTheme(resolvePanelTheme(themePrefRef.current));
      const theme = getLassoTheme(s.lassoTheme);
      lassoThemeRef.current = theme;
      setLassoTheme(theme);
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

      if (changes.theme !== undefined) {
        themePrefRef.current = changes.theme.newValue || "system";
        setPanelTheme(resolvePanelTheme(themePrefRef.current));
      }

      if (changes.lassoTheme !== undefined) {
        const theme = getLassoTheme(changes.lassoTheme.newValue);
        lassoThemeRef.current = theme;
        setLassoTheme(theme);
        redrawInk();
        if (isDrawingRef.current) drawLive();
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      if (themePrefRef.current === "system") {
        setPanelTheme(resolvePanelTheme("system"));
      }
    };
    mq.addEventListener("change", onScheme);
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChange);
      mq.removeEventListener("change", onScheme);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const showFromSelection = (e) => {
      if (mediaFullscreenRef.current) return;
      if (!drawingEnabledRef.current) return;
      if (isDrawingRef.current) return;
      if (
        e.target instanceof Element &&
        (e.target.closest(".syncle-selection-toolbar, .popup-bubble") ||
          isSyncleElement(e.target))
      ) {
        return;
      }

      const next = readPageSelection();
      if (!next) {
        pendingSelRef.current = null;
        setSelectionUi(null);
        return;
      }

      pendingSelRef.current = { ...next, href: location.href };
      captureHrefRef.current = location.href;
      const placed = placeSelectionToolbar(next.box, viewportRef.current);
      const parents = resolveScrollParentsFromNode(
        next.range.commonAncestorContainer,
      );
      const page = clientToPage(placed.x, placed.y, parents);
      setSelectionUi({
        pageX: page.x,
        pageY: page.y,
        scrollParents: parents,
      });
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        pendingSelRef.current = null;
        setSelectionUi(null);
      }
    };

    document.addEventListener("mouseup", showFromSelection, true);
    document.addEventListener("keyup", showFromSelection, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mouseup", showFromSelection, true);
      document.removeEventListener("keyup", showFromSelection, true);
      window.removeEventListener("keydown", onKey, true);
    };
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
    const track = (e) => {
      pointerClientRef.current = { x: e.clientX, y: e.clientY };
      placeDrawCursor(e.clientX, e.clientY);
    };
    window.addEventListener("pointermove", track, { capture: true });
    return () =>
      window.removeEventListener("pointermove", track, { capture: true });
  }, []);

  useEffect(() => {
    if (!showDrawCursor) return;

    const { x, y } = pointerClientRef.current;
    placeDrawCursor(x, y);

    const rootStyle = document.documentElement.style;
    const bodyStyle = document.body?.style;
    const prevRootCursor = rootStyle.getPropertyValue("cursor");
    const prevRootPriority = rootStyle.getPropertyPriority("cursor");
    const prevBodyCursor = bodyStyle?.getPropertyValue("cursor") ?? "";
    const prevBodyPriority = bodyStyle?.getPropertyPriority("cursor") ?? "";

    rootStyle.setProperty("cursor", "none", "important");
    bodyStyle?.setProperty("cursor", "none", "important");

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
  }, [showDrawCursor]);

  const refreshNudge = async ({ fromVisit = false } = {}) => {
    try {
      const payload = await getNudgePayload();
      if (dismissedPageKeysRef.current.has(payload.pageKey)) {
        nudgeActiveRef.current = false;
        setNudge(null);
        return;
      }
      if (payload.exactCount + payload.relatedCount + (payload.semanticCount || 0) < 1) {
        nudgeActiveRef.current = false;
        setNudge(null);
        return;
      }
      // Creating on this visit must not surface the revisit nudge.
      if (suppressNudgeThisVisitRef.current) {
        nudgeActiveRef.current = false;
        setNudge(null);
        return;
      }
      // Start only on visit/load; allow updates if already showing.
      if (!fromVisit && !nudgeActiveRef.current) return;
      nudgeActiveRef.current = true;
      setNudge(payload);
    } catch (err) {
      console.warn("[syncle] nudge load failed", err);
    }
  };
  refreshNudgeRef.current = refreshNudge;

  const persistCapture = async (opts) => {
    try {
      await saveCapture(opts);
      suppressNudgeThisVisitRef.current = true;
      nudgeActiveRef.current = false;
      setNudge(null);
      setNudgeOpen(false);
    } catch (err) {
      console.warn("[syncle] memory save failed", err);
    }
  };
  persistCaptureRef.current = persistCapture;

  const restoreExactOnPage = async () => {
    try {
      const { textRestores, lassoRestores } = await loadExactRestores();
      const existing = new Set([
        ...popups.map((p) => p.id),
        ...polysRef.current.map((p) => p.id),
        ...textHighlightsRef.current.keys(),
      ]);

      const nextPopups = [];

      for (const item of textRestores) {
        if (existing.has(item.id)) continue;
        const fill = highlightFill(item.theme);
        applyTextHighlight(item.id, item.range, fill);
        textHighlightsRef.current.set(item.id, {
          range: item.range,
          border: item.theme.border,
        });
        nextPopups.push({
          id: item.id,
          kind: "text",
          mode: item.mode,
          text: item.quote,
          pageX: item.pageX,
          pageY: item.pageY,
          centroidPageX: item.centroidPage.x,
          centroidPageY: item.centroidPage.y,
          scrollParents: item.scrollParents,
          messages: item.messages,
          startCollapsed: true,
          restored: true,
        });
      }

      for (const item of lassoRestores) {
        if (existing.has(item.id)) continue;
        nextPopups.push({
          id: item.id,
          kind: item.kind === "text-fallback" ? "text" : "lasso",
          mode: item.mode,
          text: item.quote,
          pageX: item.pageX,
          pageY: item.pageY,
          centroidPageX: item.centroidPage.x,
          centroidPageY: item.centroidPage.y,
          scrollParents: item.scrollParents,
          messages: item.messages,
          startCollapsed: true,
          centroidOnly: true,
          restored: true,
          weak: item.weak,
        });
      }

      if (nextPopups.length) {
        setPopups((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...nextPopups.filter((p) => !ids.has(p.id))];
        });
      }
      redrawInkRef.current();
      setNudgeOpen(false);
    } catch (err) {
      console.warn("[syncle] restoreExact failed", err);
    }
  };

  const clearVisualCaptures = () => {
    polysRef.current.length = 0;
    textHighlightsRef.current.clear();
    clearAllTextHighlights();
    clearAllLassoTargetMarks();
    setPopups([]);
    pendingSelRef.current = null;
    setSelectionUi(null);
    redrawInkRef.current();
  };

  useEffect(() => {
    suppressNudgeThisVisitRef.current = false;
    nudgeActiveRef.current = false;
    initSemanticMemory(() => {
      void getPageContextEmbedding(location.href, { force: true }).then(() => {
        void refreshNudgeRef.current({ fromVisit: true });
      });
    });
    void refreshNudge({ fromVisit: true });

    let idleTimer = 0;
    let stopPageKey = null;
    const warmContext = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        void getPageContextEmbedding(location.href).then(() => {
          void refreshNudgeRef.current({ fromVisit: true });
        });
      }, PAGE_CONTEXT_IDLE_MS);
    };
    warmContext();

    stopPageKey = onPageKeyChange((nextPageKey) => {
      clearVisualCaptures();
      setNudgeOpen(false);
      suppressNudgeThisVisitRef.current = false;
      nudgeActiveRef.current = false;
      dismissedPageKeysRef.current.delete(nextPageKey);
      warmContext();
      requestAnimationFrame(() => {
        void refreshNudgeRef.current({ fromVisit: true });
      });
    });

    return () => {
      window.clearTimeout(idleTimer);
      stopPageKey?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const finishCommit = () => {
      const points = pointsRef.current;
      isDrawingRef.current = false;
      pointsRef.current = [];

      if (points.length >= 3) {
        const id = uid();
        const parents = drawScrollParentsRef.current;
        const pagePts = points.map((p) => ({ x: p.x, y: p.y }));
        const clientPts = pagePts.map((p) =>
          pageToClient(p.x, p.y, parents),
        );

        polysRef.current.push({
          id,
          pagePts,
          scrollParents: parents,
          lassoAnchor: null,
        });
        redrawInk();

        const view = viewportRef.current;
        const placed = placePopupPosition(bboxOf(clientPts), view);
        const pagePos = clientToPage(placed.x, placed.y, parents);
        const centroid = centroidOf(pagePts);
        const lassoAnchor = buildLassoAnchor(pagePts, parents);
        if (lassoAnchor) {
          const poly = polysRef.current.find((p) => p.id === id);
          if (poly) poly.lassoAnchor = lassoAnchor;
        }

        setPopups((prev) => [
          ...prev,
          {
            id,
            mode: "ask",
            pageX: pagePos.x,
            pageY: pagePos.y,
            centroidPageX: centroid.x,
            centroidPageY: centroid.y,
            scrollParents: parents,
            messages: [],
            lassoAnchor,
          },
        ]);

        void persistCaptureRef.current({
          id,
          kind: "lasso",
          mode: "ask",
          quote: lassoAnchor?.primaryQuote || "",
          pagePts,
          lassoAnchor,
          bboxPage: bboxOf(pagePts),
          centroidPage: { x: centroid.x, y: centroid.y },
          popup: { pageX: pagePos.x, pageY: pagePos.y },
          themeId: lassoThemeRef.current?.id,
          messages: [],
          href: captureHrefRef.current || location.href,
        });
      }

      const { width, height } = viewportRef.current;
      liveCtx()?.clearRect(0, 0, width, height);
    };

    const start = (e) => {
      if (!(e instanceof PointerEvent)) return;
      if (mediaFullscreenRef.current) return;
      if (!drawingEnabledRef.current) return;
      if (!isAiProductMode(productModeRef.current)) return;
      if (
        e.target instanceof Element &&
        (e.target.closest(INTERACTIVE_OVERLAY_SELECTOR) ||
          isSyncleElement(e.target))
      ) {
        return;
      }
      if (!isHotkey(e)) return;
      if (e.button !== 0) return;
      pendingSelRef.current = null;
      setSelectionUi(null);
      isDrawingRef.current = true;
      captureHrefRef.current = location.href;
      drawScrollParentsRef.current = resolveScrollParentsFromPoint(
        e.clientX,
        e.clientY,
      );
      pointsRef.current = [
        clientToPage(e.clientX, e.clientY, drawScrollParentsRef.current),
      ];
      drawLive();
      e.preventDefault();
    };

    const move = (e) => {
      if (!isDrawingRef.current) return;
      if (!isHotkey(e)) return finishCommit();
      const pts = pointsRef.current;
      const parents = drawScrollParentsRef.current;
      const last = pageToClient(
        pts[pts.length - 1].x,
        pts[pts.length - 1].y,
        parents,
      );
      if ((e.clientX - last.x) ** 2 + (e.clientY - last.y) ** 2 < 2) {
        return;
      }
      pts.push(clientToPage(e.clientX, e.clientY, parents));
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

  const commitTextSelection = (mode) => {
    const pending = pendingSelRef.current;
    if (!pending?.range) return;
    const id = uid();
    const fill = highlightFill(lassoThemeRef.current);
    const textAnchor = buildTextAnchor(pending.range);
    applyTextHighlight(id, pending.range, fill);
    textHighlightsRef.current.set(id, {
      range: pending.range,
      border: lassoThemeRef.current.border,
    });
    redrawInk();

    const parents = resolveScrollParentsFromNode(
      pending.range.commonAncestorContainer,
    );
    const view = viewportRef.current;
    const placed = placePopupPosition(pending.box, view);
    const pagePos = clientToPage(placed.x, placed.y, parents);
    const centroid = clientToPage(
      pending.box.minX + pending.box.w / 2,
      pending.box.minY + pending.box.h / 2,
      parents,
    );
    setPopups((prev) => [
      ...prev,
      {
        id,
        kind: "text",
        mode,
        text: pending.text,
        pageX: pagePos.x,
        pageY: pagePos.y,
        centroidPageX: centroid.x,
        centroidPageY: centroid.y,
        scrollParents: parents,
        messages: [],
      },
    ]);

    void persistCaptureRef.current({
      id,
      kind: "text",
      mode,
      quote: pending.text,
      textAnchor,
      bboxPage: {
        minX: pending.box.minX,
        minY: pending.box.minY,
        maxX: pending.box.maxX,
        maxY: pending.box.maxY,
      },
      centroidPage: { x: centroid.x, y: centroid.y },
      popup: { pageX: pagePos.x, pageY: pagePos.y },
      themeId: lassoThemeRef.current?.id,
      messages: [],
      href: pending.href || captureHrefRef.current || location.href,
    });

    pendingSelRef.current = null;
    setSelectionUi(null);
    clearNativeSelection();
  };

  const removeSelection = (id) => {
    polysRef.current = polysRef.current.filter((poly) => poly.id !== id);
    textHighlightsRef.current.delete(id);
    removeTextHighlight(id);
    clearLassoTargetMarks(id);
    setPopups((prev) => prev.filter((p) => p.id !== id));
    redrawInk();
    void deleteCapture(id).then(() => refreshNudgeRef.current()).catch((err) => {
      console.warn("[syncle] deleteCapture failed", err);
    });
  };

  const undo = () => {
    const lastPopup = popups[popups.length - 1];
    const lastPoly = polysRef.current[polysRef.current.length - 1];
    if (lastPopup?.kind === "text" || (!lastPoly && lastPopup)) {
      removeSelection(lastPopup.id);
      return;
    }
    const last = polysRef.current.pop();
    if (last) {
      setPopups((prev) => prev.filter((p) => p.id !== last.id));
      redrawInk();
      void deleteCapture(last.id).then(() => refreshNudgeRef.current()).catch((err) => {
        console.warn("[syncle] deleteCapture failed", err);
      });
    }
  };

  const clearAll = () => {
    polysRef.current.length = 0;
    textHighlightsRef.current.clear();
    clearAllTextHighlights();
    clearAllLassoTargetMarks();
    setPopups([]);
    pendingSelRef.current = null;
    setSelectionUi(null);
    redrawInk();
    nudgeActiveRef.current = false;
    setNudge(null);
    setNudgeOpen(false);

    void clearCapturesForPage()
      .then(() => refreshNudgeRef.current({ fromVisit: true }))
      .catch((err) => {
        console.warn("[syncle] clearCapturesForPage failed", err);
      });
  };

  const sendPopupMessage = (id, text) => {
    const msg = memoryMessage({ id: uid(), role: "user", text });
    setPopups((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, messages: [...(p.messages || []), msg] }
          : p,
      ),
    );
    void appendMemoryMessage(id, { role: "user", text }).catch((err) => {
      console.warn("[syncle] appendMemoryMessage failed", err);
    });
  };

  const popupNodes = popups.map((p, stackIndex) => {
    // Live lassos need a polygon; restored lassos are centroid-only.
    if (p.kind !== "text" && !p.centroidOnly) {
      const poly = polysRef.current.find((poly) => poly.id === p.id);
      if (!poly) return null;
    }

    const hl = textHighlightsRef.current.get(p.id);
    const node = (
      <PopupBubble
        pageX={p.pageX}
        pageY={p.pageY}
        centroidPageX={p.centroidPageX}
        centroidPageY={p.centroidPageY}
        scrollParents={p.scrollParents}
        anchorRange={p.kind === "text" ? hl?.range || null : null}
        dotColor={lassoTheme.border}
        colorScheme={panelTheme}
        zIndex={POPUP_Z_BASE + stackIndex}
        onDelete={() => removeSelection(p.id)}
        onAsk={(text) => sendPopupMessage(p.id, text)}
        mode={p.mode || "ask"}
        messages={p.messages || []}
        startCollapsed={Boolean(p.startCollapsed)}
        strongPulse={Boolean(p.centroidOnly)}
      >
        {p.text ? (
          <p className="popup-bubble__quote">{p.text}</p>
        ) : null}
      </PopupBubble>
    );

    return (
      <React.Fragment key={p.id}>
        {toolbarMount ? createPortal(node, toolbarMount) : node}
      </React.Fragment>
    );
  });

  const toolbar = (
    <FloatingToolbar
      colorScheme={panelTheme}
      onClear={clearAll}
      viewport={viewport}
      memoryNudge={nudge}
      memoryOpen={nudgeOpen}
      onMemoryToggle={() => setNudgeOpen((v) => !v)}
      onMemoryDismiss={() => {
        if (nudge?.pageKey) dismissedPageKeysRef.current.add(nudge.pageKey);
        nudgeActiveRef.current = false;
        setNudge(null);
        setNudgeOpen(false);
      }}
      onMemoryOpenUrl={(url) => {
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          /* ignore */
        }
      }}
      onMemoryRestoreExact={() => {
        void restoreExactOnPage();
      }}
      onMemoryDismissSemanticSite={() => {
        const origin = nudge?.origin || (() => {
          try {
            return location.origin;
          } catch {
            return "";
          }
        })();
        void dismissSemanticForOriginToday(origin).then(() => {
          setNudge((prev) => {
            if (!prev) return prev;
            const next = {
              ...prev,
              semantic: [],
              semanticCount: 0,
            };
            if (
              next.exactCount + next.relatedCount + next.semanticCount < 1
            ) {
              nudgeActiveRef.current = false;
              return null;
            }
            return next;
          });
        });
      }}
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

      {showDrawCursor ? (
        <div
          ref={drawCursorRef}
          className="syncle-draw-cursor"
          data-theme={panelTheme}
          aria-hidden="true"
        >
          <img
            className="syncle-draw-cursor__pointer"
            src={pointerUrl}
            alt=""
            width={32}
            height={32}
            draggable={false}
          />
          <span className="syncle-draw-cursor__hint">Drag to ask</span>
        </div>
      ) : null}

      {toolbarControlsMount
        ? createPortal(toolbar, toolbarControlsMount)
        : toolbarMount
          ? createPortal(toolbar, toolbarMount)
          : toolbar}

      {selectionUi
        ? createPortal(
            <SelectionToolbar
              pageX={selectionUi.pageX}
              pageY={selectionUi.pageY}
              scrollParents={selectionUi.scrollParents}
              colorScheme={panelTheme}
              onComment={() => commitTextSelection("comment")}
              onAsk={() => commitTextSelection("ask")}
            />,
            toolbarControlsMount || toolbarMount || document.documentElement,
          )
        : null}

      {popupNodes}
    </div>
  );
}
