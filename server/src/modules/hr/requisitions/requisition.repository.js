import oracledb from 'oracledb';

/*
 * Personal Requisition Form SQL (README_personal_requisition_form.md §3–§8). Values are always
 * bound; sort columns and filter fragments come only from the fixed maps below. IDs
 * (NUMBER(19,0)) are read and bound as strings. Business dates are bound as legacy 'DD-Mon-YY'
 * strings and matched with TO_DATE, as the approved SQL specifies; filter dates are ISO
 * 'YYYY-MM-DD'. ATTRIBUTE14/15 are VARCHAR2 already holding 'DD-Mon-YY', so they are read raw.
 * `TO_CHAR(SYSDATE,'DD-Mon-YY')` plays the README's PHP-supplied :today (same clock as
 * SYSDATE audit columns). Every statement runs on the connection the service passes in —
 * repositories never commit or roll back. No workflow table (XXPHP_WORKFLOW, XX_REQ_WF_REC) is
 * read or written here (README §11).
 */
const ID = { type: oracledb.STRING };

const rows = async (connection, sql, binds, fetchInfo) =>
  (
    await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo,
    })
  ).rows;

const HEADER_ID_FETCH = { REQUISITION_ID: ID, CREATED_BY: ID, REQUESTED_BY: ID };

const TODAY = "TO_CHAR(SYSDATE, 'DD-Mon-YY')";

const HEADER_COLUMNS = `
  REQUISITION_ID, REQUISITION_NUMBER, REQUISITION_STATUS, REQUESTED_BY, REQUESTER_NAME,
  REQUEST_DATE, JOB_ID, JOB_NAME, DEPT_ID, DEPT_NAME, DATE_NEEDED, REASON_OF_REQ,
  REPLACEMENT_FOR, REASON, BUDGETED, BUDGETED_SAL,
  HIGH_SCHOOL, DIPLOMA, HIGHER_DIPLOMA, DEGREE, MASTER_DEGREE,
  GCC_EXP, WORK_EXP, SKILLS, OTHER, REMARK, TOTAL_PACKAGE,
  ATTRIBUTE1, ATTRIBUTE14, ATTRIBUTE15`;

const mapHeader = (row) => ({
  requisitionId: row.REQUISITION_ID,
  requisitionNumber: row.REQUISITION_NUMBER,
  requisitionStatus: row.REQUISITION_STATUS,
  requestedBy: row.REQUESTED_BY,
  requesterName: row.REQUESTER_NAME,
  requestDate: row.REQUEST_DATE,
  jobId: row.JOB_ID,
  jobName: row.JOB_NAME,
  deptId: row.DEPT_ID,
  deptName: row.DEPT_NAME,
  dateNeeded: row.DATE_NEEDED,
  reasonOfReq: row.REASON_OF_REQ,
  replacementFor: row.REPLACEMENT_FOR,
  reason: row.REASON,
  budgeted: row.BUDGETED,
  budgetedSal: row.BUDGETED_SAL,
  highSchool: row.HIGH_SCHOOL,
  diploma: row.DIPLOMA,
  higherDiploma: row.HIGHER_DIPLOMA,
  degree: row.DEGREE,
  masterDegree: row.MASTER_DEGREE,
  gccExp: row.GCC_EXP,
  workExp: row.WORK_EXP,
  skills: row.SKILLS,
  other: row.OTHER,
  remark: row.REMARK,
  totalPackage: row.TOTAL_PACKAGE,
  ticketStatus: row.ATTRIBUTE1 ?? '',
  acceptedDate: row.ATTRIBUTE14,
  closedDate: row.ATTRIBUTE15,
  createdBy: row.CREATED_BY,
  createdAt: row.CREATION_DATE,
  updatedBy: row.LAST_UPDATED_BY,
  updatedAt: row.LAST_UPDATE_DATE,
});

// --- Key generation & insert (README §3) --------------------------------------------------------

/** Legacy max+20 key with the 100000 fallback (§3.1), generated inside the caller's transaction. */
export async function generateRequisitionId(connection) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(REQUISITION_ID + 20), 100000) AS ID
       FROM XXZPI_PER_REQUISITIONS_ALL`,
    {},
  );
  return String(row.ID);
}

export async function insertHeader(connection, h) {
  await connection.execute(
    `INSERT INTO XXZPI_PER_REQUISITIONS_ALL
       (${HEADER_COLUMNS}, CREATION_DATE, CREATED_BY)
     VALUES
       (:reqId, :reqId, 'Draft', :requestedBy, :requesterName,
        TO_DATE(:requestDate, 'DD-Mon-YY'), :jobId, :jobName, :deptId, :deptName,
        TO_DATE(:dateNeeded, 'DD-Mon-YY'), :reasonOfReq,
        :replacementFor, :reason, NVL(:budgeted, 'N'), NVL(:budgetedSal, 0),
        NVL(:highSchool, 'N'), NVL(:diploma, 'N'), NVL(:higherDiploma, 'N'),
        NVL(:degree, 'N'), NVL(:masterDegree, 'N'),
        NVL(:gccExp, '0 - 2'), NVL(:workExp, '0 - 2'),
        :skills, :other, :remark, :totalPackage,
        NVL(:ticketStatus, ''),
        CASE WHEN :ticketStatus = 'Accepted' THEN ${TODAY} ELSE '' END,
        CASE WHEN :ticketStatus = 'Close'    THEN ${TODAY} ELSE '' END,
        SYSDATE, :createdBy)`,
    h,
  );
}

// --- Read one (README §4) -----------------------------------------------------------------------

// Single-row read (README §4.1): the same projection with the DATE columns in stored form.
const READ_COLUMNS = HEADER_COLUMNS.replace(
  'REQUEST_DATE',
  "TO_CHAR(REQUEST_DATE, 'DD-Mon-YY') AS REQUEST_DATE",
).replace('DATE_NEEDED', "TO_CHAR(DATE_NEEDED, 'DD-Mon-YY') AS DATE_NEEDED");

export async function findHeader(connection, requisitionId) {
  const [row] = await rows(
    connection,
    `SELECT ${READ_COLUMNS},
            CREATED_BY, TO_CHAR(CREATION_DATE, 'DD-Mon-YY') AS CREATION_DATE,
            LAST_UPDATED_BY, LAST_UPDATE_DATE
       FROM XXZPI_PER_REQUISITIONS_ALL
      WHERE REQUISITION_ID = :requisitionId`,
    { requisitionId },
    { ...HEADER_ID_FETCH, LAST_UPDATED_BY: ID },
  );
  return row ? mapHeader(row) : null;
}

// --- Update (README §5.1) -----------------------------------------------------------------------

// Fixed SET fragments; only which of them run and their bound values come from the request.
const UPDATABLE = Object.freeze({
  jobId: 'JOB_ID = :jobId',
  jobName: 'JOB_NAME = :jobName',
  deptId: 'DEPT_ID = :deptId',
  deptName: 'DEPT_NAME = :deptName',
  dateNeeded: "DATE_NEEDED = TO_DATE(:dateNeeded, 'DD-Mon-YY')",
  reasonOfReq: 'REASON_OF_REQ = :reasonOfReq',
  replacementFor: 'REPLACEMENT_FOR = :replacementFor',
  reason: 'REASON = :reason',
  budgeted: "BUDGETED = NVL(:budgeted, 'N')",
  budgetedSal: 'BUDGETED_SAL = NVL(:budgetedSal, 0)',
  highSchool: "HIGH_SCHOOL = NVL(:highSchool, 'N')",
  diploma: "DIPLOMA = NVL(:diploma, 'N')",
  higherDiploma: "HIGHER_DIPLOMA = NVL(:higherDiploma, 'N')",
  degree: "DEGREE = NVL(:degree, 'N')",
  masterDegree: "MASTER_DEGREE = NVL(:masterDegree, 'N')",
  gccExp: "GCC_EXP = NVL(:gccExp, '0 - 2')",
  workExp: "WORK_EXP = NVL(:workExp, '0 - 2')",
  skills: 'SKILLS = :skills',
  other: 'OTHER = :other',
  remark: 'REMARK = :remark',
  totalPackage: 'TOTAL_PACKAGE = :totalPackage',
});

/*
 * Ticket columns (README §5.1 corrected, non-wiping behaviour): while the status is still
 * 'Accepted'/'Close' the previously stored date survives a re-save; leaving the values resets
 * both dates. Only added when the HR caller supplies ticketStatus.
 */
const TICKET_SET = `
    ATTRIBUTE1 = :ticketStatus,
    ATTRIBUTE14 = CASE WHEN :ticketStatus = 'Accepted' THEN ${TODAY}
                       WHEN :ticketStatus = 'Close'    THEN NVL(:attribute14, ${TODAY})
                       ELSE '' END,
    ATTRIBUTE15 = CASE WHEN :ticketStatus = 'Close'    THEN ${TODAY}
                       WHEN :ticketStatus = 'Accepted' THEN NVL(:attribute15, ${TODAY})
                       ELSE '' END`;

/**
 * Updates the header columns present in `values` plus the audit trio. `ticket` is
 * `{ ticketStatus, attribute14, attribute15 }` when the HR caller sent ticketStatus, else null
 * (the ATTRIBUTE1/14/15 group is then left untouched). REQUISITION_STATUS, REQUEST_DATE,
 * REQUESTER_NAME, REQUESTED_BY and REQUISITION_NUMBER are never in the SET list (README §5.1).
 */
export async function updateHeader(connection, { requisitionId, values, ticket, updatedBy }) {
  const sets = [];
  const binds = { requisitionId, updatedBy };
  for (const [key, fragment] of Object.entries(UPDATABLE)) {
    if (!(key in values)) continue;
    sets.push(fragment);
    binds[key] = values[key];
  }
  if (ticket) {
    sets.push(TICKET_SET.trim());
    binds.ticketStatus = ticket.ticketStatus;
    binds.attribute14 = ticket.attribute14;
    binds.attribute15 = ticket.attribute15;
  }
  const result = await connection.execute(
    `UPDATE XXZPI_PER_REQUISITIONS_ALL
        SET ${sets.join(',\n            ')},
            LAST_UPDATE_DATE = SYSDATE,
            LAST_UPDATED_BY = :updatedBy,
            LAST_UPDATE_LOGIN = :updatedBy
      WHERE REQUISITION_ID = :requisitionId`,
    binds,
  );
  return result.rowsAffected > 0;
}

// --- Attachments (README §1.2, §6) --------------------------------------------------------------

/** Legacy max+1 attachment key (§3.1), generated inside the caller's transaction, per row. */
export async function generateAttachmentId(connection) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(HEADER_ID) + 1, 1) AS ID FROM xxzp_all_attachments`,
    {},
  );
  return String(row.ID);
}

export async function insertAttachment(connection, { attachmentId, requisitionId, fileName }) {
  await connection.execute(
    `INSERT INTO xxzp_all_attachments
       (HEADER_ID, FORM_HEADER_ID, FORM_NAME, FILE_NAME, ATTACHED_ON)
     VALUES
       (:attachmentId, :requisitionId, 'Requisition', :fileName, SYSDATE)`,
    { attachmentId, requisitionId, fileName },
  );
}

const ATTACHMENT_FETCH = { HEADER_ID: ID, FORM_HEADER_ID: ID };

const mapAttachment = (row) => ({
  attachmentId: row.HEADER_ID,
  fileName: row.FILE_NAME,
  attachedOn: row.ATTACHED_ON,
});

export async function listAttachments(connection, requisitionId) {
  const result = await rows(
    connection,
    `SELECT HEADER_ID, FORM_HEADER_ID, FORM_NAME, FILE_NAME,
            TO_CHAR(ATTACHED_ON, 'DD-Mon-YYYY') AS ATTACHED_ON
       FROM xxzp_all_attachments
      WHERE FORM_HEADER_ID = :requisitionId AND FORM_NAME = 'Requisition'
      ORDER BY HEADER_ID`,
    { requisitionId },
    ATTACHMENT_FETCH,
  );
  return result.map(mapAttachment);
}

/** One attachment row scoped to its requisition; used before removing the physical file. */
export async function findAttachment(connection, { requisitionId, attachmentId }) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID, FORM_HEADER_ID, FILE_NAME
       FROM xxzp_all_attachments
      WHERE HEADER_ID = :attachmentId
        AND FORM_HEADER_ID = :requisitionId
        AND FORM_NAME = 'Requisition'`,
    { attachmentId, requisitionId },
    ATTACHMENT_FETCH,
  );
  return row ? mapAttachment(row) : null;
}

export async function deleteAttachment(connection, { requisitionId, attachmentId }) {
  const result = await connection.execute(
    `DELETE FROM xxzp_all_attachments
      WHERE HEADER_ID = :attachmentId
        AND FORM_HEADER_ID = :requisitionId
        AND FORM_NAME = 'Requisition'`,
    { attachmentId, requisitionId },
  );
  return result.rowsAffected > 0;
}

export async function deleteAttachmentsByHeader(connection, requisitionId) {
  const result = await connection.execute(
    `DELETE FROM xxzp_all_attachments
      WHERE FORM_HEADER_ID = :requisitionId AND FORM_NAME = 'Requisition'`,
    { requisitionId },
  );
  return result.rowsAffected;
}

export async function deleteHeader(connection, requisitionId) {
  const result = await connection.execute(
    `DELETE FROM XXZPI_PER_REQUISITIONS_ALL WHERE REQUISITION_ID = :requisitionId`,
    { requisitionId },
  );
  return result.rowsAffected > 0;
}

/** Interview references (README §6 guard): ATTRIBUTE4 of the interview header holds the number. */
export async function countInterviewReferences(connection, requisitionNumber) {
  const [row] = await rows(
    connection,
    `SELECT COUNT(*) AS CNT
       FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
      WHERE ATTRIBUTE4 = :requisitionNumber`,
    { requisitionNumber },
  );
  return Number(row.CNT);
}

// --- Listing (README §7) ------------------------------------------------------------------------

const SORT_COLUMNS = Object.freeze({
  requisitionId: 'REQUISITION_ID',
  requestDate: 'REQUEST_DATE',
  dateNeeded: 'DATE_NEEDED',
  requesterName: 'REQUESTER_NAME',
  creationDate: 'CREATION_DATE',
});

// Fixed fragments; only their values come from the validated request.
const FILTERS = Object.freeze({
  requisitionStatus: () => 'REQUISITION_STATUS = :requisitionStatus',
  ticketStatus: () => "NVL(ATTRIBUTE1, 'Open') = :ticketStatus",
  requisitionId: () => 'TO_CHAR(REQUISITION_ID) = :requisitionId',
  requesterName: () => "UPPER(REQUESTER_NAME) LIKE '%'||UPPER(:requesterName)||'%'",
  jobName: () => "UPPER(JOB_NAME) LIKE '%'||UPPER(:jobName)||'%'",
  deptName: () => "UPPER(DEPT_NAME) LIKE '%'||UPPER(:deptName)||'%'",
  reasonOfReq: () => 'REASON_OF_REQ = :reasonOfReq',
  dateFrom: () => "REQUEST_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD')",
  dateTo: () => "REQUEST_DATE < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1",
  search: () => `(UPPER(REQUESTER_NAME) LIKE :search ESCAPE '\\'
                 OR UPPER(JOB_NAME)       LIKE :search ESCAPE '\\'
                 OR UPPER(DEPT_NAME)      LIKE :search ESCAPE '\\'
                 OR UPPER(REQUISITION_NUMBER) LIKE :search ESCAPE '\\')`,
  createdBy: () => 'CREATED_BY = :createdBy',
});

/*
 * §7.4 scope: the actor's recursively supervised employees. The semi-join over the CTE returns
 * no rows on an empty hierarchy — avoiding the legacy empty `IN ()` bug. USER_ID is compared
 * directly (both sides are the employee-master identifier).
 */
// The explicit column alias list is mandatory for a recursive (self-referencing) subquery in
// Oracle: without it the database rejects the statement with ORA-32039.
const SCOPE_CTE = `
WITH emp (FULL_NAME, USER_ID, SUPERVISOR_NAME) AS (
  SELECT FULL_NAME, USER_ID, SUPERVISOR_NAME
    FROM XX_DIGI_EMP_MASTER
   WHERE USER_ID = :scopeUserId
  UNION ALL
  SELECT e.FULL_NAME, e.USER_ID, e.SUPERVISOR_NAME
    FROM XX_DIGI_EMP_MASTER e
    JOIN emp p ON e.SUPERVISOR_NAME = p.FULL_NAME
)`;

const LIST_COLUMNS = `
  REQUISITION_ID, REQUISITION_NUMBER, REQUISITION_STATUS, REQUESTER_NAME, REQUESTED_BY,
  TO_CHAR(REQUEST_DATE, 'DD-Mon-YY')  AS REQUEST_DATE,
  TO_CHAR(DATE_NEEDED, 'DD-Mon-YY')   AS DATE_NEEDED,
  JOB_NAME, DEPT_NAME, REASON_OF_REQ, REPLACEMENT_FOR,
  BUDGETED, TOTAL_PACKAGE,
  NVL(ATTRIBUTE1, 'Open')             AS TICKET_STATUS,
  ATTRIBUTE14                         AS ACCEPTED_DATE,
  ATTRIBUTE15                         AS CLOSED_DATE,
  CREATED_BY, TO_CHAR(CREATION_DATE, 'DD-Mon-YY') AS CREATION_DATE, LAST_UPDATE_DATE`;

const mapListItem = (row) => ({
  requisitionId: row.REQUISITION_ID,
  requisitionNumber: row.REQUISITION_NUMBER,
  requisitionStatus: row.REQUISITION_STATUS,
  requesterName: row.REQUESTER_NAME,
  requestedBy: row.REQUESTED_BY,
  requestDate: row.REQUEST_DATE,
  dateNeeded: row.DATE_NEEDED,
  jobName: row.JOB_NAME,
  deptName: row.DEPT_NAME,
  reasonOfReq: row.REASON_OF_REQ,
  replacementFor: row.REPLACEMENT_FOR,
  budgeted: row.BUDGETED,
  totalPackage: row.TOTAL_PACKAGE,
  ticketStatus: row.TICKET_STATUS,
  acceptedDate: row.ACCEPTED_DATE,
  closedDate: row.CLOSED_DATE,
  createdBy: row.CREATED_BY,
  creationDate: row.CREATION_DATE,
  lastUpdateDate: row.LAST_UPDATE_DATE,
});

const buildWhere = (filters, binds) => {
  const conditions = ['1 = 1'];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (!FILTERS[key]) throw new Error(`Unsupported filter ${key}`);
    conditions.push(FILTERS[key](value));
    binds[key] = value;
  }
  return conditions;
};

/**
 * Paginated, filtered listing (README §7.2). `search` is an upper-case LIKE pattern already
 * escaped by the caller; `sortBy` must be a key of SORT_COLUMNS. `scopeUserId` is the non-HR
 * actor (null for HR: no predicate); `createdBy` is only passed for HR callers (the server-side
 * scope wins for everyone else).
 */
export async function listRequisitions(
  connection,
  { limit, offset, filters = {}, createdBy, scopeUserId, sortBy, sortDir },
) {
  const binds = {};
  const conditions = buildWhere(filters, binds);
  if (createdBy !== undefined && createdBy !== null) {
    conditions.push('CREATED_BY = :createdBy');
    binds.createdBy = createdBy;
  }
  if (scopeUserId !== undefined && scopeUserId !== null) {
    conditions.push('CREATED_BY IN (SELECT USER_ID FROM emp)');
    binds.scopeUserId = scopeUserId;
  }
  const prefix = binds.scopeUserId ? SCOPE_CTE : '';
  const where = `WHERE ${conditions.join(' AND ')}`;
  const column = SORT_COLUMNS[sortBy];
  if (!column) throw new Error(`Unsupported sort ${sortBy}`);
  const direction = sortDir === 'desc' ? 'DESC' : 'ASC';

  const [{ TOTAL: total }] = await rows(
    connection,
    `${prefix}
     SELECT COUNT(*) AS TOTAL
       FROM XXZPI_PER_REQUISITIONS_ALL
      ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `${prefix}
     SELECT ${LIST_COLUMNS}
       FROM XXZPI_PER_REQUISITIONS_ALL
      ${where}
      ORDER BY ${column} ${direction}, REQUISITION_ID ${direction}
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    HEADER_ID_FETCH,
  );
  return { total, items: result.map(mapListItem) };
}

// --- HR membership & scope (README §7.4) --------------------------------------------------------

/** Whether the user is an HR user (XXZP_HR lookup tag) — decides listing scope and ticket rights. */
export async function isHrUser(connection, userId) {
  const result = await rows(
    connection,
    `SELECT LOOKUP_CODE
       FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId
      FETCH FIRST 1 ROWS ONLY`,
    { userId },
  );
  return result.length > 0;
}

/** Whether the creator is the actor or one of their (recursive) supervised employees. */
export async function createdByInScope(connection, { scopeUserId, createdBy }) {
  const [row] = await rows(
    connection,
    `${SCOPE_CTE}
     SELECT COUNT(*) AS CNT FROM emp WHERE USER_ID = :createdBy`,
    { scopeUserId, createdBy },
  );
  return Number(row.CNT) > 0;
}

// --- Lookups (README §8) ------------------------------------------------------------------------

/** Job titles for the datalist (§8.1). */
export async function listJobTitles(connection) {
  return rows(
    connection,
    `SELECT DISTINCT JOB_ID, JOB_TITLE AS NAME
       FROM XX_DIGI_EMP_MASTER
      ORDER BY 1 DESC`,
    {},
    { JOB_ID: ID },
  );
}

/** The logged-in requestor (§8.2). */
export async function findRequestor(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT DISTINCT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
       FROM XX_DIGI_EMP_MASTER
      WHERE USER_ID = :userId`,
    { userId },
    { EMPLOYEE_NUMBER: ID },
  );
  return row
    ? {
        fullName: row.FULL_NAME,
        emailAddress: row.EMAIL_ADDRESS,
        employeeNumber: row.EMPLOYEE_NUMBER,
      }
    : null;
}

/** Departments for the datalist (§8.3). */
export async function listDepartments(connection) {
  return rows(
    connection,
    `SELECT DISTINCT ORGANIZATION_ID, NAME
       FROM XX_DIGI_DEPT_MASTER
      ORDER BY 1`,
    {},
    { ORGANIZATION_ID: ID },
  );
}

/** Employees supervised by the requestor — REPLACEMENT_FOR candidates (§8.4). */
export async function listReplacementCandidates(connection, employeeNumber) {
  const result = await rows(
    connection,
    `SELECT FULL_NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE SUPERVISOR_NAME IN (
        SELECT FULL_NAME
          FROM XX_DIGI_EMP_MASTER
         WHERE EMPLOYEE_NUMBER = :employeeNumber)`,
    { employeeNumber },
  );
  return result.map((row) => row.FULL_NAME);
}

/** Basic salary for the readonly "Basic Salary" field (§8.5). */
export async function findBudget(connection, fullName) {
  const [row] = await rows(
    connection,
    `SELECT BASIC_SALARY AS TOTAL_PACKAGE
       FROM XX_DIGI_EMP_MASTER
      WHERE FULL_NAME = :fullName`,
    { fullName },
  );
  return row ? row.TOTAL_PACKAGE : null;
}

/** Distinct filter-dropdown values (§8.6), bounded and §7.4-scoped like the listing. */
export async function listFilterOptions(connection, { scopeUserId }) {
  const prefix = scopeUserId ? SCOPE_CTE : '';
  const scoped = scopeUserId ? ' AND CREATED_BY IN (SELECT USER_ID FROM emp)' : '';
  const binds = scopeUserId ? { scopeUserId } : {};
  const distinct = async (expression) => {
    const result = await rows(
      connection,
      `${prefix}
       SELECT DISTINCT ${expression} AS VALUE
         FROM XXZPI_PER_REQUISITIONS_ALL
        WHERE ${expression} IS NOT NULL${scoped}
        FETCH FIRST 500 ROWS ONLY`,
      binds,
    );
    return result.map((row) => row.VALUE);
  };
  return {
    requisitionIds: await distinct('REQUISITION_ID'),
    requesterNames: await distinct('REQUESTER_NAME'),
    jobNames: await distinct('JOB_NAME'),
    deptNames: await distinct('DEPT_NAME'),
    reasons: await distinct('REASON_OF_REQ'),
  };
}
