import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, Trash2 } from "lucide-react";
import logoUrl from "../assets/svg/Logo.svg";

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

function clampPosition(pos, viewport) {
  const maxX = Math.max(
    VIEWPORT_MARGIN,
    viewport.width - HUB_SIZE - VIEWPORT_MARGIN,
  );
  const maxY = Math.max(
    VIEWPORT_MARGIN,
    viewport.height - HUB_SIZE - VIEWPORT_MARGIN,
  );
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, pos.x), maxX),
    y: Math.min(Math.max(VIEWPORT_MARGIN, pos.y), maxY),
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

function stopActionPointer(e) {
  e.preventDefault();
  e.stopPropagation();
}

export default function FloatingToolbar({
  colorScheme = "light",
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
  const [isOpen, setIsOpen] = useState(null);
  const [pinned, setPinned] = useState(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;
  const [isDragging, setIsDragging] = useState(false);

  const side =
    position && viewport
      ? expandSide(position, viewport, trayExtraWidth())
      : "left";

  useEffect(() => {
    let cancelled = false;
    loadToolbarState().then((saved) => {
      if (cancelled) return;
      setPosition(
        clampPosition(saved.position ?? defaultPosition(viewport), viewport),
      );
      setIsOpen(saved.isOpen || saved.pinned);
      setPinned(saved.pinned);
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
      className={`syncle-floating-toolbar${isOpen ? " is-open" : ""}${pinned ? " is-locked" : ""}`}
      data-theme={colorScheme}
      data-expand={side}
      style={{
        left: position.x,
        top: position.y,
        width: HUB_SIZE,
        height: HUB_SIZE,
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
        title={pinned ? "Unlock to move or close" : isOpen ? "Collapse tools" : "Expand tools"}
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
    </div>
  );
}
