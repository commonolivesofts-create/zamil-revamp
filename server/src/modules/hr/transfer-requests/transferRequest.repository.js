import oracledb from 'oracledb';

const ID = { type: oracledb.STRING };
const rows = async (connection, sql, binds = {}, fetchInfo) =>
  (await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo })).rows;
const ID_FETCH = {
  HEADER_ID: ID,
  DEPT_MGR_NO: ID,
  C_EMP_NO: ID,
  T_DIRECT_SUPERIOR_NO: ID,
  CREATED_BY: ID,
  PERSON_ID: ID,
  EMPLOYEE_NUMBER: ID,
};

const HEADER_COLUMNS = `HEADER_ID, UUID, PLANT, REQUESTED_BY, DEPT_MGR_NO,
  TO_CHAR(MGR_DATE, 'YYYY-MM-DD') AS MGR_DATE, C_EMP_NO, C_EMPLOYEE_NAME,
  TO_CHAR(C_DATE_OF_JOINING, 'YYYY-MM-DD') AS C_DATE_OF_JOINING,
  C_JOB_TITLE, C_DEPT, C_SECTION, T_JOB_TITLE, T_DEPT, T_SECTION,
  TO_CHAR(T_EFFECTIVE_DATE, 'YYYY-MM-DD') AS T_EFFECTIVE_DATE, T_BLOOD_TYPE,
  T_DIRECT_SUPERIOR_NO, T_DIRECT_SUPERIOR_NAME, T_CHANGE_SALARY, T_BUDGET_SALARY,
  TRANSFER_DEPT_HEAD, ADMIN_SIGNATURE, PRESIDENT, HR_MANAGER, GENERAL_MANAGER,
  HR_SIGNATURE, TO_CHAR(HR_DATE, 'YYYY-MM-DD') AS HR_DATE,
  IT_SIGNATURE, TO_CHAR(IT_DATE, 'YYYY-MM-DD') AS IT_DATE,
  TO_CHAR(ADMIN_DATE, 'YYYY-MM-DD') AS ADMIN_DATE, CREATED_BY, STATUS`;

function mapHeader(r) {
  return {
    headerId: r.HEADER_ID,
    uuid: r.UUID,
    plant: r.PLANT,
    requestedBy: r.REQUESTED_BY,
    deptMgrNo: r.DEPT_MGR_NO,
    mgrDate: r.MGR_DATE,
    current: {
      empNo: r.C_EMP_NO,
      empName: r.C_EMPLOYEE_NAME,
      dateOfJoining: r.C_DATE_OF_JOINING,
      jobTitle: r.C_JOB_TITLE,
      dept: r.C_DEPT,
      section: r.C_SECTION,
    },
    transfer: {
      jobTitle: r.T_JOB_TITLE,
      dept: r.T_DEPT,
      section: r.T_SECTION,
      effectiveDate: r.T_EFFECTIVE_DATE,
      bloodType: r.T_BLOOD_TYPE,
      superiorNo: r.T_DIRECT_SUPERIOR_NO,
      superiorName: r.T_DIRECT_SUPERIOR_NAME,
      changeSalary: r.T_CHANGE_SALARY,
      budgetedSalary: r.T_BUDGET_SALARY,
    },
    approvals: {
      transferDeptHead: r.TRANSFER_DEPT_HEAD,
      adminSignature: r.ADMIN_SIGNATURE,
      president: r.PRESIDENT,
      hrManager: r.HR_MANAGER,
      vp: null,
      generalManager: r.GENERAL_MANAGER,
    },
    // The existing ADMIN_SIGNATURE column is shared; both API keys expose its single value.
    itHr: {
      hrSignature: r.HR_SIGNATURE,
      hrDate: r.HR_DATE,
      itSignature: r.IT_SIGNATURE,
      itDate: r.IT_DATE,
      adminSignature: r.ADMIN_SIGNATURE,
      adminDate: r.ADMIN_DATE,
    },
    status: r.STATUS,
    createdBy: r.CREATED_BY,
  };
}

export async function listEmployeeNames(c) {
  return (
    await rows(c, `SELECT DISTINCT FULL_NAME AS NAME FROM XX_DIGI_EMP_MASTER ORDER BY 1`)
  ).map((r) => ({ name: r.NAME }));
}
export async function findEmployeeDetails(c, name) {
  const [ids] = await rows(
    c,
    `SELECT PERSON_ID, EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER
    WHERE FULL_NAME = :name AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
      AND CURRENT_EMP_FLAG = 'Y'`,
    { name },
    ID_FETCH,
  );
  if (!ids) return null;
  const [hire] = await rows(
    c,
    `SELECT TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') AS START_DATE FROM XX_DIGI_EMP_MASTER
    WHERE PERSON_ID = :personId AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
      AND CURRENT_EMP_FLAG = 'Y'`,
    { personId: ids.PERSON_ID },
  );
  const [job] = await rows(
    c,
    `SELECT JOB_TITLE AS NAME, JOB_ID FROM XX_DIGI_EMP_MASTER
    WHERE PERSON_ID = :personId AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE`,
    { personId: ids.PERSON_ID },
  );
  const [dept] = await rows(
    c,
    `SELECT DISTINCT ORGANIZATION_ID, ORGANIZATION_NAME AS NAME
    FROM XX_DIGI_EMP_MASTER WHERE PERSON_ID = :personId
      AND TRUNC(SYSDATE) BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE) BETWEEN PAAF_EFFECTIVE_START_DATE AND PAAF_EFFECTIVE_END_DATE
      AND CURRENT_EMP_FLAG = 'Y'`,
    { personId: ids.PERSON_ID },
  );
  return {
    empNo: ids.EMPLOYEE_NUMBER,
    personId: ids.PERSON_ID,
    dateOfJoining: hire?.START_DATE ?? null,
    jobTitle: job?.NAME ?? null,
    deptName: dept?.NAME ?? null,
  };
}
export async function listJobs(c) {
  return (
    await rows(c, `SELECT DISTINCT JOB_TITLE AS NAME FROM XX_DIGI_EMP_MASTER ORDER BY 1`)
  ).map((r) => ({ name: r.NAME }));
}
export async function listSections(c) {
  return (
    await rows(
      c,
      `SELECT DISTINCT ORGANIZATION_NAME AS NAME FROM XX_DIGI_EMP_MASTER
    WHERE ORGANIZATION_NAME LIKE '%Section%' ORDER BY 1`,
    )
  ).map((r) => ({ name: r.NAME }));
}
export async function listDirectors(c) {
  return (
    await rows(
      c,
      `SELECT DISTINCT FULL_NAME AS NAME, EMPLOYEE_NUMBER AS EMP_NO
    FROM XX_DIGI_EMP_MASTER WHERE PERSON_ID IN
      (SELECT DISTINCT SUPERVISOR_ID FROM XX_DIGI_EMP_MASTER WHERE ASSIGNMENT_STATUS_TYPE_ID IN (1,3))
    ORDER BY EMPLOYEE_NUMBER`,
      {},
      ID_FETCH,
    )
  ).map((r) => ({ name: r.NAME, empNo: r.EMP_NO }));
}
export async function listBloodTypes(c) {
  return (
    await rows(
      c,
      `SELECT LOOKUP_CODE AS CODE FROM XX_DIGI_LOOKUP_VALUES
    WHERE LOOKUP_TYPE = 'BLOOD_TYPE' ORDER BY 1`,
    )
  ).map((r) => ({ code: r.CODE }));
}
export async function findRequestor(c, userId) {
  return (
    await rows(
      c,
      `SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS
    FROM XX_DIGI_EMP_MASTER WHERE EMPLOYEE_NUMBER IN
      (SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)`,
      { userId },
      ID_FETCH,
    )
  ).map((r) => ({ empNo: r.EMPLOYEE_NUMBER, fullName: r.FULL_NAME, email: r.EMAIL_ADDRESS }));
}
export async function isHrUser(c, userId) {
  return (
    (
      await rows(
        c,
        `SELECT TAG FROM XX_DIGI_LOOKUP_VALUES WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId FETCH FIRST 1 ROWS ONLY`,
        { userId },
      )
    ).length > 0
  );
}

const SORT = Object.freeze({
  headerId: 'TSF.HEADER_ID',
  requestedBy: 'TSF.REQUESTED_BY',
  empName: 'TSF.C_EMPLOYEE_NAME',
  currentJob: 'TSF.C_JOB_TITLE',
  transferJob: 'TSF.T_JOB_TITLE',
  status: 'TSF.STATUS',
  mgrDate: 'TSF.MGR_DATE',
});
function listWhere(filters, userId, isHr) {
  const binds = {
    userId,
    isHr: isHr ? 1 : 0,
    search: filters.search ? `%${filters.search.replace(/[\\%_]/g, (x) => `\\${x}`)}%` : null,
    status: filters.status ?? null,
    plant: filters.plant ?? null,
    transferDept: filters.transferDept ?? null,
    currentDept: filters.currentDept ?? null,
    jobTitle: filters.jobTitle ?? null,
    dateFrom: filters.date_from ?? null,
    dateTo: filters.date_to ?? null,
  };
  const where = `WHERE (:search IS NULL OR UPPER(TSF.REQUESTED_BY) LIKE UPPER(:search) ESCAPE '\\' OR
    UPPER(TSF.C_EMPLOYEE_NAME) LIKE UPPER(:search) ESCAPE '\\' OR UPPER(TSF.T_JOB_TITLE) LIKE UPPER(:search) ESCAPE '\\' OR
    TO_CHAR(TSF.C_EMP_NO) LIKE :search) AND (UPPER(TSF.STATUS)=UPPER(:status) OR :status IS NULL)
    AND (TSF.PLANT=:plant OR :plant IS NULL) AND (TSF.T_DEPT=:transferDept OR :transferDept IS NULL)
    AND (TSF.C_DEPT=:currentDept OR :currentDept IS NULL) AND (TSF.T_JOB_TITLE=:jobTitle OR :jobTitle IS NULL)
    AND (TSF.MGR_DATE >= TO_DATE(:dateFrom,'YYYY-MM-DD') OR :dateFrom IS NULL)
    AND (TSF.MGR_DATE < TO_DATE(:dateTo,'YYYY-MM-DD') + 1 OR :dateTo IS NULL)
    AND (:isHr=1 OR TSF.CREATED_BY=:userId)`;
  return { where, binds };
}
export async function listRequests(c, { filters, userId, isHr, page, pageSize, sort, order }) {
  const { where, binds } = listWhere(filters, userId, isHr);
  const [{ TOTAL }] = await rows(
    c,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZP_TRANSFER_REQUEST TSF ${where}`,
    binds,
  );
  const sortColumn = SORT[sort];
  if (!sortColumn) throw new Error('Unsupported sort');
  const direction = order === 'asc' ? 'ASC' : order === 'desc' ? 'DESC' : null;
  if (!direction) throw new Error('Unsupported sort order');
  const items = await rows(
    c,
    `SELECT TSF.HEADER_ID, TSF.PLANT, TSF.REQUESTED_BY,
    TO_CHAR(TSF.MGR_DATE,'YYYY-MM-DD') AS MGR_DATE, TSF.C_EMPLOYEE_NAME, TSF.C_EMP_NO,
    TSF.C_JOB_TITLE, TSF.C_DEPT, TSF.T_JOB_TITLE, TSF.T_DEPT,
    TO_CHAR(TSF.T_EFFECTIVE_DATE,'YYYY-MM-DD') AS T_EFFECTIVE_DATE,
    TSF.T_DIRECT_SUPERIOR_NAME, TSF.STATUS
    FROM XXZP.XXZP_TRANSFER_REQUEST TSF ${where}
    ORDER BY ${sortColumn} ${direction}, TSF.HEADER_ID DESC
    OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    { ...binds, offset: (page - 1) * pageSize, pageSize },
    ID_FETCH,
  );
  return {
    total: TOTAL,
    rows: items.map((r) => ({
      headerId: r.HEADER_ID,
      plant: r.PLANT,
      requestedBy: r.REQUESTED_BY,
      mgrDate: r.MGR_DATE,
      empName: r.C_EMPLOYEE_NAME,
      empNo: r.C_EMP_NO,
      currentJob: r.C_JOB_TITLE,
      currentDept: r.C_DEPT,
      transferJob: r.T_JOB_TITLE,
      transferDept: r.T_DEPT,
      effectiveDate: r.T_EFFECTIVE_DATE,
      superiorName: r.T_DIRECT_SUPERIOR_NAME,
      status: r.STATUS,
    })),
  };
}
export async function findRequest(c, headerId) {
  const [r] = await rows(
    c,
    `SELECT ${HEADER_COLUMNS} FROM XXZP.XXZP_TRANSFER_REQUEST WHERE HEADER_ID=:headerId`,
    { headerId },
    ID_FETCH,
  );
  return r ? mapHeader(r) : null;
}
export async function findStatusForUpdate(c, headerId) {
  const [r] = await rows(
    c,
    `SELECT STATUS, REQUESTED_BY FROM XXZP.XXZP_TRANSFER_REQUEST WHERE HEADER_ID=:headerId FOR UPDATE`,
    { headerId },
    ID_FETCH,
  );
  return r ? { status: r.STATUS, requestedBy: r.REQUESTED_BY } : null;
}
export async function insertRequest(c, d) {
  await c.execute(
    `INSERT INTO XXZP.XXZP_TRANSFER_REQUEST
    (UUID, PLANT, REQUESTED_BY, DEPT_MGR_NO, SIGNATURE, MGR_DATE, C_EMP_NO, C_EMPLOYEE_NAME,
     C_DATE_OF_JOINING, C_JOB_TITLE, C_DEPT, C_SECTION, T_JOB_TITLE, T_DEPT, T_SECTION,
     T_EFFECTIVE_DATE, T_BLOOD_TYPE, T_DIRECT_SUPERIOR_NO, T_DIRECT_SUPERIOR_NAME,
     T_CHANGE_SALARY, T_BUDGET_SALARY, TRANSFER_DEPT_HEAD, ADMIN_SIGNATURE, PRESIDENT,
     HR_MANAGER, GENERAL_MANAGER, VP, VP_SS, HR_SIGNATURE, IT_SIGNATURE, HR_DATE, IT_DATE,
     ADMIN_DATE, CREATED_BY, STATUS)
    VALUES (:uuid,:plant,:requestedBy,:deptMgrNo,NULL,TO_DATE(:mgrDate,'YYYY-MM-DD'),:cEmpNo,
     :cEmpName,TO_DATE(:cDateOfJoining,'YYYY-MM-DD'),:cJobTitle,:cDept,:cSection,:tJobTitle,
     :tDept,:tSection,TO_DATE(:tEffectiveDate,'YYYY-MM-DD'),:tBloodType,:tSuperiorNo,:tSuperiorName,
     :tChangeSalary,:tBudgetSalary,'Draft','Draft','Draft','Draft','Draft','Draft','Draft',
     :hrSignature,:itSignature,TO_DATE(:hrDate,'YYYY-MM-DD'),TO_DATE(:itDate,'YYYY-MM-DD'),
     TO_DATE(:adminDate,'YYYY-MM-DD'),:createdBy,'Draft')`,
    d,
  );
  const [r] = await rows(
    c,
    `SELECT HEADER_ID FROM XXZP.XXZP_TRANSFER_REQUEST WHERE UUID=:uuid`,
    { uuid: d.uuid },
    ID_FETCH,
  );
  return r?.HEADER_ID ?? null;
}
export async function updateRequest(c, d) {
  const r = await c.execute(
    `UPDATE XXZP.XXZP_TRANSFER_REQUEST SET PLANT=:plant, REQUESTED_BY=:requestedBy,
    MGR_DATE=TO_DATE(:mgrDate,'YYYY-MM-DD'), C_EMP_NO=:cEmpNo, C_EMPLOYEE_NAME=:cEmpName,
    C_DATE_OF_JOINING=TO_DATE(:cDateOfJoining,'YYYY-MM-DD'), C_JOB_TITLE=:cJobTitle, C_DEPT=:cDept,
    C_SECTION=:cSection, T_JOB_TITLE=:tJobTitle, T_DEPT=:tDept, T_SECTION=:tSection,
    T_EFFECTIVE_DATE=TO_DATE(:tEffectiveDate,'YYYY-MM-DD'), T_BLOOD_TYPE=:tBloodType,
    T_DIRECT_SUPERIOR_NO=:tSuperiorNo, T_DIRECT_SUPERIOR_NAME=:tSuperiorName,
    T_CHANGE_SALARY=:tChangeSalary, T_BUDGET_SALARY=:tBudgetSalary, HR_SIGNATURE=:hrSignature,
    IT_SIGNATURE=:itSignature, HR_DATE=TO_DATE(:hrDate,'YYYY-MM-DD'), IT_DATE=TO_DATE(:itDate,'YYYY-MM-DD'),
    ADMIN_DATE=TO_DATE(:adminDate,'YYYY-MM-DD') WHERE HEADER_ID=:headerId`,
    d,
  );
  return r.rowsAffected === 1;
}
export async function deleteRequest(c, headerId) {
  return (
    (
      await c.execute(`DELETE FROM XXZP.XXZP_TRANSFER_REQUEST WHERE HEADER_ID=:headerId`, {
        headerId,
      })
    ).rowsAffected === 1
  );
}
