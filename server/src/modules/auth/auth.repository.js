import oracledb from 'oracledb';
import { BUSINESS_TIME_ZONE, PRIVILEGE_CLASSIFICATION } from './auth.policy.js';

// NUMBER(19,0) identifiers can exceed Number.MAX_SAFE_INTEGER, so they are read as strings.
const ID_AS_STRING = { type: oracledb.STRING };
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";

/**
 * Classifies an Oracle DATE termination date against the current KSA business date: `NONE`,
 * `FUTURE` (strictly after today in Asia/Riyadh) or `ENDED` (today or earlier). TERMINATION_DATE
 * is a date-only value, so it is compared as a calendar date and never time-zone converted; only
 * the current instant is converted to Asia/Riyadh. `now` is SQL for a TIMESTAMP WITH TIME ZONE.
 */
export function terminationStatusSql(column, now = 'SYSTIMESTAMP') {
  return `CASE
    WHEN ${column} IS NULL THEN 'NONE'
    WHEN TRUNC(${column}) > TRUNC(CAST(${now} AT TIME ZONE '${BUSINESS_TIME_ZONE}' AS DATE))
      THEN 'FUTURE'
    ELSE 'ENDED'
  END`;
}

const NOT_EXPIRED = (alias) =>
  `(${alias}.expires_at IS NULL OR ${alias}.expires_at > SYSTIMESTAMP)`;

const bindList = (binds, prefix, values) =>
  values
    .map((value, index) => {
      binds[`${prefix}${index}`] = value;
      return `:${prefix}${index}`;
    })
    .join(', ');

/**
 * SQL columns and binds for the mandatory-MFA classification (auth.policy.js
 * PRIVILEGE_CLASSIFICATION). Codes are bound, never interpolated; empty lists are refused so the
 * classification can never silently evaluate to "not privileged".
 *
 * IS_PRIVILEGED_ROLE_MEMBER: an active, unexpired membership of an active protected role.
 * HAS_SECURITY_ADMINISTRATION: any effective permission (VIEW included) whose permission, resource
 * and module are active and whose module is a security-administration module, granted through an
 * active, unexpired membership of an active role with an active role grant, or an active, unexpired
 * ALLOW override; and not removed by an active, unexpired DENY override on that permission (DENY
 * wins over both role grants and ALLOW).
 */
export function privilegeColumnsSql(classification = PRIVILEGE_CLASSIFICATION) {
  const { privilegedRoleCodes, securityAdministrationModuleCodes } = classification;
  if (!privilegedRoleCodes?.length || !securityAdministrationModuleCodes?.length) {
    throw new Error('Privilege classification requires role and security-module codes');
  }

  const binds = {};
  const roles = bindList(binds, 'privRole', privilegedRoleCodes);
  const modules = bindList(binds, 'secModule', securityAdministrationModuleCodes);

  const sql = `CASE WHEN EXISTS (
        SELECT 1
          FROM xx_zrv_user_roles pur
          JOIN xx_zrv_roles pr ON pr.role_id = pur.role_id
         WHERE pur.user_id = u.user_id
           AND pur.is_active = 1
           AND pr.is_active = 1
           AND ${NOT_EXPIRED('pur')}
           AND pr.role_code IN (${roles})
      ) THEN 1 ELSE 0 END AS is_privileged_role_member,
      CASE WHEN EXISTS (
        SELECT 1
          FROM xx_zrv_permissions sp
          JOIN xx_zrv_resources sres ON sres.resource_id = sp.resource_id
          JOIN xx_zrv_app_modules sm ON sm.module_id = sres.module_id
         WHERE sp.is_active = 1
           AND sres.is_active = 1
           AND sm.is_active = 1
           AND sm.module_code IN (${modules})
           AND NOT EXISTS (
             SELECT 1
               FROM xx_zrv_user_permission_overrides sd
              WHERE sd.user_id = u.user_id
                AND sd.permission_id = sp.permission_id
                AND sd.is_active = 1
                AND sd.override_effect = 'DENY'
                AND ${NOT_EXPIRED('sd')}
           )
           AND (
             EXISTS (
               SELECT 1
                 FROM xx_zrv_user_roles sur
                 JOIN xx_zrv_roles sr ON sr.role_id = sur.role_id
                 JOIN xx_zrv_role_permissions srp ON srp.role_id = sr.role_id
                WHERE sur.user_id = u.user_id
                  AND sur.is_active = 1
                  AND sr.is_active = 1
                  AND ${NOT_EXPIRED('sur')}
                  AND srp.permission_id = sp.permission_id
                  AND srp.is_active = 1
             ) OR EXISTS (
               SELECT 1
                 FROM xx_zrv_user_permission_overrides sa
                WHERE sa.user_id = u.user_id
                  AND sa.permission_id = sp.permission_id
                  AND sa.is_active = 1
                  AND sa.override_effect = 'ALLOW'
                  AND ${NOT_EXPIRED('sa')}
             )
           )
      ) THEN 1 ELSE 0 END AS has_security_administration`;

  return { sql, binds };
}

export const PRIVILEGE_COLUMNS = privilegeColumnsSql();

/** Maps the account-level classification columns shared by login and session lookups. */
export function mapPrivilegeFlags(row) {
  return {
    mfaEnrolled: row.MFA_ENROLLED === 1,
    isPrivilegedRoleMember: row.IS_PRIVILEGED_ROLE_MEMBER === 1,
    hasSecurityAdministration: row.HAS_SECURITY_ADMINISTRATION === 1,
  };
}

// Employee fields shared by login and session lookups. Only eligibility indicators and a minimal
// display profile are read; payroll, identity-document and other HR attributes are never selected.
export const EMPLOYEE_COLUMNS_SQL = `
  e.user_name,
  e.full_name,
  e.email_address,
  e.job_title,
  e.department,
  e.current_emp_flag,
  ${terminationStatusSql('e.termination_date')} AS termination_status,
  (SELECT COUNT(*) FROM xx_digi_emp_master d WHERE d.employee_number = e.employee_number)
    AS employee_row_count`;

export function mapEmployee(row) {
  return {
    username: row.USER_NAME,
    fullName: row.FULL_NAME,
    email: row.EMAIL_ADDRESS,
    jobTitle: row.JOB_TITLE,
    department: row.DEPARTMENT,
    currentEmployeeFlag: row.CURRENT_EMP_FLAG,
    terminationStatus: row.TERMINATION_STATUS,
    employeeRowCount: row.EMPLOYEE_ROW_COUNT,
  };
}

const FIND_LOGIN_CANDIDATES_SQL = `
  SELECT e.employee_number,
         ${EMPLOYEE_COLUMNS_SQL},
         u.user_id,
         u.password_hash,
         u.password_changed_at,
         u.account_status,
         u.failed_login_attempts,
         u.locked_until,
         CASE WHEN u.mfa_enrolled_at IS NOT NULL OR u.mfa_totp_secret_encrypted IS NOT NULL
              THEN 1 ELSE 0 END AS mfa_enrolled,
         ${PRIVILEGE_COLUMNS.sql},
         SYSTIMESTAMP AS db_now
    FROM xx_digi_emp_master e
    LEFT JOIN xx_zrv_users u ON u.employee_number = e.employee_number
   WHERE UPPER(TRIM(e.user_name)) = UPPER(TRIM(:username))
   FETCH FIRST 2 ROWS ONLY`;

/**
 * Returns at most two employee-master rows whose USER_NAME matches case-insensitively after
 * trimming, each joined to its local account (if any). Two rows means the username is ambiguous.
 */
export async function findLoginCandidates(connection, username) {
  const result = await connection.execute(
    FIND_LOGIN_CANDIDATES_SQL,
    { username, ...PRIVILEGE_COLUMNS.binds },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { USER_ID: ID_AS_STRING } },
  );

  return result.rows.map((row) => ({
    employeeNumber: row.EMPLOYEE_NUMBER,
    employee: mapEmployee(row),
    account:
      row.USER_ID === null
        ? null
        : {
            userId: row.USER_ID,
            passwordHash: row.PASSWORD_HASH,
            passwordChangedAt: row.PASSWORD_CHANGED_AT,
            accountStatus: row.ACCOUNT_STATUS,
            failedLoginAttempts: row.FAILED_LOGIN_ATTEMPTS,
            lockedUntil: row.LOCKED_UNTIL,
            employeeNumber: row.EMPLOYEE_NUMBER,
            ...mapPrivilegeFlags(row),
          },
    dbNow: row.DB_NOW,
  }));
}

// SET expressions are evaluated against the pre-update row. An expired lock restarts the count.
const RECORD_FAILED_ATTEMPT_SQL = `
  UPDATE xx_zrv_users
     SET failed_login_attempts =
           CASE WHEN locked_until IS NOT NULL AND locked_until <= SYSTIMESTAMP THEN 1
                ELSE failed_login_attempts + 1 END,
         last_failed_login_at = ${UTC_NOW},
         locked_until =
           CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= SYSTIMESTAMP THEN 1
                           ELSE failed_login_attempts + 1 END) >= :maxFailures
                THEN ${UTC_NOW} + NUMTODSINTERVAL(:lockSeconds, 'SECOND')
                ELSE NULL END,
         updated_at = ${UTC_NOW},
         updated_by = NULL
   WHERE user_id = :userId
     AND (locked_until IS NULL OR locked_until <= SYSTIMESTAMP)
  RETURNING failed_login_attempts, CASE WHEN locked_until IS NULL THEN 0 ELSE 1 END
       INTO :failedAttempts, :locked`;

/**
 * Atomically counts one failed password attempt and applies the lockout when the threshold is
 * reached. Returns `null` when the account was already locked by a concurrent request.
 */
export async function recordFailedAttempt(connection, { userId, maxFailures, lockSeconds }) {
  const result = await connection.execute(RECORD_FAILED_ATTEMPT_SQL, {
    userId,
    maxFailures,
    lockSeconds,
    failedAttempts: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    locked: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  });

  if (result.rowsAffected !== 1) return null;
  return {
    failedAttempts: result.outBinds.failedAttempts[0],
    locked: result.outBinds.locked[0] === 1,
  };
}

const RESET_FAILED_ATTEMPTS_SQL = `
  UPDATE xx_zrv_users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = ${UTC_NOW},
         updated_by = NULL
   WHERE user_id = :userId
     AND (failed_login_attempts <> 0 OR locked_until IS NOT NULL)
     AND (locked_until IS NULL OR locked_until <= SYSTIMESTAMP)`;

/** Clears failed-attempt state after a correct password when no session is issued. */
export async function resetFailedAttempts(connection, userId) {
  await connection.execute(RESET_FAILED_ATTEMPTS_SQL, { userId });
}

const RECORD_LOGIN_SUCCESS_SQL = `
  UPDATE xx_zrv_users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login_at = ${UTC_NOW},
         updated_at = ${UTC_NOW},
         updated_by = :userId
   WHERE user_id = :userId
     AND account_status = 'ACTIVE'
     AND password_hash IS NOT NULL
     AND (locked_until IS NULL OR locked_until <= SYSTIMESTAMP)`;

/**
 * Records a completed login. Re-checks status and lock inside the transaction so a concurrent
 * disable or lockout wins; returns false when the account no longer qualifies.
 */
export async function recordLoginSuccess(connection, userId) {
  const result = await connection.execute(RECORD_LOGIN_SUCCESS_SQL, { userId });
  return result.rowsAffected === 1;
}

const FIND_MFA_CREDENTIAL_SQL = `
  SELECT mfa_totp_secret_encrypted, mfa_last_used_step
    FROM xx_zrv_users
   WHERE user_id = :userId
     AND mfa_totp_secret_encrypted IS NOT NULL
     AND mfa_enrolled_at IS NOT NULL`;

/**
 * The enrolled TOTP credential (encrypted secret and last accepted step), or null when the user has
 * no active authenticator. The encrypted value is passed only to the MFA key ring, never returned.
 */
export async function findMfaCredential(connection, userId) {
  const result = await connection.execute(
    FIND_MFA_CREDENTIAL_SQL,
    { userId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const [row] = result.rows;
  return row
    ? { encryptedSecret: row.MFA_TOTP_SECRET_ENCRYPTED, lastUsedStep: row.MFA_LAST_USED_STEP }
    : null;
}

const RECORD_MFA_STEP_SQL = `
  UPDATE xx_zrv_users
     SET mfa_last_used_step = :step,
         updated_at = ${UTC_NOW},
         updated_by = :userId
   WHERE user_id = :userId
     AND mfa_totp_secret_encrypted IS NOT NULL
     AND (mfa_last_used_step IS NULL OR mfa_last_used_step < :step)`;

/**
 * Atomically consumes a TOTP time step. Returns false when the step (or a later one) was already
 * used, e.g. by a concurrent request with the same code: the code must then be refused as a replay.
 */
export async function recordMfaStep(connection, { userId, step }) {
  const result = await connection.execute(RECORD_MFA_STEP_SQL, { userId, step });
  return result.rowsAffected === 1;
}

const ENROLL_MFA_SQL = `
  UPDATE xx_zrv_users
     SET mfa_totp_secret_encrypted = :encryptedSecret,
         mfa_enrolled_at = ${UTC_NOW},
         mfa_last_used_step = :step,
         updated_at = ${UTC_NOW},
         updated_by = :userId
   WHERE user_id = :userId
     AND mfa_totp_secret_encrypted IS NULL
     AND mfa_enrolled_at IS NULL`;

/**
 * Activates the first authenticator after proof of possession, recording the verified step.
 * Satisfies CK_ZRV_USERS_MFA (secret and enrolment time together). Never replaces an existing
 * authenticator: returns false if one is already enrolled (replacement is a recovery operation).
 */
export async function enrollMfa(connection, { userId, encryptedSecret, step }) {
  const result = await connection.execute(ENROLL_MFA_SQL, { userId, encryptedSecret, step });
  return result.rowsAffected === 1;
}

const REPLACE_MFA_SQL = `
  UPDATE xx_zrv_users
     SET mfa_totp_secret_encrypted = :encryptedSecret,
         mfa_enrolled_at = ${UTC_NOW},
         mfa_last_used_step = :step,
         updated_at = ${UTC_NOW},
         updated_by = :userId
   WHERE user_id = :userId
     AND mfa_totp_secret_encrypted = :currentEncryptedSecret
     AND mfa_enrolled_at IS NOT NULL
     AND account_status = 'ACTIVE'
     AND (locked_until IS NULL OR locked_until <= SYSTIMESTAMP)`;

/**
 * Replaces the enrolled authenticator after the new one was verified (optimistic concurrency): the
 * update applies only while the stored ciphertext is still the one the caller read, and the account
 * is ACTIVE and not locked. Returns false when another change won; the old secret is then kept.
 */
export async function replaceMfa(
  connection,
  { userId, currentEncryptedSecret, encryptedSecret, step },
) {
  const result = await connection.execute(REPLACE_MFA_SQL, {
    userId,
    currentEncryptedSecret,
    encryptedSecret,
    step,
  });
  return result.rowsAffected === 1;
}
