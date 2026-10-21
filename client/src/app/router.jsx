import { createBrowserRouter } from 'react-router'
import {
  GuestOnlyRoute, MfaChallengeRoute, ProtectedRoute, RootRedirect, TemplateDemoRoute,
} from '@/routes/RouteGuards.jsx'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'
import {
  AdminLayout,
  AuthLayout,
  DashboardPage,
  DemoPage,
  LoginPage,
  ForgotPage,
  MfaChallengePage,
  MfaEnrollmentPage,
  MfaReplacementPage,
  PasswordSetupPage,
  PasswordResetPage,
  MfaRecoveryPage,
  ChangePasswordPage,
  DeniedPage,
  NotFoundPage,
  RouterShell,
  RouteErrorBoundary,
} from '@/routes/RouteComponents.jsx'

// Centralized route table. All demo entries are generated from the original
// navigation data; no extra demo business pages are implemented in Phase 05.
export const router = createBrowserRouter([
  {
    element: <RouterShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        element: <GuestOnlyRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'forgot-password', element: <ForgotPage /> },
            ],
          },
        ],
      },
      // Pages opened from e-mailed links: authorized by the link token, not by a
      // session, so they are reachable with or without one.
      {
        element: <AuthLayout />,
        children: [
          { path: 'password/setup', element: <PasswordSetupPage /> },
          { path: 'password/reset', element: <PasswordResetPage /> },
          { path: 'mfa/recovery', element: <MfaRecoveryPage /> },
        ],
      },
      {
        element: <MfaChallengeRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'mfa/verify', element: <MfaChallengePage /> },
              { path: 'mfa/enroll', element: <MfaEnrollmentPage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'account/authenticator', element: <MfaReplacementPage /> },
              { path: 'account/password', element: <ChangePasswordPage /> },
              {
                element: <TemplateDemoRoute />,
                children: orvexaDemoRoutes.map(({ path }) => ({ path: path.slice(1), element: <DemoPage /> })),
              },
            ],
          },
        ],
      },
      { path: '403', element: <DeniedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
