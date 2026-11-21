// Roles and permissions (new: the CI3 app had none). Provisional source of roles, see README:
// HR admin = employee number listed in ATTENDANCE_HR_ADMINS; Manager = has direct reports in
// XX_DIGI_EMP_MASTER; everyone else signed in = Viewer.
//
// Viewing stays open to every signed-in employee, as in CI3. Changing setup data (shifts,
// timetables, occasions) and importing attendance require HR admin (CI3 let anyone do it).

export const ROLES = ['HR_ADMIN', 'MANAGER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  HR_ADMIN: 'HR admin',
  MANAGER: 'Manager',
  VIEWER: 'Viewer',
};

export const PERMISSIONS = {
  'employees:view': ['HR_ADMIN', 'MANAGER', 'VIEWER'],
  'absences:view': ['HR_ADMIN', 'MANAGER', 'VIEWER'],
  'planning:view': ['HR_ADMIN', 'MANAGER', 'VIEWER'],
  'setup:view': ['HR_ADMIN', 'MANAGER', 'VIEWER'],
  'setup:manage': ['HR_ADMIN'],
  'attendanceCard:view': ['HR_ADMIN', 'MANAGER', 'VIEWER'],
  'attendance:import': ['HR_ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly Role[], permission: Permission): boolean {
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}
