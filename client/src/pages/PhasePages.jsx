import { Link, useLocation } from 'react-router'
import RouteNotice from '@/pages/RouteNotice.jsx'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'

export function DemoUnconvertedPage() {
  const location = useLocation()
  const entry = orvexaDemoRoutes.find((item) => item.path === location.pathname.replace(/\/+$/, ''))
  if (!entry) return <NotFoundPage />
  return (
    <RouteNotice
      eyebrow="Template demo · not yet converted"
      title={entry.label}
      description="This original menu entry is preserved for the React migration. Its demo page has not been converted, and no production business module has been created for it."
      source={entry.href}
    />
  )
}

// `reason="mfa"`: the permission is held, but the backend also requires a
// sign-in verified with an authenticator app for this area.
export function AccessDeniedPage({ reason }) {
  return (
    <RouteNotice
      eyebrow="403 · Access denied"
      title="You don't have access to this page"
      description={reason === 'mfa'
        ? 'This area requires a sign-in verified with your authenticator app. Sign out, then sign in again and complete the verification step.'
        : 'Your account does not have the permission required for this page. Contact your administrator if you need access.'}
    />
  )
}

export function AccessPendingPage() {
  return (
    <RouteNotice
      role="status" busy
      eyebrow="Checking access"
      title="Loading your permissions"
      description="This page opens once your access has been confirmed."
      actionLabel={null}
    />
  )
}

export function AccessUnavailablePage({ onRetry }) {
  return (
    <RouteNotice
      role="alert"
      eyebrow="Access check unavailable"
      title="Your permissions could not be loaded"
      description="This page was not opened because your access could not be confirmed. Check your connection and try again."
      actionLabel="Retry access check"
      onAction={onRetry}
    />
  )
}

export function NotFoundPage() {
  return (
    <RouteNotice
      eyebrow="404 · Page not found"
      title="We couldn't find that page"
      description="Check the URL or return to the dashboard."
    />
  )
}

// Shown to real sessions for template menu entries; the demos themselves are
// available only in the development preview (see TemplateDemoRoute).
export function TemplateDemoUnavailablePage() {
  return (
    <RouteNotice
      eyebrow="Not available"
      title="This page is not available yet"
      description="This menu entry comes from the original interface template and has no Zamil Revamp functionality yet."
    />
  )
}

export function RouteErrorPage({ error }) {
  const message = import.meta.env.DEV && error instanceof Error ? error.message : null
  return (
    <div className="zrv-route-page">
      <section className="zrv-route-notice" role="alert">
        <p className="zrv-route-notice__eyebrow">Application error</p>
        <h1 className="zrv-route-notice__title">This page couldn't be displayed</h1>
        <p className="zrv-route-notice__description">An unexpected error occurred while loading the route. You can return to the dashboard or reload.</p>
        {message && <p className="zrv-route-notice__source">{message}</p>}
        <Link className="zrv-route-notice__action" to="/dashboard">Back to dashboard</Link>
      </section>
    </div>
  )
}
