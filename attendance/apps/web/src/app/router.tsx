// Routes are derived from the navigation config: rebuilt pages load lazily, the others show the
// planned-phase notice. Every route sits behind single sign-on (AuthGate) inside the shell.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { NotFound } from '../features/planned/NotFound';
import { PlannedPage } from '../features/planned/PlannedPage';
import { AppShell } from '../shell/AppShell';
import { AuthGate } from './AuthGate';
import { ALL_NAV_ITEMS } from './navigation';

const ShiftWeekPage = lazy(() => import('../features/setup/ShiftWeekPage'));

const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  'employee-details': lazy(() => import('../features/employees/EmployeeDetailsPage')),
  absence: lazy(() => import('../features/absences/AbsencePage')),
  'function-feature': lazy(() => import('../features/functionFeature/FunctionFeaturePage')),
  shifts: lazy(() => import('../features/setup/ShiftsPage')),
  'shift-details': lazy(() => import('../features/setup/SubShiftsPage')),
  timetable: lazy(() => import('../features/setup/TimetablePage')),
  occasion: lazy(() => import('../features/setup/OccasionsPage')),
  'attendance-card': lazy(() => import('../features/attendanceCard/AttendanceCardPage')),
  interface: lazy(() => import('../features/attendanceCard/InterfacePage')),
  dashboard: lazy(() => import('../features/dashboard/DashboardPage')),
  timesheet: lazy(() => import('../features/timesheet/TimesheetPage')),
  'payroll-file': lazy(() => import('../features/payrollFile/PayrollFilePage')),
  'alerts-exceptions': lazy(() => import('../features/alerts/AlertsPage')),
};

export const router = createBrowserRouter([
  {
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      ...ALL_NAV_ITEMS.map((item) => {
        const Page = PAGES[item.id];
        return { path: item.path, element: Page ? <Page /> : <PlannedPage item={item} /> };
      }),
      { path: '/shift-details/manage', element: <ShiftWeekPage /> },
      { path: '/shift-details/:uuid', element: <ShiftWeekPage /> },
      // CI3 aliases, so old bookmarks keep working.
      { path: '/employee_details', element: <Navigate to="/report/employee-details" replace /> },
      { path: '/function_feature', element: <Navigate to="/function-feature" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
