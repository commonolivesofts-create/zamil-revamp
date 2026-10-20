import {
  ADMINISTRATOR_ROLES,
  SECURITY_MODULE,
  SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER,
} from '../access-control/securityCatalog.js';

// Owner-approved, locked authentication policy (docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md §4).
// These are business decisions, not deployment settings, so they are not read from the environment.

const MINUTE_MS = 60 * 1000;

export const PASSWORD_POLICY = Object.freeze({
  minLength: 8,
  // Doc 04 §3.2: allow passphrases of at least 64 characters.
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialCharacter: true,
  expiryDays: 90,
  expiryReminderDays: Object.freeze([14, 7, 1]),
});

export const LOCKOUT_POLICY = Object.freeze({
  maxConsecutiveFailures: 5,
  lockDurationMs: 15 * MINUTE_MS,
});

export const SESSION_POLICY = Object.freeze({
  absoluteLifetimeMs: 8 * 60 * MINUTE_MS,
  idleTimeoutMs: 30 * MINUTE_MS,
  privilegedIdleTimeoutMs: 15 * MINUTE_MS,
});

// Approved Argon2id minimum (Phase 01 security review, Decision 05). New hashes use exactly the
// salt and hash lengths; stored hashes below any minimum are refused (never silently accepted).
export const ARGON2_POLICY = Object.freeze({
  minMemoryKiB: 19456,
  minPasses: 2,
  minParallelism: 1,
  saltBytes: 16,
  hashBytes: 32,
});

// Business dates such as XX_DIGI_EMP_MASTER.TERMINATION_DATE are evaluated in KSA time.
export const BUSINESS_TIME_ZONE = 'Asia/Riyadh';

/*
 * Mandatory-MFA classification (Decision 02 with the approved catalogue, docs/07 §10B). Ordinary
 * business roles do not make a user privileged. A user is privileged when any of these applies:
 *   - protected employee number (Zaid: 2172);
 *   - active, unexpired membership of an active protected administrator role;
 *   - any effective permission (VIEW included) under an active security-administration module:
 *     active permission and resource, granted by an active, unexpired membership of an active role
 *     with an active role grant or by an active, unexpired ALLOW override, and not removed by an
 *     active, unexpired DENY override.
 * The values come from the approved catalogue only; never from client input or configuration.
 */
export const PRIVILEGE_CLASSIFICATION = Object.freeze({
  protectedEmployeeNumbers: Object.freeze([SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER]),
  privilegedRoleCodes: Object.freeze(Object.values(ADMINISTRATOR_ROLES)),
  securityAdministrationModuleCodes: Object.freeze([SECURITY_MODULE.code]),
});

// The classification replaced the earlier fail-closed "any grant" rule, so it must never be empty:
// refuse to load rather than silently classify every administrator as ordinary.
for (const [name, list] of Object.entries(PRIVILEGE_CLASSIFICATION)) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`PRIVILEGE_CLASSIFICATION.${name} must be a non-empty list`);
  }
}

/*
 * Authenticator-app TOTP (RFC 6238) as supported by common authenticator apps: SHA-1, 6 digits,
 * 30-second steps, a 160-bit secret, and ±1 step of clock tolerance. Each accepted step is recorded in
 * XX_ZRV_USERS.MFA_LAST_USED_STEP and can never be used again (replay prevention).
 *
 * The MFA login challenge is a short-lived XX_ZRV_USER_SESSIONS row with MFA_VERIFIED_AT NULL that is
 * accepted only by the MFA endpoints; a normal session is issued only after verification.
 */
export const MFA_POLICY = Object.freeze({
  algorithm: 'SHA1',
  digits: 6,
  periodSeconds: 30,
  allowedDriftSteps: 1,
  secretBytes: 20,
  challengeLifetimeMs: 10 * MINUTE_MS,
  // Authenticator replacement requires MFA verified on the current session within this window.
  replacementRecentVerificationMs: 10 * MINUTE_MS,
});

/**
 * Single-use account action tokens (docs/07 §4; XX_ZRV_ACCOUNT_ACTION_TOKENS.ACTION_TYPE). Only the
 * SHA-256 digest is stored; the raw token is handed only to the delivery channel. One outstanding
 * token per user and type: issuing a new one revokes the previous one. A second token of the same
 * type is not issued within `issueCooldownMs` (self-service request flooding).
 */
export const ACTION_TOKEN_POLICY = Object.freeze({
  lifetimeMs: Object.freeze({
    PASSWORD_SETUP: 24 * 60 * MINUTE_MS,
    PASSWORD_RESET: 30 * MINUTE_MS,
    MFA_RECOVERY: 15 * MINUTE_MS,
  }),
  issueCooldownMs: 5 * MINUTE_MS,
  // Super Administrator recovery authorization of another privileged account (docs/07 §5 Option A).
  recentVerificationMs: 10 * MINUTE_MS,
});

// Upper bound accepted at login. Above PASSWORD_POLICY.maxLength so that a password set by an
// earlier process is never truncated, but small enough to bound hashing work per request.
export const LOGIN_PASSWORD_MAX_LENGTH = 256;

// XX_DIGI_EMP_MASTER.USER_NAME is VARCHAR2(100).
export const USERNAME_MAX_LENGTH = 100;
