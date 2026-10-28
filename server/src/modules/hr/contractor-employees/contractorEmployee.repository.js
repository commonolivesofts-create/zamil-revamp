import oracledb from 'oracledb';

const STRING = { type: oracledb.STRING };
const ID_FETCH = Object.freeze({
  EMP_ID: STRING,
  EMPLOYEE_NUMBER: STRING,
  DIRECT_BOSS_ID: STRING,
  JOB: STRING,
  CON_NUMBER: STRING,
  CREATEB_BY: STRING,
  UPDATED_BY: STRING,
  CON_ID: STRING,
  PERSON_ID: STRING,
  JOB_ID: STRING,
  ORGANIZATION_ID: STRING,
});
const rows = async (connection, sql, binds = {}, fetchInfo) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo })).rows;

const mapEmployee = (row) => ({
  emp_id: row.EMP_ID === null || row.EMP_ID === undefined ? null : String(row.EMP_ID),
  employee_number:
    row.EMPLOYEE_NUMBER === null || row.EMPLOYEE_NUMBER === undefined
      ? null
      : String(row.EMPLOYEE_NUMBER),
  employee_name: row.EMPLOYEE_NAME,
  division: row.DIVISION,
  iqamah: row.IQAMAH,
  department: row.DEPARTMENT,
  prod_dep: row.PROD_DEP,
  direct_boss: row.DIRECT_BOSS,
  direct_boss_id:
    row.DIRECT_BOSS_ID === null || row.DIRECT_BOSS_ID === undefined
      ? null
      : String(row.DIRECT_BOSS_ID),
  job: row.JOB === null || row.JOB === undefined ? null : String(row.JOB),
  job_title: row.JOB_TITLE,
  place: row.PLACE,
  replacement:
    row.REPLACEMENT === null || row.REPLACEMENT === undefined ? null : String(row.REPLACEMENT),
  rate: row.RATE,
  start_date: row.START_DATE,
  end_date: row.END_DATE,
  status: row.STATUS,
  ajeer: row.AJEER === 'on',
  sfda: row.SFDA === 'on',
  blacklist: row.BLACKLIST === 'on',
  remark: row.REMARK,
  con_number:
    row.CON_NUMBER === null || row.CON_NUMBER === undefined ? null : Number(row.CON_NUMBER),
  con_name: row.CON_NAME,
  created_by:
    row.CREATEB_BY === null || row.CREATEB_BY === undefined ? null : String(row.CREATEB_BY),
  creation_date: row.CREATION_DATE,
  updated_by:
    row.UPDATED_BY === null || row.UPDATED_BY === undefined ? null : String(row.UPDATED_BY),
  updated_date: row.UPDATED_DATE,
});

const EMPLOYEE_COLUMNS = `EMP_ID, EMPLOYEE_NUMBER, EMPLOYEE_NAME, DIVISION, IQAMAH, DEPARTMENT,
  PROD_DEP, DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE, PLACE, REPLACEMENT, RATE,
  TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
  TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE, STATUS, AJEER, SFDA, BLACKLIST, REMARK,
  CON_NUMBER, CON_NAME, CREATEB_BY,
  TO_CHAR(CREATION_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS CREATION_DATE, UPDATED_BY,
  TO_CHAR(UPDATED_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS UPDATED_DATE`;

export async function listEmployees(connection, { filters, limit, offset, sort, order }) {
  const binds = {
    division: filters.division,
    department: filters.department,
    status: filters.status,
    contractorNumber: filters.contractorNumber,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  };
  const where = `WHERE (:division IS NULL OR DIVISION = :division)
    AND (:department IS NULL OR DEPARTMENT = :department)
    AND (:status IS NULL OR STATUS = :status)
    AND (:contractorNumber IS NULL OR CON_NUMBER = :contractorNumber)
    AND (:dateFrom IS NULL OR START_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
    AND (:dateTo IS NULL OR END_DATE IS NULL OR END_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD'))`;
  const sortColumns = Object.freeze({
    employee_number: 'EMPLOYEE_NUMBER',
    employee_name: 'EMPLOYEE_NAME',
    start_date: 'START_DATE',
    end_date: 'END_DATE',
    status: 'STATUS',
    con_number: 'CON_NUMBER',
  });
  const sortColumn = sortColumns[sort];
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  const [count] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XX_CON_EMPLOYEE_INFO ${where}`,
    binds,
  );
  const records = await rows(
    connection,
    `SELECT ${EMPLOYEE_COLUMNS}
       FROM XXZP.XX_CON_EMPLOYEE_INFO
       ${where}
      ORDER BY ${sortColumn} ${direction} NULLS LAST, EMP_ID ASC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    ID_FETCH,
  );
  return { total: Number(count?.TOTAL ?? 0), items: records.map(mapEmployee) };
}

export async function findEmployee(connection, empId) {
  const [row] = await rows(
    connection,
    `SELECT ${EMPLOYEE_COLUMNS} FROM XXZP.XX_CON_EMPLOYEE_INFO WHERE EMP_ID = :empId`,
    { empId },
    ID_FETCH,
  );
  return row ? mapEmployee(row) : null;
}

export async function deleteEmployee(connection, empId) {
  const result = await connection.execute(
    `DELETE FROM XXZP.XX_CON_EMPLOYEE_INFO WHERE EMP_ID = :empId`,
    { empId },
  );
  return result.rowsAffected === 1;
}

export async function lockContractor(connection, conNumber) {
  const records = await rows(
    connection,
    `SELECT CON_ID, CON_NUMBER, CON_NAME, STATUS, RATE
       FROM XXZP.XX_CONTRACTOR_INFO
      WHERE CON_NUMBER = :conNumber
      FOR UPDATE`,
    { conNumber },
    ID_FETCH,
  );
  const row = records[0];
  return row
    ? {
        conId: row.CON_ID,
        conNumber: row.CON_NUMBER,
        conName: row.CON_NAME,
        status: row.STATUS,
        rate: row.RATE,
      }
    : null;
}

export async function findContractor(connection, conNumber) {
  const [row] = await rows(
    connection,
    `SELECT CON_ID, CON_NUMBER, CON_NAME, START_DATE, END_DATE, STATUS, RATE
       FROM XXZP.XX_CONTRACTOR_INFO
      WHERE CON_NUMBER = :conNumber`,
    { conNumber },
    ID_FETCH,
  );
  return row
    ? {
        conId: String(row.CON_ID),
        conNumber: String(row.CON_NUMBER),
        conName: row.CON_NAME,
        startDate: row.START_DATE,
        endDate: row.END_DATE,
        status: row.STATUS,
        rate: row.RATE,
      }
    : null;
}

export async function findJob(connection, jobId) {
  const [row] = await rows(
    connection,
    `SELECT DISTINCT JOB_ID, JOB_TITLE FROM XX_DIGI_EMP_MASTER WHERE JOB_ID = :jobId`,
    { jobId },
    ID_FETCH,
  );
  return row ? { jobId: row.JOB_ID, jobTitle: row.JOB_TITLE } : null;
}

export async function findBoss(connection, personId) {
  const [row] = await rows(
    connection,
    `SELECT DISTINCT PERSON_ID, FULL_NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE PERSON_ID = :personId
        AND FULL_NAME IN (SELECT DISTINCT SUPERVISOR_NAME FROM XX_DIGI_EMP_MASTER)
        AND CURRENT_EMP_FLAG = 'Y'`,
    { personId },
    ID_FETCH,
  );
  return row ? { personId: row.PERSON_ID, fullName: row.FULL_NAME } : null;
}

export async function generateEmployeeId(connection) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(EMP_ID) + 1, 1) AS ID FROM XXZP.XX_CON_EMPLOYEE_INFO`,
    {},
    { ID: STRING },
  );
  return row?.ID;
}

export async function generateEmployeeNumber(connection, conNumber) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(EMPLOYEE_NUMBER) + 1, :conNumber) AS NUM
       FROM XXZP.XX_CON_EMPLOYEE_INFO
      WHERE CON_NUMBER = :conNumber`,
    { conNumber },
    { NUM: STRING },
  );
  return row?.NUM;
}

export async function insertEmployee(connection, input) {
  await connection.execute(
    `INSERT INTO XXZP.XX_CON_EMPLOYEE_INFO (
       EMP_ID, EMPLOYEE_NUMBER, EMPLOYEE_NAME, DIVISION, IQAMAH, DEPARTMENT, PROD_DEP,
       DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE, PLACE, REPLACEMENT, RATE,
       START_DATE, END_DATE, STATUS, AJEER, SFDA, BLACKLIST, REMARK,
       CON_NUMBER, CON_NAME, CREATEB_BY, CREATION_DATE
     ) VALUES (
       :empId, :employeeNumber, :employeeName, :division, :iqamah, :department, :prodDep,
       :directBoss, :directBossId, :job, :jobTitle, :place, :replacement, :rate,
       TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), :status,
       :ajeer, :sfda, :blacklist, :remark,
       :conNumber, :conName, :createdBy, SYSDATE
     )`,
    input,
  );
}

export async function updateEmployee(connection, input) {
  const result = await connection.execute(
    `UPDATE XXZP.XX_CON_EMPLOYEE_INFO SET
       EMPLOYEE_NAME = :employeeName,
       DIVISION = :division,
       IQAMAH = :iqamah,
       DEPARTMENT = :department,
       PROD_DEP = :prodDep,
       DIRECT_BOSS = :directBoss,
       DIRECT_BOSS_ID = :directBossId,
       JOB = :job,
       JOB_TITLE = :jobTitle,
       PLACE = :place,
       REPLACEMENT = :replacement,
       RATE = :rate,
       START_DATE = TO_DATE(:startDate, 'YYYY-MM-DD'),
       END_DATE = TO_DATE(:endDate, 'YYYY-MM-DD'),
       STATUS = :status,
       AJEER = :ajeer,
       SFDA = :sfda,
       BLACKLIST = :blacklist,
       REMARK = :remark,
       CON_NUMBER = :conNumber,
       CON_NAME = :conName,
       UPDATED_BY = :updatedBy,
       UPDATED_DATE = SYSDATE
     WHERE EMP_ID = :empId`,
    input,
  );
  return result.rowsAffected === 1;
}

export async function listDivisions() {
  return [
    { value: '300000003618177', label: 'IPP BU' },
    { value: '300000003618190', label: 'FPP BU' },
  ];
}

export async function listDepartments(connection) {
  const records = await rows(
    connection,
    `SELECT DISTINCT DEPARTMENT AS VALUE
       FROM XXZP.XX_CON_EMPLOYEE_INFO
      WHERE DEPARTMENT IS NOT NULL
     UNION
     SELECT 'ALL' AS VALUE FROM DUAL
      ORDER BY VALUE`,
  );
  return records.map((row) => ({ value: row.VALUE, label: row.VALUE }));
}

export async function listContractors(connection) {
  const records = await rows(
    connection,
    `SELECT DISTINCT CON_ID, CON_NUMBER, CON_NAME
       FROM XXZP.XX_CONTRACTOR_INFO
      ORDER BY CON_NUMBER`,
    {},
    ID_FETCH,
  );
  return records.map((row) => ({
    value: String(row.CON_NUMBER),
    label: row.CON_NAME,
    con_id: String(row.CON_ID),
    con_number: Number(row.CON_NUMBER),
    con_name: row.CON_NAME,
  }));
}

export async function listJobs(connection) {
  const records = await rows(
    connection,
    `SELECT DISTINCT JOB_ID, JOB_TITLE FROM XX_DIGI_EMP_MASTER ORDER BY 1`,
    {},
    ID_FETCH,
  );
  return records.map((row) => ({ value: String(row.JOB_ID), label: row.JOB_TITLE }));
}

export async function listBosses(connection) {
  const records = await rows(
    connection,
    `SELECT DISTINCT PERSON_ID, FULL_NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE FULL_NAME IN (SELECT DISTINCT SUPERVISOR_NAME FROM XX_DIGI_EMP_MASTER)
        AND CURRENT_EMP_FLAG = 'Y'`,
    {},
    ID_FETCH,
  );
  return records.map((row) => ({ value: String(row.PERSON_ID), label: row.FULL_NAME }));
}

export async function listSections(connection) {
  const records = await rows(
    connection,
    `SELECT DISTINCT ORGANIZATION_ID, ORGANIZATION_NAME
       FROM XX_DIGI_EMP_MASTER
      ORDER BY 1`,
    {},
    ID_FETCH,
  );
  return records.map((row) => ({
    value: String(row.ORGANIZATION_ID),
    label: row.ORGANIZATION_NAME,
  }));
}
