import oracledb from 'oracledb';

/*
 * Business Visa Request (legacy visa_request, Visa_model.php) over XXZP.XX_BUS_VISA_HEADER and
 * XXZP.XX_BUS_VISA_DOCS. HEADER_ID and LINE_ID are identity columns (verified read-only in the
 * TEST dictionary, 2026-11-04). The workflow columns (DM/DIR/GM/HR name and approval) are read,
 * never written: the approval workflow is not part of this module. No commits here; the service
 * owns the transaction.
 */
const HEADER = 'XXZP.XX_BUS_VISA_HEADER';
const DOCS = 'XXZP.XX_BUS_VISA_DOCS';
const OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

// API field → column. The check boxes hold the legacy literals (see CHECKS).
export const TEXT_COLUMNS = Object.freeze({
  division: 'DIVISION',
  dept: 'DEPT',
  visitorName: 'VISIT_NAME',
  visitorPhone: 'VISIT_PHONE',
  nationality: 'NATION',
  profession: 'PROFESSION',
  passportNo: 'PASS_NO',
  companyName: 'COMPANY_NAME',
  address: 'ADDRESS',
  tel: 'TEL_NO',
  fax: 'FAX_NO',
  comingFrom: 'COMING_FROM',
  travelRoute: 'TRAVEL_ROUTE',
  visitPurpose: 'VISIT_PURPOSE',
  saudiEmbassy: 'SAUDI_EMBASSY',
  otherDetails: 'SPECIFY_OTHER_PLACE',
});
export const DATE_COLUMNS = Object.freeze({
  requestDate: 'DATES',
  issueDate: 'ISSUE_DATE',
  expiryDate: 'EXPIRY_DATE',
  arrivalDate: 'ARRIVAL_DATE',
});
// Checked → the legacy value; unchecked → the literal string 'Null' (legacy parity).
export const CHECKS = Object.freeze({
  visaSingle: ['VISA_TYPE_SINGLE', 'Single'],
  visaMultiple: ['VISA_TYPE_MULTIPLE', 'Multiple'],
  travelCompany: ['TRAVEL_EX_COMPANY', 'T_Company'],
  travelPersonal: ['TRAVEL_EX_PERSON', 'T_Personal'],
  travelOther: ['TRAVEL_EX_OTHER', 'T_Other'],
  hotelCompany: ['HOTEL_EX_COMPANY', 'H_Company'],
  hotelPersonal: ['HOTEL_EX_PERSON', 'H_Personal'],
  hotelOther: ['HOTEL_EX_OTHER', 'H_Other'],
});
const UNCHECKED = 'Null';

const rows = async (connection, sql, binds = {}) =>
  (await connection.execute(sql, binds, OPTIONS)).rows ?? [];

const projection = [
  'H.HEADER_ID',
  'H.REQ_NO',
  'H.STATUS',
  'H.REQUESTED_BY',
  'H.CREATED_BY',
  "TO_CHAR(H.CREATED_AT, 'YYYY-MM-DD') AS CREATED_AT",
  ...Object.values(TEXT_COLUMNS).map((column) => `H.${column}`),
  ...Object.values(DATE_COLUMNS).map((column) => `TO_CHAR(H.${column}, 'YYYY-MM-DD') AS ${column}`),
  ...Object.values(CHECKS).map(([column]) => `H.${column}`),
  'H.DM_NAME',
  'H.DM_APP',
  'H.DIR_NAME',
  'H.DIR_APP',
  'H.GM_NAME',
  'H.GM_APP',
  'H.HR_NAME',
  'H.HR_APP',
].join(', ');

// Binds of a header write: text and dates as given, check boxes as the legacy literals.
export function headerBinds(body) {
  const binds = {};
  for (const [field, column] of Object.entries(TEXT_COLUMNS)) binds[column] = body[field] ?? '';
  for (const [field, column] of Object.entries(DATE_COLUMNS)) binds[column] = body[field];
  for (const [field, [column, checked]] of Object.entries(CHECKS)) {
    binds[column] = body[field] ? checked : UNCHECKED;
  }
  return binds;
}

const valueOf = (column) =>
  Object.values(DATE_COLUMNS).includes(column) ? `TO_DATE(:${column}, 'YYYY-MM-DD')` : `:${column}`;

export async function requester(connection, employeeNumber) {
  const [row] = await rows(
    connection,
    `SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE EMPLOYEE_NUMBER = :employeeNumber
      FETCH FIRST 1 ROW ONLY`,
    { employeeNumber },
  );
  return row?.FULL_NAME ?? null;
}

// Legacy departmentdetails(): distinct department names.
export async function departments(connection) {
  return (
    await rows(
      connection,
      `SELECT DISTINCT NAME FROM XX_DIGI_DEPT_MASTER WHERE NAME IS NOT NULL ORDER BY NAME`,
    )
  ).map((row) => row.NAME);
}

export async function header(connection, id, { lock = false } = {}) {
  const [row] = await rows(
    connection,
    `SELECT ${projection} FROM ${HEADER} H WHERE H.HEADER_ID = :id${lock ? ' FOR UPDATE' : ''}`,
    { id },
  );
  return row ?? null;
}

export async function documents(connection, id) {
  return rows(
    connection,
    `SELECT LINE_ID, DOC_NAME, DOC_FILE_NAME, TO_CHAR(DOC_ATTACHED_ON, 'YYYY-MM-DD') AS DOC_ATTACHED_ON
       FROM ${DOCS}
      WHERE HEADER_ID = :id
      ORDER BY LINE_ID`,
    { id },
  );
}

export async function document(connection, id, lineId) {
  const [row] = await rows(
    connection,
    `SELECT LINE_ID, DOC_NAME, DOC_FILE_NAME FROM ${DOCS} WHERE HEADER_ID = :id AND LINE_ID = :lineId`,
    { id, lineId },
  );
  return row ?? null;
}

// Legacy Add_form(): a DRAFT header, then REQ_NO = "<division> - <0000 id>".
export async function insertHeader(connection, body, { uuid, requestedBy, createdBy }) {
  const binds = headerBinds(body);
  const columns = Object.keys(binds);
  const result = await connection.execute(
    `INSERT INTO ${HEADER}
       (UUID, STATUS, REQUESTED_BY, CREATED_BY, CREATED_AT, ${columns.join(', ')})
     VALUES
       (:headerUuid, 'DRAFT', :requestedBy, :createdBy, SYSDATE, ${columns.map(valueOf).join(', ')})
     RETURNING HEADER_ID INTO :newId`,
    {
      ...binds,
      headerUuid: uuid,
      requestedBy,
      createdBy,
      newId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
    OPTIONS,
  );
  const id = result.outBinds.newId[0];
  await connection.execute(
    `UPDATE ${HEADER} SET REQ_NO = :division || ' - ' || LPAD(:id, 4, '0') WHERE HEADER_ID = :id`,
    { division: body.division, id },
  );
  return String(id);
}

// Legacy Update_form() (the requester and the workflow columns are kept).
export async function updateHeader(connection, id, body, { updatedBy }) {
  const binds = headerBinds(body);
  const set = Object.keys(binds)
    .map((column) => `${column} = ${valueOf(column)}`)
    .join(', ');
  await connection.execute(
    `UPDATE ${HEADER} SET ${set}, UPDATED_BY = :updatedBy, UPDATED_AT = SYSDATE WHERE HEADER_ID = :id`,
    { ...binds, updatedBy, id },
  );
}

export async function insertDocument(connection, { id, uuid, name, fileName }) {
  const result = await connection.execute(
    `INSERT INTO ${DOCS} (UUID, DOC_NAME, DOC_FILE_NAME, DOC_ATTACHED_ON, HEADER_ID)
     VALUES (:docUuid, :docName, :fileName, SYSDATE, :id)
     RETURNING LINE_ID INTO :lineId`,
    {
      docUuid: uuid,
      docName: name,
      fileName,
      id,
      lineId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    },
    OPTIONS,
  );
  return String(result.outBinds.lineId[0]);
}

export async function deleteDocument(connection, id, lineId) {
  const result = await connection.execute(
    `DELETE FROM ${DOCS} WHERE HEADER_ID = :id AND LINE_ID = :lineId`,
    { id, lineId },
  );
  return result.rowsAffected === 1;
}

// Report filters (legacy report(): every request, newest first).
function where({ q, status, division, dept, dateFrom, dateTo }) {
  const clauses = [];
  const binds = {};
  if (q) {
    clauses.push(
      `(UPPER(H.VISIT_NAME) LIKE :q OR UPPER(H.REQ_NO) LIKE :q OR UPPER(H.PASS_NO) LIKE :q OR UPPER(H.COMPANY_NAME) LIKE :q)`,
    );
    binds.q = `%${q.toUpperCase()}%`;
  }
  if (status) {
    clauses.push('UPPER(H.STATUS) = :status');
    binds.status = status;
  }
  if (division) {
    clauses.push('H.DIVISION = :division');
    binds.division = division;
  }
  if (dept) {
    clauses.push('H.DEPT = :dept');
    binds.dept = dept;
  }
  if (dateFrom) {
    clauses.push("H.DATES >= TO_DATE(:dateFrom, 'YYYY-MM-DD')");
    binds.dateFrom = dateFrom;
  }
  if (dateTo) {
    clauses.push("H.DATES < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1");
    binds.dateTo = dateTo;
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', binds };
}

export async function list(connection, { page, pageSize, ...filters }) {
  const { sql, binds } = where(filters);
  const [{ TOTAL }] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM ${HEADER} H${sql}`,
    binds,
  );
  const items = await rows(
    connection,
    `SELECT ${projection} FROM ${HEADER} H${sql}
      ORDER BY H.HEADER_ID DESC
     OFFSET :rowOffset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    { ...binds, rowOffset: (page - 1) * pageSize, pageSize },
  );
  return { total: Number(TOTAL), items };
}
