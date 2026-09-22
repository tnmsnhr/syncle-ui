/**
 * SPA URL change detection.
 * Content scripts patch a different `history` than the page (isolated world),
 * so we inject a MAIN-world hook (web-accessible file — survives CSP) and poll.
 */

import { pageKeyFromUrl } from "./pageIdentity.js";

export const SPA_EVENT = "syncle:locationchange";
export const SPA_MESSAGE = "syncle:spa-nav";

/** Inject MAIN-world history patch via chrome.runtime URL (not inline — CSP safe). */
export function installMainWorldSpaHook() {
  if (typeof document === "undefined") return;
  if (window.__syncleMainHookAttempted) return;
  window.__syncleMainHookAttempted = true;

  try {
    const src = chrome.runtime.getURL("spa-hook.js");
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.syncle = "spa-hook";
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    const root = document.documentElement || document.head || document.body;
    if (!root) return;
    root.appendChild(script);
  } catch {
    /* polling still covers it */
  }
}

/**
 * Watch SPA navigations; callback when pageKey changes.
 * Combines: main-world postMessage, popstate/hashchange, CS-world history patch,
 * title mutations, and a fast location poll.
 */
export function onPageKeyChange(callback) {
  installMainWorldSpaHook();

  let last = pageKeyFromUrl();
  const check = () => {
    const next = pageKeyFromUrl();
    if (next === last) return;
    last = next;
    try {
      callback(next);
    } catch (err) {
      console.warn("[syncle] onPageKeyChange callback failed", err);
    }
  };

  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  window.addEventListener(SPA_EVENT, check);

  const onMessage = (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== SPA_MESSAGE) return;
    queueMicrotask(check);
  };
  window.addEventListener("message", onMessage);

  let patchedPush = null;
  let patchedReplace = null;
  let origPush = history.pushState.bind(history);
  let origReplace = history.replaceState.bind(history);

  const wrap = (fn) =>
    function patched(...args) {
      const ret = fn.apply(this, args);
      queueMicrotask(check);
      return ret;
    };

  const hookHistory = () => {
    if (history.pushState === patchedPush) return;
    origPush = history.pushState.bind(history);
    origReplace = history.replaceState.bind(history);
    patchedPush = wrap(origPush);
    patchedReplace = wrap(origReplace);
    history.pushState = patchedPush;
    history.replaceState = patchedReplace;
  };

  hookHistory();
  const hookIv = window.setInterval(hookHistory, 1000);
  const pollIv = window.setInterval(check, 200);

  let titleObs = null;
  try {
    const titleEl = document.querySelector("title");
    if (titleEl && typeof MutationObserver === "function") {
      titleObs = new MutationObserver(() => check());
      titleObs.observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  } catch {
    /* ignore */
  }

  const onNav = () => queueMicrotask(check);
  if (window.navigation?.addEventListener) {
    try {
      window.navigation.addEventListener("navigate", onNav);
    } catch {
      /* ignore */
    }
  }

  window.addEventListener("pageshow", check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });

  // Background tab URL updates (history API that never hits this world).
  const onRuntime = (msg) => {
    if (msg?.type === "SYNCLE_URL_CHANGED") queueMicrotask(check);
  };
  try {
    chrome.runtime?.onMessage?.addListener(onRuntime);
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener("popstate", check);
    window.removeEventListener("hashchange", check);
    window.removeEventListener(SPA_EVENT, check);
    window.removeEventListener("message", onMessage);
    window.removeEventListener("pageshow", check);
    window.clearInterval(hookIv);
    window.clearInterval(pollIv);
    titleObs?.disconnect();
    try {
      window.navigation?.removeEventListener?.("navigate", onNav);
    } catch {
      /* ignore */
    }
    try {
      chrome.runtime?.onMessage?.removeListener(onRuntime);
    } catch {
      /* ignore */
    }
    if (history.pushState === patchedPush) {
      history.pushState = origPush;
      history.replaceState = origReplace;
    }
  };
}
