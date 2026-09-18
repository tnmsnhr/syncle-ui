/** Collapse a chat bubble into a centroid dot after this much page scroll. */
export const POPUP_COLLAPSE_SCROLL_PX = 100;

/** Layout scroll of the document (includes visualViewport pan on mobile). */
export function getScrollOffset() {
  const vv = window.visualViewport;
  return {
    x: vv?.pageLeft ?? window.scrollX ?? 0,
    y: vv?.pageTop ?? window.scrollY ?? 0,
  };
}

export function clientToPage(clientX, clientY) {
  const s = getScrollOffset();
  return { x: clientX + s.x, y: clientY + s.y };
}

export function pageToClient(pageX, pageY) {
  const s = getScrollOffset();
  return { x: pageX - s.x, y: pageY - s.y };
}

/** Coalesce scroll to one callback per animation frame. */
export function onPageScroll(callback) {
  let frame = 0;
  const run = () => {
    frame = 0;
    callback();
  };
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(run);
  };

  window.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

  return () => {
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener("scroll", schedule, { capture: true });
    window.visualViewport?.removeEventListener("scroll", schedule);
  };
}
