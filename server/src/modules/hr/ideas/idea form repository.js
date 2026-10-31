import oracledb from 'oracledb';

const options = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

const rows = async (c, sql, b = {}) => (await c.execute(sql, b, options)).rows;

const cols = `HEADER_ID, UUID, ID_NO, EMP_NO, EMP_NAME,
DIVISION, DEPARTMENT, TITLE, IDEA, CATERGORY,
INV_CATEGORY, VALUE, AMOUNT, SAVING, DEP_VAL,
ATTRIBUTE1, NPV_VAL, ROI_VAL, STATUS, APPROVED_BY,
CREATED_BY, TO_CHAR(CREATION_DATE,'YYYY-MM-DD')
AS CREATION_DATE`;

export function map(r) {
  if (!r) return null;

  return {
    headerId: r.HEADER_ID,
    uuid: r.UUID,
    idNo: r.ID_NO,
    empNo: r.EMP_NO,
    empName: r.EMP_NAME,
    division: r.DIVISION,
    divisionName:
      r.DIVISION === '300000003618177'
        ? 'IPP BU'
        : r.DIVISION === '300000003618190'
          ? 'FPP BU'
          : null,
    department: r.DEPARTMENT,
    title: r.TITLE,
    idea: r.IDEA,
    projectType: r.CATERGORY,
    investmentCategory: r.INV_CATEGORY,
    hasInvestment: r.VALUE,
    investmentValue: r.AMOUNT,
    saving: r.SAVING,
    depreciation: r.DEP_VAL,
    irr: r.ATTRIBUTE1,
    npv: r.NPV_VAL,
    roi: r.ROI_VAL,
    status: r.STATUS,
    approvedBy: r.APPROVED_BY,
    createdBy: r.CREATED_BY,
    creationDate: r.CREATION_DATE,
  };
}

export async function get(c, id, lock = false) {
  const [r] = await rows(
    c,
    `SELECT ${cols}
     FROM XXZP.XXZP_IDEA
     WHERE HEADER_ID = :id
     ${lock ? 'FOR UPDATE' : ''}`,
    { id },
  );

  return map(r);
}

export async function attachments(c, id) {
  return rows(
    c,
    `SELECT
       HEADER_ID AS "attachmentId",
       FILE_NAME AS "fileName",
       TO_CHAR(ATTACHED_ON,'YYYY-MM-DD')
         AS "attachedOn"
     FROM XXZP.XXZP_ALL_ATTACHMENTS
     WHERE FORM_NAME = 'IDEA'
       AND FORM_HEADER_ID = :id
     ORDER BY HEADER_ID`,
    { id },
  );
}

export async function employee(c, empNo) {
  const [r] = await rows(
    c,
    `SELECT
       EMPLOYEE_NUMBER AS "empNo",
       FULL_NAME AS "empName",
       ORGANIZATION_NAME AS "department",
       DIVISION AS "sourceDivision"
     FROM XX_DIGI_EMP_MASTER
     WHERE EMPLOYEE_NUMBER = :empNo
       AND CURRENT_EMP_FLAG = 'Y'
       AND SYSDATE BETWEEN
           PAPF_EFFECTIVE_START_DATE
           AND PAPF_EFFECTIVE_END_DATE
     FETCH FIRST 1 ROW ONLY`,
    { empNo },
  );

  return r;
}

export async function employees(c, q) {
  return rows(
    c,
    `SELECT DISTINCT
       EMPLOYEE_NUMBER AS "empNo",
       FULL_NAME AS "empName",
       ORGANIZATION_NAME AS "department"
     FROM XX_DIGI_EMP_MASTER
     WHERE ASSIGNMENT_STATUS_TYPE_ID = 1
       AND CURRENT_EMP_FLAG = 'Y'
       AND (
         :q IS NULL
         OR UPPER(EMPLOYEE_NUMBER)
           LIKE '%' || UPPER(:q) || '%'
         OR UPPER(FULL_NAME)
           LIKE '%' || UPPER(:q) || '%'
       )
     ORDER BY "empNo"
     FETCH FIRST 100 ROWS ONLY`,
    { q: q || null },
  );
}

export async function isHr(c, userId) {
  const [r] = await rows(
    c,
    `SELECT COUNT(*) AS CNT
     FROM XX_DIGI_LOOKUP_VALUES
     WHERE LOOKUP_TYPE = 'XXZP_HR'
       AND TAG = :userId`,
    { userId: String(userId) },
  );

  return Number(r.CNT) > 0;
}

export async function list(c, userId, f) {
  const hr = await isHr(c, userId);

  const b = {
    me: String(userId),
    hr: hr && !f.mine ? 1 : 0,
    status: ['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED'].includes((f.status || '').toUpperCase())
      ? f.status.toUpperCase()
      : null,
    idNo: f.idNo || null,
    empNo: f.empNo || null,
    bu: f.division || null,
    cat: f.category || null,
    inv: f.invCategory || null,
    from: f.from || null,
    to: f.to || null,
    q: f.q || null,
  };

  const where = `
    WHERE (:hr = 1 OR I.CREATED_BY = :me)
      AND (:status IS NULL OR I.STATUS = :status)
      AND (:idNo IS NULL
           OR I.ID_NO LIKE '%' || :idNo || '%')
      AND (:empNo IS NULL
           OR I.EMP_NO LIKE '%' || :empNo || '%')
      AND (:bu IS NULL OR I.DIVISION = :bu)
      AND (:cat IS NULL OR I.CATERGORY = :cat)
      AND (:inv IS NULL OR I.INV_CATEGORY = :inv)
      AND (
        :from IS NULL
        OR TRUNC(I.CREATION_DATE) >=
           TO_DATE(:from,'YYYY-MM-DD')
      )
      AND (
        :to IS NULL
        OR TRUNC(I.CREATION_DATE) <=
           TO_DATE(:to,'YYYY-MM-DD')
      )
      AND (
        :q IS NULL
        OR UPPER(I.TITLE)
           LIKE '%' || UPPER(:q) || '%'
        OR UPPER(I.IDEA)
           LIKE '%' || UPPER(:q) || '%'
        OR UPPER(I.EMP_NAME)
           LIKE '%' || UPPER(:q) || '%'
      )`;

  const [count] = await rows(c, 'SELECT COUNT(*) AS CNT FROM XXZP.XXZP_IDEA I' + where, b);

  const page = f.page || 1;
  const pageSize = f.pageSize || 25;

  const selectedColumns = cols
    .split(', ')
    .map((s) =>
      s === 'HEADER_ID'
        ? 'I.HEADER_ID'
        : s.includes(' AS ')
          ? s.replace('CREATION_DATE', 'I.CREATION_DATE')
          : 'I.' + s,
    )
    .join(', ');

  const items = await rows(
    c,
    `SELECT ${selectedColumns},
       (
         SELECT MAX(W.TO_USER)
           KEEP (
             DENSE_RANK LAST
             ORDER BY W.NOTIFICATION_ID
           )
         FROM XXPHP_WORKFLOW W
         WHERE W.MSG_TYPE = 'IDEA'
           AND W.USER_KEY = I.HEADER_ID
           AND W.STATUS = 'Open'
       ) AS PENDING_AT
     FROM XXZP.XXZP_IDEA I
     ${where}
     ORDER BY I.HEADER_ID DESC
     OFFSET :offset ROWS
     FETCH NEXT :limit ROWS ONLY`,
    {
      ...b,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    },
  );

  return {
    items: items.map((r) => ({
      ...map(r),
      pendingAt: r.PENDING_AT || null,
    })),
    page,
    pageSize,
    total: Number(count.CNT),
  };
}

const dataCols = [
  'EMP_NO',
  'EMP_NAME',
  'DIVISION',
  'DEPARTMENT',
  'TITLE',
  'IDEA',
  'CATERGORY',
  'INV_CATEGORY',
  'VALUE',
  'AMOUNT',
  'SAVING',
  'DEP_VAL',
  'ATTRIBUTE1',
  'NPV_VAL',
  'ROI_VAL',
];

const dataKeys = [
  'empNo',
  'empName',
  'division',
  'department',
  'title',
  'idea',
  'projectType',
  'investmentCategory',
  'hasInvestment',
  'investmentValue',
  'saving',
  'depreciation',
  'irr',
  'npv',
  'roi',
];

const binds = (x) => Object.fromEntries(dataKeys.map((k) => [k, x[k] ?? null]));

export async function create(c, x, userId, uuid) {
  const b = {
    ...binds(x),
    uuid,
    userId: String(userId),
    out: {
      dir: oracledb.BIND_OUT,
      type: oracledb.NUMBER,
    },
  };

  const r = await c.execute(
    `INSERT INTO XXZP.XXZP_IDEA
      (
        UUID,
        ${dataCols.join(', ')},
        STATUS,
        CREATED_BY,
        CREATION_DATE
      )
     VALUES
      (
        :uuid,
        ${dataKeys.map((k) => ':' + k).join(', ')},
        'DRAFT',
        :userId,
        TRUNC(SYSDATE)
      )
     RETURNING HEADER_ID INTO :out`,
    b,
  );

  const id = r.outBinds.out[0];

  await c.execute(
    `UPDATE XXZP.XXZP_IDEA
     SET ID_NO =
       'ID' ||
       TO_CHAR(SYSDATE,'YYYYMMDD') ||
       LPAD(:id,4,'0')
     WHERE HEADER_ID = :id`,
    { id },
  );

  return id;
}

export async function update(c, id, x) {
  const b = {
    ...binds(x),
    id,
  };

  const r = await c.execute(
    `UPDATE XXZP.XXZP_IDEA
     SET ${dataCols.map((col, i) => col + '=:' + dataKeys[i]).join(', ')}
     WHERE HEADER_ID = :id
       AND STATUS IN ('DRAFT','REJECTED')`,
    b,
  );

  return r.rowsAffected;
}

export async function feasibility(c, id, x) {
  const r = await c.execute(
    `UPDATE XXZP.XXZP_IDEA
     SET DEP_VAL = :depreciation,
         ATTRIBUTE1 = :irr,
         NPV_VAL = :npv,
         ROI_VAL = :roi
     WHERE HEADER_ID = :id
       AND STATUS IN ('DRAFT','REJECTED')`,
    {
      id,
      ...x,
    },
  );

  return r.rowsAffected;
}
