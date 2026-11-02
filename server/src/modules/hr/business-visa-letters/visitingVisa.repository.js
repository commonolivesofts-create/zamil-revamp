import oracledb from 'oracledb';

export const FIELDS = [
  'division_id',
  'ref_no',
  'letter_date',
  'consul_general',
  'embassy',
  'embassy_location',
  'opening_text',
  'request_for',
  'subject',
  'employee_name',
  'nationality',
  'passport_no',
  'passport_date',
  'id_no',
  'id_expiration_date',
  'job_title',
  'employed_since',
  'contract_expiry',
  'contract_nature',
  'monthly_salary',
  'visit_place',
  'visit_days',
  'visit_purpose',
  'expense_employee_name',
  'expense_borne_by',
  'return_employee_name',
  'return_statement',
  'closing_text',
  'status',
  'embassy_ar',
  'job_title_ar',
  'contract_nature_ar',
  'nationality_ar',
  'visit_purpose_ar',
];

export const DATES = new Set([
  'letter_date',
  'passport_date',
  'id_expiration_date',
  'employed_since',
  'contract_expiry',
]);

export const NUMBERS = new Set(['monthly_salary', 'visit_days']);

const TABLE = 'XX_DIGI_BUSINESS_VISA_LETTERS';

const cols = FIELDS.map((f) =>
  DATES.has(f)
    ? `TO_CHAR(${f.toUpperCase()}, 'YYYY-MM-DD') AS ${f.toUpperCase()}`
    : f.toUpperCase(),
).join(', ');

const projection = `
  ID, ${cols},
  CREATED_BY,
  TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI') AS CREATED_AT,
  UPDATED_BY,
  TO_CHAR(UPDATED_AT,'YYYY-MM-DD HH24:MI') AS UPDATED_AT
`;

const map = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));

const run = (c, sql, binds = {}) =>
  c.execute(sql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

export async function get(c, id, lock = false) {
  const r = await run(
    c,
    `SELECT ${projection}
     FROM ${TABLE}
     WHERE ID = :id${lock ? ' FOR UPDATE' : ''}`,
    { id },
  );

  return map(r.rows[0]);
}

export async function duplicate(c, ref, id = null) {
  const r = await run(
    c,
    `SELECT COUNT(*) AS N
     FROM ${TABLE}
     WHERE UPPER(TRIM(REF_NO)) = UPPER(TRIM(:ref))
       AND (:id IS NULL OR ID <> :id)`,
    { ref, id },
  );

  return Number(r.rows[0].N) > 0;
}

const sqlValue = (f) => (DATES.has(f) ? `TO_DATE(:${f},'YYYY-MM-DD')` : `:${f}`);

export async function insert(c, body, actor) {
  const names = FIELDS.map((f) => f.toUpperCase()).join(',');
  const values = FIELDS.map(sqlValue).join(',');

  const binds = Object.fromEntries(FIELDS.map((f) => [f, body[f] ?? null]));

  binds.actor = actor;
  binds.newId = {
    dir: oracledb.BIND_OUT,
    type: oracledb.NUMBER,
  };

  const r = await run(
    c,
    `INSERT INTO ${TABLE}
      (${names}, CREATED_BY, CREATED_AT)
     VALUES
      (${values}, :actor, SYSTIMESTAMP)
     RETURNING ID INTO :newId`,
    binds,
  );

  return String(r.outBinds.newId[0]);
}

export async function update(c, id, changes, actor) {
  const f = Object.keys(changes);

  if (!f.length) return;

  const set = f.map((k) => `${k.toUpperCase()} = ${sqlValue(k)}`).join(',');

  await run(
    c,
    `UPDATE ${TABLE}
     SET ${set},
         UPDATED_BY = :actor,
         UPDATED_AT = SYSTIMESTAMP
     WHERE ID = :id`,
    { id, actor, ...changes },
  );
}

export async function remove(c, id) {
  const r = await run(c, `DELETE FROM ${TABLE} WHERE ID = :id`, { id });

  return r.rowsAffected;
}

function predicate(q) {
  const where = [];
  const b = {};

  for (const k of ['ref_no', 'status', 'division_id']) {
    if (q[k]) {
      b[k] = k === 'ref_no' ? `%${q[k]}%` : q[k];

      where.push(
        k === 'ref_no'
          ? 'UPPER(REF_NO) LIKE UPPER(:ref_no)'
          : k === 'status'
            ? 'UPPER(TRIM(STATUS)) = UPPER(TRIM(:status))'
            : 'DIVISION_ID = :division_id',
      );
    }
  }

  if (q.from) {
    where.push("LETTER_DATE >= TO_DATE(:fromDate,'YYYY-MM-DD')");
    b.fromDate = q.from;
  }

  if (q.to) {
    where.push("LETTER_DATE < TO_DATE(:toDate,'YYYY-MM-DD') + 1");
    b.toDate = q.to;
  }

  if (q.search) {
    b.search = `%${q.search}%`;

    where.push(`
      (
        UPPER(REF_NO) LIKE UPPER(:search)
        OR UPPER(EMPLOYEE_NAME) LIKE UPPER(:search)
        OR UPPER(EMBASSY) LIKE UPPER(:search)
        OR UPPER(SUBJECT) LIKE UPPER(:search)
      )
    `);
  }

  return {
    where: where.length ? ' WHERE ' + where.join(' AND ') : '',
    binds: b,
  };
}

export async function list(c, q) {
  const { where, binds } = predicate(q);

  const count = await run(c, `SELECT COUNT(*) AS TOTAL FROM ${TABLE}${where}`, binds);

  const safe =
    /^(id|ref_no|letter_date|employee_name|status|division_id|created_at)( (asc|desc))?$/i.exec(
      q.sort || 'id desc',
    );

  const order = safe ? `${safe[1].toUpperCase()} ${(safe[3] || 'DESC').toUpperCase()}` : 'ID DESC';

  const page = q.page || 1;
  const limit = q.limit ?? 10;

  const sql =
    `
    SELECT ${projection}
    FROM ${TABLE}
    ${where}
    ORDER BY ${order}
  ` + (limit ? ' OFFSET :offset ROWS FETCH NEXT :take ROWS ONLY' : '');

  const result = await run(
    c,
    sql,
    limit
      ? {
          ...binds,
          offset: (page - 1) * limit,
          take: limit,
        }
      : binds,
  );

  return {
    total: Number(count.rows[0].TOTAL),
    items: result.rows.map(map),
  };
}

export async function employees(c) {
  const r = await run(
    c,
    `SELECT EMPLOYEE_NUMBER, FULL_NAME
     FROM XX_DIGI_EMP_MASTER
     WHERE EMPLOYEE_NUMBER IS NOT NULL
       AND UPPER(NVL(CURRENT_EMP_FLAG,'Y')) = 'Y'
     GROUP BY EMPLOYEE_NUMBER, FULL_NAME
     ORDER BY FULL_NAME`,
  );

  return r.rows.map(map);
}

export async function employee(c, employeeNumber) {
  const r = await run(
    c,
    `SELECT *
     FROM (
       SELECT
         FULL_NAME,
         NATIONALITY,
         NATIONALITY_AR,
         PASSPORT_NUMBER,
         IQAMA_NUMBER,
         TO_CHAR(EXPIRY_DATE,'YYYY-MM-DD') AS EXPIRY_DATE,
         JOB_TITLE,
         JOB_NAME_AR,
         TO_CHAR(ORIGINAL_DATE_OF_HIRE,'YYYY-MM-DD') AS ORIGINAL_DATE_OF_HIRE,
         TO_CHAR(JOINING_DATE,'YYYY-MM-DD') AS JOINING_DATE,
         EMPLOYMENT_CATEGORY,
         TOTAL_SALARY,
         BASIC_SALARY
       FROM XX_DIGI_EMP_MASTER
       WHERE EMPLOYEE_NUMBER = :employeeNumber
       ORDER BY
         CASE
           WHEN UPPER(NVL(CURRENT_EMP_FLAG,'Y')) = 'Y'
           THEN 0 ELSE 1
         END,
         CASE
           WHEN UPPER(NVL(PRIMARY_FLAG,'Y')) = 'Y'
           THEN 0 ELSE 1
         END,
         ORIGINAL_DATE_OF_HIRE DESC NULLS LAST
     )
     WHERE ROWNUM = 1`,
    { employeeNumber },
  );

  return map(r.rows[0]);
}
