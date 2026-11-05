import { lazy, Suspense } from 'react'
import { Outlet, ScrollRestoration, useLocation, useRouteError } from 'react-router'
import StartupLoading from '@/components/feedback/StartupLoading.jsx'
import { findAppRoute } from '@/config/appNavigation.js'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'
import { templateDemosAvailable } from '@/config/authRouting.js'
import useAuth from '@/features/auth/useAuth.js'

// React components live outside router.jsx so that Fast Refresh can safely
// distinguish component exports from the router configuration export.
// Keep the small shared layouts available before session restoration finishes;
// only feature pages need route chunks.
export { default as AdminLayout } from '@/layouts/AdminLayout.jsx'
export { default as AuthLayout } from '@/layouts/AuthLayout.jsx'
export const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage.jsx'))
export const PendingWorklistPage = lazy(() => import('@/features/worklist/PendingWorklistPage.jsx'))
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
export const RecruitmentDashboardPage = lazy(() => import('@/features/hr-recruitment/dashboard/RecruitmentDashboardPage.jsx'))
export const RequisitionPage = lazy(() => import('@/features/hr-recruitment/requisition/RequisitionPage.jsx'))
export const RequisitionReportPage = lazy(() => import('@/features/hr-recruitment/requisition/RequisitionReportPage.jsx'))
export const InterviewPage = lazy(() => import('@/features/hr-recruitment/interview/InterviewPage.jsx'))
export const InterviewReportPage = lazy(() => import('@/features/hr-recruitment/interview/InterviewReportPage.jsx'))
export const OfferPage = lazy(() => import('@/features/hr-recruitment/offer/OfferPage.jsx'))
export const OfferReportPage = lazy(() => import('@/features/hr-recruitment/offer/OfferReportPage.jsx'))
export const OrientationPage = lazy(() => import('@/features/hr-recruitment/orientation/OrientationPage.jsx'))
export const OrientationReportPage = lazy(() => import('@/features/hr-recruitment/orientation/OrientationReportPage.jsx'))
export const ProbationPage = lazy(() => import('@/features/hr-recruitment/probation/ProbationPage.jsx'))
export const ProbationReportPage = lazy(() => import('@/features/hr-recruitment/probation/ProbationReportPage.jsx'))
export const EmployeeReportPage = lazy(() => import('@/features/hr-recruitment/report/EmployeeReportPage.jsx'))
export const PeriodwiseEmployeesPage = lazy(() => import('@/features/hr-recruitment/report/PeriodwiseEmployeesPage.jsx'))

// HR employee services.
export const RecordChangePage = lazy(() => import('@/features/hr-employee-services/recordChange/RecordChangePage.jsx'))
export const RecordChangeRequestsPage = lazy(() => import('@/features/hr-employee-services/recordChange/RecordChangeRequestsPage.jsx'))
export const TransferPage = lazy(() => import('@/features/hr-employee-services/transfer/TransferPage.jsx'))
export const TransferReportPage = lazy(() => import('@/features/hr-employee-services/transfer/TransferReportPage.jsx'))
export const AppraisalPage = lazy(() => import('@/features/hr-employee-services/performance/AppraisalPage.jsx'))
export const AppraisalReportPage = lazy(() => import('@/features/hr-employee-services/performance/AppraisalReportPage.jsx'))
export const SickLeavePage = lazy(() => import('@/features/hr-employee-services/sickLeave/SickLeavePage.jsx'))
export const SickLeaveReportPage = lazy(() => import('@/features/hr-employee-services/sickLeave/SickLeaveReportPage.jsx'))
export const RewardPage = lazy(() => import('@/features/hr-employee-services/reward/RewardPage.jsx'))
export const RewardReportPage = lazy(() => import('@/features/hr-employee-services/reward/RewardReportPage.jsx'))
export const IdeaPage = lazy(() => import('@/features/hr-employee-services/idea/IdeaPage.jsx'))
export const IdeaReportPage = lazy(() => import('@/features/hr-employee-services/idea/IdeaReportPage.jsx'))
export const ClearancePage = lazy(() => import('@/features/hr-employee-services/clearance/ClearancePage.jsx'))
export const ClearanceReportPage = lazy(() => import('@/features/hr-employee-services/clearance/ClearanceReportPage.jsx'))
export const CharterPage = lazy(() => import('@/features/hr-employee-services/charter/CharterPage.jsx'))
export const CharterReportPage = lazy(() => import('@/features/hr-employee-services/charter/CharterReportPage.jsx'))
export const SurveyReportPage = lazy(() => import('@/features/hr-employee-services/survey/SurveyReportPage.jsx'))
export const SurveyResponsesPage = lazy(() => import('@/features/hr-employee-services/survey/SurveyResponsesPage.jsx'))
export const SalaryCertificatePage = lazy(() => import('@/features/hr-employee-services/salaryCertificate/SalaryCertificatePage.jsx'))
export const SalaryCertificateReportPage = lazy(() => import('@/features/hr-employee-services/salaryCertificate/SalaryCertificateReportPage.jsx'))
export const BusinessVisaPage = lazy(() => import('@/features/hr-employee-services/businessVisa/BusinessVisaPage.jsx'))
export const BusinessVisaReportPage = lazy(() => import('@/features/hr-employee-services/businessVisa/BusinessVisaReportPage.jsx'))
export const WarningLetterPage = lazy(() => import('@/features/hr-employee-services/warningLetter/WarningLetterPage.jsx'))
export const WarningLetterReportPage = lazy(() => import('@/features/hr-employee-services/warningLetter/WarningLetterReportPage.jsx'))
export const TouristVisaPage = lazy(() => import('@/features/hr-employee-services/touristVisa/TouristVisaPage.jsx'))
export const TouristVisaReportPage = lazy(() => import('@/features/hr-employee-services/touristVisa/TouristVisaReportPage.jsx'))
export const BusinessVisaLetterPage = lazy(() => import('@/features/hr-employee-services/businessVisaLetter/BusinessVisaLetterPage.jsx'))
export const BusinessVisaLetterReportPage = lazy(() => import('@/features/hr-employee-services/businessVisaLetter/BusinessVisaLetterReportPage.jsx'))
export const WorkflowOverviewPage = lazy(() => import('@/features/workflow-manager/pages/WorkflowOverviewPage.jsx'))
export const FormRegistryPage = lazy(() => import('@/features/workflow-manager/pages/FormRegistryPage.jsx'))
export const FormRegistrationPage = lazy(() => import('@/features/workflow-manager/pages/FormRegistrationPage.jsx'))
export const FormRecordPage = lazy(() => import('@/features/workflow-manager/pages/FormRecordPage.jsx'))
export const DataSourceRegistryPage = lazy(() => import('@/features/workflow-manager/pages/DataSourceRegistryPage.jsx'))
export const DeniedPage = lazy(() => import('@/pages/PhasePages.jsx').then((mod) => ({ default: mod.AccessDeniedPage })))
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
    <Suspense fallback={<StartupLoading />}>
      <ErrorPage error={error} />
    </Suspense>
  )
}
