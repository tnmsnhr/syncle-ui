import React, { useEffect, useState } from "react";
import "./memoryNudge.css";

const PILL_MS = 3200;
const DOT_MS = 700;
const SHEET_ANIM_MS = 280;

/**
 * Visit nudge: pill → live dot → docks on hub.
 * Exact / related (Phase 1) + highly related semantic (Phase 2).
 */
export default function MemoryNudge({
  exactCount = 0,
  relatedCount = 0,
  semanticCount = 0,
  exact = [],
  related = [],
  semantic = [],
  colorScheme = "light",
  open = false,
  sheetPlacement = "above-end",
  onToggle,
  onDismiss,
  onOpenUrl,
  onRestoreExact,
  onFocusExact,
  onDeleteExact,
  onDismissSemanticSite,
  onRejectSemantic,
  nudgeKey = "",
}) {
  const total = exactCount + relatedCount + semanticCount;
  const [phase, setPhase] = useState("pill"); // pill | dot | docked
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (total < 1) return undefined;
    setPhase("pill");
    const toDot = window.setTimeout(() => setPhase("dot"), PILL_MS);
    const toDock = window.setTimeout(
      () => setPhase("docked"),
      PILL_MS + DOT_MS,
    );
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
    semanticCount > 0 ? `${semanticCount} highly related` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const countLabel = total > 999 ? "999+" : String(total);
  const wideBadge = total >= 10;

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
          <span
            className="syncle-memory-nudge__mark is-live"
            aria-hidden="true"
          />
          <span className="syncle-memory-nudge__label">{label}</span>
        </button>
      ) : (
        <button
          type="button"
          className={`syncle-memory-nudge__dot${
            wideBadge && phase === "docked" ? " is-wide" : ""
          }`}
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
          className={`syncle-memory-nudge__sheet${sheetOpen ? " is-open" : ""}`}
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
                    <li key={m.id} className="syncle-memory-nudge__exact">
                      <button
                        type="button"
                        className="syncle-memory-nudge__jump"
                        onClick={() => onFocusExact?.(m.id)}
                      >
                        <span className="syncle-memory-nudge__kind">
                          {m.kind}
                        </span>
                        <span className="syncle-memory-nudge__quote">
                          {m.quote || m.note || m.title || "Memory"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="syncle-memory-nudge__delete"
                        aria-label="Delete memory"
                        onClick={() => onDeleteExact?.(m.id)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="syncle-memory-nudge__restore"
                  onClick={() => onRestoreExact?.()}
                >
                  Show on page
                </button>
                <p className="syncle-memory-nudge__hint">
                  Tap a memory to jump to it on the page.
                </p>
              </section>
            ) : null}

            {relatedCount > 0 ? (
              <section className="syncle-memory-nudge__section">
                <h3>In these docs · {relatedCount}</h3>
                <ul>
                  {related.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <span className="syncle-memory-nudge__kind">
                        {m.kind}
                      </span>
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

            {semanticCount > 0 ? (
              <section className="syncle-memory-nudge__section">
                <h3>Highly related · {semanticCount}</h3>
                <ul>
                  {semantic.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <span className="syncle-memory-nudge__kind">
                        {Math.round((m.score || 0) * 100)}%
                      </span>
                      <div className="syncle-memory-nudge__related-body">
                        <span className="syncle-memory-nudge__quote">
                          {m.quote || m.title || "Related memory"}
                        </span>
                        <div className="syncle-memory-nudge__actions">
                          {m.sourceUrl ? (
                            <button
                              type="button"
                              className="syncle-memory-nudge__link"
                              onClick={() => onOpenUrl?.(m.sourceUrl)}
                            >
                              Open source
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="syncle-memory-nudge__link syncle-memory-nudge__reject"
                            onClick={() => onRejectSemantic?.(m.id)}
                          >
                            Not related
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="syncle-memory-nudge__ghost syncle-memory-nudge__ghost-block"
                  onClick={() => onDismissSemanticSite?.()}
                >
                  Don’t remind on this site today
                </button>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
