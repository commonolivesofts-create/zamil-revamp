import test from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import {
  REQUEST_ID, failure, jsonResponse, noContent, recordingFetch, success,
} from './helpers/http.mjs'

function setup(responder, options = {}) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  let unauthorized = 0
  const client = createApiClient({
    baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => { unauthorized += 1 }, ...options,
  })
  return { client, calls, csrfStore, unauthorizedCount: () => unauthorized }
}

const pagination = { page: 1, limit: 20, total: 41, totalPages: 3, hasNextPage: true, hasPreviousPage: false }

test('success envelopes resolve to data, pagination and request ID', async () => {
  const { client } = setup(() => success({ id: '1' }))
  const result = await client.get('/users/1')
  assert.deepEqual(result, { status: 200, data: { id: '1' }, pagination: null, requestId: REQUEST_ID })
  assert.ok(Object.isFrozen(result))
})

test('paginated envelopes keep validated pagination metadata', async () => {
  const { client } = setup(() => success([{ id: '1' }], 200, { pagination }))
  const result = await client.get('/users', { params: { page: 1 } })
  assert.deepEqual(result.pagination, pagination)

  const bad = setup(() => success([], 200, { pagination: { ...pagination, total: '41' } }))
  await assert.rejects(bad.client.get('/users'), { code: 'INVALID_RESPONSE' })
})

test('HTTP 204 resolves without a body', async () => {
  const { client } = setup(() => noContent())
  assert.deepEqual(await client.post('/auth/logout'), { status: 204, data: null, pagination: null, requestId: REQUEST_ID })
})

test('non-envelope or malformed success bodies are rejected', async () => {
  for (const response of [
    () => jsonResponse(200, { status: 'UP' }),
    () => jsonResponse(200, { success: false, data: {} }),
    () => new Response('<html>', { status: 200 }),
    () => new Response('', { status: 200 }),
  ]) {
    const { client } = setup(response)
    await assert.rejects(client.get('/x'), (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE')
  }
})

test('structured errors keep code, status, safe message, details and request ID', async () => {
  const details = [{ field: 'username', message: '"username" is required' }, { bogus: true }]
  const { client } = setup(() => failure(400, 'VALIDATION_ERROR', 'Request validation failed', { details }))
  await assert.rejects(client.post('/auth/login', {}), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'VALIDATION_ERROR')
    assert.equal(error.status, 400)
    assert.equal(error.message, 'Request validation failed')
    assert.deepEqual(error.details, [{ field: 'username', message: '"username" is required' }])
    assert.equal(error.requestId, REQUEST_ID)
    return true
  })
})

test('non-envelope and unsafe error bodies fall back to generic messages', async () => {
  const html = setup(() => new Response('<html>Bad gateway</html>', { status: 502 }))
  await assert.rejects(html.client.get('/x'), { code: 'HTTP_ERROR', status: 502, message: 'The application server could not be reached. Try again in a moment.' })
  const unavailable = setup(() => new Response('', { status: 503 }))
  await assert.rejects(unavailable.client.get('/x'), { code: 'HTTP_ERROR', status: 503, message: 'The service is temporarily unavailable.' })

  const unsafe = setup(() => failure(400, 'lower-case', 'x'.repeat(600)))
  await assert.rejects(unsafe.client.get('/x'), { code: 'HTTP_ERROR', message: 'The request could not be completed.' })
})

test('rate limiting exposes Retry-After', async () => {
  const { client } = setup(() => failure(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {}, { 'Retry-After': '42' }))
  await assert.rejects(client.post('/auth/login', {}), { code: 'RATE_LIMITED', retryAfterSeconds: 42 })
})

test('every request uses the secure fetch settings and a same-origin path', async () => {
  const { client, calls } = setup(() => success({}))
  await client.post('/auth/login', { username: 'a', password: 'b' }, { csrf: 'none' })
  const [{ url, init }] = calls
  assert.equal(url, '/api/v1/auth/login')
  assert.equal(init.method, 'POST')
  assert.equal(init.credentials, 'include')
  assert.equal(init.cache, 'no-store')
  assert.equal(init.redirect, 'error')
  assert.equal(init.headers.get('Accept'), 'application/json')
  assert.equal(init.headers.get('Content-Type'), 'application/json')
  assert.equal(init.body, '{"username":"a","password":"b"}')
})

test('unsafe paths and base URLs are refused before fetch', async () => {
  const { client, calls } = setup(() => success({}))
  for (const path of ['//evil.example/x', '/a/../b', '/a?b=1', '/a#b', 'relative', '/a\\b', '/a%2F..']) {
    await assert.rejects(client.get(path), { code: 'INVALID_PATH' })
  }
  const bad = createApiClient({ baseUrl: 'javascript:alert(1)', fetchImpl: () => assert.fail() })
  await assert.rejects(bad.get('/x'), { code: 'INVALID_CONFIG' })
  assert.equal(calls.length, 0)
})

test('the session CSRF token comes from memory and only on unsafe methods', async () => {
  const { client, calls, csrfStore } = setup(() => success({}))
  csrfStore.setSessionToken('session-token')
  await client.get('/auth/me')
  await client.post('/users/1/disable', {})
  await client.delete('/users/1/sessions')
  assert.equal(calls[0].init.headers.has('X-CSRF-Token'), false)
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'session-token')
  assert.equal(calls[2].init.headers.get('X-CSRF-Token'), 'session-token')
})

test('challenge and none CSRF modes never send the session token', async () => {
  const { client, calls, csrfStore } = setup(() => success({}))
  csrfStore.setChallengeToken('challenge-token')
  await client.post('/auth/mfa/verify', {}, { csrf: 'challenge' })
  await client.post('/users/1/disable', {})
  csrfStore.setSessionToken('session-token')
  await client.post('/auth/login', {}, { csrf: 'none' })
  await client.post('/auth/mfa/verify', {}, { csrf: 'challenge' })
  assert.equal(calls[0].init.headers.get('X-CSRF-Token'), 'challenge-token')
  assert.equal(calls[1].init.headers.has('X-CSRF-Token'), false, 'no session token while only a challenge exists')
  assert.equal(calls[2].init.headers.has('X-CSRF-Token'), false)
  assert.equal(calls[3].init.headers.has('X-CSRF-Token'), false, 'challenge token was replaced by the session')
  await assert.rejects(client.post('/x', {}, { csrf: 'meta' }), { code: 'INVALID_CSRF_MODE' })
})

test('callers cannot inject their own CSRF header', async () => {
  const { client, calls } = setup(() => success({}))
  await client.post('/x', {}, { headers: { 'X-CSRF-Token': 'forged' } })
  assert.equal(calls[0].init.headers.has('X-CSRF-Token'), false)
})

test('only session 401 responses emit the unauthorized event', async () => {
  const { client, unauthorizedCount } = setup(() => failure(401, 'UNAUTHENTICATED', 'Authentication is required'))
  await assert.rejects(client.get('/users'), { code: 'UNAUTHENTICATED', status: 401 })
  assert.equal(unauthorizedCount(), 1)
  await assert.rejects(client.post('/auth/login', {}, { csrf: 'none', notifyUnauthorized: false }), { status: 401 })
  assert.equal(unauthorizedCount(), 1)
})

test('403 responses, including CSRF rejection, are not replayed or treated as 401', async () => {
  const { client, calls, unauthorizedCount } = setup(() => failure(403, 'CSRF_REJECTED', 'The request could not be verified. Reload and try again.'))
  await assert.rejects(client.post('/users/1/disable', {}), { code: 'CSRF_REJECTED', status: 403 })
  assert.equal(calls.length, 1)
  assert.equal(unauthorizedCount(), 0)
})

test('timeouts, caller aborts and network failures map to stable codes', async () => {
  const hang = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })
  const timed = setup(hang)
  await assert.rejects(timed.client.get('/x', { timeout: 10 }), { code: 'TIMEOUT' })

  const cancelled = setup(hang)
  const controller = new AbortController()
  const pending = cancelled.client.get('/x', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { code: 'ABORTED' })

  const preAborted = setup(() => assert.fail('fetch must not run'))
  await assert.rejects(preAborted.client.get('/x', { signal: AbortSignal.abort() }), { code: 'ABORTED' })

  const offline = setup(() => { throw new TypeError('Failed to fetch') })
  await assert.rejects(offline.client.get('/x'), { code: 'NETWORK_ERROR' })
})

test('the application client module loads outside the browser with the same-origin default', async () => {
  const { apiClient } = await import('../src/services/api/apiClient.js')
  const { apiConfig } = await import('../src/config/apiConfig.js')
  assert.equal(apiConfig.baseUrl, '/api/v1')
  assert.equal(typeof apiClient.post, 'function')
})
