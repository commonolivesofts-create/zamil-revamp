import oracledb from 'oracledb';

const ID = { type: oracledb.STRING };
const rows = async (connection, sql, binds, fetchInfo) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo })).rows;
const headerIdFetch = Object.freeze({ HEADER_ID: ID });
const lineIdFetch = Object.freeze({ HEADER_ID: ID, LINE_ID: ID });
const generatedIdFetch = Object.freeze({ ID });

const mapHeader = (row) => ({
  headerId: row.HEADER_ID,
  uuid: row.UUID,
  formDate: row.FORM_DATE,
  employeeName: row.EMP_NAME,
  employeeNumber: row.EMP_NUMBER,
  empId: row.EMP_ID,
  grade: row.GRADE,
  evaluationPeriod: row.EVALUATION_PERIOD,
  formType: row.FORM_NAME,
  totalRating: row.TOTAL_RATING,
  comment: row.PREPARED_BY_CMNT,
  comments: row.APPROVED_BY_CMNT,
  jobTitle: row.JOB_T,
  department: row.DEPARTMENT,
  fromDate: row.FROM_DATE,
  toDate: row.TO_DATE,
  requestStatus: row.REQUEST_STATUS,
  createdAt: row.CREATED_AT,
});

const mapLine = (row) => ({
  lineId: row.LINE_ID,
  headerId: row.HEADER_ID,
  rating: row.RATING_LINE,
  param: row.PARAM_NAME,
  paramAr: row.PARAMA_NAME_AR,
});

export async function generateHeaderId(connection) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(HEADER_ID + 1), 1) AS ID
       FROM XXZP.XXZP_PAF_PROBATION_HEADER`,
    {},
    generatedIdFetch,
  );
  return row?.ID;
}

export async function findHeaderIdByUuid(connection, uuid) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID
       FROM XXZP.XXZP_PAF_PROBATION_HEADER
      WHERE UUID = :uuid`,
    { uuid },
    headerIdFetch,
  );
  return row?.HEADER_ID;
}

export async function insertHeader(connection, header) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_PAF_PROBATION_HEADER
       (UUID, FORM_DATE, EMP_ID, GRADE, EVALUATION_PERIOD, FORM_NAME, TOTAL_RATING,
        PREPARED_BY_CMNT, APPROVED_BY_CMNT, EMP_NAME, JOB_T, DEPARTMENT, EMP_NUMBER,
        FROM_DATE, TO_DATE, USER_NAME, USER_MAIL, REQUEST_STATUS, CREATED_AT, CREATED_BY)
     VALUES
       (:uuid, TO_DATE(:formDate, 'DD-Mon-YYYY'), :empId, NVL(:grade, 0),
        NVL(:evaluationPeriod, '-'), NVL(:formType, '-'), NVL(:totalRating, 0),
        NVL(:comment, '-'), NVL(:comments, '-'), :employeeName, :jobTitle, :department,
        :employeeNumber, TO_DATE(:fromDate, 'DD-Mon-YYYY'), TO_DATE(:toDate, 'DD-Mon-YYYY'),
        :userName, :userMail, 'DRAFT', SYSDATE, :createdBy)`,
    header,
  );
}

export async function generateLineId(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(LINE_ID + 1), 1) AS ID
       FROM XXZP.XXZP_PAF_PROBATION_LINES
      WHERE HEADER_ID = :headerId`,
    { headerId },
    generatedIdFetch,
  );
  return row?.ID;
}

export async function insertLine(connection, line) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_PAF_PROBATION_LINES
       (HEADER_ID, LINE_ID, RATING_LINE, PARAM_NAME, PARAMA_NAME_AR)
     VALUES
       (:headerId, :lineId, NVL(:rating, 0), :param, NVL(:paramAr, '-'))`,
    line,
  );
}

const HEADER_COLUMNS = `HEADER_ID, UUID, TO_CHAR(FORM_DATE, 'DD-Mon-YYYY') AS FORM_DATE,
  EMP_ID, GRADE, EVALUATION_PERIOD, FORM_NAME, TOTAL_RATING, PREPARED_BY_CMNT,
  APPROVED_BY_CMNT, EMP_NAME, JOB_T, DEPARTMENT, EMP_NUMBER,
  TO_CHAR(FROM_DATE, 'DD-Mon-YYYY') AS FROM_DATE,
  TO_CHAR(TO_DATE, 'DD-Mon-YYYY') AS TO_DATE, REQUEST_STATUS,
  TO_CHAR(CREATED_AT, 'DD-Mon-YY') AS CREATED_AT`;

export async function findHeader(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT ${HEADER_COLUMNS}
       FROM XXZP.XXZP_PAF_PROBATION_HEADER
      WHERE HEADER_ID = :headerId`,
    { headerId },
    headerIdFetch,
  );
  return row ? mapHeader(row) : null;
}

export async function listLines(connection, headerId) {
  const result = await rows(
    connection,
    `SELECT LINE_ID, HEADER_ID, RATING_LINE, PARAM_NAME, PARAMA_NAME_AR
       FROM XXZP.XXZP_PAF_PROBATION_LINES
      WHERE HEADER_ID = :headerId
      ORDER BY LINE_ID`,
    { headerId },
    lineIdFetch,
  );
  return result.map(mapLine);
}

export async function findHeaderStatus(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT REQUEST_STATUS
       FROM XXZP.XXZP_PAF_PROBATION_HEADER
      WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row ? { requestStatus: row.REQUEST_STATUS } : null;
}

export async function updateHeader(connection, header) {
  const result = await connection.execute(
    `UPDATE XXZP.XXZP_PAF_PROBATION_HEADER
        SET FORM_DATE = TO_DATE(:formDate, 'DD-Mon-YYYY'),
            EMP_ID = :empId,
            GRADE = NVL(:grade, 0),
            EVALUATION_PERIOD = NVL(:evaluationPeriod, '-'),
            FORM_NAME = NVL(:formType, '-'),
            TOTAL_RATING = NVL(:totalRating, 0),
            PREPARED_BY_CMNT = NVL(:comment, '-'),
            APPROVED_BY_CMNT = NVL(:comments, '-'),
            EMP_NAME = :employeeName,
            JOB_T = :jobTitle,
            DEPARTMENT = :department,
            EMP_NUMBER = :employeeNumber,
            FROM_DATE = TO_DATE(:fromDate, 'DD-Mon-YYYY'),
            TO_DATE = TO_DATE(:toDate, 'DD-Mon-YYYY')
      WHERE HEADER_ID = :headerId`,
    header,
  );
  return result.rowsAffected === 1;
}

export async function updateLine(connection, line) {
  const result = await connection.execute(
    `UPDATE XXZP.XXZP_PAF_PROBATION_LINES
        SET RATING_LINE = NVL(:rating, 0),
            PARAM_NAME = :param,
            PARAMA_NAME_AR = NVL(:paramAr, '-')
      WHERE LINE_ID = :lineId AND HEADER_ID = :headerId`,
    line,
  );
  return result.rowsAffected === 1;
}

export async function deleteEvaluation(connection, headerId) {
  await connection.execute(
    `DELETE FROM XXZP.XXZP_PAF_PROBATION_LINES WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  const result = await connection.execute(
    `DELETE FROM XXZP.XXZP_PAF_PROBATION_HEADER WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return result.rowsAffected === 1;
}

const SORT_COLUMNS = Object.freeze({
  HEADER_ID: 'H.HEADER_ID',
  CREATED_AT: 'H.CREATED_AT',
  EMP_NAME: 'H.EMP_NAME',
  TOTAL_RATING: 'H.TOTAL_RATING',
});
const FILTERS = Object.freeze({
  search: () => `(UPPER(H.EMP_NAME) LIKE :search ESCAPE '\\'
                 OR UPPER(H.EMP_NUMBER) LIKE :search ESCAPE '\\'
                 OR UPPER(H.JOB_T) LIKE :search ESCAPE '\\'
                 OR UPPER(H.DEPARTMENT) LIKE :search ESCAPE '\\')`,
  requestStatus: () => 'H.REQUEST_STATUS = :requestStatus',
  formType: () => 'H.FORM_NAME = :formType',
  empNumber: () => 'H.EMP_NUMBER = :empNumber',
  department: () => 'UPPER(H.DEPARTMENT) = UPPER(:department)',
  dateFrom: () => "H.CREATED_AT >= TO_DATE(:dateFrom, 'YYYY-MM-DD')",
  dateTo: () => "H.CREATED_AT < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1",
});
const LIST_COLUMNS = `H.HEADER_ID, TO_CHAR(H.FORM_DATE, 'DD-Mon-YYYY') AS FORM_DATE,
  H.EMP_NAME, H.EMP_NUMBER, H.JOB_T, H.DEPARTMENT, H.FORM_NAME,
  H.TOTAL_RATING, H.REQUEST_STATUS, TO_CHAR(H.CREATED_AT, 'DD-Mon-YY') AS CREATED_AT,
  H.CREATED_BY`;
const mapListItem = (row) => ({
  headerId: row.HEADER_ID,
  formDate: row.FORM_DATE,
  employeeName: row.EMP_NAME,
  employeeNumber: row.EMP_NUMBER,
  jobTitle: row.JOB_T,
  department: row.DEPARTMENT,
  formType: row.FORM_NAME,
  totalRating: row.TOTAL_RATING,
  requestStatus: row.REQUEST_STATUS,
  createdAt: row.CREATED_AT,
  createdBy: row.CREATED_BY,
});

export async function listEvaluations(
  connection,
  { limit, offset, filters = {}, createdBy, sortBy, sortDir },
) {
  const binds = {};
  const conditions = ['1 = 1'];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (!FILTERS[key]) throw new Error(`Unsupported filter ${key}`);
    conditions.push(FILTERS[key](value));
    binds[key] = value;
  }
  if (createdBy !== undefined && createdBy !== null) {
    conditions.push('H.CREATED_BY = :createdBy');
    binds.createdBy = createdBy;
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const column = SORT_COLUMNS[sortBy];
  if (!column) throw new Error(`Unsupported sort ${sortBy}`);
  const direction = sortDir === 'asc' ? 'ASC' : 'DESC';
  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZP_PAF_PROBATION_HEADER H ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT ${LIST_COLUMNS}
       FROM XXZP.XXZP_PAF_PROBATION_HEADER H
       ${where}
      ORDER BY ${column} ${direction}, H.HEADER_ID
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    { HEADER_ID: ID, CREATED_BY: ID },
  );
  return { total: Number(total), items: result.map(mapListItem) };
}

export async function isHrUser(connection, employeeNumber) {
  const result = await rows(
    connection,
    `SELECT MEANING
       FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_HR'
        AND MEANING = :employeeNumber
      FETCH FIRST 1 ROWS ONLY`,
    { employeeNumber },
  );
  return result.length > 0;
}

export async function listEmployees(connection, userId) {
  const result = await rows(
    connection,
    `SELECT LEVEL AS HIERARCHY_LEVEL, USER_ID, FULL_NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE SYSTEM_PERSON_TYPE IN ('EMP', 'EMP_APL')
        AND ASSIGNMENT_STATUS_TYPE_ID = '1'
        AND CURRENT_EMP_FLAG = 'Y'
        AND LEVEL != 1
      START WITH FULL_NAME = (
        SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId
      )
      CONNECT BY PRIOR FULL_NAME = SUPERVISOR_NAME`,
    { userId },
    { USER_ID: ID },
  );
  return result.map((row) => ({
    hierarchyLevel: row.HIERARCHY_LEVEL,
    userId: row.USER_ID,
    fullName: row.FULL_NAME,
  }));
}

export async function findRequestor(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
       FROM XX_DIGI_EMP_MASTER
      WHERE EMPLOYEE_NUMBER = (
        SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId
      )`,
    { userId },
  );
  return row
    ? {
        fullName: row.FULL_NAME,
        emailAddress: row.EMAIL_ADDRESS,
        employeeNumber: row.EMPLOYEE_NUMBER,
      }
    : null;
}

export async function findEmployeeDetails(connection, { empName, userId }) {
  const [ids] = await rows(
    connection,
    `SELECT PERSON_ID, EMPLOYEE_NUMBER
       FROM XX_DIGI_EMP_MASTER
      WHERE FULL_NAME = :empName AND CURRENT_EMP_FLAG = 'Y'`,
    { empName },
    { PERSON_ID: ID },
  );
  if (!ids) return null;
  const [hire] = await rows(
    connection,
    `SELECT JOINING_DATE AS START_DATE
       FROM XX_DIGI_EMP_MASTER
      WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y'`,
    { personId: ids.PERSON_ID },
  );
  const [job] = await rows(
    connection,
    `SELECT JOB_TITLE AS NAME, JOB_ID
       FROM XX_DIGI_EMP_MASTER
      WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y'`,
    { personId: ids.PERSON_ID },
    { JOB_ID: ID },
  );
  const [department] = await rows(
    connection,
    `SELECT ORGANIZATION_ID, ORGANIZATION_NAME AS NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y'`,
    { personId: ids.PERSON_ID },
    { ORGANIZATION_ID: ID },
  );
  const [supervisor] = await rows(
    connection,
    `SELECT FULL_NAME, PERSON_ID
       FROM XX_DIGI_EMP_MASTER
      WHERE EMPLOYEE_NUMBER IN (
        SELECT DISTINCT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId
      )`,
    { userId },
    { PERSON_ID: ID },
  );
  const [position] = job
    ? await rows(
        connection,
        `SELECT TRUNC((SYSDATE - MIN(PAAF_EFFECTIVE_START_DATE)) / 365) AS YEARS_IN_POSITION
           FROM XX_DIGI_EMP_MASTER
          WHERE PERSON_ID = :personId AND JOB_ID = :jobId`,
        { personId: ids.PERSON_ID, jobId: job.JOB_ID },
      )
    : [];
  return {
    ids: { personId: ids.PERSON_ID, employeeNumber: ids.EMPLOYEE_NUMBER },
    hire: { startDate: hire?.START_DATE ?? null },
    job: { name: job?.NAME ?? null, jobId: job?.JOB_ID ?? null },
    dept: {
      organizationId: department?.ORGANIZATION_ID ?? null,
      name: department?.NAME ?? null,
    },
    sup: supervisor ? { fullName: supervisor.FULL_NAME, personId: supervisor.PERSON_ID } : null,
    pos_year_detail: { year: position?.YEARS_IN_POSITION ?? null },
  };
}
