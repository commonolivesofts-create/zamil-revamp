import { lazy, Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation, useRouteError } from 'react-router'
import PageState from '@/components/feedback/PageState.jsx'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'

// React components live outside router.jsx so that Fast Refresh can safely
// distinguish component exports from the router configuration export.
export const AdminLayout = lazy(() => import('@/layouts/AdminLayout.jsx'))
export const AuthLayout = lazy(() => import('@/layouts/AuthLayout.jsx'))
export const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage.jsx'))
export const DemoPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.DemoUnconvertedPage })))
export const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'))
export const ForgotPage = lazy(() => import('@/pages/auth/ForgotPasswordPage.jsx'))
export const DeniedPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.AccessDeniedPage })))
export const NotFoundPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.NotFoundPage })))
export const ErrorPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.RouteErrorPage })))

function RouteAnnouncement() {
  const { pathname } = useLocation()
  const labels = {
    '/': 'Redirecting',
    '/dashboard': 'Dashboard',
    '/login': 'Sign in',
    '/forgot-password': 'Recover admin access',
    '/403': 'Access denied',
  }
  const demo = orvexaDemoRoutes.find((item) => item.path === pathname)
  const pageName = labels[pathname] || demo?.label || 'Page not found'
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Page: {pageName}</p>
}

export function RouterShell() {
  return (
    <>
      <Outlet />
      <RouteAnnouncement />
      <ScrollRestoration />
    </>
  )
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  return (
    <Suspense fallback={<PageState kind="loading" title="Loading error page" />}>
      <ErrorPage error={error} />
    </Suspense>
  )
}
