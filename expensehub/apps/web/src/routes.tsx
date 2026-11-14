// UI-UX §4 routes. Every signed-in route sits in the app shell behind <RequireAuth>; role-only
// pages also check the nav model (the API checks again on every request).
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RequireAuth, RequireNav } from './components/auth/RequireAuth';
import { AppShell } from './components/shell/AppShell';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { AuditQueuePage } from './features/audit/AuditQueuePage';
import { AuditWorkspacePage } from './features/audit/AuditWorkspacePage';
import { LoginPage } from './features/auth/LoginPage';
import { ResetPage } from './features/auth/ResetPage';
import { NotFoundPage } from './features/errors/NotFoundPage';
import { ExpenseEntryPage } from './features/expenses/ExpenseEntryPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { HomePage } from './features/home/HomePage';
import { IntegrationsPage } from './features/integrations/IntegrationsPage';
import { ApprovalRulesPage } from './features/setup/ApprovalRulesPage';
import { AuditRulesPage } from './features/setup/AuditRulesPage';
import { ExpenseTypesPage } from './features/setup/ExpenseTypesPage';
import { HistoryPage } from './features/setup/HistoryPage';
import { OptionsPage } from './features/setup/OptionsPage';
import { PayablesPage } from './features/payables/PayablesPage';
import { QuickPaysPage } from './features/payables/QuickPaysPage';
import { ClaimStatusPage } from './features/reports/ClaimStatusPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { PrerequisitesPage } from './features/setup/PrerequisitesPage';
import { RolesPage } from './features/setup/RolesPage';
import { SetupLayout } from './features/setup/SetupLayout';
import { StatusPage } from './features/system/StatusPage';

// D-33: the dev Mail page exists only in dev builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/mail',
        lazy: async () => ({ Component: (await import('./features/dev/MailPage')).MailPage }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/reset', element: <ResetPage /> },
  ...devRoutes,
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'expenses', element: <ExpensesPage /> },
          { path: 'expenses/new', element: <ExpenseEntryPage /> },
          { path: 'expenses/:id', element: <ExpenseEntryPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/:id', element: <ReportsPage /> },
          { path: 'status', element: <ClaimStatusPage /> },
          {
            path: 'approvals',
            element: (
              <RequireNav id="approvals">
                <ApprovalsPage />
              </RequireNav>
            ),
          },
          {
            path: 'audit',
            element: (
              <RequireNav id="audit">
                <AuditQueuePage />
              </RequireNav>
            ),
          },
          // Not nav-guarded: under D-34 an auditor may be a supervisor without the Accountant
          // role; the API allows only the open audit step's assignee to act.
          { path: 'audit/:id', element: <AuditWorkspacePage /> },
          {
            path: 'finance/payables',
            element: (
              <RequireNav id="payables">
                <PayablesPage />
              </RequireNav>
            ),
          },
          {
            path: 'finance/quick-pays',
            element: (
              <RequireNav id="quickPays">
                <QuickPaysPage />
              </RequireNav>
            ),
          },
          // D-36: the dev Fusion simulator lives in the app shell, dev builds only.
          ...(import.meta.env.DEV
            ? [
                {
                  path: 'dev/fusion',
                  lazy: async () => ({
                    Component: (await import('./features/dev/FusionSimulatorPage'))
                      .FusionSimulatorPage,
                  }),
                },
              ]
            : []),
          {
            path: 'setup',
            element: (
              <RequireNav id="setup">
                <SetupLayout />
              </RequireNav>
            ),
            children: [
              { index: true, element: <Navigate to="expense-types" replace /> },
              { path: 'expense-types', element: <ExpenseTypesPage /> },
              { path: 'approval-rules', element: <ApprovalRulesPage /> },
              { path: 'audit-rules', element: <AuditRulesPage /> },
              { path: 'options', element: <OptionsPage /> },
              { path: 'roles', element: <RolesPage /> },
              { path: 'history', element: <HistoryPage /> },
            ],
          },
          {
            path: 'admin/prerequisites',
            element: (
              <RequireNav id="prerequisites">
                <PrerequisitesPage />
              </RequireNav>
            ),
          },
          {
            path: 'admin/integrations',
            element: (
              <RequireNav id="integrations">
                <IntegrationsPage />
              </RequireNav>
            ),
          },
          {
            path: 'system/status',
            element: (
              <RequireNav id="systemStatus">
                <StatusPage />
              </RequireNav>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
