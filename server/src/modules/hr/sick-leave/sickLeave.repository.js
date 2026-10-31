import oracledb from 'oracledb';

import { AppError } from '../../../shared/errors/AppError.js';

/* ============================================================
   SICK LEAVE REPOSITORY
   Database: Oracle
   Tables:
     XXZP.XXZP_SICK_LEAVE
     XXZP.XXZP_ALL_ATTACHMENTS
     XX_DIGI_EMP_MASTER
     XX_DIGI_LOOKUP_VALUES
     XX_ZRV_USERS

   Responsibilities:
     - Oracle queries
     - Employee lookups
     - Leave-type validation
     - CRUD operations
     - Attachment database operations
     - Pagination and filtering
     - Read-only schema capability checks

   No commits or rollbacks here.
   Transactions are managed by the service/database layer.
   ============================================================ */

const DB_OPTIONS = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
};

const FORM_NAME = 'SICKLEAVE';

/* ============================================================
   HELPERS
   ============================================================ */

async function executeRows(connection, sql, binds = {}) {
  const result = await connection.execute(sql, binds, DB_OPTIONS);

  return result.rows ?? [];
}

function schemaError(message) {
  return new AppError(503, 'SICK_LEAVE_SCHEMA_UNVERIFIED', message);
}

function normalizeEmployee(row) {
  if (!row) return null;

  return {
    empNumber: String(row.EMPLOYEE_NUMBER),
    empName: row.FULL_NAME,
    department: row.DEPARTMENT ?? null,
  };
}

/* ============================================================
   1. DATABASE CAPABILITY CHECKS
   ============================================================ */

/**
 * Check existing Oracle metadata before performing writes.
 *
 * This does not create or modify database objects.
 *
 * Important:
 * Identity-column verification is intentionally conservative.
 * Trigger- or sequence-generated identifiers must be verified
 * separately before support is enabled.
 */

export async function capabilities(connection) {
  const columns = await executeRows(
    connection,
    `
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE,
        DATA_PRECISION,
        DATA_SCALE,
        IDENTITY_COLUMN
      FROM ALL_TAB_COLUMNS
      WHERE OWNER = 'XXZP'
        AND TABLE_NAME IN (
          'XXZP_SICK_LEAVE',
          'XXZP_ALL_ATTACHMENTS'
        )
    `,
  );

  function findColumn(table, column) {
    return columns.find((row) => row.TABLE_NAME === table && row.COLUMN_NAME === column);
  }

  const fromDay = findColumn('XXZP_SICK_LEAVE', 'FROM_DAY_TYPE');

  const toDay = findColumn('XXZP_SICK_LEAVE', 'TO_DAY_TYPE');

  const leaveDays = findColumn('XXZP_SICK_LEAVE', 'LEAVE_DAYS');

  const sickHeaderId = findColumn('XXZP_SICK_LEAVE', 'HEADER_ID');

  const attachmentHeaderId = findColumn('XXZP_ALL_ATTACHMENTS', 'HEADER_ID');

  const dayTypes = Boolean(fromDay && toDay);

  const fractional =
    leaveDays?.DATA_TYPE === 'NUMBER' &&
    (leaveDays.DATA_SCALE === null || Number(leaveDays.DATA_SCALE) > 0);

  const headerGenerated = sickHeaderId?.IDENTITY_COLUMN === 'YES';

  const attachmentGenerated = attachmentHeaderId?.IDENTITY_COLUMN === 'YES';

  return {
    dayTypes,
    fractional,
    headerGenerated,
    attachmentGenerated,
  };
}

/**
 * Prevent writes when required Oracle capabilities
 * cannot be verified.
 */

export async function ensureWriteSchema(connection) {
  const result = await capabilities(connection);

  if (!result.dayTypes) {
    throw schemaError(
      'FROM_DAY_TYPE and TO_DAY_TYPE columns are not verified in XXZP.XXZP_SICK_LEAVE',
    );
  }

  if (!result.fractional) {
    throw schemaError('LEAVE_DAYS fractional NUMBER support is not verified');
  }

  if (!result.headerGenerated) {
    throw schemaError('Safe HEADER_ID generation is not verified for XXZP.XXZP_SICK_LEAVE');
  }

  if (!result.attachmentGenerated) {
    throw schemaError('Safe HEADER_ID generation is not verified for XXZP.XXZP_ALL_ATTACHMENTS');
  }

  return result;
}

/* ============================================================
   2. RESOLVE AUTHENTICATED EMPLOYEE
   ============================================================ */

/**
 * Resolve application USER_ID to employee number.
 *
 * USER_ID comes from the authenticated backend context.
 */

export async function resolveSelf(connection, userId) {
  const rows = await executeRows(
    connection,
    `
      SELECT EMPLOYEE_NUMBER
      FROM XX_ZRV_USERS
      WHERE USER_ID = :userId
      FETCH FIRST 1 ROW ONLY
    `,
    {
      userId,
    },
  );

  if (!rows.length || rows[0].EMPLOYEE_NUMBER === null || rows[0].EMPLOYEE_NUMBER === undefined) {
    return null;
  }

  return String(rows[0].EMPLOYEE_NUMBER);
}

/* ============================================================
   3. SCOPED EMPLOYEE LOOKUP
   ============================================================ */

/**
 * Return one employee only when they are:
 * - the authenticated employee; or
 * - a direct report of the authenticated employee.
 *
 * Employee hierarchy uses the PERSON_ID / SUPERVISOR_ID
 * relationship referenced in existing HR code.
 */

export async function findEmployee(connection, empNumber, self) {
  if (!self) return null;

  const rows = await executeRows(
    connection,
    `
      SELECT
        E.EMPLOYEE_NUMBER,
        E.FULL_NAME,
        E.ORGANIZATION_NAME AS DEPARTMENT
      FROM XX_DIGI_EMP_MASTER E
      WHERE E.EMPLOYEE_NUMBER = :empNumber
        AND E.CURRENT_EMP_FLAG = 'Y'
        AND TRUNC(SYSDATE)
            BETWEEN E.PAPF_EFFECTIVE_START_DATE
                AND E.PAPF_EFFECTIVE_END_DATE
        AND TRUNC(SYSDATE)
            BETWEEN E.PAAF_EFFECTIVE_START_DATE
                AND E.PAAF_EFFECTIVE_END_DATE
        AND (
          E.EMPLOYEE_NUMBER = :self
          OR EXISTS (
            SELECT 1
            FROM XX_DIGI_EMP_MASTER M
            WHERE M.EMPLOYEE_NUMBER = :self
              AND M.PERSON_ID = E.SUPERVISOR_ID
              AND M.CURRENT_EMP_FLAG = 'Y'
              AND TRUNC(SYSDATE)
                  BETWEEN M.PAPF_EFFECTIVE_START_DATE
                      AND M.PAPF_EFFECTIVE_END_DATE
              AND TRUNC(SYSDATE)
                  BETWEEN M.PAAF_EFFECTIVE_START_DATE
                      AND M.PAAF_EFFECTIVE_END_DATE
          )
        )
      ORDER BY E.PAAF_EFFECTIVE_START_DATE DESC
      FETCH FIRST 1 ROW ONLY
    `,
    {
      empNumber,
      self,
    },
  );

  return normalizeEmployee(rows[0]);
}

/* ============================================================
   4. EMPLOYEE LIST LOOKUP
   ============================================================ */

export async function employees(connection, self, { q = '', pageSize = 25 } = {}) {
  if (!self) return [];

  const rows = await executeRows(
    connection,
    `
      SELECT
        EMPLOYEE_NUMBER,
        FULL_NAME,
        DEPARTMENT
      FROM (
        SELECT
          E.EMPLOYEE_NUMBER,
          E.FULL_NAME,
          E.ORGANIZATION_NAME AS DEPARTMENT,

          ROW_NUMBER() OVER (
            PARTITION BY E.EMPLOYEE_NUMBER
            ORDER BY E.PAAF_EFFECTIVE_START_DATE DESC
          ) AS RN

        FROM XX_DIGI_EMP_MASTER E

        WHERE E.CURRENT_EMP_FLAG = 'Y'

          AND TRUNC(SYSDATE)
              BETWEEN E.PAPF_EFFECTIVE_START_DATE
                  AND E.PAPF_EFFECTIVE_END_DATE

          AND TRUNC(SYSDATE)
              BETWEEN E.PAAF_EFFECTIVE_START_DATE
                  AND E.PAAF_EFFECTIVE_END_DATE

          AND (
            E.EMPLOYEE_NUMBER = :self

            OR EXISTS (
              SELECT 1
              FROM XX_DIGI_EMP_MASTER M
              WHERE M.EMPLOYEE_NUMBER = :self
                AND M.PERSON_ID = E.SUPERVISOR_ID
                AND M.CURRENT_EMP_FLAG = 'Y'
                AND TRUNC(SYSDATE)
                    BETWEEN M.PAPF_EFFECTIVE_START_DATE
                        AND M.PAPF_EFFECTIVE_END_DATE
                AND TRUNC(SYSDATE)
                    BETWEEN M.PAAF_EFFECTIVE_START_DATE
                        AND M.PAAF_EFFECTIVE_END_DATE
            )
          )

          AND (
            :q IS NULL
            OR UPPER(E.FULL_NAME)
               LIKE '%' || UPPER(:q) || '%'
            OR E.EMPLOYEE_NUMBER
               LIKE '%' || :q || '%'
          )
      )
      WHERE RN = 1
      ORDER BY EMPLOYEE_NUMBER
      FETCH FIRST :pageSize ROWS ONLY
    `,
    {
      self,
      q: q.trim() || null,
      pageSize,
    },
  );

  return rows.map(normalizeEmployee);
}

/* ============================================================
   5. LEAVE-TYPE LOOKUP VALIDATION
   ============================================================ */

/**
 * Lookup code comes from an existing verified configuration.
 * The repository never invents an Oracle LOOKUP_TYPE.
 */

export async function leaveTypeExists(connection, leaveType) {
  const lookupType = process.env.SICK_LEAVE_LOOKUP_TYPE;

  if (!lookupType) {
    throw schemaError('SICK_LEAVE_LOOKUP_TYPE is not configured');
  }

  const rows = await executeRows(
    connection,
    `
      SELECT LOOKUP_CODE
      FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = :lookupType
        AND LOOKUP_CODE = :leaveType
      FETCH FIRST 1 ROW ONLY
    `,
    {
      lookupType,
      leaveType,
    },
  );

  return rows.length > 0;
}

/* ============================================================
   6. GET SICK LEAVE HEADER
   ============================================================ */

/**
 * withDayTypes controls whether the two optional
 * half-day columns are selected.
 *
 * lock=true locks the selected header inside the
 * caller's transaction.
 */

export async function header(connection, headerId, lock = false, withDayTypes = false) {
  const dayTypeColumns = withDayTypes
    ? `
        , S.FROM_DAY_TYPE
        , S.TO_DAY_TYPE
      `
    : '';

  const sql = `
    SELECT
      S.HEADER_ID,
      S.EMP_ID,
      S.EMP_NAME,
      S.LEAVE_TYPE,

      TO_CHAR(
        S.FROM_DATE,
        'YYYY-MM-DD'
      ) AS FROM_DATE_ISO,

      TO_CHAR(
        S.TOO_DATE,
        'YYYY-MM-DD'
      ) AS TO_DATE_ISO,

      S.LEAVE_DAYS,
      S.COMMENTS,
      S.STATUS,
      S.CREATED_BY,
      S.CREATED_AT

      ${dayTypeColumns}

    FROM XXZP.XXZP_SICK_LEAVE S

    WHERE S.HEADER_ID = :headerId

    ${lock ? 'FOR UPDATE' : ''}
  `;

  const rows = await executeRows(connection, sql, {
    headerId,
  });

  return rows[0] ?? null;
}

/* ============================================================
   7. GET ALL ATTACHMENTS
   ============================================================ */

export async function attachments(connection, headerId) {
  return executeRows(
    connection,
    `
      SELECT
        A.HEADER_ID AS ATTACHMENT_ID,
        A.FILE_NAME,
        A.ATTACHED_ON

      FROM XXZP.XXZP_ALL_ATTACHMENTS A

      WHERE A.FORM_HEADER_ID = :headerId
        AND A.FORM_NAME = :formName

      ORDER BY A.HEADER_ID
    `,
    {
      headerId,
      formName: FORM_NAME,
    },
  );
}

/* ============================================================
   8. GET SINGLE ATTACHMENT
   ============================================================ */

export async function attachment(connection, headerId, attachmentId) {
  const rows = await executeRows(
    connection,
    `
      SELECT
        A.HEADER_ID AS ATTACHMENT_ID,
        A.FILE_NAME,
        A.ATTACHED_ON

      FROM XXZP.XXZP_ALL_ATTACHMENTS A

      WHERE A.HEADER_ID = :attachmentId
        AND A.FORM_HEADER_ID = :headerId
        AND A.FORM_NAME = :formName
    `,
    {
      attachmentId,
      headerId,
      formName: FORM_NAME,
    },
  );

  return rows[0] ?? null;
}

/* ============================================================
   9. INSERT SICK LEAVE
   ============================================================ */

/**
 * HEADER_ID is returned by Oracle.
 *
 * Never use MAX(HEADER_ID) + 1.
 *
 * Requires a verified database-generated HEADER_ID
 * and existing FROM_DAY_TYPE / TO_DAY_TYPE columns.
 */

export async function insert(connection, data) {
  const sql = `
    INSERT INTO XXZP.XXZP_SICK_LEAVE
    (
      UUID,
      FROM_DATE,
      TOO_DATE,
      EMP_ID,
      EMP_NAME,
      LEAVE_TYPE,
      LEAVE_DAYS,
      COMMENTS,
      STATUS,
      CREATED_BY,
      CREATED_AT,
      FROM_DAY_TYPE,
      TO_DAY_TYPE
    )
    VALUES
    (
      :uuid,
      TO_DATE(:fromDate, 'YYYY-MM-DD'),
      TO_DATE(:toDate, 'YYYY-MM-DD'),
      :empNumber,
      :empName,
      :leaveType,
      :days,
      :comments,
      'Draft',
      :createdBy,
      SYSDATE,
      :fromDayType,
      :toDayType
    )
    RETURNING HEADER_ID INTO :outId
  `;

  const result = await connection.execute(
    sql,
    {
      uuid: data.uuid,
      fromDate: data.fromDate,
      toDate: data.toDate,
      empNumber: data.empNumber,
      empName: data.empName,
      leaveType: data.leaveType,
      days: data.days,
      comments: data.comments,
      createdBy: data.createdBy,
      fromDayType: data.fromDayType,
      toDayType: data.toDayType,

      outId: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    },
    {
      autoCommit: false,
    },
  );

  const headerId = result.outBinds?.outId?.[0];

  if (headerId === null || headerId === undefined) {
    throw schemaError('Oracle did not return the generated Sick Leave HEADER_ID');
  }

  return headerId;
}

/* ============================================================
   10. UPDATE SICK LEAVE
   ============================================================ */

/**
 * Status guard enforced in Oracle as well as service.
 *
 * Intentionally does not change:
 *   UUID
 *   STATUS
 *   LEAVE_TYPE
 *   CREATED_BY
 *   CREATED_AT
 */

export async function update(connection, data) {
  const result = await connection.execute(
    `
      UPDATE XXZP.XXZP_SICK_LEAVE
      SET
        FROM_DATE =
          TO_DATE(:fromDate, 'YYYY-MM-DD'),

        TOO_DATE =
          TO_DATE(:toDate, 'YYYY-MM-DD'),

        EMP_ID = :empNumber,
        EMP_NAME = :empName,
        LEAVE_DAYS = :days,
        COMMENTS = :comments,
        FROM_DAY_TYPE = :fromDayType,
        TO_DAY_TYPE = :toDayType

      WHERE HEADER_ID = :headerId
        AND STATUS IN ('Draft', 'REJECTED')
    `,
    {
      headerId: data.headerId,
      fromDate: data.fromDate,
      toDate: data.toDate,
      empNumber: data.empNumber,
      empName: data.empName,
      days: data.days,
      comments: data.comments,
      fromDayType: data.fromDayType,
      toDayType: data.toDayType,
    },
    {
      autoCommit: false,
    },
  );

  return result.rowsAffected ?? 0;
}

/* ============================================================
   11. INSERT ATTACHMENT
   ============================================================ */

/**
 * Attachment HEADER_ID belongs to the attachment table.
 * FORM_HEADER_ID links to the Sick Leave request.
 *
 * Uses Oracle-generated attachment ID.
 */

export async function addAttachment(connection, { headerId, uuid, fileName }) {
  const result = await connection.execute(
    `
      INSERT INTO XXZP.XXZP_ALL_ATTACHMENTS
      (
        UUID,
        FORM_HEADER_ID,
        FORM_NAME,
        FILE_NAME,
        ATTACHED_ON
      )
      VALUES
      (
        :uuid,
        :headerId,
        :formName,
        :fileName,
        SYSDATE
      )
      RETURNING HEADER_ID INTO :outId
    `,
    {
      uuid,
      headerId,
      formName: FORM_NAME,
      fileName,

      outId: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    },
    {
      autoCommit: false,
    },
  );

  const attachmentId = result.outBinds?.outId?.[0];

  if (attachmentId === null || attachmentId === undefined) {
    throw schemaError('Oracle did not return the generated attachment HEADER_ID');
  }

  return attachmentId;
}

/* ============================================================
   12. DELETE SINGLE ATTACHMENT
   ============================================================ */

export async function deleteAttachment(connection, headerId, attachmentId) {
  const result = await connection.execute(
    `
      DELETE FROM XXZP.XXZP_ALL_ATTACHMENTS
      WHERE HEADER_ID = :attachmentId
        AND FORM_HEADER_ID = :headerId
        AND FORM_NAME = :formName
    `,
    {
      attachmentId,
      headerId,
      formName: FORM_NAME,
    },
    {
      autoCommit: false,
    },
  );

  return result.rowsAffected ?? 0;
}

/* ============================================================
   13. DELETE SICK LEAVE + ATTACHMENT RECORDS
   ============================================================ */

/**
 * Both deletes execute on the same Oracle connection.
 *
 * The service manages the transaction.
 * The service must check ownership and editable status
 * before calling this function.
 */

export async function deleteHeader(connection, headerId) {
  await connection.execute(
    `
      DELETE FROM XXZP.XXZP_ALL_ATTACHMENTS
      WHERE FORM_HEADER_ID = :headerId
        AND FORM_NAME = :formName
    `,
    {
      headerId,
      formName: FORM_NAME,
    },
    {
      autoCommit: false,
    },
  );

  const result = await connection.execute(
    `
      DELETE FROM XXZP.XXZP_SICK_LEAVE
      WHERE HEADER_ID = :headerId
        AND STATUS IN ('Draft', 'REJECTED')
    `,
    {
      headerId,
    },
    {
      autoCommit: false,
    },
  );

  return result.rowsAffected ?? 0;
}

/* ============================================================
   14. LIST SICK LEAVES
   ============================================================ */

/**
 * Features:
 *  - Employee or creator visibility
 *  - Privileged HR visibility
 *  - mine filter
 *  - Status filter
 *  - Inclusive overlap date filtering
 *  - Employee-number search
 *  - Employee-name search
 *  - Pagination
 *  - Total records count
 *  - Total leave days
 *
 * pendingAt is set to null by the service.
 */

export async function list(connection, { self, userId, privileged = false, q = {} }) {
  const page = Number(q.page ?? 1);
  const pageSize = Number(q.pageSize ?? 25);

  const offset = (page - 1) * pageSize;

  const binds = {
    self,
    userId,

    privileged: privileged ? 1 : 0,
    mine: q.mine ? 1 : 0,

    status: String(q.status ?? 'ALL').toUpperCase(),

    fromDate: q.from ?? null,
    toDate: q.to ?? null,

    empId: q.empId ?? null,
    empName: q.empName ?? null,
  };

  /*
   * The conditions are static SQL fragments.
   * All user-controlled values are bind variables.
   */

  const whereClause = `
    WHERE
      (
        :privileged = 1
        OR S.EMP_ID = :self
        OR S.CREATED_BY = :userId
      )

      AND (
        :mine = 0
        OR S.EMP_ID = :self
        OR S.CREATED_BY = :userId
      )

      AND (
        :status = 'ALL'
        OR UPPER(S.STATUS) = :status
      )

      AND (
        :fromDate IS NULL
        OR S.TOO_DATE >=
           TO_DATE(:fromDate, 'YYYY-MM-DD')
      )

      AND (
        :toDate IS NULL
        OR S.FROM_DATE <=
           TO_DATE(:toDate, 'YYYY-MM-DD')
      )

      AND (
        :empId IS NULL
        OR S.EMP_ID LIKE '%' || :empId || '%'
      )

      AND (
        :empName IS NULL
        OR UPPER(S.EMP_NAME)
           LIKE '%' || UPPER(:empName) || '%'
      )
  `;

  /* ------------------------
     COUNT QUERY
     ------------------------ */

  const countRows = await executeRows(
    connection,
    `
      SELECT COUNT(*) AS TOTAL
      FROM XXZP.XXZP_SICK_LEAVE S

      ${whereClause}
    `,
    binds,
  );

  const total = Number(countRows[0]?.TOTAL ?? 0);

  /* ------------------------
     LIST QUERY
     ------------------------ */

  const items = await executeRows(
    connection,
    `
      SELECT
        S.HEADER_ID,
        S.EMP_ID,
        S.EMP_NAME,
        S.LEAVE_TYPE,

        TO_CHAR(
          S.FROM_DATE,
          'YYYY-MM-DD'
        ) AS FROM_DATE_ISO,

        TO_CHAR(
          S.TOO_DATE,
          'YYYY-MM-DD'
        ) AS TO_DATE_ISO,

        S.LEAVE_DAYS,
        S.STATUS,
        S.CREATED_AT,

        (
          SELECT SUM(X.LEAVE_DAYS)

          FROM XXZP.XXZP_SICK_LEAVE X

          WHERE X.EMP_ID = S.EMP_ID

            AND (
              :fromDate IS NULL
              OR X.TOO_DATE >=
                 TO_DATE(:fromDate, 'YYYY-MM-DD')
            )

            AND (
              :toDate IS NULL
              OR X.FROM_DATE <=
                 TO_DATE(:toDate, 'YYYY-MM-DD')
            )

            AND (
              :status = 'ALL'
              OR UPPER(X.STATUS) = :status
            )

            AND (
              :privileged = 1
              OR X.EMP_ID = :self
              OR X.CREATED_BY = :userId
            )

            AND (
              :mine = 0
              OR X.EMP_ID = :self
              OR X.CREATED_BY = :userId
            )
        ) AS TOTAL_LEAVE_DAYS

      FROM XXZP.XXZP_SICK_LEAVE S

      ${whereClause}

      ORDER BY S.HEADER_ID DESC

      OFFSET :offset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `,
    {
      ...binds,
      offset,
      pageSize,
    },
  );

  return {
    items,
    total,
  };
}
