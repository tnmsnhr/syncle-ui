/** Overlay product lines — only `ai` is fully implemented today. */
export const PRODUCT_MODE_LIST = [
  {
    id: "ai",
    label: "AI summary",
    shortLabel: "AI",
    title: "AI summary + memory — hold ⌘ or Ctrl and drag to select",
  },
  {
    id: "clips",
    label: "Save clips",
    shortLabel: "Save",
    title: "Save content from the page for later reference (coming soon)",
  },
  {
    id: "page",
    label: "Page summary",
    shortLabel: "Page",
    title: "Summarize the full page (coming soon)",
  },
];

export function isAiProductMode(mode) {
  return mode === "ai";
}
