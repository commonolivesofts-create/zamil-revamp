import oracledb from 'oracledb';

const ID = { type: oracledb.STRING };
const HEADER_ID = Object.freeze({ HEADER_ID: ID });
const LINE_IDS = Object.freeze({ HEADER_ID: ID, RATING_ID: ID, IND_DEV_ID: ID, PLANNING_ID: ID });
const rows = async (connection, sql, binds = {}, fetchInfo) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo })).rows;

const CRITERIA_EN = Object.freeze([
  'Quality / Accuracy of Work',
  'Quanitity of Work',
  'Dependability',
  'Attendance / Punctuality',
  'Professional Communication Skills with co-workers/Supervisors',
  'Customer-focused Communication Skills',
  'Ability to work as a member of a team; teamwork',
  'Demonstrates Positive Attitude',
  'Ability to work independently',
  'Open to feedback',
  'Willingness to take on additional responsibilities',
  'Complies with company policies and procedures',
  'Exhibits effective problem solving skills',
  'Eagerness to learn new-job related skills',
  'Ask questions and seek guidance as needed',
  'Makes progress towards professional development goals',
  'Demonstrates Zamil Group Core Values',
  'Initiative',
  'Developing Others',
  'Health Safety & Environment (HSE)',
]);
const CRITERIA_AR = Object.freeze([
  'جودة / دقة العمل',
  'كمية العمل',
  'الإعتمادية',
  'الحضور / الالتزام بالمواعيد',
  'مهارات الاتصال المهني مع زملاء العمل / المشرفين',
  'مهارات الاتصال التي تركز على العملاء',
  'القدرة على العمل كعضو في الفريق. العمل بروح الفريق الواحد',
  'يوضح الموقف الإيجابي',
  'القدرة على العمل بشكل مستقل',
  'يتقبل الملاحظات',
  'الإستعداد لتحمل مسؤوليات إضافية',
  'يتوافق مع سياسات وإجراءات الشركة',
  'يظهر مهارات فعالة في حل المشاكل',
  'الرغبة في تعلم المهارات المتعلقة بالوظيفة الجديدة',
  'طرح الأسئلة وطلب التوجيه حسب الحاجة',
  'يحرز التقدم نحو أهداف التطوير المهني',
  'يظهراهتمامه بالقيم الأساسية لمجموعة الزامل',
  'مبادرة',
  'تطوير الآخرين',
  'بيئة صحية آمنة',
]);

export async function isHrUser(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT 1 AS MATCHED FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId FETCH FIRST 1 ROWS ONLY`,
    { userId },
  );
  return Boolean(row);
}

const FILTERS = Object.freeze({
  search: ` (UPPER(HR.EMPLOYEE_NAME) LIKE UPPER(:search) ESCAPE '\\' OR UPPER(HR.JOB_TITLE) LIKE UPPER(:search) ESCAPE '\\'
    OR UPPER(HR.DEPARTMENT_NAME) LIKE UPPER(:search) ESCAPE '\\' OR TO_CHAR(HR.EMPLOYEE_NUMBER) LIKE :search ESCAPE '\\')`,
  status: 'UPPER(HR.STATUS) = UPPER(:status)',
  grade: 'HR.ATTRIBUTE10 = :grade',
  department: 'HR.DEPARTMENT_NAME = :department',
});
const SORT = Object.freeze({
  headerId: 'HR.HEADER_ID',
  empName: 'HR.EMPLOYEE_NAME',
  empNumber: 'HR.EMPLOYEE_NUMBER',
  jobTitle: 'HR.JOB_TITLE',
  grade: 'HR.ATTRIBUTE10',
  rating: 'HR.TOTAL_RATINGS',
  year: 'HR.YEAR',
  creationDate: 'HR.CREATION_DATE',
});
const mapList = (r) => ({
  headerId: r.HEADER_ID,
  empName: r.EMPLOYEE_NAME,
  empNumber: r.EMPLOYEE_NUMBER,
  jobTitle: r.JOB_TITLE,
  department: r.DEPARTMENT_NAME,
  rating: r.TOTAL_RATINGS,
  grade: r.GRADE,
  description: r.DESCRIPTION_TEXT,
  status: r.STATUS,
  year: r.YEAR,
  creationDate: r.CREATION_DATE,
});

export async function listAppraisals(
  connection,
  { year, filters, page, pageSize, sort, order, userId, isHr, noEmployee },
) {
  if (noEmployee) return { total: 0, items: [] };
  const binds = { year };
  const clauses = ['HR.YEAR = :year'];
  for (const key of Object.keys(FILTERS)) {
    if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
      clauses.push(FILTERS[key]);
      binds[key] = filters[key];
    }
  }
  if (!isHr) {
    clauses.push('HR.CREATED_BY = :userId');
    binds.userId = userId;
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const [count] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZPI_HR_PA_HEADER_TAB HR ${where}`,
    binds,
  );
  const items = await rows(
    connection,
    `SELECT HR.HEADER_ID, HR.EMPLOYEE_NAME, HR.EMPLOYEE_NUMBER, HR.JOB_TITLE, HR.DEPARTMENT_NAME,
            HR.TOTAL_RATINGS, HR.ATTRIBUTE9 AS DESCRIPTION_TEXT, HR.ATTRIBUTE10 AS GRADE,
            HR.STATUS, HR.YEAR, TO_CHAR(HR.CREATION_DATE, 'YYYY-MM-DD') AS CREATION_DATE
       FROM XXZP.XXZPI_HR_PA_HEADER_TAB HR ${where}
      ORDER BY ${SORT[sort]} ${order.toUpperCase()}, HR.HEADER_ID DESC
      OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    { ...binds, offset: (page - 1) * pageSize, pageSize },
    { ...HEADER_ID, EMPLOYEE_NUMBER: ID, CREATED_BY: ID },
  );
  return { total: Number(count?.TOTAL ?? 0), items: items.map(mapList) };
}

export async function findHeader(connection, headerId) {
  const [r] = await rows(
    connection,
    `SELECT HEADER_ID, UUID, EMPLOYEE_ID, EMPLOYEE_NAME, EMPLOYEE_NUMBER,
            TO_CHAR(HIRE_DATE, 'YYYY-MM-DD') AS HIRE_DATE, JOB_ID, JOB_TITLE,
            TO_CHAR(APPRAISAL_PERIOD_FROM, 'YYYY-MM-DD') AS PERIOD_FROM,
            TO_CHAR(APPRAISAL_PERIOD_TO, 'YYYY-MM-DD') AS PERIOD_TO,
            DEPARTMENT_ID, DEPARTMENT_NAME, EVALUATED_BY, TOTAL_RATINGS,
            ATTRIBUTE10 AS GRADE, ATTRIBUTE9 AS DESCRIPTION_TEXT, ATTRIBUTE11 AS YEARS_IN_COMPANY,
            ATTRIBUTE12 AS YEARS_IN_POSITION, YEAR, EMP_REMARKS, APP_REMARKS, STATUS,
            ATTRIBUTE1 AS FORM_LANGUAGE, CREATED_BY,
            TO_CHAR(CREATION_DATE, 'YYYY-MM-DD') AS CREATION_DATE
       FROM XXZP.XXZPI_HR_PA_HEADER_TAB WHERE HEADER_ID = :headerId`,
    { headerId },
    {
      ...HEADER_ID,
      EMPLOYEE_ID: ID,
      EMPLOYEE_NUMBER: ID,
      JOB_ID: ID,
      DEPARTMENT_ID: ID,
      CREATED_BY: ID,
    },
  );
  if (!r) return null;
  const ratingRows = await rows(
    connection,
    `SELECT RATING_ID, COMPETENCY_NAME, DESCRIPTION, RATINGS FROM XXZP.XXZPI_HR_PA_RATING_TAB
      WHERE HEADER_ID = :headerId ORDER BY RATING_ID`,
    { headerId },
    LINE_IDS,
  );
  const devRows = await rows(
    connection,
    `SELECT IND_DEV_ID, IDENTIFIED_NEEDS FROM XXZP.XXZPI_HR_PA_DEV_TAB
      WHERE HEADER_ID = :headerId ORDER BY IND_DEV_ID`,
    { headerId },
    LINE_IDS,
  );
  const planRows = await rows(
    connection,
    `SELECT PLANNING_ID, OBJECTIVE FROM XXZP.XXZPI_HR_PA_PLANNING_TAB
      WHERE HEADER_ID = :headerId ORDER BY PLANNING_ID`,
    { headerId },
    LINE_IDS,
  );
  return {
    headerId: r.HEADER_ID,
    uuid: r.UUID,
    employee: {
      personId: r.EMPLOYEE_ID,
      name: r.EMPLOYEE_NAME,
      number: r.EMPLOYEE_NUMBER,
      hireDate: r.HIRE_DATE,
      jobId: r.JOB_ID,
      jobTitle: r.JOB_TITLE,
      departmentId: r.DEPARTMENT_ID,
      department: r.DEPARTMENT_NAME,
    },
    period: { year: r.YEAR, from: r.PERIOD_FROM, to: r.PERIOD_TO },
    appraiser: {
      evaluatedBy: r.EVALUATED_BY,
      yearsInCompany: r.YEARS_IN_COMPANY,
      yearsInPosition: r.YEARS_IN_POSITION,
    },
    result: { rating: r.TOTAL_RATINGS, grade: r.GRADE, description: r.DESCRIPTION_TEXT },
    criteria: ratingRows.map((x) => ({
      id: x.RATING_ID,
      name: x.COMPETENCY_NAME,
      rating: x.RATINGS,
      justification: x.DESCRIPTION,
    })),
    development: devRows.map((x) => ({ id: x.IND_DEV_ID, need: x.IDENTIFIED_NEEDS })),
    training: planRows.map((x) => ({ id: x.PLANNING_ID, objective: x.OBJECTIVE })),
    remarks: { employee: r.EMP_REMARKS, appraiser: r.APP_REMARKS },
    status: r.STATUS,
    formLanguage: r.FORM_LANGUAGE,
    createdBy: r.CREATED_BY,
    creationDate: r.CREATION_DATE,
  };
}

export async function findStatus(connection, headerId, lock = false) {
  const [r] = await rows(
    connection,
    `SELECT STATUS FROM XXZP.XXZPI_HR_PA_HEADER_TAB WHERE HEADER_ID = :headerId${lock ? ' FOR UPDATE' : ''}`,
    { headerId },
  );
  return r?.STATUS ?? null;
}

export async function findHeaderIdByUuid(connection, uuid) {
  const [r] = await rows(
    connection,
    `SELECT HEADER_ID FROM XXZP.XXZPI_HR_PA_HEADER_TAB WHERE UUID = :uuid`,
    { uuid },
    HEADER_ID,
  );
  return r?.HEADER_ID ?? null;
}

export async function hasDuplicate(connection, employeeNumber, year) {
  const [r] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZPI_HR_PA_HEADER_TAB
      WHERE EMPLOYEE_NUMBER = :employeeNumber AND YEAR = :year
        AND NVL(UPPER(STATUS), '-') <> 'REJECTED'`,
    { employeeNumber, year },
  );
  return Number(r?.TOTAL ?? 0) > 0;
}

export async function insertHeader(connection, h) {
  await connection.execute(
    `INSERT INTO XXZP.XXZPI_HR_PA_HEADER_TAB
      (UUID, EMPLOYEE_ID, EMPLOYEE_NAME, EMPLOYEE_NUMBER, HIRE_DATE, JOB_ID, JOB_TITLE,
       APPRAISAL_PERIOD_FROM, APPRAISAL_PERIOD_TO, DEPARTMENT_ID, DEPARTMENT_NAME, REPORTING_TO,
       EVALUATED_BY, TOTAL_RATINGS, NUMBER_OF_FACTORS, YEAR, CREATED_BY, CREATION_DATE,
       ATTRIBUTE9, ATTRIBUTE10, ATTRIBUTE11, ATTRIBUTE12, FINAL_RATING_TOTAL, STATUS,
       EMP_REMARKS, APP_REMARKS, ATTRIBUTE1)
     VALUES (:uuid, :personId, :empName, :empNumber, TO_DATE(:hireDate, 'YYYY-MM-DD'), :jobId,
       :jobTitle, TO_DATE(:periodFrom, 'YYYY-MM-DD'), TO_DATE(:periodTo, 'YYYY-MM-DD'),
       :departmentId, :department, 'ZAMIL PLASTIC', :evaluatedBy, :rating, 20, :year,
       :createdBy, SYSDATE, :description, :grade, :yearsInCompany, :yearsInPosition, :rating,
       'Inprocess', :employeeRemarks, :appraiserRemarks, :formLanguage)`,
    h,
  );
}

export async function insertRating(connection, x) {
  await connection.execute(
    `INSERT INTO XXZP.XXZPI_HR_PA_RATING_TAB
      (RATING_ID, HEADER_ID, PERSON_ID, COMPETENCY_CODE, COMPETENCY_NAME, DESCRIPTION, RATINGS, CREATION_DATE)
     VALUES (:id, :headerId, :personId, :id, :name, :justification, :rating, SYSDATE)`,
    x,
  );
}
export async function insertDevelopment(connection, x) {
  await connection.execute(
    `INSERT INTO XXZP.XXZPI_HR_PA_DEV_TAB
    (IND_DEV_ID, IDENTIFIED_NEEDS, HEADER_ID, CREATION_DATE) VALUES (:id, :need, :headerId, SYSDATE)`,
    x,
  );
}
export async function insertTraining(connection, x) {
  await connection.execute(
    `INSERT INTO XXZP.XXZPI_HR_PA_PLANNING_TAB
    (PLANNING_ID, OBJECTIVE_ID, OBJECTIVE, HEADER_ID, CREATION_DATE)
    VALUES (:id, :id, :objective, :headerId, SYSDATE)`,
    x,
  );
}

export async function updateHeader(connection, x) {
  const r = await connection.execute(
    `UPDATE XXZP.XXZPI_HR_PA_HEADER_TAB
    SET TOTAL_RATINGS = :rating, FINAL_RATING_TOTAL = :rating, ATTRIBUTE9 = :description,
        ATTRIBUTE10 = :grade, EMP_REMARKS = :employeeRemarks, APP_REMARKS = :appraiserRemarks
    WHERE HEADER_ID = :headerId`,
    x,
  );
  return r.rowsAffected === 1;
}
export async function updateRating(connection, x) {
  const r = await connection.execute(
    `UPDATE XXZP.XXZPI_HR_PA_RATING_TAB
    SET DESCRIPTION = :justification, RATINGS = :rating
    WHERE HEADER_ID = :headerId AND RATING_ID = :id`,
    x,
  );
  return r.rowsAffected === 1;
}
export async function updateDevelopment(connection, x) {
  const r = await connection.execute(
    `UPDATE XXZP.XXZPI_HR_PA_DEV_TAB
    SET IDENTIFIED_NEEDS = :need WHERE HEADER_ID = :headerId AND IND_DEV_ID = :id`,
    x,
  );
  return r.rowsAffected === 1;
}
export async function updateTraining(connection, x) {
  const r = await connection.execute(
    `UPDATE XXZP.XXZPI_HR_PA_PLANNING_TAB
    SET OBJECTIVE = :objective WHERE HEADER_ID = :headerId AND PLANNING_ID = :id`,
    x,
  );
  return r.rowsAffected === 1;
}
export async function updateEmployeeRemarks(connection, x) {
  const r = await connection.execute(
    `UPDATE XXZP.XXZPI_HR_PA_HEADER_TAB
    SET EMP_REMARKS = :remarks WHERE HEADER_ID = :headerId`,
    x,
  );
  return r.rowsAffected === 1;
}
export async function deleteAppraisal(connection, headerId) {
  for (const table of ['XXZPI_HR_PA_RATING_TAB', 'XXZPI_HR_PA_DEV_TAB', 'XXZPI_HR_PA_PLANNING_TAB'])
    await connection.execute(`DELETE FROM XXZP.${table} WHERE HEADER_ID = :headerId`, { headerId });
  const r = await connection.execute(
    `DELETE FROM XXZP.XXZPI_HR_PA_HEADER_TAB WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return r.rowsAffected === 1;
}

export async function listEmployees(connection, userId, year) {
  return rows(
    connection,
    `SELECT DISTINCT LEVEL AS HIERARCHY_LEVEL, OT.USER_ID, OT.FULL_NAME, OT.EMPLOYEE_NUMBER
       FROM XX_DIGI_EMP_MASTER OT
      WHERE OT.SYSTEM_PERSON_TYPE IN ('EMP','EMP_APL') AND OT.ASSIGNMENT_STATUS_TYPE_ID = '1'
        AND OT.CURRENT_EMP_FLAG = 'Y' AND LEVEL != 1
        AND NOT EXISTS (SELECT 1 FROM XXZP.XXZPI_HR_PA_HEADER_TAB HD
          WHERE HD.EMPLOYEE_NUMBER = OT.EMPLOYEE_NUMBER AND HD.YEAR = :year
            AND NVL(UPPER(HD.STATUS), '-') <> 'REJECTED')
      START WITH OT.FULL_NAME = (SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
      CONNECT BY PRIOR OT.FULL_NAME = OT.SUPERVISOR_NAME`,
    { userId, year },
    { USER_ID: ID, EMPLOYEE_NUMBER: ID },
  );
}

export async function findEmployee(connection, name, userId) {
  const [r] = await rows(
    connection,
    `SELECT PERSON_ID, EMPLOYEE_NUMBER, FULL_NAME, TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') AS HIRE_DATE,
       JOB_ID, JOB_TITLE, ORGANIZATION_ID, ORGANIZATION_NAME, PAAF_EFFECTIVE_START_DATE
     FROM XX_DIGI_EMP_MASTER WHERE FULL_NAME = :name AND CURRENT_EMP_FLAG = 'Y'
       AND SYSTEM_PERSON_TYPE IN ('EMP','EMP_APL') AND ASSIGNMENT_STATUS_TYPE_ID = '1'
       AND FULL_NAME IN (SELECT OT.FULL_NAME FROM XX_DIGI_EMP_MASTER OT
         WHERE LEVEL != 1 START WITH OT.FULL_NAME = (SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
         CONNECT BY PRIOR OT.FULL_NAME = OT.SUPERVISOR_NAME) FETCH FIRST 1 ROWS ONLY`,
    { name, userId },
    { PERSON_ID: ID, EMPLOYEE_NUMBER: ID, JOB_ID: ID, ORGANIZATION_ID: ID },
  );
  if (!r) return null;
  const [sup] = await rows(
    connection,
    `SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId`,
    { userId },
  );
  const [years] = await rows(
    connection,
    `SELECT TRUNC((SYSDATE - MIN(PAAF_EFFECTIVE_START_DATE))/365) AS YEARS_IN_COMPANY,
      TRUNC((SYSDATE - MIN(CASE WHEN JOB_ID = :jobId THEN PAAF_EFFECTIVE_START_DATE END))/365) AS YEARS_IN_POSITION
    FROM XX_DIGI_EMP_MASTER WHERE PERSON_ID = :personId`,
    { jobId: r.JOB_ID, personId: r.PERSON_ID },
  );
  return {
    personId: r.PERSON_ID,
    number: r.EMPLOYEE_NUMBER,
    name: r.FULL_NAME,
    hireDate: r.HIRE_DATE,
    jobId: r.JOB_ID,
    jobTitle: r.JOB_TITLE,
    departmentId: r.ORGANIZATION_ID,
    department: r.ORGANIZATION_NAME,
    evaluatedBy: sup?.FULL_NAME ?? '',
    yearsInCompany: years?.YEARS_IN_COMPANY ?? null,
    yearsInPosition: years?.YEARS_IN_POSITION ?? null,
  };
}
export async function findRequestor(connection, userId) {
  const [r] = await rows(
    connection,
    `SELECT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
    FROM XX_DIGI_EMP_MASTER WHERE EMPLOYEE_NUMBER =
      (SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)`,
    { userId },
    { EMPLOYEE_NUMBER: ID },
  );
  return r
    ? { fullName: r.FULL_NAME, emailAddress: r.EMAIL_ADDRESS, employeeNumber: r.EMPLOYEE_NUMBER }
    : null;
}
export async function gradeStats(connection, userId, totalEmployees) {
  const result = {};
  for (const grade of ['A', 'B', 'C', 'D', 'E']) {
    const [r] = await rows(
      connection,
      `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZPI_HR_PA_HEADER_TAB
      WHERE ATTRIBUTE10 = :grade AND CREATED_BY = :userId`,
      { grade, userId },
    );
    result[grade] = Number(r?.TOTAL ?? 0);
  }
  return { allocated: result, totalEmployees };
}

export const englishCriteria = CRITERIA_EN;
export const arabicCriteria = CRITERIA_AR;
