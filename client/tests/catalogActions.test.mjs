// Phase 2B: Permission Catalog standard-action picker and sequential creation with an accurate
// result per action (existing single-action API, no automatic retries, no role grants).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ApiError } from '../src/services/api/apiClient.js'
import { STANDARD_ACTIONS } from '../src/config/registry/actions.js'
import { describeFailure } from '../src/features/security-administration/adminFeedback.js'
import {
  ACTION_RESULT, CATALOG_ROW_LIMIT, actionOptions, catalogMayBeIncomplete, catalogRowCount, createActionsSequentially,
  defaultActionDescription, existingActions, findCatalogResource, isCodeOwnedResource, summarizeActionResults, toggleAction,
} from '../src/features/security-administration/catalogActions.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const RESOURCE_ID = '501'
const catalogWith = (permissions) => [{
  moduleId: '500', moduleCode: 'FIXTURE_SALES', moduleName: 'Fixture Sales', isActive: true,
  resources: [{ resourceId: RESOURCE_ID, resourceCode: 'FIXTURE_ORDERS', resourceName: 'Fixture Orders', isActive: true, permissions }],
}]
const permission = (actionCode, isActive = true) => ({ permissionId: `p-${actionCode}`, actionCode, isActive, description: null })
const conflict = () => new ApiError('This action already exists for the resource', { code: 'CONFLICT', status: 409 })

// ---------------------------------------------------------------- options and selection

test('all 46 standard actions are offered with code, name, category and description, and are searchable', () => {
  const all = actionOptions(new Map())
  assert.equal(all.length, 46)
  assert.equal(all.length, Object.keys(STANDARD_ACTIONS).length)
  for (const option of all) assert.ok(option.code && option.name && option.categoryLabel && option.description, option.code)
  assert.deepEqual(actionOptions(new Map(), 'approve').map((o) => o.code), ['APPROVE'])
  assert.deepEqual(actionOptions(new Map(), 'appr').map((o) => o.code), ['SUBMIT', 'APPROVE'], 'name and description')
  assert.deepEqual(actionOptions(new Map(), '  REVERSE ').map((o) => o.code), ['REVERSE'])
  assert.deepEqual(actionOptions(new Map(), 'inventory').map((o) => o.code).sort(), ['ADJUST', 'COUNT', 'RECEIVE', 'TRANSFER'])
  assert.ok(actionOptions(new Map(), 'ledger').some((o) => o.code === 'POST'), 'description search')
  assert.deepEqual(actionOptions(new Map(), 'no-such-action'), [])
})

test('existing active and inactive actions are marked and can never be selected; selections never repeat', () => {
  const existing = existingActions({ permissions: [permission('VIEW'), permission('APPROVE', false)] })
  const options = actionOptions(existing)
  assert.equal(options.find((o) => o.code === 'VIEW').existing, 'active')
  assert.equal(options.find((o) => o.code === 'APPROVE').existing, 'inactive')
  assert.equal(options.find((o) => o.code === 'CREATE').existing, null)

  let selected = []
  selected = toggleAction(selected, 'CREATE', existing)
  selected = toggleAction(selected, 'EXPORT', existing)
  assert.deepEqual(selected, ['CREATE', 'EXPORT'])
  assert.deepEqual(toggleAction(selected, 'VIEW', existing), selected, 'existing active')
  assert.deepEqual(toggleAction(selected, 'APPROVE', existing), selected, 'existing inactive')
  assert.deepEqual(toggleAction(selected, 'FLY', existing), selected, 'not a standard action')
  assert.deepEqual(toggleAction(selected, 'CREATE', existing), ['EXPORT'], 'second toggle removes, never duplicates')
})

test('default descriptions, code-owned resources and catalogue completeness', () => {
  assert.equal(defaultActionDescription('VIEW', 'Sales Budget'), 'View sales budget')
  assert.equal(defaultActionDescription('APPROVE', 'Sales Budget'), 'Approve sales budget')
  assert.equal(isCodeOwnedResource('SECURITY_ADMINISTRATION', 'USER_ACCOUNTS'), true)
  assert.equal(isCodeOwnedResource('SECURITY_ADMINISTRATION', 'MANUAL_RESOURCE'), false)
  assert.equal(isCodeOwnedResource('COMMON', 'DASHBOARD'), false)

  assert.equal(catalogRowCount(catalogWith([permission('VIEW'), permission('CREATE')])), 2)
  assert.equal(catalogRowCount([{ resources: [] }, { resources: [{ permissions: [] }] }]), 2, 'empty module and resource rows')
  const big = catalogWith(Array.from({ length: CATALOG_ROW_LIMIT }, (_, i) => permission(`A${i}`)))
  assert.equal(catalogMayBeIncomplete(big), true)
  assert.equal(catalogMayBeIncomplete(catalogWith(Array.from({ length: CATALOG_ROW_LIMIT - 1 }, (_, i) => permission(`A${i}`)))), false)
  assert.equal(findCatalogResource(catalogWith([]), RESOURCE_ID).resource.resourceCode, 'FIXTURE_ORDERS')
  assert.equal(findCatalogResource(catalogWith([]), 'other'), null)
})

// ---------------------------------------------------------------- sequential creation

function fakeApi(responses, freshCatalog) {
  const calls = []
  let inFlight = 0
  let maxInFlight = 0
  const createPermission = async (resourceId, input) => {
    calls.push({ resourceId, ...input })
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setImmediate(resolve))
    inFlight -= 1
    const response = responses[input.actionCode]
    if (response instanceof Error) throw response
    return { permissionId: `new-${input.actionCode}`, actionCode: input.actionCode }
  }
  let loads = 0
  const loadCatalog = async () => {
    loads += 1
    if (freshCatalog instanceof Error) throw freshCatalog
    return freshCatalog
  }
  return { createPermission, loadCatalog, calls, maxInFlight: () => maxInFlight, loads: () => loads }
}

const createAll = (api, codes, extra = {}) => createActionsSequentially({
  resourceId: RESOURCE_ID, resourceName: 'Fixture Orders', codes, createPermission: api.createPermission, loadCatalog: api.loadCatalog, ...extra,
})

test('creates selected actions one at a time with generated descriptions; a custom one only for a single action', async () => {
  const api = fakeApi({}, catalogWith([permission('CREATE'), permission('APPROVE')]))
  const outcome = await createAll(api, ['CREATE', 'APPROVE'], { customDescription: 'ignored for several' })
  assert.deepEqual(outcome.results.map((r) => r.status), [ACTION_RESULT.CREATED, ACTION_RESULT.CREATED])
  assert.deepEqual(api.calls, [
    { resourceId: RESOURCE_ID, actionCode: 'CREATE', description: 'Create fixture orders' },
    { resourceId: RESOURCE_ID, actionCode: 'APPROVE', description: 'Approve fixture orders' },
  ])
  assert.equal(api.maxInFlight(), 1, 'never concurrent')
  assert.equal(outcome.verified, true)

  const single = fakeApi({}, catalogWith([permission('EXPORT')]))
  await createAll(single, ['EXPORT'], { customDescription: 'Export orders to the finance system' })
  assert.equal(single.calls[0].description, 'Export orders to the finance system')
  const summary = summarizeActionResults(outcome, describeFailure, 'FIXTURE_SALES.FIXTURE_ORDERS')
  assert.equal(summary.kind, 'success')
  assert.match(summary.message, /2 actions added to FIXTURE_SALES\.FIXTURE_ORDERS\. No role was granted/)
})

test('a 409 conflict counts as existing only when the refreshed catalogue confirms it', async () => {
  const confirmed = fakeApi({ VIEW: conflict() }, catalogWith([permission('VIEW'), permission('CREATE')]))
  const a = await createAll(confirmed, ['VIEW', 'CREATE'])
  assert.deepEqual(a.results.map((r) => r.status), [ACTION_RESULT.ALREADY_EXISTS, ACTION_RESULT.CREATED])
  assert.equal(confirmed.calls.length, 2, 'a plain conflict does not stop the sequence')
  assert.equal(summarizeActionResults(a, describeFailure, 'X').kind, 'success')

  // Exists but inactive: never "already exists" as if usable; a distinct result reported as a problem.
  const inactive = await createAll(fakeApi({ VIEW: conflict(), CREATE: conflict() }, catalogWith([permission('VIEW', false), permission('CREATE')])), ['VIEW', 'CREATE'])
  assert.deepEqual(inactive.results.map((r) => r.status), [ACTION_RESULT.EXISTS_INACTIVE, ACTION_RESULT.ALREADY_EXISTS])
  const inactiveSummary = summarizeActionResults(inactive, describeFailure, 'X')
  assert.equal(inactiveSummary.kind, 'error')
  assert.match(inactiveSummary.details[0], /VIEW: already exists but is INACTIVE: it grants nothing until an authorized administrator activates it/)
  assert.match(inactiveSummary.details[1], /CREATE: already exists and is active/)
  assert.doesNotMatch(inactiveSummary.message, /already existed/, 'no success wording')

  const absent = await createAll(fakeApi({ VIEW: conflict() }, catalogWith([])), ['VIEW'])
  assert.equal(absent.results[0].status, ACTION_RESULT.CONFLICT_UNVERIFIED)

  const unreadable = await createAll(fakeApi({ VIEW: conflict() }, new ApiError('down', { code: 'NETWORK_ERROR' })), ['VIEW'])
  assert.equal(unreadable.results[0].status, ACTION_RESULT.CONFLICT_UNVERIFIED)
  assert.equal(unreadable.verified, false)

  const truncated = catalogWith(Array.from({ length: CATALOG_ROW_LIMIT }, (_, i) => permission(i ? `A${i}` : 'VIEW')))
  const incomplete = await createAll(fakeApi({ VIEW: conflict() }, truncated), ['VIEW'])
  assert.equal(incomplete.results[0].status, ACTION_RESULT.CONFLICT_UNVERIFIED, 'possibly truncated data never confirms')

  const summary = summarizeActionResults(absent, describeFailure, 'X')
  assert.equal(summary.kind, 'error')
  assert.match(summary.details[0], /could not confirm it/)
})

test('an authorization, session or refusal stops the sequence and keeps earlier results', async () => {
  for (const [error, text] of [
    [new ApiError('You do not have permission for this action.', { code: 'FORBIDDEN', status: 403 }), /no longer have permission/],
    [new ApiError('Only the Super Administrator can change security administration entries.', { code: 'SUPER_ADMINISTRATOR_ONLY', status: 403 }), /Super Administrator/],
    [new ApiError('Session ended', { code: 'UNAUTHENTICATED', status: 401 }), /session has ended/],
    [new ApiError('The resource is not active', { code: 'INACTIVE_TARGET', status: 409 }), /not active/],
  ]) {
    const api = fakeApi({ CREATE: error }, catalogWith([permission('VIEW')]))
    const outcome = await createAll(api, ['VIEW', 'CREATE', 'EXPORT'])
    assert.deepEqual(outcome.results.map((r) => r.status), [ACTION_RESULT.CREATED, ACTION_RESULT.FAILED, ACTION_RESULT.NOT_SUBMITTED], error.code)
    assert.deepEqual(api.calls.map((c) => c.actionCode), ['VIEW', 'CREATE'], 'nothing after the failure; no retry')
    const summary = summarizeActionResults(outcome, describeFailure, 'X')
    assert.equal(summary.kind, 'error')
    assert.match(summary.message, /1 of 3 actions were added/)
    assert.match(summary.details[1], text)
    assert.match(summary.details[2], /not submitted/)
  }
})

test('a network failure, timeout or server error is an unknown outcome: stop, never retry, show what is now present', async () => {
  for (const error of [
    new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }),
    new ApiError('The request timed out.', { code: 'TIMEOUT' }),
    new ApiError('An unexpected error occurred', { code: 'INTERNAL_ERROR', status: 500 }),
  ]) {
    const nowPresent = fakeApi({ CREATE: error }, catalogWith([permission('VIEW'), permission('CREATE')]))
    const outcome = await createAll(nowPresent, ['VIEW', 'CREATE', 'EXPORT'])
    assert.deepEqual(outcome.results.map((r) => r.status), [ACTION_RESULT.CREATED, ACTION_RESULT.UNKNOWN, ACTION_RESULT.NOT_SUBMITTED], error.code)
    assert.equal(outcome.results[1].stateAfterRefresh, 'active')
    assert.equal(nowPresent.calls.filter((c) => c.actionCode === 'CREATE').length, 1, 'never retried')
    const summary = summarizeActionResults(outcome, describeFailure, 'X')
    assert.equal(summary.kind, 'unknown')
    assert.match(summary.details[1], /outcome unknown.*now in the catalogue.*Check before trying again/)
  }
  const absent = await createAll(fakeApi({ VIEW: new ApiError('x', { code: 'NETWORK_ERROR' }) }, catalogWith([])), ['VIEW'])
  assert.equal(absent.results[0].stateAfterRefresh, 'absent')
  const unreadable = await createAll(fakeApi({ VIEW: new ApiError('x', { code: 'NETWORK_ERROR' }) }, new Error('down')), ['VIEW'])
  assert.equal(unreadable.results[0].stateAfterRefresh, null)
  const inactive = await createAll(fakeApi({ VIEW: new ApiError('x', { code: 'NETWORK_ERROR' }) }, catalogWith([permission('VIEW', false)])), ['VIEW'])
  assert.equal(inactive.results[0].stateAfterRefresh, 'inactive')
  assert.match(summarizeActionResults(inactive, describeFailure, 'X').details[0], /now in the catalogue but INACTIVE/)
})

// ---------------------------------------------------------------- dialog and page wiring

test('the action dialog uses the accessible picker, warns for code-owned resources and refuses an incomplete catalogue', async () => {
  const dialog = await read('../src/features/security-administration/components/CatalogFormDialog.jsx')
  assert.match(dialog, /<ActionPicker /)
  assert.match(dialog, /actions \? \([\s\S]*<ActionPicker[\s\S]*\) : \([\s\S]*catalog-code/, 'free-text code entry only for modules and resources')
  assert.match(dialog, /parent\.codeOwned &&/)
  assert.match(dialog, /parent\.catalogIncomplete/)
  assert.match(dialog, /confirmDisabled=\{blocked\}/)
  assert.match(dialog, /createActionsSequentially\(/)
  assert.match(dialog, /createModule\(|createResource\(/, 'module and resource creation unchanged')
  assert.doesNotMatch(dialog, /grantRolePermission|assignUserRole|grantOverride/, 'never grants')

  const picker = await read('../src/features/security-administration/components/ActionPicker.jsx')
  assert.match(picker, /<fieldset className="zrv-admin-choices zrv-admin-choices--scroll">/)
  assert.match(picker, /<legend className="sr-only">Standard actions<\/legend>/)
  assert.match(picker, /type="checkbox"/)
  assert.match(picker, /htmlFor=\{id\}/)
  assert.match(picker, /aria-describedby=\{`\$\{id\}-description`\}/)
  assert.match(picker, /role="status" aria-live="polite"/)
  assert.match(picker, /disabled=\{disabled \|\| present\}/)

  const page = await read('../src/features/security-administration/pages/PermissionCatalogPage.jsx')
  assert.match(page, /const manage = can\(SECURITY_ACTIONS\.PERMISSION_CATALOG_MANAGE\)/)
  assert.match(page, /\{manage && <button[^\n]*kind: 'permission'/)
  for (const field of ['existing: existingActions(resource)', 'codeOwned: isCodeOwnedResource(', 'catalogIncomplete: incomplete']) {
    assert.ok(page.includes(field), field)
  }
})
