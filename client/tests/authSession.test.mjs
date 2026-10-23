import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { createAuthService } from '../src/features/auth/authService.js'
import { createAuthSession } from '../src/features/auth/authSession.js'
import { readCurrentUser, readLoginResult } from '../src/features/auth/authContract.js'
import {
  CHALLENGE_TOKEN, RESTORED_TOKEN, SESSION_TOKEN, currentUser, deferred, failure,
  forbidBrowserStorage, loginResult, mfaChallenge, noContent, recordingFetch, success,
} from './helpers/http.mjs'

// A controllable fake service: every call is pending until the test settles it.
function fakeService() {
  const calls = []
  const call = (name) => (...args) => {
    const pending = deferred()
    calls.push({ name, args, ...pending })
    return pending.promise
  }
  return {
    calls,
    last: (name) => calls.filter((item) => item.name === name).at(-1),
    service: {
      login: call('login'),
      getCurrentUser: call('getCurrentUser'),
      getCsrfToken: call('getCsrfToken'),
      logout: call('logout'),
    },
  }
}

// Every session is stopped after its test so no challenge-expiry timer outlives it.
const sessions = []

function setup({ preview = false } = {}) {
  const fake = fakeService()
  const csrfStore = createCsrfStore()
  let emitUnauthorized = () => {}
  const auth = createAuthSession({
    service: fake.service,
    csrfStore,
    preview,
    subscribeUnauthorized(listener) {
      emitUnauthorized = listener
      return () => { emitUnauthorized = () => {} }
    },
  })
  sessions.push(auth)
  return { auth, fake, csrfStore, emitUnauthorized: () => emitUnauthorized() }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
const unauthenticated = () => new ApiError('Authentication is required', { code: 'UNAUTHENTICATED', status: 401 })

async function authenticate(ctx) {
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  ctx.fake.last('getCsrfToken').resolve(RESTORED_TOKEN)
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
}

let restoreStorage
test.beforeEach(() => { restoreStorage = forbidBrowserStorage() })
test.afterEach(() => {
  restoreStorage()
  for (const auth of sessions.splice(0)) auth.stop()
})

test('reload restores the session through /auth/me then /auth/csrf', async () => {
  const ctx = setup()
  assert.equal(ctx.auth.getSnapshot().status, 'loading')
  ctx.auth.start()
  assert.equal(ctx.fake.calls.length, 1, 'CSRF is requested only after the session is confirmed')
  ctx.fake.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  assert.equal(ctx.fake.calls[1].name, 'getCsrfToken')
  assert.equal(ctx.auth.getSnapshot().status, 'loading')
  ctx.fake.last('getCsrfToken').resolve(RESTORED_TOKEN)
  await tick()
  const state = ctx.auth.getSnapshot()
  assert.equal(state.status, 'authenticated')
  assert.equal(state.user.fullName, 'Test User')
  assert.equal(ctx.csrfStore.getSessionToken(), RESTORED_TOKEN)
})

test('restoration without a session becomes guest; other failures become a retryable error', async () => {
  const anonymous = setup()
  anonymous.auth.start()
  anonymous.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  assert.equal(anonymous.auth.getSnapshot().status, 'guest')
  assert.equal(anonymous.csrfStore.getSessionToken(), null)

  const csrfGone = setup()
  csrfGone.auth.start()
  csrfGone.fake.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  csrfGone.fake.last('getCsrfToken').reject(unauthenticated())
  await tick()
  assert.equal(csrfGone.auth.getSnapshot().status, 'guest')

  const down = setup()
  down.auth.start()
  // A non-transient failure is not retried automatically (see authReliability.test.mjs).
  down.fake.last('getCurrentUser').reject(new ApiError('failed', { code: 'INTERNAL_ERROR', status: 500 }))
  await tick()
  assert.equal(down.auth.getSnapshot().status, 'error')
  const retry = down.auth.restore()
  assert.equal(down.auth.getSnapshot().status, 'loading')
  down.fake.last('getCurrentUser').resolve(readCurrentUser(currentUser()))
  await tick()
  down.fake.last('getCsrfToken').resolve(RESTORED_TOKEN)
  await retry
  assert.equal(down.auth.getSnapshot().status, 'authenticated')
})

test('Strict Mode cleanup aborts the first restore and ignores its late response', async () => {
  const ctx = setup()
  const stop = ctx.auth.start()
  const first = ctx.fake.last('getCurrentUser')
  stop()
  assert.equal(first.args[0].signal.aborted, true)
  ctx.auth.start()
  first.resolve(readCurrentUser(currentUser()))
  await tick()
  assert.equal(ctx.fake.calls.filter((c) => c.name === 'getCsrfToken').length, 0, 'stale restore must not continue')
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
})

test('a late restore response cannot re-authenticate after logout', async () => {
  const ctx = setup()
  ctx.auth.start()
  const restore = ctx.fake.last('getCurrentUser')
  const signOut = ctx.auth.signOut()
  ctx.fake.last('logout').resolve()
  await signOut
  restore.resolve(readCurrentUser(currentUser()))
  await tick()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.csrfStore.getSessionToken(), null)
})

test('a successful login becomes authenticated with the session CSRF token in memory', async () => {
  const ctx = setup()
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const pending = ctx.auth.signIn({ username: 'test.user', password: 'secret' })
  assert.equal(ctx.auth.getSnapshot().status, 'guest', 'login route stays mounted while signing in')
  ctx.fake.last('login').resolve(readLoginResult(loginResult()))
  assert.equal(await pending, 'authenticated')
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
  assert.equal(ctx.csrfStore.getSessionToken(), SESSION_TOKEN)
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
})

test('an MFA challenge is pending, never authenticated', async () => {
  const ctx = setup()
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const pending = ctx.auth.signIn({ username: 'zaid', password: 'secret' })
  ctx.fake.last('login').resolve(readLoginResult(mfaChallenge()))
  assert.equal(await pending, 'mfa_required')
  const state = ctx.auth.getSnapshot()
  assert.equal(state.status, 'mfa_required')
  assert.equal(state.user, null)
  assert.equal(state.session, null)
  assert.equal(state.mfa.enrollmentRequired, false)
  assert.equal(ctx.csrfStore.getSessionToken(), null)
  assert.equal(ctx.csrfStore.getChallengeToken(), CHALLENGE_TOKEN)

  ctx.emitUnauthorized()
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required', 'a session 401 does not affect a challenge')
  ctx.auth.cancelMfa()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
})

async function challenged(ctx) {
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const pending = ctx.auth.signIn({ username: 'zaid', password: 'secret' })
  // Fixture challenge expires at 08:10:00Z, ten minutes after the mocked clock.
  ctx.fake.last('login').resolve(readLoginResult(mfaChallenge()))
  assert.equal(await pending, 'mfa_required')
}

test('the challenge CSRF token stays in memory until the challenge expires', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-21T08:00:00.000Z') })
  t.after(() => mock.timers.reset())
  const ctx = setup()
  await challenged(ctx)
  mock.timers.tick(599_999)
  ctx.emitUnauthorized()
  assert.equal(ctx.auth.getSnapshot().status, 'mfa_required')
  assert.equal(ctx.csrfStore.getChallengeToken(), CHALLENGE_TOKEN)
  mock.timers.tick(1)
  const state = ctx.auth.getSnapshot()
  assert.equal(state.status, 'guest')
  assert.equal(state.notice, 'mfa_expired')
  assert.equal(ctx.csrfStore.getChallengeToken(), null)
})

test('an ended challenge cannot expire into a later session', async (t) => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-21T08:00:00.000Z') })
  t.after(() => mock.timers.reset())
  const ctx = setup()
  await challenged(ctx)
  const pending = ctx.auth.signIn({ username: 'test.user', password: 'secret' })
  assert.equal(ctx.csrfStore.getChallengeToken(), null, 'a new sign-in ends the challenge')
  ctx.fake.last('login').resolve(readLoginResult(loginResult()))
  assert.equal(await pending, 'authenticated')
  mock.timers.tick(600_000)
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
  assert.equal(ctx.csrfStore.getSessionToken(), SESSION_TOKEN)
})

test('a failed login returns to guest and preserves the backend error', async () => {
  const ctx = setup()
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const pending = ctx.auth.signIn({ username: 'x', password: 'y' })
  ctx.fake.last('login').reject(new ApiError('Sign-in failed.', { code: 'AUTHENTICATION_FAILED', status: 401 }))
  await assert.rejects(pending, { code: 'AUTHENTICATION_FAILED' })
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
})

test('an unrelated session 401 does not abort an in-flight login', async () => {
  const ctx = setup()
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const pending = ctx.auth.signIn({ username: 'test.user', password: 'secret' })
  const login = ctx.fake.last('login')
  ctx.emitUnauthorized()
  assert.equal(login.args[1].signal.aborted, false)
  login.resolve(readLoginResult(loginResult()))
  assert.equal(await pending, 'authenticated')
})

test('a superseded login result is discarded', async () => {
  const ctx = setup()
  ctx.auth.start()
  ctx.fake.last('getCurrentUser').reject(unauthenticated())
  await tick()
  const first = ctx.auth.signIn({ username: 'a', password: 'a' })
  const firstCall = ctx.fake.last('login')
  const second = ctx.auth.signIn({ username: 'b', password: 'b' })
  firstCall.resolve(readLoginResult(loginResult()))
  await assert.rejects(first, { code: 'ABORTED' })
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  ctx.fake.last('login').resolve(readLoginResult(mfaChallenge()))
  assert.equal(await second, 'mfa_required')
})

test('a session 401 ends an authenticated session and clears its CSRF token', async () => {
  const ctx = setup()
  await authenticate(ctx)
  ctx.emitUnauthorized()
  const state = ctx.auth.getSnapshot()
  assert.equal(state.status, 'guest')
  assert.equal(state.notice, 'session_expired')
  assert.equal(state.user, null)
  assert.equal(ctx.csrfStore.getSessionToken(), null)
})

test('logout: 204 and 401 are confirmed; other failures clear locally without claiming revocation', async () => {
  for (const [settle, confirmed] of [
    [(call) => call.resolve(), true],
    [(call) => call.reject(unauthenticated()), true],
    [(call) => call.reject(new ApiError('offline', { code: 'NETWORK_ERROR' })), false],
    [(call) => call.reject(new ApiError('bad', { code: 'CSRF_REJECTED', status: 403 })), false],
    [(call) => call.reject(new ApiError('down', { code: 'HTTP_ERROR', status: 503 })), false],
  ]) {
    const ctx = setup()
    await authenticate(ctx)
    const pending = ctx.auth.signOut()
    settle(ctx.fake.last('logout'))
    const outcome = await pending
    assert.equal(outcome.serverConfirmed, confirmed)
    const state = ctx.auth.getSnapshot()
    assert.equal(state.status, 'guest')
    assert.equal(state.user, null)
    assert.equal(state.notice, confirmed ? null : 'signout_unconfirmed')
    assert.equal(ctx.csrfStore.getSessionToken(), null)
    assert.equal(ctx.fake.calls.filter((c) => c.name === 'logout').length, 1, 'logout is never replayed')
  }
})

test('development preview never contacts the backend and cannot sign in', async () => {
  const ctx = setup({ preview: true })
  ctx.auth.start()
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'preview')
  assert.equal(ctx.fake.calls.length, 0)
  await assert.rejects(ctx.auth.signIn({ username: 'a', password: 'b' }), { code: 'PREVIEW_MODE' })
  ctx.emitUnauthorized()
  assert.equal(ctx.auth.getSnapshot().status, 'preview')
})

test('end to end over the real client: restore, then logout with the restored CSRF token', async () => {
  const { fetchImpl, calls } = recordingFetch((url) => {
    if (url.endsWith('/auth/me')) return success(currentUser())
    if (url.endsWith('/auth/csrf')) return success({ token: RESTORED_TOKEN, headerName: 'X-CSRF-Token' })
    if (url.endsWith('/auth/logout')) return noContent()
    return failure(404, 'RESOURCE_NOT_FOUND', 'Not found')
  })
  const csrfStore = createCsrfStore()
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  const auth = createAuthSession({ service: createAuthService({ client }), csrfStore, subscribeUnauthorized: () => () => {} })
  await auth.restore()
  assert.equal(auth.getSnapshot().status, 'authenticated')
  assert.deepEqual(await auth.signOut(), { serverConfirmed: true, error: null })
  assert.deepEqual(calls.map((c) => c.url), ['/api/v1/auth/me', '/api/v1/auth/csrf', '/api/v1/auth/logout'])
  assert.equal(calls[2].init.headers.get('X-CSRF-Token'), RESTORED_TOKEN)
})
