// Stage 2: effective-permission contract, service and store.
// Mocked transport only: no backend or Oracle access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { permissionKey, readMyPermissions } from '../src/features/access/permissionContract.js'
import { createPermissionService } from '../src/features/access/permissionService.js'
import { createPermissionStore, resolveAccess } from '../src/features/access/permissionStore.js'
import { authUser, deferred, failure, forbidBrowserStorage, recordingFetch, success, SESSION_TOKEN } from './helpers/http.mjs'

// Fixtures in the backend MyPermissions shape (server/docs/openapi/openapi.yaml).
const grant = (moduleCode, resourceCode, actionCode, { viaRole = true, viaOverride = false, permissionId = '7' } = {}) =>
  ({ permissionId, moduleCode, resourceCode, actionCode, viaRole, viaOverride })

const SECURITY_RESOURCES = ['USER_ACCOUNTS', 'ROLES', 'USER_ROLES', 'ROLE_PERMISSIONS', 'PERMISSION_CATALOG', 'USER_PERMISSION_OVERRIDES', 'SECURITY_AUDIT']

const adminPermissions = (userId = authUser.id, mfaVerified = true) => ({
  userId,
  mfaVerified,
  permissions: SECURITY_RESOURCES.flatMap((resource) => [
    grant('SECURITY_ADMINISTRATION', resource, 'VIEW'),
    grant('SECURITY_ADMINISTRATION', resource, 'UPDATE'),
  ]),
})

const employeePermissions = (userId = authUser.id) => ({
  userId,
  mfaVerified: false,
  permissions: [grant('PRODUCTION', 'WORK_ORDERS', 'VIEW')],
})

const emptyPermissions = (userId = authUser.id) => ({ userId, mfaVerified: false, permissions: [] })

const authenticated = (id = authUser.id) => ({ status: 'authenticated', user: { ...authUser, id } })

// A controllable fake service: every call is pending until the test settles it.
function fakeService() {
  const calls = []
  return {
    calls,
    service: {
      getMyPermissions: (options) => {
        const pending = deferred()
        calls.push({ options, ...pending })
        return pending.promise
      },
    },
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

// ------------------------------------------------------------ contract

test('the effective-permission contract keeps documented fields and the backend permission keys', () => {
  const result = readMyPermissions({
    ...adminPermissions(),
    permissions: [grant('SECURITY_ADMINISTRATION', 'ROLES', 'VIEW', { viaRole: false, viaOverride: true }), grant('SECURITY_ADMINISTRATION', 'ROLES', 'VIEW')],
    extra: 'ignored',
  })
  assert.equal(result.userId, authUser.id)
  assert.equal(result.mfaVerified, true)
  assert.equal(result.permissions.length, 1, 'duplicate keys are kept once')
  assert.deepEqual(Object.keys(result.permissions[0]).sort(), ['actionCode', 'moduleCode', 'resourceCode', 'viaOverride', 'viaRole'])
  assert.equal(permissionKey(result.permissions[0]), 'SECURITY_ADMINISTRATION.ROLES:VIEW')
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.permissions) && Object.isFrozen(result.permissions[0]))
})

test('a malformed permission response is rejected as a whole (fail closed)', () => {
  const valid = adminPermissions()
  for (const [name, data] of [
    ['null', null],
    ['array', []],
    ['numeric userId', { ...valid, userId: 105 }],
    ['zero userId', { ...valid, userId: '0' }],
    ['missing mfaVerified', { ...valid, mfaVerified: undefined }],
    ['permissions not an array', { ...valid, permissions: {} }],
    ['lower-case code', { ...valid, permissions: [grant('security_administration', 'ROLES', 'VIEW')] }],
    ['injected separator', { ...valid, permissions: [grant('SECURITY_ADMINISTRATION.ROLES', 'X', 'VIEW')] }],
    ['missing viaRole', { ...valid, permissions: [{ ...grant('A', 'B', 'VIEW'), viaRole: undefined }] }],
    ['entry is a string', { ...valid, permissions: ['SECURITY_ADMINISTRATION.ROLES:VIEW'] }],
    ['more than 1,000 entries', { ...valid, permissions: Array.from({ length: 1001 }, (_, i) => grant('M', `R${i}`, 'VIEW')) }],
  ]) {
    assert.throws(() => readMyPermissions(data), { code: 'INVALID_RESPONSE' }, name)
  }
})

// ------------------------------------------------------------ service

test('permissions are read from GET /access-control/me/permissions with the session cookie', async () => {
  const { fetchImpl, calls } = recordingFetch(() => success(employeePermissions()))
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  const result = await createPermissionService({ client }).getMyPermissions()
  assert.equal(calls[0].url, '/api/v1/access-control/me/permissions')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].init.credentials, 'include')
  assert.equal(calls[0].init.headers.has('X-CSRF-Token'), false, 'safe method: no CSRF header')
  assert.deepEqual(result.permissions.map(permissionKey), ['PRODUCTION.WORK_ORDERS:VIEW'])
})

test('a 401 from the permission request invalidates the signed-in session', async () => {
  let unauthorized = 0
  const { fetchImpl } = recordingFetch(() => failure(401, 'UNAUTHENTICATED', 'Your session has expired.'))
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, onUnauthorized: () => { unauthorized += 1 } })
  await assert.rejects(createPermissionService({ client }).getMyPermissions(), { status: 401 })
  assert.equal(unauthorized, 1)
})

// ------------------------------------------------------------ store

test('administrator: effective security permissions are granted only once loaded', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  assert.equal(store.getSnapshot().status, 'loading')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false, 'default deny while loading')
  fake.calls[0].resolve(readMyPermissions(adminPermissions()))
  await settle()
  const snapshot = store.getSnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.subjectId, authUser.id)
  assert.equal(snapshot.mfaVerified, true)
  for (const resource of SECURITY_RESOURCES) assert.equal(snapshot.has(`SECURITY_ADMINISTRATION.${resource}:VIEW`), true, resource)
  assert.equal(snapshot.has('SECURITY_ADMINISTRATION.ROLES:DELETE'), false, 'only listed actions')
  assert.equal(snapshot.has('PRODUCTION.WORK_ORDERS:VIEW'), false)
})

test('ordinary employee: only the employee\'s own effective permissions apply', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  fake.calls[0].resolve(readMyPermissions(employeePermissions()))
  await settle()
  const snapshot = store.getSnapshot()
  assert.equal(snapshot.has('PRODUCTION.WORK_ORDERS:VIEW'), true)
  for (const resource of SECURITY_RESOURCES) assert.equal(snapshot.has(`SECURITY_ADMINISTRATION.${resource}:VIEW`), false, resource)
})

test('an empty permission set is a loaded state that grants nothing', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  fake.calls[0].resolve(readMyPermissions(emptyPermissions()))
  await settle()
  assert.equal(store.getSnapshot().status, 'ready')
  assert.deepEqual(store.getSnapshot().permissions, [])
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.USER_ACCOUNTS:VIEW'), false)
})

test('a failed permission request denies everything and can be retried safely', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  fake.calls[0].reject(new ApiError('The service is temporarily unavailable.', { code: 'HTTP_ERROR', status: 503 }))
  await settle()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, 'HTTP_ERROR')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)

  // Re-syncing the same session does not hammer the backend; only an explicit retry does.
  store.sync(authenticated())
  assert.equal(fake.calls.length, 1)
  store.reload()
  store.reload()
  assert.equal(fake.calls.length, 2, 'no duplicate request while a retry is loading')
  fake.calls[1].resolve(readMyPermissions(adminPermissions()))
  await settle()
  assert.equal(store.getSnapshot().status, 'ready')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), true)
})

test('a network failure or malformed response also ends in the deny-all error state', async () => {
  for (const error of [new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }), new Error('unexpected')]) {
    const fake = fakeService()
    const store = createPermissionStore({ service: fake.service })
    store.sync(authenticated())
    fake.calls[0].reject(error)
    await settle()
    assert.equal(store.getSnapshot().status, 'error')
    assert.equal(store.getSnapshot().has('PRODUCTION.WORK_ORDERS:VIEW'), false)
  }
})

test('logout, session expiry, MFA-pending and preview states clear permissions', async () => {
  for (const next of [{ status: 'guest' }, { status: 'loading' }, { status: 'mfa_required' }, { status: 'error' }, { status: 'preview' }, {}]) {
    const fake = fakeService()
    const store = createPermissionStore({ service: fake.service })
    store.sync(authenticated())
    fake.calls[0].resolve(readMyPermissions(adminPermissions()))
    await settle()
    assert.equal(store.getSnapshot().status, 'ready')
    store.sync(next)
    assert.equal(store.getSnapshot().status, 'idle', JSON.stringify(next))
    assert.equal(store.getSnapshot().subjectId, null)
    assert.deepEqual(store.getSnapshot().permissions, [])
    assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
  }
})

test('a response arriving after logout is never applied', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  store.sync({ status: 'guest' })
  assert.equal(fake.calls[0].options.signal.aborted, true, 'the request is aborted')
  fake.calls[0].resolve(readMyPermissions(adminPermissions()))
  await settle()
  assert.equal(store.getSnapshot().status, 'idle')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
})

test('a stale response for a previous user never grants the next user access', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated('105'))
  store.sync({ status: 'guest' })
  store.sync(authenticated('206'))
  assert.equal(fake.calls.length, 2)
  // The administrator's slow response arrives after the employee signed in.
  fake.calls[0].resolve(readMyPermissions(adminPermissions('105')))
  await settle()
  assert.equal(store.getSnapshot().status, 'loading')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
  fake.calls[1].resolve(readMyPermissions(employeePermissions('206')))
  await settle()
  assert.equal(store.getSnapshot().subjectId, '206')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
  assert.equal(store.getSnapshot().has('PRODUCTION.WORK_ORDERS:VIEW'), true)
})

test('a superseded refresh never overwrites the newer result', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated())
  fake.calls[0].reject(new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }))
  await settle()
  store.reload()
  store.sync(authenticated('206')) // a different identity supersedes the retry
  fake.calls[1].resolve(readMyPermissions(adminPermissions()))
  fake.calls[2].resolve(readMyPermissions(emptyPermissions('206')))
  await settle()
  assert.equal(store.getSnapshot().subjectId, '206')
  assert.deepEqual(store.getSnapshot().permissions, [])
})

test('permissions reported for another identity are rejected', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated('105'))
  fake.calls[0].resolve(readMyPermissions(adminPermissions('999')))
  await settle()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, 'IDENTITY_MISMATCH')
  assert.equal(store.getSnapshot().has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
})

test('resolveAccess never exposes permissions loaded for another identity or state', async () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync(authenticated('105'))
  fake.calls[0].resolve(readMyPermissions(adminPermissions('105')))
  await settle()
  const loaded = store.getSnapshot()
  assert.equal(resolveAccess(loaded, authenticated('105')), loaded)
  // The render before sync() runs for a new user, a sign-out or the preview.
  for (const auth of [authenticated('206'), { status: 'guest' }, { status: 'preview' }, { status: 'authenticated', user: null }, undefined]) {
    const access = resolveAccess(loaded, auth)
    assert.notEqual(access.status, 'ready', JSON.stringify(auth))
    assert.equal(access.has('SECURITY_ADMINISTRATION.ROLES:VIEW'), false)
  }
  assert.equal(resolveAccess(loaded, authenticated('206')).status, 'loading')
  assert.equal(resolveAccess(loaded, { status: 'guest' }).status, 'idle')
})

test('the development preview never requests permissions', () => {
  const fake = fakeService()
  const store = createPermissionStore({ service: fake.service })
  store.sync({ status: 'preview', user: null })
  assert.equal(fake.calls.length, 0)
  assert.equal(store.getSnapshot().status, 'idle')
})

test('permission state is memory-only', async () => {
  const restore = forbidBrowserStorage()
  try {
    const fake = fakeService()
    const store = createPermissionStore({ service: fake.service })
    store.sync(authenticated())
    fake.calls[0].resolve(readMyPermissions(adminPermissions()))
    await settle()
    store.sync({ status: 'guest' })
  } finally {
    restore()
  }
  const dir = new URL('../src/features/access/', import.meta.url)
  for (const name of await readdir(dir)) {
    const source = await readFile(new URL(name, dir), 'utf8')
    for (const pattern of [/localStorage|sessionStorage|indexedDB|document\.cookie/, /console\./, /dangerouslySetInnerHTML/]) {
      assert.equal(pattern.test(source), false, `features/access/${name} matches ${pattern}`)
    }
  }
})
