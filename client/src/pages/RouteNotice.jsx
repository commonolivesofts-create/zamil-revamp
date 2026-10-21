import { Link } from 'react-router'
import '@/styles/route-states.css'

// `onAction` renders the action as a button (for example a retry) instead of a link;
// `actionLabel={null}` renders no action.
export default function RouteNotice({ eyebrow, title, description, source, actionLabel = 'Back to dashboard', to = '/dashboard', onAction, role, busy = false }) {
  return (
    <section className="zrv-route-notice" aria-labelledby="zrv-route-title" role={role} aria-busy={busy || undefined}>
      {eyebrow && <p className="zrv-route-notice__eyebrow">{eyebrow}</p>}
      <h1 className="zrv-route-notice__title" id="zrv-route-title">{title}</h1>
      {description && <p className="zrv-route-notice__description">{description}</p>}
      {source && <p className="zrv-route-notice__source">Original template page: <code>{source}</code></p>}
      {actionLabel && (onAction
        ? <button type="button" className="zrv-route-notice__action" onClick={onAction}>{actionLabel}</button>
        : <Link className="zrv-route-notice__action" to={to}>{actionLabel}</Link>)}
    </section>
  )
}
