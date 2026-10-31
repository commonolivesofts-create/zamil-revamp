import oracledb from 'oracledb';

const ID = { type: oracledb.STRING };
const rows = async (connection, sql, binds = {}, fetchInfo) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo })).rows;
const HEADER_FETCH = Object.freeze({ HEADER_ID: ID, CREATED_BY: ID, ATTRIBUTE2: ID });
const LINE_FETCH = Object.freeze({ DEP_LINE_ID: ID, HEADER_ID: ID, CREATED_BY: ID });
const ID_FETCH = Object.freeze({ ID });
const HEADER_ID_FETCH = Object.freeze({ HEADER_ID: ID });

export const TABLES = Object.freeze({
  Y: Object.freeze({
    tableName: 'SHARED',
    header: 'XXZP.XXZP_NEW_HIRETRAINING_SS_HDR_T',
    line: 'XXZP.XXZP_NEW_HIRETRAIN_SS_LINE_T',
  }),
  N: Object.freeze({
    tableName: 'PRODUCTION',
    header: 'XXZP.XXZP_NEW_HIRETRAIN_PROD_HDR_T',
    line: 'XXZP.XXZP_NEW_HIRETRA_PROD_LINES_T',
  }),
});

const mapHeader = (row) => ({
  headerId: row.HEADER_ID,
  uuid: row.UUID,
  empNo: row.EMPLOYEE_NUMBER,
  section: row.DIVISION,
  empname: row.EMPLOYEE_NAME,
  fromOrient: row.ORIENTATION_DURATION_FROM,
  toOrient: row.ORIENTATION_DURATION_TO,
  startDate: row.STARTING_DATE,
  orientationBy: row.ORIENTATION_SCHEDULE_BY,
  status: row.STATUS,
  createdBy: row.CREATED_BY,
  createdAt: row.CREATION_DATE,
  personId: row.ATTRIBUTE2,
  division: row.ATTRIBUTE4,
  reference: row.ATTRIBUTE5,
  position: row.EMP_POSITION,
  type: row.EMP_TYPE,
  reqType: row.REQ_TYPE,
});
const mapLine = (row) => ({
  lineId: row.DEP_LINE_ID,
  headerId: row.HEADER_ID,
  department: row.DEPARTMENT,
  departmentHead: row.DEPARTMENT_HEAD,
  orientationPeriod: row.ORIENTATION_PERIOD,
  timeFrom: row.TIME_FROM,
  timeTo: row.TIME_TO,
  remarks: row.REMARKS,
  createdBy: row.CREATED_BY,
  createdAt: row.CREATION_DATE,
  fromDate: row.FROM_DATE,
  toDate: row.TO_DATE,
  orientationDays: row.ORIENTATION_DAYS,
});

export async function resolveFlag(connection, empNo) {
  const [row] = await rows(
    connection,
    `SELECT (SELECT DECODE(UPPER(ATTRIBUTE1), 'SHARED SERVICE', 'Y', 'N')
              FROM XX_DIGI_ORG_INFO
             WHERE ORGANIZATION_ID = paaf.ORGANIZATION_ID) AS SHARED_SERVICE
       FROM XX_DIGI_ASSIGNMENT_INFO paaf
      WHERE PRIMARY_FLAG = 'Y'
        AND ASSIGNMENT_TYPE = 'E'
        AND PERSON_ID = (SELECT DISTINCT PERSON_ID FROM XX_DIGI_EMP_DETAILS WHERE EMPLOYEE_NUMBER = :empNo)
        AND TRUNC(SYSDATE) BETWEEN TRUNC(EFFECTIVE_START_DATE) AND TRUNC(EFFECTIVE_END_DATE)
      FETCH FIRST 1 ROWS ONLY`,
    { empNo },
  );
  return row?.SHARED_SERVICE === 'Y' ? 'Y' : row ? 'N' : null;
}

export async function findEmployeeDetails(connection, empNo) {
  const [row] = await rows(
    connection,
    `SELECT PERSON_ID, DIVISION AS DIV, FULL_NAME, EMPLOYEE_NUMBER, JOB_TITLE, JOB_ID,
            DEPARTMENT, ORGANIZATION_ID AS DEPARTMENT_ID, SUPERVISOR_NAME AS DIRECT_MANAGER,
            COST_CENTER AS SECTION, TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') AS START_DATE, POSITION_NAME AS EMP_POSITION,
            CASE WHEN WORKER_CATEGORY = 'Supervisor' THEN 'Supervisor'
                 WHEN WORKER_CATEGORY IN ('Management', 'GM', 'VP') THEN 'Manager'
                 ELSE 'Employee' END AS EMPLOYEE_TYPE
       FROM XX_DIGI_EMP_MASTER
      WHERE EMPLOYEE_NUMBER = :empNo AND CURRENT_EMP_FLAG = 'Y'`,
    { empNo },
    { PERSON_ID: ID, EMPLOYEE_NUMBER: ID, JOB_ID: ID, DEPARTMENT_ID: ID },
  );
  return row
    ? {
        section: row.SECTION,
        division: row.DIV,
        empname: row.FULL_NAME,
        empNo: row.EMPLOYEE_NUMBER,
        personId: row.PERSON_ID,
        empType: row.EMPLOYEE_TYPE,
        position: row.EMP_POSITION,
        startDate: row.START_DATE,
        jobTitle: row.JOB_TITLE,
        jobId: row.JOB_ID,
        department: row.DEPARTMENT,
        departmentId: row.DEPARTMENT_ID,
        directManager: row.DIRECT_MANAGER,
      }
    : null;
}

export async function generateHeaderId(connection, table) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(HEADER_ID + 1), 1) AS ID FROM ${table.header}`,
    {},
    ID_FETCH,
  );
  return row?.ID;
}

export async function insertHeader(connection, table, header) {
  await connection.execute(
    `INSERT INTO ${table.header}
       (UUID, EMPLOYEE_NUMBER, DIVISION, EMPLOYEE_NAME, ORIENTATION_DURATION_FROM,
        ORIENTATION_DURATION_TO, STARTING_DATE, ORIENTATION_SCHEDULE_BY, STATUS,
        CREATED_BY, CREATION_DATE, ATTRIBUTE2, ATTRIBUTE4, EMP_POSITION, EMP_TYPE, REQ_TYPE)
     VALUES
       (:uuid, :empNo, :section, :empname, TO_DATE(:fromOrient, 'YYYY-MM-DD'),
        TO_DATE(:toOrient, 'YYYY-MM-DD'), TO_DATE(:startDate, 'YYYY-MM-DD'),
        :orientationBy, 'Draft', :createdBy, SYSDATE, :personId, :division,
        :position, :empType, 'new')`,
    header,
  );
}

export async function findHeaderIdByUuid(connection, table, uuid) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID FROM ${table.header} WHERE UUID = :uuid`,
    { uuid },
    HEADER_ID_FETCH,
  );
  return row?.HEADER_ID;
}

export async function setReference(connection, table, headerId, division) {
  await connection.execute(
    `UPDATE ${table.header}
        SET ATTRIBUTE5 = :division || '/' || TO_CHAR(SYSDATE, 'YY') || '/' || LPAD(:headerId, 3, '0')
      WHERE HEADER_ID = :headerId`,
    { division, headerId },
  );
  const [row] = await rows(
    connection,
    `SELECT ATTRIBUTE5 FROM ${table.header} WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row?.ATTRIBUTE5;
}

export async function registerFlag(connection, headerId, tableName) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_NHT_MASTER_FLAG (HEADER_ID, FORM_HEADER_ID, TABLE_NAME)
     VALUES (NVL((SELECT MAX(HEADER_ID) FROM XXZP.XXZP_NHT_MASTER_FLAG), 1) + 1, :headerId, :tableName)`,
    { headerId, tableName },
  );
}

export async function generateLineId(connection, table, headerId) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(DEP_LINE_ID + 1), 1) AS ID FROM ${table.line} WHERE HEADER_ID = :headerId`,
    { headerId },
    ID_FETCH,
  );
  return row?.ID;
}

export async function insertLine(connection, table, line) {
  await connection.execute(
    `INSERT INTO ${table.line}
       (DEP_LINE_ID, HEADER_ID, DEPARTMENT, DEPARTMENT_HEAD, ORIENTATION_PERIOD,
        TIME_FROM, TIME_TO, REMARKS, CREATED_BY, CREATION_DATE, FROM_DATE, TO_DATE, ORIENTATION_DAYS)
     VALUES (:lineId, :headerId, :department, :departmentHead, :orientationPeriod,
             :timeFrom, :timeTo, :remarks, :createdBy, SYSDATE,
             TO_DATE(:fromDate, 'YYYY-MM-DD'), TO_DATE(:toDate, 'YYYY-MM-DD'), :orientationDays)`,
    line,
  );
}

export async function findTableName(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT TABLE_NAME FROM XXZP.XXZP_NHT_MASTER_FLAG WHERE FORM_HEADER_ID = :headerId`,
    { headerId },
  );
  return row?.TABLE_NAME ?? 'PRODUCTION';
}

export async function findHeader(connection, table, headerId) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID, UUID, EMPLOYEE_NUMBER, DIVISION, EMPLOYEE_NAME,
            TO_CHAR(ORIENTATION_DURATION_FROM, 'YYYY-MM-DD') AS ORIENTATION_DURATION_FROM,
            TO_CHAR(ORIENTATION_DURATION_TO, 'YYYY-MM-DD') AS ORIENTATION_DURATION_TO,
            TO_CHAR(STARTING_DATE, 'YYYY-MM-DD') AS STARTING_DATE,
            ORIENTATION_SCHEDULE_BY, STATUS, CREATED_BY,
            TO_CHAR(CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATION_DATE,
            ATTRIBUTE2, ATTRIBUTE4, ATTRIBUTE5, EMP_POSITION, EMP_TYPE, REQ_TYPE
       FROM ${table.header} WHERE HEADER_ID = :headerId`,
    { headerId },
    HEADER_FETCH,
  );
  return row ? mapHeader(row) : null;
}

export async function listLines(connection, table, headerId) {
  const result = await rows(
    connection,
    `SELECT DEP_LINE_ID, HEADER_ID, DEPARTMENT, DEPARTMENT_HEAD, ORIENTATION_PERIOD,
            TIME_FROM, TIME_TO, REMARKS, CREATED_BY,
            TO_CHAR(CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATION_DATE,
            TO_CHAR(FROM_DATE, 'YYYY-MM-DD') AS FROM_DATE,
            TO_CHAR(TO_DATE, 'YYYY-MM-DD') AS TO_DATE, ORIENTATION_DAYS
       FROM ${table.line} WHERE HEADER_ID = :headerId ORDER BY DEP_LINE_ID ASC`,
    { headerId },
    LINE_FETCH,
  );
  return result.map(mapLine);
}

export async function updateHeader(connection, table, header) {
  const result = await connection.execute(
    `UPDATE ${table.header}
        SET EMPLOYEE_NUMBER = :empNo, DIVISION = :section, EMPLOYEE_NAME = :empname,
            ORIENTATION_DURATION_FROM = TO_DATE(:fromOrient, 'YYYY-MM-DD'),
            ORIENTATION_DURATION_TO = TO_DATE(:toOrient, 'YYYY-MM-DD'),
            STARTING_DATE = TO_DATE(:startDate, 'YYYY-MM-DD'),
            ORIENTATION_SCHEDULE_BY = :orientationBy, ATTRIBUTE2 = :personId,
            ATTRIBUTE4 = :division, EMP_POSITION = :position, EMP_TYPE = :empType,
            LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    header,
  );
  return result.rowsAffected === 1;
}

export async function deleteLines(connection, table, headerId) {
  await connection.execute(`DELETE FROM ${table.line} WHERE HEADER_ID = :headerId`, { headerId });
}

export async function deleteFlag(connection, headerId) {
  await connection.execute(
    `DELETE FROM XXZP.XXZP_NHT_MASTER_FLAG WHERE FORM_HEADER_ID = :headerId`,
    { headerId },
  );
}

export async function deleteHeader(connection, table, headerId) {
  const result = await connection.execute(
    `DELETE FROM ${table.header} WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return result.rowsAffected === 1;
}

export async function deleteLine(connection, table, headerId, lineId) {
  const result = await connection.execute(
    `DELETE FROM ${table.line} WHERE HEADER_ID = :headerId AND DEP_LINE_ID = :lineId`,
    { headerId, lineId },
  );
  return result.rowsAffected > 0;
}

const sortColumns = Object.freeze({
  HEADER_ID: 'H.HEADER_ID',
  ORIENTATION_DURATION_FROM: 'H.ORIENTATION_DURATION_FROM',
  EMPLOYEE_NAME: 'H.EMPLOYEE_NAME',
  CREATION_DATE: 'H.CREATION_DATE',
});
const searchSql = `(UPPER(H.EMPLOYEE_NAME) LIKE :search ESCAPE '\\'
  OR UPPER(H.DIVISION) LIKE :search ESCAPE '\\'
  OR UPPER(H.ATTRIBUTE5) LIKE :search ESCAPE '\\'
  OR UPPER(H.EMP_POSITION) LIKE :search ESCAPE '\\')`;

export async function listTrainings(
  connection,
  table,
  { filters, createdBy, limit, offset, sortBy, sortDir },
) {
  const binds = {};
  const conditions = ['1 = 1'];
  if (filters.search) {
    conditions.push(searchSql);
    binds.search = filters.search;
  }
  if (filters.status) {
    conditions.push('H.STATUS = :status');
    binds.status = filters.status;
  }
  if (filters.empNo) {
    conditions.push('TO_CHAR(H.EMPLOYEE_NUMBER) = :empNo');
    binds.empNo = filters.empNo;
  }
  if (filters.empType) {
    conditions.push('H.EMP_TYPE = :empType');
    binds.empType = filters.empType;
  }
  if (filters.dateFrom) {
    conditions.push("H.ORIENTATION_DURATION_FROM >= TO_DATE(:dateFrom, 'YYYY-MM-DD')");
    binds.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    conditions.push("H.ORIENTATION_DURATION_FROM < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1");
    binds.dateTo = filters.dateTo;
  }
  if (createdBy !== null) {
    conditions.push('H.CREATED_BY = :createdBy');
    binds.createdBy = createdBy;
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const column = sortColumns[sortBy];
  const direction = sortDir === 'asc' ? 'ASC' : 'DESC';
  const [count] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM ${table.header} H ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT H.HEADER_ID, H.REQ_TYPE, H.EMPLOYEE_NUMBER, H.DIVISION, H.EMPLOYEE_NAME,
            TO_CHAR(H.ORIENTATION_DURATION_FROM, 'YYYY-MM-DD') AS ORIENTATION_DURATION_FROM,
            TO_CHAR(H.ORIENTATION_DURATION_TO, 'YYYY-MM-DD') AS ORIENTATION_DURATION_TO,
            TO_CHAR(H.STARTING_DATE, 'YYYY-MM-DD') AS STARTING_DATE,
            H.ORIENTATION_SCHEDULE_BY, H.ATTRIBUTE2, H.ATTRIBUTE4, H.ATTRIBUTE5,
            H.EMP_POSITION, H.EMP_TYPE, H.STATUS, H.CREATED_BY,
            TO_CHAR(H.CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS') AS CREATION_DATE
       FROM ${table.header} H ${where}
      ORDER BY ${column} ${direction}, H.HEADER_ID
      OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    { ...binds, offset, pageSize: limit },
    HEADER_FETCH,
  );
  return {
    total: Number(count?.TOTAL ?? 0),
    items: result.map((row) => ({ ...mapHeader(row), status: row.STATUS })),
  };
}

export async function isHrUser(connection, userId) {
  const result = await rows(
    connection,
    `SELECT LOOKUP_CODE FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId FETCH FIRST 1 ROWS ONLY`,
    { userId },
  );
  return result.length > 0;
}

export async function listEmployees(connection, { userId, isHr }) {
  const scope = isHr
    ? ''
    : `AND (e.USER_ID = :userId OR e.SUPERVISOR_NAME =
          (SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId FETCH FIRST 1 ROWS ONLY))`;
  const result = await rows(
    connection,
    `SELECT e.PERSON_ID, e.EMPLOYEE_NUMBER, e.FULL_NAME, TO_CHAR(e.JOINING_DATE, 'YYYY-MM-DD') AS START_DATE, e.JOB_ID,
            e.JOB_TITLE AS NAME, e.COST_CENTER AS SECTION, e.DIVISION AS DIV, e.ORGANIZATION_ID,
            e.POSITION_NAME AS EMP_POSITION,
            CASE WHEN e.WORKER_CATEGORY = 'Supervisor' THEN 'Supervisor'
                 WHEN e.WORKER_CATEGORY IN ('Management', 'GM', 'VP') THEN 'Manager'
                 ELSE 'Employee' END AS EMPLOYEE_TYPE
       FROM XX_DIGI_EMP_MASTER e
      WHERE e.CURRENT_EMP_FLAG = 'Y' ${scope}
      ORDER BY e.FULL_NAME`,
    isHr ? {} : { userId },
    { PERSON_ID: ID, EMPLOYEE_NUMBER: ID, JOB_ID: ID, ORGANIZATION_ID: ID },
  );
  return result.map((row) => ({
    personId: row.PERSON_ID,
    empNo: row.EMPLOYEE_NUMBER,
    fullName: row.FULL_NAME,
    startDate: row.START_DATE,
    jobId: row.JOB_ID,
    name: row.NAME,
    section: row.SECTION,
    division: row.DIV,
    organizationId: row.ORGANIZATION_ID,
    position: row.EMP_POSITION,
    empType: row.EMPLOYEE_TYPE,
  }));
}

export async function listManagers(connection) {
  const result = await rows(
    connection,
    `SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
      WHERE SUPERVISOR_NAME IN (
        SELECT DISTINCT FULL_NAME FROM XX_DIGI_EMP_MASTER
         WHERE JOB_ID IN (300000002811134, 300000002699988, 300000002811331, 300000002811350, 300000002811380)
            OR EMPLOYEE_NUMBER IN (1153, 1770, 2387)) AND CURRENT_EMP_FLAG = 'Y'
     UNION ALL
     SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
      WHERE CURRENT_EMP_FLAG = 'Y' AND JOB_ID IN (300000004332594, 300000002811134, 300000002699988,
                                                   300000002811331, 300000002811350, 300000002811380)
     UNION ALL
     SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
      WHERE CURRENT_EMP_FLAG = 'Y' AND JOB_ID IN (
        SELECT DISTINCT JOB_ID FROM XX_DIGI_JOB_MASTER WHERE APPROVAL_AUTHORITY > 4 AND APPROVAL_AUTHORITY < 10)`,
    {},
    { EMPLOYEE_NUMBER: ID },
  );
  return result.map((row) => ({ empNo: row.EMPLOYEE_NUMBER, fullName: row.FULL_NAME }));
}

export async function findEmployee(connection, empNo) {
  return findEmployeeDetails(connection, empNo);
}

/** Whether the actor's current department (ORGANIZATION_ID) is the trained employee's. */
export async function isSameDepartment(connection, { actorEmployeeNumber, subjectEmployeeNumber }) {
  const result = await rows(
    connection,
    `SELECT 1 AS SAME
       FROM XX_DIGI_EMP_MASTER a
       JOIN XX_DIGI_EMP_MASTER s ON s.ORGANIZATION_ID = a.ORGANIZATION_ID
      WHERE a.EMPLOYEE_NUMBER = :actorEmployeeNumber
        AND a.CURRENT_EMP_FLAG = 'Y'
        AND s.EMPLOYEE_NUMBER = :subjectEmployeeNumber
      FETCH FIRST 1 ROWS ONLY`,
    { actorEmployeeNumber, subjectEmployeeNumber },
  );
  return result.length > 0;
}

export async function findActorName(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId FETCH FIRST 1 ROWS ONLY`,
    { userId },
  );
  return row?.FULL_NAME;
}
