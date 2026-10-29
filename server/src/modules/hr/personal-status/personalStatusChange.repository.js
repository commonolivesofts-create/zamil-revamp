import oracledb from 'oracledb';

const TABLE = 'XXZP.XX_REC_CHANGE';

const options = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

const fields = {
  FORM_DATE: 'formDate',
  ARB_DATE: 'arbDate',
  EFFECTIVE_DATE: 'effectiveDate',
  EMP_NO: 'empNo',
  EMP_NAME: 'empName',
  NATIONALITY: 'nationality',
  SECTION: 'section',
  DEPT: 'department',
  START_DATE: 'startDate',

  OLD_POSITION: 'oldPosition',
  OLD_BASIC_SAL: 'oldBasicSal',
  OLD_HOUSE_ALL: 'oldHouseAll',
  OLD_TRANS_ALL: 'oldTransAll',
  OLD_COMMUN_ALL: 'oldCommunAll',
  OLD_CAR_ALL: 'oldCarAll',
  OLD_OTHER_ALL: 'oldOtherAll',
  OLD_TOTAL: 'oldTotal',
  OLD_MARITAL_STATUS: 'oldMaritalStatus',

  NEW_POSITION: 'newPosition',
  NEW_BASIC_SAL: 'newBasicSal',
  NEW_HOUSE_ALL: 'newHouseAll',
  NEW_TRANS_ALL: 'newTransAll',
  NEW_COMMUN_ALL: 'newCommunAll',
  NEW_CAR_ALL: 'newCarAll',
  NEW_OTHER_ALL: 'newOtherAll',
  NEW_TOTAL: 'newTotal',
  NEW_MARITAL_STATUS: 'newMaritalStatus',

  REMARKS: 'remarks',
  VIEWS: 'views',
};

const fieldEntries = Object.entries(fields);

const sqlValue = (column, key) => {
  if (column === 'START_DATE') {
    return `TO_DATE(:${key}, 'YYYY-MM-DD')`;
  }

  if (['FORM_DATE', 'EFFECTIVE_DATE'].includes(column)) {
    return `TO_DATE(:${key}, 'YYYY-MM-DD')`;
  }

  return `:${key}`;
};

const SELECT_SQL = `
  SELECT
    TO_CHAR(R.HEADER_ID) HEADER_ID,
    R.REF_NO,
    TO_CHAR(R.FORM_DATE, 'YYYY-MM-DD') FORM_DATE_ISO,
    R.ARB_DATE,
    TO_CHAR(R.EFFECTIVE_DATE, 'YYYY-MM-DD') EFFECTIVE_DATE_ISO,
    TO_CHAR(R.USER_ID) USER_ID,
    TO_CHAR(R.EMP_NO) EMP_NO,
    R.EMP_NAME,
    R.NATIONALITY,
    R.SECTION,
    R.DEPT,
    TO_CHAR(R.START_DATE, 'YYYY-MM-DD') START_DATE_ISO,
    R.OLD_POSITION,
    R.OLD_BASIC_SAL,
    R.OLD_HOUSE_ALL,
    R.OLD_TRANS_ALL,
    R.OLD_COMMUN_ALL,
    R.OLD_CAR_ALL,
    R.OLD_OTHER_ALL,
    R.OLD_TOTAL,
    R.OLD_MARITAL_STATUS,
    R.OLD_GRADE,
    R.OLD_LEVEL,
    R.NEW_POSITION,
    R.NEW_BASIC_SAL,
    R.NEW_HOUSE_ALL,
    R.NEW_TRANS_ALL,
    R.NEW_COMMUN_ALL,
    R.NEW_CAR_ALL,
    R.NEW_OTHER_ALL,
    R.NEW_TOTAL,
    R.NEW_MARITAL_STATUS,
    R.NEW_GRADE,
    R.NEW_LEVEL,
    R.REMARKS,
    R.VIEWS,
    R.STATUS,
    R.HR_ADMIN,
    TO_CHAR(R.HR_ADMIN_SIGN, 'YYYY-MM-DD') HR_ADMIN_SIGN_ISO,
    R.VP,
    TO_CHAR(R.VP_SIGN, 'YYYY-MM-DD') VP_SIGN_ISO,
    R.PRESIDENT,
    TO_CHAR(R.PRESIDENT_SIGN, 'YYYY-MM-DD') PRESIDENT_SIGN_ISO,
    TO_CHAR(R.CREATED_BY) CREATED_BY,
    TO_CHAR(R.CREATED_AT, 'YYYY-MM-DD') CREATED_AT_ISO,
    TO_CHAR(R.UPDATED_BY) UPDATED_BY,
    TO_CHAR(R.UPDATED_AT, 'YYYY-MM-DD') UPDATED_AT_ISO
  FROM ${TABLE} R
`;

// The employee picker only needs the saved employment snapshot. Keeping this
// query narrow avoids making autofill depend on unrelated approval/signature
// columns in the legacy table.
const LATEST_EMPLOYEE_SQL = `
  SELECT
    TO_CHAR(R.EMP_NO) EMP_NO,
    R.EMP_NAME,
    R.NATIONALITY,
    R.SECTION,
    R.DEPT,
    TO_CHAR(R.START_DATE, 'YYYY-MM-DD') START_DATE_ISO,
    R.NEW_POSITION,
    R.NEW_BASIC_SAL,
    R.NEW_HOUSE_ALL,
    R.NEW_TRANS_ALL,
    R.NEW_OTHER_ALL,
    R.NEW_COMMUN_ALL,
    R.NEW_CAR_ALL,
    R.NEW_TOTAL,
    R.NEW_MARITAL_STATUS
  FROM ${TABLE} R
`;

const INSERT_SQL = `
  INSERT INTO ${TABLE}
  (
    HEADER_ID,
    REF_NO,
    USER_ID,
    OLD_GRADE,
    OLD_LEVEL,
    NEW_GRADE,
    NEW_LEVEL,
    ${fieldEntries.map(([column]) => column).join(', ')},
    STATUS,
    CREATED_BY,
    CREATED_AT
  )
  VALUES
  (
    :headerId,
    :refNo,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    ${fieldEntries.map(([column, key]) => sqlValue(column, key)).join(', ')},
    'DRAFT',
    :createdBy,
    SYSDATE
  )
`;

const UPDATE_SQL = `
  UPDATE ${TABLE}
  SET
    ${fieldEntries.map(([column, key]) => `${column} = ${sqlValue(column, key)}`).join(', ')},
    UPDATED_BY = :updatedBy,
    UPDATED_AT = SYSDATE
  WHERE HEADER_ID = :headerId
`;

const SORT_COLUMNS = Object.freeze({
  headerId: 'R.HEADER_ID',
  empNo: 'R.EMP_NO',
  empName: 'R.EMP_NAME',
  formDate: 'R.FORM_DATE',
  status: 'R.STATUS',
  oldTotal: 'R.OLD_TOTAL',
  newTotal: 'R.NEW_TOTAL',
});

const LIST_COLUMNS = `
  TO_CHAR(R.HEADER_ID) HEADER_ID,
  R.REF_NO,
  TO_CHAR(R.FORM_DATE, 'YYYY-MM-DD') FORM_DATE_ISO,
  TO_CHAR(R.EFFECTIVE_DATE, 'YYYY-MM-DD') EFFECTIVE_DATE_ISO,
  TO_CHAR(R.EMP_NO) EMP_NO,
  R.EMP_NAME,
  R.NEW_POSITION,
  R.SECTION,
  R.DEPT,
  R.OLD_TOTAL,
  R.NEW_TOTAL,
  R.REMARKS,
  R.STATUS,
  TO_CHAR(R.CREATED_BY) CREATED_BY,
  (
    SELECT MAX(M.FULL_NAME)
    FROM XX_DIGI_EMP_MASTER M
    WHERE M.USER_ID = R.CREATED_BY
  ) REQUESTOR
`;

const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

const buildFilters = (filters) => {
  const conditions = [];
  const binds = {};

  const add = (name, value, expression) => {
    if (value !== null && value !== undefined && value !== '') {
      conditions.push(expression);
      binds[name] = value;
    }
  };

  add(
    'search',
    filters.search ? `%${escapeLike(filters.search)}%` : null,
    `(
      UPPER(R.EMP_NAME) LIKE UPPER(:search) ESCAPE '\\'
      OR UPPER(R.REF_NO) LIKE UPPER(:search) ESCAPE '\\'
      OR TO_CHAR(R.EMP_NO) LIKE :search ESCAPE '\\'
    )`,
  );

  add('status', filters.status, 'UPPER(R.STATUS) = :status');

  add('section', filters.section, 'R.SECTION = :section');

  add('department', filters.department, 'R.DEPT = :department');

  add('position', filters.position, 'R.NEW_POSITION = :position');

  add('requestor', filters.requestor, 'R.CREATED_BY = :requestor');

  add('date_from', filters.date_from, "R.FORM_DATE >= TO_DATE(:date_from, 'YYYY-MM-DD')");

  add('date_to', filters.date_to, "R.FORM_DATE < TO_DATE(:date_to, 'YYYY-MM-DD') + 1");

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    binds,
  };
};

export const createPersonalStatusRepository = () => {
  const read = async (headerId, connection) => {
    const result = await connection.execute(
      `${SELECT_SQL} WHERE R.HEADER_ID = :headerId`,
      { headerId },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  const nextId = async (connection) => {
    const result = await connection.execute(
      `SELECT TO_CHAR(NVL(MAX(HEADER_ID) + 1, 1)) ID
       FROM ${TABLE}`,
      {},
      options,
    );

    return String(result.rows[0].ID);
  };

  const insert = async (connection, headerId, refNo, values, createdBy) =>
    connection.execute(
      INSERT_SQL,
      {
        headerId,
        refNo,
        ...values,
        createdBy,
      },
      { autoCommit: false },
    );

  const update = async (connection, headerId, values, updatedBy) =>
    connection.execute(
      UPDATE_SQL,
      {
        headerId,
        ...values,
        updatedBy,
      },
      { autoCommit: false },
    );

  const lockRow = async (connection, headerId) => {
    const result = await connection.execute(
      `SELECT STATUS
       FROM ${TABLE}
       WHERE HEADER_ID = :headerId
       FOR UPDATE`,
      { headerId },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  const remove = async (connection, headerId) =>
    connection.execute(
      `DELETE FROM ${TABLE}
       WHERE HEADER_ID = :headerId`,
      { headerId },
      { autoCommit: false },
    );

  const list = async (connection, filters) => {
    const { where, binds } = buildFilters(filters);

    const countResult = await connection.execute(
      `SELECT COUNT(*) TOTAL
       FROM ${TABLE} R
       ${where}`,
      binds,
      options,
    );

    const offset = (filters.page - 1) * filters.pageSize;

    const sortColumn = SORT_COLUMNS[filters.sort];
    const sortOrder = filters.order === 'asc' ? 'ASC' : 'DESC';

    // Column and direction come from fixed whitelists.
    const listSql = `
      SELECT ${LIST_COLUMNS}
      FROM ${TABLE} R
      ${where}
      ORDER BY
        ${sortColumn} ${sortOrder},
        R.HEADER_ID DESC
      OFFSET :offset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `;

    const rowsResult = await connection.execute(
      listSql,
      {
        ...binds,
        offset,
        pageSize: filters.pageSize,
      },
      options,
    );

    return {
      total: Number(countResult.rows[0].TOTAL),
      rows: rowsResult.rows,
    };
  };

  const employees = async (connection) => {
    const result = await connection.execute(
      `SELECT DISTINCT
         TO_CHAR(EMPLOYEE_NUMBER) AS "empNo"
       FROM XX_DIGI_EMP_MASTER
       ORDER BY 1`,
      {},
      options,
    );

    return result.rows;
  };

  const positions = async (connection) => {
    const result = await connection.execute(
      `SELECT DISTINCT
         POSITION_NAME AS "name"
       FROM XX_DIGI_EMP_MASTER
       ORDER BY 1`,
      {},
      options,
    );

    return result.rows;
  };

  const positionExists = async (connection, name) => {
    const result = await connection.execute(
      `SELECT 1 FOUND
       FROM XX_DIGI_EMP_MASTER
       WHERE POSITION_NAME = :name
         AND ROWNUM = 1`,
      { name },
      options,
    );

    return result.rows.length > 0;
  };

  const latest = async (connection, empNo) => {
    const result = await connection.execute(
      `${LATEST_EMPLOYEE_SQL}
       WHERE TO_CHAR(R.EMP_NO) = :empNo
       ORDER BY R.HEADER_ID DESC
       FETCH FIRST 1 ROW ONLY`,
      { empNo },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  const master = async (connection, empNo) => {
    const result = await connection.execute(
      `SELECT
         FULL_NAME,
         NATIONALITY,
         DIVISION,
         DEPARTMENT AS DEPARTMENT_NAME,
         TO_CHAR(JOINING_DATE, 'YYYY-MM-DD') JOINING_DATE_ISO,
         JOB_TITLE AS JOB_NAME,
         MARITAL_STATUS,
         BASIC_SALARY,
         HOUSING_ALLOWANCE,
         TRANSPORTATION_ALLOWANCE,
         COMMUNICATION_ALLOWANCE,
         CAR_ALLOWANCE,
         OTHER_ALLOWANCE
       FROM XX_DIGI_EMP_MASTER
       WHERE EMPLOYEE_NUMBER = :empNo
         AND CURRENT_EMP_FLAG = 'Y'
       FETCH FIRST 1 ROW ONLY`,
      { empNo },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  return {
    read,
    nextId,
    insert,
    update,
    lockRow,
    delete: remove,
    list,
    employees,
    positions,
    positionExists,
    latest,
    master,
  };
};
