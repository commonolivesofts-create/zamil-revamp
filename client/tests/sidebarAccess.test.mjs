// Phase 2C: sidebar access after role-permission changes. Traces the real chain from
// GET /access-control/me/permissions (effective permissions resolved by Oracle: active chain,
// role grants, ALLOW overrides, DENY wins) through the permission store, routeAccess() and
// authorizedNavigation(), which the sidebar, command palette, dashboard and direct-URL guard
// share. Only existing Common and Security Administration routes are used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readMyPermissions } from '../src/features/access/permissionContract.js'
import { createPermissionStore, resolveAccess } from '../src/features/access/permissionStore.js'
import { appRoutes, authorizedNavigation, findAppRoute, paletteCommands, routeAccess } from '../src/config/appNavigation.js'
import { authUser, deferred } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const SA = 'SECURITY_ADMINISTRATION'
const auth ={ status: 'authenticated', user: authUser }
const settle = () => new Promise((resolve) => setImmediate(resolve))

// What the backend returns: the user's *effective* permissions only. A DENY override, an
// inactive module/resource/permission, an inactive role or grant removes a key from this list
// (server/tests/rbac-authorization.test.js), so the frontend never sees it.
const effective = (keys, { mfaVerified = true, adminMfaRequired = true } = {}) => readMyPermissions({
  userId: authUser.id,
  mfaVerified,
  adminMfaRequired,
  permissions: keys.map((key, index) => {
    const [moduleCode, rest] = key.split('.')
    const [resourceCode, actionCode] = rest.split(':')
    return { permissionId: String(index + 1), moduleCode, resourceCode, actionCode, viaRole: true, viaOverride: false }
  }),
})

function signedInStore() {
  const calls = []
  const store = createPermissionStore({
    service: {
      getMyPermissions: () => {
        const pending = deferred()
        calls.push(pending)
        return pending.promise
      },
    },
  })
  const access = () => resolveAccess(store.getSnapshot(), auth)
  const sidebar = () => authorizedNavigation(access()).flatMap((section) => section.items.map((item) => item.id))
  const answer = async (keys, options) => {
    calls.at(-1).resolve(effective(keys, options))
    await settle()
  }
  return { store, calls, access, sidebar, answer }
}

// Session-only pages: the dashboard and account pages. Recruitment routes are
// protected by the effective permissions of their backend resources. The HR
// onboarding pages are switched off in this build (VITE_FEATURE_HR_RECRUITMENT
// unset outside development); see hrOnboarding.test.mjs.
const HR = ['hr-requisition', 'hr-interview', 'hr-offer']
const COMMON = ['dashboard', 'account-password', 'account-authenticator']
const HR_PERMISSIONS = [
  'REQUISITIONS.REQUISITIONS:VIEW',
  'INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS:VIEW',
  'EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS:VIEW',
]

test('a registered page appears once its permission is effective; a missing permission hides it', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  assert.deepEqual(s.sidebar(), COMMON, 'common links while permissions load')
  await s.answer([])
  assert.deepEqual(s.sidebar(), COMMON, 'no business permission: common links only')

  s.store.reload()
  await s.answer(HR_PERMISSIONS)
  assert.deepEqual(s.sidebar(), ['dashboard', ...HR, 'account-password', 'account-authenticator'])
  assert.equal(routeAccess(findAppRoute('/hr/recruitment/requisition'), s.access()), 'allowed')
  assert.equal(routeAccess(findAppRoute('/hr/recruitment/offer'), s.access()), 'allowed')

  // A role grant takes effect for this session after a refresh (the grant page refreshes the
  // administrator's own permissions; other users after a page reload or new sign-in).
  s.store.reload()
  await s.answer([`${SA}.ROLES:VIEW`])
  assert.deepEqual(s.sidebar(), ['dashboard', 'roles', 'account-password', 'account-authenticator'])
  assert.equal(routeAccess(findAppRoute('/security/roles'), s.access()), 'allowed', 'direct URL: same decision')
  assert.equal(routeAccess(findAppRoute('/security/users'), s.access()), 'denied', 'direct URL without the permission')
  assert.deepEqual(paletteCommands(s.access(), 'authenticated').map((c) => c.id), s.sidebar(), 'command palette lists the same pages')
})

test('alsoRequires: a page needing two permissions appears only when both are effective', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  await s.answer([`${SA}.USER_ROLES:VIEW`])
  assert.ok(!s.sidebar().includes('user-roles'), 'USER_ROLES:VIEW alone is not enough')
  assert.equal(routeAccess(findAppRoute('/security/user-roles'), s.access()), 'denied')
  s.store.reload()
  await s.answer([`${SA}.USER_ROLES:VIEW`, `${SA}.USER_ACCOUNTS:VIEW`])
  assert.ok(s.sidebar().includes('user-roles') && s.sidebar().includes('user-accounts'))
  assert.equal(routeAccess(findAppRoute('/security/user-roles/105'), s.access()), 'allowed', 'detail page (not listed) follows the same rule')
  assert.ok(!s.sidebar().includes('user-role-assignments'), 'hidden detail pages are never listed')
})

test('security pages need an MFA-verified session unless the backend reports the development exception', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  await s.answer([`${SA}.ROLES:VIEW`], { mfaVerified: false })
  assert.deepEqual(s.sidebar(), COMMON)
  assert.equal(routeAccess(findAppRoute('/security/roles'), s.access()), 'mfa_required')
  s.store.reload()
  await s.answer([`${SA}.ROLES:VIEW`], { mfaVerified: false, adminMfaRequired: false })
  assert.ok(s.sidebar().includes('roles'))
})

test('a DENY override or inactive catalogue chain (absent from effective permissions) removes the page after refresh', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  await s.answer([`${SA}.ROLES:VIEW`, `${SA}.PERMISSION_CATALOG:VIEW`])
  assert.ok(s.sidebar().includes('roles') && s.sidebar().includes('permission-catalog'))
  s.store.reload()
  await s.answer([`${SA}.PERMISSION_CATALOG:VIEW`]) // ROLES:VIEW denied or deactivated
  assert.ok(!s.sidebar().includes('roles'))
  assert.equal(routeAccess(findAppRoute('/security/roles'), s.access()), 'denied')
})

test('permissions never create navigation: only registered, implemented pages are listed', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  const allSecurity = ['USER_ACCOUNTS', 'ROLES', 'PERMISSION_CATALOG', 'ROLE_PERMISSIONS', 'USER_ROLES', 'USER_PERMISSION_OVERRIDES']
    .map((resource) => `${SA}.${resource}:VIEW`)
  await s.answer(allSecurity)
  const before = s.sidebar()
  s.store.reload()
  // ACCOUNT_RECOVERY has no page; SECURITY_AUDIT's page is not implemented (no retrieval API).
  await s.answer([...allSecurity, `${SA}.ACCOUNT_RECOVERY:ISSUE`, `${SA}.SECURITY_AUDIT:VIEW`, `${SA}.SECURITY_AUDIT:EXPORT`])
  assert.deepEqual(s.sidebar(), before)
  assert.ok(!s.sidebar().includes('security-audit'))
  assert.equal(routeAccess(appRoutes.find((r) => r.id === 'security-audit'), s.access()), 'unavailable')
  assert.deepEqual(before, ['dashboard', 'user-accounts', 'roles', 'user-roles', 'role-permissions', 'permission-catalog', 'permission-overrides', 'account-password', 'account-authenticator'])
})

test('loading and error states never list protected pages; a failed refresh denies until retried', async () => {
  const s = signedInStore()
  s.store.sync(auth)
  await s.answer([`${SA}.ROLES:VIEW`])
  s.store.reload()
  assert.ok(s.sidebar().includes('roles'), 'a refresh keeps the confirmed set visible')
  s.calls.at(-1).reject(new Error('down'))
  await settle()
  assert.equal(s.access().status, 'error')
  assert.deepEqual(s.sidebar(), COMMON)
  assert.equal(routeAccess(findAppRoute('/security/roles'), s.access()), 'error')
})

test('the sidebar and the route guard use the same shared decision', async () => {
  const sidebar = await read('../src/components/layout/Sidebar.jsx')
  assert.match(sidebar, /const sections = authorizedNavigation\(access\)/)
  const guards = await read('../src/routes/RouteGuards.jsx')
  assert.match(guards, /switch \(routeAccess\(route, access\)\)/)
})
