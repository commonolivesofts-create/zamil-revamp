// The attendance menu, kept in the CI3 groups (views/includes/__sidebar.php) and paths so users
// find everything where they expect it. `phase` is the README phase that rebuilds the page;
// pages not rebuilt yet open a "planned" notice instead of fake data.
export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  phase: number;
}

export interface NavSection {
  id: string;
  label: string;
  icon: string;
  items: readonly NavItem[];
}

export const NAVIGATION: readonly NavSection[] = [
  {
    id: 'main',
    label: 'Main',
    icon: 'layout-dashboard',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'layout-dashboard', phase: 6 },
      { id: 'manager', label: 'Manager View', path: '/manager', icon: 'users-round', phase: 7 },
      {
        id: 'leave-requests',
        label: 'Leave & Requests',
        path: '/leave-requests',
        icon: 'calendar-check',
        phase: 7,
      },
      { id: 'shifts', label: 'Shifts', path: '/shifts', icon: 'clock', phase: 3 },
      {
        id: 'shift-details',
        label: 'Sub Shifts',
        path: '/shift-details',
        icon: 'calendar-range',
        phase: 3,
      },
      { id: 'timetable', label: 'TimeTable', path: '/timetable', icon: 'calendar-clock', phase: 3 },
      { id: 'occasion', label: 'Occasion', path: '/occasion', icon: 'party-popper', phase: 3 },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'chart-column',
    items: [
      {
        id: 'daily-attendance',
        label: 'Daily Attendance',
        path: '/daily-attendance',
        icon: 'fingerprint',
        phase: 7,
      },
      {
        id: 'alerts-exceptions',
        label: 'Alerts & Exceptions',
        path: '/alerts-exceptions',
        icon: 'triangle-alert',
        phase: 6,
      },
      {
        id: 'employee-details',
        label: 'Employee Details',
        path: '/report/employee-details',
        icon: 'id-card',
        phase: 2,
      },
      {
        id: 'absence',
        label: 'Absence',
        path: '/report/absence',
        icon: 'calendar-x',
        phase: 2,
      },
      {
        id: 'attendance-card',
        label: 'Attendance Card',
        path: '/report/attendance-card',
        icon: 'contact-round',
        phase: 4,
      },
      { id: 'timesheet', label: 'Timesheet', path: '/report/timesheet', icon: 'sheet', phase: 6 },
      {
        id: 'payroll-file',
        label: 'Payroll File',
        path: '/report/payroll-file',
        icon: 'banknote',
        phase: 6,
      },
    ],
  },
  {
    id: 'contractors',
    label: 'Contractors',
    icon: 'hard-hat',
    items: [
      { id: 'contractor', label: 'Contractors', path: '/contractor', icon: 'building', phase: 8 },
      {
        id: 'contractor-employees',
        label: 'Contractor Employees',
        path: '/contractor/employees',
        icon: 'users',
        phase: 8,
      },
      {
        id: 'contractor-summary',
        label: 'Contractor Summary',
        path: '/report/contractor-summary',
        icon: 'clipboard-list',
        phase: 8,
      },
    ],
  },
  {
    id: 'interface',
    label: 'Interface & Jobs',
    icon: 'arrow-left-right',
    items: [
      {
        id: 'interface',
        label: 'Attendance Interface',
        path: '/interface',
        icon: 'upload',
        phase: 4,
      },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: 'list-checks',
    items: [
      {
        id: 'function-feature',
        label: 'Function & Feature',
        path: '/function-feature',
        icon: 'list-checks',
        phase: 2,
      },
    ],
  },
];

/** Pages rebuilt so far (README phase table). */
export const BUILT_PAGES = new Set([
  'employee-details',
  'absence',
  'function-feature',
  'shifts',
  'shift-details',
  'timetable',
  'occasion',
  'attendance-card',
  'interface',
  'dashboard',
  'timesheet',
  'payroll-file',
  'alerts-exceptions',
]);

export const ALL_NAV_ITEMS: readonly NavItem[] = NAVIGATION.flatMap((section) => section.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.path === pathname);
}

export function sectionOf(pathname: string): NavSection | undefined {
  // Sub-pages (e.g. /shift-details/<uuid>) belong to their parent menu item.
  return NAVIGATION.find((section) =>
    section.items.some(
      (item) =>
        item.path === pathname || (item.path !== '/' && pathname.startsWith(`${item.path}/`)),
    ),
  );
}
