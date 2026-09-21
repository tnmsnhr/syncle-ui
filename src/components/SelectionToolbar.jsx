import React, { useLayoutEffect, useRef } from "react";
import { MessageSquarePlus } from "lucide-react";
import { onPageScroll, pageToClient } from "../utils/pageCoords.js";
import logoUrl from "../assets/svg/Logo.svg";
import "./selectionToolbar.css";

export default function SelectionToolbar({
  pageX,
  pageY,
  scrollParents = [],
  colorScheme = "light",
  onComment,
  onAsk,
}) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const place = () => {
      const { x, y } = pageToClient(pageX, pageY, scrollParents);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    place();
    return onPageScroll(place);
  }, [pageX, pageY, scrollParents]);

  return (
    <div
      ref={rootRef}
      className="syncle-selection-toolbar"
      data-theme={colorScheme}
      role="toolbar"
      aria-label="Annotate selection"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="syncle-selection-toolbar__btn"
        onClick={onComment}
      >
        <MessageSquarePlus size={14} strokeWidth={2} />
        Comment
      </button>
      <button
        type="button"
        className="syncle-selection-toolbar__btn is-primary"
        onClick={onAsk}
      >
        <img
          className="syncle-selection-toolbar__logo"
          src={logoUrl}
          alt=""
          width={14}
          height={14}
          draggable={false}
        />
        Ask Syncle
      </button>
    </div>
  );
}
