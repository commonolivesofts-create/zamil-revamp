import { createBrowserRouter } from 'react-router'
import { GuestOnlyRoute, ProtectedRoute, RootRedirect } from '@/routes/RouteGuards.jsx'
import { orvexaDemoRoutes } from '@/config/orvexaRoutes.js'
import {
  AdminLayout,
  AuthLayout,
  DashboardPage,
  DemoPage,
  LoginPage,
  ForgotPage,
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
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              ...orvexaDemoRoutes.map(({ path }) => ({ path: path.slice(1), element: <DemoPage /> })),
            ],
          },
        ],
      },
      { path: '403', element: <DeniedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
