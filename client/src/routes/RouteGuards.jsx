import { Navigate, Outlet, useLocation, useMatches } from 'react-router'
import PageState from '@/components/feedback/PageState.jsx'
import { appRoutes, routeAccess } from '@/config/appNavigation.js'
import { mfaChallengePath, safeReturnTo, templateDemosAvailable } from '@/config/authRouting.js'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import {
  AccessPendingPage, AccessUnavailablePage, DeniedPage, NotFoundPage,
} from '@/routes/RouteComponents.jsx'

// An MFA-pending challenge is not a session, so it never passes this guard.
export function ProtectedRoute() {
  const location = useLocation()
  const { status, retrySession } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" description="Verifying your access." />
  if (status === 'error') return <PageState kind="error" title="Session check unavailable" description="The authentication server could not be reached. Protected content was not loaded." actionLabel="Retry session check" onAction={retrySession} />
  if (status !== 'authenticated' && status !== 'preview') {
    const from = safeReturnTo(`${location.pathname}${location.search}${location.hash}`)
    return <Navigate to="/login" state={{ from }} replace />
  }
  return <Outlet />
}

export function GuestOnlyRoute() {
  const location = useLocation()
  const { status, mfa } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" />
  if (status === 'authenticated') return <Navigate to={safeReturnTo(location.state?.from)} replace />
  if (status === 'mfa_required') return <Navigate to={mfaChallengePath(mfa)} state={{ from: location.state?.from }} replace />
  return <Outlet />
}

// MFA pages are reachable only while a challenge is pending, and only the page
// matching the challenge (enrollment or verification).
export function MfaChallengeRoute() {
  const location = useLocation()
  const { status, mfa } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" />
  if (status === 'authenticated') return <Navigate to={safeReturnTo(location.state?.from)} replace />
  if (status !== 'mfa_required') return <Navigate to="/login" state={{ from: location.state?.from }} replace />
  const expected = mfaChallengePath(mfa)
  if (location.pathname !== expected) return <Navigate to={expected} state={{ from: location.state?.from }} replace />
  return <Outlet />
}

// Every application page inside the signed-in layout declares its id from
// config/appNavigation.js in its route `handle`. Direct URLs, the sidebar and the
// command palette therefore share one access decision. A page without a known,
// implemented id is never rendered (fail closed). The backend still authorizes
// every API request the page makes.
export function AppRouteAccess() {
  const matches = useMatches()
  const access = usePermissions()
  const routeId = matches.at(-1)?.handle?.routeId
  const route = appRoutes.find((item) => item.id === routeId)
  switch (routeAccess(route, access)) {
    case 'allowed': return <Outlet />
    case 'pending': return <AccessPendingPage />
    case 'error': return <AccessUnavailablePage onRetry={access.reload} />
    case 'mfa_required': return <DeniedPage reason="mfa" />
    case 'denied': return <DeniedPage />
    default: return <NotFoundPage />
  }
}

// Template demo routes exist only for the development preview (never enabled
// in production builds). For every real session they do not exist: the
// ordinary not-found page, with no template wording.
export function TemplateDemoRoute() {
  const { status } = useAuth()
  return templateDemosAvailable(status) ? <Outlet /> : <NotFoundPage />
}

export function RootRedirect() {
  const { status, retrySession } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" />
  if (status === 'error') return <PageState kind="error" title="Session check unavailable" description="The authentication server could not be reached, so your session cannot be verified. Try again in a moment." actionLabel="Retry session check" onAction={retrySession} />
  return <Navigate to={status === 'authenticated' || status === 'preview' ? '/dashboard' : '/login'} replace />
}
