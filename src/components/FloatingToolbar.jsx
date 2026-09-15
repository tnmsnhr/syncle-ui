import React, { useCallback, useEffect, useRef, useState } from "react";
import { PRODUCT_MODE_LIST } from "./productModes.js";

const TOOLBAR_POS_KEY = "syncle_toolbar_pos";
const TOOLBAR_SIZE = { width: 220, height: 220 };
const VIEWPORT_MARGIN = 12;
const DRAG_THRESHOLD = 5;
const ARC_RADIUS = 78;
const ARC_ITEMS = [
  {
    kind: "mode",
    modeId: "clips",
    angle: 198,
    className: "syncle-arc-button-violet",
  },
  {
    kind: "mode",
    modeId: "ai",
    angle: 156,
    className: "syncle-arc-button-indigo",
  },
  {
    kind: "mode",
    modeId: "page",
    angle: 114,
    className: "syncle-arc-button-pink",
  },
  {
    kind: "action",
    actionId: "undo",
    angle: 72,
    className: "syncle-arc-button-slate",
  },
  {
    kind: "action",
    actionId: "clear",
    angle: 30,
    className: "syncle-arc-button-amber",
  },
];

function loadToolbarPosition() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ [TOOLBAR_POS_KEY]: null }, (items) => {
        const pos = items?.[TOOLBAR_POS_KEY];
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
          resolve(pos);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
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

function defaultPosition(viewport) {
  return {
    x: Math.max(VIEWPORT_MARGIN, viewport.width - TOOLBAR_SIZE.width - 16),
    y: Math.max(VIEWPORT_MARGIN, viewport.height - TOOLBAR_SIZE.height - 16),
  };
}

function clampPosition(pos, viewport) {
  const maxX = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - TOOLBAR_SIZE.width - VIEWPORT_MARGIN,
  );
  const maxY = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - TOOLBAR_SIZE.height - VIEWPORT_MARGIN,
  );
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, pos.y), maxY),
  };
}

function ModeIcon({ modeId }) {
  if (modeId === "ai") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 13l-1.2-4.4L7 7.4l3.8-1.2L12 2zm-7 9l1.4 2.4L9 14.8 6.6 13.4 5 15.8l1.4-2.4L5 11l2.6 1.4L9 11l-1.4 2.4L9 15.8 6.6 14.4 5 16.8zm14 0l-1.4 2.4L15 14.8l2.4-1.4L19 15.8l-1.4-2.4L19 11l-2.6 1.4L15 11l1.4 2.4L15 15.8l2.4-1.4 2.6 1.4zM12 16l2.8 4.8L12 22l-2.8-1.2L12 16z"
        />
      </svg>
    );
  }
  if (modeId === "clips") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 3a3 3 0 0 0-3 3v13l5-3 5 3V6a3 3 0 0 0-3-3H8zm0 2h1a1 1 0 0 1 1 1v11.2l-3-1.8V6a1 1 0 0 0-1-1zm8-1a3 3 0 0 1 3 3v14.2l-5-3-5 3V7a3 3 0 0 1 3-3h4z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 11h8v2H8v-2zm0 4h8v2H8v-2zm0 4h5v2H8v-2z"
      />
    </svg>
  );
}

export default function FloatingToolbar({
  productMode,
  onProductModeChange,
  drawingEnabled,
  hotkeyReady,
  onUndo,
  onClear,
  viewport,
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
  const [isOpen, setIsOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadToolbarPosition().then((saved) => {
      if (cancelled) return;
      setPosition(clampPosition(saved ?? defaultPosition(viewport), viewport));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!position) return;
    setPosition((prev) =>
      prev ? clampPosition(prev, viewport) : defaultPosition(viewport),
    );
  }, [viewport.width, viewport.height]);

  const onDragPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
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
      if (!drag.isPointerPressed) return;

      const dx = e.clientX - drag.pointerStartX;
      const dy = e.clientY - drag.pointerStartY;
      const hasDraggedEnough =
        Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
      if (!hasDraggedEnough && !drag.hasMoved) return;

      drag.hasMoved = true;
      if (!isDragging) setIsDragging(true);

      const next = clampPosition(
        { x: drag.menuStartX + dx, y: drag.menuStartY + dy },
        viewport,
      );
      setPosition(next);
    },
    [isDragging, viewport],
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
      setIsOpen((prev) => !prev);
    }
  }, []);

  const onDragPointerCancel = useCallback(() => {
    dragStateRef.current.isPointerPressed = false;
    dragStateRef.current.hasMoved = false;
    setIsDragging(false);
  }, []);

  if (!position) return null;

  const center = TOOLBAR_SIZE.width / 2;
  const itemSize = 40;
  const centerButtonSize = 54;
  const activeMeta =
    PRODUCT_MODE_LIST.find((m) => m.id === productMode) ?? PRODUCT_MODE_LIST[0];

  return (
    <div
      className="syncle-floating-toolbar"
      style={{ left: position.x, top: position.y }}
      role="toolbar"
      aria-label="Syncle tools"
    >
      {ARC_ITEMS.map((item, index) => {
        const radians = (item.angle * Math.PI) / 180;
        const expandedOffsetX = ARC_RADIUS * Math.cos(radians);
        const expandedOffsetY = -ARC_RADIUS * Math.sin(radians);
        const closedDelay = `${(ARC_ITEMS.length - index - 1) * 18}ms`;
        const openDelay = `${index * 28}ms`;
        const isMode = item.kind === "mode";
        const isModeActive = isMode ? productMode === item.modeId : false;

        let label = "";
        let title = "";
        if (item.kind === "mode") {
          const mode = PRODUCT_MODE_LIST.find((m) => m.id === item.modeId);
          label = mode?.shortLabel ?? "";
          title = mode?.title ?? mode?.label ?? "Mode";
        } else {
          label = item.actionId === "undo" ? "U" : "C";
          title = item.actionId === "undo" ? "Undo" : "Clear";
        }

        return (
          <button
            key={`${item.kind}-${item.kind === "mode" ? item.modeId : item.actionId}`}
            type="button"
            className={`syncle-arc-button ${item.className}${!isOpen ? " syncle-arc-button-closed" : ""}${isModeActive ? " syncle-arc-button-active" : ""}`}
            aria-label={title}
            aria-pressed={isMode ? isModeActive : undefined}
            title={title}
            style={{
              width: `${itemSize}px`,
              height: `${itemSize}px`,
              left: `${center - itemSize / 2}px`,
              top: `${center - itemSize / 2}px`,
              "--x": `${expandedOffsetX}px`,
              "--y": `${expandedOffsetY}px`,
              transitionDelay: isOpen ? openDelay : closedDelay,
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (item.kind === "mode") onProductModeChange(item.modeId);
              if (item.kind === "action" && item.actionId === "undo") onUndo();
              if (item.kind === "action" && item.actionId === "clear")
                onClear();
            }}
          >
            {item.kind === "mode" ? (
              <ModeIcon modeId={item.modeId} />
            ) : item.actionId === "undo" ? (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12.5 8c-2.65 0-5.05 1.28-6.55 3.25L3 8v8h8l-2.48-2.48A6.98 6.98 0 0 1 12.5 10c3.04 0 5.5 2.46 5.5 5.5h2C20 11.02 16.73 8 12.5 8z"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
            )}
          </button>
        );
      })}

      <button
        type="button"
        className="syncle-center-button"
        aria-label={isOpen ? "Collapse menu" : "Expand menu"}
        title={
          productMode === "ai"
            ? `Hold Cmd/Ctrl + drag${!drawingEnabled ? " (off)" : hotkeyReady ? " · ready" : ""}`
            : (activeMeta?.label ?? "Syncle tools")
        }
        style={{
          width: `${centerButtonSize}px`,
          height: `${centerButtonSize}px`,
          left: `${center - centerButtonSize / 2}px`,
          top: `${center - centerButtonSize / 2}px`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerCancel}
      >
        <span
          className={`syncle-center-button-icon${isOpen ? "" : " syncle-center-button-icon-closed"}`}
        >
          <ModeIcon modeId={productMode} />
        </span>
      </button>
    </div>
  );
}
