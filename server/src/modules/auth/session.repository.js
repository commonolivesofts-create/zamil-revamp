import oracledb from 'oracledb';
import {
  EMPLOYEE_COLUMNS_SQL,
  mapEmployee,
  mapPrivilegeFlags,
  PRIVILEGE_COLUMNS,
} from './auth.repository.js';

const ID_AS_STRING = { type: oracledb.STRING };
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";

const INSERT_SESSION_SQL = `
  INSERT INTO xx_zrv_user_sessions (
    user_id, session_token_hash, last_activity_at, expires_at, mfa_verified_at,
    login_ip_address, user_agent, created_by
  ) VALUES (
    :userId, :tokenHash, ${UTC_NOW}, ${UTC_NOW} + NUMTODSINTERVAL(:absoluteSeconds, 'SECOND'),
    CASE WHEN :mfaVerified = 1 THEN ${UTC_NOW} END,
    :ipAddress, :userAgent, :userId
  )
  RETURNING session_id, expires_at INTO :sessionId, :expiresAt`;

/**
 * Persists a new session. Only the SHA-256 digest of the bearer token is stored. `mfaVerified`
 * records MFA assurance for this session (MFA_VERIFIED_AT). An MFA login challenge is a session row
 * with a short lifetime and MFA_VERIFIED_AT NULL.
 */
export async function insertSession(
  connection,
  { userId, tokenHash, absoluteSeconds, ipAddress, userAgent, mfaVerified = false },
) {
  const result = await connection.execute(INSERT_SESSION_SQL, {
    userId,
    tokenHash,
    absoluteSeconds,
    mfaVerified: mfaVerified ? 1 : 0,
    ipAddress,
    userAgent,
    sessionId: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
    expiresAt: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP_TZ },
  });

  return {
    sessionId: result.outBinds.sessionId[0],
    expiresAt: result.outBinds.expiresAt[0],
  };
}

const FIND_SESSION_SQL = `
  SELECT s.session_id,
         s.user_id,
         s.last_activity_at,
         s.expires_at,
         s.revoked_at,
         s.mfa_verified_at,
         s.created_at,
         u.employee_number,
         u.account_status,
         u.password_changed_at,
         u.locked_until,
         CASE WHEN u.mfa_enrolled_at IS NOT NULL OR u.mfa_totp_secret_encrypted IS NOT NULL
              THEN 1 ELSE 0 END AS mfa_enrolled,
         ${PRIVILEGE_COLUMNS.sql},
         ${EMPLOYEE_COLUMNS_SQL},
         CASE WHEN e.employee_number IS NULL THEN 0 ELSE 1 END AS employee_found,
         SYSTIMESTAMP AS db_now
    FROM xx_zrv_user_sessions s
    JOIN xx_zrv_users u ON u.user_id = s.user_id
    LEFT JOIN xx_digi_emp_master e ON e.employee_number = u.employee_number
   WHERE s.session_token_hash = :tokenHash
   FETCH FIRST 2 ROWS ONLY`;

/**
 * Looks up a session by token digest together with the current account, MFA, grant and
 * employee-eligibility state, so every request re-evaluates them. Returns up to two rows; more
 * than one means the employee master holds duplicate rows for the account's employee number.
 */
export async function findSessionByTokenHash(connection, tokenHash) {
  const result = await connection.execute(
    FIND_SESSION_SQL,
    { tokenHash, ...PRIVILEGE_COLUMNS.binds },
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: { SESSION_ID: ID_AS_STRING, USER_ID: ID_AS_STRING },
    },
  );

  return result.rows.map((row) => ({
    sessionId: row.SESSION_ID,
    userId: row.USER_ID,
    lastActivityAt: row.LAST_ACTIVITY_AT,
    expiresAt: row.EXPIRES_AT,
    revokedAt: row.REVOKED_AT,
    mfaVerifiedAt: row.MFA_VERIFIED_AT,
    createdAt: row.CREATED_AT,
    employeeNumber: row.EMPLOYEE_NUMBER,
    accountStatus: row.ACCOUNT_STATUS,
    passwordChangedAt: row.PASSWORD_CHANGED_AT,
    lockedUntil: row.LOCKED_UNTIL,
    ...mapPrivilegeFlags(row),
    employee: row.EMPLOYEE_FOUND === 1 ? mapEmployee(row) : null,
    dbNow: row.DB_NOW,
  }));
}

const TOUCH_SESSION_SQL = `
  UPDATE xx_zrv_user_sessions
     SET last_activity_at = ${UTC_NOW},
         updated_at = ${UTC_NOW},
         updated_by = :userId
   WHERE session_id = :sessionId
     AND user_id = :userId
     AND revoked_at IS NULL
     AND expires_at > SYSTIMESTAMP`;

/** Records activity on a still-valid session; returns false if it was revoked or expired meanwhile. */
export async function touchSession(connection, { sessionId, userId }) {
  const result = await connection.execute(TOUCH_SESSION_SQL, { sessionId, userId });
  return result.rowsAffected === 1;
}

const REVOKE_SESSION_SQL = `
  UPDATE xx_zrv_user_sessions
     SET revoked_at = ${UTC_NOW},
         updated_at = ${UTC_NOW},
         updated_by = :actorUserId
   WHERE session_id = :sessionId
     AND revoked_at IS NULL`;

/**
 * Revokes one session. `actorUserId` is the authenticated user responsible, or null for a
 * system-initiated revocation. Returns false when it was already revoked.
 */
export async function revokeSession(connection, { sessionId, actorUserId }) {
  const result = await connection.execute(REVOKE_SESSION_SQL, { sessionId, actorUserId });
  return result.rowsAffected === 1;
}

const REVOKE_BY_TOKEN_HASH_SQL = `
  UPDATE xx_zrv_user_sessions
     SET revoked_at = ${UTC_NOW},
         updated_at = ${UTC_NOW},
         updated_by = :actorUserId
   WHERE session_token_hash = :tokenHash
     AND revoked_at IS NULL`;

/** Revokes whatever session the browser presented before a new login replaces it. */
export async function revokeSessionByTokenHash(connection, { tokenHash, actorUserId }) {
  await connection.execute(REVOKE_BY_TOKEN_HASH_SQL, { tokenHash, actorUserId });
}

const REVOKE_USER_SESSIONS_SQL = `
  UPDATE xx_zrv_user_sessions
     SET revoked_at = ${UTC_NOW},
         updated_at = ${UTC_NOW},
         updated_by = :actorUserId
   WHERE user_id = :userId
     AND revoked_at IS NULL`;

/** Revokes every active session and MFA challenge of a user, e.g. when MFA changes (docs/07 §4). */
export async function revokeUserSessions(connection, { userId, actorUserId }) {
  const result = await connection.execute(REVOKE_USER_SESSIONS_SQL, { userId, actorUserId });
  return result.rowsAffected;
}
