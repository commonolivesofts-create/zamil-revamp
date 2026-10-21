// Stage 3: security-administration contract, service, request primitives,
// presentation rules and navigation. Mocked transport only: no backend,
// Oracle or e-mail access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import {
  readCatalog, readPage, readTokenIssued, readUserDetail, readUserListItem,
} from '../src/features/security-administration/securityAdminContract.js'
import { createSecurityAdminService } from '../src/features/security-administration/securityAdminService.js'
import { createLatestRequest, createSubmissionGuard } from '../src/features/security-administration/adminRequests.js'
import { describeFailure, describeReason } from '../src/features/security-administration/adminFeedback.js'
import {
  accountActions, filterCatalog, flattenCatalog, grantablePermissions, readUserFilters, userListQuery,
} from '../src/features/security-administration/adminModel.js'
import { checkCode, checkJustification, checkSearch, readFutureInstant } from '../src/features/security-administration/adminForms.js'
import { SECURITY_ACTIONS } from '../src/features/security-administration/securityActions.js'
import {
  PERMISSIONS, appRoutes, authorizedNavigation, canAccessRoute, findAppRoute, implementedRoutes, paletteCommands, routeAccess,
} from '../src/config/appNavigation.js'
import { SESSION_TOKEN, deferred, failure, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

// ------------------------------------------------------------ fixtures (backend shapes)

const listItem = (overrides = {}) => ({
  userId: '105', employeeNumber: '2502', username: 'TEST.USER', fullName: 'Test User', department: 'IT', jobTitle: 'Engineer',
  accountStatus: 'ACTIVE', locked: false, mfaEnrolled: true, lastLoginAt: '2026-10-20T08:00:00.000Z', createdAt: '2026-10-01T08:00:00.000Z', ...overrides,
})
const pagination = (overrides = {}) => ({ page: 1, limit: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ...overrides })

const userDetail = (overrides = {}) => ({
  userId: '105',
  employeeNumber: '2502',
  account: { status: 'ACTIVE', locked: false, lockedUntil: null, failedLoginAttempts: 0, lastFailedLoginAt: null, lastLoginAt: '2026-10-20T08:00:00.000Z', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: null },
  password: { set: true, changedAt: '2026-10-01T09:00:00.000Z', expiresAt: '2027-01-01T09:00:00.000Z', expired: false },
  mfa: { enrolled: true, enrolledAt: '2026-10-01T09:05:00.000Z' },
  employee: { username: 'TEST.USER', fullName: 'Test User', email: 'test.user@example.invalid', jobTitle: 'Engineer', department: 'IT', currentEmployeeFlag: 'Y', terminationStatus: 'NOT_TERMINATED' },
  eligibility: { eligible: true, reason: null },
  classification: { protectedSuperAdministrator: false, privilegedRoleMember: false, securityAdministration: false, mfaRequired: true },
  activation: { ready: false, unmetPrerequisites: [] },
  roles: [{ roleId: '3', roleCode: 'VIEWER', roleName: 'Viewer', roleActive: true, isActive: true, expiresAt: null, effective: true, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: null }],
  activeSessions: [{ sessionId: '9001', createdAt: '2026-10-20T08:00:00.000Z', lastActivityAt: '2026-10-20T08:30:00.000Z', expiresAt: '2026-10-20T16:00:00.000Z', mfaVerified: true, ipAddress: '10.0.0.5', userAgent: 'Test browser' }],
  ...overrides,
})

const role = (overrides = {}) => ({ roleId: '3', roleCode: 'VIEWER', roleName: 'Viewer', description: null, isActive: true, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: null, ...overrides })

const catalog = () => [{
  moduleId: '1', moduleCode: 'SECURITY_ADMINISTRATION', moduleName: 'Security Administration', displayOrder: 0, isActive: true,
  resources: [{ resourceId: '11', resourceCode: 'ROLES', resourceName: 'Roles', isActive: true, permissions: [
    { permissionId: '101', actionCode: 'VIEW', description: null, isActive: true },
    { permissionId: '102', actionCode: 'CREATE', description: null, isActive: false },
  ] }],
}, {
  moduleId: '2', moduleCode: 'PRODUCTION', moduleName: 'Production', displayOrder: 1, isActive: true,
  resources: [
    { resourceId: '21', resourceCode: 'WORK_ORDERS', resourceName: 'Work orders', isActive: true, permissions: [{ permissionId: '201', actionCode: 'VIEW', description: 'See work orders', isActive: true }] },
    { resourceId: '22', resourceCode: 'SHIFTS', resourceName: 'Shifts', isActive: false, permissions: [{ permissionId: '202', actionCode: 'VIEW', description: null, isActive: true }] },
  ],
}]

// A service over the real shared API client with a recording fetch.
function setup(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  let unauthorized = 0
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => { unauthorized += 1 } })
  return { service: createSecurityAdminService({ client }), calls, unauthorized: () => unauthorized }
}
const body = (call) => (call.init.body === undefined ? undefined : JSON.parse(call.init.body))
const csrf = (call) => call.init.headers.get('X-CSRF-Token')

// ------------------------------------------------------------ contract

test('user list and details keep only documented fields, with string IDs', () => {
  const page = readPage({ data: [listItem({ passwordHash: 'x', mfaTotpSecret: 'y' })], pagination: pagination() }, readUserListItem)
  assert.equal(page.items[0].userId, '105')
  assert.equal('passwordHash' in page.items[0] || 'mfaTotpSecret' in page.items[0], false)
  const detail = readUserDetail({ ...userDetail(), passwordHash: 'x', account: { ...userDetail().account, passwordHash: 'x' } })
  assert.equal(JSON.stringify(detail).includes('passwordHash'), false)
  assert.equal(detail.activeSessions[0].sessionId, '9001')
  assert.ok(Object.isFrozen(detail) && Object.isFrozen(detail.roles))
})

test('malformed administration responses are rejected as a whole', () => {
  for (const [name, run] of [
    ['numeric user ID', () => readUserListItem(listItem({ userId: 105 }))],
    ['unknown status', () => readUserListItem(listItem({ accountStatus: 'DELETED' }))],
    ['missing pagination', () => readPage({ data: [listItem()], pagination: null }, readUserListItem)],
    ['non-boolean MFA', () => readUserDetail(userDetail({ mfa: { enrolled: 'yes', enrolledAt: null } }))],
    ['bad session ID', () => readUserDetail(userDetail({ activeSessions: [{ ...userDetail().activeSessions[0], sessionId: 'abc' }] }))],
    ['catalog code', () => readCatalog([{ ...catalog()[0], moduleCode: 'security' }])],
  ]) {
    assert.throws(run, { code: 'INVALID_RESPONSE' }, name)
  }
})

test('issued recovery links are confirmed without any token reaching the application', () => {
  const issued = readTokenIssued({ userId: '105', actionType: 'PASSWORD_RESET', expiresAt: '2026-10-21T08:15:00.000Z', delivered: true, authorizedBySuperAdministrator: false, token: 'secret-token' })
  assert.deepEqual(Object.keys(issued).sort(), ['actionType', 'authorizedBySuperAdministrator', 'delivered', 'expiresAt', 'userId'])
  assert.throws(() => readTokenIssued({ userId: '105', actionType: 'PASSWORD_RESET', delivered: false, authorizedBySuperAdministrator: false }), { code: 'INVALID_RESPONSE' })
})

// ------------------------------------------------------------ service: user accounts

test('user list: GET /users with the backend filters and pagination, no CSRF', async () => {
  const ctx = setup(() => success([listItem()], 200, { pagination: pagination() }))
  const result = await ctx.service.listUsers(userListQuery(readUserFilters(new URLSearchParams('search=te&status=ACTIVE&mfaEnrolled=false&page=2&sortBy=lastLoginAt&sortOrder=desc'))))
  const url = new URL(ctx.calls[0].url, 'https://local.invalid')
  assert.equal(url.pathname, '/api/v1/users')
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: '2', limit: '25', search: 'te', status: 'ACTIVE', mfaEnrolled: 'false', sortBy: 'lastLoginAt', sortOrder: 'desc' })
  assert.equal(ctx.calls[0].init.method, 'GET')
  assert.equal(csrf(ctx.calls[0]), null)
  assert.equal(result.items.length, 1)
})

test('provisioning: candidates search, then POST /users with only the employee number and CSRF', async () => {
  const ctx = setup((url) => url.includes('candidates')
    ? success([{ employeeNumber: '3001', username: 'NEW.USER', fullName: 'New User', department: null, jobTitle: null, currentEmployeeFlag: 'Y', terminationStatus: null, userId: null, accountStatus: null, provisionable: true, ineligibilityReason: null }], 200, { pagination: pagination() })
    : success(userDetail({ userId: '300', employeeNumber: '3001', account: { ...userDetail().account, status: 'PENDING' } }), 201))
  const candidates = await ctx.service.listCandidates({ search: 'new', page: 1, limit: 10, hasAccount: false })
  assert.equal(candidates.items[0].provisionable, true)
  const candidatesUrl = new URL(ctx.calls[0].url, 'https://local.invalid')
  assert.equal(candidatesUrl.pathname, '/api/v1/users/candidates')
  assert.deepEqual(Object.fromEntries(candidatesUrl.searchParams), { page: '1', limit: '10', search: 'new', hasAccount: 'false' })
  const created = await ctx.service.provisionUser('3001')
  assert.equal(ctx.calls[1].init.method, 'POST')
  assert.match(ctx.calls[1].url, /\/api\/v1\/users$/)
  assert.deepEqual(body(ctx.calls[1]), { employeeNumber: '3001' })
  assert.equal(csrf(ctx.calls[1]), SESSION_TOKEN)
  assert.equal(created.account.status, 'PENDING')
})

test('status changes: activate and disable are CSRF-protected POSTs that report what changed', async () => {
  const ctx = setup((url) => url.endsWith('/disable')
    ? success({ ...userDetail({ account: { ...userDetail().account, status: 'DISABLED' } }), changed: true, sessionsRevoked: 2 })
    : success({ ...userDetail(), changed: false }))
  const activated = await ctx.service.activateUser('105')
  const disabled = await ctx.service.disableUser('105')
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['POST', '/api/v1/users/105/activate'], ['POST', '/api/v1/users/105/disable'],
  ])
  assert.ok(ctx.calls.every((call) => csrf(call) === SESSION_TOKEN))
  assert.deepEqual(body(ctx.calls[0]), {})
  assert.equal(activated.changed, false)
  assert.equal(disabled.sessionsRevoked, 2)
  assert.equal(disabled.user.account.status, 'DISABLED')
})

test('session revocation: all sessions or one session via DELETE', async () => {
  const ctx = setup((url) => url.endsWith('/sessions')
    ? success({ userId: '105', sessionsRevoked: 3 })
    : success({ userId: '105', sessionId: '9001', revoked: true, changed: true }))
  assert.equal((await ctx.service.revokeUserSessions('105')).sessionsRevoked, 3)
  assert.equal((await ctx.service.revokeUserSession('105', '9001')).changed, true)
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['DELETE', '/api/v1/users/105/sessions'], ['DELETE', '/api/v1/users/105/sessions/9001'],
  ])
  assert.ok(ctx.calls.every((call) => csrf(call) === SESSION_TOKEN))
})

test('protected recovery issuance sends the explicit employee-number confirmation', async () => {
  const ctx = setup(() => success({ userId: '105', actionType: 'MFA_RECOVERY', expiresAt: '2026-10-21T08:15:00.000Z', delivered: true, authorizedBySuperAdministrator: true }, 202))
  const issued = await ctx.service.issueRecovery('105', { purpose: 'MFA_RECOVERY', confirmEmployeeNumber: '2502' })
  assert.match(ctx.calls[0].url, /\/api\/v1\/users\/105\/recovery$/)
  assert.deepEqual(body(ctx.calls[0]), { purpose: 'MFA_RECOVERY', confirmEmployeeNumber: '2502' })
  assert.equal(csrf(ctx.calls[0]), SESSION_TOKEN)
  assert.equal(issued.authorizedBySuperAdministrator, true)
  await ctx.service.issuePasswordSetup('105', { confirmEmployeeNumber: '2502' }).catch(() => {})
  assert.match(ctx.calls[1].url, /\/api\/v1\/users\/105\/password-setup$/)
  assert.deepEqual(body(ctx.calls[1]), { confirmEmployeeNumber: '2502' })
})

test('backend hierarchy refusals for recovery are surfaced, never bypassed', async () => {
  for (const [status, code, message] of [
    [403, 'PROTECTED_ACCOUNT', 'Only the Super Administrator can authorize recovery of this account.'],
    [403, 'MFA_RECENT_VERIFICATION_REQUIRED', 'Verify your authenticator again (sign in within the last 10 minutes) to authorize this recovery.'],
    [400, 'CONFIRMATION_MISMATCH', 'The confirmation does not match the selected account'],
    [503, 'DELIVERY_UNAVAILABLE', 'Account recovery messages cannot be sent right now. Contact your administrator.'],
  ]) {
    const ctx = setup(() => failure(status, code, message))
    const error = await ctx.service.issueRecovery('105', { purpose: 'PASSWORD_RESET', confirmEmployeeNumber: '2502' }).catch((caught) => caught)
    assert.equal(error.code, code)
    assert.equal(describeFailure(error).message, message)
    assert.equal(ctx.calls.length, 1, 'never retried')
  }
})

test('invalid record IDs are refused before any request is sent', async () => {
  const ctx = setup(() => success({}))
  for (const id of ['0', '../users', '105/disable', '', 105, null, '1e3', '12345678901234567890']) {
    await assert.rejects(ctx.service.disableUser(id), { code: 'INVALID_ID' }, String(id))
    await assert.rejects(ctx.service.revokeUserSession('105', id), { code: 'INVALID_ID' }, String(id))
  }
  assert.equal(ctx.calls.length, 0)
})

test('a 401 from an administration request invalidates the signed-in session', async () => {
  const ctx = setup(() => failure(401, 'UNAUTHENTICATED', 'Your session has expired.'))
  const error = await ctx.service.getUser('105').catch((caught) => caught)
  assert.equal(ctx.unauthorized(), 1)
  assert.equal(describeFailure(error).sessionEnded, true)
  await ctx.service.activateUser('105').catch(() => {})
  assert.equal(ctx.unauthorized(), 2)
})

// ------------------------------------------------------------ service: roles, grants, assignments, catalogue, overrides

test('roles: list, create, update, activate and deactivate', async () => {
  const ctx = setup((url, init) => init.method === 'GET'
    ? success([role()], 200, { pagination: pagination() })
    : success(role({ roleCode: 'AUDITOR', roleId: '7' }), init.method === 'POST' && url.endsWith('/roles') ? 201 : 200))
  await ctx.service.listRoles({ page: 1, limit: 25 })
  await ctx.service.createRole({ roleCode: 'AUDITOR', roleName: 'Auditor', description: '' })
  await ctx.service.updateRole('7', { roleName: 'Auditors' })
  await ctx.service.activateRole('7')
  await ctx.service.deactivateRole('7')
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['GET', '/api/v1/access-control/roles'],
    ['POST', '/api/v1/access-control/roles'],
    ['PATCH', '/api/v1/access-control/roles/7'],
    ['POST', '/api/v1/access-control/roles/7/activate'],
    ['POST', '/api/v1/access-control/roles/7/deactivate'],
  ])
  assert.deepEqual(body(ctx.calls[1]), { roleCode: 'AUDITOR', roleName: 'Auditor', description: null })
  assert.deepEqual(body(ctx.calls[2]), { roleName: 'Auditors' })
  assert.ok(ctx.calls.slice(1).every((call) => csrf(call) === SESSION_TOKEN))
})

test('role permissions: grant (PUT) and revoke (DELETE) use backend permission IDs and report no-ops', async () => {
  const ctx = setup((url, init) => init.method === 'GET'
    ? success([{ permissionId: '201', moduleCode: 'PRODUCTION', resourceCode: 'WORK_ORDERS', actionCode: 'VIEW', isActive: true, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: null }])
    : success({ roleId: '3', permissionId: '201', granted: init.method === 'PUT', changed: false }))
  const grants = await ctx.service.listRolePermissions('3')
  assert.equal(grants[0].permissionId, '201')
  assert.equal((await ctx.service.grantRolePermission('3', '201')).changed, false)
  assert.equal((await ctx.service.revokeRolePermission('3', '201')).granted, false)
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['GET', '/api/v1/access-control/roles/3/permissions'],
    ['PUT', '/api/v1/access-control/roles/3/permissions/201'],
    ['DELETE', '/api/v1/access-control/roles/3/permissions/201'],
  ])
})

test('user roles: list, assign with an optional expiry, revoke, and effective permissions', async () => {
  const ctx = setup((url, init) => {
    if (url.endsWith('/effective-permissions')) return success([{ permissionId: '201', moduleCode: 'PRODUCTION', resourceCode: 'WORK_ORDERS', actionCode: 'VIEW', viaRole: true, viaOverride: false }])
    if (init.method === 'GET') return success(userDetail().roles)
    if (init.method === 'PUT') return success({ userId: '105', roleId: '3', roleCode: 'VIEWER', assigned: true, expiresAt: '2027-01-01T00:00:00.000Z' })
    return success({ userId: '105', roleId: '3', assigned: false, changed: true })
  })
  assert.equal((await ctx.service.listUserRoles('105'))[0].effective, true)
  await ctx.service.assignUserRole('105', '3', { expiresAt: '2027-01-01T00:00:00.000Z' })
  await ctx.service.assignUserRole('105', '3')
  assert.equal((await ctx.service.unassignUserRole('105', '3')).changed, true)
  const effective = await ctx.service.getUserEffectivePermissions('105')
  assert.equal(effective[0].permissionId, '201')
  assert.deepEqual(body(ctx.calls[1]), { expiresAt: '2027-01-01T00:00:00.000Z' })
  assert.deepEqual(body(ctx.calls[2]), {}, 'no expiry: empty body')
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['GET', '/api/v1/access-control/users/105/roles'],
    ['PUT', '/api/v1/access-control/users/105/roles/3'],
    ['PUT', '/api/v1/access-control/users/105/roles/3'],
    ['DELETE', '/api/v1/access-control/users/105/roles/3'],
    ['GET', '/api/v1/access-control/users/105/effective-permissions'],
  ])
})

test('permission catalog: read, create entries and activate/deactivate with the backend operations only', async () => {
  const ctx = setup((url, init) => {
    if (init.method === 'GET') return success(catalog())
    if (url.endsWith('/modules')) return success({ moduleId: '3', moduleCode: 'QUALITY' }, 201)
    if (url.endsWith('/resources')) return success({ resourceId: '31', moduleCode: 'QUALITY', resourceCode: 'INSPECTIONS' }, 201)
    if (url.endsWith('/permissions')) return success({ permissionId: '301', moduleCode: 'QUALITY', resourceCode: 'INSPECTIONS', actionCode: 'VIEW' }, 201)
    return success({ permissionId: '201', isActive: false, changed: true })
  })
  assert.equal((await ctx.service.getCatalog()).length, 2)
  await ctx.service.createModule({ moduleCode: 'QUALITY', moduleName: 'Quality', description: '', displayOrder: 5 })
  await ctx.service.createResource('3', { resourceCode: 'INSPECTIONS', resourceName: 'Inspections' })
  await ctx.service.createPermission('31', { actionCode: 'VIEW' })
  assert.equal((await ctx.service.setCatalogActive('permission', '201', false)).changed, true)
  assert.deepEqual(body(ctx.calls[1]), { moduleCode: 'QUALITY', moduleName: 'Quality', description: null, displayOrder: 5 })
  assert.deepEqual(body(ctx.calls[4]), { isActive: false })
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['GET', '/api/v1/access-control/catalog'],
    ['POST', '/api/v1/access-control/modules'],
    ['POST', '/api/v1/access-control/modules/3/resources'],
    ['POST', '/api/v1/access-control/resources/31/permissions'],
    ['PATCH', '/api/v1/access-control/permissions/201'],
  ])
  await assert.rejects(ctx.service.setCatalogActive('role', '7', false), { code: 'INVALID_REQUEST' })
  await assert.rejects(ctx.service.setCatalogActive('module', '3', 'false'), { code: 'INVALID_REQUEST' })
})

test('user overrides: list, set with justification, revoke', async () => {
  const ctx = setup((url, init) => {
    if (init.method === 'GET') return success([{ permissionId: '201', moduleCode: 'PRODUCTION', resourceCode: 'WORK_ORDERS', actionCode: 'VIEW', effect: 'DENY', justification: 'Temporary', isActive: true, expiresAt: null, createdAt: '2026-10-02T08:00:00.000Z', updatedAt: null }])
    if (init.method === 'PUT') return success({ userId: '105', permissionId: '201', effect: 'DENY', expiresAt: null, isActive: true })
    return success({ userId: '105', permissionId: '201', isActive: false, changed: true })
  })
  assert.equal((await ctx.service.listUserOverrides('105'))[0].effect, 'DENY')
  await ctx.service.setUserOverride('105', '201', { effect: 'DENY', justification: 'Temporary' })
  assert.deepEqual(body(ctx.calls[1]), { effect: 'DENY', justification: 'Temporary' })
  assert.equal((await ctx.service.revokeUserOverride('105', '201')).changed, true)
  assert.deepEqual(ctx.calls.map((call) => [call.init.method, new URL(call.url, 'https://l.invalid').pathname]), [
    ['GET', '/api/v1/access-control/users/105/overrides'],
    ['PUT', '/api/v1/access-control/users/105/overrides/201'],
    ['DELETE', '/api/v1/access-control/users/105/overrides/201'],
  ])
})

// ------------------------------------------------------------ duplicate submissions, stale responses, outcomes

test('duplicate submissions are ignored while one is pending', async () => {
  const guard = createSubmissionGuard()
  const pending = deferred()
  let sent = 0
  const first = guard.run(() => { sent += 1; return pending.promise })
  const second = await guard.run(() => { sent += 1; return 'again' })
  assert.equal(second.status, 'ignored')
  assert.equal(sent, 1)
  assert.equal(guard.isPending(), true)
  pending.resolve({ changed: true })
  assert.deepEqual(await first, { status: 'success', value: { changed: true } })
  assert.equal(guard.isPending(), false)
  assert.equal((await guard.run(async () => 'next')).status, 'success', 'a later submission is allowed')
})

test('an unknown outcome is neither success nor failure, and is never retried', async () => {
  const guard = createSubmissionGuard()
  for (const error of [
    new ApiError('The request timed out.', { code: 'TIMEOUT' }),
    new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }),
    new ApiError('The service is temporarily unavailable.', { code: 'INTERNAL_ERROR', status: 500 }),
  ]) {
    let attempts = 0
    const outcome = await guard.run(async () => { attempts += 1; throw error })
    assert.equal(outcome.status, 'unknown', error.code)
    assert.equal(attempts, 1)
    assert.equal(describeFailure(error).kind, 'unknown')
    assert.match(describeFailure(error).message, /did not confirm/)
  }
  const refused = await guard.run(async () => { throw new ApiError('Conflict', { code: 'CONFLICT', status: 409 }) })
  assert.equal(refused.status, 'failed')
})

test('latest request wins: a superseded list or record response is never applied', () => {
  const request = createLatestRequest()
  const first = request.start()
  const second = request.start()
  assert.equal(first.signal.aborted, true)
  assert.equal(first.isCurrent(), false)
  assert.equal(second.isCurrent(), true)
  request.cancel()
  assert.equal(second.isCurrent(), false)
})

test('failures are explained from the backend envelope; permission loss refreshes access', () => {
  const forbidden = describeFailure(new ApiError('You do not have permission for this action.', { code: 'FORBIDDEN', status: 403 }))
  assert.equal(forbidden.permissionChanged, true)
  const protectedAccount = describeFailure(new ApiError('Only the Super Administrator can change this account.', { code: 'PROTECTED_ACCOUNT', status: 403 }))
  assert.equal(protectedAccount.permissionChanged, undefined)
  assert.equal(protectedAccount.message, 'Only the Super Administrator can change this account.')
  const conflict = describeFailure(new ApiError('The employee is not eligible for an application account', {
    code: 'EMPLOYEE_NOT_ELIGIBLE', status: 409, details: [{ field: 'employeeNumber', message: 'EMPLOYEE_TERMINATED' }],
  }))
  assert.deepEqual(conflict.details, ['The employee has been terminated.'])
  const validation = describeFailure(new ApiError('Validation failed', { code: 'VALIDATION_ERROR', status: 422, details: [{ field: 'roleCode', message: '"roleCode" is required' }] }))
  assert.deepEqual(validation.details, ['"roleCode" is required'])
  const limited = describeFailure(new ApiError('Too many attempts. Please wait and try again.', { code: 'RATE_LIMITED', status: 429, retryAfterSeconds: 120 }))
  assert.match(limited.message, /about 2 minute/)
  assert.equal(describeReason('PASSWORD_NOT_SET'), 'The employee has not set a password yet.')
  assert.equal(describeReason('SOMETHING_NEW'), 'Something new')
})

// ------------------------------------------------------------ presentation rules

test('URL filters are limited to values the backend accepts', () => {
  const filters = readUserFilters(new URLSearchParams('page=-3&status=DELETED&mfaEnrolled=maybe&locked=true&sortBy=password&sortOrder=sideways&search=%20a%20'))
  assert.deepEqual({ ...filters }, { page: 1, search: 'a', status: '', mfaEnrolled: '', locked: 'true', sortBy: 'employeeNumber', sortOrder: 'asc' })
  assert.equal(userListQuery(filters).search, undefined, 'a 1-character search is not sent')
  assert.equal(readUserFilters(new URLSearchParams('page=2abc')).page, 1)
})

test('client-side checks mirror the backend validation', () => {
  assert.equal(checkSearch('a').error, 'Enter at least 2 characters.')
  assert.equal(checkSearch('  ').term, '')
  assert.equal(checkSearch('ab').error, null)
  assert.equal(checkCode('', 60), 'Code is required.')
  assert.match(checkCode('lower', 60), /upper-case/)
  assert.match(checkCode('1ABC', 60), /upper-case/)
  assert.match(checkCode('A'.repeat(61), 60), /at most 60/)
  assert.equal(checkCode('ROLE_1', 60), null)
  assert.equal(checkJustification('  '), 'A justification is required.')
  assert.equal(readFutureInstant('').value, null)
  assert.equal(readFutureInstant('2020-01-01T00:00').error, 'The expiry must be in the future.')
  assert.equal(readFutureInstant('not a date').error, 'Enter a valid date and time.')
  assert.match(readFutureInstant('2999-06-15T12:00').value, /^2999-06-1[456]T\d{2}:\d{2}:00\.000Z$/, 'an ISO instant, whatever the local time zone')
})

test('catalog grouping, search and grantable permissions use only catalog data', () => {
  const data = readCatalog(catalog())
  assert.equal(flattenCatalog(data).length, 4)
  assert.deepEqual(grantablePermissions(data).map((item) => item.key), ['SECURITY_ADMINISTRATION.ROLES:VIEW', 'PRODUCTION.WORK_ORDERS:VIEW'], 'inactive action or resource excluded')
  assert.deepEqual(grantablePermissions(data, { excludeIds: ['101'] }).map((item) => item.permissionId), ['201'])
  assert.deepEqual(grantablePermissions(data, { search: 'work' }).map((item) => item.permissionId), ['201'])
  const filtered = filterCatalog(data, { search: 'shifts' })
  assert.deepEqual(filtered.map((module) => module.moduleCode), ['PRODUCTION'])
  assert.deepEqual(filtered[0].resources.map((resource) => resource.resourceCode), ['SHIFTS'])
  const activeOnly = filterCatalog(data, { includeInactive: false })
  assert.deepEqual(activeOnly[1].resources.map((resource) => resource.resourceCode), ['WORK_ORDERS'])
  assert.deepEqual(filterCatalog(data, { search: 'nothing-like-this' }), [])
})

test('account action visibility follows effective permissions, account state and classification', () => {
  const all = (key) => Object.values(SECURITY_ACTIONS).includes(key)
  const none = () => false
  const user = readUserDetail(userDetail())
  assert.deepEqual(accountActions(user, { can: all, selfId: '1' }), {
    manageable: true, activate: false, disable: true, revokeSessions: true, passwordSetup: false, recovery: true,
  })
  assert.deepEqual(accountActions(user, { can: none, selfId: '1' }), {
    manageable: true, activate: false, disable: false, revokeSessions: false, passwordSetup: false, recovery: false,
  })
  const pending = readUserDetail(userDetail({ account: { ...userDetail().account, status: 'PENDING' }, password: { set: false, changedAt: null, expiresAt: null, expired: null } }))
  assert.equal(accountActions(pending, { can: all, selfId: '1' }).passwordSetup, true)
  assert.equal(accountActions(pending, { can: all, selfId: '1' }).activate, true)
  assert.equal(accountActions(pending, { can: all, selfId: '1' }).recovery, false, 'recovery only for active accounts')
  const only = (key) => (candidate) => candidate === key
  assert.equal(accountActions(user, { can: only(SECURITY_ACTIONS.ACCOUNT_RECOVERY_ISSUE), selfId: '1' }).recovery, true)
  assert.equal(accountActions(user, { can: only(SECURITY_ACTIONS.ACCOUNT_RECOVERY_ISSUE), selfId: '1' }).disable, false)
  for (const blocked of [
    accountActions(user, { can: all, selfId: '105' }),
    accountActions(readUserDetail(userDetail({ classification: { ...userDetail().classification, protectedSuperAdministrator: true } })), { can: all, selfId: '1' }),
  ]) {
    assert.deepEqual(Object.values(blocked).filter(Boolean), [], 'own and protected accounts offer no actions')
  }
})

// ------------------------------------------------------------ navigation

const ready = (keys, mfaVerified = true) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified, has: (key) => set.has(key) }
}
const ADMIN = ready(Object.values(SECURITY_ACTIONS))
const listedSecurity = (access) => authorizedNavigation(access).find((section) => section.id === 'security')?.items.map((item) => item.id) || []

test('implemented security pages are routed and listed only with their permissions and MFA', () => {
  assert.deepEqual(listedSecurity(ADMIN), ['user-accounts', 'roles', 'user-roles', 'role-permissions', 'permission-catalog', 'permission-overrides'])
  assert.deepEqual(listedSecurity(ready(Object.values(SECURITY_ACTIONS), false)), [], 'no MFA-verified session')
  assert.deepEqual(listedSecurity(ready(['PRODUCTION.WORK_ORDERS:VIEW'])), [], 'ordinary employee')
  assert.deepEqual(listedSecurity(ready([])), [])
  assert.deepEqual(listedSecurity({ status: 'loading', has: () => false }), [])
  assert.deepEqual(listedSecurity({ status: 'error', has: () => false }), [])
  assert.deepEqual(listedSecurity(ready([PERMISSIONS.ROLES_VIEW])), ['roles'])
  assert.deepEqual(listedSecurity(ready([PERMISSIONS.ROLE_PERMISSIONS_VIEW])), [], 'the role picker also needs ROLES:VIEW')
  assert.deepEqual(listedSecurity(ready([PERMISSIONS.ROLE_PERMISSIONS_VIEW, PERMISSIONS.ROLES_VIEW])), ['roles', 'role-permissions'])
  assert.deepEqual(listedSecurity(ready([PERMISSIONS.USER_ROLES_VIEW])), [], 'the account picker also needs USER_ACCOUNTS:VIEW')
})

test('detail pages are guarded like their list but never listed or searchable', () => {
  const details = appRoutes.filter((route) => route.nav === false)
  assert.deepEqual(details.map((route) => route.path), ['/security/users/:userId', '/security/user-roles/:userId', '/security/permission-overrides/:userId'])
  for (const route of details) {
    assert.equal(route.implemented, true)
    assert.equal(routeAccess(route, ready([route.permission], false)), 'mfa_required')
    assert.equal(routeAccess(route, ready([])), 'denied')
    assert.equal(canAccessRoute(route, ready([route.permission])), true)
  }
  assert.equal(paletteCommands(ADMIN, 'authenticated').some((command) => command.path.includes(':')), false)
  assert.equal(findAppRoute('/security/users/105')?.id, 'user-account')
  assert.equal(findAppRoute('/security/users/105/')?.id, 'user-account')
  assert.equal(findAppRoute('/security/users')?.id, 'user-accounts')
  assert.equal(findAppRoute('/security/permission-overrides/7')?.id, 'user-permission-overrides')
  assert.equal(findAppRoute('/security/users/105/extra'), null)
  assert.equal(findAppRoute('/security/users//'), findAppRoute('/security/users'), 'trailing slashes')
})

test('every implemented route is registered under the shared guard with its own permission', async () => {
  const router = await read('../src/app/router.jsx')
  for (const route of implementedRoutes) {
    assert.ok(router.includes(`{ path: '${route.path.slice(1)}', handle: { routeId: '${route.id}' }, element:`), route.id)
  }
  const securityPermissions = new Set(implementedRoutes.filter((route) => route.section === 'security').map((route) => route.permission))
  assert.deepEqual([...securityPermissions].sort(), [
    PERMISSIONS.PERMISSION_CATALOG_VIEW, PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLE_PERMISSIONS_VIEW,
    PERMISSIONS.USER_ACCOUNTS_VIEW, PERMISSIONS.USER_PERMISSION_OVERRIDES_VIEW, PERMISSIONS.USER_ROLES_VIEW,
  ].sort())
})

// ------------------------------------------------------------ missing backend capability

test('security audit stays unavailable: no retrieval API, no page, no menu item', async () => {
  const audit = appRoutes.find((route) => route.id === 'security-audit')
  assert.equal(audit.implemented, false)
  assert.equal(routeAccess(audit, ADMIN), 'unavailable')
  assert.equal(paletteCommands(ready([PERMISSIONS.SECURITY_AUDIT_VIEW]), 'authenticated').some((command) => command.id === 'security-audit'), false)
  assert.equal((await read('../src/app/router.jsx')).includes("'security/audit'"), false)
  assert.equal(/audit/i.test((await read('../src/features/security-administration/securityAdminService.js')).replace(/\/\/.*$/gm, '')), false)
})

// ------------------------------------------------------------ button-level permissions and production integrity

test('every management button is gated by its own action permission', async () => {
  const pages = '../src/features/security-administration/pages/'
  const expectations = {
    'UserAccountsPage.jsx': ['USER_ACCOUNTS_CREATE'],
    'UserAccountDetailPage.jsx': ['USER_ROLES_VIEW', 'USER_PERMISSION_OVERRIDES_VIEW'],
    'RolesPage.jsx': ['ROLES_CREATE', 'ROLES_UPDATE', 'ROLES_DEACTIVATE', 'ROLE_PERMISSIONS_VIEW'],
    'RolePermissionsPage.jsx': ['ROLE_PERMISSIONS_GRANT', 'ROLE_PERMISSIONS_REVOKE', 'PERMISSION_CATALOG_VIEW'],
    'UserRoleAssignmentsPage.jsx': ['USER_ROLES_ASSIGN', 'USER_ROLES_REVOKE', 'ROLES_VIEW'],
    'UserOverridesPage.jsx': ['USER_PERMISSION_OVERRIDES_GRANT', 'USER_PERMISSION_OVERRIDES_REVOKE', 'PERMISSION_CATALOG_VIEW', 'USER_ROLES_VIEW'],
    'PermissionCatalogPage.jsx': ['PERMISSION_CATALOG_MANAGE'],
  }
  for (const [file, keys] of Object.entries(expectations)) {
    const source = await read(`${pages}${file}`)
    for (const key of keys) assert.ok(source.includes(`SECURITY_ACTIONS.${key}`), `${file} checks ${key}`)
  }
  const model = await read('../src/features/security-administration/adminModel.js')
  for (const key of ['USER_ACCOUNTS_ACTIVATE', 'USER_ACCOUNTS_DISABLE', 'USER_ACCOUNTS_REVOKE_SESSIONS', 'USER_ACCOUNTS_CREATE', 'ACCOUNT_RECOVERY_ISSUE']) {
    assert.ok(model.includes(`SECURITY_ACTIONS.${key}`), key)
  }
})

test('the module contains no fabricated data, hardcoded identities or unsafe handling', async () => {
  const files = []
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
      if (entry.isDirectory()) await walk(url)
      else files.push(url)
    }
  }
  await walk(new URL('../src/features/security-administration/', import.meta.url))
  assert.ok(files.length >= 20)
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const name = file.pathname.split('/security-administration/')[1]
    for (const pattern of [
      /localStorage|sessionStorage|indexedDB|document\.cookie/, /console\./, /dangerouslySetInnerHTML/,
      /Math\.random/, /\bmock|\bsample|\bdummy|\bfake|lorem/i, /2172|zaid/i,
      /SUPER_ADMINISTRATOR|MAIN_ADMINISTRATOR/, /\btoken\b\s*[:=]/i,
    ]) {
      assert.equal(pattern.test(source), false, `${name} matches ${pattern}`)
    }
  }
})
