// Validators for the backend authentication contract (server/docs/openapi/openapi.yaml:
// LoginResult, MfaChallenge, CurrentUser, CsrfToken, MfaEnrollment, MfaReplacementResult,
// PasswordPolicy, RecoveryAccepted, PasswordChangeResult, MfaRecoveryResult).
// Only documented fields are kept. A response that does not match is rejected
// rather than guessed at, so a malformed or MFA-pending login can never be
// mistaken for an authenticated session.
import { ApiError, CSRF_HEADER } from '../../services/api/apiClient.js'

const ID_PATTERN = /^[1-9][0-9]{0,18}$/
// Kept as a string: leading zeros are significant in authenticator codes.
export const MFA_CODE_PATTERN = /^\d{6}$/
// Input sanitising for typed or pasted codes: keep ASCII digits only, then the
// first six ("123 456" → "123456"). Validation still requires exactly six.
export const sanitizeMfaCode = (value) => String(value ?? '').replace(/[^0-9]/g, '').slice(0, 6)
// Single-use action token from an e-mailed link (backend actionToken schema).
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const BASE32_SECRET_PATTERN = /^[A-Z2-7]{16,128}$/
const MAX_OTPAUTH_URI_LENGTH = 1024
// Visible ASCII only: tokens are sent in a request header.
const TOKEN_PATTERN = /^[\x21-\x7e]{1,512}$/

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isNullableString = (value) => value === null || typeof value === 'string'
const isDateTime = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))

function invalid() {
  return new ApiError('The authentication response could not be verified.', { code: 'INVALID_RESPONSE' })
}

function readUser(user) {
  if (!isObject(user) || typeof user.id !== 'string' || !ID_PATTERN.test(user.id) ||
    typeof user.employeeNumber !== 'string' ||
    !['username', 'fullName', 'email', 'jobTitle', 'department'].every((key) => isNullableString(user[key]))) {
    throw invalid()
  }
  return Object.freeze({
    id: user.id,
    username: user.username,
    employeeNumber: user.employeeNumber,
    fullName: user.fullName,
    email: user.email,
    jobTitle: user.jobTitle,
    department: user.department,
  })
}

function readSession(session) {
  if (!isObject(session) || !isDateTime(session.expiresAt) ||
    !Number.isInteger(session.idleTimeoutSeconds) || session.idleTimeoutSeconds <= 0 ||
    typeof session.mfaVerified !== 'boolean') {
    throw invalid()
  }
  return Object.freeze({
    expiresAt: session.expiresAt,
    idleTimeoutSeconds: session.idleTimeoutSeconds,
    mfaVerified: session.mfaVerified,
  })
}

function readPassword(password) {
  if (!isObject(password) || typeof password.expired !== 'boolean' ||
    !(password.expiresAt === null || isDateTime(password.expiresAt))) {
    throw invalid()
  }
  return Object.freeze({ expired: password.expired, expiresAt: password.expiresAt })
}

export function readCsrfToken(csrf) {
  if (!isObject(csrf) || csrf.headerName !== CSRF_HEADER ||
    typeof csrf.token !== 'string' || !TOKEN_PATTERN.test(csrf.token)) {
    throw invalid()
  }
  return csrf.token
}

export function readCurrentUser(data) {
  if (!isObject(data)) throw invalid()
  return Object.freeze({
    user: readUser(data.user),
    session: readSession(data.session),
    password: readPassword(data.password),
  })
}

// Returns either { authenticated: true, user, session, password, csrfToken }
// or { authenticated: false, mfa, challengeCsrfToken }. Only the literal
// boolean `true` creates an authenticated result.
export function readLoginResult(data) {
  if (!isObject(data)) throw invalid()
  if (data.authenticated === true) {
    return Object.freeze({
      authenticated: true,
      ...readCurrentUser(data),
      csrfToken: readCsrfToken(data.csrf),
    })
  }
  if (data.authenticated === false) {
    const mfa = data.mfa
    if (!isObject(mfa) || mfa.required !== true || typeof mfa.enrollmentRequired !== 'boolean' ||
      !isDateTime(mfa.expiresAt)) {
      throw invalid()
    }
    return Object.freeze({
      authenticated: false,
      mfa: Object.freeze({ enrollmentRequired: mfa.enrollmentRequired, expiresAt: mfa.expiresAt }),
      challengeCsrfToken: readCsrfToken(data.csrf),
    })
  }
  throw invalid()
}

// MFA verification and enrollment confirmation return the same signed-in
// LoginResult; anything other than an authenticated result is rejected.
export function readMfaSignIn(data) {
  const result = readLoginResult(data)
  if (result.authenticated !== true) throw invalid()
  return result
}

// Authenticator setup material. The otpauth URI must be a TOTP URI carrying the
// same secret that is shown for manual entry, so the QR code and the key agree.
export function readMfaEnrollment(data) {
  if (!isObject(data) || !isDateTime(data.expiresAt)) throw invalid()
  return readSetupMaterial(data, data.expiresAt)
}

// MFA recovery start returns the same setup fields but, unlike the documented
// MfaEnrollment schema, the backend implementation sends no expiresAt (the link
// token's 15-minute lifetime applies). A present expiresAt is still validated.
export function readMfaRecoverySetup(data) {
  if (!isObject(data) || !(data.expiresAt === undefined || isDateTime(data.expiresAt))) throw invalid()
  return readSetupMaterial(data, data.expiresAt ?? null)
}

function readSetupMaterial(data, expiresAt) {
  if (typeof data.secret !== 'string' || !BASE32_SECRET_PATTERN.test(data.secret) ||
    typeof data.otpauthUri !== 'string' || data.otpauthUri.length > MAX_OTPAUTH_URI_LENGTH ||
    !data.otpauthUri.startsWith('otpauth://totp/') ||
    typeof data.issuer !== 'string' || typeof data.accountName !== 'string' ||
    data.algorithm !== 'SHA1' || data.digits !== 6 || data.periodSeconds !== 30) {
    throw invalid()
  }
  let uri
  try {
    uri = new URL(data.otpauthUri)
  } catch {
    throw invalid()
  }
  if (uri.searchParams.get('secret') !== data.secret) throw invalid()
  return Object.freeze({
    secret: data.secret,
    otpauthUri: data.otpauthUri,
    issuer: data.issuer,
    accountName: data.accountName,
    expiresAt,
  })
}

const isCount = (value) => Number.isInteger(value) && value >= 0

export function readPasswordPolicy(data) {
  if (!isObject(data) || !Number.isInteger(data.minLength) || data.minLength < 1 ||
    !Number.isInteger(data.maxLength) || data.maxLength < data.minLength ||
    !['requireUppercase', 'requireLowercase', 'requireDigit', 'requireSpecialCharacter']
      .every((key) => typeof data[key] === 'boolean') ||
    !isCount(data.expiryDays) || !Array.isArray(data.expiryReminderDays) || !data.expiryReminderDays.every(isCount)) {
    throw invalid()
  }
  return Object.freeze({
    minLength: data.minLength,
    maxLength: data.maxLength,
    requireUppercase: data.requireUppercase,
    requireLowercase: data.requireLowercase,
    requireDigit: data.requireDigit,
    requireSpecialCharacter: data.requireSpecialCharacter,
    expiryDays: data.expiryDays,
    expiryReminderDays: Object.freeze([...data.expiryReminderDays]),
  })
}

// The 202 body is identical for every username; its message is the backend's
// generic, non-enumerating confirmation.
export function readRecoveryAccepted(data) {
  if (!isObject(data) || data.accepted !== true) throw invalid()
  return Object.freeze({ accepted: true, message: typeof data.message === 'string' ? data.message : null })
}

// Password setup, reset and change. Setup also reports the activated account.
export function readPasswordChangeResult(data) {
  if (!isObject(data) || data.passwordChanged !== true || data.signInRequired !== true ||
    !isCount(data.sessionsRevoked) || !(data.accountStatus === undefined || data.accountStatus === 'ACTIVE')) {
    throw invalid()
  }
  return Object.freeze({ passwordChanged: true, sessionsRevoked: data.sessionsRevoked, signInRequired: true })
}

export function readMfaRecoveryResult(data) {
  if (!isObject(data) || data.mfaRecovered !== true || data.signInRequired !== true || !isCount(data.sessionsRevoked)) {
    throw invalid()
  }
  return Object.freeze({ mfaRecovered: true, sessionsRevoked: data.sessionsRevoked, signInRequired: true })
}

export function readMfaReplacementResult(data) {
  if (!isObject(data) || data.replaced !== true || data.reauthenticationRequired !== true ||
    !Number.isInteger(data.sessionsRevoked) || data.sessionsRevoked < 0) {
    throw invalid()
  }
  return Object.freeze({ replaced: true, sessionsRevoked: data.sessionsRevoked, reauthenticationRequired: true })
}
