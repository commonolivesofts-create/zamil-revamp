// Maps a Zamil employee number to the attendance identity in XX_DIGI_EMP_MASTER (as CI3's
// MY_Controller did) and derives the provisional roles.
import type { Me, Role } from '@attendance/shared';
import { num, str, type Db } from '../db/oracle';

export interface Identity extends Omit<Me, 'roles'> {
  hasDirectReports: boolean;
}

export interface IdentityRepository {
  findByEmployeeNumber(employeeNumber: string): Promise<Identity | null>;
}

export function oracleIdentityRepository(db: Db): IdentityRepository {
  return {
    async findByEmployeeNumber(employeeNumber) {
      const rows = await db.query('adw', IDENTITY_SQL, { emp: employeeNumber });
      const row = rows[0];
      const userId = num(row?.USER_ID);
      if (!row || userId === null) return null;
      return {
        userId,
        employeeNumber: str(row.EMPLOYEE_NUMBER) ?? employeeNumber,
        fullName: str(row.FULL_NAME) ?? employeeNumber,
        email: str(row.EMAIL_ADDRESS),
        jobTitle: str(row.JOB_TITLE),
        department: str(row.DEPARTMENT),
        hasDirectReports: num(row.DIRECT_REPORTS) !== 0,
      };
    },
  };
}

// The newest USER_ID wins when an employee has several rows (CI3 used MAX(USER_ID)).
const IDENTITY_SQL = `
  SELECT e.USER_ID, e.EMPLOYEE_NUMBER, e.FULL_NAME, e.EMAIL_ADDRESS, e.JOB_TITLE, e.DEPARTMENT,
         (SELECT COUNT(1) FROM XX_DIGI_EMP_MASTER r
           WHERE r.SUPERVISOR_ID = e.EMPLOYEE_ID AND r.CURRENT_EMP_FLAG = 'Y') AS DIRECT_REPORTS
    FROM XX_DIGI_EMP_MASTER e
   WHERE e.EMPLOYEE_NUMBER = :emp
     AND e.USER_ID IS NOT NULL
   ORDER BY CASE WHEN e.CURRENT_EMP_FLAG = 'Y' THEN 0 ELSE 1 END, e.USER_ID DESC
   FETCH FIRST 1 ROW ONLY`;

export function rolesFor(identity: Identity, hrAdmins: ReadonlySet<string>): Role[] {
  const roles: Role[] = [];
  if (hrAdmins.has(identity.employeeNumber)) roles.push('HR_ADMIN');
  if (identity.hasDirectReports) roles.push('MANAGER');
  roles.push('VIEWER');
  return roles;
}

export function toMe(identity: Identity, roles: Role[]): Me {
  const { hasDirectReports: _hasDirectReports, ...me } = identity;
  return { ...me, roles };
}
