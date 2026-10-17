import { Navigate, Outlet, useLocation } from 'react-router'
import PageState from '@/components/feedback/PageState.jsx'
import { safeReturnTo } from '@/config/authRouting.js'
import useAuth from '@/features/auth/useAuth.js'

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
  const { status } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" />
  if (status === 'authenticated') return <Navigate to={safeReturnTo(location.state?.from)} replace />
  return <Outlet />
}

export function RootRedirect() {
  const { status, retrySession } = useAuth()
  if (status === 'loading') return <PageState kind="loading" title="Checking session" />
  if (status === 'error') return <PageState kind="error" title="Session check unavailable" description="Cannot verify your session." actionLabel="Retry session check" onAction={retrySession} />
  return <Navigate to={status === 'authenticated' || status === 'preview' ? '/dashboard' : '/login'} replace />
}
