import React, { useLayoutEffect, useRef } from "react";
import "./popupBubble.css";

const PopupBubble = ({ x, y, zIndex = 2147483647, children }) => {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = "translate(0, 0)";
  }, [x, y]);

  return (
    <div
      ref={rootRef}
      className="popup-bubble"
      style={{ "--bubble-z": String(zIndex) }}
    >
      <div className="popup-bubble__inner">
        {children ? (
          <div className="popup-bubble__content">{children}</div>
        ) : null}
      </div>
    </div>
  );
};

export default PopupBubble;
