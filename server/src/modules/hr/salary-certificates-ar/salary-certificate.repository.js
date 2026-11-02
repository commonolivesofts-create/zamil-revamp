
import oracledb from 'oracledb';

const opts = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

const table = 'XX_DIGI_SALARY_CERT_ARABIC';

const columns = `
  ID,
  UUID,
  REF_NO,
  TO_CHAR(CERT_DATE, 'YYYY-MM-DD') CERT_DATE,
  EMPLOYEE_NO,
  EMPLOYEE_NAME,
  NATIONALITY,
  PASSPORT_NO,
  JOB_TITLE,
  TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') JOINING_DATE,
  BASIC_SALARY,
  HOUSING_ALLOWANCE,
  TRANSPORT_ALLOWANCE,
  COMM_ALLOWANCE,
  CAR_ALLOWANCE,
  TOTAL_SALARY,
  ALLOWANCE_FLAG,
  APPROVAL_NAME,
  POSITION_NAME,
  DIVISION,
  TO_EMP_NAME,
  EMP_NAME_LIST,
  STATUS,
  TO_CHAR(CREATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') CREATED_AT,
  CREATED_BY,
  TO_CHAR(UPDATED_AT, 'YYYY-MM-DD"T"HH24:MI:SS') UPDATED_AT,
  UPDATED_BY
`;

const source = `
  SELECT
    M.EMPLOYEE_NUMBER,
    M.FULL_NAME,
    M.NATIONALITY NATION_EN,
    M.NATIONAL_IDENTIFIER,
    M.PASSPORT_NUMBER,
    M.IQAMA_NUMBER,

    TO_CHAR(
      M.JOINING_DATE,
      'YYYY-MM-DD'
    ) JOINING_DATE,

    M.POSITION_NAME,
    M.BASIC_SALARY,
    M.HOUSING_ALLOWANCE,
    M.TRANSPORTATION_ALLOWANCE,
    M.COMMUNICATION_ALLOWANCE,
    M.CAR_ALLOWANCE,
    M.TOTAL_SALARY,
    M.DIVISION,
    M.FULL_NAME_AR,

    P.POSITION_NAME_AR POSITION_ARABIC,

    N.NATIONALITY_AR,

    M.JOINING_DATE_AR

  FROM XX_DIGI_EMP_MASTER M

  LEFT JOIN XX_DIGI_POSITION_NAME_AR P
    ON P.POSITION_NAME = M.POSITION_NAME

  LEFT JOIN XX_DIGI_COUNTRY_NATIONALITY_AR N
    ON (
      N.COUNTRY = M.NATIONALITY
      OR N.NATIONALITY = M.NATIONALITY
    )
`;

const signerSql = `
  SELECT DISTINCT
    M.EMPLOYEE_NUMBER,
    M.FULL_NAME_AR,
    P.POSITION_NAME_AR POSITION_ARABIC

  FROM XX_DIGI_EMP_MASTER M

  LEFT JOIN XX_DIGI_POSITION_NAME_AR P
    ON P.POSITION_NAME = M.POSITION_NAME

  WHERE
    UPPER(M.POSITION_NAME) LIKE '%HR%'
    OR M.POSITION_NAME LIKE '%General Manager%'
    OR M.POSITION_NAME = 'Administration Officer'
`;

const fields = [
  'EMPLOYEE_NO',
  'EMPLOYEE_NAME',
  'NATIONALITY',
  'PASSPORT_NO',
  'JOB_TITLE',
  'JOINING_DATE',
  'CERT_DATE',
  'BASIC_SALARY',
  'HOUSING_ALLOWANCE',
  'TRANSPORT_ALLOWANCE',
  'COMM_ALLOWANCE',
  'CAR_ALLOWANCE',
  'TOTAL_SALARY',
  'ALLOWANCE_FLAG',
  'APPROVAL_NAME',
  'POSITION_NAME',
  'DIVISION',
  'TO_EMP_NAME',
];

const names = [
  'employeeNo',
  'employeeName',
  'nationality',
  'nationalIdentifier',
  'jobTitle',
  'joiningDate',
  'certDate',
  'basicSalary',
  'housingAllowance',
  'transportAllowance',
  'commAllowance',
  'carAllowance',
  'totalSalary',
  'allowanceFlag',
  'approvalName',
  'approvalPosition',
  'division',
  'toEmpName',
];

const assignments = fields
  .map((col, i) =>
    `${col}=${
      col.endsWith('_DATE')
        ? `TO_DATE(:${names[i]},'YYYY-MM-DD')`
        : `:${names[i]}`
    }`
  )
  .join(', ');

const inputSql = fields
  .map((col, i) =>
    col.endsWith('_DATE')
      ? `TO_DATE(:${names[i]},'YYYY-MM-DD')`
      : `:${names[i]}`
  )
  .join(', ');

export const repository = {
  employee: async (c, empNo) => {
    const result = await c.execute(
      `${source}
       WHERE M.EMPLOYEE_NUMBER = :empNo`,
      { empNo },
      opts
    );

    return result.rows;
  },

  signers: async (c) => {
    const result = await c.execute(
      signerSql,
      {},
      opts
    );

    return result.rows;
  },

  picker: async (c, { q = '', page, pageSize }) => {
    const result = await c.execute(
      `
      SELECT EMPLOYEE_NUMBER
      FROM (
        SELECT DISTINCT EMPLOYEE_NUMBER
        FROM XX_DIGI_EMP_MASTER
        WHERE (
          :q IS NULL
          OR EMPLOYEE_NUMBER LIKE '%' || :q || '%'
        )
      )
      ORDER BY EMPLOYEE_NUMBER

      OFFSET :offset ROWS
      FETCH NEXT :size ROWS ONLY
      `,
      {
        q: q || null,
        offset: (page - 1) * pageSize,
        size: pageSize,
      },
      opts
    );

    return result.rows;
  },

  read: async (c, id, lock = false) => {
    const result = await c.execute(
      `
      SELECT ${columns}
      FROM ${table}
      WHERE ID = :id
      ${lock ? 'FOR UPDATE' : ''}
      `,
      { id },
      opts
    );

    return result.rows[0];
  },

  list: async (c, q) => {
    const binds = {
      q: q.q || null,
      employeeNo: q.employeeNo || null,
      division: q.division || null,
      status: q.status || null,
      from: q.from || null,
      to: q.to || null,
      createdFrom: q.createdFrom || null,
      createdTo: q.createdTo || null,
    };

    const where = `
      WHERE (
        :q IS NULL

        OR UPPER(EMPLOYEE_NAME)
          LIKE '%' || UPPER(:q) || '%'

        OR UPPER(EMPLOYEE_NO)
          LIKE '%' || UPPER(:q) || '%'

        OR UPPER(REF_NO)
          LIKE '%' || UPPER(:q) || '%'

        OR UPPER(TO_EMP_NAME)
          LIKE '%' || UPPER(:q) || '%'
      )

      AND (
        :employeeNo IS NULL
        OR EMPLOYEE_NO = :employeeNo
      )

      AND (
        :division IS NULL
        OR UPPER(DIVISION)
           LIKE '%' || UPPER(:division) || '%'
      )

      AND (
        :status IS NULL
        OR STATUS = :status
      )

      AND (
        :from IS NULL
        OR CERT_DATE >= TO_DATE(:from, 'YYYY-MM-DD')
      )

      AND (
        :to IS NULL
        OR CERT_DATE < TO_DATE(:to, 'YYYY-MM-DD') + 1
      )

      AND (
        :createdFrom IS NULL
        OR CREATED_AT >= TO_DATE(:createdFrom, 'YYYY-MM-DD')
      )

      AND (
        :createdTo IS NULL
        OR CREATED_AT <
           TO_DATE(:createdTo, 'YYYY-MM-DD') + 1
      )
    `;

    const countResult = await c.execute(
      `
      SELECT COUNT(*) TOTAL
      FROM ${table}
      ${where}
      `,
      binds,
      opts
    );

    const total = countResult.rows[0].TOTAL;

    const result = await c.execute(
      `
      SELECT
        ID,
        REF_NO,
        TO_CHAR(CERT_DATE, 'YYYY-MM-DD') CERT_DATE,
        EMPLOYEE_NO,
        EMPLOYEE_NAME,
        NATIONALITY,
        PASSPORT_NO,
        TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') JOINING_DATE,
        DIVISION,
        TOTAL_SALARY,
        STATUS,

        TO_CHAR(
          CREATED_AT,
          'YYYY-MM-DD"T"HH24:MI:SS'
        ) CREATED_AT

      FROM ${table}

      ${where}

      ORDER BY ID DESC

      OFFSET :offset ROWS
      FETCH NEXT :size ROWS ONLY
      `,
      {
        ...binds,
        offset: (q.page - 1) * q.pageSize,
        size: q.pageSize,
      },
      opts
    );

    return {
      items: result.rows,
      total,
    };
  },

  create: async (c, p, user, uuid) => {
    const binds = Object.fromEntries(
      names.map((k) => [k, p[k]])
    );

    const result = await c.execute(
      `
      INSERT INTO ${table}
      (
        UUID,
        ${fields.join(', ')},
        EMP_NAME_LIST,
        CREATED_AT,
        CREATED_BY,
        STATUS
      )

      VALUES
      (
        :uuid,
        ${inputSql},
        :empNameList,
        SYSDATE,
        :userId,
        'DRAFT'
      )

      RETURNING ID INTO :outId
      `,
      {
        ...binds,
        uuid,
        empNameList: p.empNameList ?? null,
        userId: user,

        outId: {
          dir: oracledb.BIND_OUT,
          type: oracledb.NUMBER,
        },
      },
      opts
    );

    return result.outBinds.outId[0];
  },

  setReference: async (c, id, refNo) => {
    return c.execute(
      `
      UPDATE ${table}
      SET REF_NO = :refNo
      WHERE ID = :id
        AND REF_NO IS NULL
      `,
      { id, refNo }
    );
  },

  update: async (c, id, p, user) => {
    const binds = Object.fromEntries(
      names.map((k) => [k, p[k]])
    );

    const optional = Object.hasOwn(p, 'empNameList')
      ? ', EMP_NAME_LIST = :empNameList'
      : '';

    return c.execute(
      `
      UPDATE ${table}

      SET
        ${assignments}
        ${optional},

        UPDATED_AT = SYSDATE,
        UPDATED_BY = :userId

      WHERE ID = :id
        AND STATUS = 'DRAFT'
      `,
      {
        ...binds,

        ...(optional
          ? { empNameList: p.empNameList }
          : {}),

        id,
        userId: user,
      }
    );
  },

  delete: async (c, id) => {
    return c.execute(
      `
      DELETE FROM ${table}
      WHERE ID = :id
        AND STATUS = 'DRAFT'
      `,
      { id }
    );
  },
};
