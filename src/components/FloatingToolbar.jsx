import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, Trash2 } from "lucide-react";
import logoUrl from "../assets/svg/Logo.svg";
import MemoryNudge from "./MemoryNudge.jsx";

const TOOLBAR_POS_KEY = "syncle_toolbar_pos_v2";
const TOOLBAR_OPEN_KEY = "syncle_toolbar_open";
const TOOLBAR_PIN_KEY = "syncle_toolbar_pinned";
const HUB_SIZE = 50;
const ACTION_SIZE = 32;
const ACTION_GAP = 2;
const TRAY_END_PAD = 10;
const VIEWPORT_MARGIN = 12;
const ACTION_COUNT = 2;
const DRAG_THRESHOLD = 5;
const ICON_SIZE = 16;
const MEMORY_SHEET_W = 320;
const MEMORY_SHEET_H = 380;
const MEMORY_SHEET_GAP = 14;
const MEMORY_DOT_OUTSET = 14;

function loadToolbarState() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        {
          [TOOLBAR_POS_KEY]: null,
          [TOOLBAR_OPEN_KEY]: false,
          [TOOLBAR_PIN_KEY]: false,
        },
        (items) => {
          const pos = items?.[TOOLBAR_POS_KEY];
          resolve({
            position:
              pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
                ? pos
                : null,
            isOpen: items?.[TOOLBAR_OPEN_KEY] === true,
            pinned: items?.[TOOLBAR_PIN_KEY] === true,
          });
        },
      );
    } catch {
      resolve({ position: null, isOpen: false, pinned: false });
    }
  });
}

function saveToolbarPosition(pos) {
  try {
    chrome.storage.local.set({ [TOOLBAR_POS_KEY]: pos });
  } catch {
    /* ignore */
  }
}

function saveToolbarOpen(isOpen) {
  try {
    chrome.storage.local.set({ [TOOLBAR_OPEN_KEY]: isOpen });
  } catch {
    /* ignore */
  }
}

function saveToolbarPinned(pinned) {
  try {
    chrome.storage.local.set({ [TOOLBAR_PIN_KEY]: pinned });
  } catch {
    /* ignore */
  }
}

function defaultPosition(viewport) {
  return {
    x: Math.max(VIEWPORT_MARGIN, viewport.width - HUB_SIZE - 16),
    y: Math.max(VIEWPORT_MARGIN, viewport.height - HUB_SIZE - 16),
  };
}

function trayExtraWidth() {
  return (
    TRAY_END_PAD +
    ACTION_COUNT * ACTION_SIZE +
    Math.max(0, ACTION_COUNT - 1) * ACTION_GAP
  );
}

function expandSide(pos, viewport, extra) {
  const left = pos.x - VIEWPORT_MARGIN;
  const right = viewport.width - (pos.x + HUB_SIZE) - VIEWPORT_MARGIN;
  if (right >= extra && left >= extra) return right >= left ? "right" : "left";
  if (left >= extra && right < extra) return "left";
  if (right >= extra && left < extra) return "right";
  return left > right ? "left" : "right";
}

/** Prefer sheet above/end; flip below/start when the hub is near an edge. */
function memorySheetPlacement(pos, viewport, sheetW, sheetH) {
  const above = pos.y - VIEWPORT_MARGIN;
  const below = viewport.height - (pos.y + HUB_SIZE) - VIEWPORT_MARGIN;
  let vertical = "above";
  if (above >= sheetH + MEMORY_SHEET_GAP) vertical = "above";
  else if (below >= sheetH + MEMORY_SHEET_GAP) vertical = "below";
  else vertical = above >= below ? "above" : "below";

  // end = align to hub right (sheet grows left); start = align to hub left (grows right)
  const roomForEnd =
    pos.x + HUB_SIZE - sheetW >= VIEWPORT_MARGIN - 1;
  const roomForStart =
    pos.x + sheetW <= viewport.width - VIEWPORT_MARGIN + 1;
  let horizontal = "end";
  if (roomForEnd && roomForStart) {
    horizontal =
      pos.x + HUB_SIZE / 2 < viewport.width / 2 ? "start" : "end";
  } else if (roomForStart && !roomForEnd) {
    horizontal = "start";
  } else if (roomForEnd && !roomForStart) {
    horizontal = "end";
  } else {
    horizontal =
      pos.x + HUB_SIZE / 2 < viewport.width / 2 ? "start" : "end";
  }

  return `${vertical}-${horizontal}`;
}

/**
 * Keep hub + open tray / memory UI inside the viewport.
 * Moves the hub into free space instead of cropping open content.
 */
function clampPosition(pos, viewport, opts = {}) {
  const {
    isOpen = false,
    memoryOpen = false,
    hasMemory = false,
  } = opts;

  const extra = trayExtraWidth();
  let side = expandSide(pos, viewport, extra);

  const sheetW = Math.min(MEMORY_SHEET_W, Math.max(160, viewport.width - 32));
  const sheetH = Math.min(MEMORY_SHEET_H, Math.max(120, viewport.height - 100));
  let sheetPlacement = memoryOpen
    ? memorySheetPlacement(pos, viewport, sheetW, sheetH)
    : "above-end";

  const insetsFor = (traySide, placement) => {
    let left = VIEWPORT_MARGIN;
    let right = VIEWPORT_MARGIN;
    let top = VIEWPORT_MARGIN;
    let bottom = VIEWPORT_MARGIN;

    if (isOpen) {
      if (traySide === "left") left = Math.max(left, VIEWPORT_MARGIN + extra);
      else right = Math.max(right, VIEWPORT_MARGIN + extra);
    }

    if (memoryOpen) {
      const horizontal = placement.endsWith("-start") ? "start" : "end";
      const vertical = placement.startsWith("below") ? "below" : "above";
      const sideNeed = Math.max(0, sheetW - HUB_SIZE);
      if (horizontal === "end") {
        left = Math.max(left, VIEWPORT_MARGIN + sideNeed);
      } else {
        right = Math.max(right, VIEWPORT_MARGIN + sideNeed);
      }
      if (vertical === "above") {
        top = Math.max(top, VIEWPORT_MARGIN + sheetH + MEMORY_SHEET_GAP);
      } else {
        bottom = Math.max(bottom, VIEWPORT_MARGIN + sheetH + MEMORY_SHEET_GAP);
      }
    } else if (hasMemory) {
      right = Math.max(right, VIEWPORT_MARGIN + MEMORY_DOT_OUTSET);
      top = Math.max(top, VIEWPORT_MARGIN + MEMORY_DOT_OUTSET);
    }

    return { left, right, top, bottom };
  };

  const apply = (traySide, placement) => {
    const inset = insetsFor(traySide, placement);
    const maxX = Math.max(inset.left, viewport.width - HUB_SIZE - inset.right);
    const maxY = Math.max(inset.top, viewport.height - HUB_SIZE - inset.bottom);
    return {
      x: Math.min(Math.max(inset.left, pos.x), maxX),
      y: Math.min(Math.max(inset.top, pos.y), maxY),
    };
  };

  let next = apply(side, sheetPlacement);
  const sideAfter = expandSide(next, viewport, extra);
  if (sideAfter !== side) {
    side = sideAfter;
    next = apply(side, sheetPlacement);
  }
  if (memoryOpen) {
    const sheetAfter = memorySheetPlacement(next, viewport, sheetW, sheetH);
    if (sheetAfter !== sheetPlacement) {
      sheetPlacement = sheetAfter;
      next = apply(side, sheetPlacement);
    }
  }

  return { position: next, side, sheetPlacement };
}

function stopActionPointer(e) {
  e.preventDefault();
  e.stopPropagation();
}

export default function FloatingToolbar({
  colorScheme = "light",
  onClear,
  viewport,
  memoryNudge = null,
  memoryOpen = false,
  onMemoryToggle,
  onMemoryDismiss,
  onMemoryOpenUrl,
}) {
  const dragStateRef = useRef({
    pointerStartX: 0,
    pointerStartY: 0,
    menuStartX: 0,
    menuStartY: 0,
    hasMoved: false,
    isPointerPressed: false,
  });
  const [position, setPosition] = useState(null);
  const [isOpen, setIsOpen] = useState(null);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;
  const [isDragging, setIsDragging] = useState(false);
  const [sheetPlacement, setSheetPlacement] = useState("above-end");

  const hasMemory = Boolean(
    memoryNudge && memoryNudge.exactCount + memoryNudge.relatedCount > 0,
  );

  const clampOpts = {
    isOpen: Boolean(isOpen),
    memoryOpen: Boolean(memoryOpen),
    hasMemory,
  };

  const fitPosition = useCallback(
    (pos, overrides = {}) => {
      const result = clampPosition(pos, viewport, {
        ...clampOpts,
        ...overrides,
      });
      setSheetPlacement(result.sheetPlacement);
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewport, isOpen, memoryOpen, hasMemory],
  );

  const side =
    position && viewport
      ? expandSide(position, viewport, trayExtraWidth())
      : "left";

  useEffect(() => {
    let cancelled = false;
    loadToolbarState().then((saved) => {
      if (cancelled) return;
      const open = saved.isOpen || saved.pinned;
      const fitted = clampPosition(
        saved.position ?? defaultPosition(viewport),
        viewport,
        { isOpen: open, memoryOpen: false, hasMemory: false },
      );
      setPosition(fitted.position);
      setSheetPlacement(fitted.sheetPlacement);
      setIsOpen(open);
      setPinned(saved.pinned);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!position) return;
    setPosition((prev) => {
      if (!prev) return defaultPosition(viewport);
      const fitted = fitPosition(prev);
      return fitted.position;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height, isOpen, memoryOpen, hasMemory]);

  const onDragPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (pinnedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);

      dragStateRef.current = {
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        menuStartX: (position ?? defaultPosition(viewport)).x,
        menuStartY: (position ?? defaultPosition(viewport)).y,
        hasMoved: false,
        isPointerPressed: true,
      };
    },
    [position, viewport],
  );

  const onDragPointerMove = useCallback(
    (e) => {
      const drag = dragStateRef.current;
      if (pinnedRef.current || !drag.isPointerPressed) return;

      const dx = e.clientX - drag.pointerStartX;
      const dy = e.clientY - drag.pointerStartY;
      const hasDraggedEnough =
        Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
      if (!hasDraggedEnough && !drag.hasMoved) return;

      drag.hasMoved = true;
      if (!isDragging) setIsDragging(true);

      const fitted = fitPosition({
        x: drag.menuStartX + dx,
        y: drag.menuStartY + dy,
      });
      setPosition(fitted.position);
    },
    [isDragging, fitPosition],
  );

  const onDragPointerUp = useCallback((e) => {
    const wasDragging = dragStateRef.current.hasMoved;
    dragStateRef.current.isPointerPressed = false;
    dragStateRef.current.hasMoved = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);

    setPosition((prev) => {
      if (prev) saveToolbarPosition(prev);
      return prev;
    });

    if (!wasDragging) {
      if (pinnedRef.current) return;
      setIsOpen((prev) => {
        const next = !prev;
        saveToolbarOpen(next);
        return next;
      });
    }
  }, []);

  const onDragPointerCancel = useCallback(() => {
    dragStateRef.current.isPointerPressed = false;
    dragStateRef.current.hasMoved = false;
    setIsDragging(false);
  }, []);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      pinnedRef.current = next;
      saveToolbarPinned(next);
      if (next) {
        setIsOpen(true);
        saveToolbarOpen(true);
      }
      return next;
    });
  }, []);

  if (!position || isOpen === null) return null;

  return (
    <div
      className={`syncle-floating-toolbar${isOpen ? " is-open" : ""}${
        pinned ? " is-locked" : ""
      }${hasMemory ? " has-memory-nudge" : ""}`}
      data-theme={colorScheme}
      data-expand={side}
      data-sheet={sheetPlacement}
      style={{
        left: position.x,
        top: position.y,
        width: HUB_SIZE,
        height: HUB_SIZE,
        ...(hasMemory || isOpen
          ? { clipPath: "none", WebkitClipPath: "none" }
          : null),
      }}
      role="toolbar"
      aria-label="Syncle tools"
      aria-expanded={isOpen}
    >
      <div className="syncle-toolbar-tray" aria-hidden={!isOpen}>
        <button
          type="button"
          className="syncle-toolbar-action is-danger"
          aria-label="Delete all"
          title="Delete all"
          onPointerDown={stopActionPointer}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
          }}
        >
          <Trash2 size={ICON_SIZE} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`syncle-toolbar-action${pinned ? " is-on" : ""}`}
          aria-label={pinned ? "Unlock" : "Lock open"}
          title={pinned ? "Unlock" : "Lock"}
          aria-pressed={pinned}
          onPointerDown={stopActionPointer}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePin();
          }}
        >
          {pinned ? (
            <Lock size={ICON_SIZE} strokeWidth={2} />
          ) : (
            <LockOpen size={ICON_SIZE} strokeWidth={2} />
          )}
        </button>
      </div>

      <button
        type="button"
        className="syncle-center-button"
        aria-label={
          pinned ? "Locked" : isOpen ? "Collapse tools" : "Expand tools"
        }
        title={
          pinned
            ? "Unlock to move or close"
            : isOpen
              ? "Collapse tools"
              : "Expand tools"
        }
        style={{
          width: HUB_SIZE,
          height: HUB_SIZE,
          cursor: pinned ? "default" : isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerCancel}
      >
        <span className="syncle-toolbar-ring" aria-hidden="true">
          <span className="syncle-toolbar-ring-spin" />
        </span>
        <span className="syncle-center-button-icon">
          <img src={logoUrl} alt="" width={16} height={16} draggable={false} />
        </span>
      </button>

      {hasMemory ? (
        <MemoryNudge
          exactCount={memoryNudge.exactCount}
          relatedCount={memoryNudge.relatedCount}
          exact={memoryNudge.exact}
          related={memoryNudge.related}
          colorScheme={colorScheme}
          open={memoryOpen}
          sheetPlacement={sheetPlacement}
          nudgeKey={memoryNudge.pageKey || ""}
          onToggle={onMemoryToggle}
          onDismiss={onMemoryDismiss}
          onOpenUrl={onMemoryOpenUrl}
        />
      ) : null}
    </div>
  );
}
