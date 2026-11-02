import { lazy, Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation, useRouteError } from 'react-router'
import PageState from '@/components/feedback/PageState.jsx'
import { findAppRoute } from '@/config/appNavigation.js'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'
import { templateDemosAvailable } from '@/config/authRouting.js'
import useAuth from '@/features/auth/useAuth.js'

// React components live outside router.jsx so that Fast Refresh can safely
// distinguish component exports from the router configuration export.
export const AdminLayout = lazy(() => import('@/layouts/AdminLayout.jsx'))
export const AuthLayout = lazy(() => import('@/layouts/AuthLayout.jsx'))
export const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage.jsx'))
export const DemoPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.DemoUnconvertedPage })))
export const LoginPage = lazy(() => import('@/pages/auth/LoginPage.jsx'))
export const ForgotPage = lazy(() => import('@/pages/auth/ForgotPasswordPage.jsx'))
export const MfaChallengePage = lazy(() => import('@/pages/auth/MfaChallengePage.jsx'))
export const MfaEnrollmentPage = lazy(() => import('@/pages/auth/MfaEnrollmentPage.jsx'))
export const MfaReplacementPage = lazy(() => import('@/pages/auth/MfaReplacementPage.jsx'))
export const PasswordSetupPage = lazy(() => import('@/pages/auth/PasswordSetupPage.jsx'))
export const PasswordResetPage = lazy(() => import('@/pages/auth/PasswordResetPage.jsx'))
export const MfaRecoveryPage = lazy(() => import('@/pages/auth/MfaRecoveryPage.jsx'))
export const ChangePasswordPage = lazy(() => import('@/pages/auth/ChangePasswordPage.jsx'))
// Security administration (Stage 3).
export const UserAccountsPage = lazy(() => import('@/features/security-administration/pages/UserAccountsPage.jsx'))
export const UserAccountDetailPage = lazy(() => import('@/features/security-administration/pages/UserAccountDetailPage.jsx'))
export const RolesPage = lazy(() => import('@/features/security-administration/pages/RolesPage.jsx'))
export const RolePermissionsPage = lazy(() => import('@/features/security-administration/pages/RolePermissionsPage.jsx'))
export const UserRolesPage = lazy(() => import('@/features/security-administration/pages/UserRolesPage.jsx'))
export const UserRoleAssignmentsPage = lazy(() => import('@/features/security-administration/pages/UserRoleAssignmentsPage.jsx'))
export const PermissionCatalogPage = lazy(() => import('@/features/security-administration/pages/PermissionCatalogPage.jsx'))
export const PermissionOverridesPage = lazy(() => import('@/features/security-administration/pages/PermissionOverridesPage.jsx'))
export const UserOverridesPage = lazy(() => import('@/features/security-administration/pages/UserOverridesPage.jsx'))
// HR recruitment forms and employee reports.
export const RequisitionPage = lazy(() => import('@/features/hr-recruitment/requisition/RequisitionPage.jsx'))
export const InterviewPage = lazy(() => import('@/features/hr-recruitment/interview/InterviewPage.jsx'))
export const OfferPage = lazy(() => import('@/features/hr-recruitment/offer/OfferPage.jsx'))
export const OrientationPage = lazy(() => import('@/features/hr-recruitment/orientation/OrientationPage.jsx'))
export const ProbationPage = lazy(() => import('@/features/hr-recruitment/probation/ProbationPage.jsx'))
export const EmployeeReportPage = lazy(() => import('@/features/hr-recruitment/report/EmployeeReportPage.jsx'))
export const PeriodwiseEmployeesPage = lazy(() => import('@/features/hr-recruitment/report/PeriodwiseEmployeesPage.jsx'))

// HR employee services.
export const RecordChangePage = lazy(() => import('@/features/hr-employee-services/recordChange/RecordChangePage.jsx'))
export const RecordChangeRequestsPage = lazy(() => import('@/features/hr-employee-services/recordChange/RecordChangeRequestsPage.jsx'))
export const TransferPage = lazy(() => import('@/features/hr-employee-services/transfer/TransferPage.jsx'))
export const TransferReportPage = lazy(() => import('@/features/hr-employee-services/transfer/TransferReportPage.jsx'))
export const AppraisalPage = lazy(() => import('@/features/hr-employee-services/performance/AppraisalPage.jsx'))
export const DeniedPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.AccessDeniedPage })))
export const AccessPendingPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.AccessPendingPage })))
export const AccessUnavailablePage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.AccessUnavailablePage })))
export const NotFoundPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.NotFoundPage })))
export const ErrorPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.RouteErrorPage })))

function RouteAnnouncement() {
  const { pathname } = useLocation()
  const { status } = useAuth()
  const labels = {
    '/': 'Redirecting',
    '/login': 'Sign in',
    '/forgot-password': 'Reset your password',
    '/password/setup': 'Set up your password',
    '/password/reset': 'Choose a new password',
    '/mfa/recovery': 'Recover your authenticator',
    '/mfa/verify': 'Verify your sign-in',
    '/mfa/enroll': 'Set up your authenticator',
    '/403': 'Access denied',
  }
  // Application pages are named by the shared navigation configuration.
  const match = findAppRoute(pathname)
  const appRoute = match?.implemented ? match : null
  const demo = orvexaDemoRoutes.find((item) => item.path === pathname)
  const demoName = demo && templateDemosAvailable(status) ? demo.label : null
  const pageName = labels[pathname] || appRoute?.label || demoName || 'Page not found'
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
