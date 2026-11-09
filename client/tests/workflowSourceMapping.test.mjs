// Workflow Manager M2-A (source version mapping): strict response readers, the nine
// service calls over the shared API client (CSRF, DELETE body, no unsafe retry), editor
// rules, routes and permissions, and static checks of the pages (real service, accessible
// controls, no placeholder data). Mocked transport only: no backend or Oracle access.
// All names are fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ApiError, createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import {
  readSourceDictionary, readSourceMappingDeleted, readSourceMappingDetail, readSourceMappingDrift, readSourceMappingVersion,
} from '../src/features/workflow-manager/workflowManagerContract.js'
import { createWorkflowManagerService } from '../src/features/workflow-manager/workflowManagerService.js'
import { PATHS, WORKFLOW_ACTIONS, describeWorkflowFailure, fieldErrorsFrom } from '../src/features/workflow-manager/workflowManagerModel.js'
import {
  describePath, draftOrder, editorState, emptyKey, findingsFromError, groupFindings, previewEnforcement, samePayload,
  storedDraft, typeLabel, validateEditor,
} from '../src/features/workflow-manager/sourceMappingModel.js'
import { authorizedNavigation, findAppRoute, paletteCommands, routeAccess } from '../src/config/appNavigation.js'
import { SESSION_TOKEN, failure, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const SHA = 'a'.repeat(64)

// ------------------------------------------------------------ fixtures (backend shapes)

const liveColumn = (name, oracleType, extra = {}) => ({
  name, oracleType, dataLength: 22, charLength: null, precision: null, scale: null, nullable: true, identity: null,
  supported: true, keyEligible: true, ...extra,
})
const snapshot = () => ({
  objectType: 'TABLE', status: 'VALID', capturedAt: '2026-11-09T08:00:00.000Z', columnsSha256: SHA,
  columns: [
    liveColumn('REQUEST_ID', 'NUMBER', { nullable: false, identity: 'ALWAYS', precision: 19, scale: 0 }),
    liveColumn('ORG_ID', 'NUMBER', { nullable: false, precision: 15, scale: 0 }),
    liveColumn('LINE_NO', 'NUMBER', { nullable: false }),
    liveColumn('REQUESTER_NO', 'VARCHAR2', { charLength: 30 }),
    liveColumn('PAYLOAD', 'BLOB', { supported: false, keyEligible: false }),
  ],
  constraints: [{ name: 'DEMO_PK', type: 'P', status: 'ENABLED', validated: 'VALIDATED', columns: ['REQUEST_ID'] }],
  uniqueIndexes: [{ name: 'DEMO_UX', status: 'VALID', functionBased: false, columns: ['ORG_ID', 'LINE_NO'] }],
})
const sourceSummary = { sourceId: '5', sourceCode: 'DEMO_HEADER', sourceName: 'Demo header', sourceKind: 'TABLE', ownerName: 'XXZP', objectName: 'XXZP_DEMO_T', handlerCode: null, isActive: true, rowVersion: 2 }
const dictionary = (overrides = {}) => ({ source: sourceSummary, available: true, snapshot: snapshot(), handler: null, findings: [], ...overrides })
const configColumn = (name, oracleType, extra = {}) => ({
  name, oracleType, dataLength: 22, charLength: null, precision: null, scale: null, nullable: true, identity: null, exposed: true, dataClass: 'INTERNAL', ...extra,
})
const config = () => ({
  schema: 'zrv.wf.source/1',
  source: { sourceCode: 'DEMO_HEADER', kind: 'TABLE', owner: 'XXZP', object: 'XXZP_DEMO_T', handlerCode: null },
  dictionary: { objectType: 'TABLE', status: 'VALID', capturedAt: '2026-11-09T08:00:00.000Z', columnsSha256: SHA },
  handler: null,
  columns: [
    configColumn('OLD_COL', 'VARCHAR2', { charLength: 10 }),
    configColumn('REQUEST_ID', 'NUMBER', { nullable: false, identity: 'ALWAYS', precision: 19, scale: 0 }),
    configColumn('REQUESTER_NO', 'VARCHAR2', { charLength: 30, dataClass: 'PERSONAL', exposed: false }),
  ],
  keyCandidates: [{ code: 'REQUEST_PK', columns: ['REQUEST_ID'], enforcement: 'DATABASE_ENFORCED', enforcedBy: { kind: 'PRIMARY_KEY', name: 'DEMO_PK' }, assurance: null, observation: null }],
})
const versionMeta = (overrides = {}) => ({
  sourceVersionId: '41', sourceId: '5', versionNo: 3, lifecycleState: 'DRAFT', isDefault: false, configSha256: SHA, schemaVersion: 1,
  validatedAt: '2026-11-09T08:00:00.000Z', validatedBy: '7', publishedAt: null, createdAt: '2026-11-09T08:00:00.000Z', createdBy: '7',
  updatedAt: '2026-11-09T08:00:00.000Z', updatedBy: '7', rowVersion: 2, editable: true, ...overrides,
})
const detail = (overrides = {}, extra = {}) => ({
  source: sourceSummary,
  version: { ...versionMeta(overrides), createdByName: null, updatedByName: null, validatedByName: 'Test Mapper', configIntegrity: 'VERIFIED', config: config(), publicationBlockers: [] },
  ...extra,
})
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false }

function setup(responder) {
  const { fetchImpl, calls } = recordingFetch(responder)
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore, onUnauthorized: () => {} })
  return { service: createWorkflowManagerService({ client }), calls }
}
const body = (call) => (call.init.body === undefined ? undefined : JSON.parse(call.init.body))
const csrf = (call) => call.init.headers.get('X-CSRF-Token')
const invalid = (error) => error.code === 'INVALID_RESPONSE'

// ------------------------------------------------------------ contract

test('dictionary reader keeps facts only and rejects malformed evidence', () => {
  const parsed = readSourceDictionary({ ...dictionary(), rows: [{ secret: 1 }] })
  assert.equal('rows' in parsed, false)
  assert.equal(parsed.snapshot.columns[4].supported, false)
  assert.ok(Object.isFrozen(parsed.snapshot.columns[0]))
  assert.equal(readSourceDictionary(dictionary({ available: false, snapshot: null, findings: [{ severity: 'ERROR', code: 'OBJECT_INVALID', path: 'source', message: 'x' }] })).available, false)
  assert.throws(() => readSourceDictionary(dictionary({ snapshot: { ...snapshot(), columnsSha256: 'xyz' } })), invalid)
  assert.throws(() => readSourceDictionary(dictionary({ source: { ...sourceSummary, sourceId: 5 } })), invalid)
  assert.throws(() => readSourceDictionary(dictionary({ snapshot: { ...snapshot(), columns: [liveColumn('X', 'NUMBER', { identity: 'SOMETIMES' })] } })), invalid)
})

test('version and detail readers require decimal-string IDs, ISO instants and a canonical config', () => {
  assert.equal(readSourceMappingVersion(versionMeta()).sourceVersionId, '41')
  assert.throws(() => readSourceMappingVersion(versionMeta({ sourceVersionId: 41 })), invalid)
  assert.throws(() => readSourceMappingVersion(versionMeta({ updatedAt: 'yesterday' })), invalid)
  assert.throws(() => readSourceMappingVersion(versionMeta({ lifecycleState: 'LIVE' })), invalid)
  assert.throws(() => readSourceMappingVersion(versionMeta({ lifecycleState: 'PUBLISHED', editable: true })), invalid, 'only a DRAFT is editable')
  const parsed = readSourceMappingDetail(detail({}, { validation: { valid: true, findings: [], publicationBlockers: [{ code: 'PROVISIONAL_KEY', path: 'keyCandidates[0]' }] } }))
  assert.equal(parsed.version.config.keyCandidates[0].enforcedBy.name, 'DEMO_PK')
  assert.equal(parsed.validation.publicationBlockers[0].code, 'PROVISIONAL_KEY')
  assert.equal(readSourceMappingDetail(detail()).validation, null)
  const wrongSchema = detail()
  wrongSchema.version.config = { ...config(), schema: 'zrv.wf.form/1' }
  assert.throws(() => readSourceMappingDetail(wrongSchema), invalid)
  const badClass = detail()
  badClass.version.config.columns[0].dataClass = 'SECRET'
  assert.throws(() => readSourceMappingDetail(badClass), invalid)
  const unreadable = detail()
  unreadable.version.config = null
  unreadable.version.configIntegrity = 'UNREADABLE'
  assert.equal(readSourceMappingDetail(unreadable).version.config, null)
})

test('drift and delete readers validate their shapes', () => {
  const drift = readSourceMappingDrift({
    sourceVersionId: '41', versionNo: 3, lifecycleState: 'PUBLISHED', configIntegrity: 'VERIFIED', checkedAt: '2026-11-09T09:00:00.000Z', drifted: true,
    saved: null, current: { objectType: 'TABLE', status: 'VALID', capturedAt: '2026-11-09T09:00:00.000Z', columnsSha256: SHA },
    findings: [{ severity: 'ERROR', code: 'KEY_ENFORCEMENT_LOST', path: 'keyCandidates[0]', message: 'lost' }],
  })
  assert.equal(drift.findings[0].code, 'KEY_ENFORCEMENT_LOST')
  assert.throws(() => readSourceMappingDrift({ ...drift, drifted: 'yes' }), invalid)
  assert.deepEqual(readSourceMappingDeleted({ sourceId: '5', sourceVersionId: '41', deleted: true }), { sourceId: '5', sourceVersionId: '41', deleted: true })
  assert.throws(() => readSourceMappingDeleted({ sourceId: '5', sourceVersionId: '41', deleted: false }), invalid)
})

// ------------------------------------------------------------ service

const DRAFT = {
  columns: [{ name: 'REQUEST_ID', exposed: true, dataClass: 'INTERNAL', oracleType: 'NUMBER' }],
  keyCandidates: [{ code: 'REQUEST_PK', columns: ['REQUEST_ID'], assurance: null, enforcement: 'DATABASE_ENFORCED' }],
}
const CLEAN_DRAFT = { columns: [{ name: 'REQUEST_ID', exposed: true, dataClass: 'INTERNAL' }], keyCandidates: [{ code: 'REQUEST_PK', columns: ['REQUEST_ID'], assurance: null }] }

test('reads call the documented paths without a CSRF header', async () => {
  const { service, calls } = setup((url) => {
    if (url.includes('/dictionary')) return success(dictionary())
    if (url.includes('/drift')) return success({ sourceVersionId: '41', versionNo: 3, lifecycleState: 'DRAFT', configIntegrity: 'VERIFIED', checkedAt: '2026-11-09T09:00:00.000Z', drifted: false, saved: null, current: null, findings: [] })
    if (url.includes('/mapping-versions?')) return success([versionMeta()], 200, { pagination })
    return success(detail())
  })
  await service.getSourceDictionary('5')
  await service.listSourceMappingVersions('5', { page: 2, pageSize: 50 })
  await service.getSourceMappingVersion('5', '41')
  await service.getSourceMappingDrift('5', '41')
  const paths = calls.map((call) => new URL(call.url, 'http://local'))
  assert.deepEqual(paths.map((u) => u.pathname), [
    '/api/v1/workflow-manager/data-sources/5/dictionary',
    '/api/v1/workflow-manager/data-sources/5/mapping-versions',
    '/api/v1/workflow-manager/data-sources/5/mapping-versions/41',
    '/api/v1/workflow-manager/data-sources/5/mapping-versions/41/drift',
  ])
  assert.deepEqual(Object.fromEntries(paths[1].searchParams), { page: '2', pageSize: '50' })
  for (const call of calls) {
    assert.equal(call.init.method, 'GET')
    assert.equal(csrf(call), null)
  }
  await assert.rejects(service.getSourceMappingVersion('5', '41/../1'), (error) => error.code === 'INVALID_ID')
  await assert.rejects(service.getSourceDictionary('05'), (error) => error.code === 'INVALID_ID')
  assert.equal(calls.length, 4, 'invalid identifiers are never sent')
})

test('writes send CSRF and exactly the author fields; delete carries the row version', async () => {
  const { service, calls } = setup((url, init) => {
    if (init.method === 'DELETE') return success({ sourceId: '5', sourceVersionId: '41', deleted: true })
    return success(detail({}, { validation: { valid: true, findings: [], publicationBlockers: [] } }), init.method === 'POST' && !url.includes('revalidate') ? 201 : 200)
  })
  await service.createSourceMappingVersion('5', DRAFT)
  assert.equal(calls[0].init.method, 'POST')
  assert.match(calls[0].url, /\/data-sources\/5\/mapping-versions$/)
  assert.deepEqual(body(calls[0]), { draft: CLEAN_DRAFT }, 'server-owned and derived fields are never sent')
  await service.updateSourceMappingVersion('5', '41', { rowVersion: 2, draft: DRAFT })
  assert.equal(calls[1].init.method, 'PUT')
  assert.deepEqual(body(calls[1]), { rowVersion: 2, draft: CLEAN_DRAFT })
  await service.revalidateSourceMappingVersion('5', '41', 3)
  assert.match(calls[2].url, /\/mapping-versions\/41\/revalidate$/)
  assert.deepEqual(body(calls[2]), { rowVersion: 3 })
  await service.cloneSourceMappingVersion('5', '41')
  assert.match(calls[3].url, /\/mapping-versions\/41\/clone$/)
  assert.deepEqual(body(calls[3]), {})
  const deleted = await service.deleteSourceMappingVersion('5', '41', 3)
  assert.equal(calls[4].init.method, 'DELETE')
  assert.deepEqual(body(calls[4]), { rowVersion: 3 })
  assert.equal(deleted.deleted, true)
  for (const call of calls) assert.equal(csrf(call), SESSION_TOKEN)
  await assert.rejects(service.deleteSourceMappingVersion('5', '41', undefined), (error) => error.code === 'INVALID_REQUEST')
  await assert.rejects(service.updateSourceMappingVersion('5', '41', { rowVersion: 0, draft: DRAFT }), (error) => error.code === 'INVALID_REQUEST')
  assert.equal(calls.length, 5, 'a missing row version is never sent')
})

test('unsafe requests are never retried and conflicts keep their backend code', async () => {
  const network = setup(() => { throw new TypeError('Failed to fetch') })
  await assert.rejects(network.service.createSourceMappingVersion('5', DRAFT), (error) => error instanceof ApiError)
  assert.equal(network.calls.length, 1, 'a failed POST is not repeated')
  const stale = setup(() => failure(409, 'STALE_RECORD', 'changed'))
  await assert.rejects(stale.service.updateSourceMappingVersion('5', '41', { rowVersion: 1, draft: DRAFT }), (error) => error.status === 409 && error.code === 'STALE_RECORD')
  const findings = [{ field: 'keyCandidates[0]', message: 'Document its assurance', code: 'KEY_ASSURANCE_REQUIRED', severity: 'ERROR' }]
  const refused = setup(() => failure(400, 'SOURCE_MAPPING_INVALID', 'invalid', { details: findings }))
  await assert.rejects(refused.service.createSourceMappingVersion('5', DRAFT), (error) => error.code === 'SOURCE_MAPPING_INVALID' && error.details.length === 1)
})

// ------------------------------------------------------------ editor model

test('editor state merges the live dictionary with the stored configuration', () => {
  const state = editorState({ liveColumns: snapshot().columns, config: config() })
  const byName = Object.fromEntries(state.columns.map((c) => [c.name, c]))
  assert.equal(byName.REQUEST_ID.included, true)
  assert.equal(byName.REQUESTER_NO.exposed, false)
  assert.equal(byName.REQUESTER_NO.dataClass, 'PERSONAL')
  assert.equal(byName.ORG_ID.included, false)
  assert.equal(byName.OLD_COL.missing, true, 'a saved column the source lost is flagged')
  assert.equal(state.keys[0].code, 'REQUEST_PK')
  assert.equal(state.keys[0].saved.enforcement, 'DATABASE_ENFORCED')
  assert.equal(typeLabel(byName.REQUESTER_NO), 'VARCHAR2(30)')
  assert.equal(typeLabel(byName.REQUEST_ID), 'NUMBER(19)')
})

test('enforcement preview mirrors the server rule', () => {
  const s = snapshot()
  assert.deepEqual(previewEnforcement(['REQUEST_ID'], s), { enforcement: 'DATABASE_ENFORCED', enforcedBy: 'DEMO_PK' })
  assert.deepEqual(previewEnforcement(['ORG_ID', 'LINE_NO'], s), { enforcement: 'DATABASE_ENFORCED', enforcedBy: 'DEMO_UX' })
  assert.equal(previewEnforcement(['REQUEST_ID', 'ORG_ID'], s).enforcement, 'DATABASE_ENFORCED', 'a superset of an enforced key')
  assert.equal(previewEnforcement(['ORG_ID'], s).enforcement, 'DECLARED')
  s.columns.find((c) => c.name === 'LINE_NO').nullable = true
  assert.equal(previewEnforcement(['ORG_ID', 'LINE_NO'], s).enforcement, 'DECLARED', 'a unique index over a nullable column does not enforce')
  s.constraints[0].validated = 'NOT VALIDATED'
  assert.equal(previewEnforcement(['REQUEST_ID'], s).enforcement, 'DECLARED')
  assert.equal(previewEnforcement([], s).enforcement, 'DECLARED')
})

test('client checks mirror the author schema and build an exact payload', () => {
  const s = snapshot()
  const state = editorState({ liveColumns: s.columns, config: null })
  assert.equal(validateEditor(state, s).valid, false, 'at least one column')
  const include = (names, extra = {}) => state.columns.map((c) => (names.includes(c.name) ? { ...c, included: true, exposed: true, ...extra } : c))
  const declared = { ...emptyKey(), code: 'ORG_KEY', columns: ['ORG_ID'] }
  let check = validateEditor({ columns: include(['REQUEST_ID', 'ORG_ID']), keys: [declared] }, s)
  assert.equal(check.valid, false)
  assert.ok(check.errors.keys[declared.uid].basis, 'a declared key needs an assurance basis')
  assert.ok(check.errors.keys[declared.uid].evidenceRef)
  const assured = { ...declared, basis: 'OWNER_ATTESTED', evidenceRef: ' Note DEMO-1 ', rationale: 'Owner reviewed.' }
  const enforced = { ...emptyKey(), code: 'REQUEST_PK', columns: ['REQUEST_ID'], basis: 'OWNER_ATTESTED', evidenceRef: 'x', rationale: 'y' }
  check = validateEditor({ columns: include(['REQUEST_ID', 'ORG_ID']), keys: [enforced, assured] }, s)
  assert.equal(check.valid, true, JSON.stringify(check.errors))
  assert.deepEqual(check.payload, {
    columns: [{ name: 'REQUEST_ID', exposed: true, dataClass: 'INTERNAL' }, { name: 'ORG_ID', exposed: true, dataClass: 'INTERNAL' }],
    keyCandidates: [
      { code: 'REQUEST_PK', columns: ['REQUEST_ID'], assurance: null },
      { code: 'ORG_KEY', columns: ['ORG_ID'], assurance: { basis: 'OWNER_ATTESTED', evidenceRef: 'Note DEMO-1', rationale: 'Owner reviewed.' } },
    ],
  }, 'enforced keys send no assurance; text is trimmed')
  const hidden = validateEditor({ columns: include(['REQUEST_ID']).map((c) => (c.name === 'REQUEST_ID' ? { ...c, exposed: false } : c)), keys: [enforced] }, s)
  assert.match(hidden.errors.keys[enforced.uid].columns, /exposed/)
  const dup = validateEditor({ columns: include(['REQUEST_ID']), keys: [enforced, { ...enforced, uid: 'k2' }] }, s)
  assert.match(dup.errors.keys.k2.code, /unique/)
  const blob = validateEditor({ columns: include(['PAYLOAD']), keys: [] }, s)
  assert.match(blob.errors.columns, /cannot be exposed/)
  const lower = validateEditor({ columns: include(['REQUEST_ID']), keys: [{ ...enforced, code: 'bad code' }] }, s)
  assert.ok(lower.errors.keys[enforced.uid].code)
})

test('unsaved changes, findings and readable locations', () => {
  const stored = storedDraft(config())
  assert.equal(samePayload(stored, { ...stored, columns: [...stored.columns].reverse() }), true, 'order-insensitive')
  assert.equal(samePayload(stored, { ...stored, columns: stored.columns.slice(1) }), false)
  const error = new ApiError('invalid', { status: 400, code: 'SOURCE_MAPPING_INVALID', details: [
    { field: 'keyCandidates[0].columns[1]', message: 'Expose it', code: 'KEY_COLUMN_NOT_EXPOSED', severity: 'ERROR' },
    { field: 'keyCandidates[0]', message: 'Provisional', code: 'KEY_NOT_DATABASE_ENFORCED', severity: 'WARNING' },
  ] })
  const findings = findingsFromError(error)
  assert.equal(groupFindings(findings).errors.length, 1)
  assert.equal(groupFindings(findings).warnings.length, 1)
  const order = draftOrder({ columns: [{ name: 'A' }, { name: 'B' }], keyCandidates: [{ code: 'ORG_LINE' }] })
  assert.equal(describePath('keyCandidates[0].columns[1]', order), 'Key candidate ORG_LINE')
  assert.equal(describePath('columns[1]', order), 'Column B')
  assert.equal(describePath('$', order), 'Whole mapping')
  assert.deepEqual(fieldErrorsFrom(error), {}, 'mapping findings are not misread as form fields')
  assert.deepEqual(describeWorkflowFailure(error).details, [])
  for (const code of ['STALE_RECORD', 'SOURCE_VERSION_NOT_DRAFT', 'SOURCE_IDENTITY_CHANGED', 'SOURCE_BUSY']) {
    const failure = describeWorkflowFailure(new ApiError('x', { status: 409, code }))
    assert.equal(failure.stale, true, code)
  }
  assert.equal(describeWorkflowFailure(new ApiError('x', { status: 409, code: 'SOURCE_VERSION_REFERENCED' })).stale, false)
  assert.match(describeWorkflowFailure(new ApiError('x', { status: 409, code: 'SOURCE_VERSION_REFERENCED' })).message, /form mapping uses/)
  assert.equal(describeWorkflowFailure(new ApiError('Unable to connect to the server.', { code: 'NETWORK_ERROR' })).kind, 'unknown')
})

// ------------------------------------------------------------ routes and permissions

const ready = (keys) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified: false, has: (key) => set.has(key) }
}

test('mapping pages need SOURCE_MAPPING and DATA_SOURCE_REGISTRY:VIEW, and stay out of the sidebar', () => {
  const list = findAppRoute(PATHS.sourceVersions('5'))
  const create = findAppRoute(PATHS.newSourceVersion('5'))
  const record = findAppRoute(PATHS.sourceVersion('5', '41'))
  assert.equal(list.id, 'workflow-source-versions')
  assert.equal(create.id, 'workflow-source-version-new', 'the static path wins over :versionId')
  assert.equal(record.id, 'workflow-source-version')
  const { MAPPING_VIEW, MAPPING_CREATE, SOURCES_VIEW } = WORKFLOW_ACTIONS
  assert.equal(routeAccess(list, ready([MAPPING_VIEW])), 'denied', 'the registry prerequisite is required')
  assert.equal(routeAccess(list, ready([SOURCES_VIEW])), 'denied')
  assert.equal(routeAccess(list, ready([MAPPING_VIEW, SOURCES_VIEW])), 'allowed')
  assert.equal(routeAccess(record, ready([MAPPING_VIEW, SOURCES_VIEW])), 'allowed')
  assert.equal(routeAccess(create, ready([MAPPING_VIEW, SOURCES_VIEW])), 'denied', 'creation needs CREATE')
  assert.equal(routeAccess(create, ready([MAPPING_CREATE, SOURCES_VIEW])), 'allowed')
  const all = ready(Object.values(WORKFLOW_ACTIONS))
  const items = authorizedNavigation(all).find((section) => section.id === 'workflow-manager').items.map((item) => item.id)
  assert.deepEqual(items, ['workflow-manager', 'workflow-forms', 'workflow-data-sources'], 'no new sidebar entries')
  assert.equal(paletteCommands(all, 'authenticated').some((command) => command.path?.includes('mapping-versions')), false)
})

// ------------------------------------------------------------ pages (static)

test('mapping pages use the shared service, real API data and accessible controls', async () => {
  const files = {
    list: await read('../src/features/workflow-manager/pages/SourceVersionListPage.jsx'),
    editor: await read('../src/features/workflow-manager/pages/SourceVersionEditorPage.jsx'),
    columns: await read('../src/features/workflow-manager/components/SourceColumnTable.jsx'),
    keys: await read('../src/features/workflow-manager/components/SourceKeyCandidateEditor.jsx'),
    validation: await read('../src/features/workflow-manager/components/SourceValidationPanel.jsx'),
    registry: await read('../src/features/workflow-manager/pages/DataSourceRegistryPage.jsx'),
  }
  for (const [name, source] of Object.entries(files)) {
    assert.doesNotMatch(source, /\bfetch\(|axios|lorem|mock|dangerouslySetInnerHTML|JSON\.stringify\(config/i, `${name} has no other transport, fake data or raw JSON editing`)
  }
  for (const call of ['getSourceDictionary', 'getSourceMappingVersion', 'createSourceMappingVersion', 'updateSourceMappingVersion', 'revalidateSourceMappingVersion', 'getSourceMappingDrift', 'cloneSourceMappingVersion', 'deleteSourceMappingVersion']) {
    assert.match(files.editor, new RegExp(`workflowManagerService\\.${call}\\(`), `editor calls ${call}`)
  }
  assert.match(files.list, /workflowManagerService\.listSourceMappingVersions\(/)
  // Actions follow permissions and lifecycle state.
  assert.match(files.editor, /MAPPING_UPDATE/)
  assert.match(files.editor, /MAPPING_DELETE\) && version\.editable/)
  assert.match(files.list, /canDelete && version\.editable/)
  assert.match(files.registry, /can\(WORKFLOW_ACTIONS\.MAPPING_VIEW\)[\s\S]*Manage mapping/)
  // Double submits, uncertain outcomes and conflicts.
  assert.match(files.editor, /useWorkflowAction\(\)/)
  assert.match(files.editor, /outcome\.status === 'unknown'/)
  assert.match(files.editor, /Reload latest \(discards your changes\)/)
  assert.doesNotMatch(files.editor, /publish/i, 'no publication control in M2-A')
  // Accessibility: every per-row control has a name; groups have legends; results are announced.
  assert.match(files.columns, /aria-label=\{`Include \$\{column\.name\}/)
  assert.match(files.columns, /aria-label=\{`Expose \$\{column\.name\}/)
  assert.match(files.columns, /aria-label=\{`Data class of \$\{column\.name\}/)
  assert.match(files.keys, /<fieldset[\s\S]*<legend/)
  assert.match(files.validation, /aria-live="polite"/)
  assert.match(files.columns, /<th scope="row">/)
})
