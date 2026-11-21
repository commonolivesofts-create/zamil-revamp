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
  'daily-attendance': lazy(() => import('../features/dailyAttendance/DailyAttendancePage')),
  'leave-requests': lazy(() => import('../features/leaveRequests/LeaveRequestsPage')),
  manager: lazy(() => import('../features/manager/ManagerPage')),
  contractor: lazy(() => import('../features/contractors/ContractorsPage')),
  'contractor-employees': lazy(() => import('../features/contractors/ContractorEmployeesPage')),
  'contractor-summary': lazy(() => import('../features/contractors/ContractorSummaryPage')),
};

/** Old CI3 page URLs (routes.php entries and CodeIgniter auto-routed controllers) → new paths. */
const CI3_ALIASES: Record<string, string> = {
  '/dashboard': '/',
  '/employee_details': '/report/employee-details',
  '/absence': '/report/absence',
  '/attendance_card': '/report/attendance-card',
  '/processattendance': '/report/attendance-card',
  '/timesheet': '/report/timesheet',
  '/payroll_file': '/report/payroll-file',
  '/alerts_exceptions': '/alerts-exceptions',
  '/daily_attendance': '/daily-attendance',
  '/leave_request': '/leave-requests',
  '/shift_details': '/shift-details',
  '/shift-details/create': '/shift-details/manage',
  '/shifts/create': '/shifts',
  '/timetable/create': '/timetable',
  '/contractor/form': '/contractor',
  '/contractor/employees/form': '/contractor/employees',
  '/contractor/summary_index': '/report/contractor-summary',
  '/function_feature': '/function-feature',
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
      // CI3 aliases (explicit and auto-routed controller URLs), so old bookmarks keep working.
      ...Object.entries(CI3_ALIASES).map(([path, to]) => ({
        path,
        element: <Navigate to={to} replace />,
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
]);
