import oracledb from 'oracledb';

const rows = async (connection, sql, binds = {}) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

/**
 * Every employee attached to the department (current XX_DIGI_EMP_MASTER department; the master
 * holds one row per employee) at any point in [dateFrom, dateTo]: joined on or before dateTo and
 * not terminated before dateFrom. `status` ACTIVE keeps employees without a termination on or
 * before dateTo, LEFT the others. The national ID itself is never selected, only whether it
 * exists. Date-only columns are returned as YYYY-MM-DD strings (no time-zone shift).
 */
export async function listScope(connection, { dateFrom, dateTo, department, status }) {
  const result = await rows(
    connection,
    `SELECT e.EMPLOYEE_NUMBER, e.FULL_NAME,
            TO_CHAR(e.DATE_OF_BIRTH, 'YYYY-MM-DD') AS BIRTH_DATE,
            e.NATIONALITY, e.JOB_TITLE, e.POSITION_NAME,
            TO_CHAR(e.ORGANIZATION_ID) AS DEPARTMENT_CODE, e.DEPARTMENT AS DEPARTMENT_NAME,
            CASE WHEN e.NATIONAL_IDENTIFIER IS NULL THEN 'N' ELSE 'Y' END AS HAS_NATIONAL_ID,
            TO_CHAR(e.JOINING_DATE, 'YYYY-MM-DD') AS START_DATE,
            TO_CHAR(e.TERMINATION_DATE, 'YYYY-MM-DD') AS END_DATE,
            (SELECT MAX(p.LEAVING_REASON) KEEP (DENSE_RANK LAST ORDER BY p.EFFECTIVE_START_DATE)
               FROM XX_DIGI_PERSON_INFO p
              WHERE p.PERSON_ID = e.PERSON_ID) AS LEAVING_REASON
       FROM XX_DIGI_EMP_MASTER e
      WHERE e.JOINING_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD')
        AND (e.TERMINATION_DATE IS NULL OR e.TERMINATION_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
        AND (:department = 'ALL' OR TO_CHAR(e.ORGANIZATION_ID) = :department)
        AND (:status = 'ALL'
             OR (:status = 'ACTIVE'
                 AND (e.TERMINATION_DATE IS NULL OR e.TERMINATION_DATE > TO_DATE(:dateTo, 'YYYY-MM-DD')))
             OR (:status = 'LEFT' AND e.TERMINATION_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD')))`,
    { dateFrom, dateTo, department, status },
  );
  return result.map((row) => ({
    employeeNumber: row.EMPLOYEE_NUMBER,
    name: row.FULL_NAME,
    birthDate: row.BIRTH_DATE,
    nationality: row.NATIONALITY,
    jobTitle: row.JOB_TITLE,
    position: row.POSITION_NAME,
    departmentCode: row.DEPARTMENT_CODE,
    departmentName: row.DEPARTMENT_NAME,
    hasNationalId: row.HAS_NATIONAL_ID === 'Y',
    startDate: row.START_DATE,
    endDate: row.END_DATE,
    leavingReason: row.LEAVING_REASON,
  }));
}

/** Departments of the employee master (ORGANIZATION_ID → DEPARTMENT is one-to-one). */
export async function listDepartments(connection) {
  const result = await rows(
    connection,
    `SELECT DISTINCT TO_CHAR(ORGANIZATION_ID) AS CODE, DEPARTMENT AS NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE ORGANIZATION_ID IS NOT NULL AND DEPARTMENT IS NOT NULL
      ORDER BY NAME`,
  );
  return result.map((row) => ({ code: row.CODE, name: row.NAME }));
}
