import oracledb from 'oracledb';
import {
  EMPLOYEE_COLUMNS_SQL,
  mapEmployee,
  mapPrivilegeFlags,
  PRIVILEGE_COLUMNS,
} from '../auth/auth.repository.js';

// User administration SQL. Values are always bound; sort columns and filter fragments come only from
// the fixed maps below. PASSWORD_HASH, MFA_TOTP_SECRET_ENCRYPTED and token hashes are never
// selected: only whether they are present. IDs (NUMBER(19,0)) are read and bound as strings.
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";
const ID = { type: oracledb.STRING };
const idOut = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });

const rows = async (connection, sql, binds, fetchInfo) =>
  (
    await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo,
    })
  ).rows;

// One employee-master row per account (EMPLOYEE_NUMBER is not unique in the source; the row count is
// returned so that duplicates fail closed).
const EMPLOYEE_APPLY = `
  OUTER APPLY (
    SELECT ${EMPLOYEE_COLUMNS_SQL}
      FROM xx_digi_emp_master e
     WHERE e.employee_number = u.employee_number
     FETCH FIRST 1 ROWS ONLY
  ) e`;

const MFA_ENROLLED_SQL = `CASE WHEN u.mfa_enrolled_at IS NOT NULL OR u.mfa_totp_secret_encrypted IS NOT NULL
  THEN 1 ELSE 0 END`;
const LOCKED_SQL = `CASE WHEN u.locked_until > SYSTIMESTAMP THEN 1 ELSE 0 END`;

const SORT_COLUMNS = Object.freeze({
  employeeNumber: 'u.employee_number',
  username: 'e.user_name',
  createdAt: 'u.created_at',
  lastLoginAt: 'u.last_login_at',
});

// Fixed filter fragments; only their values come from the (validated) request.
const FILTERS = Object.freeze({
  status: () => 'u.account_status = :status',
  search: () => `(UPPER(u.employee_number) LIKE :search ESCAPE '\\'
                  OR UPPER(e.user_name) LIKE :search ESCAPE '\\'
                  OR UPPER(e.full_name) LIKE :search ESCAPE '\\')`,
  mfaEnrolled: (value) => `${MFA_ENROLLED_SQL} = ${value ? 1 : 0}`,
  locked: (value) => `${LOCKED_SQL} = ${value ? 1 : 0}`,
});

const mapEmployeeOrNull = (row) => (row.EMPLOYEE_ROW_COUNT === null ? null : mapEmployee(row));

const mapListItem = (row) => ({
  userId: row.USER_ID,
  employeeNumber: row.EMPLOYEE_NUMBER,
  username: row.USER_NAME,
  fullName: row.FULL_NAME,
  department: row.DEPARTMENT,
  jobTitle: row.JOB_TITLE,
  accountStatus: row.ACCOUNT_STATUS,
  locked: row.LOCKED === 1,
  mfaEnrolled: row.MFA_ENROLLED === 1,
  lastLoginAt: row.LAST_LOGIN_AT,
  createdAt: row.CREATED_AT,
});

/**
 * Paginated account list. `search` is an upper-case LIKE pattern already escaped by the caller;
 * `sortBy` must be a key of SORT_COLUMNS.
 */
export async function listUsers(connection, { limit, offset, filters = {}, sortBy, sortOrder }) {
  const binds = {};
  const conditions = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    if (!FILTERS[key]) throw new Error(`Unsupported filter ${key}`);
    conditions.push(FILTERS[key](value));
    if (key === 'status' || key === 'search') binds[key] = value;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const column = SORT_COLUMNS[sortBy];
  if (!column) throw new Error(`Unsupported sort ${sortBy}`);
  const direction = sortOrder === 'desc' ? 'DESC' : 'ASC';

  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS total FROM xx_zrv_users u ${EMPLOYEE_APPLY} ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT u.user_id, u.employee_number, u.account_status, u.last_login_at, u.created_at,
            e.user_name, e.full_name, e.department, e.job_title,
            ${LOCKED_SQL} AS locked, ${MFA_ENROLLED_SQL} AS mfa_enrolled
       FROM xx_zrv_users u ${EMPLOYEE_APPLY}
       ${where}
      ORDER BY ${column} ${direction} NULLS LAST, u.user_id
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    { USER_ID: ID },
  );
  return { total, items: result.map(mapListItem) };
}

/** Account, employee and classification facts for one user, or null. Never selects secrets. */
export async function findUserDetail(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT u.user_id, u.employee_number, u.account_status, u.failed_login_attempts,
            u.last_failed_login_at, u.locked_until, ${LOCKED_SQL} AS locked, u.last_login_at,
            CASE WHEN u.password_hash IS NOT NULL THEN 1 ELSE 0 END AS password_set,
            u.password_changed_at, ${MFA_ENROLLED_SQL} AS mfa_enrolled, u.mfa_enrolled_at,
            u.created_at, u.updated_at,
            e.user_name, e.full_name, e.email_address, e.job_title, e.department,
            e.current_emp_flag, e.termination_status, e.employee_row_count,
            ${PRIVILEGE_COLUMNS.sql},
            SYSTIMESTAMP AS db_now
       FROM xx_zrv_users u ${EMPLOYEE_APPLY}
      WHERE u.user_id = :userId`,
    { ...PRIVILEGE_COLUMNS.binds, userId },
    { USER_ID: ID },
  );
  if (!row) return null;
  return {
    userId: row.USER_ID,
    employeeNumber: row.EMPLOYEE_NUMBER,
    accountStatus: row.ACCOUNT_STATUS,
    failedLoginAttempts: row.FAILED_LOGIN_ATTEMPTS,
    lastFailedLoginAt: row.LAST_FAILED_LOGIN_AT,
    lockedUntil: row.LOCKED_UNTIL,
    locked: row.LOCKED === 1,
    lastLoginAt: row.LAST_LOGIN_AT,
    passwordSet: row.PASSWORD_SET === 1,
    passwordChangedAt: row.PASSWORD_CHANGED_AT,
    mfaEnrolledAt: row.MFA_ENROLLED_AT,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
    employee: mapEmployeeOrNull(row),
    ...mapPrivilegeFlags(row),
    dbNow: row.DB_NOW,
  };
}

/** Active (unrevoked, unexpired) sessions and MFA challenges of a user, newest first (max 50). */
export async function listActiveSessions(connection, userId) {
  const result = await rows(
    connection,
    `SELECT session_id, created_at, last_activity_at, expires_at,
            CASE WHEN mfa_verified_at IS NULL THEN 0 ELSE 1 END AS mfa_verified,
            login_ip_address, user_agent
       FROM xx_zrv_user_sessions
      WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP
      ORDER BY created_at DESC, session_id DESC FETCH FIRST 50 ROWS ONLY`,
    { userId },
    { SESSION_ID: ID },
  );
  return result.map((row) => ({
    sessionId: row.SESSION_ID,
    createdAt: row.CREATED_AT,
    lastActivityAt: row.LAST_ACTIVITY_AT,
    expiresAt: row.EXPIRES_AT,
    mfaVerified: row.MFA_VERIFIED === 1,
    ipAddress: row.LOGIN_IP_ADDRESS,
    userAgent: row.USER_AGENT,
  }));
}

export async function findSession(connection, { userId, sessionId }) {
  const [row] = await rows(
    connection,
    `SELECT session_id, CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END AS revoked
       FROM xx_zrv_user_sessions WHERE session_id = :sessionId AND user_id = :userId`,
    { userId, sessionId },
    { SESSION_ID: ID },
  );
  return row ? { sessionId: row.SESSION_ID, revoked: row.REVOKED === 1 } : null;
}

// Employee-master rows with their local account (if any), the duplicate-row count and how many
// employee rows share the normalised USER_NAME (login ambiguity).
const CANDIDATE_COLUMNS = `
  e.employee_number, ${EMPLOYEE_COLUMNS_SQL},
  (SELECT COUNT(*) FROM xx_digi_emp_master n
    WHERE UPPER(TRIM(n.user_name)) = UPPER(TRIM(e.user_name))) AS username_count,
  u.user_id, u.account_status`;

const mapCandidate = (row) => ({
  employeeNumber: row.EMPLOYEE_NUMBER,
  employee: mapEmployee(row),
  usernameCount: row.USERNAME_COUNT,
  userId: row.USER_ID,
  accountStatus: row.ACCOUNT_STATUS,
});

/** Employee-master search for provisioning (paginated). `search` as in listUsers. */
export async function listEmployeeCandidates(connection, { limit, offset, search, hasAccount }) {
  const binds = {};
  const conditions = [];
  if (search) {
    binds.search = search;
    conditions.push(`(UPPER(e.employee_number) LIKE :search ESCAPE '\\'
                      OR UPPER(e.user_name) LIKE :search ESCAPE '\\'
                      OR UPPER(e.full_name) LIKE :search ESCAPE '\\')`);
  }
  if (hasAccount !== undefined) {
    conditions.push(hasAccount ? 'u.user_id IS NOT NULL' : 'u.user_id IS NULL');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const from = `FROM xx_digi_emp_master e LEFT JOIN xx_zrv_users u ON u.employee_number = e.employee_number`;

  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS total ${from} ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT ${CANDIDATE_COLUMNS} ${from} ${where}
      ORDER BY e.employee_number, e.user_name
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    { USER_ID: ID },
  );
  return { total, items: result.map(mapCandidate) };
}

/** Up to two employee-master rows for an employee number (two = duplicate source rows). */
export async function findEmployeeCandidate(connection, employeeNumber) {
  const result = await rows(
    connection,
    `SELECT ${CANDIDATE_COLUMNS}
       FROM xx_digi_emp_master e LEFT JOIN xx_zrv_users u ON u.employee_number = e.employee_number
      WHERE e.employee_number = :employeeNumber
      FETCH FIRST 2 ROWS ONLY`,
    { employeeNumber },
    { USER_ID: ID },
  );
  return result.map(mapCandidate);
}

/** Creates a PENDING account without a password (docs/07 §4). UQ_ZRV_USERS_EMP blocks duplicates. */
export async function insertUser(connection, { employeeNumber, actorUserId }) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_users (employee_number, account_status, failed_login_attempts, created_by)
     VALUES (:employeeNumber, 'PENDING', 0, :actorUserId)
     RETURNING user_id INTO :id`,
    { employeeNumber, actorUserId, id: idOut() },
  );
  return result.outBinds.id[0];
}

/**
 * PENDING/DISABLED -> ACTIVE, only when a password has been set (CK_ZRV_USERS_PWD) with a change
 * time. Returns false when the guard no longer holds.
 */
export async function activateUser(connection, { userId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_users
        SET account_status = 'ACTIVE', updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND account_status IN ('PENDING', 'DISABLED')
        AND password_hash IS NOT NULL AND password_changed_at IS NOT NULL`,
    { userId, actorUserId },
  );
  return result.rowsAffected === 1;
}

/** Any status -> DISABLED; false when already disabled. */
export async function disableUser(connection, { userId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_users
        SET account_status = 'DISABLED', updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND account_status <> 'DISABLED'`,
    { userId, actorUserId },
  );
  return result.rowsAffected === 1;
}

/** Revokes one session of the given user; false when it was already revoked. */
export async function revokeUserSession(connection, { userId, sessionId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_user_sessions
        SET revoked_at = ${UTC_NOW}, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE session_id = :sessionId AND user_id = :userId AND revoked_at IS NULL`,
    { userId, sessionId, actorUserId },
  );
  return result.rowsAffected === 1;
}

/** Revokes every outstanding (unconsumed, unrevoked) action token of a user. */
export async function revokeActionTokens(connection, { userId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_account_action_tokens
        SET revoked_at = ${UTC_NOW}, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND consumed_at IS NULL AND revoked_at IS NULL`,
    { userId, actorUserId },
  );
  return result.rowsAffected;
}
