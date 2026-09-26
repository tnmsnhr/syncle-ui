import { useEffect, useState } from "react";
import FloatingToolbar from "../components/FloatingToolbar.jsx";
import MemoryNudge from "../components/MemoryNudge.jsx";
import PopupBubble from "../components/PopupBubble.jsx";
import SelectionToolbar from "../components/SelectionToolbar.jsx";
import "../overlay.css";
import "../components/memoryNudge.css";
import "../components/popupBubble.css";
import "../components/selectionToolbar.css";
import "./workbench.css";

const SAMPLE_NUDGE = {
  pageKey: "workbench",
  origin: "https://example.com",
  exactCount: 2,
  relatedCount: 1,
  semanticCount: 2,
  exact: [
    {
      id: "exact-1",
      kind: "comment",
      quote: "Expo linking uses a custom scheme plus universal links.",
      createdAt: "2026-09-12T10:00:00.000Z",
    },
    {
      id: "exact-2",
      kind: "lasso",
      quote: "The intent filter has to match the path prefix.",
      createdAt: "2026-09-20T10:00:00.000Z",
    },
  ],
  related: [
    {
      id: "related-1",
      kind: "ask",
      quote: "React Navigation linking config",
      url: "https://reactnavigation.org",
      createdAt: "2026-08-02T10:00:00.000Z",
    },
  ],
  semantic: [
    {
      id: "semantic-1",
      score: 0.84,
      quote: "Handling an incoming URL on a cold start",
      sourceUrl: "https://docs.expo.dev",
      createdAt: "2026-07-18T10:00:00.000Z",
    },
    {
      id: "semantic-2",
      score: 0.61,
      quote: "Path prefixes that fail the intent filter",
      sourceUrl: "https://docs.expo.dev/linking",
      createdAt: "2025-11-03T10:00:00.000Z",
    },
  ],
};

function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
}

export default function Workbench() {
  const viewport = useViewport();
  const [scene, setScene] = useState("nudge");
  const [theme, setTheme] = useState("light");
  const [nudgeOpen, setNudgeOpen] = useState(true);
  const [bubbleCollapsed, setBubbleCollapsed] = useState(false);

  return (
    <div className="syncle-workbench">
      <article className="syncle-workbench__article">
        <h1>Deep linking, without the guesswork</h1>
        <p>
          A sample page so overlay components can be built with hot reload.
          Edits in <code>src/components</code> show up here immediately. The
          Chrome extension is unchanged until you run the extension build.
        </p>
        <p>
          Universal links and custom schemes both land in the same handler.
          The part that usually breaks is the path prefix on Android, or the
          associated domain file on iOS.
        </p>
        <p>
          Draw the real lasso in the extension. Use this page for the bubble,
          the memory sheet, and the toolbars.
        </p>
      </article>

      <aside className="syncle-workbench__dock">
        <h2>Component</h2>
        <label>
          Scene
          <select value={scene} onChange={(e) => setScene(e.target.value)}>
            <option value="nudge">Memory nudge</option>
            <option value="bubble">Chat bubble</option>
            <option value="toolbar">Floating toolbar</option>
            <option value="selection">Selection toolbar</option>
          </select>
        </label>
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        {scene === "bubble" ? (
          <label>
            <button
              type="button"
              onClick={() => setBubbleCollapsed((v) => !v)}
            >
              {bubbleCollapsed ? "Open bubble" : "Collapse to dot"}
            </button>
          </label>
        ) : null}
      </aside>

      <div className="syncle-workbench__stage">
        {scene === "nudge" ? (
          <div className="syncle-workbench__nudge-anchor">
            <MemoryNudge
              {...SAMPLE_NUDGE}
              colorScheme={theme}
              open={nudgeOpen}
              onToggle={() => setNudgeOpen((v) => !v)}
              onDismiss={() => setNudgeOpen(false)}
              onOpenUrl={(url) => window.open(url, "_blank", "noopener")}
              onRestoreExact={() => {}}
              onFocusExact={() => {}}
              onDeleteExact={() => {}}
            />
          </div>
        ) : null}

        {scene === "bubble" ? (
          <PopupBubble
            key={bubbleCollapsed ? "dot" : "open"}
            pageX={viewport.width * 0.55}
            pageY={220}
            centroidPageX={viewport.width * 0.42}
            centroidPageY={280}
            colorScheme={theme}
            mode="comment"
            messages={[
              { id: "m1", role: "user", text: "Why does this path not match?" },
            ]}
            startCollapsed={bubbleCollapsed}
            strongPulse={bubbleCollapsed}
          >
            <p className="popup-bubble__quote">
              The intent filter has to match the path prefix.
            </p>
          </PopupBubble>
        ) : null}

        {scene === "toolbar" ? (
          <FloatingToolbar
            colorScheme={theme}
            viewport={viewport}
            onClear={() => {}}
            memoryNudge={SAMPLE_NUDGE}
            memoryOpen={nudgeOpen}
            onMemoryToggle={() => setNudgeOpen((v) => !v)}
            onMemoryDismiss={() => setNudgeOpen(false)}
            onMemoryOpenUrl={(url) => window.open(url, "_blank", "noopener")}
            onMemoryRestoreExact={() => {}}
            onMemoryFocusExact={() => {}}
            onMemoryDeleteExact={() => {}}
          />
        ) : null}

        {scene === "selection" ? (
          <SelectionToolbar
            pageX={viewport.width * 0.5}
            pageY={180}
            colorScheme={theme}
            onComment={() => {}}
            onAsk={() => {}}
          />
        ) : null}
      </div>
    </div>
  );
}
