import oracledb from 'oracledb';

const rows = async (c, sql, binds = {}) =>
  (
    await c.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    })
  ).rows;

const header = 'XXZP.XX_EMP_RATING_EOM_HEADER';
const lines = 'XXZP.XX_EMP_RATING_EOM_LINES';

export async function isHrUser(c, userId) {
  return Boolean(
    (
      await rows(
        c,
        `SELECT 1 AS FOUND
         FROM XX_DIGI_LOOKUP_VALUES
         WHERE LOOKUP_TYPE = 'XXZP_HR'
           AND TAG = :userId
         FETCH FIRST 1 ROWS ONLY`,
        { userId },
      )
    ).length,
  );
}

export async function requestor(c, userId) {
  return (
    await rows(
      c,
      `SELECT EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS
       FROM XX_DIGI_EMP_MASTER
       WHERE USER_ID = :userId
         AND USER_ID <> 0
         AND ROWNUM = 1`,
      { userId },
    )
  )[0];
}

export async function employee(c, number) {
  return (
    await rows(
      c,
      `SELECT PERSON_ID,
              EMPLOYEE_NUMBER,
              FULL_NAME,
              EMAIL_ADDRESS,
              POSITION_NAME,
              DEPARTMENT
       FROM XX_DIGI_EMP_MASTER
       WHERE CURRENT_EMP_FLAG = 'Y'
         AND EMPLOYEE_NUMBER = :number
       FETCH FIRST 1 ROWS ONLY`,
      { number },
    )
  )[0];
}

export async function employees(c, f) {
  const binds = { limit: f.limit };
  const where = [`CURRENT_EMP_FLAG = 'Y'`];

  for (const [key, col] of Object.entries({
    empNo: 'TO_CHAR(EMPLOYEE_NUMBER)',
    name: 'UPPER(FULL_NAME)',
    email: 'UPPER(EMAIL_ADDRESS)',
  })) {
    if (f[key]) {
      where.push(`${col} LIKE :${key} ESCAPE '~'`);

      binds[key] =
        '%' +
        String(f[key])
          .toUpperCase()
          .replace(/[~%_]/g, (m) => '~' + m) +
        '%';
    }
  }

  return rows(
    c,
    `SELECT PERSON_ID,
            EMPLOYEE_NUMBER,
            FULL_NAME,
            EMAIL_ADDRESS,
            POSITION_NAME,
            DEPARTMENT
     FROM XX_DIGI_EMP_MASTER
     WHERE ${where.join(' AND ')}
     ORDER BY FULL_NAME
     FETCH FIRST :limit ROWS ONLY`,
    binds,
  );
}

export async function get(c, id, lock = false) {
  return (
    await rows(
      c,
      `SELECT HEADER_ID,
              UUID,
              REQUEST_NO,
              DEPT_TYPE,
              EMPLOYEE_NUMBER,
              EMPLOYEE_NAME,
              EMPLOYEE_EMAIL,
              EMPLOYEE_POSITION,
              EMPLOYEE_DEPARTMENT,
              TO_CHAR(
                ACTIVITY_DATE, 'YYYY-MM-DD'
              ) ACTIVITY_DATE,
              OVERALL_RATING,
              REMARK,
              UPPER(STATUS) STATUS,
              CREATED_BY,
              CREATED_BY_EMP_NUM,
              TO_CHAR(
                CREATED_AT,
                'YYYY-MM-DD"T"HH24:MI:SS'
              ) CREATED_AT,
              UPDATED_BY
       FROM ${header}
       WHERE HEADER_ID = :id
       ${lock ? 'FOR UPDATE' : ''}`,
      { id },
    )
  )[0];
}

export async function getLines(c, id) {
  return rows(
    c,
    `SELECT LINE_NUMBER, RATING, REMARK
     FROM ${lines}
     WHERE HEADER_ID = :id
     ORDER BY LINE_NUMBER`,
    { id },
  );
}

export async function insert(c, h) {
  const r = await c.execute(
    `INSERT INTO ${header}
      (
        UUID,
        EMPLOYEE_NUMBER,
        EMPLOYEE_NAME,
        EMPLOYEE_EMAIL,
        EMPLOYEE_POSITION,
        EMPLOYEE_DEPARTMENT,
        ACTIVITY_DATE,
        DEPT_TYPE,
        OVERALL_RATING,
        REMARK,
        CREATED_BY,
        CREATED_BY_EMP_NUM,
        CREATED_AT,
        STATUS
      )
     VALUES
      (
        :uuid,
        :number,
        :name,
        :email,
        :position,
        :departmentName,
        TO_DATE(:activityDate, 'YYYY-MM-DD'),
        :deptType,
        :overallRating,
        :remark,
        :createdBy,
        :createdByEmpNum,
        SYSDATE,
        'DRAFT'
      )
     RETURNING HEADER_ID INTO :id`,
    {
      ...h,
      id: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    },
    { autoCommit: false },
  );

  return r.outBinds.id[0];
}

export async function setRequestNo(c, id, prefix) {
  await c.execute(
    `UPDATE ${header}
     SET REQUEST_NO =
       :prefix || '-' || LPAD(:id, 4, '0')
     WHERE HEADER_ID = :id`,
    { prefix, id },
    { autoCommit: false },
  );
}

export async function update(c, id, h, status) {
  await c.execute(
    `UPDATE ${header}
     SET EMPLOYEE_NUMBER = :number,
         EMPLOYEE_NAME = :name,
         EMPLOYEE_EMAIL = :email,
         EMPLOYEE_POSITION = :position,
         EMPLOYEE_DEPARTMENT = :departmentName,
         ACTIVITY_DATE =
           TO_DATE(:activityDate, 'YYYY-MM-DD'),
         OVERALL_RATING = :overallRating,
         REMARK = :remark,
         UPDATED_BY = :updatedBy,
         UPDATED_AT = SYSDATE,
         STATUS = :status
     WHERE HEADER_ID = :id`,
    {
      ...h,
      status,
      id,
    },
    { autoCommit: false },
  );
}

export async function replaceLines(c, id, items) {
  await c.execute(
    `DELETE FROM ${lines}
     WHERE HEADER_ID = :id`,
    { id },
    { autoCommit: false },
  );

  for (const line of items) {
    await c.execute(
      `INSERT INTO ${lines}
        (
          HEADER_ID,
          LINE_NUMBER,
          RATING,
          REMARK
        )
       VALUES
        (
          :id,
          :lineNumber,
          :rating,
          :remark
        )`,
      {
        id,
        ...line,
      },
      { autoCommit: false },
    );
  }
}

export async function remove(c, id) {
  await c.execute(
    `DELETE FROM ${lines}
     WHERE HEADER_ID = :id`,
    { id },
    { autoCommit: false },
  );

  return (
    await c.execute(
      `DELETE FROM ${header}
       WHERE HEADER_ID = :id`,
      { id },
      { autoCommit: false },
    )
  ).rowsAffected;
}

const SORT = {
  headerId: 'h.HEADER_ID',
  requestNo: 'h.REQUEST_NO',
  employeeName: 'h.EMPLOYEE_NAME',
  activityDate: 'h.ACTIVITY_DATE',
  status: 'h.STATUS',
  createdAt: 'h.CREATED_AT',
};

export async function list(c, f, userId, isHr) {
  const binds = {};
  const conditions = [];

  if (!isHr) {
    conditions.push('h.CREATED_BY = :userId');
    binds.userId = userId;
  }

  const filters = {
    status: 'UPPER(h.STATUS) = :status',
    department: 'h.DEPT_TYPE = :department',
    employeeNumber: 'h.EMPLOYEE_NUMBER = :employeeNumber',
    requestNo: 'h.REQUEST_NO = :requestNo',
    date_from: "h.ACTIVITY_DATE >= TO_DATE(:date_from,'YYYY-MM-DD')",
    date_to: "h.ACTIVITY_DATE < TO_DATE(:date_to,'YYYY-MM-DD') + 1",
  };

  for (const [key, sql] of Object.entries(filters)) {
    if (f[key]) {
      conditions.push(sql);

      binds[key] =
        key === 'department'
          ? f[key] === 'production'
            ? 'Production'
            : 'Shared-services'
          : f[key];
    }
  }

  if (f.search) {
    conditions.push(
      `(UPPER(h.REQUEST_NO)
          LIKE :search ESCAPE '~'
        OR UPPER(h.EMPLOYEE_NAME)
          LIKE :search ESCAPE '~'
        OR UPPER(h.EMPLOYEE_POSITION)
          LIKE :search ESCAPE '~'
        OR UPPER(h.EMPLOYEE_DEPARTMENT)
          LIKE :search ESCAPE '~'
        OR TO_CHAR(h.EMPLOYEE_NUMBER)
          LIKE :search ESCAPE '~')`,
    );

    binds.search = '%' + f.search.toUpperCase().replace(/[~%_]/g, (m) => '~' + m) + '%';
  }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

  const total = Number(
    (
      await rows(
        c,
        `SELECT COUNT(*) TOTAL
         FROM ${header} h
         ${where}`,
        binds,
      )
    )[0].TOTAL,
  );

  const sql = `
    SELECT
      h.HEADER_ID,
      h.REQUEST_NO,
      h.DEPT_TYPE,
      h.EMPLOYEE_NUMBER,
      h.EMPLOYEE_NAME,
      h.EMPLOYEE_POSITION,
      h.EMPLOYEE_DEPARTMENT,
      TO_CHAR(
        h.ACTIVITY_DATE, 'YYYY-MM-DD'
      ) ACTIVITY_DATE,
      h.OVERALL_RATING,
      h.REMARK,
      UPPER(h.STATUS) STATUS,
      TO_CHAR(
        h.CREATED_AT,
        'YYYY-MM-DD"T"HH24:MI:SS'
      ) CREATED_AT,

      (
        SELECT FULL_NAME
        FROM XX_DIGI_EMP_MASTER
        WHERE USER_ID = h.CREATED_BY
          AND ROWNUM = 1
      ) REQUESTOR,

      (
        SELECT COUNT(*)
        FROM ${lines} l
        WHERE l.HEADER_ID = h.HEADER_ID
          AND l.RATING = 'A'
      ) RATING_A_COUNT,

      (
        SELECT COUNT(*)
        FROM ${lines} l
        WHERE l.HEADER_ID = h.HEADER_ID
          AND l.RATING = 'AS'
      ) RATING_AS_COUNT,

      (
        SELECT COUNT(*)
        FROM ${lines} l
        WHERE l.HEADER_ID = h.HEADER_ID
          AND l.RATING = 'BS'
      ) RATING_BS_COUNT,

      (
        SELECT COUNT(*)
        FROM ${lines} l
        WHERE l.HEADER_ID = h.HEADER_ID
          AND l.RATING = 'CS'
      ) RATING_CS_COUNT

    FROM ${header} h
    ${where}

    ORDER BY
      ${SORT[f.sort]} ${f.order.toUpperCase()},
      h.HEADER_ID DESC

    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `;

  return {
    total,
    items: await rows(c, sql, {
      ...binds,
      offset: (f.page - 1) * f.pageSize,
      pageSize: f.pageSize,
    }),
  };
}
