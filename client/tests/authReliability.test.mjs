import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { createAuthService } from '../src/features/auth/authService.js'
import { RESTORE_RETRY_DELAYS_MS, createAuthSession, isTransientRestoreError } from '../src/features/auth/authSession.js'
import { REQUEST_ID, RESTORED_TOKEN, currentUser, failure, recordingFetch, success } from './helpers/http.mjs'

// Session restoration and sign-in over the real API client, auth service and
// session store, with the transport answers a browser actually receives:
// backend envelopes, the Vite proxy's empty 502 when the backend is not
// listening, and a network failure.
const tick = () => new Promise((resolve) => setImmediate(resolve))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const proxyBadGateway = () => new Response('', { status: 502, headers: { 'Content-Type': 'text/plain' } })
const noSession = () => failure(401, 'UNAUTHENTICATED', 'Authentication is required')
const FAST_RETRIES = [5, 5]

function setup(responder, { baseUrl = '/api/v1', fetchImpl, restoreRetryDelaysMs = FAST_RETRIES } = {}) {
  const recorder = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  const client = createApiClient({ baseUrl, fetchImpl: fetchImpl ?? recorder.fetchImpl, csrfStore })
  const auth = createAuthSession({
    service: createAuthService({ client }), csrfStore, subscribeUnauthorized: () => () => {}, restoreRetryDelaysMs,
  })
  return { auth, calls: recorder.calls }
}

const meOnly = (respond) => (url, _init, number) => {
  if (url.endsWith('/auth/me')) return respond(number)
  if (url.endsWith('/auth/csrf')) return success({ token: RESTORED_TOKEN, headerName: 'X-CSRF-Token' })
  throw new Error(`unexpected request ${url}`)
}
const meCalls = (ctx) => ctx.calls.filter((c) => c.url.endsWith('/auth/me')).length

test('the default recovery is the initial request plus two delayed retries', () => {
  assert.deepEqual(RESTORE_RETRY_DELAYS_MS, [1000, 2000])
  for (const status of [502, 503, 504]) assert.equal(isTransientRestoreError({ status }), true)
  assert.equal(isTransientRestoreError({ code: 'NETWORK_ERROR' }), true)
  for (const error of [{ status: 401 }, { status: 403 }, { status: 500 }, { code: 'TIMEOUT' }, { code: 'INVALID_RESPONSE', status: 200 }]) {
    assert.equal(isTransientRestoreError(error), false)
  }
})

test('no session (401) resolves to guest at once, which the root route sends to /login', async () => {
  const ctx = setup(meOnly(noSession))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.auth.getSnapshot().notice, null)
  assert.deepEqual(ctx.calls.map((c) => c.url), ['/api/v1/auth/me'], 'a 401 is never retried')
})

test('a valid session resolves to authenticated, which the root route sends to /dashboard', async () => {
  const ctx = setup(meOnly(() => success(currentUser())))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
  assert.deepEqual(ctx.calls.map((c) => c.url), ['/api/v1/auth/me', '/api/v1/auth/csrf'])
})

test('a backend that recovers during the bounded retries restores the decision automatically', async () => {
  const toGuest = setup(meOnly((n) => (n === 1 ? proxyBadGateway() : noSession())))
  await toGuest.auth.restore()
  assert.equal(toGuest.auth.getSnapshot().status, 'guest')
  assert.equal(meCalls(toGuest), 2)

  let attempt = 0
  const toSession = setup((url) => {
    if (url.endsWith('/auth/me')) {
      attempt += 1
      if (attempt === 1) throw new TypeError('Failed to fetch')
      if (attempt === 2) return failure(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable')
      return success(currentUser())
    }
    return success({ token: RESTORED_TOKEN, headerName: 'X-CSRF-Token' })
  })
  await toSession.auth.restore()
  assert.equal(toSession.auth.getSnapshot().status, 'authenticated', 'success stops the retries')
  assert.equal(attempt, 3)
})

test('a backend that stays unavailable ends in error after exactly three requests', async () => {
  for (const respond of [proxyBadGateway, () => { throw new TypeError('Failed to fetch') }, () => new Response('', { status: 504 })]) {
    const ctx = setup(meOnly(respond))
    await ctx.auth.restore()
    assert.equal(ctx.auth.getSnapshot().status, 'error', 'neither authenticated nor guest')
    await wait(30)
    assert.equal(meCalls(ctx), 3, 'bounded: no further automatic requests')
  }
})

test('non-transient failures are not retried', async () => {
  const ctx = setup(meOnly(() => failure(500, 'INTERNAL_ERROR', 'An unexpected error occurred')))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'error')
  assert.equal(meCalls(ctx), 1)
})

test('retries never overlap, and stop() or a newer operation cancels a pending retry', async () => {
  let inFlight = 0
  let maxInFlight = 0
  const ctx = setup(meOnly(async () => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await wait(2)
    inFlight -= 1
    return proxyBadGateway()
  }), { restoreRetryDelaysMs: [20, 20] })
  await ctx.auth.restore()
  assert.equal(maxInFlight, 1)

  const stopped = setup(meOnly(proxyBadGateway), { restoreRetryDelaysMs: [20, 20] })
  const pending = stopped.auth.restore()
  await wait(5) // first request failed; the retry delay is pending
  stopped.auth.stop()
  await pending
  await wait(60)
  assert.equal(meCalls(stopped), 1, 'no request after unmount')
  assert.equal(stopped.auth.getSnapshot().status, 'loading', 'an abandoned check never decides the state')

  const superseded = setup(meOnly(proxyBadGateway), { restoreRetryDelaysMs: [20, 20] })
  const first = superseded.auth.restore()
  await wait(5)
  const second = superseded.auth.restore()
  await Promise.all([first, second])
  await wait(60)
  assert.equal(meCalls(superseded), 4, 'the superseded check stopped after one request; the newer one ran 3')
  assert.equal(superseded.auth.getSnapshot().status, 'error')
})

test('actual HTTP: a backend that starts listening during recovery is reached automatically', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json', 'X-Request-Id': REQUEST_ID })
    res.end(JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' }, meta: { requestId: REQUEST_ID } }))
  })
  // Reserve a free port, close it, and start the "backend" there only after the first attempt failed.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  let attempts = 0
  const countingFetch = (url, init) => {
    attempts += 1
    if (attempts === 1) setTimeout(() => server.listen(port, '127.0.0.1'), 0)
    return fetch(url, init)
  }
  const ctx = setup(null, { baseUrl: `http://127.0.0.1:${port}/api/v1`, fetchImpl: countingFetch, restoreRetryDelaysMs: [200, 200] })
  try {
    await ctx.auth.restore()
    assert.equal(ctx.auth.getSnapshot().status, 'guest')
    assert.equal(attempts, 2, 'refused once (NETWORK_ERROR), then answered 401')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('the error state offers retry and login without unlocking protected routes', async () => {
  const guards = await readFile(new URL('../src/routes/RouteGuards.jsx', import.meta.url), 'utf8')
  assert.match(guards, /actionLabel="Retry session check" onAction=\{retrySession\}/)
  assert.match(guards, /to="\/login"[^>]*>Go to Login<\/Link>/)
  // ProtectedRoute: error renders the warning, never <Outlet />; only authenticated/preview pass.
  const protectedRoute = guards.slice(guards.indexOf('export function ProtectedRoute'), guards.indexOf('export function GuestOnlyRoute'))
  assert.match(protectedRoute, /status === 'error'\) return <SessionCheckUnavailable/)
  assert.match(protectedRoute, /status !== 'authenticated' && status !== 'preview'\) return <Navigate to="\/login"/)
  // GuestOnlyRoute keeps /login reachable in the error state (it only holds back loading/authenticated/MFA).
  const guestRoute = guards.slice(guards.indexOf('export function GuestOnlyRoute'), guards.indexOf('export function MfaChallengeRoute'))
  assert.doesNotMatch(guestRoute, /'error'/)
  const login = await readFile(new URL('../src/pages/auth/LoginPage.jsx', import.meta.url), 'utf8')
  assert.match(login, /status === 'error' &&/)
})

async function signInWith(response) {
  const ctx = setup((url) => {
    if (url.endsWith('/auth/me')) return noSession()
    if (url.endsWith('/auth/login')) return response()
    throw new Error(`unexpected request ${url}`)
  })
  await ctx.auth.restore()
  const error = await ctx.auth.signIn({ username: 'test.user', password: 'secret' }).then(() => null, (e) => e)
  await wait(30)
  const posts = ctx.calls.filter((c) => c.url.endsWith('/auth/login'))
  assert.equal(posts.length, 1, 'exactly one login POST, never replayed')
  assert.equal(posts[0].init.method, 'POST')
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  return error
}

test('wrong credentials and transient failures stay distinguishable after one login POST', async () => {
  const wrong = await signInWith(() =>
    failure(401, 'AUTHENTICATION_FAILED', 'Sign-in failed. Check your username and password, or try again later.'))
  assert.equal(wrong.code, 'AUTHENTICATION_FAILED')
  assert.equal(wrong.status, 401)

  const database = await signInWith(() => failure(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable'))
  assert.equal(database.code, 'SERVICE_UNAVAILABLE')
  assert.equal(database.status, 503)
  assert.equal(database.requestId, REQUEST_ID, 'the request ID locates the backend log entry')

  for (const status of [502, 504]) {
    const proxy = await signInWith(() => new Response('', { status }))
    assert.equal(proxy.status, status)
    assert.equal(proxy.message, 'The application server could not be reached. Try again in a moment.')
    assert.equal(proxy.requestId, null)
  }

  const network = await signInWith(() => { throw new TypeError('Failed to fetch') })
  assert.equal(network.code, 'NETWORK_ERROR')
})
