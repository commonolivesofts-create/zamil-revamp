import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { appConfig } from '@/config/appConfig.js'
import { paletteCommands, searchCommands } from '@/config/appNavigation.js'
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
  const commands = useMemo(() => paletteCommands(access, status), [access, status])
  const filtered = useMemo(() => searchCommands(commands, query), [commands, query])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

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
    navigate(item.path)
  }

  return (
    <div
      id="command-modal" className={`fixed inset-0 z-[90] items-start justify-center bg-black/55 px-3 pt-[8vh] backdrop-blur-md ${open ? 'flex' : 'hidden'}`}
      role="dialog" aria-modal="true" aria-labelledby="command-title" aria-hidden={!open} inert={!open}
      onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
      ref={dialogRef}
    >
      <div className="glass-panel w-full max-w-2xl overflow-hidden rounded-3xl">
        <h2 id="command-title" className="sr-only">Search {appConfig.name}</h2>
        <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: 'var(--line)' }}>
          <OrvexaIcon name="search" className="size-[18px]" style={{ color: 'var(--muted)' }} />
          <input
            id="command-input" ref={input} autoComplete="off" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)) }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
              else if (event.key === 'Enter' && filtered.length) { event.preventDefault(); pick(filtered[Math.min(activeIndex, filtered.length - 1)]) }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
            aria-label="Search pages"
            placeholder="Search pages..."
          />
          <button type="button" onClick={close} className="rounded-lg border px-2 py-1 text-[12px] font-bold" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>ESC</button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-2">
          <div className="px-3 pb-1 pt-3 text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>Navigate</div>
          {filtered.map((item, index) => (
            <button type="button" key={item.id} className={`command-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 ${activeIndex === index ? 'bg-black/5 dark:bg-white/5' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => pick(item)}>
              <OrvexaIcon name={item.icon || 'circle'} className="size-4" style={{ color: 'var(--primary-text)' }} />
              <span className="text-xs font-bold">{item.label}</span>
              <span className="ml-auto text-[12px]" style={{ color: 'var(--muted)' }}>{item.group}</span>
            </button>
          ))}
          {!filtered.length && <div className="px-4 py-10 text-center" id="command-empty"><OrvexaIcon name="search-x" className="mx-auto size-7" /><p className="mt-3 text-xs font-bold">No matching page</p><p className="mt-1 text-[12px]" style={{ color: 'var(--muted)' }}>{commands.length ? 'Try a different keyword.' : 'No pages are available to your account.'}</p></div>}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2.5 text-[12px]" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
          <span>↵ select</span><span>esc close</span><span className="ml-auto">{appConfig.name} navigation</span>
        </div>
      </div>
    </div>
  )
}
