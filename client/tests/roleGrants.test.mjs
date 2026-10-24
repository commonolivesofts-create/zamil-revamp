// Phase 2C: granting several existing permissions to a role with one confirmation, sent
// sequentially through the existing single-grant API with an accurate result per permission.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { describeFailure } from '../src/features/security-administration/adminFeedback.js'
import { createSubmissionGuard } from '../src/features/security-administration/adminRequests.js'
import { createSecurityAdminService } from '../src/features/security-administration/securityAdminService.js'
import {
  GRANT_RESULT, ROLE_GRANT_LIST_LIMIT, grantDataProblem, grantListMayBeIncomplete, grantOptions,
  grantPermissionsSequentially, summarizeGrantResults, toggleGrant, validSelection,
} from '../src/features/security-administration/roleGrants.js'
import { CATALOG_ROW_LIMIT } from '../src/features/security-administration/catalogActions.js'
import { recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const SA = 'SECURITY_ADMINISTRATION'
const permission = (permissionId, actionCode, isActive = true, description = null) => ({ permissionId, actionCode, isActive, description })

// Catalogue shaped like readCatalog(): one active security module, an inactive resource, an
// inactive permission and an inactive module (never grantable).
const catalog = [
  {
    moduleId: '1', moduleCode: SA, moduleName: 'Security Administration', isActive: true,
    resources: [
      { resourceId: '10', resourceCode: 'USER_ACCOUNTS', resourceName: 'User Accounts', isActive: true,
        permissions: [permission('101', 'VIEW', true, 'View user accounts'), permission('102', 'CREATE'), permission('103', 'DISABLE', false)] },
      { resourceId: '11', resourceCode: 'ROLES', resourceName: 'Roles', isActive: true,
        permissions: [permission('111', 'VIEW'), permission('112', 'UPDATE')] },
      { resourceId: '12', resourceCode: 'SECURITY_AUDIT', resourceName: 'Security Audit', isActive: false,
        permissions: [permission('121', 'VIEW')] },
    ],
  },
  {
    moduleId: '2', moduleCode: 'RETIRED_MODULE', moduleName: 'Retired', isActive: false,
    resources: [{ resourceId: '20', resourceCode: 'THINGS', resourceName: 'Things', isActive: true, permissions: [permission('201', 'VIEW')] }],
  },
]
// The role actively holds 101 and once held 111 (revoked).
const grants = [{ permissionId: '101', isActive: true }, { permissionId: '111', isActive: false }]
const data = { catalog, grants }

// ---------------------------------------------------------------- options and selection

test('only active catalogue chains are offered, with the role\'s grant state, and search works on every field', () => {
  const options = grantOptions(catalog, grants)
  assert.deepEqual(options.map((o) => [o.permissionId, o.grantState]), [['101', 'granted'], ['102', null], ['111', 'revoked'], ['112', null]])
  assert.ok(!options.some((o) => ['103', '121', '201'].includes(o.permissionId)), 'inactive permission, resource or module never offered')
  const search = (term) => grantOptions(catalog, grants, term).map((o) => o.permissionId)
  assert.deepEqual(search('roles'), ['111', '112'], 'resource')
  assert.deepEqual(search('security_administration.user_accounts:create'), ['102'], 'permission key')
  assert.deepEqual(search('view user'), ['101'], 'description')
  assert.deepEqual(search('Security Administration'), ['101', '102', '111', '112'], 'module name')
})

test('active grants cannot be selected, revoked ones can be reactivated, nothing is selected twice', () => {
  let selected = []
  selected = toggleGrant(selected, '101', data)
  assert.deepEqual(selected, [], 'actively granted')
  selected = toggleGrant(selected, '111', data)
  selected = toggleGrant(selected, '102', data)
  selected = toggleGrant(selected, '112', data)
  assert.deepEqual(selected, ['111', '102', '112'])
  assert.deepEqual(toggleGrant(selected, '103', data), selected, 'inactive permission')
  assert.deepEqual(toggleGrant(selected, '999', data), selected, 'unknown ID')
  selected = toggleGrant(selected, '102', data)
  assert.deepEqual(selected, ['111', '112'], 'deselect')
  // The selection is held by ID, independent of any search; a refresh that shows a selected
  // permission as already granted drops it.
  assert.deepEqual(validSelection(['111', '112'], data), ['111', '112'])
  assert.deepEqual(validSelection(['111', '112'], { catalog, grants: [...grants, { permissionId: '112', isActive: true }] }), ['111'])
})

test('possibly truncated catalogue or grant lists refuse granting', () => {
  assert.equal(grantDataProblem(data), null)
  const bigCatalog = [{ ...catalog[0], resources: [{ ...catalog[0].resources[0], permissions: Array.from({ length: CATALOG_ROW_LIMIT }, (_, i) => permission(String(1000 + i), `A${i}`)) }] }]
  assert.match(grantDataProblem({ catalog: bigCatalog, grants }), /catalogue reached its display limit/)
  const manyGrants = Array.from({ length: ROLE_GRANT_LIST_LIMIT }, (_, i) => ({ permissionId: String(5000 + i), isActive: i % 2 === 0 }))
  assert.equal(grantListMayBeIncomplete(manyGrants), true)
  assert.equal(grantListMayBeIncomplete(manyGrants.slice(1)), false)
  assert.match(grantDataProblem({ catalog, grants: manyGrants }), /grant-list display limit/)
})

// ---------------------------------------------------------------- sequential grants

function fakeGrant(responses = {}) {
  const calls = []
  let inFlight = 0
  let maxInFlight = 0
  const grant = async (roleId, permissionId) => {
    calls.push([roleId, permissionId])
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setImmediate(resolve))
    inFlight -= 1
    const response = responses[permissionId]
    if (response instanceof Error) throw response
    return { roleId, permissionId, granted: true, changed: response !== 'unchanged' }
  }
  return { grant, calls, maxInFlight: () => maxInFlight }
}

test('grants one at a time for the intended role, without duplicates, mapping changed/unchanged', async () => {
  const api = fakeGrant({ 112: 'unchanged' })
  const outcome = await grantPermissionsSequentially({ roleId: '7', permissionIds: ['111', '102', '111', '112'], grant: api.grant })
  assert.deepEqual(api.calls, [['7', '111'], ['7', '102'], ['7', '112']], 'ordered, one role, duplicate ID sent once')
  assert.equal(api.maxInFlight(), 1)
  assert.deepEqual(outcome.results.map((r) => r.status), [GRANT_RESULT.GRANTED, GRANT_RESULT.GRANTED, GRANT_RESULT.ALREADY_GRANTED])
  assert.equal(outcome.accessMayHaveChanged, true)
  const summary = summarizeGrantResults(outcome, { describeFailure, labelOf: (id) => `P${id}`, roleLabel: 'ROLE_7' })
  assert.equal(summary.kind, 'success')
  assert.equal(summary.message, '2 permissions granted to ROLE_7; 1 already held.')

  const unchanged = await grantPermissionsSequentially({ roleId: '7', permissionIds: ['112'], grant: fakeGrant({ 112: 'unchanged' }).grant })
  assert.equal(unchanged.accessMayHaveChanged, false, 'nothing changed: no refresh needed')
})

test('an explicit refusal stops the sequence and keeps earlier results (escalation, protected role, inactive, session)', async () => {
  for (const error of [
    new ApiError('Only the Super Administrator can grant security administration permissions.', { code: 'SUPER_ADMINISTRATOR_ONLY', status: 403 }),
    new ApiError('This role is protected.', { code: 'PROTECTED_ROLE', status: 403 }),
    new ApiError('You do not have permission for this action.', { code: 'FORBIDDEN', status: 403 }),
    new ApiError('The permission is not active', { code: 'INACTIVE_TARGET', status: 409 }),
    new ApiError('The requested permission was not found', { code: 'NOT_FOUND', status: 404 }),
    new ApiError('Session ended', { code: 'UNAUTHENTICATED', status: 401 }),
  ]) {
    const api = fakeGrant({ 102: error })
    const outcome = await grantPermissionsSequentially({ roleId: '7', permissionIds: ['111', '102', '112'], grant: api.grant })
    assert.deepEqual(outcome.results.map((r) => r.status), [GRANT_RESULT.GRANTED, GRANT_RESULT.FAILED, GRANT_RESULT.NOT_SUBMITTED], error.code)
    assert.deepEqual(api.calls.map((c) => c[1]), ['111', '102'], `${error.code}: nothing after the refusal, no retry`)
    const summary = summarizeGrantResults(outcome, { describeFailure, labelOf: (id) => `P${id}`, roleLabel: 'ROLE_7' })
    assert.equal(summary.kind, 'error')
    assert.match(summary.message, /Only part of the request completed for ROLE_7: 1 of 3 granted\. Each grant is separate/)
    assert.equal(summary.details[0], 'P111: granted')
    assert.match(summary.details[1], /^P102: not granted: /)
    assert.match(summary.details[2], /not submitted/)
    assert.doesNotMatch(summary.message, /^\d+ permissions? granted/, 'never reported as complete success')
  }
})

test('a network failure, timeout or server error is an unknown outcome: stop and never retry', async () => {
  for (const error of [
    new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }),
    new ApiError('The request timed out.', { code: 'TIMEOUT' }),
    new ApiError('An unexpected error occurred', { code: 'INTERNAL_ERROR', status: 500 }),
  ]) {
    const api = fakeGrant({ 111: error })
    const outcome = await grantPermissionsSequentially({ roleId: '7', permissionIds: ['111', '102'], grant: api.grant })
    assert.deepEqual(outcome.results.map((r) => r.status), [GRANT_RESULT.UNKNOWN_OUTCOME, GRANT_RESULT.NOT_SUBMITTED], error.code)
    assert.equal(api.calls.length, 1, 'never retried')
    assert.equal(outcome.accessMayHaveChanged, true, 'uncertain outcomes refresh access')
    assert.equal(summarizeGrantResults(outcome, { describeFailure, labelOf: String, roleLabel: 'R' }).kind, 'unknown')
  }
})

test('a double submission is ignored while the first is running', async () => {
  const guard = createSubmissionGuard()
  const api = fakeGrant()
  const run = () => guard.run(() => grantPermissionsSequentially({ roleId: '7', permissionIds: ['111', '102'], grant: api.grant }))
  const [first, second] = await Promise.all([run(), run()])
  assert.equal(first.status, 'success')
  assert.equal(second.status, 'ignored')
  assert.equal(api.calls.length, 2, 'each selected permission sent exactly once')
})

test('each grant uses the existing PUT /roles/{roleId}/permissions/{permissionId}; there is no bulk endpoint', async () => {
  const { fetchImpl, calls } = recordingFetch((url) => success({ roleId: '7', permissionId: url.split('/').at(-1), granted: true, changed: true }))
  const service = createSecurityAdminService({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore: createCsrfStore() }) })
  await grantPermissionsSequentially({ roleId: '7', permissionIds: ['111', '102'], grant: (role, id) => service.grantRolePermission(role, id) })
  assert.deepEqual(calls.map((c) => `${c.init.method} ${c.url}`), [
    'PUT /api/v1/access-control/roles/7/permissions/111',
    'PUT /api/v1/access-control/roles/7/permissions/102',
  ])
  const source = await read('../src/features/security-administration/securityAdminService.js')
  assert.doesNotMatch(source, /bulk|batch/i)
})

// ---------------------------------------------------------------- page and dialog wiring

test('the page binds dialogs to their role, refuses unavailable or inactive roles and loads fresh grants', async () => {
  const page = await read('../src/features/security-administration/pages/RolePermissionsPage.jsx')
  assert.match(page, /const dialog = dialogState\?\.roleId === roleId \? dialogState : null/)
  assert.match(page, /setDialog\(\{ \.\.\.next, roleId \}\)/)
  assert.match(page, /const grantBlocked = !role \? .* : !role\.isActive \? 'Inactive roles cannot receive permissions' : null/)
  assert.match(page, /disabled=\{Boolean\(grantBlocked\)\}/)
  assert.match(page, /grants\.reload\(\)\n\s+open\(\{ type: 'grant' \}\)/)
  assert.match(page, /dialog\?\.type === 'grant' && role\?\.isActive && \(\n\s+<RoleGrantDialog roleId=\{dialog\.roleId\}/)
  assert.match(page, /revokeRolePermission\(dialog\.roleId, dialog\.grant\.permissionId\)/, 'revoke uses the role the dialog was opened for')

  const dialog = await read('../src/features/security-administration/components/RoleGrantDialog.jsx')
  assert.match(dialog, /const fresh = catalog\.status === 'ready' && !catalog\.refreshing && grants\.status === 'ready' && !grants\.refreshing/)
  assert.match(dialog, /const chosen = usable \? validSelection\(selected, data\) : \[\]/)
  assert.match(dialog, /busy=\{action\.pending\}/, 'cannot be closed while requests are pending')
  assert.match(dialog, /confirmDisabled=\{!usable \|\| !chosen\.length\}/)
  assert.match(dialog, /action\.setFeedback\(summarizeGrantResults\(/, 'results stay visible after the dialog closes')

  const picker = await read('../src/features/security-administration/components/PermissionMultiPicker.jsx')
  assert.match(picker, /<legend className="sr-only">Grantable permissions<\/legend>/)
  assert.match(picker, /type="checkbox"/)
  assert.match(picker, /disabled=\{disabled \|\| granted\}/)
  assert.match(picker, /role="status" aria-live="polite"/)

  const singlePicker = await read('../src/features/security-administration/pages/UserOverridesPage.jsx')
  assert.match(singlePicker, /PermissionPicker/, 'the single-select picker keeps its existing consumer')
})
