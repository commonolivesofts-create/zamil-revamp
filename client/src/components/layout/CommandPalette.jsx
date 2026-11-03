import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import '@/styles/command-palette.css'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { appConfig } from '@/config/appConfig.js'
import { paletteCommands, searchCommands } from '@/config/appNavigation.js'
import { EXTERNAL_LINK_TARGET, EXTERNAL_WINDOW_FEATURES } from '@/config/externalDestinations.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'

// Lists exactly the pages the sidebar lists (shared navigation configuration);
// opening one still passes through the route guard.
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { status } = useAuth()
  const access = usePermissions()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const input = useRef(null)
  const dialogRef = useRef(null)
  const activeOption = useRef(null)
  const commands = useMemo(() => paletteCommands(access, status), [access, status])
  const filtered = useMemo(() => searchCommands(commands, query), [commands, query])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    if (open) activeOption.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, filtered.length, open])

  useEffect(() => {
    if (!open) return undefined
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open])

  const close = () => {
    setQuery('')
    setActiveIndex(0)
    onClose()
  }

  const pick = (item) => {
    close()
    // External destinations open in a new tab without opener or referrer.
    if (item.external) window.open(item.href, EXTERNAL_LINK_TARGET, EXTERNAL_WINDOW_FEATURES)
    else navigate(item.path)
  }

  return (
    <div
      id="command-modal"
      className={`command-overlay ${open ? 'is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-title"
      aria-hidden={!open}
      inert={!open}
      onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
      ref={dialogRef}
    >
      <div className="command-palette">
        <h2 id="command-title" className="sr-only">Search {appConfig.name}</h2>
        <div className="command-search-row">
          <OrvexaIcon name="search" className="command-search-icon" />
          <input
            id="command-input"
            ref={input}
            autoComplete="off"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % filtered.length) }
              else if (event.key === 'ArrowUp' && filtered.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length) }
              else if (event.key === 'Enter' && filtered.length) { event.preventDefault(); pick(filtered[Math.min(activeIndex, filtered.length - 1)]) }
            }}
            className="command-search-input"
            aria-label="Search pages"
            aria-controls="command-results"
            aria-activedescendant={filtered[activeIndex] ? `command-option-${filtered[activeIndex].id}` : undefined}
            placeholder="Search pages..."
          />
          <button type="button" onClick={close} className="command-close" aria-label="Close search">Esc</button>
        </div>
        <div className="command-results-region">
          <div className="command-results-heading">
            <span>{query ? 'Matching pages' : 'Pages you can open'}</span>
            <span>{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
          </div>
          <div id="command-results" className="command-results" role="listbox" aria-label="Search results">
            {filtered.map((item, index) => (
              <button
                id={`command-option-${item.id}`}
                role="option"
                aria-selected={activeIndex === index}
                type="button"
                key={item.id}
                ref={activeIndex === index ? activeOption : null}
                className={`command-option ${activeIndex === index ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(item)}
              >
                <span className="command-option-icon"><OrvexaIcon name={item.icon || 'circle'} /></span>
                <span className="command-option-copy"><strong>{item.label}</strong><small>{item.group}</small></span>
                {activeIndex === index && <span className="command-option-enter"><kbd>&#8629;</kbd> Enter</span>}
              </button>
            ))}
          </div>
          {!filtered.length && (
            <div className="command-empty" id="command-empty">
              <OrvexaIcon name="search-x" />
              <strong>No matching page</strong>
              <span>{commands.length ? 'Try a different keyword.' : 'No pages are available to your account.'}</span>
            </div>
          )}
        </div>
        <div className="command-footer">
          <span><kbd>&#8593;</kbd><kbd>&#8595;</kbd> Navigate</span>
          <span><kbd>&#8629;</kbd> Open page</span>
          <span><kbd>Esc</kbd> Close</span>
          <span className="command-footer-brand">{appConfig.name}<i />Navigation</span>
        </div>
      </div>
    </div>
  )
}
