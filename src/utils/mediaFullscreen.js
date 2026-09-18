const OVERLAY_HOST_IDS = [
  "draw-on-web-root-host",
  "syncle-overlay-mount",
  "syncle-toolbar-mount",
];

function nativeFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function isPlayingViewportVideo() {
  const videos = document.querySelectorAll("video");
  if (!videos.length) return false;

  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (vw < 80 || vh < 80) return false;

  for (const video of videos) {
    if (video.webkitDisplayingFullscreen) return true;
    if (video.paused || video.ended || video.readyState < 2) continue;

    const r = video.getBoundingClientRect();
    if (r.width >= vw * 0.9 && r.height >= vh * 0.82) return true;
  }
  return false;
}

export function isMediaFullscreen() {
  if (nativeFullscreenElement()) return true;
  return isPlayingViewportVideo();
}

export function subscribeMediaFullscreen(onChange) {
  let frame = 0;
  const notify = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onChange(isMediaFullscreen());
    });
  };

  const docEvents = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange",
    "webkitbeginfullscreen",
    "webkitendfullscreen",
  ];
  for (const type of docEvents) {
    document.addEventListener(type, notify, true);
  }
  document.addEventListener("play", notify, true);
  document.addEventListener("pause", notify, true);
  document.addEventListener("ended", notify, true);
  window.addEventListener("resize", notify, { passive: true });

  onChange(isMediaFullscreen());

  return () => {
    if (frame) cancelAnimationFrame(frame);
    for (const type of docEvents) {
      document.removeEventListener(type, notify, true);
    }
    document.removeEventListener("play", notify, true);
    document.removeEventListener("pause", notify, true);
    document.removeEventListener("ended", notify, true);
    window.removeEventListener("resize", notify);
  };
}

export function setOverlayHostsHidden(hidden) {
  for (const id of OVERLAY_HOST_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.display = hidden ? "none" : "";
  }
}
