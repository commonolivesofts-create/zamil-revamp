import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { BOOK_PAGES } from "@/features/dashboard/dashboardExperience.js";
import { shouldReduceMotion } from "@/features/dashboard/useDashboardMotion.js";

const FAVORITES_KEY = "zrv-dashboard-hr-favorites";
const TURN_DURATION = 620;
const readFavorites = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
};

function BookBody({ page, onOpenPage }) {
  const body = page.body;

  if (body.kind === "people") {
    return (
      <div className="book-form-list">
        {body.rows.map((row) => (
          <button className="book-mini-link" key={row.id} type="button" onClick={() => onOpenPage(row)} aria-label={`Open ${row.label}`}>
            <OrvexaIcon name={row.icon || "file-text"} />
            <span>{row.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (body.kind === "finance") {
    return (
      <div className="book-finance-visual">
        <div className="book-finance-label">CREDIT NOTE PREVIEW</div>
        <div className="book-finance-number">{body.number}</div>
        {body.rows.map((row) => (
          <div className="book-finance-row" key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (body.kind === "approvals") {
    return body.rows.map((row) => (
      <div className="book-queue-row" key={row.label}>
        <i aria-hidden="true" />
        <span>{row.label}</span>
        <small>{row.team}</small>
      </div>
    ));
  }

  if (body.kind === "insights") {
    return (
      <>
        <div className="book-chart" aria-hidden="true">
          {body.bars.map((height, index) => (
            <span key={index} style={{ "--height": `${height}%` }} />
          ))}
        </div>
        <div className="book-big-metric">
          {body.metric} <small>{body.caption}</small>
        </div>
      </>
    );
  }

  if (body.kind === "explore") {
    return (
      <div className="book-space-tags">
        {body.tags.map((tag) => (
          <span key={tag.label}>
            <OrvexaIcon name={tag.icon} />
            {tag.label}
          </span>
        ))}
      </div>
    );
  }

  return null;
}

function LeafContents({ page, index, onOpenPage }) {
  const number = String(index + 1).padStart(2, "0");
  return (
    <>
      <div className="book-leaf-top">
        <span className="book-leaf-index">ZAMIL / {number}</span>
        <span className="book-leaf-icon">
          <OrvexaIcon name={page.icon} />
        </span>
      </div>
      <div className="book-leaf-contents">
        <h3 className="book-leaf-title">
          {page.name}
          <br />
          workspace.
        </h3>
        <p className="book-leaf-desc">{page.description}</p>
        <div className="book-leaf-body">
          <BookBody page={page} onOpenPage={onOpenPage} />
        </div>
      </div>
    </>
  );
}

// A five-page folio. Hovering a chapter previews it and the page arrows turn the
// leaf with the original physical overlay. Only the Explore page has a live
// destination (Module Atlas); the deferred workflow pages stay visual previews.
export default function FolioBook({ onNavigate, hrPages = [], onOpenPage }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [flip, setFlip] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const [favorites, setFavorites] = useState(readFavorites);
  const [pickerOpen, setPickerOpen] = useState(false);
  const availableHrPages = hrPages.filter((page) => page.path && !page.external);
  const selectedHrPages = favorites.map((id) => availableHrPages.find((page) => page.id === id)).filter(Boolean);
  const hrPage = { ...BOOK_PAGES[0], body: { kind: "people", rows: selectedHrPages } };
  const pages = BOOK_PAGES.map((page) => page.id === "people" ? hrPage : page);
  useEffect(() => {
    if (favorites.length) return;
    const initial = availableHrPages.slice(0, 6).map((page) => page.id);
    if (!initial.length) return;
    setFavorites(initial);
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(initial));
  }, [availableHrPages, favorites.length]);
  const toggleFavorite = (page) => {
    const next = favorites.includes(page.id)
      ? favorites.filter((id) => id !== page.id)
      : favorites.length < 6 ? [...favorites, page.id] : favorites;
    setFavorites(next);
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  };
  const visualRef = useRef(null);
  const chapterRefs = useRef([]);
  const turningRef = useRef(false);
  const timerRef = useRef(null);
  const reduceMotion = shouldReduceMotion();

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const selectPage = useCallback(
    (nextIndex) => {
      const total = pages.length;
      const normalized = ((nextIndex % total) + total) % total;
      if (normalized === activeIndex || turningRef.current) return;

      if (!reduceMotion) {
        const forwardDistance = (normalized - activeIndex + total) % total;
        const direction = forwardDistance <= total / 2 ? "next" : "prev";
        setFlip({ page: pages[activeIndex], index: activeIndex, direction });
        turningRef.current = true;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setFlip(null);
          turningRef.current = false;
        }, TURN_DURATION);
      }

      setActiveIndex(normalized);
      setAnnouncement(`Page ${normalized + 1} of ${total}: ${pages[normalized].name} workspace`);
    },
    [activeIndex, pages, reduceMotion],
  );

  const turn = useCallback(
    (direction) => {
      selectPage(activeIndex + direction);
    },
    [activeIndex, selectPage],
  );

  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target.closest?.("input, textarea, select")) return;
    event.preventDefault();
    turn(event.key === "ArrowRight" ? 1 : -1);
  };

  const onChapterKeyDown = (event, index) => {
    if (
      !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    // Chapter navigation is its own control: do not let the same arrow key
    // bubble to the folio handler and turn the page as well.
    event.preventDefault();
    event.stopPropagation();
    const direction =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = (index + direction + pages.length) % pages.length;
    chapterRefs.current[next]?.focus();
  };

  // A restrained pointer tilt: the scene keeps the fixed perspective from the
  // design, then follows the pointer within a few degrees. Coarse pointers skip
  // it entirely and reduced-motion users keep the resting stance.
  useEffect(() => {
    const node = visualRef.current;
    if (
      !node ||
      reduceMotion ||
      window.matchMedia?.("(pointer: coarse)").matches
    )
      return undefined;
    let frame = 0;
    let lastEvent = null;
    const apply = () => {
      frame = 0;
      if (!lastEvent) return;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (lastEvent.clientX - rect.left) / rect.width - 0.5;
      const y = (lastEvent.clientY - rect.top) / rect.height - 0.5;
      node.style.setProperty("--tilt-x", `${(0.5 - y) * 7}deg`);
      node.style.setProperty("--tilt-y", `${x * 10}deg`);
    };
    const onMove = (event) => {
      if (event.pointerType === "touch") return;
      lastEvent = event;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };
    const onLeave = () => {
      lastEvent = null;
      node.style.removeProperty("--tilt-x");
      node.style.removeProperty("--tilt-y");
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    node.addEventListener("pointercancel", onLeave);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      node.removeEventListener("pointercancel", onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduceMotion]);

  return (
    <aside
      className="command-visual book-visual"
      ref={visualRef}
      aria-label="Interactive workspace library with five preview pages"
      onKeyDown={onKeyDown}
    >
      <div className="book-aura" aria-hidden="true" />
      <div className="book-grid" aria-hidden="true" />
      <div className="book-follow-links" aria-label="Follow Zamil Plastic on social media">
        <span>Follow Zamil Plastic</span>
        <a href="https://www.linkedin.com/company/zamil-plastic-industries-co" target="_blank" rel="noopener noreferrer" aria-label="Zamil Plastic on LinkedIn"><b>in</b><span>LinkedIn</span></a>
        <a href="https://www.facebook.com/ZamilPlasticIndustriesCo/" target="_blank" rel="noopener noreferrer" aria-label="Zamil Plastic on Facebook"><b>f</b><span>Facebook</span></a>
        <a href="https://x.com/zamilplastic?lang=en" target="_blank" rel="noopener noreferrer" aria-label="Zamil Plastic on X"><b>𝕏</b><span>X</span></a>
      </div>
      <div className="book-overline">
        <span className="book-live" aria-hidden="true" />
        YOUR WORKSPACE / FIVE DOORWAYS
      </div>
      <div className="book-scene">
        <div className={`book-stack${flip ? " is-transitioning" : ""}`}>
          <div className="book-backplate second" aria-hidden="true" />
          <div className="book-backplate" aria-hidden="true" />
          {pages.map((page, index) => {
            const active = index === activeIndex;
            const depth =
              (index - activeIndex + pages.length) % pages.length;
            return (
              <article
                className={`book-leaf ${active ? "is-active" : "is-behind"}`}
                key={page.id}
                aria-label={`${page.name} workspace preview`}
                aria-hidden={active ? undefined : "true"}
                inert={active ? undefined : true}
                style={{
                  "--sheet-depth": depth,
                  "--sheet-z": pages.length - depth,
                }}
              >
                <LeafContents page={page} index={index} onOpenPage={onOpenPage} />
                {active && (
                  <div className="book-leaf-bottom">
                    <div className="folio-turn-actions">
                      <button
                        className="folio-arrow"
                        type="button"
                        onClick={() => turn(-1)}
                        aria-label="Previous book page"
                        title="Previous page"
                      >
                        ←
                      </button>
                      <span className="folio-counter">
                        {String(index + 1).padStart(2, "0")} /{" "}
                        {String(pages.length).padStart(2, "0")}
                      </span>
                      <button
                        className="folio-arrow folio-next"
                        type="button"
                        onClick={() => turn(1)}
                        aria-label="Turn to next book page"
                        title="Next page"
                      >
                        →
                      </button>
                    </div>
                    <button
                      className="book-leaf-open"
                      type="button"
                      onClick={
                        page.id === "people" ? () => setPickerOpen(true) : page.view ? () => onNavigate(page.view) : undefined
                      }
                    >
                      {page.id === "people" ? "Choose HR forms" : page.action} <OrvexaIcon name="arrow-right" />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {flip && (
            <article className={`book-leaf folio-recede folio-recede-${flip.direction}`} aria-hidden="true">
              <LeafContents page={flip.page} index={flip.index} onOpenPage={onOpenPage} />
            </article>
          )}
        </div>
        <div
          className="book-chapters"
          role="group"
          aria-label="Choose a workspace: hover to preview, click to open"
        >
          {pages.map((page, index) => (
            <button
              className={`book-chapter ${index === activeIndex ? "is-current" : ""}`}
              type="button"
              key={page.id}
              ref={(node) => {
                chapterRefs.current[index] = node;
              }}
              onClick={() => {
                selectPage(index);
                if (page.view) onNavigate(page.view);
              }}
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") selectPage(index);
              }}
              onFocus={() => selectPage(index)}
              onKeyDown={(event) => onChapterKeyDown(event, index)}
              aria-label={
                page.view
                  ? `Open ${page.name} workspace`
                  : `Preview ${page.name} workspace`
              }
              aria-current={index === activeIndex ? "true" : "false"}
            >
              <span className="book-chapter-ic">
                <OrvexaIcon name={page.icon} />
              </span>
              <span>
                <strong>{page.name}</strong>
                <small>{page.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="book-caption">
          <span>USE THE ARROWS TO TURN PAGES · OPEN TO ENTER</span>
          <kbd>{String(pages.length).padStart(2, "0")} WORKSPACES</kbd>
        </div>
        <div className="book-floor" aria-hidden="true" />
      </div>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {pickerOpen && createPortal(<div className="folio-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}>
        <section className="folio-picker" role="dialog" aria-modal="true" aria-labelledby="folio-picker-title">
          <header><div><span className="folio-picker-kicker">PERSONAL SHORTCUTS</span><h2 id="folio-picker-title">Choose your six HR forms</h2><p>Pick up to six forms to keep on your Folio page.</p></div><button type="button" aria-label="Close" onClick={() => setPickerOpen(false)}>×</button></header>
          <div className="folio-picker-list">{availableHrPages.map((page) => <label key={page.id} className="folio-picker-option"><input type="checkbox" checked={favorites.includes(page.id)} disabled={!favorites.includes(page.id) && favorites.length >= 6} onChange={() => toggleFavorite(page)} /><OrvexaIcon name={page.icon || "file-text"} /><span>{page.label}</span><small>{page.group}</small></label>)}</div>
          {!availableHrPages.length && <p className="folio-picker-empty">No HR forms are currently available to your account.</p>}
          <footer><span>{favorites.filter((id) => availableHrPages.some((page) => page.id === id)).length} of 6 selected</span><button type="button" onClick={() => setPickerOpen(false)}>Done</button></footer>
        </section>
      </div>, document.body)}
    </aside>
  );
}
