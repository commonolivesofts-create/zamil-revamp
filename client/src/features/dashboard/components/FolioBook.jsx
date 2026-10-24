import { useCallback, useEffect, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { BOOK_PAGES } from '@/features/dashboard/dashboardExperience.js'
import { shouldReduceMotion } from '@/features/dashboard/useDashboardMotion.js'

const TURN_DURATION = 700

function BookBody({ page }) {
  const body = page.body

  if (body.kind === 'people') {
    return (
      <div className="book-form-list">
        {body.rows.map((row) => (
          <span className="book-mini-link" key={row.label}>
            <OrvexaIcon name={row.icon} />
            {row.label}
          </span>
        ))}
      </div>
    )
  }

  if (body.kind === 'finance') {
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
    )
  }

  if (body.kind === 'approvals') {
    return body.rows.map((row) => (
      <div className="book-queue-row" key={row.label}>
        <i aria-hidden="true" />
        <span>{row.label}</span>
        <small>{row.team}</small>
      </div>
    ))
  }

  if (body.kind === 'insights') {
    return (
      <>
        <div className="book-chart" aria-hidden="true">
          {body.bars.map((height, index) => (
            <span key={index} style={{ '--height': `${height}%` }} />
          ))}
        </div>
        <div className="book-big-metric">
          {body.metric} <small>{body.caption}</small>
        </div>
      </>
    )
  }

  if (body.kind === 'explore') {
    return (
      <div className="book-space-tags">
        {body.tags.map((tag) => (
          <span key={tag.label}>
            <OrvexaIcon name={tag.icon} />
            {tag.label}
          </span>
        ))}
      </div>
    )
  }

  return null
}

function LeafContents({ page, index }) {
  const number = String(index + 1).padStart(2, '0')
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
          <BookBody page={page} />
        </div>
      </div>
    </>
  )
}

// A five-page folio. Hovering a chapter previews it and the page arrows turn the
// leaf with the original physical overlay. Only the Explore page has a live
// destination (Module Atlas); the deferred workflow pages stay visual previews.
export default function FolioBook({ onNavigate }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [flip, setFlip] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const visualRef = useRef(null)
  const chapterRefs = useRef([])
  const turningRef = useRef(false)
  const timerRef = useRef(null)
  const reduceMotion = shouldReduceMotion()

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  const selectPage = useCallback((index) => {
    if (turningRef.current || index === activeIndex) return
    setActiveIndex(index)
    setAnnouncement(`Page ${index + 1} of ${BOOK_PAGES.length}: ${BOOK_PAGES[index].name} workspace`)
  }, [activeIndex])

  const changePage = useCallback((nextIndex, direction = 1) => {
    if (turningRef.current) return
    const total = BOOK_PAGES.length
    const normalized = ((nextIndex % total) + total) % total
    if (normalized === activeIndex) return

    if (!shouldReduceMotion()) {
      const previous = BOOK_PAGES[activeIndex]
      setFlip({ page: previous, index: activeIndex, direction })
      turningRef.current = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setFlip(null)
        turningRef.current = false
      }, TURN_DURATION)
    }

    setActiveIndex(normalized)
    setAnnouncement(`Page ${normalized + 1} of ${total}: ${BOOK_PAGES[normalized].name} workspace`)
  }, [activeIndex])

  const turn = useCallback((direction) => {
    changePage(activeIndex + direction, direction)
  }, [activeIndex, changePage])

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (event.target.closest?.('input, textarea, select')) return
    event.preventDefault()
    turn(event.key === 'ArrowRight' ? 1 : -1)
  }

  const onChapterKeyDown = (event, index) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    // Chapter navigation is its own control: do not let the same arrow key
    // bubble to the folio handler and turn the page as well.
    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const next = (index + direction + BOOK_PAGES.length) % BOOK_PAGES.length
    chapterRefs.current[next]?.focus()
  }

  // A restrained pointer tilt: the scene keeps the fixed perspective from the
  // design, then follows the pointer within a few degrees. Coarse pointers skip
  // it entirely and reduced-motion users keep the resting stance.
  useEffect(() => {
    const node = visualRef.current
    if (!node || reduceMotion || window.matchMedia?.('(pointer: coarse)').matches) return undefined
    let frame = 0
    let lastEvent = null
    const apply = () => {
      frame = 0
      if (!lastEvent) return
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = (lastEvent.clientX - rect.left) / rect.width - 0.5
      const y = (lastEvent.clientY - rect.top) / rect.height - 0.5
      node.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`)
      node.style.setProperty('--tilt-y', `${x * 10}deg`)
    }
    const onMove = (event) => {
      if (event.pointerType === 'touch') return
      lastEvent = event
      if (!frame) frame = window.requestAnimationFrame(apply)
    }
    const onLeave = () => {
      lastEvent = null
      node.style.removeProperty('--tilt-x')
      node.style.removeProperty('--tilt-y')
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    node.addEventListener('pointercancel', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('pointercancel', onLeave)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [reduceMotion])

  return (
    <aside
      className="command-visual book-visual"
      ref={visualRef}
      aria-label="Interactive workspace library with five preview pages"
      onKeyDown={onKeyDown}
    >
      <div className="book-aura" aria-hidden="true" />
      <div className="book-grid" aria-hidden="true" />
      <div className="book-overline">
        <span className="book-live" aria-hidden="true" />
        YOUR WORKSPACE / FIVE DOORWAYS
      </div>
      <div className="book-scene">
        <div className="book-stack">
          <div className="book-backplate second" aria-hidden="true" />
          <div className="book-backplate" aria-hidden="true" />
          {BOOK_PAGES.map((page, index) => {
            const active = index === activeIndex
            const depth = (index - activeIndex + BOOK_PAGES.length) % BOOK_PAGES.length
            return (
              <article
                className={`book-leaf ${active ? 'is-active' : 'is-behind'}`}
                key={page.id}
                aria-label={`${page.name} workspace preview`}
                aria-hidden={active ? undefined : 'true'}
                inert={active ? undefined : true}
                style={{ '--sheet-depth': depth, '--sheet-z': BOOK_PAGES.length - depth }}
              >
                <LeafContents page={page} index={index} />
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
                        {String(index + 1).padStart(2, '0')} / {String(BOOK_PAGES.length).padStart(2, '0')}
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
                      onClick={page.view ? () => onNavigate(page.view) : undefined}
                    >
                      {page.action} <OrvexaIcon name="arrow-right" />
                    </button>
                  </div>
                )}
              </article>
            )
          })}
          {flip && (
            <article
              className={`book-leaf folio-flip-sheet folio-flip-${flip.direction > 0 ? 'next' : 'prev'}`}
              aria-hidden="true"
            >
              <LeafContents page={flip.page} index={flip.index} />
            </article>
          )}
        </div>
        <div className="book-chapters" role="group" aria-label="Choose a workspace: hover to preview, click to open">
          {BOOK_PAGES.map((page, index) => (
            <button
              className={`book-chapter ${index === activeIndex ? 'is-current' : ''}`}
              type="button"
              key={page.id}
              ref={(node) => { chapterRefs.current[index] = node }}
              onClick={() => {
                selectPage(index)
                if (page.view) onNavigate(page.view)
              }}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch') selectPage(index)
              }}
              onFocus={() => selectPage(index)}
              onKeyDown={(event) => onChapterKeyDown(event, index)}
              aria-label={page.view ? `Open ${page.name} workspace` : `Preview ${page.name} workspace`}
              aria-current={index === activeIndex ? 'true' : 'false'}
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
          <kbd>{String(BOOK_PAGES.length).padStart(2, '0')} WORKSPACES</kbd>
        </div>
        <div className="book-floor" aria-hidden="true" />
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </aside>
  )
}
