import oracledb from 'oracledb';

const execute = (connection, sql, binds = {}) =>
  connection.execute(sql, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

export async function createHeader(connection, data) {
  const result = await connection.execute(
    `
      INSERT INTO XXZP_SURVEY_HEADER (
        UUID,
        ATTRIBUTE5,
        EMP_NAME,
        JOB_TITLE,
        DEPT,
        CREATED_AT,
        REQ_IP,
        YEAR_OF_SURVEY
      )
      VALUES (
        :uuid,
        :age,
        :experience,
        :jobLevel,
        :department,
        SYSDATE,
        :ip,
        EXTRACT(YEAR FROM SYSDATE)
      )
      RETURNING HEADER_ID INTO :id
    `,
    {
      ...data,
      id: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    },
    { autoCommit: false },
  );

  return result.outBinds.id[0];
}

export async function createLine(connection, data) {
  return execute(
    connection,
    `
      INSERT INTO XXZP_SURVEY_LINES (
        HEADER_ID,
        LINE_ID,
        PARA_NAME,
        QUESTION,
        ANSWER,
        REMARK,
        CREATED_AT,
        ATTRIBUTE1
      )
      VALUES (
        :headerId,
        :slot,
        :section,
        :question,
        :answer,
        :remark,
        SYSDATE,
        :code
      )
    `,
    data,
  );
}

export async function header(connection, headerId) {
  const result = await execute(
    connection,
    `
      SELECT
        HEADER_ID,
        ATTRIBUTE5 AS AGE_BAND,
        JOB_TITLE AS JOB_LEVEL,
        DEPT AS DEPARTMENT,
        EMP_NAME AS EXPERIENCE,
        TO_CHAR(CREATED_AT, 'YYYY-MM-DD') AS SUBMITTED_AT,
        YEAR_OF_SURVEY AS YEAR
      FROM XXZP_SURVEY_HEADER
      WHERE HEADER_ID = :headerId
    `,
    { headerId },
  );

  return result.rows[0] ?? null;
}

export async function lines(connection, headerId) {
  const result = await execute(
    connection,
    `
      SELECT
        LINE_ID,
        PARA_NAME,
        QUESTION,
        ANSWER,
        REMARK,
        ATTRIBUTE1 AS CATEGORY_CODE
      FROM XXZP_SURVEY_LINES
      WHERE HEADER_ID = :headerId
        AND LINE_ID BETWEEN 1 AND 29
      ORDER BY LINE_ID
    `,
    { headerId },
  );

  return result.rows;
}

export async function remove(connection, headerId) {
  const linesResult = await execute(
    connection,
    `
      DELETE FROM XXZP_SURVEY_LINES
      WHERE HEADER_ID = :headerId
    `,
    { headerId },
  );

  const headerResult = await execute(
    connection,
    `
      DELETE FROM XXZP_SURVEY_HEADER
      WHERE HEADER_ID = :headerId
    `,
    { headerId },
  );

  return {
    headers: headerResult.rowsAffected,
    lines: linesResult.rowsAffected,
  };
}

function buildWhere(filters = {}, alias = 'H') {
  const binds = {};
  const conditions = [];

  const fields = {
    age: 'ATTRIBUTE5',
    jobLevel: 'JOB_TITLE',
    job_level: 'JOB_TITLE',
    department: 'DEPT',
    experience: 'EMP_NAME',
  };

  for (const [key, column] of Object.entries(fields)) {
    const value = filters[key];

    if (value !== undefined && value !== null && value !== '' && value !== '__ALL__') {
      conditions.push(`TRIM(${alias}.${column}) = :${key}`);

      binds[key] = value;
    }
  }

  if (filters.year && filters.year !== 'ALL' && filters.year !== '__ALL__') {
    conditions.push(`${alias}.YEAR_OF_SURVEY = :year`);

    binds.year = Number(filters.year);
  }

  return {
    sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '',
    binds,
  };
}

export async function list(connection, filters) {
  const where = buildWhere(filters);
  const binds = { ...where.binds };
  let extra = '';

  if (filters.from) {
    binds.from = filters.from;

    extra += `
      AND H.CREATED_AT >= TO_DATE(
        :from, 'YYYY-MM-DD'
      )
    `;
  }

  if (filters.to) {
    binds.to = filters.to;

    extra += `
      AND H.CREATED_AT <
        TO_DATE(:to, 'YYYY-MM-DD') + 1
    `;
  }

  if (filters.q) {
    binds.q = `%${filters.q.toUpperCase()}%`;

    extra += `
      AND EXISTS (
        SELECT 1
        FROM XXZP_SURVEY_LINES R
        WHERE R.HEADER_ID = H.HEADER_ID
          AND UPPER(R.REMARK) LIKE :q
      )
    `;
  }

  const predicate = `
    WHERE 1 = 1
    ${where.sql}
    ${extra}
  `;

  const totalResult = await execute(
    connection,
    `
      SELECT COUNT(*) AS CNT
      FROM XXZP_SURVEY_HEADER H
      ${predicate}
    `,
    binds,
  );

  const offset = (filters.page - 1) * filters.pageSize;

  const result = await execute(
    connection,
    `
      SELECT
        H.HEADER_ID,
        H.ATTRIBUTE5 AS AGE_BAND,
        H.JOB_TITLE AS JOB_LEVEL,
        H.DEPT AS DEPARTMENT,
        H.EMP_NAME AS EXPERIENCE,
        H.YEAR_OF_SURVEY AS YEAR,
        TO_CHAR(
          H.CREATED_AT,
          'YYYY-MM-DD'
        ) AS SUBMITTED_AT,
        (
          SELECT COUNT(*)
          FROM XXZP_SURVEY_LINES L
          WHERE L.HEADER_ID = H.HEADER_ID
        ) AS LINE_COUNT
      FROM XXZP_SURVEY_HEADER H
      ${predicate}
      ORDER BY H.HEADER_ID DESC
      OFFSET :offset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `,
    {
      ...binds,
      offset,
      pageSize: filters.pageSize,
    },
  );

  return {
    total: Number(totalResult.rows[0].CNT),
    rows: result.rows,
  };
}

export async function catalogueTexts(connection) {
  const result = await execute(
    connection,
    `
      SELECT
        LINE_ID,
        QUESTION,
        PARA_NAME
      FROM (
        SELECT
          L.LINE_ID,
          L.QUESTION,
          L.PARA_NAME,
          ROW_NUMBER() OVER (
            PARTITION BY
              L.LINE_ID,
              CASE
                WHEN REGEXP_LIKE(
                  L.QUESTION,
                  '[ء-ي]'
                )
                THEN 'ar'
                ELSE 'en'
              END
            ORDER BY H.HEADER_ID DESC
          ) AS RN
        FROM XXZP_SURVEY_LINES L
        JOIN XXZP_SURVEY_HEADER H
          ON H.HEADER_ID = L.HEADER_ID
        WHERE L.LINE_ID BETWEEN 1 AND 29
          AND L.QUESTION IS NOT NULL
      )
      WHERE RN = 1
    `,
  );

  return result.rows;
}

export async function filterLovs(connection, slot = null) {
  const join =
    slot !== null
      ? `
        JOIN XXZP_SURVEY_LINES L
          ON L.HEADER_ID = H.HEADER_ID
         AND L.LINE_ID = :slot
         AND TRIM(L.ANSWER) IN (
           'Agree',
           'Strongly Agree',
           'Disagree',
           'Strongly Disagree',
           'موافق',
           'موافق بشدة',
           'غير موافق',
           'غير موافق بشدة'
         )
      `
      : '';

  const binds = slot !== null ? { slot } : {};

  const fields = {
    ages: 'ATTRIBUTE5',
    jobs: 'JOB_TITLE',
    departments: 'DEPT',
    experiences: 'EMP_NAME',
    years: 'YEAR_OF_SURVEY',
  };

  const output = {};

  for (const [key, column] of Object.entries(fields)) {
    const expression = key === 'years' ? `H.${column}` : `TRIM(H.${column})`;

    const result = await execute(
      connection,
      `
        SELECT DISTINCT
          ${expression} AS VALUE
        FROM XXZP_SURVEY_HEADER H
        ${join}
        WHERE H.${column} IS NOT NULL
        ORDER BY VALUE
          ${key === 'years' ? 'DESC' : 'ASC'}
      `,
      binds,
    );

    output[key] = result.rows.map((row) => row.VALUE);
  }

  return output;
}

const ANSWER_BUCKET_SQL = `
  CASE TRIM(L.ANSWER)
    WHEN 'Strongly Agree'
      THEN 'Strongly Agree'
    WHEN 'موافق بشدة'
      THEN 'Strongly Agree'
    WHEN 'Agree'
      THEN 'Agree'
    WHEN 'موافق'
      THEN 'Agree'
    WHEN 'Disagree'
      THEN 'Disagree'
    WHEN 'غير موافق'
      THEN 'Disagree'
    WHEN 'Strongly Disagree'
      THEN 'Strongly Disagree'
    WHEN 'غير موافق بشدة'
      THEN 'Strongly Disagree'
  END
`;

export async function counts(connection, { slots, filters = {}, group = 'none', years }) {
  const where = buildWhere(filters);
  const binds = { ...where.binds };

  const placeholders = slots
    .map((slot, index) => {
      const key = `s${index}`;
      binds[key] = slot;

      return `:${key}`;
    })
    .join(',');

  let extra = '';

  if (years) {
    const yearBinds = years
      .map((year, index) => {
        const key = `y${index}`;

        binds[key] = Number(year);

        return `:${key}`;
      })
      .join(',');

    extra = `
      AND H.YEAR_OF_SURVEY IN (${yearBinds})
    `;
  }

  const dimensions = {
    none: "'ALL'",
    age: "NVL(TRIM(H.ATTRIBUTE5), 'Unspecified')",
    job: "NVL(TRIM(H.JOB_TITLE), 'Unspecified')",
    department: "NVL(TRIM(H.DEPT), 'Unspecified')",
    experience: "NVL(TRIM(H.EMP_NAME), 'Unspecified')",
    year: 'TO_CHAR(H.YEAR_OF_SURVEY)',
  };

  const groupExpression = dimensions[group];

  const result = await execute(
    connection,
    `
      SELECT
        G,
        LINE_ID,
        BUCKET,
        COUNT(*) AS CNT
      FROM (
        SELECT
          ${groupExpression} AS G,
          L.LINE_ID,
          ${ANSWER_BUCKET_SQL} AS BUCKET
        FROM XXZP_SURVEY_HEADER H
        JOIN XXZP_SURVEY_LINES L
          ON L.HEADER_ID = H.HEADER_ID
        WHERE L.LINE_ID IN (${placeholders})
        ${where.sql}
        ${extra}
      )
      WHERE BUCKET IS NOT NULL
      GROUP BY
        G,
        LINE_ID,
        BUCKET
      ORDER BY
        G,
        LINE_ID,
        BUCKET
    `,
    binds,
  );

  return result.rows;
}
