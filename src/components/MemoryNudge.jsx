import React, { useEffect, useState } from "react";
import {
  ThumbsDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Lasso,
  MessageSquare,
  Trash2,
} from "lucide-react";
import "./memoryNudge.css";

const PILL_MS = 3200;
const DOT_MS = 700;
const SHEET_ANIM_MS = 280;

function memoryWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function KindMark({ kind }) {
  const lasso = kind === "lasso";
  const label = lasso ? "Lasso" : "Comment";
  const Icon = lasso ? Lasso : MessageSquare;
  return (
    <span
      className="syncle-memory-nudge__kind-icon"
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}

function siteLabel(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function WhenStamp({ value, label }) {
  return (
    <time dateTime={value}>
      <Clock size={11} strokeWidth={2} aria-hidden="true" />
      {label}
    </time>
  );
}

function MemoryWhen({ value }) {
  const label = memoryWhen(value);
  if (!label) return null;
  return (
    <span className="syncle-memory-nudge__when">
      <WhenStamp value={value} label={label} />
    </span>
  );
}

function RelatedQuote({ url, onOpen, children }) {
  if (!url) {
    return <span className="syncle-memory-nudge__quote">{children}</span>;
  }
  return (
    <button
      type="button"
      className="syncle-memory-nudge__quote syncle-memory-nudge__quote-link"
      onClick={() => onOpen?.(url)}
    >
      {children}
    </button>
  );
}

function RelatedMeta({ createdAt, url }) {
  const when = memoryWhen(createdAt);
  const site = siteLabel(url);
  if (!when && !site) return null;
  return (
    <span className="syncle-memory-nudge__when">
      {when ? <WhenStamp value={createdAt} label={when} /> : null}
      {site ? <span>{when ? `· ${site}` : site}</span> : null}
    </span>
  );
}

function MatchBar({ score }) {
  const pct = Math.max(
    0,
    Math.min(100, Math.round((Number(score) || 0) * 100)),
  );
  return (
    <div className="syncle-memory-nudge__match" title={`${pct}% match`}>
      <span className="syncle-memory-nudge__match-track" aria-hidden="true">
        <span
          className="syncle-memory-nudge__match-fill"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="syncle-memory-nudge__match-pct">{pct}%</span>
    </div>
  );
}

function TrayButton({ label, onClick, danger = false, children }) {
  return (
    <button
      type="button"
      className={`syncle-memory-nudge__tray-btn${danger ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconTray({ end, children }) {
  return (
    <div className="syncle-memory-nudge__tray">
      {children}
      <span className="syncle-memory-nudge__tray-end">{end}</span>
    </div>
  );
}

function NudgeFold({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="syncle-memory-nudge__section">
      <button
        type="button"
        className="syncle-memory-nudge__fold"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight size={14} strokeWidth={2.25} aria-hidden="true" />
        <span>{title}</span>
      </button>
      {open ? children : null}
    </section>
  );
}

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
                        <KindMark kind={m.kind} />
                        <span className="syncle-memory-nudge__jump-copy">
                          <span className="syncle-memory-nudge__quote">
                            {m.quote || m.note || m.title || "Memory"}
                          </span>
                          <MemoryWhen value={m.createdAt} />
                        </span>
                      </button>
                      <IconTray
                        end={
                          <TrayButton
                            label="Delete memory"
                            danger
                            onClick={() => onDeleteExact?.(m.id)}
                          >
                            <Trash2
                              size={14}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          </TrayButton>
                        }
                      />
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
              </section>
            ) : null}

            {relatedCount > 0 ? (
              <NudgeFold title={`In these docs · ${relatedCount}`}>
                <ul>
                  {related.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <div className="syncle-memory-nudge__related-body">
                        <RelatedQuote url={m.url} onOpen={onOpenUrl}>
                          {m.quote || m.note || m.title || "Memory"}
                        </RelatedQuote>
                        <RelatedMeta createdAt={m.createdAt} url={m.url} />
                      </div>
                      <IconTray>
                        {m.url ? (
                          <TrayButton
                            label="Open source"
                            onClick={() => onOpenUrl?.(m.url)}
                          >
                            <ExternalLink
                              size={14}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          </TrayButton>
                        ) : null}
                      </IconTray>
                    </li>
                  ))}
                </ul>
              </NudgeFold>
            ) : null}

            {semanticCount > 0 ? (
              <NudgeFold title={`Highly related · ${semanticCount}`}>
                <ul>
                  {semantic.slice(0, 5).map((m) => (
                    <li key={m.id}>
                      <div className="syncle-memory-nudge__related-body">
                        <RelatedQuote url={m.sourceUrl} onOpen={onOpenUrl}>
                          {m.quote || m.title || "Related memory"}
                        </RelatedQuote>
                        <MatchBar score={m.score} />
                        <RelatedMeta
                          createdAt={m.createdAt}
                          url={m.sourceUrl}
                        />
                      </div>
                      <IconTray>
                        {m.sourceUrl ? (
                          <TrayButton
                            label="Open source"
                            onClick={() => onOpenUrl?.(m.sourceUrl)}
                          >
                            <ExternalLink
                              size={14}
                              strokeWidth={2}
                              aria-hidden="true"
                            />
                          </TrayButton>
                        ) : null}
                        <TrayButton
                          label="Not related"
                          onClick={() => onRejectSemantic?.(m.id)}
                        >
                          <ThumbsDown
                            size={14}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </TrayButton>
                      </IconTray>
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
              </NudgeFold>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
