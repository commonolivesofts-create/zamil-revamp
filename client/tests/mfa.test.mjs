import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { createAuthService } from '../src/features/auth/authService.js'
import { createAuthSession } from '../src/features/auth/authSession.js'
import {
  readCurrentUser, readLoginResult, readMfaEnrollment, readMfaReplacementResult, readMfaSignIn,
} from '../src/features/auth/authContract.js'
import { authenticatorQr, formatSetupKey } from '../src/features/auth/authenticatorQr.js'
import { mfaChallengePath, safeReturnTo, templateDemosAvailable } from '../src/config/authRouting.js'
import { orvexaDemoRoutes } from '../src/config/orvexaRoutes.js'
import {
  CHALLENGE_TOKEN, RESTORED_TOKEN, SESSION_TOKEN, SETUP_SECRET, currentUser, deferred, enrollmentMaterial,
  failure, forbidBrowserStorage, loginResult, mfaChallenge, recordingFetch, success,
} from './helpers/http.mjs'

const NOW = Date.parse('2026-10-21T08:00:00.000Z') // Fixture challenges expire at 08:10:00Z.
const tick = () => new Promise((resolve) => setImmediate(resolve))
const apiError = (status, code) => new ApiError(code, { code, status })

// ---------------------------------------------------------------- contracts

test('MFA sign-in accepts only an authenticated result', () => {
  assert.equal(readMfaSignIn(loginResult()).csrfToken, SESSION_TOKEN)
  assert.throws(() => readMfaSignIn(mfaChallenge()), { code: 'INVALID_RESPONSE' })
})

test('setup material is validated and its QR URI must carry the shown secret', () => {
  const material = readMfaEnrollment(enrollmentMaterial({ extra: 'dropped' }))
  assert.equal(material.secret, SETUP_SECRET)
  assert.equal('extra' in material, false)
  for (const overrides of [
    { otpauthUri: enrollmentMaterial().otpauthUri.replace(SETUP_SECRET, 'JBSWY3DPEHPK3PXP') },
    { otpauthUri: 'otpauth://hotp/x?secret=' + SETUP_SECRET },
    { otpauthUri: 'https://evil.example/?secret=' + SETUP_SECRET },
    { secret: SETUP_SECRET.toLowerCase() },
    { digits: 8 },
    { algorithm: 'SHA256' },
    { expiresAt: 'later' },
  ]) {
    assert.throws(() => readMfaEnrollment(enrollmentMaterial(overrides)), { code: 'INVALID_RESPONSE' }, JSON.stringify(overrides))
  }
})

test('replacement results must require re-authentication', () => {
  assert.deepEqual(readMfaReplacementResult({ replaced: true, sessionsRevoked: 3, reauthenticationRequired: true }),
    { replaced: true, sessionsRevoked: 3, reauthenticationRequired: true })
  assert.throws(() => readMfaReplacementResult({ replaced: true, sessionsRevoked: 1, reauthenticationRequired: false }), { code: 'INVALID_RESPONSE' })
})

// ---------------------------------------------------------------- transport

function transport(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  let unauthorized = 0
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => { unauthorized += 1 } })
  return { service: createAuthService({ client }), calls, csrfStore, unauthorizedCount: () => unauthorized }
}

test('challenge endpoints send the code as a string with the challenge CSRF token only', async () => {
  const t = transport((url) => url.endsWith('/mfa/enrollment') ? success(enrollmentMaterial()) : success(loginResult()))
  t.csrfStore.setChallengeToken(CHALLENGE_TOKEN)
  await t.service.verifyMfa('012345')
  await t.service.startMfaEnrollment()
  await t.service.confirmMfaEnrollment('000001')
  assert.deepEqual(t.calls.map((c) => c.url), ['/api/v1/auth/mfa/verify', '/api/v1/auth/mfa/enrollment', '/api/v1/auth/mfa/enrollment/confirm'])
  assert.equal(t.calls[0].init.body, '{"code":"012345"}', 'leading zero preserved')
  assert.equal(t.calls[1].init.body, '{}')
  assert.equal(t.calls[2].init.body, '{"code":"000001"}')
  for (const call of t.calls) assert.equal(call.init.headers.get('X-CSRF-Token'), CHALLENGE_TOKEN)
})

test('challenge 401s never invalidate a session', async () => {
  const t = transport(() => failure(401, 'MFA_VERIFICATION_FAILED', 'The verification code is incorrect, expired or already used.'))
  t.csrfStore.setChallengeToken(CHALLENGE_TOKEN)
  await assert.rejects(t.service.verifyMfa('123456'), { code: 'MFA_VERIFICATION_FAILED', status: 401 })
  assert.equal(t.unauthorizedCount(), 0)
})

test('replacement endpoints use the session CSRF token; only the start call reports session 401s', async () => {
  const ok = transport((url) => url.endsWith('/confirm')
    ? success({ replaced: true, sessionsRevoked: 2, reauthenticationRequired: true })
    : success(enrollmentMaterial()))
  ok.csrfStore.setSessionToken(SESSION_TOKEN)
  await ok.service.startMfaReplacement()
  await ok.service.confirmMfaReplacement('654321')
  assert.deepEqual(ok.calls.map((c) => c.url), ['/api/v1/auth/mfa/replacement', '/api/v1/auth/mfa/replacement/confirm'])
  for (const call of ok.calls) assert.equal(call.init.headers.get('X-CSRF-Token'), SESSION_TOKEN)

  const gone = transport(() => failure(401, 'UNAUTHENTICATED', 'Authentication is required'))
  await assert.rejects(gone.service.startMfaReplacement(), { status: 401 })
  assert.equal(gone.unauthorizedCount(), 1)
  await assert.rejects(gone.service.confirmMfaReplacement('654321'), { status: 401 })
  assert.equal(gone.unauthorizedCount(), 1, 'confirm 401 is decided by the session controller')
})

// ---------------------------------------------------------------- session controller

const sessions = []

function controller({ preview = false } = {}) {
  const calls = []
  const call = (name) => (...args) => {
    const pending = deferred()
    calls.push({ name, args, ...pending })
    return pending.promise
  }
  const service = Object.fromEntries([
    'login', 'getCurrentUser', 'getCsrfToken', 'logout', 'verifyMfa', 'startMfaEnrollment',
    'confirmMfaEnrollment', 'startMfaReplacement', 'confirmMfaReplacement',
  ].map((name) => [name, call(name)]))
  const csrfStore = createCsrfStore()
  let emit = () => {}
  const auth = createAuthSession({
    service, csrfStore, preview,
    subscribeUnauthorized(listener) { emit = listener; return () => { emit = () => {} } },
  })
  sessions.push(auth)
  return { auth, csrfStore, calls, last: (name) => calls.filter((c) => c.name === name).at(-1), emitUnauthorized: () => emit() }
}

async function challenged(ctx, challenge = mfaChallenge()) {
  if (ctx.auth.getSnapshot().status === 'loading') {
    ctx.auth.start()
    ctx.last('getCurrentUser').reject(apiError(401, 'UNAUTHENTICATED'))
    await tick()
  }
  const pending = ctx.auth.signIn({ username: 'zaid', password: 'secret' })
  ctx.last('login').resolve(readLoginResult(challenge))
  assert.equal(await pending, 'mfa_required')
}

async function signedIn(ctx) {
  ctx.auth.start()
  ctx.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  ctx.last('getCsrfToken').resolve(RESTORED_TOKEN)
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
}

let restoreStorage
test.beforeEach(() => {
  restoreStorage = forbidBrowserStorage()
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW })
})
test.afterEach(() => {
  for (const auth of sessions.splice(0)) auth.stop()
  mock.timers.reset()
  restoreStorage()
})

test('a verified code creates the session and ends the challenge', async () => {
  const ctx = controller()
  await challenged(ctx)
  const pending = ctx.auth.verifyMfa('012345')
  assert.equal(ctx.last('verifyMfa').args[0], '012345')
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required', 'no access before the backend verifies')
  ctx.last('verifyMfa').resolve(readMfaSignIn(loginResult()))
  assert.equal(await pending, 'authenticated')
  assert.equal(ctx.auth.getSnapshot().user.id, '105')
  assert.equal(ctx.csrfStore.getSessionToken(), SESSION_TOKEN)
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
  mock.timers.tick(600_000)
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated', 'the old challenge timer cannot end the session')
})

test('a wrong code keeps the challenge and its token', async () => {
  const ctx = controller()
  await challenged(ctx)
  const pending = ctx.auth.verifyMfa('111111')
  ctx.last('verifyMfa').reject(apiError(401, 'MFA_VERIFICATION_FAILED'))
  await assert.rejects(pending, { code: 'MFA_VERIFICATION_FAILED' })
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required')
  assert.equal(ctx.csrfStore.getChallengeToken(), CHALLENGE_TOKEN)
})

test('MFA_CHALLENGE_INVALID ends the challenge', async () => {
  const ctx = controller()
  await challenged(ctx)
  const pending = ctx.auth.verifyMfa('111111')
  ctx.last('verifyMfa').reject(apiError(401, 'MFA_CHALLENGE_INVALID'))
  await assert.rejects(pending, { code: 'MFA_CHALLENGE_INVALID' })
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.auth.getSnapshot().notice, 'mfa_invalid')
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
})

test('codes are validated locally and duplicate submissions are refused', async () => {
  const ctx = controller()
  await assert.rejects(ctx.auth.verifyMfa('123456'), { code: 'MFA_CHALLENGE_INVALID' }, 'no challenge yet')
  await challenged(ctx)
  for (const code of ['12345', '1234567', '12a456', 123456, ' 123456']) {
    await assert.rejects(ctx.auth.verifyMfa(code), { code: 'VALIDATION_ERROR' }, String(code))
  }
  const first = ctx.auth.verifyMfa('000123')
  await assert.rejects(ctx.auth.verifyMfa('000123'), { code: 'IN_PROGRESS' })
  assert.equal(ctx.calls.filter((c) => c.name === 'verifyMfa').length, 1)
  ctx.last('verifyMfa').resolve(readMfaSignIn(loginResult()))
  assert.equal(await first, 'authenticated')
})

test('a verification response after the challenge expired is ignored', async () => {
  const ctx = controller()
  await challenged(ctx)
  const pending = ctx.auth.verifyMfa('123456')
  const request = ctx.last('verifyMfa')
  mock.timers.tick(600_000)
  assert.equal(ctx.auth.getSnapshot().notice, 'mfa_expired')
  assert.equal(request.args[1].signal.aborted, true)
  request.resolve(readMfaSignIn(loginResult()))
  await assert.rejects(pending, { code: 'ABORTED' })
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.csrfStore.getSessionToken(), null)
})

test('a late verification for a cancelled challenge cannot sign in a newer challenge', async () => {
  const ctx = controller()
  await challenged(ctx)
  const stale = ctx.auth.verifyMfa('123456')
  const staleRequest = ctx.last('verifyMfa')
  ctx.auth.cancelMfa()
  await challenged(ctx)
  staleRequest.resolve(readMfaSignIn(loginResult()))
  await assert.rejects(stale, { code: 'ABORTED' })
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required')
  assert.equal(ctx.csrfStore.getChallengeToken(), CHALLENGE_TOKEN)
})

test('Batch A check C: an expired challenge timer cannot end a newer challenge', async () => {
  const ctx = controller()
  await challenged(ctx)
  mock.timers.tick(300_000)
  // A second sign-in five minutes later; its challenge expires at 08:15:00Z.
  await challenged(ctx, mfaChallenge({ mfa: { required: true, enrollmentRequired: false, expiresAt: '2026-10-21T08:15:00.000Z' } }))
  mock.timers.tick(300_000)
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required', 'first challenge expiry passed harmlessly')
  assert.equal(ctx.csrfStore.getChallengeToken(), CHALLENGE_TOKEN)
  mock.timers.tick(300_000)
  assert.equal(ctx.auth.getSnapshot().notice, 'mfa_expired')
})

test('conflicts route between enrollment and verification', async () => {
  const ctx = controller()
  await challenged(ctx)
  const verify = ctx.auth.verifyMfa('123456')
  ctx.last('verifyMfa').reject(apiError(409, 'MFA_ENROLLMENT_REQUIRED'))
  await assert.rejects(verify, { code: 'MFA_ENROLLMENT_REQUIRED' })
  assert.equal(ctx.auth.getSnapshot().mfa.enrollmentRequired, true)
  assert.equal(mfaChallengePath(ctx.auth.getSnapshot().mfa), '/mfa/enroll')

  const start = ctx.auth.startMfaEnrollment()
  ctx.last('startMfaEnrollment').reject(apiError(409, 'MFA_ALREADY_ENROLLED'))
  await assert.rejects(start, { code: 'MFA_ALREADY_ENROLLED' })
  assert.equal(mfaChallengePath(ctx.auth.getSnapshot().mfa), '/mfa/verify')
  mock.timers.tick(600_000)
  assert.equal(ctx.auth.getSnapshot().notice, 'mfa_expired', 'the challenge timer survives the conflict update')
})

test('enrollment returns setup material to the page without storing it in auth state', async () => {
  const ctx = controller()
  await challenged(ctx, mfaChallenge({ mfa: { required: true, enrollmentRequired: true, expiresAt: '2026-10-21T08:10:00.000Z' } }))
  const start = ctx.auth.startMfaEnrollment()
  ctx.last('startMfaEnrollment').resolve(readMfaEnrollment(enrollmentMaterial()))
  assert.equal((await start).secret, SETUP_SECRET)
  assert.equal(JSON.stringify(ctx.auth.getSnapshot()).includes(SETUP_SECRET), false)

  const confirm = ctx.auth.confirmMfaEnrollment('000000')
  ctx.last('confirmMfaEnrollment').resolve(readMfaSignIn(loginResult()))
  assert.equal(await confirm, 'authenticated')
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
})

test('setup material from an ended challenge is discarded', async () => {
  const ctx = controller()
  await challenged(ctx, mfaChallenge({ mfa: { required: true, enrollmentRequired: true, expiresAt: '2026-10-21T08:10:00.000Z' } }))
  const start = ctx.auth.startMfaEnrollment()
  ctx.auth.cancelMfa()
  ctx.last('startMfaEnrollment').resolve(readMfaEnrollment(enrollmentMaterial()))
  await assert.rejects(start, { code: 'ABORTED' })
})

test('replacement requires a session and ends it after backend confirmation', async () => {
  const ctx = controller()
  await challenged(ctx)
  await assert.rejects(ctx.auth.startMfaReplacement(), { code: 'UNAUTHENTICATED' }, 'an MFA challenge is not a session')
  ctx.auth.cancelMfa()
  ctx.auth.stop()

  const signed = controller()
  await signedIn(signed)
  const start = signed.auth.startMfaReplacement()
  signed.last('startMfaReplacement').resolve(readMfaEnrollment(enrollmentMaterial()))
  assert.equal((await start).secret, SETUP_SECRET)

  const wrong = signed.auth.confirmMfaReplacement('111111')
  signed.last('confirmMfaReplacement').reject(apiError(401, 'MFA_VERIFICATION_FAILED'))
  await assert.rejects(wrong, { code: 'MFA_VERIFICATION_FAILED' })
  assert.equal(signed.auth.getSnapshot().status, 'authenticated', 'a wrong code does not end the session')

  const confirm = signed.auth.confirmMfaReplacement('222222')
  signed.last('confirmMfaReplacement').resolve({ replaced: true, sessionsRevoked: 2, reauthenticationRequired: true })
  await confirm
  assert.equal(signed.auth.getSnapshot().status, 'guest')
  assert.equal(signed.auth.getSnapshot().notice, 'mfa_replaced')
  assert.equal(signed.csrfStore.getSessionToken(), null)
})

test('replacement refusals keep the session; a session 401 ends it', async () => {
  const ctx = controller()
  await signedIn(ctx)
  const recent = ctx.auth.startMfaReplacement()
  ctx.last('startMfaReplacement').reject(apiError(403, 'MFA_RECENT_VERIFICATION_REQUIRED'))
  await assert.rejects(recent, { code: 'MFA_RECENT_VERIFICATION_REQUIRED' })
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')

  const csrf = ctx.auth.confirmMfaReplacement('123456')
  ctx.last('confirmMfaReplacement').reject(apiError(403, 'CSRF_REJECTED'))
  await assert.rejects(csrf, { code: 'CSRF_REJECTED' })
  assert.equal(ctx.calls.filter((c) => c.name === 'confirmMfaReplacement').length, 1, 'never replayed')

  const ended = ctx.auth.confirmMfaReplacement('123456')
  ctx.last('confirmMfaReplacement').reject(apiError(401, 'UNAUTHENTICATED'))
  await assert.rejects(ended, { status: 401 })
  assert.equal(ctx.auth.getSnapshot().notice, 'session_expired')
})

test('preview cannot run MFA operations', async () => {
  const ctx = controller({ preview: true })
  await assert.rejects(ctx.auth.verifyMfa('123456'), { code: 'PREVIEW_MODE' })
  await assert.rejects(ctx.auth.startMfaReplacement(), { code: 'PREVIEW_MODE' })
  assert.equal(ctx.calls.length, 0)
})

test('end to end: login challenge, verify with the challenge token, then session writes use the session token', async () => {
  const { fetchImpl, calls } = recordingFetch((url) => {
    if (url.endsWith('/auth/me')) return failure(401, 'UNAUTHENTICATED', 'Authentication is required')
    if (url.endsWith('/auth/login')) return success(mfaChallenge())
    if (url.endsWith('/auth/mfa/verify')) return success(loginResult())
    return success(enrollmentMaterial())
  })
  const csrfStore = createCsrfStore()
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  const auth = createAuthSession({ service: createAuthService({ client }), csrfStore, subscribeUnauthorized: () => () => {} })
  sessions.push(auth)
  await auth.restore()
  assert.equal(await auth.signIn({ username: 'zaid', password: 'secret' }), 'mfa_required')
  assert.equal(await auth.verifyMfa('098765'), 'authenticated')
  await auth.startMfaReplacement()
  const [, login, verify, replace] = calls
  assert.equal(login.init.headers.has('X-CSRF-Token'), false)
  assert.equal(verify.init.headers.get('X-CSRF-Token'), CHALLENGE_TOKEN)
  assert.equal(replace.init.headers.get('X-CSRF-Token'), SESSION_TOKEN)
})

// ---------------------------------------------------------------- QR, routing, boundaries

test('the authenticator QR is generated locally and deterministically', () => {
  const uri = enrollmentMaterial().otpauthUri
  const qr = authenticatorQr(uri)
  assert.ok(qr.size >= 21)
  assert.match(qr.path, /^(M\d+ \d+h1v1h-1z)+$/)
  assert.deepEqual(authenticatorQr(uri), qr)
  assert.equal(authenticatorQr('https://example.invalid'), null)
  assert.equal(formatSetupKey('ABCDEFGHIJ'), 'ABCD EFGH IJ')
})

test('MFA pages are never post-login destinations', () => {
  assert.equal(safeReturnTo('/mfa/verify'), '/dashboard')
  assert.equal(safeReturnTo('/mfa/enroll?x=1'), '/dashboard')
  assert.equal(mfaChallengePath({ enrollmentRequired: false }), '/mfa/verify')
})

test('after an authenticator replacement, signing in again lands on the dashboard', () => {
  // ProtectedRoute stores safeReturnTo(current path) as the post-login destination.
  for (const from of ['/account/authenticator', '/account/authenticator?step=2', '/account/authenticator#key']) {
    assert.equal(safeReturnTo(from), '/dashboard', from)
  }
  assert.equal(safeReturnTo('/account/authenticator-history'), '/account/authenticator-history', 'exact path only')
  assert.equal(safeReturnTo('//evil.example/account/authenticator'), '/dashboard', 'open-redirect protection kept')
})

test('template demos render only in the development preview', async () => {
  assert.equal(templateDemosAvailable('preview'), true)
  for (const status of ['authenticated', 'guest', 'loading', 'error', 'mfa_required', undefined]) {
    assert.equal(templateDemosAvailable(status), false, String(status))
  }
  const router = await readFile(new URL('../src/app/router.jsx', import.meta.url), 'utf8')
  assert.match(router, /element: <TemplateDemoRoute \/>,\s*children: orvexaDemoRoutes\.map/)
  const guards = await readFile(new URL('../src/routes/RouteGuards.jsx', import.meta.url), 'utf8')
  // Stage 4: real sessions get the ordinary not-found page (no template notice).
  assert.match(guards, /templateDemosAvailable\(status\) \? <Outlet \/> : <NotFoundPage \/>/)
})

// V 2.1.0: the heading uses the official product name from appConfig (Zamil Digitalization).
test('the login heading names the application', async () => {
  const login = await readFile(new URL('../src/pages/auth/LoginPage.jsx', import.meta.url), 'utf8')
  assert.match(login, /<h2>Sign in to \{appConfig\.name\}<\/h2>/)
  assert.equal(login.includes('Sign in to Orvexa'), false)
})

test('Batch A check A: template demo routes stay in the /demo namespace as unconverted notices', async () => {
  assert.ok(orvexaDemoRoutes.every((route) => route.path.startsWith('/demo/')))
  const router = await readFile(new URL('../src/app/router.jsx', import.meta.url), 'utf8')
  assert.match(router, /orvexaDemoRoutes\.map\(\(\{ path \}\) => \(\{ path: path\.slice\(1\), element: <DemoPage \/> \}\)\)/)
  const pages = await readFile(new URL('../src/pages/PhasePages.jsx', import.meta.url), 'utf8')
  assert.match(pages, /Template demo · not yet converted/)
})

test('MFA code never logs secrets or uses a remote QR service; uqr is pinned', async () => {
  const dirs = ['../src/features/auth/', '../src/pages/auth/']
  for (const dir of dirs) {
    const base = new URL(dir, import.meta.url)
    for (const name of await readdir(base)) {
      const source = await readFile(new URL(name, base), 'utf8')
      assert.equal(/console\./.test(source), false, `${dir}${name} logs`)
      assert.equal(/qrserver|chart\.googleapis|quickchart|qrcode\.|<img/i.test(source), false, `${dir}${name} remote QR`)
      assert.equal(/dangerouslySetInnerHTML/.test(source), false, `${dir}${name} raw HTML`)
    }
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.dependencies.uqr, '0.1.3')
  // Lockfile pins the exact registry tarball and its verified integrity.
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const entry = lock.packages['node_modules/uqr']
  assert.equal(entry.version, '0.1.3')
  assert.equal(entry.resolved, 'https://registry.npmjs.org/uqr/-/uqr-0.1.3.tgz')
  assert.equal(entry.integrity, 'sha512-0rjE8iEJe4YmT9TOhwsZtqCMRLc5DXZUI2UEYUUg63ikBkqqE5EYWaI0etFe/5KUcmcYwLih2RND1kq+hrUJXA==')
  assert.equal(entry.license, 'MIT')
  assert.equal(entry.dependencies, undefined)
  assert.equal(entry.hasInstallScript, undefined)
})
