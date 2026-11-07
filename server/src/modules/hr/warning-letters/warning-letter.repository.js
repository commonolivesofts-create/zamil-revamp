import oracledb from 'oracledb';

const opt = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

const T = 'XX_DIGI_WARNING_LETTER';

const fields = [
  'ID',
  'REFERENCE_NO',
  'WARNING_NO',
  'EMP_NO',
  'EMP_NAME',
  'EMP_DIV',
  'EMP_JOB',
  'IRREGULAR_FLAG',
  'ABSENT_FLAG',
  'EATING_FLAG',
  'DELAYING_FLAG',
  'MAKE_PROBLEMS_FLAG',
  'OTHERS_TEXT',
  'OTHERS_TEXT_AR',
  'ACTION_TEXT',
  'ACTION_TEXT_AR',
  'WARNING_LETTER_FLAG',
  'WARNING_LETTER_COMMENT',
  'OTHER_LETTER_FLAG',
  'OTHER_LETTER_COMMENT',
  'STATUS',
  'CREATED_BY',
  'UPDATED_BY',
];

const selected = [
  ...fields,
  "TO_CHAR(WAR_DATE,'YYYY-MM-DD') WAR_DATE",
  "TO_CHAR(WAR_DATE,'DD-Mon-YYYY','NLS_DATE_LANGUAGE=ENGLISH') WAR_DATE_DISPLAY",
  "TO_CHAR(CREATED_AT,'YYYY-MM-DD HH24:MI') CREATED_AT",
  "TO_CHAR(UPDATED_AT,'YYYY-MM-DD HH24:MI') UPDATED_AT",
].join(',');

export const lower = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));

const run = (connection, sql, binds = {}) => connection.execute(sql, binds, opt);

const cFields = [
  'WAR_DATE',
  'IRREGULAR_FLAG',
  'ABSENT_FLAG',
  'EATING_FLAG',
  'DELAYING_FLAG',
  'MAKE_PROBLEMS_FLAG',
  'OTHERS_TEXT',
  'OTHERS_TEXT_AR',
  'ACTION_TEXT',
  'ACTION_TEXT_AR',
  'WARNING_LETTER_FLAG',
  'WARNING_LETTER_COMMENT',
  'OTHER_LETTER_FLAG',
  'OTHER_LETTER_COMMENT',
];

const bindPayload = (payload) =>
  Object.fromEntries(cFields.map((key) => [key, payload[key.toLowerCase()] ?? null]));

const value = (key) => (key === 'WAR_DATE' ? "TO_DATE(:WAR_DATE,'YYYY-MM-DD')" : `:${key}`);

const flags = [
  'irregular',
  'absent',
  'eating',
  'delaying',
  'make_problems',
  'warning_letter',
  'other_letter',
];

const sorts = new Set([
  'ID',
  'REFERENCE_NO',
  'WARNING_NO',
  'EMP_NO',
  'EMP_NAME',
  'WAR_DATE',
  'CREATED_AT',
]);

export const repository = {
  read: async (connection, id) => {
    const result = await run(
      connection,
      `SELECT ${selected}
       FROM ${T}
       WHERE ID = :id`,
      { id },
    );

    return lower(result.rows[0]);
  },

  employee: async (connection, empNo, lock = false) => {
    const result = await run(
      connection,
      `SELECT
         EMPLOYEE_NUMBER EMP_NO,
         FULL_NAME EMP_NAME,
         DIVISION EMP_DIV,
         POSITION_NAME EMP_JOB
       FROM XX_DIGI_EMP_MASTER
       WHERE EMPLOYEE_NUMBER = :empNo
         AND UPPER(NVL(CURRENT_EMP_FLAG, 'Y')) = 'Y'
       ${lock ? 'FOR UPDATE' : ''}`,
      { empNo },
    );

    return lower(result.rows[0]);
  },

  nextWarning: async (connection, empNo) => {
    // MAX + 1, not COUNT + 1: a deleted letter must not make the next letter
    // reuse an existing warning number. Ignore non-numeric legacy values.
    const result = await run(
      connection,
      `SELECT NVL(MAX(
                CASE
                  WHEN REGEXP_LIKE(TRIM(WARNING_NO), '^[0-9]+$')
                  THEN TO_NUMBER(WARNING_NO)
                END
              ), 0) + 1 N
       FROM ${T}
       WHERE EMP_NO = :empNo`,
      { empNo },
    );

    return Number(result.rows[0].N);
  },

  // The picker's list: no term lists the first employees with the form (the legacy datalist),
  // and a search still needs two characters.
  employees: async (connection, q) => {
    const term = q.trim();
    if (term.length === 1) {
      return [];
    }

    const filter = term
      ? `WHERE
           UPPER(M.EMPLOYEE_NUMBER) LIKE :term
           OR UPPER(M.FULL_NAME) LIKE :term`
      : '';

    const result = await run(
      connection,
      `SELECT EMP_NO, EMP_NAME
       FROM (
         SELECT DISTINCT
           M.EMPLOYEE_NUMBER EMP_NO,
           M.FULL_NAME EMP_NAME
         FROM XX_DIGI_EMP_DETAILS D
         JOIN XX_DIGI_EMP_MASTER M
           ON D.EMPLOYEE_NUMBER = M.EMPLOYEE_NUMBER
         ${filter ? `${filter} AND` : 'WHERE'}
           UPPER(NVL(M.CURRENT_EMP_FLAG, 'Y')) = 'Y'
         ORDER BY EMP_NO
       )
       WHERE ROWNUM <= 20`,
      term ? { term: `%${term.toUpperCase()}%` } : {},
    );

    return result.rows.map(lower);
  },

  insert: async (connection, payload, employee, warningNo, actor) => {
    const binds = {
      ...bindPayload(payload),
      empNo: employee.emp_no,
      empName: employee.emp_name,
      empDiv: employee.emp_div,
      empJob: employee.emp_job,
      warningNo,
      actor,
      id: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    };

    const columns = [
      ...cFields,
      'EMP_NO',
      'EMP_NAME',
      'EMP_DIV',
      'EMP_JOB',
      'WARNING_NO',
      'STATUS',
      'CREATED_BY',
      'CREATED_AT',
    ];

    const values = [
      ...cFields.map(value),
      ':empNo',
      ':empName',
      ':empDiv',
      ':empJob',
      ':warningNo',
      "'DRAFT'",
      ':actor',
      'SYSDATE',
    ];

    const result = await connection.execute(
      `INSERT INTO ${T}
       (${columns.join(',')})
       VALUES (${values.join(',')})
       RETURNING ID INTO :id`,
      binds,
      { autoCommit: false },
    );

    return Number(result.outBinds.id[0]);
  },

  setReference: async (connection, id, referenceNo) =>
    run(
      connection,
      `UPDATE ${T}
       SET REFERENCE_NO = :ref
       WHERE ID = :id`,
      {
        id,
        ref: referenceNo,
      },
    ),

  update: async (connection, id, payload, actor) => {
    const binds = {
      ...bindPayload(payload),
      id,
      actor,
    };

    return connection.execute(
      `UPDATE ${T}
       SET
         ${cFields.map((key) => `${key} = ${value(key)}`).join(',')},
         UPDATED_BY = :actor,
         UPDATED_AT = SYSDATE
       WHERE ID = :id`,
      binds,
      { autoCommit: false },
    );
  },

  remove: async (connection, id) =>
    connection.execute(
      `DELETE FROM ${T}
       WHERE ID = :id`,
      { id },
      { autoCommit: false },
    ),

  list: async (connection, query) => {
    const conditions = [];
    const binds = {};

    const like = (column, key, val) => {
      if (val !== undefined && val !== null && val !== '') {
        conditions.push(`UPPER(${column}) LIKE :${key}`);

        binds[key] = `%${String(val).toUpperCase()}%`;
      }
    };

    if (query.search) {
      conditions.push(
        `(${['REFERENCE_NO', 'TO_CHAR(WARNING_NO)', 'EMP_NO', 'EMP_NAME']
          .map((column) => `UPPER(${column}) LIKE :search`)
          .join(' OR ')})`,
      );

      binds.search = `%${query.search.toUpperCase()}%`;
    }

    like('REFERENCE_NO', 'reference', query.reference_no);

    like('EMP_NO', 'employee', query.emp_no);

    for (const [key, column] of [
      ['warning_no', 'WARNING_NO'],
      ['division', 'EMP_DIV'],
      ['status', 'STATUS'],
    ]) {
      if (query[key] !== null && query[key] !== undefined && query[key] !== '') {
        conditions.push(`${key === 'status' ? `UPPER(${column})` : column} = :${key}`);

        binds[key] = key === 'status' ? query[key].toUpperCase() : query[key];
      }
    }

    if (query.flag) {
      const column = query.flag.toUpperCase() + '_FLAG';

      if (!flags.includes(query.flag)) {
        throw new Error('Invalid flag');
      }

      conditions.push(`${column} = 'Y'`);
    }

    for (const [key, operator] of [
      ['date_from', '>='],
      ['date_to', '<='],
    ]) {
      if (query[key]) {
        conditions.push(`WAR_DATE ${operator} TO_DATE(:${key},'YYYY-MM-DD')`);

        binds[key] = query[key];
      }
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    const countResult = await run(
      connection,
      `SELECT COUNT(1) TOTAL
       FROM ${T}${where}`,
      binds,
    );

    const total = Number(countResult.rows[0].TOTAL);

    const sort = query.sort.toUpperCase();
    const direction = query.order.toUpperCase();

    if (!sorts.has(sort) || !['ASC', 'DESC'].includes(direction)) {
      throw new Error('Invalid sort');
    }

    const order = ` ORDER BY ${sort} ${direction}` + (sort === 'ID' ? '' : ', ID DESC');

    let sql = `SELECT ${selected}
       FROM ${T}${where}${order}`;

    const args = { ...binds };

    if (query.limit !== 0) {
      sql += ' OFFSET :offset ROWS FETCH NEXT :lim ROWS ONLY';

      args.offset = (query.page - 1) * query.limit;

      args.lim = query.limit;
    }

    const result = await run(connection, sql, args);

    return {
      pagination: {
        total_records: total,
        total_pages: query.limit === 0 ? 1 : Math.ceil(total / query.limit),
        current_page: query.page,
        limit: query.limit,
      },
      rows: result.rows.map(lower),
    };
  },
};
