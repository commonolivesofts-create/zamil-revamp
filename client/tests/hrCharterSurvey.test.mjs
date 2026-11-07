// Project Charter (ZPI.IMS.FM.13) and the employee survey reports: contracts,
// request bodies, client validation, the services' requests, the sidebar
// entries by switch and permission, and source rules. Mocked: a recording
// client stands in for the API; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registry } from '../src/config/registry/index.js'
import { charterBody, readCharterPage, readCharterRecord } from '../src/features/hr-employee-services/charter/charterContract.js'
import { MILESTONES, blankCharter, isCharterEditable, scheduleProgress, validateCharter } from '../src/features/hr-employee-services/charter/charterModel.js'
import { createCharterService } from '../src/features/hr-employee-services/charter/charterService.js'
import { ALL, createSurveyService, readChart, readDistribution } from '../src/features/hr-employee-services/survey/surveyService.js'

const ready = (keys) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified: false, has: (key) => set.has(key) }
}
const recorder = (respond) => {
  const calls = []
  const call = (method) => async (path, ...rest) => {
    const options = method === 'GET' ? rest[0] ?? {} : rest[1] ?? {}
    calls.push({ method, path, params: options.params, body: method === 'GET' ? undefined : rest[0] })
    return { data: respond(method, path, rest[0]) }
  }
  return { calls, client: { get: call('GET'), post: call('POST'), put: call('PUT') } }
}

const CHARTER = {
  headerId: '12', ideaId: '77', ideaNum: 'ID-1', projectName: 'Line automation', projectManager: 'Manager A', businessUnit: 'BU',
  expectedStartDate: '2026-12-01', expectedEndDate: '2027-03-31', purpose: 'Purpose', expectedDeliverables: 'Deliverables',
  processOwner: null, creationDate: '2026-11-04', status: 'Pending', rewardExists: false,
  milestones: { formProjectTeam: { start: true, complete: true }, definePhase: { start: true, complete: false } },
}

function validCharter() {
  return { ...blankCharter('Preparer'), ideaId: '77', projectManager: 'Manager A', expectedStartDate: '2026-12-01', expectedEndDate: '2027-03-31', purpose: ' Purpose ', expectedDeliverables: 'Deliverables' }
}

test('charter: records keep all seven milestones, blank text and Pending as the only editable state', () => {
  const record = readCharterRecord(CHARTER)
  assert.equal(record.charterId, '12')
  assert.equal(record.processOwner, '')
  assert.deepEqual(Object.keys(record.milestones), MILESTONES.map((item) => item.key))
  assert.deepEqual(record.milestones.finalizePlan, { start: false, complete: false })
  assert.deepEqual(scheduleProgress(record.milestones), { started: 2, completed: 1, total: 7 })
  assert.deepEqual(['Pending', 'Approved', ''].map(isCharterEditable), [true, false, false])
  assert.throws(() => readCharterRecord({ headerId: 'x' }), { code: 'INVALID_RESPONSE' })
  assert.equal(readCharterPage({ items: [CHARTER], page: 1, pageSize: 20, total: 1 }).pagination.total, 1)
})

test('charter: validation mirrors the server; the idea is sent on create only', () => {
  assert.deepEqual(validateCharter(validCharter(), { isNew: true }), [])
  const fields = (form, isNew = true) => validateCharter(form, { isNew }).map((problem) => problem.field)
  assert.deepEqual(fields(blankCharter()), ['ideaId', 'projectManager', 'expectedStartDate', 'expectedEndDate', 'purpose', 'expectedDeliverables'])
  assert.deepEqual(fields({ ...blankCharter(), ideaId: '' }, false).includes('ideaId'), false, 'an existing charter keeps its idea')
  assert.deepEqual(fields({ ...validCharter(), expectedEndDate: '2026-11-30' }), ['expectedEndDate'])
  assert.deepEqual(fields({ ...validCharter(), processOwner: 'x'.repeat(241) }), ['processOwner'])

  const created = charterBody(validCharter(), { isNew: true })
  assert.equal(created.ideaId, '77')
  assert.equal(created.purpose, 'Purpose')
  assert.equal(created.preparedBy, 'Preparer')
  assert.equal(Object.keys(created.milestones).length, 7)
  const updated = charterBody(validCharter(), { isNew: false })
  assert.equal('ideaId' in updated, false)
  for (const key of ['status', 'projectName', 'businessUnit', 'creationDate', 'ideaNum']) assert.equal(key in created, false, `${key} is a server value`)
})

test('charter service: lookups, list filters, create and update return the stored charter', async () => {
  const { calls, client } = recorder((method, path) => {
    if (path === '/projects/charters/lookups/ideas') return [{ ideaId: '77', ideaNum: 'ID-1', title: 'Line automation' }]
    if (path === '/projects/charters/lookups/employees') return [{ empNo: '1001', fullName: 'Manager A', jobTitle: 'Engineer' }]
    if (path === '/projects/charters') return method === 'GET' ? { items: [], page: 1, pageSize: 20, total: 0 } : CHARTER
    if (path === '/projects/charters/12') return CHARTER
    throw new Error(`unexpected ${method} ${path}`)
  })
  const service = createCharterService({ client })
  assert.equal((await service.getLookups()).ideas[0].ideaNum, 'ID-1')
  assert.equal((await service.searchEmployees(' man '))[0].name, 'Manager A')
  assert.deepEqual(calls.at(-1).params, { q: 'man', pageSize: 20 })
  await service.list({ page: 1, pageSize: 20, q: '', createdFrom: '2026-01-01' })
  assert.deepEqual(calls.at(-1).params, { page: 1, pageSize: 20, createdFrom: '2026-01-01' })
  assert.equal((await service.save(null, validCharter())).charterId, '12')
  assert.deepEqual([calls.at(-1).method, calls.at(-1).path, calls.at(-1).body.ideaId], ['POST', '/projects/charters', '77'])
  await service.save('12', validCharter())
  assert.deepEqual([calls.at(-1).method, calls.at(-1).path, 'ideaId' in calls.at(-1).body], ['PUT', '/projects/charters/12', false])
})

test('survey: charts read as per-group answer rows; "All" is sent for every unset filter', async () => {
  const chart = readChart({ categories: ['20-29'], series: [{ name: 'Agree', data: [60] }, { name: 'Strongly Agree', data: [20] }, { name: 'Disagree', data: [15] }, { name: 'Strongly Disagree', data: [5] }] })
  assert.deepEqual(chart.rows, [{ label: '20-29', values: [20, 60, 15, 5] }], 'values in Strongly Agree → Strongly Disagree order')
  const result = readDistribution({ has_data: true, scoreSummary: { agree: 50, totalCount: 4, weightedScore: 3.5, weightedPercent: 70, scoringDirection: 'reverse' }, charts: {} })
  assert.equal(result.score.reverse, true)
  assert.deepEqual(result.charts.age.chart.rows, [])
  assert.throws(() => readDistribution({}), { code: 'INVALID_RESPONSE' })

  const { calls, client } = recorder((method, path) => {
    if (path === '/survey/reports/distribution') return { has_data: false, scoreSummary: {}, charts: {} }
    if (path === '/survey/responses') return { items: [{ headerId: 5, ageBand: '30-39', submittedAt: '2026-11-03T08:00:00.000Z', year: 2026 }], page: 1, pageSize: 20, total: 1 }
    throw new Error(`unexpected ${method} ${path}`)
  })
  const service = createSurveyService({ client })
  await service.distribution('relation_1', { age: '30-39', jobLevel: '' })
  assert.deepEqual(calls.at(-1).body, { question_key: 'relation_1', age: '30-39', job_level: ALL, department: ALL, experience: ALL })
  const page = await service.list({ page: 1, pageSize: 20, year: '2026', age: '' })
  assert.deepEqual(calls.at(-1).params, { page: 1, pageSize: 20, year: '2026' })
  assert.deepEqual([page.items[0].responseId, page.items[0].submittedAt, page.items[0].year], ['5', '2026-11-03', '2026'])
})

test('sidebar: charter (Talent Management) and survey report (Reports) need their switch AND VIEW', () => {
  const ids = (env, keys) => authorizedNavigation(ready(keys), resolveNavigationEntries(registry.entries, env))
    .flatMap((section) => section.items).map((item) => item.id).filter((id) => id.startsWith('hr-charter') || id.startsWith('hr-survey'))
  const on = { VITE_FEATURE_HR_PROJECT_CHARTER: 'true', VITE_FEATURE_HR_SURVEY_REPORT: 'true', DEV: false }
  assert.deepEqual(ids(on, ['HR.PROJECT_CHARTERS:VIEW', 'HR.SURVEY_REPORTS:VIEW']), ['hr-survey-report', 'hr-charter'])
  assert.deepEqual(ids(on, []), [])
  assert.deepEqual(ids({ DEV: false }, ['HR.PROJECT_CHARTERS:VIEW', 'HR.SURVEY_REPORTS:VIEW']), [], 'unset is off in production builds')
  const entry = (id) => registry.entries.find((item) => item.id === id)
  assert.deepEqual([entry('hr-charter').subgroup, entry('hr-survey-report').subgroup], ['hr-employee-services', 'hr-reports'])
})

test('source: live APIs only, no browser storage, routed', async () => {
  for (const folder of ['charter', 'survey']) {
    const dir = new URL(`../src/features/hr-employee-services/${folder}/`, import.meta.url)
    for (const file of await readdir(dir)) {
      const source = await readFile(new URL(file, dir), 'utf8')
      assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, file)
      assert.doesNotMatch(source, /\/demo\/|DemoClient|DemoData/, `${file}: no demo data`)
    }
  }
  const router = await readFile(new URL('../src/app/router.jsx', import.meta.url), 'utf8')
  for (const path of ['hr/talent-management/project-charter', 'hr/talent-management/project-charter/report', 'hr/talent-management/project-charter/:charterId', 'hr/reports/survey', 'hr/reports/survey/responses']) {
    assert.ok(router.includes(`path: '${path}'`), path)
  }
})

test('charter form: the manager is the shared employee dropdown and the Idea heading is not duplicated', async () => {
  const page = await readFile(new URL('../src/features/hr-employee-services/charter/CharterPage.jsx', import.meta.url), 'utf8')
  assert.match(page, /<EmployeePicker id="pc-projectManager"/)
  assert.match(page, /searchService=\{searchManagers\}/)
  assert.doesNotMatch(page, /NameSuggest|<h3[^>]*>Idea<\/h3>/)
  assert.doesNotMatch(page, /Choose an approved idea, then set the manager/)
})
