import { createBrowserRouter } from 'react-router'
import {
  AppRouteAccess, GuestOnlyRoute, MfaChallengeRoute, ProtectedRoute, RootRedirect, TemplateDemoRoute,
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
  UserAccountsPage,
  UserAccountDetailPage,
  RolesPage,
  RolePermissionsPage,
  UserRolesPage,
  UserRoleAssignmentsPage,
  PermissionCatalogPage,
  PermissionOverridesPage,
  UserOverridesPage,
  DeniedPage,
  NotFoundPage,
  RouterShell,
  RouteErrorBoundary,
} from '@/routes/RouteComponents.jsx'

// Centralized route table. Application pages are declared in
// config/appNavigation.js and guarded by AppRouteAccess. Template demo entries
// are generated from the original navigation data and render only in the
// development preview.
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
              {
                // Each application page names its entry in config/appNavigation.js;
                // AppRouteAccess applies that entry's permission requirements.
                element: <AppRouteAccess />,
                children: [
                  { path: 'dashboard', handle: { routeId: 'dashboard' }, element: <DashboardPage /> },
                  { path: 'account/authenticator', handle: { routeId: 'account-authenticator' }, element: <MfaReplacementPage /> },
                  { path: 'account/password', handle: { routeId: 'account-password' }, element: <ChangePasswordPage /> },
                  { path: 'security/users', handle: { routeId: 'user-accounts' }, element: <UserAccountsPage /> },
                  { path: 'security/users/:userId', handle: { routeId: 'user-account' }, element: <UserAccountDetailPage /> },
                  { path: 'security/roles', handle: { routeId: 'roles' }, element: <RolesPage /> },
                  { path: 'security/role-permissions', handle: { routeId: 'role-permissions' }, element: <RolePermissionsPage /> },
                  { path: 'security/user-roles', handle: { routeId: 'user-roles' }, element: <UserRolesPage /> },
                  { path: 'security/user-roles/:userId', handle: { routeId: 'user-role-assignments' }, element: <UserRoleAssignmentsPage /> },
                  { path: 'security/permission-catalog', handle: { routeId: 'permission-catalog' }, element: <PermissionCatalogPage /> },
                  { path: 'security/permission-overrides', handle: { routeId: 'permission-overrides' }, element: <PermissionOverridesPage /> },
                  { path: 'security/permission-overrides/:userId', handle: { routeId: 'user-permission-overrides' }, element: <UserOverridesPage /> },
                ],
              },
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
