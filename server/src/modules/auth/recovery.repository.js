import oracledb from 'oracledb';
import { BUSINESS_TIME_ZONE } from './auth.policy.js';

// Account action tokens and password writes (Phase 05). Values are always bound. Only the SHA-256
// digest of a token (RAW(32)) is ever stored or compared; the raw token never reaches SQL.
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";
const ID = { type: oracledb.STRING };
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Serialises token issuance per user (one outstanding token per type, docs schema notes). */
export async function lockUser(connection, userId) {
  const result = await connection.execute(
    `SELECT user_id FROM xx_zrv_users WHERE user_id = :userId FOR UPDATE`,
    { userId },
  );
  return result.rows.length === 1;
}

/** Whether a token of this type was issued to the user within the last `seconds`. */
export async function hasRecentToken(connection, { userId, actionType, seconds }) {
  const result = await connection.execute(
    `SELECT COUNT(*) AS n FROM xx_zrv_account_action_tokens
      WHERE user_id = :userId AND action_type = :actionType
        AND created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:seconds, 'SECOND')`,
    { userId, actionType, seconds },
    OBJECT,
  );
  return result.rows[0].N > 0;
}

/** Revokes every outstanding (unconsumed, unrevoked) token of one type for a user. */
export async function revokeOutstandingTokens(connection, { userId, actionType, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_account_action_tokens
        SET revoked_at = ${UTC_NOW}, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND action_type = :actionType
        AND consumed_at IS NULL AND revoked_at IS NULL`,
    { userId, actionType, actorUserId },
  );
  return result.rowsAffected;
}

export async function insertToken(
  connection,
  { userId, actionType, tokenHash, lifetimeSeconds, actorUserId },
) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_account_action_tokens (user_id, action_type, token_hash, expires_at, created_by)
     VALUES (:userId, :actionType, :tokenHash,
             ${UTC_NOW} + NUMTODSINTERVAL(:lifetimeSeconds, 'SECOND'), :actorUserId)
     RETURNING action_token_id, expires_at INTO :id, :expiresAt`,
    {
      userId,
      actionType,
      tokenHash,
      lifetimeSeconds,
      actorUserId,
      id: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      expiresAt: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP_TZ },
    },
  );
  return { tokenId: result.outBinds.id[0], expiresAt: result.outBinds.expiresAt[0] };
}

/** A token by digest with its state, evaluated on the database clock; null when unknown. */
export async function findToken(connection, tokenHash) {
  const result = await connection.execute(
    `SELECT action_token_id, user_id, action_type,
            CASE WHEN consumed_at IS NULL AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP
                 THEN 1 ELSE 0 END AS usable,
            SYSTIMESTAMP AS db_now
       FROM xx_zrv_account_action_tokens WHERE token_hash = :tokenHash`,
    { tokenHash },
    { ...OBJECT, fetchInfo: { ACTION_TOKEN_ID: ID, USER_ID: ID } },
  );
  const [row] = result.rows;
  return row
    ? {
        tokenId: row.ACTION_TOKEN_ID,
        userId: row.USER_ID,
        actionType: row.ACTION_TYPE,
        usable: row.USABLE === 1,
        dbNow: row.DB_NOW,
      }
    : null;
}

/** Atomically consumes a usable token (single use); false when it is no longer usable. */
export async function consumeToken(connection, { tokenId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_account_action_tokens
        SET consumed_at = ${UTC_NOW}, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE action_token_id = :tokenId
        AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
    { tokenId, actorUserId },
  );
  return result.rowsAffected === 1;
}

/** The stored Argon2id hash of an ACTIVE account (for password change), or null. */
export async function findPasswordHash(connection, userId) {
  const result = await connection.execute(
    `SELECT password_hash FROM xx_zrv_users WHERE user_id = :userId AND account_status = 'ACTIVE'`,
    { userId },
    OBJECT,
  );
  return result.rows[0]?.PASSWORD_HASH ?? null;
}

/**
 * Sets a new password hash and PASSWORD_CHANGED_AT (Decision 04), clears the lockout state and,
 * with `activate`, moves PENDING to ACTIVE. Applies only while the account still has
 * `expectedStatus`; returns false otherwise.
 */
export async function setPassword(
  connection,
  { userId, passwordHash, expectedStatus, activate = false, actorUserId },
) {
  const result = await connection.execute(
    `UPDATE xx_zrv_users
        SET password_hash = :passwordHash, password_changed_at = ${UTC_NOW},
            failed_login_attempts = 0, locked_until = NULL,
            account_status = CASE WHEN :activate = 1 THEN 'ACTIVE' ELSE account_status END,
            updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND account_status = :expectedStatus`,
    { userId, passwordHash, expectedStatus, activate: activate ? 1 : 0, actorUserId },
  );
  return result.rowsAffected === 1;
}

/**
 * ACTIVE accounts whose password expires on the Asia/Riyadh business date `daysBefore` days from
 * today (PASSWORD_POLICY reminders 14/7/1). Run once per business day. Max 1,000 per call.
 */
export async function listPasswordExpiryReminders(connection, { daysBefore, expiryDays }) {
  const result = await connection.execute(
    `SELECT u.user_id, u.employee_number
       FROM xx_zrv_users u
      WHERE u.account_status = 'ACTIVE' AND u.password_hash IS NOT NULL
        AND u.password_changed_at IS NOT NULL
        AND TRUNC(CAST((u.password_changed_at + NUMTODSINTERVAL(:expiryDays, 'DAY'))
                       AT TIME ZONE '${BUSINESS_TIME_ZONE}' AS DATE))
            = TRUNC(CAST(SYSTIMESTAMP AT TIME ZONE '${BUSINESS_TIME_ZONE}' AS DATE)) + :daysBefore
      ORDER BY u.user_id FETCH FIRST 1000 ROWS ONLY`,
    { daysBefore, expiryDays },
    { ...OBJECT, fetchInfo: { USER_ID: ID } },
  );
  return result.rows.map((row) => ({ userId: row.USER_ID, employeeNumber: row.EMPLOYEE_NUMBER }));
}
