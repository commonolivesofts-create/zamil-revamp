import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { createAuthService } from '../src/features/auth/authService.js'
import { createAuthSession } from '../src/features/auth/authSession.js'
import { REQUEST_ID, RESTORED_TOKEN, currentUser, failure, recordingFetch, success } from './helpers/http.mjs'

// Session restoration and sign-in over the real API client, auth service and
// session store, with the transport answers a browser actually receives:
// backend envelopes, the Vite proxy's empty 502 when the backend is not
// listening, and a network failure.
const tick = () => new Promise((resolve) => setImmediate(resolve))
const proxyBadGateway = () => new Response('', { status: 502, headers: { 'Content-Type': 'text/plain' } })

function setup(responder) {
  const recorder = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl: recorder.fetchImpl, csrfStore })
  const auth = createAuthSession({ service: createAuthService({ client }), csrfStore, subscribeUnauthorized: () => () => {} })
  return { auth, calls: recorder.calls }
}

const meOnly = (respond) => (url) => {
  if (url.endsWith('/auth/me')) return respond()
  if (url.endsWith('/auth/csrf')) return success({ token: RESTORED_TOKEN, headerName: 'X-CSRF-Token' })
  throw new Error(`unexpected request ${url}`)
}

test('no session (401) resolves to guest, which the root route sends to /login', async () => {
  const ctx = setup(meOnly(() => failure(401, 'UNAUTHENTICATED', 'Authentication is required')))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.auth.getSnapshot().notice, null)
  assert.deepEqual(ctx.calls.map((c) => c.url), ['/api/v1/auth/me'])
})

test('a valid session resolves to authenticated, which the root route sends to /dashboard', async () => {
  const ctx = setup(meOnly(() => success(currentUser())))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'authenticated')
  assert.deepEqual(ctx.calls.map((c) => c.url), ['/api/v1/auth/me', '/api/v1/auth/csrf'])
})

test('an unreachable backend is an error state, not guest, and is never retried automatically', async () => {
  for (const respond of [proxyBadGateway, () => { throw new TypeError('Failed to fetch') }]) {
    const ctx = setup(meOnly(respond))
    await ctx.auth.restore()
    assert.equal(ctx.auth.getSnapshot().status, 'error')
    await tick()
    await tick()
    assert.equal(ctx.calls.length, 1, 'no automatic retry loop')
  }
})

test('a manual retry after the backend starts reaches the login decision', async () => {
  let backendUp = false
  const ctx = setup(meOnly(() => (backendUp ? failure(401, 'UNAUTHENTICATED', 'Authentication is required') : proxyBadGateway())))
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'error')
  backendUp = true
  await ctx.auth.restore()
  assert.equal(ctx.auth.getSnapshot().status, 'guest')
  assert.equal(ctx.calls.length, 2)
})

async function signInWith(response) {
  const ctx = setup((url) => {
    if (url.endsWith('/auth/me')) return failure(401, 'UNAUTHENTICATED', 'Authentication is required')
    if (url.endsWith('/auth/login')) return response()
    throw new Error(`unexpected request ${url}`)
  })
  await ctx.auth.restore()
  const error = await ctx.auth.signIn({ username: 'test.user', password: 'secret' }).then(() => null, (e) => e)
  await tick()
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

  const proxy = await signInWith(proxyBadGateway)
  assert.equal(proxy.status, 502)
  assert.equal(proxy.message, 'The application server could not be reached. Try again in a moment.')
  assert.equal(proxy.requestId, null)

  const network = await signInWith(() => { throw new TypeError('Failed to fetch') })
  assert.equal(network.code, 'NETWORK_ERROR')
})
