// Workflow Manager M1: contract, service, client-side rules, navigation access
// and parity with the backend permission keys. Mocked transport only: no
// backend, Oracle or e-mail access.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import {
  readForm, readFormVersion, readOverview, readPage, readSource, readSourcePolicy,
} from '../src/features/workflow-manager/workflowManagerContract.js'
import { createWorkflowManagerService } from '../src/features/workflow-manager/workflowManagerService.js'
import {
  FORM_FILTER_DEFAULTS, PATHS, WORKFLOW_ACTIONS, checkDetailRoute, describeWorkflowFailure, fieldErrorsFrom, filterParams,
  readFormFilters, readSourceFilters, sameSourceIdentity, validateForm, validateSource,
} from '../src/features/workflow-manager/workflowManagerModel.js'
import { authorizedNavigation, findAppRoute, paletteCommands, routeAccess } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import { SESSION_TOKEN, failure, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

// ------------------------------------------------------------ fixtures (backend shapes, fictional)

const form = (overrides = {}) => ({
  formId: '12', formCode: 'TRAVEL_REQUEST', formName: 'Travel Request', moduleCode: 'HR', moduleName: 'Human Resources',
  detailRoute: '/hr/travel/:requestId', description: null, isActive: true, versionCount: 0, rowVersion: 3,
  createdAt: '2026-11-02T08:00:00.000Z', createdBy: '7', createdByName: 'Test Admin',
  updatedAt: '2026-11-02T09:00:00.000Z', updatedBy: '7', updatedByName: null, ...overrides,
})
const source = (overrides = {}) => ({
  sourceId: '5', sourceCode: 'TRAVEL_HEADER', sourceName: 'Travel header', sourceKind: 'TABLE', ownerName: 'XXZP',
  objectName: 'XXZP_TRAVEL_T', handlerCode: null, isActive: true, versionCount: 0, rowVersion: 1,
  createdAt: '2026-11-02T08:00:00.000Z', createdBy: '7', createdByName: null, updatedAt: '2026-11-02T08:00:00.000Z',
  updatedBy: null, updatedByName: null, ...overrides,
})
const pagination = (overrides = {}) => ({ page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false, ...overrides })

function setup(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => {} })
  return { service: createWorkflowManagerService({ client }), calls }
}
const body = (call) => (call.init.body === undefined ? undefined : JSON.parse(call.init.body))
const csrf = (call) => call.init.headers.get('X-CSRF-Token')

// ------------------------------------------------------------ contract

test('form and source readers keep documented fields with string identifiers', () => {
  const parsed = readForm({ ...form(), extra: 'dropped' })
  assert.equal(parsed.formId, '12')
  assert.equal('extra' in parsed, false)
  assert.ok(Object.isFrozen(parsed))
  assert.throws(() => readForm(form({ formId: 12 })), (error) => error.code === 'INVALID_RESPONSE')
  assert.throws(() => readForm(form({ isActive: 'Y' })), (error) => error.code === 'INVALID_RESPONSE')
  assert.equal(readSource(source()).sourceKind, 'TABLE')
  assert.throws(() => readSource(source({ sourceKind: 'QUERY' })), (error) => error.code === 'INVALID_RESPONSE')
})

test('version, policy and overview readers validate their shapes', () => {
  const version = readFormVersion({
    formVersionId: '3', versionNo: 1, lifecycleState: 'PUBLISHED', isDefault: true, configSha256: 'a'.repeat(64), schemaVersion: 1,
    publishedAt: null, createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z',
    headerSource: { sourceVersionId: '4', versionNo: 2, sourceId: '5', sourceCode: 'TRAVEL_HEADER' },
  })
  assert.equal(version.headerSource.sourceCode, 'TRAVEL_HEADER')
  assert.throws(() => readFormVersion({ ...version, lifecycleState: 'LIVE' }))
  const policy = readSourcePolicy({ sourceKinds: ['TABLE', 'VIEW', 'HANDLER'], allowedOwners: ['XXZP'], protectedObjectPrefixes: ['XX_ZRV_'], handlers: [] })
  assert.deepEqual(policy.allowedOwners, ['XXZP'])
  const overview = readOverview({
    forms: { total: 2, active: 1 },
    dataSources: { total: 1, active: 1, byKind: { TABLE: { total: 1, active: 1 }, VIEW: { total: 0, active: 0 }, HANDLER: { total: 0, active: 0 } } },
  })
  assert.equal(overview.dataSources.byKind.TABLE.total, 1)
  assert.deepEqual(readOverview({ forms: null, dataSources: null }), { forms: null, dataSources: null })
  assert.throws(() => readOverview({ forms: { total: -1, active: 0 }, dataSources: null }))
  assert.throws(() => readPage({ data: [form()] }, readForm), 'pagination is required')
})

// ------------------------------------------------------------ service

test('reads call the documented paths with only defined query values and no CSRF header', async () => {
  const { service, calls } = setup((url) => {
    if (url.includes('/forms?')) return success([form()], 200, { pagination: pagination() })
    if (url.endsWith('/versions')) return success([])
    return success(form())
  })
  const page = await service.listForms({ page: 2, pageSize: 20, search: 'travel', moduleCode: '', status: 'ACTIVE', sortBy: 'FORM_NAME', sortDir: 'desc' })
  assert.equal(page.items[0].formCode, 'TRAVEL_REQUEST')
  const url = new URL(calls[0].url, 'http://local')
  assert.equal(url.pathname, '/api/v1/workflow-manager/forms')
  assert.deepEqual(Object.fromEntries(url.searchParams), { page: '2', pageSize: '20', search: 'travel', status: 'ACTIVE', sortBy: 'FORM_NAME', sortDir: 'desc' })
  assert.equal(calls[0].init.method, 'GET')
  await service.getForm('12')
  assert.match(calls[1].url, /\/workflow-manager\/forms\/12$/)
  await service.listFormVersions('12')
  assert.match(calls[2].url, /\/forms\/12\/versions$/)
  await assert.rejects(service.getForm('12/../x'), (error) => error.code === 'INVALID_ID')
  assert.equal(calls.length, 3, 'an invalid id is never sent')
})

test('changes send CSRF, the row version and exactly the documented fields', async () => {
  const { service, calls } = setup((url, init) => (url.includes('data-sources') ? success(source(), init.method === 'POST' ? 201 : 200) : success(form(), init.method === 'POST' ? 201 : 200)))
  await service.createForm({ formCode: 'TRAVEL_REQUEST', formName: 'Travel Request', moduleCode: 'HR', detailRoute: null, description: null })
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(csrf(calls[0]), SESSION_TOKEN)
  assert.deepEqual(body(calls[0]), { formCode: 'TRAVEL_REQUEST', formName: 'Travel Request', moduleCode: 'HR', detailRoute: null, description: null })
  await service.updateForm('12', { formName: 'Travel', moduleCode: 'HR', detailRoute: null, description: 'x', rowVersion: 3 })
  assert.equal(calls[1].init.method, 'PUT')
  assert.deepEqual(body(calls[1]), { formName: 'Travel', moduleCode: 'HR', detailRoute: null, description: 'x', rowVersion: 3 })
  await service.setFormActive('12', false, 4)
  assert.match(calls[2].url, /\/forms\/12\/deactivate$/)
  assert.deepEqual(body(calls[2]), { rowVersion: 4 })
  await service.setSourceActive('5', true, 2)
  assert.match(calls[3].url, /\/data-sources\/5\/activate$/)
  await assert.rejects(service.setFormActive('12', true, undefined), (error) => error.code === 'INVALID_REQUEST')
  assert.equal(calls.length, 4, 'a missing row version is never sent')
  for (const call of calls) assert.equal(csrf(call), SESSION_TOKEN)
})

test('conflicts surface as ApiError with the backend code', async () => {
  const { service } = setup(() => failure(409, 'STALE_RECORD', 'changed'))
  await assert.rejects(service.updateForm('12', { formName: 'x', moduleCode: 'HR', rowVersion: 1 }), (error) => error instanceof ApiError && error.status === 409 && error.code === 'STALE_RECORD')
})

// ------------------------------------------------------------ model

test('form validation mirrors the backend schema', () => {
  const good = validateForm({ formCode: 'TRAVEL_REQUEST', formName: ' Travel ', moduleCode: 'HR', detailRoute: '', description: '' }, { create: true })
  assert.equal(good.valid, true)
  assert.deepEqual(good.payload, { formCode: 'TRAVEL_REQUEST', formName: 'Travel', moduleCode: 'HR', detailRoute: null, description: null })
  const bad = validateForm({ formCode: 'travel request', formName: '', moduleCode: '', detailRoute: 'https://x.example', description: 'x'.repeat(1001) }, { create: true })
  assert.equal(bad.valid, false)
  for (const field of ['formCode', 'formName', 'moduleCode', 'detailRoute', 'description']) assert.ok(bad.errors[field], field)
  const update = validateForm({ formCode: 'ANY', formName: 'Travel', moduleCode: 'HR', detailRoute: '/hr/travel/:requestId', description: '' }, { create: false })
  assert.equal(update.valid, true)
  assert.equal('formCode' in update.payload, false, 'the form code is never sent on update')
  for (const route of ['/hr/travel', '/hr/travel/:requestId', '/a-b/c1']) assert.equal(checkDetailRoute(route), null, route)
  for (const route of ['hr/travel', '//evil.example', '/hr/../x', '/HR', '/hr/travel?x=1', 'javascript:alert(1)']) assert.ok(checkDetailRoute(route), route)
})

test('source validation follows the kind/identity shape and normalizes names', () => {
  const table = validateSource({ sourceCode: 'TRAVEL_HEADER', sourceName: 'Travel', sourceKind: 'TABLE', ownerName: 'xxzp', objectName: ' xxzp_travel_t ', handlerCode: '' }, { create: true })
  assert.equal(table.valid, true)
  assert.deepEqual(table.payload, { sourceCode: 'TRAVEL_HEADER', sourceName: 'Travel', sourceKind: 'TABLE', ownerName: 'XXZP', objectName: 'XXZP_TRAVEL_T' })
  const handler = validateSource({ sourceCode: 'H', sourceName: 'H', sourceKind: 'HANDLER', ownerName: 'XXZP', objectName: 'X', handlerCode: '' }, { create: true })
  assert.ok(handler.errors.handlerCode)
  assert.equal('ownerName' in handler.payload, false)
  assert.ok(validateSource({ sourceCode: 'X', sourceName: 'X', sourceKind: 'TABLE', ownerName: 'XXZP', objectName: 'X; DROP TABLE Y', handlerCode: '' }, { create: true }).errors.objectName)
  assert.equal(sameSourceIdentity(source(), { sourceKind: 'TABLE', ownerName: 'xxzp', objectName: 'xxzp_travel_t' }), true)
  assert.equal(sameSourceIdentity(source(), { sourceKind: 'VIEW', ownerName: 'XXZP', objectName: 'XXZP_TRAVEL_T' }), false)
})

test('list filters come only from allowlisted URL values and stay short', () => {
  const filters = readFormFilters(new URLSearchParams('page=0&status=BAD&sortBy=DROP&moduleCode=hr&search=travel'))
  assert.deepEqual(filters, { ...FORM_FILTER_DEFAULTS, search: 'travel' })
  assert.equal(filterParams({ ...FORM_FILTER_DEFAULTS, status: 'INACTIVE', page: 2 }, FORM_FILTER_DEFAULTS).toString(), 'page=2&status=INACTIVE')
  assert.equal(readSourceFilters(new URLSearchParams('sourceKind=VIEW')).sourceKind, 'VIEW')
  assert.equal(readSourceFilters(new URLSearchParams('sourceKind=SQL')).sourceKind, '')
})

test('failures are explained without claiming an unconfirmed result', () => {
  const stale = describeWorkflowFailure(new ApiError('changed', { status: 409, code: 'STALE_RECORD' }))
  assert.equal(stale.stale, true)
  assert.match(stale.message, /Reload/)
  const reason = new ApiError('Request validation failed', { status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'objectName', message: 'SOURCE_OBJECT_PROTECTED' }] })
  assert.match(describeWorkflowFailure(reason).details[0], /can never be workflow sources/)
  assert.match(fieldErrorsFrom(reason).objectName, /can never be workflow sources/)
  const unknown = describeWorkflowFailure(new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' }))
  assert.equal(unknown.kind, 'unknown')
})

// ------------------------------------------------------------ navigation and permissions

const ready = (keys) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified: false, has: (key) => set.has(key) }
}
const listed = (access) => authorizedNavigation(access).find((section) => section.id === 'workflow-manager')?.items.map((item) => item.id) || []

test('Workflow Manager pages are listed and opened only with their backend permission', () => {
  assert.deepEqual(listed(ready([])), [], 'no permission, no section')
  assert.deepEqual(listed(ready([WORKFLOW_ACTIONS.OVERVIEW_VIEW, WORKFLOW_ACTIONS.FORMS_VIEW])), ['workflow-manager', 'workflow-forms'])
  assert.deepEqual(listed(ready(Object.values(WORKFLOW_ACTIONS))), ['workflow-manager', 'workflow-forms', 'workflow-data-sources'])
  const registration = findAppRoute(PATHS.newForm)
  assert.equal(registration.id, 'workflow-form-new', 'the static path wins over :formId')
  assert.equal(routeAccess(registration, ready([WORKFLOW_ACTIONS.FORMS_VIEW])), 'denied', 'registration needs CREATE')
  assert.equal(routeAccess(registration, ready([WORKFLOW_ACTIONS.FORMS_CREATE])), 'allowed', 'no MFA requirement (not a security module)')
  assert.equal(findAppRoute(PATHS.form('12')).id, 'workflow-form')
  assert.equal(paletteCommands(ready(Object.values(WORKFLOW_ACTIONS)), 'authenticated').some((command) => command.path?.includes(':') || command.path === PATHS.newForm), false)
})

test('client permission keys equal the backend permission catalogue of the module', async () => {
  const backend = await read('../../server/src/modules/workflow-manager/workflowManager.catalog.js')
  const routes = await read('../../server/src/modules/workflow-manager/workflowManager.routes.js')
  const used = [...routes.matchAll(/(?:read|write)\((OVERVIEW|FORMS|SOURCES), '([A-Z_]+)'/g)]
    .map(([, resource, action]) => `WORKFLOW_MANAGER.${{ OVERVIEW: 'OVERVIEW', FORMS: 'FORM_REGISTRY', SOURCES: 'DATA_SOURCE_REGISTRY' }[resource]}:${action}`)
  assert.match(backend, /WORKFLOW_MODULE_CODE = 'WORKFLOW_MANAGER'/)
  const registered = registry.permissions.filter((p) => p.moduleCode === 'WORKFLOW_MANAGER').map((p) => p.key)
  assert.deepEqual([...new Set(used)].sort(), [...registered].sort(), 'every backend route permission is registered, and no extra ones')
  assert.deepEqual(Object.values(WORKFLOW_ACTIONS).sort(), [...registered].sort())
})

test('pages use the shared API client and introduce no placeholder data', async () => {
  for (const file of ['WorkflowOverviewPage', 'FormRegistryPage', 'FormRegistrationPage', 'FormRecordPage', 'DataSourceRegistryPage']) {
    const page = await read(`../src/features/workflow-manager/pages/${file}.jsx`)
    assert.match(page, /workflowManagerService/, `${file} uses the real service`)
    assert.doesNotMatch(page, /\bfetch\(|axios|demo|mock|lorem/i, `${file} has no other transport or fake data`)
  }
  const service = await read('../src/features/workflow-manager/workflowManagerService.js')
  assert.match(service, /createWorkflowManagerService\(\{ client: apiClient \}\)/)
})
