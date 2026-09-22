import { DEFAULT_LASSO_THEME_ID } from "./lassoThemes.js";
import { SEMANTIC_THRESHOLD } from "../memory/embedConfig.js";

export const DEFAULT_SETTINGS = {
  theme: "system",
  enabled: true,
  lassoTheme: DEFAULT_LASSO_THEME_ID,
  /** Phase 2: allow semantic matches from other origins. */
  semanticCrossOrigin: true,
  semanticThreshold: SEMANTIC_THRESHOLD,
};

export function loadSettings() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        const merged = { ...DEFAULT_SETTINGS, ...items };
        if (!merged.lassoTheme) {
          merged.lassoTheme = DEFAULT_LASSO_THEME_ID;
        }
        if (typeof merged.semanticCrossOrigin !== "boolean") {
          merged.semanticCrossOrigin = true;
        }
        if (
          typeof merged.semanticThreshold !== "number" ||
          Number.isNaN(merged.semanticThreshold)
        ) {
          merged.semanticThreshold = SEMANTIC_THRESHOLD;
        }
        resolve(merged);
      });
    } catch {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

/** Only an explicit `false` disables drawing. */
export function isDrawingEnabled(settings) {
  return settings?.enabled !== false;
}

export function saveSettings(partial) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(partial, () => resolve());
  });
}

export function applyThemeToDocument(theme) {
  const root = document.documentElement;
  root.dataset.theme = resolvePanelTheme(theme);
}

export function resolvePanelTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
