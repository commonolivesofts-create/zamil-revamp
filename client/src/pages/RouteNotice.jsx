import { Link } from 'react-router'
import '@/styles/route-states.css'

export default function RouteNotice({ eyebrow, title, description, source, actionLabel = 'Back to dashboard', to = '/dashboard' }) {
  return (
    <section className="zrv-route-notice" aria-labelledby="zrv-route-title">
      {eyebrow && <p className="zrv-route-notice__eyebrow">{eyebrow}</p>}
      <h1 className="zrv-route-notice__title" id="zrv-route-title">{title}</h1>
      {description && <p className="zrv-route-notice__description">{description}</p>}
      {source && <p className="zrv-route-notice__source">Original template page: <code>{source}</code></p>}
      <Link className="zrv-route-notice__action" to={to}>{actionLabel}</Link>
    </section>
  )
}
