// Maps a Zamil employee number to the attendance identity in XX_DIGI_EMP_MASTER, as CI3's
// MY_Controller did. There are no roles: like CI3, every signed-in employee can use every page.
import type { Me } from '@attendance/shared';
import { num, str, type Db } from '../db/oracle';

export type Identity = Me;

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
        userName: str(row.USER_NAME),
        employeeNumber: str(row.EMPLOYEE_NUMBER) ?? employeeNumber,
        fullName: str(row.FULL_NAME) ?? employeeNumber,
        email: str(row.EMAIL_ADDRESS),
        jobTitle: str(row.JOB_TITLE),
        department: str(row.DEPARTMENT),
      };
    },
  };
}

// The newest USER_ID wins when an employee has several rows (CI3 used MAX(USER_ID)).
const IDENTITY_SQL = `
  SELECT e.USER_ID, e.USER_NAME, e.EMPLOYEE_NUMBER, e.FULL_NAME, e.EMAIL_ADDRESS, e.JOB_TITLE, e.DEPARTMENT
    FROM XX_DIGI_EMP_MASTER e
   WHERE e.EMPLOYEE_NUMBER = :emp
     AND e.USER_ID IS NOT NULL
   ORDER BY CASE WHEN e.CURRENT_EMP_FLAG = 'Y' THEN 0 ELSE 1 END, e.USER_ID DESC
   FETCH FIRST 1 ROW ONLY`;

export const toMe = (identity: Identity): Me => ({ ...identity });
