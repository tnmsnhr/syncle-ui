import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Pin, Send, X } from "lucide-react";
import uid from "../utils/uid.js";
import {
  getScrollOffset,
  onPageScroll,
  pageToClient,
  POPUP_COLLAPSE_SCROLL_PX,
} from "../utils/pageCoords.js";
import { rangeClientBox } from "../utils/textSelection.js";
import { placePopupPosition } from "../utils/placePopupPosition.js";
import { getViewportSize } from "../utils/viewport.js";
import "./popupBubble.css";

function scrollDelta(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stopBubble(e) {
  e.preventDefault();
  e.stopPropagation();
}

function liveRangeBox(range) {
  if (!range) return null;
  try {
    if (range.collapsed) return null;
    return rangeClientBox(range);
  } catch {
    return null;
  }
}

const PopupBubble = ({
  pageX,
  pageY,
  centroidPageX,
  centroidPageY,
  collapseDistance = POPUP_COLLAPSE_SCROLL_PX,
  scrollParents = [],
  /** Live DOM Range — text marks reflow with this on resize/scroll. */
  anchorRange = null,
  dotColor = "#22c55e",
  zIndex = 2147483647,
  colorScheme = "light",
  onDelete,
  onAsk,
  mode = "ask",
  messages: messagesProp,
  startCollapsed = false,
  strongPulse = false,
  children,
}) => {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const scrollParentsRef = useRef(scrollParents);
  scrollParentsRef.current = scrollParents;
  const anchorRangeRef = useRef(anchorRange);
  anchorRangeRef.current = anchorRange;
  const originRef = useRef(getScrollOffset(scrollParents));
  const collapsedRef = useRef(Boolean(startCollapsed));
  const pinnedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(Boolean(startCollapsed));
  const [pinned, setPinned] = useState(false);
  const [intro, setIntro] = useState(!startCollapsed);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState([]);
  const sizeRef = useRef({ w: 280, h: 88 });
  const controlled = Array.isArray(messagesProp);
  const messages = controlled ? messagesProp : localMessages;

  const focusInput = () => {
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el || collapsedRef.current) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    });
  };

  useEffect(() => {
    if (collapsed) return undefined;
    focusInput();
    return undefined;
  }, [collapsed]);

  const resolveClientAnchor = () => {
    const box = liveRangeBox(anchorRangeRef.current);
    if (box) {
      return {
        box,
        centroid: {
          x: box.minX + box.w / 2,
          y: box.minY + box.h / 2,
        },
      };
    }
    const parents = scrollParentsRef.current;
    return {
      box: null,
      centroid: pageToClient(centroidPageX, centroidPageY, parents),
      panel: pageToClient(pageX, pageY, parents),
    };
  };

  const positionDot = (el) => {
    const { centroid } = resolveClientAnchor();
    el.style.left = `${centroid.x}px`;
    el.style.top = `${centroid.y}px`;
    el.style.transform = "translate(-50%, -50%)";
  };

  const placePointer = (el, panelOrigin, centroid) => {
    const pointer = el.querySelector(".popup-bubble__pointer");
    if (!pointer || collapsedRef.current) return;
    if (el.classList.contains("is-collapsed")) return;

    let w = el.offsetWidth;
    let h = el.offsetHeight;
    if (w > 80 && h > 40) {
      sizeRef.current = { w, h };
    } else {
      w = sizeRef.current.w;
      h = sizeRef.current.h;
    }
    const dx = centroid.x - (panelOrigin.x + w / 2);
    const dy = centroid.y - (panelOrigin.y + h / 2);
    const side =
      Math.abs(dx) >= Math.abs(dy)
        ? dx < 0
          ? "left"
          : "right"
        : dy < 0
          ? "top"
          : "bottom";
    pointer.dataset.side = side;

    const pad = 20;
    if (side === "left" || side === "right") {
      const along = Math.min(h - pad, Math.max(pad, centroid.y - panelOrigin.y));
      pointer.style.setProperty("--pointer-along", `${along}px`);
    } else {
      const along = Math.min(w - pad, Math.max(pad, centroid.x - panelOrigin.x));
      pointer.style.setProperty("--pointer-along", `${along}px`);
    }
  };

  const positionPanel = (el) => {
    const anchor = resolveClientAnchor();
    let panelOrigin;
    if (anchor.box) {
      const placed = placePopupPosition(anchor.box, getViewportSize());
      panelOrigin = { x: placed.x, y: placed.y };
    } else {
      panelOrigin = anchor.panel;
    }
    el.style.left = `${panelOrigin.x}px`;
    el.style.top = `${panelOrigin.y}px`;
    el.style.transform = "translate(0, 0)";
    placePointer(el, panelOrigin, anchor.centroid);
  };

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const apply = () => {
      const parents = scrollParentsRef.current;
      if (
        !pinnedRef.current &&
        !collapsedRef.current &&
        scrollDelta(getScrollOffset(parents), originRef.current) >=
          collapseDistance
      ) {
        collapsedRef.current = true;
        setCollapsed(true);
      }

      if (collapsedRef.current) {
        positionDot(el);
        return;
      }

      positionPanel(el);
    };

    apply();
    const stopScroll = onPageScroll(apply);

    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, {
      passive: true,
    });
    let ro = null;
    try {
      if (typeof ResizeObserver === "function") {
        ro = new ResizeObserver(onResize);
        ro.observe(document.documentElement);
        if (document.body) ro.observe(document.body);
      }
    } catch {
      /* ignore */
    }

    return () => {
      stopScroll();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [
    pageX,
    pageY,
    centroidPageX,
    centroidPageY,
    collapseDistance,
    collapsed,
    messages,
    scrollParents,
    anchorRange,
  ]);

  const expandFromDot = (e) => {
    if (!collapsedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    originRef.current = getScrollOffset(scrollParentsRef.current);
    collapsedRef.current = false;
    setCollapsed(false);
    const el = rootRef.current;
    if (el) positionPanel(el);
    focusInput();
  };

  const armExpandRef = useRef(false);

  const onRootPointerDown = (e) => {
    armExpandRef.current = Boolean(collapsedRef.current && e.button === 0);
  };

  const onRootPointerUp = (e) => {
    const armed = armExpandRef.current;
    armExpandRef.current = false;
    if (!armed) return;
    expandFromDot(e);
  };

  const onRootPointerCancel = () => {
    armExpandRef.current = false;
  };

  const minimize = (e) => {
    stopBubble(e);
    if (collapsedRef.current) return;
    collapsedRef.current = true;
    setCollapsed(true);
    const el = rootRef.current;
    if (el) positionDot(el);
  };

  const togglePin = (e) => {
    stopBubble(e);
    const next = !pinnedRef.current;
    pinnedRef.current = next;
    setPinned(next);
    if (!next) {
      originRef.current = getScrollOffset(scrollParentsRef.current);
    }
  };

  const handleDelete = (e) => {
    stopBubble(e);
    onDelete?.();
  };

  const sendFollowUp = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    if (!controlled) {
      setLocalMessages((prev) => [
        ...prev,
        { id: uid(), role: "user", text },
      ]);
    }
    onAsk?.(text);
  };

  return (
    <div
      ref={rootRef}
      className={`popup-bubble${collapsed ? " is-collapsed" : ""}${
        collapsed && strongPulse ? " is-strong-pulse" : ""
      }${pinned ? " is-pinned" : ""}`}
      data-theme={colorScheme}
      style={{
        "--bubble-z": String(zIndex),
        "--dot-border": dotColor,
      }}
      title={collapsed ? "Open chat" : undefined}
      aria-label={collapsed ? "Open chat" : undefined}
      role={collapsed ? "button" : undefined}
      tabIndex={collapsed ? 0 : undefined}
      onPointerDown={onRootPointerDown}
      onPointerUp={onRootPointerUp}
      onPointerCancel={onRootPointerCancel}
      onKeyDown={(e) => {
        if (!collapsed) return;
        if (e.key === "Enter" || e.key === " ") expandFromDot(e);
      }}
    >
      {intro ? (
        <span className="popup-bubble__intro-ring" aria-hidden="true">
          <span
            className="popup-bubble__intro-spin"
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              setIntro(false);
            }}
          />
        </span>
      ) : null}
      <span
        className="popup-bubble__pointer"
        data-side="left"
        aria-hidden="true"
      />
      <div className="popup-bubble__inner">
        <div
          className="popup-bubble__lights"
          onPointerDown={stopBubble}
          onClick={stopBubble}
        >
          <button
            type="button"
            className="traffic traffic-close"
            aria-label="Delete selection"
            title="Delete"
            onPointerDown={handleDelete}
          >
            <X size={8} strokeWidth={3} />
          </button>
          <button
            type="button"
            className="traffic traffic-min"
            aria-label="Minimize"
            title="Minimize"
            onClick={minimize}
          >
            <Minus size={8} strokeWidth={3} />
          </button>
          <button
            type="button"
            className={`traffic traffic-pin${pinned ? " is-on" : ""}`}
            aria-label={pinned ? "Unpin" : "Pin open"}
            title={pinned ? "Unpin" : "Pin"}
            aria-pressed={pinned}
            onClick={togglePin}
          >
            <Pin size={7} strokeWidth={2.75} />
          </button>
        </div>
        <div className="popup-bubble__content">
          {children}
          {messages.map((msg) => (
            <p
              key={msg.id}
              className={`popup-bubble__msg popup-bubble__msg--${msg.role}`}
            >
              {msg.text}
            </p>
          ))}
        </div>
        <form
          className="popup-bubble__composer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            sendFollowUp();
          }}
        >
          <textarea
            ref={inputRef}
            className="popup-bubble__input"
            rows={1}
            value={draft}
            placeholder={
              mode === "comment" ? "Add a comment…" : "Ask a follow-up…"
            }
            aria-label={
              mode === "comment" ? "Annotation comment" : "Follow-up question"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendFollowUp();
              }
            }}
          />
          <button
            type="submit"
            className="popup-bubble__send"
            aria-label="Send"
            title="Send"
            disabled={!draft.trim()}
          >
            <Send size={14} strokeWidth={2.25} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default PopupBubble;
