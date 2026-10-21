import { useEffect, useId, useRef } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { describeFailure } from '../adminFeedback.js'
import '@/styles/security-admin.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function AdminPage({ eyebrow = 'Security administration', title, description, actions, children }) {
  return (
    <div className="zrv-admin">
      <header className="zrv-admin__head">
        <div>
          <p className="zrv-admin__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {description && <p className="zrv-admin__lead">{description}</p>}
        </div>
        {actions && <div className="zrv-admin__actions">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

export function Panel({ title, description, actions, children, className = '' }) {
  const id = useId()
  return (
    <section className={`zrv-admin-panel ${className}`.trim()} aria-labelledby={title ? id : undefined}>
      {(title || actions) && (
        <div className="zrv-admin-panel__head">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="zrv-admin__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// Result of an action: success (status) or failure / unknown outcome (alert).
export function Feedback({ feedback, onDismiss }) {
  if (!feedback) return null
  const { kind, message, details = [] } = feedback
  return (
    <div className={`zrv-admin-feedback zrv-admin-feedback--${kind}`} role={kind === 'success' ? 'status' : 'alert'}>
      <OrvexaIcon name={kind === 'success' ? 'circle-check' : kind === 'unknown' ? 'circle-help' : 'circle-alert'} className="zrv-admin-feedback__icon" />
      <div>
        <p>{message}</p>
        {details.length > 0 && <ul>{details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
      </div>
      {onDismiss && <button type="button" className="zrv-admin-link" onClick={onDismiss} aria-label="Dismiss message"><OrvexaIcon name="x" /></button>}
    </div>
  )
}

// Loading, error (with retry) and empty states of a useResource() result.
// Renders children only when data is ready and not empty.
// A paginated result ({ items, pagination }) is empty only when the whole
// result is; a page past the end still renders, with its pagination.
const defaultIsEmpty = (data) => {
  if (Array.isArray(data)) return data.length === 0
  if (data?.pagination) return data.pagination.total === 0
  return !data
}

export function ResourceState({ resource, label, empty, notFound, isEmpty = defaultIsEmpty, children }) {
  if (resource.status === 'idle') return null
  if (resource.status === 'loading') return <p className="zrv-admin-state" role="status">Loading {label}…</p>
  // A record that does not exist is not retried.
  if (resource.status === 'error' && resource.error?.status === 404) {
    return <p className="zrv-admin-state" role="status">{notFound || empty}</p>
  }
  if (resource.status === 'error') {
    const failure = describeFailure(resource.error)
    return (
      <div className="zrv-admin-state zrv-admin-state--error" role="alert">
        <p>The {label} could not be loaded. {failure.message}</p>
        {!failure.sessionEnded && <button type="button" className="btn-secondary" onClick={resource.reload}>Retry</button>}
      </div>
    )
  }
  if (isEmpty(resource.data)) return <p className="zrv-admin-state" role="status">{empty}</p>
  return children(resource.data)
}

// Controls stay available on a page past the end (for example after records
// were removed), so the user can always get back.
export function Pagination({ pagination, onPage, disabled = false, label = 'Pages' }) {
  if (!pagination || (pagination.totalPages <= 1 && pagination.page <= 1)) {
    return pagination ? <p className="zrv-admin-pagination">{pagination.total} total</p> : null
  }
  return (
    <nav className="zrv-admin-pagination" aria-label={label}>
      <button type="button" className="btn-secondary" disabled={disabled || !pagination.hasPreviousPage} onClick={() => onPage(pagination.page - 1)}>
        <OrvexaIcon name="chevron-left" className="size-4" /> Previous
      </button>
      <span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.total} total</span>
      <button type="button" className="btn-secondary" disabled={disabled || !pagination.hasNextPage} onClick={() => onPage(pagination.page + 1)}>
        Next <OrvexaIcon name="chevron-right" className="size-4" />
      </button>
    </nav>
  )
}

const TONES = Object.freeze({
  ACTIVE: 'good', PENDING: 'warn', DISABLED: 'bad', ALLOW: 'good', DENY: 'bad',
})

export function Badge({ children, tone }) {
  const resolved = tone || TONES[children] || 'neutral'
  return <span className={`zrv-admin-badge zrv-admin-badge--${resolved}`}>{children}</span>
}

export const ActiveBadge = ({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }) =>
  <Badge tone={active ? 'good' : 'neutral'}>{active ? activeLabel : inactiveLabel}</Badge>

export function DetailList({ items }) {
  return (
    <dl className="zrv-admin-dl">
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value === null || value === undefined || value === '' ? 'is-empty' : undefined}>{value ?? 'Not recorded'}</dd>
        </div>
      ))}
    </dl>
  )
}

// Modal dialog: focus moves in (first [data-autofocus] or focusable element),
// Tab stays inside, Escape and the backdrop close it unless an action is
// pending, and focus returns to the element that opened it.
export function Dialog({ title, description, onClose, busy = false, wide = false, children }) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const previous = document.activeElement
    const node = ref.current
    const target = node?.querySelector('[data-autofocus]') || node?.querySelector(FOCUSABLE) || node
    target?.focus()
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus()
    }
  }, [])

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length > 0)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="zrv-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div
        ref={ref}
        className={`zrv-dialog ${wide ? 'zrv-dialog--wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId} className="zrv-dialog__description">{description}</p>}
        {children}
      </div>
    </div>
  )
}

export function DialogActions({ onCancel, pending, confirmLabel, pendingLabel = 'Working…', danger = false, confirmDisabled = false, submit = false, onConfirm }) {
  return (
    <div className="zrv-dialog__actions">
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
      <button
        type={submit ? 'submit' : 'button'}
        className={`btn-primary ${danger ? 'zrv-admin-danger' : ''}`.trim()}
        onClick={submit ? undefined : onConfirm}
        disabled={pending || confirmDisabled}
      >
        {pending ? pendingLabel : confirmLabel}
      </button>
    </div>
  )
}

// Confirmation for a sensitive change. `feedback` shows a failure inside the dialog.
export function ConfirmDialog({ title, description, confirmLabel, danger = false, pending, feedback, onConfirm, onClose, children, confirmDisabled }) {
  return (
    <Dialog title={title} description={description} onClose={onClose} busy={pending}>
      {children}
      <Feedback feedback={feedback?.kind === 'success' ? null : feedback} />
      <DialogActions onCancel={onClose} pending={pending} confirmLabel={confirmLabel} danger={danger} confirmDisabled={confirmDisabled} onConfirm={onConfirm} />
    </Dialog>
  )
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div className="field zrv-admin-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <small id={`${id}-hint`} className="zrv-admin-hint">{hint}</small>}
      {error && <small id={`${id}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}
