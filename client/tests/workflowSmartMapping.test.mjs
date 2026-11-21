// Business-first Workflow Manager (Smart Mapping UX): readable wording, truthful readiness,
// identifier recommendation from database enforcement only, plain-language results, and the
// static guarantees of the redesigned screens (no faux features, technical details on request).
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  explainFinding,
  formReadiness,
  identifierCode,
  kindOf,
  readableName,
  recommendIdentifier,
  sourceReadiness,
} from '../src/features/workflow-manager/smartMappingModel.js'
import { readForm, readSource } from '../src/features/workflow-manager/workflowManagerContract.js'
import { describeWorkflowFailure } from '../src/features/workflow-manager/workflowManagerModel.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const column = (name, extra = {}) => ({
  name,
  oracleType: 'NUMBER',
  precision: 19,
  scale: 0,
  nullable: false,
  supported: true,
  keyEligible: true,
  missing: false,
  ...extra,
})
const snapshot = (extra = {}) => ({
  columns: [
    column('REQUEST_ID'),
    column('ORG_ID'),
    column('REQUEST_NO', { oracleType: 'VARCHAR2', charLength: 30 }),
    column('ID', { nullable: true }),
    column('ALT_NO', { oracleType: 'VARCHAR2', charLength: 30, nullable: true }),
  ],
  constraints: [
    {
      name: 'REQ_PK',
      type: 'P',
      status: 'ENABLED',
      validated: 'VALIDATED',
      columns: ['REQUEST_ID'],
    },
    {
      name: 'REQ_UK',
      type: 'U',
      status: 'ENABLED',
      validated: 'VALIDATED',
      columns: ['ORG_ID', 'REQUEST_NO'],
    },
  ],
  uniqueIndexes: [
    { name: 'REQ_ALT_UX', status: 'VALID', functionBased: false, columns: ['ALT_NO'] },
  ],
  ...extra,
})

test('readable names and kinds never require database knowledge', () => {
  assert.equal(readableName('REQUEST_DATE'), 'Request date')
  assert.equal(readableName('EMP_NO'), 'Employee number')
  assert.equal(readableName('TOTAL_AMT'), 'Total amount')
  assert.equal(readableName('ITEM_QTY'), 'Item quantity')
  assert.equal(readableName('REQUEST_ID'), 'Request ID')
  assert.equal(kindOf({ oracleType: 'VARCHAR2', charLength: 30 }), 'Text (up to 30 characters)')
  assert.equal(kindOf({ oracleType: 'NUMBER', scale: 0 }), 'Whole number')
  assert.equal(kindOf({ oracleType: 'NUMBER', scale: 2 }), 'Number with 2 decimals')
  assert.equal(kindOf({ oracleType: 'NUMBER', scale: null }), 'Number')
  assert.equal(kindOf({ oracleType: 'DATE' }), 'Date (and time)')
  assert.equal(kindOf({ oracleType: 'TIMESTAMP(6)' }), 'Date and time')
  assert.equal(kindOf({ oracleType: 'BLOB' }), 'Not usable by workflows')
})

test('readiness is truthful: only an approved default version makes a form ready', () => {
  const form = { isActive: true, versionCount: 0, defaultVersionNo: null }
  assert.equal(formReadiness(form).state, 'NOT_STARTED')
  assert.equal(formReadiness({ ...form, versionCount: 2 }).state, 'IN_SETUP')
  assert.equal(formReadiness({ ...form, versionCount: 2, defaultVersionNo: 1 }).state, 'READY')
  assert.equal(formReadiness({ ...form, isActive: false, defaultVersionNo: 1 }).state, 'INACTIVE')
  // Readiness never claims that workflows can already be configured.
  for (const state of [form, { ...form, versionCount: 1 }, { ...form, defaultVersionNo: 3 }]) {
    assert.doesNotMatch(formReadiness(state).detail, /configure/i)
  }
  const source = { isActive: true, versionCount: 0, defaultVersionNo: null }
  assert.equal(sourceReadiness(source).state, 'NOT_STARTED')
  assert.equal(sourceReadiness({ ...source, versionCount: 1 }).state, 'IN_SETUP')
  assert.equal(sourceReadiness({ ...source, defaultVersionNo: 4 }).label, 'Ready · version 4')
})

test('the recommended identifier is only one the database enforces — never a guess', () => {
  const s = snapshot()
  assert.deepEqual(recommendIdentifier(s, s.columns), {
    columns: ['REQUEST_ID'],
    kind: 'PRIMARY_KEY',
    name: 'REQ_PK',
  })
  // Without a primary key: the narrowest enforced unique rule over never-empty columns.
  const noPk = snapshot({ constraints: s.constraints.filter((c) => c.type !== 'P') })
  assert.deepEqual(recommendIdentifier(noPk, noPk.columns).columns, ['ORG_ID', 'REQUEST_NO'])
  // A unique index over a column that may be empty does not enforce uniqueness, and a column
  // called "ID" is not an identifier because of its name.
  const nothing = snapshot({ constraints: [] })
  assert.equal(recommendIdentifier(nothing, nothing.columns), null)
  const disabled = snapshot({
    constraints: s.constraints.map((c) => ({ ...c, validated: 'NOT VALIDATED' })),
  })
  assert.equal(recommendIdentifier(disabled, disabled.columns), null)
  // Columns that cannot be keys are never recommended.
  assert.equal(
    recommendIdentifier(
      s,
      s.columns.map((c) => (c.name === 'REQUEST_ID' ? { ...c, keyEligible: false } : c)),
    ).name,
    'REQ_UK',
  )
  assert.equal(recommendIdentifier(null, []), null)
  assert.equal(identifierCode([]), 'RECORD_ID')
  assert.equal(identifierCode([{ code: 'RECORD_ID' }, { code: 'RECORD_ID_2' }]), 'RECORD_ID_3')
})

test('results explain what failed and how to fix it, keeping unknown server messages', () => {
  const known = explainFinding({ code: 'KEY_DUPLICATES_OBSERVED', message: 'raw' })
  assert.match(known.what, /share the same identifier/)
  assert.match(known.fix, /Choose another/)
  assert.deepEqual(explainFinding({ code: 'SOMETHING_NEW', message: 'Server text' }), {
    what: 'Server text',
    fix: null,
  })
})

test('server errors carry a support reference; refusals do not', () => {
  const server = describeWorkflowFailure({
    status: 500,
    code: 'INTERNAL_ERROR',
    requestId: 'req-42',
  })
  assert.ok(server.details.includes('Reference for support: req-42'))
  const refused = describeWorkflowFailure({
    status: 409,
    code: 'STALE_RECORD',
    requestId: 'req-43',
  })
  assert.ok(!(refused.details ?? []).some((d) => String(d).includes('req-43')))
  const unsafe = describeWorkflowFailure({ status: 500, requestId: '<script>' })
  assert.ok(!(unsafe.details ?? []).some((d) => String(d).includes('<script>')))
})

test('readiness fields are read strictly from the API', () => {
  const base = {
    formId: '1',
    formCode: 'SICK_LEAVE',
    formName: 'Sick leave',
    moduleCode: 'HR',
    isActive: true,
    versionCount: 1,
    rowVersion: 1,
  }
  assert.equal(readForm(base).defaultVersionNo, null, 'absent means none yet')
  assert.equal(readForm({ ...base, defaultVersionNo: 2 }).defaultVersionNo, 2)
  assert.throws(() => readForm({ ...base, defaultVersionNo: '2' }), /unexpected response/)
  const source = {
    sourceId: '5',
    sourceCode: 'SRC',
    sourceName: 'Source',
    sourceKind: 'TABLE',
    isActive: true,
    versionCount: 0,
    rowVersion: 1,
  }
  assert.equal(readSource({ ...source, defaultVersionNo: null }).defaultVersionNo, null)
  assert.throws(() => readSource({ ...source, defaultVersionNo: -1 }), /unexpected response/)
})

test('screens offer no faux workflow features and keep technical details out of the way', async () => {
  const overview = await read('../src/features/workflow-manager/pages/WorkflowOverviewPage.jsx')
  const record = await read('../src/features/workflow-manager/pages/FormRecordPage.jsx')
  const registry = await read('../src/features/workflow-manager/pages/FormRegistryPage.jsx')
  const list = await read('../src/features/workflow-manager/pages/SourceVersionListPage.jsx')
  const editor = await read('../src/features/workflow-manager/components/FormEditor.jsx')
  // No link or button into a workflow designer that does not exist yet.
  for (const page of [overview, record, registry]) {
    assert.doesNotMatch(page, /to=\{?['"`]\/workflow-manager\/(workflows|designer)/)
    assert.doesNotMatch(page, /Configure workflow<\/(button|Link)>/)
  }
  assert.match(overview, /formReadiness/)
  assert.match(registry, /<ReadinessBadge readiness=\{formReadiness\(form\)\} \/>/)
  assert.doesNotMatch(registry, /detailRoute/, 'no routes in the business list')
  // Technical identity only for form administrators.
  assert.match(record, /const technical = canEdit \|\| can\(WORKFLOW_ACTIONS\.FORMS_CREATE\)/)
  assert.match(record, /\{technical && \(\s*<TechnicalDetails>/)
  assert.match(editor, /\{technical && \(\s*<fieldset className="zwf-fieldset">/)
  // Fingerprints left the version list; one primary action.
  assert.doesNotMatch(list, /configSha256/)
  assert.match(list, /Continue draft version/)
  assert.match(list, /Start a new version/)
})
