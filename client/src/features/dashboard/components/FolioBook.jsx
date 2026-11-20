import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { navigationSections } from '@/config/appNavigation.js'
import { BOOK_PAGES } from '@/features/dashboard/dashboardExperience.js'
import { shouldReduceMotion } from '@/features/dashboard/useDashboardMotion.js'

const TURN_DURATION = 620

const HR_SUBMODULES =
  navigationSections.find((section) => section.id === 'human-resources')?.subgroups ?? []

// Existing HR navigation with horizontal mouse-wheel scrolling.
function HrModuleNav({ groups, selectedId, onSelect }) {
  const navRef = useRef(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined

    const handleWheel = (event) => {
      if (event.ctrlKey || event.defaultPrevented) return

      if (nav.scrollWidth <= nav.clientWidth + 1) return

      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX

      if (!delta) return

      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? nav.clientWidth : 1

      event.preventDefault()
      event.stopPropagation()

      nav.scrollLeft += delta * multiplier
    }

    nav.addEventListener('wheel', handleWheel, {
      passive: false,
    })

    return () => {
      nav.removeEventListener('wheel', handleWheel)
    }
  }, [])

  return (
    <nav ref={navRef} className="book-hr-nav" aria-label="HR form areas" tabIndex={0}>
      {groups.map((group) => (
        <button
          className={`book-hr-nav-button${group.id === selectedId ? ' is-active' : ''}`}
          key={group.id}
          type="button"
          onClick={() => onSelect(group.id)}
          aria-pressed={group.external ? undefined : group.id === selectedId}
          title={group.external ? `Open ${group.label} in a new tab` : undefined}
        >
          <span className="book-hr-submodule-icon">
            <OrvexaIcon name={group.icon} />
          </span>
          <span>{group.label}</span>
        </button>
      ))}
    </nav>
  )
}

function BookBody({
  page,
  onOpenPage,
  hrGroups,
  selectedHrSubmodule,
  onSelectHrSubmodule,
  onBackToHrGroups,
}) {
  const body = page.body

  if (body.kind === 'people') {
    const activeGroup = hrGroups.find((group) => group.id === selectedHrSubmodule)

    return (
      <div className="book-hr-workspace">
        {activeGroup && (
          <HrModuleNav
            groups={hrGroups}
            selectedId={selectedHrSubmodule}
            onSelect={onSelectHrSubmodule}
          />
        )}

        <div className={`book-hr-flip${activeGroup ? ' is-flipped' : ''}`}>
          <div className="book-hr-face book-hr-front" aria-hidden={Boolean(activeGroup)}>
            {hrGroups.map((group) => (
              <button
                className="book-hr-submodule"
                key={group.id}
                type="button"
                onClick={() => onSelectHrSubmodule(group.id)}
                tabIndex={activeGroup ? -1 : 0}
              >
                <span className="book-hr-submodule-icon">
                  <OrvexaIcon name={group.icon} />
                </span>

                <span className="book-hr-submodule-copy">
                  <strong>{group.label}</strong>
                  <small>
                    {group.external
                      ? 'Open training'
                      : `${String(group.forms.length).padStart(2, '0')} forms`}
                  </small>
                </span>

                <OrvexaIcon name="arrow-right" className="book-hr-submodule-arrow" />
              </button>
            ))}
          </div>

          <div className="book-hr-face book-hr-back" aria-hidden={!activeGroup}>
            {activeGroup && (
              <>
                <div className="book-hr-form-list" aria-live="polite">
                  {activeGroup.forms.map((form) => (
                    <button
                      className="book-hr-form"
                      key={form.id}
                      type="button"
                      onClick={() => onOpenPage(form)}
                      tabIndex={activeGroup ? 0 : -1}
                    >
                      <OrvexaIcon name={form.icon || 'file-text'} className="book-hr-form-icon" />

                      <span className="book-hr-form-label">{form.label}</span>

                      <OrvexaIcon name="arrow-up-right" className="book-hr-form-open" />
                    </button>
                  ))}

                  {!activeGroup.forms.length && (
                    <p className="book-hr-empty">
                      No forms in this area are available to your account.
                    </p>
                  )}
                </div>

                <footer className="book-hr-back-controls">
                  <button
                    className="book-hr-back-button"
                    type="button"
                    onClick={onBackToHrGroups}
                    tabIndex={activeGroup ? 0 : -1}
                  >
                    <OrvexaIcon name="arrow-left" />
                    Back to areas
                  </button>

                  <span className="book-hr-form-count">
                    {String(activeGroup.forms.length).padStart(2, '0')} forms
                  </span>
                </footer>
              </>
            )}
          </div>
        </div>
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
            <span
              key={index}
              style={{
                '--height': `${height}%`,
              }}
            />
          ))}
        </div>

        <div className="book-big-metric">
          {body.metric}
          <small>{body.caption}</small>
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

function LeafContents({
  page,
  index,
  onOpenPage,
  hrGroups,
  selectedHrSubmodule,
  onSelectHrSubmodule,
  onBackToHrGroups,
}) {
  const number = String(index + 1).padStart(2, '0')

  const selectedGroup =
    page.id === 'people' ? hrGroups.find((group) => group.id === selectedHrSubmodule) : null

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
          {page.id === 'people' ? (
            `${selectedGroup?.label ?? 'HR forms'} workspace.`
          ) : (
            <>
              {page.name}
              <br />
              workspace.
            </>
          )}
        </h3>

        <p className="book-leaf-desc">
          {page.id === 'people' && selectedGroup ? 'Select a form to open' : page.description}
        </p>

        <div className="book-leaf-body">
          <BookBody
            page={page}
            onOpenPage={onOpenPage}
            hrGroups={hrGroups}
            selectedHrSubmodule={selectedHrSubmodule}
            onSelectHrSubmodule={onSelectHrSubmodule}
            onBackToHrGroups={onBackToHrGroups}
          />
        </div>
      </div>
    </>
  )
}

// Five-page dashboard folio.
// Existing page-turn behavior is preserved.
export default function FolioBook({ onNavigate, hrPages = [], onOpenPage }) {
  const [activeIndex, setActiveIndex] = useState(0)

  const [flip, setFlip] = useState(null)

  const [announcement, setAnnouncement] = useState('')

  const [selectedHrSubmodule, setSelectedHrSubmodule] = useState(null)

  const availableHrPages = useMemo(
    // Internal routes plus external pages placed in a sub-group (TrainingHub).
    () => hrPages.filter((page) => page.path || (page.type === 'external' && page.href)),
    [hrPages],
  )

  const hrGroups = useMemo(() => {
    const groups = HR_SUBMODULES.map((submodule) => ({
      ...submodule,
      forms: availableHrPages.filter((page) => page.subgroup === submodule.id),
    }))

    // Training Hub already exists in the
    // application navigation registry.
    // Reuse the resolved external URL.
    const trainingHub = hrPages.find(
      (page) =>
        page.id === 'training-hub' &&
        page.type === 'external' &&
        page.implemented !== false &&
        typeof page.href === 'string' &&
        page.href.length > 0,
    )

    if (trainingHub) {
      groups.push({
        id: trainingHub.id,
        label: trainingHub.label || trainingHub.title || 'Training Hub',
        icon: trainingHub.icon || 'graduation-cap',
        external: true,
        href: trainingHub.href,
        forms: [],
      })
    }

    return groups
  }, [availableHrPages, hrPages])

  const handleSelectHrSubmodule = useCallback(
    (groupId) => {
      const group = hrGroups.find((item) => item.id === groupId)

      if (!group) return

      if (group.external) {
        window.open(group.href, '_blank', 'noopener,noreferrer')
        return
      }

      setSelectedHrSubmodule(group.id)
    },
    [hrGroups],
  )

  const hrPage = useMemo(
    () => ({
      ...BOOK_PAGES[0],
      subtitle: 'HR areas',
      description: 'Choose an HR area to view its forms',
      action: 'Open HR workspace',
      body: {
        kind: 'people',
        rows: [],
      },
    }),
    [],
  )

  const pages = useMemo(
    () => BOOK_PAGES.map((page) => (page.id === 'people' ? hrPage : page)),
    [hrPage],
  )

  const visualRef = useRef(null)
  const chapterRefs = useRef([])
  const turningRef = useRef(false)
  const timerRef = useRef(null)

  const reduceMotion = shouldReduceMotion()

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    },
    [],
  )

  const selectPage = useCallback(
    (nextIndex) => {
      const total = pages.length

      const normalized = Math.max(0, Math.min(total - 1, nextIndex))

      if (normalized === activeIndex || turningRef.current) {
        return
      }

      setSelectedHrSubmodule(null)

      if (!reduceMotion) {
        const forwardDistance = (normalized - activeIndex + total) % total

        const direction = forwardDistance <= total / 2 ? 'next' : 'prev'

        setFlip({
          page: pages[activeIndex],
          index: activeIndex,
          direction,
        })

        turningRef.current = true

        if (timerRef.current) {
          window.clearTimeout(timerRef.current)
        }

        timerRef.current = window.setTimeout(() => {
          setFlip(null)
          turningRef.current = false
        }, TURN_DURATION)
      }

      setActiveIndex(normalized)

      setAnnouncement(`Page ${normalized + 1} of ${total}: ${pages[normalized].name} workspace`)
    },
    [activeIndex, pages, reduceMotion],
  )

  const turn = useCallback(
    (direction) => {
      selectPage(activeIndex + direction)
    },
    [activeIndex, selectPage],
  )

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    if (event.target.closest?.('input, textarea, select')) {
      return
    }

    event.preventDefault()

    turn(event.key === 'ArrowRight' ? 1 : -1)
  }

  const onChapterKeyDown = (event, index) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1

    const next = (index + direction + pages.length) % pages.length

    chapterRefs.current[next]?.focus()
  }

  // Preserve existing pointer tilt.
  useEffect(() => {
    const node = visualRef.current

    if (!node || reduceMotion || window.matchMedia?.('(pointer: coarse)').matches) {
      return undefined
    }

    let frame = 0
    let lastEvent = null

    const apply = () => {
      frame = 0

      if (!lastEvent) return

      const rect = node.getBoundingClientRect()

      if (!rect.width || !rect.height) {
        return
      }

      const x = (lastEvent.clientX - rect.left) / rect.width - 0.5

      const y = (lastEvent.clientY - rect.top) / rect.height - 0.5

      node.style.setProperty('--tilt-x', `${(0.5 - y) * 7}deg`)

      node.style.setProperty('--tilt-y', `${x * 10}deg`)
    }

    const onMove = (event) => {
      if (event.pointerType === 'touch') {
        return
      }

      lastEvent = event

      if (!frame) {
        frame = window.requestAnimationFrame(apply)
      }
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

      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [reduceMotion])

  return (
    <aside
      className={`command-visual book-visual${activeIndex === 0 ? ' is-hr-workspace' : ''}`}
      ref={visualRef}
      aria-label="Interactive workspace library with five preview pages"
      onKeyDown={onKeyDown}
    >
      <div className="book-aura" aria-hidden="true" />

      <div className="book-grid" aria-hidden="true" />

      <div className="book-follow-links" aria-label="Follow Zamil Plastic on social media">
        <span>Follow Zamil Plastic</span>

        <a
          href="https://www.linkedin.com/company/zamil-plastic-industries-co"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Zamil Plastic on LinkedIn"
        >
          <b>in</b>
          <span>LinkedIn</span>
        </a>

        <a
          href="https://www.facebook.com/ZamilPlasticIndustriesCo/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Zamil Plastic on Facebook"
        >
          <b>f</b>
          <span>Facebook</span>
        </a>

        <a
          href="https://x.com/zamilplastic?lang=en"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Zamil Plastic on X"
        >
          <b>𝕏</b>
          <span>X</span>
        </a>
      </div>

      <div className="book-overline">
        <span className="book-live" aria-hidden="true" />
        YOUR WORKSPACE / FIVE DOORWAYS
      </div>

      <div className="book-scene">
        <div className={`book-stack${flip ? ' is-transitioning' : ''}`}>
          <div className="book-backplate second" aria-hidden="true" />

          <div className="book-backplate" aria-hidden="true" />

          {pages.map((page, index) => {
            const active = index === activeIndex

            const depth = (index - activeIndex + pages.length) % pages.length

            return (
              <article
                className={`book-leaf ${page.id === 'people' ? 'book-leaf--hr ' : ''}${
                  page.id === 'insights' ? 'book-leaf--insights ' : ''
                }${active ? 'is-active' : 'is-behind'}`}
                key={page.id}
                aria-label={`${page.name} workspace preview`}
                aria-hidden={active ? undefined : 'true'}
                inert={active ? undefined : true}
                style={{
                  '--sheet-depth': depth,
                  '--sheet-z': pages.length - depth,
                }}
              >
                <LeafContents
                  page={page}
                  index={index}
                  onOpenPage={onOpenPage}
                  hrGroups={hrGroups}
                  selectedHrSubmodule={selectedHrSubmodule}
                  onSelectHrSubmodule={handleSelectHrSubmodule}
                  onBackToHrGroups={() => setSelectedHrSubmodule(null)}
                />

                {active && (
                  <div className="book-leaf-bottom">
                    <div className="folio-turn-actions">
                      <button
                        className="folio-arrow"
                        type="button"
                        onClick={() => turn(-1)}
                        aria-label="Previous book page"
                        title="Previous page"
                        disabled={index === 0 || Boolean(flip)}
                      >
                        ←
                      </button>

                      <span className="folio-counter">
                        {String(index + 1).padStart(2, '0')} /{' '}
                        {String(pages.length).padStart(2, '0')}
                      </span>

                      <button
                        className="folio-arrow folio-next"
                        type="button"
                        onClick={() => turn(1)}
                        aria-label="Turn to next book page"
                        title="Next page"
                        disabled={index === pages.length - 1 || Boolean(flip)}
                      >
                        →
                      </button>
                    </div>

                    {page.view && (
                      <button
                        className="book-leaf-open"
                        type="button"
                        onClick={() => onNavigate(page.view)}
                      >
                        {page.action}
                        <OrvexaIcon name="arrow-right" />
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          })}

          {flip && (
            <article
              className={`book-leaf folio-recede folio-recede-${flip.direction}`}
              aria-hidden="true"
            >
              <LeafContents
                page={flip.page}
                index={flip.index}
                onOpenPage={onOpenPage}
                hrGroups={hrGroups}
                selectedHrSubmodule={selectedHrSubmodule}
                onSelectHrSubmodule={handleSelectHrSubmodule}
                onBackToHrGroups={() => setSelectedHrSubmodule(null)}
              />
            </article>
          )}
        </div>

        <div
          className="book-chapters"
          role="group"
          aria-label="Choose a workspace: click to preview or open"
        >
          {pages.map((page, index) => (
            <button
              className={`book-chapter ${index === activeIndex ? 'is-current' : ''}`}
              type="button"
              key={page.id}
              ref={(node) => {
                chapterRefs.current[index] = node
              }}
              onClick={() => {
                selectPage(index)

                if (page.view) {
                  onNavigate(page.view)
                }
              }}
              onFocus={() => selectPage(index)}
              onKeyDown={(event) => onChapterKeyDown(event, index)}
              aria-label={
                page.view ? `Open ${page.name} workspace` : `Preview ${page.name} workspace`
              }
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

          <kbd>{String(pages.length).padStart(2, '0')} WORKSPACES</kbd>
        </div>

        <div className="book-floor" aria-hidden="true" />
      </div>

      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </aside>
  )
}
