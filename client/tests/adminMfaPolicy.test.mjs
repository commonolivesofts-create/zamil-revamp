// AUTH_ADMIN_MFA_REQUIRED on the frontend: the permission layer mirrors the backend's
// `adminMfaRequired` flag; it never authorizes anything itself and never marks a session verified.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { authorizedNavigation, appRoutes, PERMISSIONS, routeAccess } from '../src/config/appNavigation.js'
import { readMyPermissions } from '../src/features/access/permissionContract.js'
import { createPermissionStore } from '../src/features/access/permissionStore.js'
import { authUser, deferred } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const usersRoute = appRoutes.find((route) => route.id === 'user-accounts')
const grant = (key) => {
  const [moduleCode, rest] = key.split('.')
  const [resourceCode, actionCode] = rest.split(':')
  return { permissionId: '1', moduleCode, resourceCode, actionCode, viaRole: true, viaOverride: false }
}
const response = (overrides = {}) => ({ userId: authUser.id, mfaVerified: false, permissions: [grant(PERMISSIONS.USER_ACCOUNTS_VIEW)], ...overrides })
const ready = (keys, { mfaVerified = false, adminMfaRequired } = {}) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified, adminMfaRequired, has: (key) => set.has(key) }
}

test('the permission contract keeps the backend flag and treats a missing flag as required', () => {
  assert.equal(readMyPermissions(response({ adminMfaRequired: false })).adminMfaRequired, false)
  assert.equal(readMyPermissions(response({ adminMfaRequired: true })).adminMfaRequired, true)
  assert.equal(readMyPermissions(response()).adminMfaRequired, true, 'older backend: fail safe')
  for (const value of ['false', 0, null, {}]) {
    assert.throws(() => readMyPermissions(response({ adminMfaRequired: value })), { code: 'INVALID_RESPONSE' }, String(value))
  }
  assert.equal(readMyPermissions(response({ adminMfaRequired: false })).mfaVerified, false, 'never turned into a verification')
})

test('the permission store exposes the flag only for the loaded user', async () => {
  const pending = deferred()
  const store = createPermissionStore({ service: { getMyPermissions: () => pending.promise } })
  assert.equal(store.getSnapshot().adminMfaRequired, true, 'default before loading')
  store.sync({ status: 'authenticated', user: authUser })
  pending.resolve(readMyPermissions(response({ adminMfaRequired: false })))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getSnapshot().adminMfaRequired, false)
  assert.equal(store.getSnapshot().mfaVerified, false)
  store.sync({ status: 'guest' })
  assert.equal(store.getSnapshot().adminMfaRequired, true, 'cleared on sign-out')
})

test('route access waives only the MFA condition, and only when the server reports the exception', () => {
  const keys = [PERMISSIONS.USER_ACCOUNTS_VIEW]
  assert.equal(routeAccess(usersRoute, ready(keys, { adminMfaRequired: false })), 'allowed')
  assert.equal(routeAccess(usersRoute, ready(keys, { adminMfaRequired: true })), 'mfa_required')
  assert.equal(routeAccess(usersRoute, ready(keys)), 'mfa_required', 'unknown flag: MFA required')
  assert.equal(routeAccess(usersRoute, ready(keys, { mfaVerified: true, adminMfaRequired: true })), 'allowed')
  assert.equal(routeAccess(usersRoute, ready([], { adminMfaRequired: false })), 'denied', 'permission still required')
  assert.equal(routeAccess(usersRoute, { status: 'loading', adminMfaRequired: false, has: () => false }), 'pending')
})

test('navigation lists authorized security pages under the exception, nothing more', () => {
  const security = (access) => authorizedNavigation(access).find((section) => section.id === 'security')?.items.map((item) => item.id) ?? []
  assert.deepEqual(security(ready([PERMISSIONS.USER_ACCOUNTS_VIEW], { adminMfaRequired: false })), ['user-accounts'])
  assert.deepEqual(security(ready([PERMISSIONS.USER_ACCOUNTS_VIEW], { adminMfaRequired: true })), [])
  assert.deepEqual(security(ready(['PRODUCTION.WORK_ORDERS:VIEW'], { adminMfaRequired: false })), [])
})

test('the dashboard explains the exception instead of asking for MFA', async () => {
  const dashboard = await read('../src/features/dashboard/DashboardPage.jsx')
  assert.match(dashboard, /const needsMfa = !access\.mfaVerified && access\.adminMfaRequired !== false && hasSecurityPermissions/)
  assert.match(dashboard, /const mfaWaived = !access\.mfaVerified && access\.adminMfaRequired === false && hasSecurityPermissions/)
  assert.match(dashboard, /Administrator MFA is disabled on this local development server\./)
})

test('there is no frontend MFA bypass setting', async () => {
  const example = await read('../.env.example')
  assert.equal(/MFA/i.test(example.replace(/^#.*$/gm, '')), false, 'no MFA variable in the frontend environment')
  const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    return entry.isDirectory() ? walk(url) : [url]
  }))).flat()
  for (const file of await walk(new URL('../src/', import.meta.url))) {
    const source = await readFile(file, 'utf8')
    // Comments may mention the backend variable; code must not read any MFA setting itself.
    assert.equal(/VITE_[A-Z_]*MFA|import\.meta\.env\.[A-Z_]*MFA|env\.AUTH_ADMIN_MFA/.test(source), false, file.pathname)
  }
})
