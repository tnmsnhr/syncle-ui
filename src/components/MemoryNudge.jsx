import React, { useEffect, useState } from "react";
import "./memoryNudge.css";

const PILL_MS = 3200;
const DOT_MS = 700;
const SHEET_ANIM_MS = 280;

/**
 * Visit nudge: pill (few seconds) → live dot → docks on hub.
 * Approach 2: quotes / “what you were reading” — no geometry restore CTA.
 */
export default function MemoryNudge({
  exactCount = 0,
  relatedCount = 0,
  exact = [],
  related = [],
  colorScheme = "light",
  open = false,
  sheetPlacement = "above-end",
  onToggle,
  onDismiss,
  onOpenUrl,
  nudgeKey = "",
}) {
  const total = exactCount + relatedCount;
  const [phase, setPhase] = useState("pill"); // pill | dot | docked
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (total < 1) return undefined;
    setPhase("pill");
    const toDot = window.setTimeout(() => setPhase("dot"), PILL_MS);
    const toDock = window.setTimeout(() => setPhase("docked"), PILL_MS + DOT_MS);
    return () => {
      window.clearTimeout(toDot);
      window.clearTimeout(toDock);
    };
  }, [nudgeKey, total]);

  useEffect(() => {
    if (open) {
      setSheetMounted(true);
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setSheetOpen(true));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }

    setSheetOpen(false);
    if (!sheetMounted) return undefined;
    const t = window.setTimeout(() => setSheetMounted(false), SHEET_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [open, sheetMounted]);

  if (total < 1) return null;

  const label = [
    exactCount > 0 ? `${exactCount} on this page` : null,
    relatedCount > 0 ? `${relatedCount} in these docs` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const countLabel = total > 9 ? "9+" : String(total);

  return (
    <div
      className={`syncle-memory-nudge is-${phase}${
        sheetMounted || open ? " is-sheet-open" : ""
      }${sheetOpen ? " is-sheet-visible" : ""}`}
      data-theme={colorScheme}
      data-phase={phase}
      data-sheet={sheetPlacement}
    >
      {phase === "pill" ? (
        <button
          type="button"
          className="syncle-memory-nudge__chip"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="syncle-memory-nudge__mark is-live" aria-hidden="true" />
          <span className="syncle-memory-nudge__label">{label}</span>
        </button>
      ) : (
        <button
          type="button"
          className="syncle-memory-nudge__dot"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${total} memories. ${label}`}
          title={label}
        >
          <span className="syncle-memory-nudge__dot-pulse" aria-hidden="true" />
          {phase === "docked" ? (
            <span className="syncle-memory-nudge__dot-count">{countLabel}</span>
          ) : null}
        </button>
      )}

      {sheetMounted ? (
        <div
          className={`syncle-memory-nudge__sheet${
            sheetOpen ? " is-open" : ""
          }`}
          role="dialog"
          aria-label="What you were reading"
          aria-hidden={!sheetOpen}
        >
          <div className="syncle-memory-nudge__sheet-head">
            <strong>What you were reading</strong>
            <button
              type="button"
              className="syncle-memory-nudge__ghost"
              onClick={onDismiss}
            >
              Not now
            </button>
          </div>

          <div className="syncle-memory-nudge__sheet-body">
            {exactCount > 0 ? (
              <section className="syncle-memory-nudge__section">
                <h3>On this page · {exactCount}</h3>
                <ul>
                  {exact.slice(0, 8).map((m) => (
                    <li key={m.id}>
                      <span className="syncle-memory-nudge__kind">{m.kind}</span>
                      <span className="syncle-memory-nudge__quote">
                        {m.quote || m.note || m.title || "Memory"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="syncle-memory-nudge__hint">
                  Reminder of what you marked earlier on this page.
                </p>
              </section>
            ) : null}

            {relatedCount > 0 ? (
              <section className="syncle-memory-nudge__section">
                <h3>In these docs · {relatedCount}</h3>
                <ul>
                  {related.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <span className="syncle-memory-nudge__kind">{m.kind}</span>
                      <div className="syncle-memory-nudge__related-body">
                        <span className="syncle-memory-nudge__quote">
                          {m.quote || m.note || m.title || "Memory"}
                        </span>
                        {m.url ? (
                          <button
                            type="button"
                            className="syncle-memory-nudge__link"
                            onClick={() => onOpenUrl?.(m.url)}
                          >
                            Open source
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
