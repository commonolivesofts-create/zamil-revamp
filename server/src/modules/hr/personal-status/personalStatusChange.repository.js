import oracledb from 'oracledb';

const TABLE = 'XXZP.XX_REC_CHANGE';

const options = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

// START_DATE and the *_SIGN columns are VARCHAR2. Legacy writes them as DD-MON-YY text (the
// JOINING_DATE / date('d-M-y') rendering), so they are read with an explicit format and a value
// that does not parse reads as NULL instead of failing the whole query.
const LEGACY_DATE_FORMAT = `'DD-MON-RR', 'NLS_DATE_LANGUAGE=AMERICAN'`;
const legacyDateIso = (column) =>
  `TO_CHAR(TO_DATE(${column} DEFAULT NULL ON CONVERSION ERROR, ${LEGACY_DATE_FORMAT}), 'YYYY-MM-DD')`;
const toLegacyDate = (bind) => `TO_CHAR(TO_DATE(:${bind}, 'YYYY-MM-DD'), ${LEGACY_DATE_FORMAT})`;

// Some legacy requests were saved without the employee snapshot (blank name, department, ...). Those
// identity fields read from the employee's current master row instead; stored values win.
const masterOf = (expression) => `(
    SELECT MAX(${expression})
    FROM XX_DIGI_EMP_MASTER EM
    WHERE EM.EMPLOYEE_NUMBER = R.EMP_NO
      AND EM.CURRENT_EMP_FLAG = 'Y'
  )`;
const EMP_NAME_SQL = `COALESCE(R.EMP_NAME, ${masterOf('EM.FULL_NAME')})`;
const SECTION_SQL = `COALESCE(R.SECTION, ${masterOf('EM.DIVISION')})`;
const DEPT_SQL = `COALESCE(R.DEPT, ${masterOf('EM.DEPARTMENT')})`;
const IDENTITY_COLUMNS = `
    ${EMP_NAME_SQL} EMP_NAME,
    COALESCE(R.NATIONALITY, ${masterOf('EM.NATIONALITY')}) NATIONALITY,
    ${SECTION_SQL} SECTION,
    ${DEPT_SQL} DEPT,
    COALESCE(${legacyDateIso('R.START_DATE')}, ${masterOf("TO_CHAR(EM.JOINING_DATE, 'YYYY-MM-DD')")}) START_DATE_ISO`;

// The employee snapshot: the current information and record, written on create and again only
// when the employee changes (server values, never taken from the request body).
const snapshotFields = {
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
};

// The requester's answers (and the server-computed NEW_TOTAL), written on every save.
const editableFields = {
  EFFECTIVE_DATE: 'effectiveDate',
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
  NEW_GRADE: 'newGrade',
  NEW_LEVEL: 'newLevel',

  REMARKS: 'remarks',
  VIEWS: 'views',
};

const snapshotEntries = Object.entries(snapshotFields);
const editableEntries = Object.entries(editableFields);

const sqlValue = (column, key) => {
  if (column === 'START_DATE') return toLegacyDate(key);
  if (column === 'EFFECTIVE_DATE') return `TO_DATE(:${key}, 'YYYY-MM-DD')`;
  return `:${key}`;
};

const bindsOf = (entries, values) =>
  Object.fromEntries(entries.map(([, key]) => [key, values[key] ?? null]));

const SELECT_SQL = `
  SELECT
    TO_CHAR(R.HEADER_ID) HEADER_ID,
    R.REF_NO,
    TO_CHAR(R.FORM_DATE, 'YYYY-MM-DD') FORM_DATE_ISO,
    R.ARB_DATE,
    TO_CHAR(R.EFFECTIVE_DATE, 'YYYY-MM-DD') EFFECTIVE_DATE_ISO,
    TO_CHAR(R.USER_ID) USER_ID,
    TO_CHAR(R.EMP_NO) EMP_NO,${IDENTITY_COLUMNS},
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
    ${legacyDateIso('R.HR_ADMIN_SIGN')} HR_ADMIN_SIGN_ISO,
    R.VP,
    ${legacyDateIso('R.VP_SIGN')} VP_SIGN_ISO,
    R.PRESIDENT,
    ${legacyDateIso('R.PRESIDENT_SIGN')} PRESIDENT_SIGN_ISO,
    TO_CHAR(R.CREATED_BY) CREATED_BY,
    TO_CHAR(R.CREATED_AT, 'YYYY-MM-DD') CREATED_AT_ISO,
    TO_CHAR(R.UPDATED_BY) UPDATED_BY,
    TO_CHAR(R.UPDATED_AT, 'YYYY-MM-DD') UPDATED_AT_ISO
  FROM ${TABLE} R
`;

// Auto-fill: the revised record of the employee's latest approved request is the current record.
const LATEST_EMPLOYEE_SQL = `
  SELECT
    TO_CHAR(R.HEADER_ID) HEADER_ID,
    TO_CHAR(R.EMP_NO) EMP_NO,
    R.EMP_NAME,
    R.NATIONALITY,
    R.SECTION,
    R.DEPT,
    ${legacyDateIso('R.START_DATE')} START_DATE_ISO,
    R.NEW_POSITION,
    R.NEW_BASIC_SAL,
    R.NEW_HOUSE_ALL,
    R.NEW_TRANS_ALL,
    R.NEW_OTHER_ALL,
    R.NEW_COMMUN_ALL,
    R.NEW_CAR_ALL,
    R.NEW_TOTAL,
    R.NEW_MARITAL_STATUS,
    R.NEW_GRADE,
    R.NEW_LEVEL
  FROM ${TABLE} R
`;

// HEADER_ID comes from the identity column (BY DEFAULT); REF_NO needs it, so it is set by a
// second statement in the same transaction.
const INSERT_SQL = `
  INSERT INTO ${TABLE}
  (
    FORM_DATE,
    ARB_DATE,
    USER_ID,
    OLD_GRADE,
    OLD_LEVEL,
    ${[...snapshotEntries, ...editableEntries].map(([column]) => column).join(', ')},
    STATUS,
    CREATED_BY,
    CREATED_AT
  )
  VALUES
  (
    TO_DATE(:formDate, 'YYYY-MM-DD'),
    :arbDate,
    NULL,
    NULL,
    NULL,
    ${[...snapshotEntries, ...editableEntries].map(([column, key]) => sqlValue(column, key)).join(', ')},
    'DRAFT',
    :createdBy,
    SYSDATE
  )
  RETURNING HEADER_ID INTO :headerId
`;

const assignments = (entries) =>
  entries.map(([column, key]) => `${column} = ${sqlValue(column, key)}`).join(', ');

const UPDATE_SQL = `
  UPDATE ${TABLE}
  SET
    ${assignments(editableEntries)},
    UPDATED_BY = :updatedBy,
    UPDATED_AT = SYSDATE
  WHERE HEADER_ID = :headerId
`;

const UPDATE_WITH_SNAPSHOT_SQL = `
  UPDATE ${TABLE}
  SET
    ${assignments(snapshotEntries)},
    ${assignments(editableEntries)},
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

// Legacy report columns. REQUESTOR resolves CREATED_BY as XX_DIGI_EMP_MASTER.USER_ID (legacy
// all_records); PENDING_AT is the open workflow notification's recipient (read only).
const LIST_COLUMNS = `
  TO_CHAR(R.HEADER_ID) HEADER_ID,
  R.REF_NO,
  TO_CHAR(R.FORM_DATE, 'YYYY-MM-DD') FORM_DATE_ISO,
  TO_CHAR(R.EFFECTIVE_DATE, 'YYYY-MM-DD') EFFECTIVE_DATE_ISO,
  TO_CHAR(R.EMP_NO) EMP_NO,
  ${EMP_NAME_SQL} EMP_NAME,
  R.NEW_POSITION,
  ${SECTION_SQL} SECTION,
  ${DEPT_SQL} DEPT,
  R.OLD_TOTAL,
  R.NEW_TOTAL,
  R.REMARKS,
  R.STATUS,
  TO_CHAR(R.CREATED_BY) CREATED_BY,
  (
    SELECT MAX(M.FULL_NAME)
    FROM XX_DIGI_EMP_MASTER M
    WHERE M.USER_ID = R.CREATED_BY
  ) REQUESTOR,
  (
    SELECT MAX(W.TO_USER)
    FROM XXPHP_WORKFLOW W
    WHERE W.MSG_TYPE = 'RCF'
      AND W.USER_KEY = TO_CHAR(R.HEADER_ID)
      AND W.STATUS = 'Open'
      AND W.TYPE_PARAM IS NULL
  ) PENDING_AT
`;

// Same department: the actor's current ORGANIZATION_ID is the employee's.
const sameDepartmentSql = (actorBind, employeeExpression) => `EXISTS (
  SELECT 1
  FROM XX_DIGI_EMP_MASTER A
  JOIN XX_DIGI_EMP_MASTER S ON S.ORGANIZATION_ID = A.ORGANIZATION_ID
  WHERE A.EMPLOYEE_NUMBER = :${actorBind}
    AND A.CURRENT_EMP_FLAG = 'Y'
    AND S.EMPLOYEE_NUMBER = ${employeeExpression}
)`;

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
      UPPER(${EMP_NAME_SQL}) LIKE UPPER(:search) ESCAPE '\\'
      OR UPPER(R.REF_NO) LIKE UPPER(:search) ESCAPE '\\'
      OR TO_CHAR(R.EMP_NO) LIKE :search ESCAPE '\\'
    )`,
  );

  add('status', filters.status, 'UPPER(R.STATUS) = :status');

  add('section', filters.section, `${SECTION_SQL} = :section`);

  add('department', filters.department, `${DEPT_SQL} = :department`);

  add('position', filters.position, 'R.NEW_POSITION = :position');

  add('requestor', filters.requestor, 'R.CREATED_BY = :requestor');

  add('date_from', filters.date_from, "R.FORM_DATE >= TO_DATE(:date_from, 'YYYY-MM-DD')");

  add('date_to', filters.date_to, "R.FORM_DATE < TO_DATE(:date_to, 'YYYY-MM-DD') + 1");

  // Record access for a non-HR user: own requests and requests for employees of the same
  // department (every caller of the list holds VIEW). An unknown employee number matches none.
  if (filters.scope) {
    conditions.push(
      `(R.CREATED_BY = :scopeUserId OR ${sameDepartmentSql('scopeEmployeeNumber', 'R.EMP_NO')})`,
    );
    binds.scopeUserId = filters.scope.userId;
    binds.scopeEmployeeNumber = filters.scope.employeeNumber ?? null;
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    binds,
  };
};

export const createPersonalStatusRepository = () => {
  const read = async (headerId, connection) => {
    const result = await connection.execute(
      `${SELECT_SQL} WHERE R.HEADER_ID = :headerId FETCH FIRST 1 ROW ONLY`,
      { headerId },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  const insert = async (connection, values, createdBy) => {
    const result = await connection.execute(
      INSERT_SQL,
      {
        formDate: values.formDate,
        arbDate: values.arbDate,
        ...bindsOf(snapshotEntries, values),
        ...bindsOf(editableEntries, values),
        createdBy,
        headerId: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      },
      { autoCommit: false },
    );

    return result.outBinds?.headerId?.[0] ?? null;
  };

  const setReference = async (connection, headerId, refNo) =>
    connection.execute(
      `UPDATE ${TABLE}
       SET REF_NO = :refNo
       WHERE HEADER_ID = :headerId`,
      { headerId, refNo },
      { autoCommit: false },
    );

  const update = async (connection, headerId, values, updatedBy, { snapshot = false } = {}) =>
    connection.execute(
      snapshot ? UPDATE_WITH_SNAPSHOT_SQL : UPDATE_SQL,
      {
        headerId,
        ...(snapshot ? bindsOf(snapshotEntries, values) : {}),
        ...bindsOf(editableEntries, values),
        updatedBy,
      },
      { autoCommit: false },
    );

  // The facts record access and the draft rule need, locked for the write that follows.
  const lockRow = async (connection, headerId) => {
    const result = await connection.execute(
      `SELECT
         STATUS,
         TO_CHAR(CREATED_BY) CREATED_BY,
         TO_CHAR(EMP_NO) EMP_NO,
         OLD_MARITAL_STATUS
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

  // Legacy fetchEmpNo: every employee number of the master (no hierarchy rule).
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
       WHERE POSITION_NAME IS NOT NULL
       ORDER BY 1`,
      {},
      options,
    );

    return result.rows;
  };

  // A known position: one of the datalist (POSITION_NAME) or a job title, which is what the
  // legacy auto-fill puts in the revised position (JOB_TITLE AS JOB_NAME).
  const positionExists = async (connection, name) => {
    const result = await connection.execute(
      `SELECT 1 FOUND
       FROM XX_DIGI_EMP_MASTER
       WHERE (POSITION_NAME = :name OR JOB_TITLE = :name)
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
         AND UPPER(R.STATUS) = 'APPROVED'
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
         OTHER_ALLOWANCE,
         TOTAL_SALARY
       FROM XX_DIGI_EMP_MASTER
       WHERE EMPLOYEE_NUMBER = :empNo
         AND CURRENT_EMP_FLAG = 'Y'
       FETCH FIRST 1 ROW ONLY`,
      { empNo },
      options,
    );

    return result.rows?.[0] ?? null;
  };

  /**
   * HR (XXZP_HR lookup), failing closed: TAG must equal the one non-blank master user ID of the
   * application user's employee number on current rows; any other case matches no row.
   */
  const isHrUser = async (connection, userId) => {
    const result = await connection.execute(
      `SELECT TAG
       FROM XX_DIGI_LOOKUP_VALUES
       WHERE LOOKUP_TYPE = 'XXZP_HR'
         AND TAG = (
           SELECT TO_CHAR(MAX(E.USER_ID))
           FROM XX_DIGI_EMP_MASTER E
           JOIN XX_ZRV_USERS U ON U.EMPLOYEE_NUMBER = E.EMPLOYEE_NUMBER
           WHERE U.USER_ID = :userId
             AND E.CURRENT_EMP_FLAG = 'Y'
           HAVING COUNT(DISTINCT E.USER_ID) = 1 AND COUNT(*) = COUNT(E.USER_ID)
         )
       FETCH FIRST 1 ROWS ONLY`,
      { userId },
      options,
    );

    return result.rows.length > 0;
  };

  const isSameDepartment = async (connection, { actorEmployeeNumber, subjectEmployeeNumber }) => {
    const result = await connection.execute(
      `SELECT 1 SAME FROM DUAL WHERE ${sameDepartmentSql('actorEmployeeNumber', ':subjectEmployeeNumber')}`,
      { actorEmployeeNumber, subjectEmployeeNumber },
      options,
    );

    return result.rows.length > 0;
  };

  return {
    read,
    insert,
    setReference,
    update,
    lockRow,
    delete: remove,
    list,
    employees,
    positions,
    positionExists,
    latest,
    master,
    isHrUser,
    isSameDepartment,
  };
};
