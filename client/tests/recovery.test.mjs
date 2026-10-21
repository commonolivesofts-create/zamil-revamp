import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { ApiError, createApiClient, isOutcomeUnknown } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { createAuthService } from '../src/features/auth/authService.js'
import { createAuthSession } from '../src/features/auth/authSession.js'
import {
  readCurrentUser, readMfaEnrollment, readMfaRecoveryResult, readMfaRecoverySetup, readPasswordChangeResult,
  readPasswordPolicy, readRecoveryAccepted,
} from '../src/features/auth/authContract.js'
import {
  describeUnmetRules, policyRules, unmetPolicyRules, validateNewPassword, violatedRules,
} from '../src/features/auth/passwordPolicy.js'
import { readLinkToken } from '../src/features/auth/linkToken.js'
import { linkTokenPaths, safeReturnTo } from '../src/config/authRouting.js'
import { linkPages } from '../src/config/authConfig.js'
import {
  RESTORED_TOKEN, SESSION_TOKEN, SETUP_SECRET, currentUser, deferred, enrollmentMaterial, failure,
  forbidBrowserStorage, recordingFetch, success,
} from './helpers/http.mjs'

// Test-only values; never real tokens or passwords.
const LINK_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'
const POLICY = Object.freeze({
  minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireDigit: true,
  requireSpecialCharacter: true, expiryDays: 90, expiryReminderDays: [14, 7, 1],
})
const ACCEPTED = { accepted: true, message: 'If the account is eligible, instructions have been sent to its registered address.' }
const CHANGED = { passwordChanged: true, sessionsRevoked: 2, signInRequired: true }
// MFA recovery start as the backend implementation sends it: no expiresAt.
const recoverySetup = () => {
  const { expiresAt: _omitted, ...rest } = enrollmentMaterial()
  return rest
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
const apiError = (status, code, extra = {}) => new ApiError(code, { code, status, ...extra })

assert.equal(LINK_TOKEN.length, 43)

// ------------------------------------------------------------ contracts

test('password policy and recovery result contracts are validated', () => {
  assert.deepEqual(readPasswordPolicy(POLICY), POLICY)
  for (const bad of [{ ...POLICY, minLength: 0 }, { ...POLICY, maxLength: 4 }, { ...POLICY, requireDigit: 'yes' }, { ...POLICY, expiryReminderDays: null }]) {
    assert.throws(() => readPasswordPolicy(bad), { code: 'INVALID_RESPONSE' })
  }
  assert.equal(readRecoveryAccepted(ACCEPTED).message, ACCEPTED.message)
  assert.throws(() => readRecoveryAccepted({ accepted: false }), { code: 'INVALID_RESPONSE' })
  assert.deepEqual(readPasswordChangeResult({ ...CHANGED, accountStatus: 'ACTIVE' }), CHANGED)
  assert.throws(() => readPasswordChangeResult({ ...CHANGED, signInRequired: false }), { code: 'INVALID_RESPONSE' })
  assert.deepEqual(readMfaRecoveryResult({ mfaRecovered: true, sessionsRevoked: 1, signInRequired: true }),
    { mfaRecovered: true, sessionsRevoked: 1, signInRequired: true })
  assert.throws(() => readMfaRecoveryResult({ mfaRecovered: true, signInRequired: true }), { code: 'INVALID_RESPONSE' })
})

test('MFA recovery setup accepts the real backend response without expiresAt', () => {
  const material = readMfaRecoverySetup(recoverySetup())
  assert.equal(material.secret, SETUP_SECRET)
  assert.equal(material.expiresAt, null)
  assert.throws(() => readMfaEnrollment(recoverySetup()), { code: 'INVALID_RESPONSE' }, 'enrollment still requires expiresAt')
  assert.throws(() => readMfaRecoverySetup({ ...recoverySetup(), expiresAt: 'soon' }), { code: 'INVALID_RESPONSE' })
  assert.throws(() => readMfaRecoverySetup({ ...recoverySetup(), secret: 'JBSWY3DPEHPK3PXP' }), { code: 'INVALID_RESPONSE' })
})

// ------------------------------------------------------------ password policy

test('policy rules follow the live policy values, not hard-coded ones', () => {
  assert.deepEqual(unmetPolicyRules('Abcdef1!', POLICY), [])
  assert.deepEqual(unmetPolicyRules('Abcdef1!', { ...POLICY, minLength: 12 }), ['MIN_LENGTH'])
  assert.deepEqual(unmetPolicyRules('abcdefgh', { ...POLICY, requireUppercase: false, requireDigit: false, requireSpecialCharacter: false }), [])
  assert.deepEqual(policyRules({ ...POLICY, requireSpecialCharacter: false }).map((r) => r.code), ['MIN_LENGTH', 'MAX_LENGTH', 'UPPERCASE', 'LOWERCASE', 'DIGIT'])
})

test('policy checks match the backend: Unicode classes, code points, spaces as specials', () => {
  assert.deepEqual(unmetPolicyRules('abcdefg1!', POLICY), ['UPPERCASE'])
  assert.deepEqual(unmetPolicyRules('Äbcdefg1', POLICY), ['SPECIAL_CHARACTER'])
  assert.deepEqual(unmetPolicyRules('Abcdef1 x', POLICY), [], 'a space is a special character')
  assert.deepEqual(unmetPolicyRules('Abcdefg٣!', POLICY), [], 'Arabic-Indic digits are digits')
  assert.deepEqual(unmetPolicyRules('Aa1😀😀', POLICY), ['MIN_LENGTH'], 'emoji count as one code point each')
  assert.deepEqual(unmetPolicyRules('Aa1!' + 'x'.repeat(125), POLICY), ['MAX_LENGTH'])
})

test('new-password validation requires an exact confirmation and never trims', () => {
  assert.deepEqual(validateNewPassword({ newPassword: ' Abcdef1', confirmPassword: ' Abcdef1' }, POLICY), {})
  assert.equal(validateNewPassword({ newPassword: ' Abcdef1', confirmPassword: 'Abcdef1' }, POLICY).confirmPassword, 'The passwords do not match.')
  const empty = validateNewPassword({ newPassword: '', confirmPassword: '' }, POLICY)
  assert.ok(empty.newPassword && empty.confirmPassword)
  assert.match(validateNewPassword({ newPassword: 'short', confirmPassword: 'short' }, POLICY).newPassword, /too short/)
  const backend = apiError(400, 'PASSWORD_POLICY_VIOLATION', { details: [{ field: 'newPassword', message: 'UPPERCASE' }, { field: 'newPassword', message: 'DIGIT' }] })
  assert.equal(describeUnmetRules(violatedRules(backend)), 'The password does not meet the policy: it needs an uppercase letter, it needs a number.')
})

// ------------------------------------------------------------ link tokens

test('link tokens are read only from the exact #token=<43 URL-safe chars> fragment', () => {
  assert.deepEqual(readLinkToken(`#token=${LINK_TOKEN}`), { token: LINK_TOKEN, hadFragment: true })
  for (const hash of [
    `#token=${LINK_TOKEN}x`, `#token=${LINK_TOKEN.slice(1)}`, `#token=${LINK_TOKEN.replace('A', '+')}`,
    `#token=${LINK_TOKEN}&next=/x`, `#TOKEN=${LINK_TOKEN}`, `#t=${LINK_TOKEN}`, `#${LINK_TOKEN}`, '#token=',
  ]) {
    assert.deepEqual(readLinkToken(hash), { token: null, hadFragment: true }, hash)
  }
  assert.deepEqual(readLinkToken(''), { token: null, hadFragment: false })
  assert.deepEqual(readLinkToken(undefined), { token: null, hadFragment: false })
})

test('link pages match the backend link paths and are never return-to targets', () => {
  assert.deepEqual(Object.values(linkPages), ['/password/setup', '/password/reset', '/mfa/recovery'])
  assert.deepEqual([...linkTokenPaths], Object.values(linkPages))
  for (const path of [...linkTokenPaths, '/account/password']) {
    assert.equal(safeReturnTo(`${path}#token=${LINK_TOKEN}`), '/dashboard', path)
  }
  assert.equal(safeReturnTo(`/dashboard#token=${LINK_TOKEN}`), '/dashboard', 'token fragments are dropped')
  assert.equal(safeReturnTo('/demo/live-operations?tab=alerts#details'), '/demo/live-operations?tab=alerts#details')
})

// ------------------------------------------------------------ transport

function transport(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  let unauthorized = 0
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => { unauthorized += 1 } })
  return { service: createAuthService({ client }), calls, csrfStore, unauthorizedCount: () => unauthorized }
}

test('the password policy is a plain public GET', async () => {
  const t = transport(() => success(POLICY))
  assert.deepEqual(await t.service.getPasswordPolicy(), POLICY)
  assert.equal(t.calls[0].url, '/api/v1/auth/password/policy')
  assert.equal(t.calls[0].init.method, 'GET')
  assert.equal(t.calls[0].init.body, undefined)
})

test('public token operations send exact JSON bodies, no CSRF token and no token in the URL', async () => {
  const t = transport((url) => {
    if (url.endsWith('/recovery/request')) return success(ACCEPTED, 202)
    if (url.endsWith('/mfa/recovery/start')) return success(recoverySetup())
    if (url.endsWith('/mfa/recovery/confirm')) return success({ mfaRecovered: true, sessionsRevoked: 1, signInRequired: true })
    return success({ ...CHANGED, accountStatus: 'ACTIVE' })
  })
  t.csrfStore.setSessionToken(SESSION_TOKEN) // must never be attached to public requests
  const password = ' Pässwörd 1!  ' // preserved exactly
  await t.service.requestRecovery({ username: 'test.user', purpose: 'PASSWORD_RESET' })
  await t.service.completePasswordSetup({ token: LINK_TOKEN, newPassword: password })
  await t.service.completePasswordReset({ token: LINK_TOKEN, newPassword: password })
  await t.service.startMfaRecovery({ token: LINK_TOKEN, password })
  await t.service.confirmMfaRecovery({ token: LINK_TOKEN, password, code: '012345' })
  assert.deepEqual(t.calls.map((c) => c.url), [
    '/api/v1/auth/recovery/request', '/api/v1/auth/password/setup', '/api/v1/auth/password/reset',
    '/api/v1/auth/mfa/recovery/start', '/api/v1/auth/mfa/recovery/confirm',
  ])
  assert.deepEqual(t.calls.map((c) => JSON.parse(c.init.body)), [
    { username: 'test.user', purpose: 'PASSWORD_RESET' },
    { token: LINK_TOKEN, newPassword: password },
    { token: LINK_TOKEN, newPassword: password },
    { token: LINK_TOKEN, password },
    { token: LINK_TOKEN, password, code: '012345' },
  ])
  for (const call of t.calls) {
    assert.equal(call.init.method, 'POST')
    assert.equal(call.init.headers.has('X-CSRF-Token'), false)
    assert.equal(call.url.includes(LINK_TOKEN), false)
  }
})

test('public recovery 401/403 responses never invalidate a signed-in session', async () => {
  for (const [status, code] of [[401, 'RECOVERY_FAILED'], [403, 'ACCOUNT_NOT_ELIGIBLE'], [403, 'CSRF_REJECTED'], [400, 'TOKEN_INVALID']]) {
    const t = transport(() => failure(status, code, 'The recovery could not be completed.'))
    await assert.rejects(t.service.startMfaRecovery({ token: LINK_TOKEN, password: 'x' }), { code, status })
    await assert.rejects(t.service.completePasswordReset({ token: LINK_TOKEN, newPassword: 'x' }), { code })
    assert.equal(t.unauthorizedCount(), 0, code)
    assert.equal(t.calls.length, 2, 'not replayed')
  }
})

test('delivery unavailability and rate limiting keep their backend codes', async () => {
  const down = transport(() => failure(503, 'DELIVERY_UNAVAILABLE', 'Account recovery messages cannot be sent right now. Contact your administrator.'))
  await assert.rejects(down.service.requestRecovery({ username: 'x', purpose: 'PASSWORD_RESET' }), {
    code: 'DELIVERY_UNAVAILABLE', message: 'Account recovery messages cannot be sent right now. Contact your administrator.',
  })
  const limited = transport(() => failure(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {}, { 'Retry-After': '30' }))
  await assert.rejects(limited.service.requestRecovery({ username: 'x', purpose: 'PASSWORD_RESET' }), { code: 'RATE_LIMITED', retryAfterSeconds: 30 })
})

test('password change uses the session CSRF token; only a session 401 ends the session', async () => {
  const ok = transport(() => success(CHANGED))
  ok.csrfStore.setSessionToken(SESSION_TOKEN)
  await ok.service.changePassword({ currentPassword: 'Old1!pass', newPassword: 'New1!pass' })
  assert.equal(ok.calls[0].url, '/api/v1/auth/password/change')
  assert.equal(ok.calls[0].init.headers.get('X-CSRF-Token'), SESSION_TOKEN)
  assert.deepEqual(JSON.parse(ok.calls[0].init.body), { currentPassword: 'Old1!pass', newPassword: 'New1!pass' })

  const wrong = transport(() => failure(403, 'CURRENT_PASSWORD_INVALID', 'The current password is not correct'))
  await assert.rejects(wrong.service.changePassword({ currentPassword: 'x', newPassword: 'y' }), { code: 'CURRENT_PASSWORD_INVALID' })
  assert.equal(wrong.unauthorizedCount(), 0)

  const ended = transport(() => failure(401, 'UNAUTHENTICATED', 'Authentication is required'))
  await assert.rejects(ended.service.changePassword({ currentPassword: 'x', newPassword: 'y' }), { status: 401 })
  assert.equal(ended.unauthorizedCount(), 1)
})

test('unknown outcomes are distinguished from confirmed failures', () => {
  for (const error of [apiError(null, 'NETWORK_ERROR'), apiError(null, 'TIMEOUT'), apiError(200, 'INVALID_RESPONSE'), apiError(500, 'INTERNAL_ERROR')]) {
    assert.equal(isOutcomeUnknown(error), true, error.code)
  }
  for (const error of [apiError(400, 'TOKEN_INVALID'), apiError(403, 'CURRENT_PASSWORD_INVALID'), apiError(503, 'DELIVERY_UNAVAILABLE'), apiError(429, 'RATE_LIMITED')]) {
    assert.equal(isOutcomeUnknown(error), false, error.code)
  }
})

// ------------------------------------------------------------ session controller

const sessions = []

function controller({ preview = false } = {}) {
  const calls = []
  const call = (name) => (...args) => {
    const pending = deferred()
    calls.push({ name, args, ...pending })
    return pending.promise
  }
  const service = Object.fromEntries([
    'login', 'getCurrentUser', 'getCsrfToken', 'logout', 'changePassword', 'getPasswordPolicy', 'requestRecovery',
    'completePasswordSetup', 'completePasswordReset', 'startMfaRecovery', 'confirmMfaRecovery',
  ].map((name) => [name, call(name)]))
  const csrfStore = createCsrfStore()
  let emit = () => {}
  const auth = createAuthSession({
    service, csrfStore, preview,
    subscribeUnauthorized(listener) { emit = listener; return () => { emit = () => {} } },
  })
  sessions.push(auth)
  return { auth, csrfStore, calls, last: (name) => calls.filter((c) => c.name === name).at(-1), count: (name) => calls.filter((c) => c.name === name).length, emitUnauthorized: () => emit() }
}

async function signedIn(ctx) {
  ctx.auth.start()
  ctx.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  ctx.last('getCsrfToken').resolve(RESTORED_TOKEN)
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
}

async function guest(ctx) {
  ctx.auth.start()
  ctx.last('getCurrentUser').reject(apiError(401, 'UNAUTHENTICATED'))
  await tick()
}

let restoreStorage
test.beforeEach(() => { restoreStorage = forbidBrowserStorage() })
test.afterEach(() => {
  for (const auth of sessions.splice(0)) auth.stop()
  restoreStorage()
})

test('a confirmed password change ends the local session with an explanation', async () => {
  const ctx = controller()
  await signedIn(ctx)
  const pending = ctx.auth.changePassword({ currentPassword: 'Old1!pass', newPassword: 'New1!pass' })
  await assert.rejects(ctx.auth.changePassword({ currentPassword: 'a', newPassword: 'b' }), { code: 'IN_PROGRESS' })
  assert.equal(ctx.count('changePassword'), 1)
  ctx.last('changePassword').resolve(CHANGED)
  assert.deepEqual(await pending, CHANGED)
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.auth.getSnapshot().notice, 'password_changed')
  assert.equal(ctx.csrfStore.getSessionToken(), null)
})

test('a failed or unknown password change never claims session revocation', async () => {
  for (const error of [apiError(null, 'NETWORK_ERROR'), apiError(null, 'TIMEOUT'), apiError(400, 'PASSWORD_POLICY_VIOLATION'), apiError(400, 'PASSWORD_REUSED'), apiError(403, 'CSRF_REJECTED')]) {
    const ctx = controller()
    await signedIn(ctx)
    const pending = ctx.auth.changePassword({ currentPassword: 'Old1!pass', newPassword: 'New1!pass' })
    ctx.last('changePassword').reject(error)
    await assert.rejects(pending, { code: error.code })
    assert.equal(ctx.auth.getSnapshot().status, 'authenticated', error.code)
    assert.equal(ctx.auth.getSnapshot().notice, null)
    assert.equal(ctx.csrfStore.getSessionToken(), RESTORED_TOKEN)
    assert.equal(ctx.count('changePassword'), 1, 'never replayed')
  }
})

test('a wrong current password re-checks the session in case a lockout revoked it', async () => {
  const kept = controller()
  await signedIn(kept)
  const first = kept.auth.changePassword({ currentPassword: 'bad', newPassword: 'New1!pass' })
  kept.last('changePassword').reject(apiError(403, 'CURRENT_PASSWORD_INVALID'))
  await assert.rejects(first, { code: 'CURRENT_PASSWORD_INVALID' })
  assert.equal(kept.count('getCurrentUser'), 2)
  kept.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  assert.equal(kept.auth.getSnapshot().status, 'authenticated', 'no lockout: still signed in')

  const locked = controller()
  await signedIn(locked)
  const second = locked.auth.changePassword({ currentPassword: 'bad', newPassword: 'New1!pass' })
  locked.last('changePassword').reject(apiError(403, 'CURRENT_PASSWORD_INVALID'))
  await assert.rejects(second, { code: 'CURRENT_PASSWORD_INVALID' })
  locked.last('getCurrentUser').reject(apiError(401, 'UNAUTHENTICATED'))
  await tick()
  assert.equal(locked.auth.getSnapshot().notice, 'session_expired')
})

test('a late password-change success cannot overwrite a newer state', async () => {
  const ctx = controller()
  await signedIn(ctx)
  const pending = ctx.auth.changePassword({ currentPassword: 'Old1!pass', newPassword: 'New1!pass' })
  ctx.emitUnauthorized() // the session ended elsewhere meanwhile
  ctx.last('changePassword').resolve(CHANGED)
  await pending
  assert.equal(ctx.auth.getSnapshot().notice, 'session_expired')
})

test('password change needs a signed-in session', async () => {
  const ctx = controller()
  await guest(ctx)
  await assert.rejects(ctx.auth.changePassword({ currentPassword: 'a', newPassword: 'b' }), { code: 'UNAUTHENTICATED' })
  assert.equal(ctx.count('changePassword'), 0)
})

test('public operations validate locally and never touch session state on failure', async () => {
  const ctx = controller()
  await signedIn(ctx)
  await assert.rejects(ctx.auth.completePasswordReset({ token: 'short', newPassword: 'x' }), { code: 'TOKEN_INVALID' })
  await assert.rejects(ctx.auth.startMfaRecovery({ token: `${LINK_TOKEN}?`, password: 'x' }), { code: 'TOKEN_INVALID' })
  await assert.rejects(ctx.auth.confirmMfaRecovery({ token: LINK_TOKEN, password: 'x', code: '12345' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(ctx.auth.requestRecovery({ username: '  ', purpose: 'PASSWORD_RESET' }), { code: 'VALIDATION_ERROR' })
  await assert.rejects(ctx.auth.requestRecovery({ username: 'x', purpose: 'ADMIN_RESET' }), { code: 'VALIDATION_ERROR' })
  assert.equal(ctx.calls.filter((c) => !['getCurrentUser', 'getCsrfToken'].includes(c.name)).length, 0)

  const start = ctx.auth.startMfaRecovery({ token: LINK_TOKEN, password: 'x' })
  ctx.last('startMfaRecovery').reject(apiError(401, 'RECOVERY_FAILED'))
  await assert.rejects(start, { code: 'RECOVERY_FAILED' })
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
  assert.equal(ctx.count('getCurrentUser'), 1, 'no session re-check after a refused recovery')
})

test('recovery requests trim the username and keep the purpose', async () => {
  const ctx = controller()
  await guest(ctx)
  const pending = ctx.auth.requestRecovery({ username: '  test.user ', purpose: 'MFA_RECOVERY' })
  assert.deepEqual(ctx.last('requestRecovery').args[0], { username: 'test.user', purpose: 'MFA_RECOVERY' })
  ctx.last('requestRecovery').resolve(readRecoveryAccepted(ACCEPTED))
  assert.equal((await pending).accepted, true)
})

test('a completed reset or MFA recovery re-checks a signed-in session', async () => {
  const ctx = controller()
  await signedIn(ctx)
  const reset = ctx.auth.completePasswordReset({ token: LINK_TOKEN, newPassword: 'New1!pass' })
  ctx.last('completePasswordReset').resolve(CHANGED)
  await reset
  ctx.last('getCurrentUser').reject(apiError(401, 'UNAUTHENTICATED'))
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')

  const other = controller()
  await guest(other)
  const recover = other.auth.confirmMfaRecovery({ token: LINK_TOKEN, password: 'x', code: '000123' })
  other.last('confirmMfaRecovery').resolve({ mfaRecovered: true, sessionsRevoked: 1, signInRequired: true })
  await recover
  assert.equal(other.count('getCurrentUser'), 1, 'a signed-out browser is not re-checked')

  const setup = controller()
  await signedIn(setup)
  const done = setup.auth.completePasswordSetup({ token: LINK_TOKEN, newPassword: 'New1!pass' })
  setup.last('completePasswordSetup').resolve(CHANGED)
  await done
  assert.equal(setup.auth.getSnapshot().status, 'authenticated', 'setup activates another account; this session is untouched')
})

test('preview cannot run any password or recovery operation', async () => {
  const ctx = controller({ preview: true })
  await assert.rejects(ctx.auth.getPasswordPolicy(), { code: 'PREVIEW_MODE' })
  await assert.rejects(ctx.auth.requestRecovery({ username: 'x', purpose: 'PASSWORD_RESET' }), { code: 'PREVIEW_MODE' })
  await assert.rejects(ctx.auth.completePasswordSetup({ token: LINK_TOKEN, newPassword: 'x' }), { code: 'PREVIEW_MODE' })
  await assert.rejects(ctx.auth.changePassword({ currentPassword: 'a', newPassword: 'b' }), { code: 'PREVIEW_MODE' })
  assert.equal(ctx.calls.length, 0)
})

// ------------------------------------------------------------ static safeguards

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('link pages strip the fragment with history replacement and reuse the Batch B MFA components', async () => {
  const hook = await read('../src/features/auth/useLinkToken.js')
  assert.match(hook, /navigate\(\{ pathname: location\.pathname, search: location\.search \}, \{ replace: true, state: null \}\)/)
  const recovery = await read('../src/pages/auth/MfaRecoveryPage.jsx')
  assert.match(recovery, /import \{ AuthenticatorSetup, MfaCodeInput \} from '@\/features\/auth\/MfaFields\.jsx'/)
  assert.match(recovery, /const forget = \(\) => \{\s*setPassword\(''\)\s*setMaterial\(null\)\s*setCode\(''\)/)
  const router = await read('../src/app/router.jsx')
  for (const path of ['password/setup', 'password/reset', 'mfa/recovery', 'account/password']) assert.ok(router.includes(`'${path}'`), path)
})

test('the forgot-password page asks for a username and offers only backend purposes', async () => {
  const page = await read('../src/pages/auth/ForgotPasswordPage.jsx')
  assert.match(page, /id="recovery-username"/)
  assert.equal(/type="email"/.test(page), false)
  assert.deepEqual([...page.matchAll(/'(PASSWORD_RESET|MFA_RECOVERY|[A-Z_]+_RESET|[A-Z_]+_RECOVERY)'/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).sort(), ['MFA_RECOVERY', 'PASSWORD_RESET'])
})

test('auth source never logs, stores or remotely renders sensitive values', async () => {
  for (const dir of ['../src/features/auth/', '../src/pages/auth/', '../src/services/api/']) {
    const base = new URL(dir, import.meta.url)
    for (const name of await readdir(base)) {
      const source = await readFile(new URL(name, base), 'utf8')
      for (const pattern of [/console\./, /localStorage|sessionStorage|indexedDB|document\.cookie/, /dangerouslySetInnerHTML/, /qrserver|chart\.googleapis|quickchart/i]) {
        assert.equal(pattern.test(source), false, `${dir}${name} matches ${pattern}`)
      }
    }
  }
})
