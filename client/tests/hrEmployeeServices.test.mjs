// HR employee services (features/hr-employee-services): Personnel Record
// Change (form 1110), Transfer Request (ZPI.TCN.FM.01) and the annual
// Performance Appraisal. Business rules, response contracts, services over the
// shared API client (mocked transport), the in-memory demo adapter used by
// transfer/appraisal, the visibility and data-source switches and static
// checks of the JSX. No backend, Oracle or browser storage is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import {
  authorizedNavigation, findAppRoute, implementedRoutes, isFeatureEnabled, paletteCommands, resolveNavigationEntries, routeAccess,
} from '../src/config/appNavigation.js'
import { registeredModules, registry } from '../src/config/registry/index.js'
import { resolveEmployeeServicesDemoMode } from '../src/features/hr-employee-services/hrEmployeeServicesConfig.js'
import { resolveDemoMode } from '../src/features/hr-recruitment/hrRecruitmentConfig.js'
import {
  readAppraisal, readAppraisalTeam, readEmployeeServicesLookups, readPerformanceLookups, readRecordChange, readServiceEmployee, readTransfer,
} from '../src/features/hr-employee-services/hrEmployeeServicesContract.js'
import { createEmployeeServices, identifyEmployeeServicesUser, selectEmployeeServicesClient } from '../src/features/hr-employee-services/hrEmployeeServicesService.js'
import { createEmployeeServicesDemoClient } from '../src/features/hr-employee-services/demo/employeeServicesDemoClient.js'
import { DEMO_EMPLOYEE_SERVICES_LOOKUPS, DEMO_PERFORMANCE_LOOKUPS, DEMO_REQUESTER, DEMO_SERVICE_EMPLOYEES, DEMO_TEAM } from '../src/features/hr-employee-services/demo/employeeServicesDemoData.js'
import { ariaSort, filterAndSort, hijriDate, nextSort, statusCounts } from '../src/features/hr-employee-services/shared/esFormat.js'
import {
  AMOUNT, PAY_KEYS, TEXT_MAX, amountDelta, blankRecordChange, changeTypes, changedKeys, counterState, isRecordChangeLocked, recordChangePayload,
  recordTotal, totalGoesDown, validateRecordChange,
} from '../src/features/hr-employee-services/recordChange/recordChangeModel.js'
import { routeStates } from '../src/features/hr-employee-services/shared/approvals.js'
import {
  OFFICE_APPROVALS, TRANSFER_ROUTE, blankTransfer, isTransferLocked, officeStates, sectionsOf, transferMoves, transferPayload, validateTransfer, withDestination,
  withTransferEmployee,
} from '../src/features/hr-employee-services/transfer/transferModel.js'
import {
  DEFAULT_DISTRIBUTION, DEFAULT_SCALE, appraisalPayload, appraisalResult, averageRating, blankAppraisal, filledLines, gradeAllocation, gradeQuotas, isOverQuota,
  missingExplanations, needsExplanation, ratedCount, scaleFor, validateAppraisal, yearsUntil,
} from '../src/features/hr-employee-services/performance/appraisalModel.js'
import { SESSION_TOKEN, forbidBrowserStorage, noContent, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const FEATURE = '../src/features/hr-employee-services/'
const SWITCH = 'VITE_FEATURE_HR_EMPLOYEE_SERVICES'
const employee = DEMO_SERVICE_EMPLOYEES[0]
const current = employee.current
const editable = (values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]))
const demoServices = (options = {}) => {
  const client = createEmployeeServicesDemoClient({ latencyMs: 0, now: () => new Date('2026-10-29T08:00:00Z'), ...options })
  return { client, services: createEmployeeServices({ client }) }
}
const codesOf = (problems) => problems.map(({ field, code }) => `${field}:${code}`)

// ------------------------------------------------------------ personnel record change: rules

test('record change: Total SR = basic + house + transport + other + communication + car', () => {
  assert.deepEqual(PAY_KEYS, ['basic', 'house', 'transport', 'other', 'communication', 'car'])
  assert.equal(recordTotal(current), 6500 + 1625 + 650 + 0 + 150 + 0)
  assert.equal(recordTotal({ basic: '100.10', house: '0.20', transport: '', other: '1', communication: '0', car: '0' }), 101.3, 'cents, no float drift')
  assert.equal(recordTotal(null), 0)
})

test('record change: each row shows the difference as an amount and a percentage', () => {
  assert.deepEqual(amountDelta(6500, '7150'), { amount: 650, percent: 10 })
  assert.deepEqual(amountDelta(6500, '6000'), { amount: -500, percent: -7.7 })
  assert.deepEqual(amountDelta(0, '300'), { amount: 300, percent: null }, 'no percentage from 0')
  assert.deepEqual(amountDelta(1625, '1625.00'), { amount: 0, percent: 0 })
})

test('record change: amounts are 0 or more with up to 2 decimals', () => {
  for (const value of ['0', '12', '12.5', '12.50']) assert.ok(AMOUNT.test(value), value)
  for (const value of ['-1', '1.234', '1.', '.5', 'abc', '1,000']) assert.equal(AMOUNT.test(value), false, value)
})

test('record change: change types are detected automatically', () => {
  const revised = (changes) => ({ ...editable(current), ...changes })
  assert.deepEqual(changeTypes(current, revised({})), [])
  assert.deepEqual(changeTypes(current, revised({ positionCode: 'SENIOR_HR_OFFICER' })), ['POSITION'])
  assert.deepEqual(changeTypes(current, revised({ basic: '7000' })), ['SALARY_INCREASE'])
  assert.deepEqual(changeTypes(current, revised({ basic: '6000' })), ['SALARY_DECREASE'])
  assert.deepEqual(changeTypes(current, revised({ house: '1700', car: '500' })), ['ALLOWANCE'])
  assert.deepEqual(changeTypes(current, revised({ gradeCode: 'G7' })), ['GRADE_LEVEL'])
  assert.deepEqual(changeTypes(current, revised({ levelCode: 'L3' })), ['GRADE_LEVEL'])
  assert.deepEqual(changeTypes(current, revised({ familyStatusCode: 'MARRIED' })), ['FAMILY_STATUS'])
  assert.deepEqual(changeTypes(current, revised({ positionCode: 'SENIOR_HR_OFFICER', basic: '7000', house: '1750', gradeCode: 'G7', familyStatusCode: 'MARRIED' })),
    ['POSITION', 'SALARY_INCREASE', 'ALLOWANCE', 'GRADE_LEVEL', 'FAMILY_STATUS'])
  assert.deepEqual(changedKeys(current, revised({ basic: '6500.00', house: '' })), [], 'the same amount or an empty value is no change')
})

test('record change: a lower total is a reminder, not a block', () => {
  const lower = { ...editable(current), basic: '6000' }
  assert.equal(totalGoesDown(current, lower), true)
  assert.equal(totalGoesDown(current, { ...editable(current), basic: '7000' }), false)
  const problems = validateRecordChange({ ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', revised: lower }, employee, { submit: true })
  assert.deepEqual(problems, [], 'a decrease can be submitted')
})

test('record change: effective date is required to submit and never before the start date', () => {
  const form = (effectiveDate) => ({ ...blankRecordChange('2026-10-29'), effectiveDate, revised: { ...editable(current), basic: '7000' } })
  assert.deepEqual(codesOf(validateRecordChange(form(''), employee, { submit: true })), ['effectiveDate:required'])
  assert.deepEqual(codesOf(validateRecordChange(form(''), employee, { submit: false })), ['effectiveDate:required'], 'the API requires an effective date even for drafts')
  assert.deepEqual(codesOf(validateRecordChange(form('2019-03-09'), employee, { submit: false })), ['effectiveDate:beforeStart'])
  assert.deepEqual(codesOf(validateRecordChange(form('2019-03-10'), employee, { submit: true })), [], 'the start date itself is allowed')
  assert.deepEqual(codesOf(validateRecordChange(form('01/11/2026'), employee, { submit: true })), ['effectiveDate:invalid'])
})

test('record change: employee, position and the six pay items are required; submitting needs a change', () => {
  assert.deepEqual(codesOf(validateRecordChange(blankRecordChange('2026-10-29'), null, { submit: false })), ['employee:required', 'effectiveDate:required'])
  const revised = { ...editable(current), positionCode: '', house: '', car: '1.234' }
  const problems = validateRecordChange({ ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', revised }, employee, { submit: true })
  assert.deepEqual(codesOf(problems), ['positionCode:required', 'house:required', 'car:amount', 'revised:noChange'])
  assert.ok(problems.every((problem) => problem.step === 1), 'all on the revised record step')
  const unchanged = { ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', revised: editable(current) }
  assert.deepEqual(codesOf(validateRecordChange(unchanged, employee, { submit: true })), ['revised:noChange'])
  assert.deepEqual(codesOf(validateRecordChange(unchanged, employee, { submit: false })), [], 'a draft without changes can be saved')
})

test('record change: remarks and views allow 2000 characters each, with a live counter', () => {
  assert.equal(TEXT_MAX, 2000)
  const form = (remarks, views) => ({ ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', remarks, views, revised: editable(current) })
  assert.deepEqual(codesOf(validateRecordChange(form('x'.repeat(2000), 'y'.repeat(2000)), employee, { submit: false })), [])
  const problems = validateRecordChange(form('x'.repeat(2001), 'y'.repeat(2001)), employee, { submit: false })
  assert.deepEqual(codesOf(problems), ['remarks:tooLong', 'views:tooLong'])
  assert.ok(problems.every((problem) => problem.step === 2))
  assert.equal(counterState(1800), '')
  assert.equal(counterState(1801), 'near')
  assert.equal(counterState(2000), 'near')
  assert.equal(counterState(2001), 'over')
})

test('record change: request body carries only the answers; amounts as numbers', () => {
  const form = { ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', revised: { ...editable(current), basic: '7000.5', car: '' },
    remarks: 'Promotion', views: '', attachments: [{ fileName: 'letter.pdf', sizeBytes: 2048, file: {} }] }
  const body = recordChangePayload(form, employee)
  assert.deepEqual(Object.keys(body), ['employeeId', 'effectiveDate', 'revised', 'remarks', 'views', 'attachments'])
  assert.equal(body.employeeId, '101')
  assert.equal(body.revised.basic, 7000.5)
  assert.equal(body.revised.car, null)
  assert.equal(body.revised.positionCode, 'HR_OFFICER')
  assert.deepEqual(body.attachments, [{ fileName: 'letter.pdf', sizeBytes: 2048 }], 'file contents are never in the JSON body')
})

test('record change: route Noted by HR & Admin. Manager → Approved by President; submitted and approved are read-only', () => {
  assert.deepEqual(routeStates(['NOTED_BY', 'APPROVED_BY'], 'DRAFT'), ['DRAFT', 'DRAFT'])
  assert.deepEqual(routeStates(['NOTED_BY', 'APPROVED_BY'], 'SUBMITTED'), ['PENDING', 'WAITING'])
  assert.deepEqual(routeStates(['NOTED_BY', 'APPROVED_BY'], 'APPROVED'), ['APPROVED', 'APPROVED'])
  assert.equal(isRecordChangeLocked('DRAFT'), false)
  assert.equal(isRecordChangeLocked('SUBMITTED'), true)
  assert.equal(isRecordChangeLocked('APPROVED'), true)
})

test('header date in Arabic on the Umm al-Qura calendar', () => {
  const hijri = hijriDate('2026-10-29')
  assert.match(hijri, /[؀-ۿ]/, 'Arabic script')
  assert.match(hijri, /١٤٤٨/, 'Hijri year 1448')
  assert.equal(hijriDate(''), '')
  assert.equal(hijriDate('2026-13-01'), '')
})

// ------------------------------------------------------------ list views

test('list views: status tab counts, search, sorting with aria-sort', () => {
  const rows = [
    { number: 'PCR-2', status: 'DRAFT', name: 'Sample Employee 002', total: 50, date: '2026-10-02' },
    { number: 'PCR-1', status: 'SUBMITTED', name: 'Sample Employee 001', total: -20, date: '2026-10-01' },
    { number: 'PCR-3', status: 'SUBMITTED', name: 'Sample Employee 003', total: null, date: '2026-10-03' },
  ]
  assert.deepEqual(statusCounts(rows, ['DRAFT', 'SUBMITTED', 'APPROVED']), [['ALL', 3], ['DRAFT', 1], ['SUBMITTED', 2], ['APPROVED', 0]])
  const searchText = (row) => `${row.number} ${row.name}`
  assert.deepEqual(filterAndSort(rows, { status: 'SUBMITTED', searchText }).map((row) => row.number), ['PCR-1', 'PCR-3'])
  assert.deepEqual(filterAndSort(rows, { search: 'employee 002', searchText }).map((row) => row.number), ['PCR-2'])
  assert.deepEqual(filterAndSort(rows, { searchText, sort: { key: 'date', dir: -1 } }).map((row) => row.number), ['PCR-3', 'PCR-2', 'PCR-1'])
  assert.deepEqual(filterAndSort(rows, { searchText, sort: { key: 'total', dir: 1 } }).map((row) => row.number), ['PCR-1', 'PCR-2', 'PCR-3'], 'numbers numerically, empty last')
  assert.deepEqual(nextSort({ key: 'date', dir: -1 }, 'date'), { key: 'date', dir: 1 })
  assert.deepEqual(nextSort({ key: 'date', dir: -1 }, 'name'), { key: 'name', dir: 1 })
  assert.equal(ariaSort({ key: 'date', dir: 1 }, 'date'), 'ascending')
  assert.equal(ariaSort({ key: 'date', dir: -1 }, 'date'), 'descending')
  assert.equal(ariaSort({ key: 'date', dir: -1 }, 'name'), 'none')
})

// ------------------------------------------------------------ contracts and services

const recordChangeResponse = (overrides = {}) => ({
  requestId: '7', requestNumber: 'PCR-2026-0007', status: 'DRAFT', requestDate: '2026-10-29', requestedBy: { name: 'Sample Requester', employeeNumber: '9001' },
  employee, effectiveDate: '2026-11-01', revised: { ...current, basic: 7000 }, remarks: '', views: '', attachments: [],
  approvals: [{ role: 'NOTED_BY', state: 'DRAFT' }, { role: 'APPROVED_BY', state: 'DRAFT' }], updatedAt: '2026-10-29T08:00:00.000Z', ...overrides,
})

test('contracts: employee with current record and record change shapes are checked', () => {
  assert.equal(readServiceEmployee(employee).current.basic, 6500)
  assert.throws(() => readServiceEmployee({ ...employee, current: { ...current, basic: -1 } }), /unexpected response/)
  assert.throws(() => readServiceEmployee({ ...employee, startDate: '29/10/2026' }), /unexpected response/)
  assert.equal(readRecordChange(recordChangeResponse()).revised.basic, 7000)
  assert.equal(readRecordChange(recordChangeResponse({ revised: { ...current, car: null } })).revised.car, null, 'a draft may hold an empty amount')
  assert.throws(() => readRecordChange(recordChangeResponse({ status: 'PENDING' })), /unexpected response/)
  assert.throws(() => readRecordChange(recordChangeResponse({ approvals: [] })), /unexpected response/)
  assert.throws(() => readRecordChange(recordChangeResponse({ remarks: 'x'.repeat(2001) })), /unexpected response/)
  assert.throws(() => readRecordChange(recordChangeResponse({ requestedBy: null })), /unexpected response/, 'the requester comes from the server')
})

test('personal status service uses its actual lookup, list and draft CRUD endpoints', async () => {
  const position = { name: 'Operator' }
  const old = { position: 'Operator', basicSal: 5000, houseAll: 1000, transAll: 500, otherAll: 0, communAll: 300, carAll: 200, maritalStatus: 'M' }
  const revised = { ...old, position: 'Supervisor', basicSal: 5500 }
  const apiRecord = {
    headerId: '7', refNo: '0007-Production', formDate: '2026-10-29', effectiveDate: '2026-11-01', empNo: '2558', empName: 'Employee Example',
    nationality: 'Saudi', section: 'Production', department: 'Injection', startDate: '2019-03-17', old, new: revised,
    remarks: 'Review', views: 'Notes', status: 'DRAFT', signatures: {}, createdAt: '2026-10-29', updatedAt: '2026-10-29',
  }
  const autoFill = { branch: 'employeeMaster', empNo: '2558', empName: 'Employee Example', nationality: 'Saudi', section: 'Production',
    department: 'Injection', startDate: '2019-03-17', old, new: { position: old.position, maritalStatus: 'M' } }
  const { fetchImpl, calls } = recordingFetch((url, init) => {
    if (url === '/api/v1/hr/personnel-record-changes/lookups/positions') return success([position])
    if (url === '/api/v1/hr/personnel-record-changes/lookups/employees') return success([{ empNo: '2172' }, { empNo: '2558' }])
    if (url === '/api/v1/hr/personnel-record-changes/lookups/employees/2172') return success({
      branch: 'previousRequest', empNo: '2172', empName: null, nationality: null, section: null, department: null, startDate: null,
      old: { position: 'Head of IT', basicSal: 20000, houseAll: 0, transAll: 0, otherAll: 0, communAll: 0, carAll: 0, total: 20000 },
      new: { position: 'Head of IT', maritalStatus: null },
    })
    if (url === '/api/v1/hr/personnel-record-changes/lookups/employees/2558') return success(autoFill)
    if (url === '/api/v1/hr/personnel-record-changes?page=1&pageSize=100&sort=headerId&order=desc') {
      return success({ meta: { page: 1, pageSize: 100, total: 1 }, rows: [{ headerId: '7', refNo: apiRecord.refNo, status: 'DRAFT', empNo: '2558', empName: apiRecord.empName,
        formDate: apiRecord.formDate, effectiveDate: apiRecord.effectiveDate, position: 'Supervisor', oldTotal: 7000, newTotal: 7500 }] })
    }
    if (url === '/api/v1/hr/personnel-record-changes' && init.method === 'POST') return success(apiRecord, 201)
    if (url === '/api/v1/hr/personnel-record-changes/7' && init.method === 'PUT') return success(apiRecord)
    if (url === '/api/v1/hr/personnel-record-changes/7' && init.method === 'GET') return success(apiRecord)
    if (url === '/api/v1/hr/personnel-record-changes/7' && init.method === 'DELETE') return noContent()
    throw new Error(`Unexpected request: ${init.method} ${url}`)
  })
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  const services = createEmployeeServices({ client, recordChangeClient: client })
  const lookups = await services.recordChanges.getLookups()
  assert.deepEqual(lookups.positions.map((item) => item.name), ['Operator'])
  const found = await services.recordChanges.searchEmployees('2558')
  assert.equal(found.items[0].name, 'Employee Example')
  assert.equal(found.items[0].current.basic, 5000)
  const previousRequestEmployee = await services.recordChanges.searchEmployees('2172')
  assert.equal(previousRequestEmployee.items[0].name, '2172', 'the employee number remains visible when the saved snapshot has no name')
  assert.equal(previousRequestEmployee.items[0].current.positionName, 'Head of IT')
  const listed = await services.recordChanges.list()
  assert.equal(listed.items[0].requestNumber, '0007-Production')
  assert.equal(listed.items[0].position, 'Supervisor')
  assert.equal(listed.items[0].totalChange, 500)

  const form = { ...blankRecordChange('2026-10-29'), requestDate: '2026-10-29', effectiveDate: '2026-11-01', revised: {
    ...found.items[0].current, positionCode: lookups.positions[0].code, basic: '5500',
  } }
  const draft = await services.recordChanges.save(null, { ...recordChangePayload(form, found.items[0]), requestDate: form.requestDate, arbDate: '06 Safar 1448' }, found.items[0])
  assert.equal(draft.requestId, '7')
  assert.equal(draft.employee.name, 'Employee Example')
  const updated = await services.recordChanges.save('7', { ...recordChangePayload(form, found.items[0]), requestDate: form.requestDate }, found.items[0])
  assert.equal(updated.requestNumber, '0007-Production')
  assert.equal((await services.recordChanges.getById('7')).revised.basic, 5500)
  await services.recordChanges.delete('7')
  const postCall = calls.find((call) => call.init.method === 'POST')
  assert.equal(postCall.url, '/api/v1/hr/personnel-record-changes')
  const posted = JSON.parse(postCall.init.body)
  assert.equal(posted.empNo, '2558')
  assert.equal(posted.formDate, '2026-10-29')
  assert.equal(posted.arbDate, '06 Safar 1448')
  assert.equal(posted.effectiveDate, '2026-11-01')
  assert.equal(posted.old.basicSal, 5000)
  assert.equal(posted.new.position, 'Operator')
  assert.equal(posted.new.basicSal, 5500)
  assert.equal(posted.new.maritalStatus, 'M')
  const writeCalls = calls.filter((call) => ['POST', 'PUT', 'DELETE'].includes(call.init.method))
  for (const call of writeCalls) assert.equal(call.init.headers.get('X-CSRF-Token'), SESSION_TOKEN, call.url)
  await assert.rejects(() => services.recordChanges.getById('../7'), /selected record is invalid/)
})

test('demo adapter: record change save, server values, submit locks; 404, 409 and 422 error paths', async () => {
  const restore = forbidBrowserStorage()
  try {
    const { client, services } = demoServices()
    identifyEmployeeServicesUser({ fullName: ' Sample Signed-in User ', employeeNumber: '7001' }, client)
    const listed = await services.recordChanges.list()
    assert.equal(listed.items.length, 4, 'four seeded requests')
    assert.deepEqual(listed.items.map((item) => item.status).sort(), ['APPROVED', 'DRAFT', 'SUBMITTED', 'SUBMITTED'])
    const form = { ...blankRecordChange('2026-10-29'), effectiveDate: '2026-11-01', revised: { ...editable(current), basic: '7000' } }
    const draft = await services.recordChanges.save(null, recordChangePayload(form, employee))
    assert.equal(draft.requestNumber, 'PCR-2026-1054', 'the next number after the seeded ones')
    assert.equal(draft.status, 'DRAFT')
    assert.deepEqual(draft.requestedBy, { name: 'Sample Signed-in User', employeeNumber: '7001' })
    assert.equal(draft.employee.current.basic, 6500, 'the current record is the server snapshot')
    assert.deepEqual(draft.approvals.map((item) => item.state), ['DRAFT', 'DRAFT'])
    const listItem = (await services.recordChanges.list()).items.find((item) => item.requestId === draft.requestId)
    assert.deepEqual(listItem.changeTypes, ['SALARY_INCREASE'])
    assert.equal(listItem.totalChange, 500)
    const submitted = await services.recordChanges.submit(draft.requestId)
    assert.equal(submitted.status, 'SUBMITTED')
    assert.deepEqual(submitted.approvals.map((item) => item.state), ['PENDING', 'WAITING'])
    await assert.rejects(() => services.recordChanges.save(draft.requestId, recordChangePayload(form, employee)), (error) => error.status === 409)
    await assert.rejects(() => services.recordChanges.submit(draft.requestId), (error) => error.status === 409)
    await assert.rejects(() => services.recordChanges.getById('999'), (error) => error.status === 404)
    const unchanged = await services.recordChanges.save(null, recordChangePayload({ ...form, revised: editable(current) }, employee))
    await assert.rejects(() => services.recordChanges.submit(unchanged.requestId), (error) => error.status === 422 && error.details.some((item) => item.field === 'revised'))
    await assert.rejects(() => services.recordChanges.save(null, { employeeId: '101', effectiveDate: '2000-01-01', revised: current, remarks: '', views: '' }),
      (error) => error.status === 422 && error.details.some((item) => item.field === 'effectiveDate'))
  } finally {
    restore()
  }
})

test('data source: VITE_HR_EMPLOYEE_SERVICES_DEMO, separate from the recruitment flag', () => {
  const states = [
    [{ VITE_HR_EMPLOYEE_SERVICES_DEMO: 'true', DEV: false }, true],
    [{ VITE_HR_EMPLOYEE_SERVICES_DEMO: 'false', DEV: true }, false],
    [{ DEV: true }, true],
    [{ DEV: false }, false],
    [{}, false],
  ]
  for (const [env, demo] of states) assert.equal(resolveEmployeeServicesDemoMode(env), demo, JSON.stringify(env))
  // The transfer/appraisal demo switch is independent from recruitment.
  const env = { VITE_HR_RECRUITMENT_DEMO: 'false', DEV: true }
  assert.equal(resolveDemoMode(env), false)
  assert.equal(resolveEmployeeServicesDemoMode(env), true)
  const api = { get() {} }
  assert.equal(selectEmployeeServicesClient({ demo: false, api }), api)
  assert.equal(selectEmployeeServicesClient({ demo: true, api }).demo, true)
})

// ------------------------------------------------------------ navigation and visibility

const ES_IDS = ['hr-transfer', 'hr-transfer-report', 'hr-transfer-record', 'hr-appraisal', 'hr-appraisal-record']
const ES_NAV_IDS = ES_IDS.filter((id) => !id.endsWith('-record'))
const employeeAccess = { status: 'ready', mfaVerified: false, has: (key) => key === 'HR.TRANSFER_REQUESTS:VIEW' }
const servicesFor = (env) => resolveNavigationEntries(registry.entries, env).filter((route) => ES_IDS.includes(route.id))

test('visibility switch VITE_FEATURE_HR_EMPLOYEE_SERVICES: true, false, unset in development and in production', () => {
  const states = [
    [{ [SWITCH]: 'true', DEV: false }, true, 'true (production build)'],
    [{ [SWITCH]: 'false', DEV: true }, false, 'false wins over a development build'],
    [{ DEV: true }, true, 'unset in a development build'],
    [{ DEV: false }, false, 'unset in a production build'],
    [{}, false, 'unset, no build information (plain Node)'],
  ]
  for (const [env, visible, label] of states) {
    assert.equal(isFeatureEnabled({ env: SWITCH }, env), visible, label)
    assert.deepEqual(servicesFor(env).map((route) => route.implemented), ES_IDS.map(() => visible), label)
  }
  assert.deepEqual(registry.entries.filter((entry) => entry.enabledBy?.env === SWITCH).map((entry) => entry.id), [
    'hr-record-change', 'hr-record-change-requests', 'hr-record-change-record', ...ES_IDS,
  ])
  // The recruitment switch does not show these pages, and this switch does not show recruitment pages.
  const recruitmentOn = resolveNavigationEntries(registry.entries, { VITE_FEATURE_HR_RECRUITMENT: 'true', DEV: false })
  assert.ok(recruitmentOn.filter((route) => ES_IDS.includes(route.id)).every((route) => !route.implemented))
  const servicesOn = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true', DEV: false })
  assert.equal(servicesOn.find((route) => route.id === 'hr-probation').implemented, false)
})

test('a switched-off employee services page is absent from the sidebar, palette, guard and router', async () => {
  const on = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true' })
  const off = resolveNavigationEntries(registry.entries, { [SWITCH]: 'false', DEV: true })
  const listed = (ids) => ids.filter((id) => ES_IDS.includes(id))
  const sidebar = (routes) => authorizedNavigation(employeeAccess, routes).flatMap((section) => section.items.map((item) => item.id))
  const palette = (routes) => paletteCommands(employeeAccess, 'authenticated', routes).map((command) => command.id)
  assert.deepEqual(listed(sidebar(on)), ES_NAV_IDS)
  assert.deepEqual(listed(sidebar(off)), [])
  assert.deepEqual(listed(palette(on)), ES_NAV_IDS)
  assert.deepEqual(listed(palette(off)), [])
  for (const id of ES_IDS) {
    assert.equal(routeAccess(off.find((route) => route.id === id), employeeAccess), 'unavailable', id)
    assert.equal(routeAccess(on.find((route) => route.id === id), employeeAccess), 'allowed', `${id}: session-only`)
  }
  assert.deepEqual(implementedRoutes.filter((route) => ES_IDS.includes(route.id)), [], 'off in this (plain Node) build')
  const router = await read('../src/app/router.jsx')
  for (const id of ES_IDS) assert.ok(router.includes(`handle: { routeId: '${id}' }`), `${id} has a router line, filtered by implementedOnly`)
})

test('routes: transfers use HR permissions and list paths win over record ids', () => {
  const module = registeredModules.find((item) => item.code === 'HR_EMPLOYEE_SERVICES')
  assert.equal(module.rbac, false)
  const hr = registeredModules.find((item) => item.code === 'HR')
  assert.deepEqual(hr.resources.find((item) => item.code === 'TRANSFER_REQUESTS').actions, ['VIEW', 'CREATE', 'UPDATE', 'DELETE'])
  assert.deepEqual(servicesFor({ [SWITCH]: 'true' }).map((route) => [route.id, route.path, route.nav !== false, route.permission]), [
    ['hr-transfer', '/hr/employee-services/transfer', true, 'HR.TRANSFER_REQUESTS:VIEW'],
    ['hr-transfer-report', '/hr/employee-services/transfer/report', true, 'HR.TRANSFER_REQUESTS:VIEW'],
    ['hr-transfer-record', '/hr/employee-services/transfer/:transferId', false, 'HR.TRANSFER_REQUESTS:VIEW'],
    ['hr-appraisal', '/hr/performance/appraisal', true, undefined],
    ['hr-appraisal-record', '/hr/performance/appraisal/:appraisalId', false, undefined],
  ])
  assert.equal(findAppRoute('/hr/employee-services/record-change/requests')?.id, 'hr-record-change-requests')
  assert.equal(findAppRoute('/hr/employee-services/record-change/12')?.id, 'hr-record-change-record')
  assert.equal(findAppRoute('/hr/employee-services/record-change')?.id, 'hr-record-change')
  assert.equal(findAppRoute('/hr/employee-services/transfer/report')?.id, 'hr-transfer-report')
  assert.equal(findAppRoute('/hr/employee-services/transfer/3')?.id, 'hr-transfer-record')
})

// ------------------------------------------------------------ static checks of the screens

test('record change page: not in the recruitment flow, services only, linked errors, reset per row', async () => {
  const page = await read(`${FEATURE}recordChange/RecordChangePage.jsx`)
  assert.match(page, /<RecruitmentLoader current="record-change" flow=\{false\} identify=\{NO_IDENTIFY\}/)
  assert.match(page, /<RecruitmentShell current="record-change" flow=\{false\}/)
  assert.match(page, /cacheKey="hr-service-employees"/)
  assert.match(page, /fieldProps\(id, \{ error: errors\[key\] \}\)/, 'row inputs link their error with aria-describedby')
  assert.match(page, /aria-label=\{C\.reset\(name\)\}/)
  assert.match(page, /aria-describedby=\{\[errors\[key\] \? `rc-\$\{key\}-error` : null, `rc-\$\{key\}-count`\]/, 'the counter describes the text area')
  assert.match(page, /\{ icon: 'house', label: C\.home, onClick: \(\) => leave\('\/dashboard'\) \}/)
  assert.match(page, /leave\(ES_PATHS\.recordChangeRequests\)/)
  assert.match(page, /editor\.reject\(problems\[0\]\.step/, 'validation opens the step with the first problem')
  const list = await read(`${FEATURE}recordChange/RecordChangeRequestsPage.jsx`)
  assert.match(list, /<RecordList /)
  const recordList = await read(`${FEATURE}shared/RecordList.jsx`)
  assert.match(recordList, /role="tablist"/)
  assert.match(recordList, /role="tab"/)
  assert.match(recordList, /role="tabpanel"/)
  assert.match(recordList, /aria-sort=\{/)
  assert.match(recordList, /event\.key === 'ArrowRight'/)
})

test('employee services sources: no browser storage, no hard-coded people, text in the string constants', async () => {
  const files = []
  const walk = async (dir) => {
    for (const entry of await readdir(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(`${dir}${entry.name}/`)
      else files.push(`${dir}${entry.name}`)
    }
  }
  await walk(FEATURE)
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, file)
    // Outside the demo data nobody is hard-coded: requester, appraiser and employee numbers come from the server.
    if (!file.includes('/demo/')) assert.doesNotMatch(source, /\b(REQUESTER|APPRAISER)\s*=|['"]\d{4}['"]/, file)
  }
  // Every demo person follows the fictional "Sample …" pattern.
  for (const person of DEMO_SERVICE_EMPLOYEES) assert.match(person.name, /^Sample Employee \d{3}$/)
  const people = [...DEMO_SERVICE_EMPLOYEES.map((item) => item.name), ...DEMO_EMPLOYEE_SERVICES_LOOKUPS.directors.map((item) => item.name), DEMO_REQUESTER.name]
  assert.ok(people.every((name) => /^Sample /.test(name)), people.join(', '))
})

// ------------------------------------------------------------ transfer request

const LOOKUPS = DEMO_EMPLOYEE_SERVICES_LOOKUPS
const transferForm = (changes = {}) => ({
  ...withTransferEmployee(blankTransfer('2026-10-29', 'ZP_NON_FOOD'), employee),
  to: { jobTitleCode: 'PAYROLL_OFFICER', departmentCode: 'HR', sectionCode: 'PAYROLL' },
  effectiveDate: '2026-11-15', directorId: 'D-1018', salaryChange: 'NO', budgetedSalary: 'YES', ...changes,
})

test('transfer: sections depend on the department; choosing a department clears the section', () => {
  assert.deepEqual(sectionsOf(LOOKUPS.departments, 'HR').map((item) => item.code), ['HR_SECTION', 'RECRUITMENT', 'PAYROLL'])
  assert.deepEqual(sectionsOf(LOOKUPS.departments, ''), [])
  assert.deepEqual(withDestination({ jobTitleCode: 'PACKER', departmentCode: 'HR', sectionCode: 'PAYROLL' }, 'departmentCode', 'SALES'),
    { jobTitleCode: 'PACKER', departmentCode: 'SALES', sectionCode: '' })
  assert.equal(withDestination({ jobTitleCode: 'PACKER', departmentCode: 'HR', sectionCode: '' }, 'sectionCode', 'PAYROLL').departmentCode, 'HR')
  const problems = validateTransfer(transferForm({ to: { jobTitleCode: 'PACKER', departmentCode: 'HR', sectionCode: 'KEY_ACCOUNTS' } }), employee, LOOKUPS.departments, { submit: false })
  assert.deepEqual(codesOf(problems), ['sectionCode:notInDepartment'])
})

test('transfer: choosing the employee starts the new job title as now and prefills a known blood type', () => {
  const form = withTransferEmployee(blankTransfer('2026-10-29', 'ZP_NON_FOOD'), employee)
  assert.deepEqual(form.to, { jobTitleCode: 'HR_OFFICER', departmentCode: '', sectionCode: '' })
  assert.equal(form.bloodType, 'O+')
  assert.equal(withTransferEmployee(blankTransfer('2026-10-29', 'ZP_NON_FOOD'), DEMO_SERVICE_EMPLOYEES[1]).bloodType, '', 'unknown stays empty')
  assert.equal(withTransferEmployee({ ...blankTransfer('2026-10-29', 'ZP_NON_FOOD'), bloodType: 'AB+' }, employee).bloodType, 'AB+', 'a chosen value is kept')
})

test('transfer: backend-required destination fields and final-review move validation', () => {
  assert.deepEqual(codesOf(validateTransfer(transferForm(), employee, LOOKUPS.departments, { submit: true })), [])
  const empty = transferForm({ to: { jobTitleCode: '', departmentCode: '', sectionCode: '' } })
  assert.deepEqual(codesOf(validateTransfer(empty, employee, LOOKUPS.departments, { submit: true })), ['jobTitleCode:required', 'departmentCode:required', 'sectionCode:required'])
  const same = transferForm({ to: { jobTitleCode: 'HR_OFFICER', departmentCode: 'HR', sectionCode: 'HR_SECTION' } })
  assert.deepEqual(codesOf(validateTransfer(same, employee, LOOKUPS.departments, { submit: true })), ['to:noMove'])
  assert.deepEqual(transferMoves(employee, same.to), [])
  assert.deepEqual(transferMoves(employee, { jobTitleCode: 'HR_OFFICER', departmentCode: 'HR', sectionCode: 'PAYROLL' }), ['sectionCode'], 'a section move alone is a move')
  assert.deepEqual(transferMoves(employee, transferForm().to), ['jobTitleCode', 'sectionCode'])
  assert.deepEqual(codesOf(validateTransfer(empty, employee, LOOKUPS.departments, { submit: false })), ['jobTitleCode:required', 'departmentCode:required', 'sectionCode:required'], 'server requires a complete destination even for drafts')
  assert.deepEqual(codesOf(validateTransfer(empty, null, LOOKUPS.departments, { submit: false })), ['employee:required', 'jobTitleCode:required', 'departmentCode:required', 'sectionCode:required'])
})

test('transfer: effective date not before D.O.J.; director, salary change and budgeted salary required to submit', () => {
  assert.deepEqual(codesOf(validateTransfer(transferForm({ effectiveDate: '2019-03-09' }), employee, LOOKUPS.departments, { submit: false })), ['effectiveDate:beforeJoining'])
  assert.deepEqual(codesOf(validateTransfer(transferForm({ effectiveDate: '2019-03-10' }), employee, LOOKUPS.departments, { submit: true })), [])
  const missing = transferForm({ effectiveDate: '', directorId: '', salaryChange: '', budgetedSalary: 'MAYBE' })
  const problems = validateTransfer(missing, employee, LOOKUPS.departments, { submit: true })
  assert.deepEqual(codesOf(problems), ['effectiveDate:required', 'directorId:required', 'salaryChange:required', 'budgetedSalary:required'])
  assert.ok(problems.every((problem) => problem.step === 1), 'all on the details step')
})

test('transfer: approval chain in order and the IT & HR approvals', () => {
  assert.deepEqual(TRANSFER_ROUTE, ['NEW_DEPARTMENT_HEAD', 'OLD_DEPARTMENT_HEAD', 'NEW_DIRECTOR', 'HR_ADMIN_MANAGER', 'GENERAL_MANAGER'])
  assert.deepEqual(routeStates(TRANSFER_ROUTE, 'DRAFT'), ['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT', 'DRAFT'])
  assert.deepEqual(routeStates(TRANSFER_ROUTE, 'SUBMITTED'), ['PENDING', 'WAITING', 'WAITING', 'WAITING', 'WAITING'])
  assert.deepEqual(routeStates(TRANSFER_ROUTE, 'APPROVED'), ['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'APPROVED'])
  assert.deepEqual(OFFICE_APPROVALS, ['HR_SUPERVISOR', 'IT', 'ADMIN_MANAGER'])
  assert.deepEqual(officeStates('SUBMITTED', '2026-11-15').map((item) => [item.state, item.date]), [['WAITING', null], ['WAITING', null], ['WAITING', null]])
  assert.deepEqual(officeStates('APPROVED', '2026-11-15').map((item) => [item.state, item.date]), [['APPROVED', '2026-11-15'], ['APPROVED', '2026-11-15'], ['APPROVED', '2026-11-15']])
  assert.equal(isTransferLocked('DRAFT'), false)
  assert.equal(isTransferLocked('SUBMITTED'), true)
  assert.equal(isTransferLocked('APPROVED'), true)
})

test('transfer: request body carries only the answers', () => {
  assert.deepEqual(transferPayload(transferForm({ bloodType: '' }), employee), {
    companyCode: 'ZP_NON_FOOD', employeeId: '101', to: { jobTitleCode: 'PAYROLL_OFFICER', departmentCode: 'HR', sectionCode: 'PAYROLL' },
    effectiveDate: '2026-11-15', bloodType: null, directorId: 'D-1018', salaryChange: 'NO', budgetedSalary: 'YES',
  })
})

test('transfer API adapter maps transfer-request lookups, employee search, drafts and report rows', async () => {
  const apiRecord = {
    headerId: '8', plant: 'Zamil Plastic Non-Food', requestedBy: 'Signed-in User', mgrDate: '2026-10-29', status: 'Draft',
    current: { empNo: '2172', empName: 'Sample Worker', dateOfJoining: '2018-01-01', jobTitle: 'Operator', dept: 'Production Department', section: 'Production Section' },
    transfer: { jobTitle: 'Technician', dept: 'Maintenance Department', section: 'Maintenance Section', effectiveDate: '2026-11-01',
      bloodType: 'O+', superiorNo: '900', superiorName: 'Sample Director', changeSalary: 'No', budgetedSalary: 'Yes' },
    approvals: { transferDeptHead: 'Draft', adminSignature: 'Draft', president: 'Draft', hrManager: 'Draft', generalManager: 'Draft' },
    itHr: { hrSignature: null, hrDate: null, itSignature: null, itDate: null, adminSignature: null, adminDate: null },
  }
  const { fetchImpl, calls } = recordingFetch((url, init) => {
    if (url === '/api/v1/hr/transfer-requests/lookups/jobs') return success([{ name: 'Operator' }, { name: 'Technician' }])
    if (url === '/api/v1/hr/transfer-requests/lookups/sections') return success([{ name: 'Production Section' }, { name: 'Maintenance Section' }])
    if (url === '/api/v1/hr/transfer-requests/lookups/departments') return success(['Production Department', 'Maintenance Department'])
    if (url === '/api/v1/hr/transfer-requests/lookups/directors') return success([{ name: 'Sample Director', empNo: '900' }])
    if (url === '/api/v1/hr/transfer-requests/lookups/blood-types') return success([{ code: 'O+' }])
    if (url === '/api/v1/hr/transfer-requests/lookups/requestor') return success([{ empNo: '500', fullName: 'Signed-in User' }])
    if (url === '/api/v1/hr/transfer-requests/lookups/employees') return success([{ name: 'Sample Worker' }])
    if (url.startsWith('/api/v1/hr/transfer-requests/lookups/employees/')) return success({ empNo: '2172', personId: '33', dateOfJoining: '2018-01-01', jobTitle: 'Operator', deptName: 'Production Section' })
    if (url === '/api/v1/hr/transfer-requests' && init.method === 'POST') return success({ headerId: '8', uuid: 'request-uuid' }, 201)
    if (url === '/api/v1/hr/transfer-requests/8' && init.method === 'GET') return success(apiRecord)
    if (url === '/api/v1/hr/transfer-requests?page=1&pageSize=100&sort=headerId&order=desc') {
      return success({ meta: { page: 1, pageSize: 100, total: 1 }, rows: [{ headerId: '8', plant: apiRecord.plant, mgrDate: apiRecord.mgrDate,
        empName: 'Sample Worker', empNo: '2172', currentDept: 'Production Department', transferDept: 'Maintenance Department', effectiveDate: '2026-11-01', status: 'Draft' }] })
    }
    throw new Error(`Unexpected request: ${init.method} ${url}`)
  })
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const client = createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore })
  const transfers = createEmployeeServices({ client, transferClient: client }).transfers
  const lookups = await transfers.getLookups()
  assert.equal(lookups.companies[0].name, 'Zamil Plastic Non-Food')
  assert.equal(lookups.directors[0].directorId, '900')
  const found = await transfers.searchEmployees('worker')
  assert.equal(found.items[0].employeeNumber, '2172')
  assert.equal(found.items[0].sectionName, 'Production Section')
  const employeeResult = found.items[0]
  const form = transferForm({ companyCode: lookups.companies[0].code, to: {
    jobTitleCode: lookups.jobTitles.find((item) => item.name === 'Technician').code,
    departmentCode: lookups.departments.find((item) => item.name === 'Maintenance Department').code,
    sectionCode: lookups.departments.find((item) => item.name === 'Maintenance Department').sections.find((item) => item.name === 'Maintenance Section').code,
  }, directorId: '900', bloodType: 'O+', salaryChange: 'NO', budgetedSalary: 'YES' })
  const saved = await transfers.save(null, transferPayload(form, employeeResult), employeeResult)
  assert.equal(saved.transferId, '8')
  assert.equal(saved.status, 'DRAFT')
  const posted = JSON.parse(calls.find((call) => call.init.method === 'POST').init.body)
  assert.equal(posted.plant, 'Zamil Plastic Non-Food')
  assert.equal(posted.current.empNo, '2172')
  assert.deepEqual(posted.transfer, { jobTitle: 'Technician', dept: 'Maintenance Department', section: 'Maintenance Section', effectiveDate: '2026-11-15',
    bloodType: 'O+', superiorNo: '900', changeSalary: 'No', budgetedSalary: 'Yes' })
  const report = await transfers.list()
  assert.deepEqual([report.items[0].transferNumber, report.items[0].employeeNumber, report.items[0].status], ['8', '2172', 'DRAFT'])
})

test('contracts: transfer lookups and transfer shapes are checked', () => {
  const lookups = readEmployeeServicesLookups(LOOKUPS)
  assert.equal(lookups.departments.find((item) => item.code === 'HR').sections.length, 3)
  assert.equal(lookups.transferDocument.controlNumber, 'ZPI.TCN.FM.01')
  assert.deepEqual(lookups.companies.map((item) => item.name), ['Zamil Plastic Non-Food', 'Zamil Plastic Food'])
  assert.throws(() => readEmployeeServicesLookups({ ...LOOKUPS, directors: [{ directorId: 'D 1', name: 'x', area: 'y' }] }), /unexpected response/)
  const record = {
    transferId: '4', transferNumber: 'TRF-2026-0319', status: 'SUBMITTED', requestDate: '2026-10-29', requestedBy: { name: 'Sample Requester', employeeNumber: '9001' },
    companyCode: 'ZP_FOOD', employee, to: { jobTitleCode: 'PACKER', departmentCode: 'ASSEMBLY', sectionCode: 'PACKING' }, effectiveDate: '2026-11-15',
    bloodType: 'O+', directorId: 'D-1004', salaryChange: 'NO', budgetedSalary: 'YES',
    approvals: TRANSFER_ROUTE.map((role, index) => ({ role, state: index === 0 ? 'PENDING' : 'WAITING' })), office: officeStates('SUBMITTED', null),
    updatedAt: '2026-10-29T08:00:00.000Z',
  }
  assert.equal(readTransfer(record).approvals[0].state, 'PENDING')
  assert.throws(() => readTransfer({ ...record, approvals: record.approvals.slice(1) }), /unexpected response/, 'the whole chain is required')
  assert.throws(() => readTransfer({ ...record, salaryChange: 'Y' }), /unexpected response/)
  assert.throws(() => readTransfer({ ...record, office: [] }), /unexpected response/)
})

test('demo adapter: transfer save, submit, the report and 404, 409 and 422 error paths', async () => {
  const restore = forbidBrowserStorage()
  try {
    const { client, services } = demoServices()
    identifyEmployeeServicesUser({ fullName: 'Sample Signed-in User', employeeNumber: '7001' }, client)
    const seeded = await services.transfers.list()
    assert.deepEqual(seeded.items.map((item) => item.transferNumber).sort(), ['TRF-2026-0311', 'TRF-2026-0314', 'TRF-2026-0318'])
    const approved = await services.transfers.getById('2')
    assert.deepEqual(approved.office.map((item) => item.date), ['2026-11-15', '2026-11-15', '2026-11-15'], 'office approvals dated once approved')
    const draft = await services.transfers.save(null, transferPayload(transferForm(), employee))
    assert.equal(draft.transferNumber, 'TRF-2026-0319')
    assert.deepEqual(draft.requestedBy, { name: 'Sample Signed-in User', employeeNumber: '7001' })
    assert.equal(draft.companyCode, 'ZP_NON_FOOD')
    const submitted = await services.transfers.submit(draft.transferId)
    assert.equal(submitted.status, 'SUBMITTED')
    assert.deepEqual(submitted.approvals.map((item) => item.state), ['PENDING', 'WAITING', 'WAITING', 'WAITING', 'WAITING'])
    const row = (await services.transfers.list()).items.find((item) => item.transferId === draft.transferId)
    assert.deepEqual([row.fromDepartmentName, row.toDepartmentName, row.toSectionName], ['HR Department', 'HR Department', 'Payroll'])
    await assert.rejects(() => services.transfers.save(draft.transferId, transferPayload(transferForm(), employee)), (error) => error.status === 409)
    await assert.rejects(() => services.transfers.getById('77'), (error) => error.status === 404)
    await assert.rejects(() => services.transfers.save(null, transferPayload(transferForm({ directorId: 'D-9999' }), employee)), (error) => error.status === 422)
  } finally {
    restore()
  }
})

test('transfer page: compact frame with the document strip, tight pickers, radio groups and a report view', async () => {
  const page = await read(`${FEATURE}transfer/TransferPage.jsx`)
  assert.match(page, /<RecruitmentShell current="transfer" flow=\{false\} compact /)
  assert.match(page, /banner=\{\(\n\s*<dl className="zrv-hr-es-docstrip"/)
  assert.match(page, /<EmployeePicker id="tr-employee" label=\{T\.moveStep\.employee\} required tight /)
  assert.match(page, /<EmployeePicker id="tr-director" label=\{T\.detailsStep\.director\} required tight /)
  assert.match(page, /<RadioCards name="tr-salary-change"/)
  assert.match(page, /<RadioCards name="tr-budgeted"/)
  assert.match(page, /disabled=\{disabled\}/, 'the section waits for a department')
  assert.match(page, /\{ icon: 'chart-column', label: T\.tools\.report, onClick: \(\) => leave\(ES_PATHS\.transferReport\) \}/)
  assert.match(page, /\{ icon: 'house', label: C\.home, onClick: \(\) => leave\('\/dashboard'\) \}/)
  assert.match(page, /saved\?\.requestedBy \?\? \{ name: user\?\.fullName/, 'requester from the server (before the first save: the session user)')
  const report = await read(`${FEATURE}transfer/TransferReportPage.jsx`)
  assert.match(report, /<RecordList /)
  assert.match(report, /statuses=\{TRANSFER_STATUSES\}/)
})

// ------------------------------------------------------------ performance appraisal

const PERF = DEMO_PERFORMANCE_LOOKUPS
const CRITERIA = PERF.criteria
const allRated = (rating, changes = {}) => ({
  ...Object.fromEntries(CRITERIA.map((item) => [item.code, { rating, explanation: needsExplanation(rating) ? 'Because' : '' }])), ...changes,
})
const member = (employeeId, savedGrade = null) => ({ employeeId, savedGrade })

test('appraisal: rating scale and grade letters at every boundary', () => {
  const cases = [[5, 'A'], [4.25, 'A'], [4.24, 'B'], [3.5, 'B'], [3.49, 'C'], [2.5, 'C'], [2.49, 'D'], [1.6, 'D'], [1.59, 'E'], [1.5, 'E'], [1, 'E']]
  for (const [average, grade] of cases) assert.equal(scaleFor(average).grade, grade, String(average))
  // The scale is configurable: the lookup's bands are used in any order.
  assert.equal(scaleFor(4.24, [...PERF.scale].reverse()).grade, 'B')
  assert.deepEqual(DEFAULT_SCALE.map((band) => [band.min, band.grade]), PERF.scale.map((band) => [band.min, band.grade]), 'the demo lookup matches the form')
})

test('appraisal: rating is the average of the 20 criteria to two decimals', () => {
  assert.equal(CRITERIA.length, 20)
  assert.equal(averageRating({}, CRITERIA), null)
  assert.equal(averageRating(allRated(4), CRITERIA), 4)
  const mixed = allRated(4, { C01: { rating: 5, explanation: 'x' }, C02: { rating: 3, explanation: '' }, C03: { rating: 3, explanation: '' } })
  assert.equal(averageRating(mixed, CRITERIA), 3.95, '(17 × 4 + 5 + 3 + 3) / 20')
  const thirds = Object.fromEntries(CRITERIA.slice(0, 3).map((item, index) => [item.code, { rating: [4, 4, 5][index], explanation: 'x' }]))
  assert.equal(averageRating(thirds, CRITERIA), 4.33, '13 / 3 rounded to two decimals')
  assert.equal(ratedCount(thirds, CRITERIA), 3)
})

test('appraisal: all 20 are required to submit and a rating of 1 or 5 needs an explanation', () => {
  const context = { criteria: CRITERIA, team: [member('101')], scale: PERF.scale, distribution: PERF.distribution }
  const form = (ratings) => ({ ...blankAppraisal('2026'), employeeId: '101', ratings, goals: ['a', 'b', 'c'], signatures: { employee: null, appraiser: '2026-10-29' } })
  assert.deepEqual(codesOf(validateAppraisal(form(allRated(3)), context, { submit: true })), [])
  const partial = Object.fromEntries(CRITERIA.slice(0, 19).map((item) => [item.code, { rating: 3, explanation: '' }]))
  assert.deepEqual(codesOf(validateAppraisal(form(partial), context, { submit: true })), ['C20:required'])
  assert.deepEqual(codesOf(validateAppraisal(form(partial), context, { submit: false })), [], 'a draft may be partly rated')
  const extremes = allRated(3, { C04: { rating: 1, explanation: ' ' }, C09: { rating: 5, explanation: '' }, C10: { rating: 5, explanation: 'Led the audit' } })
  assert.deepEqual(missingExplanations(extremes, CRITERIA), ['C04', 'C09'])
  assert.deepEqual(codesOf(validateAppraisal(form(extremes), context, { submit: true })), ['C04:explain', 'C09:explain'])
  assert.equal(needsExplanation(2), false)
  assert.equal(needsExplanation(4), false)
})

test('appraisal: employees allowed per grade for teams of 0, 8 and 20 (ceil, at least 1)', () => {
  assert.deepEqual(DEFAULT_DISTRIBUTION, { A: 15, B: 30, C: 40, D: 10, E: 5 })
  assert.deepEqual(gradeQuotas(0), { A: 1, B: 1, C: 1, D: 1, E: 1 })
  assert.deepEqual(gradeQuotas(8), { A: 2, B: 3, C: 4, D: 1, E: 1 })
  assert.deepEqual(gradeQuotas(20), { A: 3, B: 6, C: 8, D: 2, E: 1 })
})

test('appraisal: allocation is the grades already given plus this one; over the share warns and needs a remark', () => {
  const team = [member('1', 'A'), member('2', 'A'), member('3', 'B'), member('4', null), member('5', 'C'), member('6', 'C'), member('7', 'D'), member('8', null)]
  assert.deepEqual(gradeAllocation(team, '4', null), { A: 2, B: 1, C: 2, D: 1, E: 0 })
  const withA = gradeAllocation(team, '4', 'A')
  assert.deepEqual(withA, { A: 3, B: 1, C: 2, D: 1, E: 0 })
  assert.equal(isOverQuota('A', withA, gradeQuotas(team.length)), true, '3 A grades in a team of 8 (2 allowed)')
  assert.equal(isOverQuota('B', gradeAllocation(team, '4', 'B'), gradeQuotas(team.length)), false)
  assert.deepEqual(gradeAllocation(team, '1', 'C'), { A: 1, B: 1, C: 3, D: 1, E: 0 }, "this employee's saved grade is replaced, not counted twice")
  const context = { criteria: CRITERIA, team, scale: PERF.scale, distribution: PERF.distribution }
  const over = { ...blankAppraisal('2026'), employeeId: '4', ratings: allRated(5), goals: ['a', 'b', 'c'], signatures: { employee: null, appraiser: '2026-10-29' } }
  assert.equal(appraisalResult(over, CRITERIA, team, PERF.scale, PERF.distribution).overQuota, true)
  assert.deepEqual(codesOf(validateAppraisal(over, context, { submit: true })), ['appraiserRemarks:overQuota'], 'not a block: a remark is enough')
  assert.deepEqual(codesOf(validateAppraisal({ ...over, appraiserRemarks: 'Exceptional year.' }, context, { submit: true })), [])
  const partial = { ...over, ratings: { C01: { rating: 5, explanation: 'x' } } }
  assert.equal(appraisalResult(partial, CRITERIA, team, PERF.scale, PERF.distribution).overQuota, false, 'only a complete appraisal counts')
})

test('appraisal: years to the period end or today, whichever is earlier, to one decimal', () => {
  assert.equal(yearsUntil('2019-03-10', '2026-12-31', '2026-10-29'), 7.6, 'today is earlier')
  assert.equal(yearsUntil('2019-03-10', '2025-12-31', '2026-10-29'), 6.8, 'the period end is earlier')
  assert.equal(yearsUntil('2026-10-01', '2026-12-31', '2026-10-29'), 0)
  assert.equal(yearsUntil('2027-01-01', '2026-12-31', '2026-10-29'), 0, 'never negative')
  assert.equal(yearsUntil('', '2026-12-31', '2026-10-29'), null)
})

test('appraisal: 3 to 5 development goals to submit; training optional; the appraiser signs', () => {
  const context = { criteria: CRITERIA, team: [member('101')], scale: PERF.scale, distribution: PERF.distribution }
  const form = (goals, signatures = { employee: null, appraiser: '2026-10-29' }) => ({ ...blankAppraisal('2026'), employeeId: '101', ratings: allRated(3), goals, signatures })
  assert.deepEqual(codesOf(validateAppraisal(form(['a', ' ', 'b']), context, { submit: true })), ['goals:tooFew'])
  assert.deepEqual(codesOf(validateAppraisal(form(['a', 'b', 'c']), context, { submit: true })), [])
  assert.deepEqual(codesOf(validateAppraisal(form(['a', 'b', 'c', 'd', 'e', 'f']), context, { submit: false })), ['goals:tooMany'])
  assert.deepEqual(codesOf(validateAppraisal(form(['a', 'b', 'c'], { employee: null, appraiser: null }), context, { submit: true })), ['appraiser:required'])
  assert.deepEqual(codesOf(validateAppraisal(form(['a', 'b', 'c'], { employee: '2026-10-29', appraiser: '2026-10-29' }), context, { submit: true })), [], 'the employee may sign now or later')
  assert.deepEqual(codesOf(validateAppraisal({ ...form([]), employeeId: '' }, context, { submit: false })), ['employeeId:required'])
  assert.deepEqual(filledLines([' a ', '', 'b']), ['a', 'b'])
  const body = appraisalPayload({ ...form(['a', '', 'b']), training: ['', 'Excel'] }, CRITERIA)
  assert.deepEqual(Object.keys(body), ['periodCode', 'employeeId', 'ratings', 'goals', 'training', 'employeeRemarks', 'appraiserRemarks', 'signatures'])
  assert.deepEqual([body.goals, body.training, Object.keys(body.ratings).length], [['a', 'b'], ['Excel'], 20])
})

test('contracts: performance lookups, team and appraisal shapes are checked', () => {
  const lookups = readPerformanceLookups(PERF)
  assert.equal(lookups.criteria.length, 20)
  assert.equal(lookups.distribution.C, 40)
  assert.throws(() => readPerformanceLookups({ ...PERF, criteria: PERF.criteria.slice(1) }), /unexpected response/, 'exactly 20 criteria')
  assert.throws(() => readPerformanceLookups({ ...PERF, distribution: { ...PERF.distribution, A: 20 } }), /unexpected response/, 'percentages total 100')
  assert.throws(() => readPerformanceLookups({ ...PERF, scale: PERF.scale.slice(0, 4) }), /unexpected response/, 'every grade has a band')
  const team = readAppraisalTeam({ appraiser: { name: 'Sample Requester', employeeNumber: '9001' }, members: DEMO_TEAM.map((item) => ({ ...item, savedGrade: null })) })
  assert.equal(team.members.length, 8)
  assert.throws(() => readAppraisalTeam({ appraiser: { name: 'x', employeeNumber: '1' }, members: [{ ...DEMO_TEAM[0], savedGrade: 'F' }] }), /unexpected response/)
  const record = {
    appraisalId: '3', appraisalNumber: 'EPA-2026-0008', status: 'DRAFT', periodCode: '2026', appraiser: { name: 'Sample Requester', employeeNumber: '9001' },
    employee: { ...DEMO_TEAM[0], savedGrade: null }, ratings: { C01: { rating: 4, explanation: '' } }, goals: [], training: [], employeeRemarks: '', appraiserRemarks: '',
    signatures: { employee: null, appraiser: null }, rating: null, grade: null, updatedAt: '2026-10-29T08:00:00.000Z',
  }
  assert.equal(readAppraisal(record).ratings.C01.rating, 4)
  assert.throws(() => readAppraisal({ ...record, ratings: { C01: { rating: 6, explanation: '' } } }), /unexpected response/)
  assert.throws(() => readAppraisal({ ...record, goals: ['1', '2', '3', '4', '5', '6'] }), /unexpected response/)
  assert.throws(() => readAppraisal({ ...record, appraiser: null }), /unexpected response/, 'the appraiser comes from the server')
})

test('demo adapter: appraisal team, save, server rating and grade, submit locks; 404, 409 and 422 error paths', async () => {
  const restore = forbidBrowserStorage()
  try {
    const { client, services } = demoServices()
    identifyEmployeeServicesUser({ fullName: 'Sample Signed-in User', employeeNumber: '7001' }, client)
    const team = await services.performance.team('2026')
    assert.deepEqual(team.appraiser, { name: 'Sample Signed-in User', employeeNumber: '7001' })
    assert.deepEqual(team.members.map((item) => item.savedGrade), ['B', null, 'C', 'C', 'A', null, 'C', null])
    await assert.rejects(() => services.performance.team('1999'), (error) => error.status === 422)
    const previous = (await services.appraisals.list()).items
    assert.deepEqual(previous.map((item) => [item.appraisalNumber, item.grade, item.rating]), [['EPA-2026-0007', 'B', 4]])
    const form = { ...blankAppraisal('2026'), employeeId: '102', ratings: allRated(4), goals: ['a', 'b', 'c'] }
    const draft = await services.appraisals.save(null, appraisalPayload(form, CRITERIA))
    assert.equal(draft.appraisalNumber, 'EPA-2026-0008')
    assert.deepEqual(draft.appraiser, { name: 'Sample Signed-in User', employeeNumber: '7001' })
    assert.deepEqual([draft.rating, draft.grade, draft.employee.name], [4, 'B', 'Sample Employee 002'])
    assert.equal((await services.performance.team('2026')).members[1].savedGrade, 'B', 'a saved grade counts for the team')
    await assert.rejects(() => services.appraisals.submit(draft.appraisalId), (error) => error.status === 422 && error.details.some((item) => item.field === 'appraiser'))
    await services.appraisals.save(draft.appraisalId, appraisalPayload({ ...form, signatures: { employee: null, appraiser: '2026-10-29' } }, CRITERIA))
    const submitted = await services.appraisals.submit(draft.appraisalId)
    assert.equal(submitted.status, 'SUBMITTED')
    await assert.rejects(() => services.appraisals.save(draft.appraisalId, appraisalPayload(form, CRITERIA)), (error) => error.status === 409)
    await assert.rejects(() => services.appraisals.getById('99'), (error) => error.status === 404)
    await assert.rejects(() => services.appraisals.save(null, appraisalPayload(form, CRITERIA)), (error) => error.status === 422, 'one appraisal per employee and period')
  } finally {
    restore()
  }
})

test('backend appraisal adapter uses eligible employee snapshots and creates the backend DTO', async () => {
  const calls = []
  const api = {
    async get(path, options = {}) {
      calls.push(['GET', path, options])
      if (path.endsWith('/lookups/grade-stats')) return { data: { quota: { percent: { A: 15, B: 30, C: 40, D: 10, E: 5 }, target: { A: 1, B: 2, C: 3, D: 1, E: 1 }, allocated: { A: 0, B: 1, C: 0, D: 0, E: 0 } } } }
      if (path.endsWith('/lookups/employees')) return { data: [{ name: 'Eligible Employee', number: '204' }] }
      if (path.endsWith('/lookups/requestor')) return { data: { fullName: 'Current Appraiser', employeeNumber: '900' } }
      if (path.endsWith('/lookups/employees/Eligible%20Employee')) return { data: { personId: '3204', number: '204', name: 'Eligible Employee', hireDate: '2020-04-01', jobTitle: 'Engineer', department: 'Operations', evaluatedBy: 'Current Appraiser', yearsInCompany: 6, yearsInPosition: 2 } }
      if (path.endsWith('/7')) return { data: { headerId: 7, employee: { personId: '3204', number: '204', name: 'Eligible Employee', hireDate: '2020-04-01', jobTitle: 'Engineer', department: 'Operations' }, period: { year: 2026 }, appraiser: { evaluatedBy: 'Current Appraiser' }, result: { rating: 4, grade: 'B' }, criteria: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, rating: 4, justification: '' })), development: [{ need: 'Improve planning' }], training: [{ objective: 'Safety course' }], remarks: { employee: '-', appraiser: '-' }, status: 'Inprocess', creationDate: '2026-10-29' } }
      throw new Error(`Unexpected GET ${path}`)
    },
    async post(path, body) { calls.push(['POST', path, body]); return { data: { headerId: 7 } } },
    async put() { throw new Error('Unexpected PUT') },
    async delete() { throw new Error('Unexpected DELETE') },
  }
  const services = createEmployeeServices({ client: api, appraisalClient: api })
  const lookups = await services.performance.lookups()
  assert.equal(lookups.criteria.length, 20)
  assert.equal(lookups.periods[0].code, String(new Date().getFullYear()))
  assert.deepEqual(lookups.gradeStats.allocated, { A: 0, B: 1, C: 0, D: 0, E: 0 })
  const team = await services.performance.team(String(new Date().getFullYear()))
  assert.deepEqual(team.appraiser, { name: 'Current Appraiser', employeeNumber: '900' })
  assert.equal(team.members[0].personId, null, 'the dropdown loads eligible names without calling every detail lookup')
  assert.equal(calls.filter(([, path]) => path.includes('/lookups/employees/')).length, 0)
  const selectedEmployee = await services.performance.employee(team.members[0].name, String(new Date().getFullYear()))
  assert.equal(selectedEmployee.personId, '3204', 'employee details load only after selection')
  const form = { ...blankAppraisal(String(new Date().getFullYear())), employeeId: '204', ratings: allRated(4), goals: ['Improve planning', 'Communicate clearly', 'Deliver milestones'], training: ['Safety course'] }
  const created = await services.appraisals.save(null, appraisalPayload(form, CRITERIA), selectedEmployee)
  assert.equal(created.appraisalId, '7')
  assert.equal(created.status, 'INPROCESS')
  assert.equal(created.employee.departmentName, 'Operations')
  const post = calls.find(([method]) => method === 'POST')
  assert.equal(post[1], '/hr/performance-appraisals')
  assert.deepEqual(post[2].employee, { name: 'Eligible Employee', number: '204', personId: '3204' })
  assert.equal(post[2].year, new Date().getFullYear())
  assert.deepEqual(post[2].criteria.map((item) => item.id), Array.from({ length: 20 }, (_, i) => i + 1))
  assert.deepEqual(post[2].development, form.goals)
  assert.equal(post[2].criteria[0].rating, 4)
})

test('appraisal page: compact frame, radio groups for ratings, development tabs, signatures and the report dialog', async () => {
  const page = await read(`${FEATURE}performance/AppraisalPage.jsx`)
  assert.match(page, /<RecruitmentShell current="appraisal" flow=\{false\} compact /)
  assert.match(page, /breadcrumb=\{C\.performanceBreadcrumb\}/)
  assert.match(page, /className="zrv-hr-pips" role="radiogroup" aria-labelledby=\{labelId\} aria-required="true"/)
  assert.match(page, /role="tablist" aria-label=\{T\.resultStep\.development\}/)
  assert.match(page, /role="tabpanel" id=\{`ap-panel-\$\{tab\}`\}/)
  assert.match(page, /<table className="zrv-hr-es-dtable/, 'the distribution is a real table')
  assert.match(page, /<ReportDialog title=\{T\.report\.title\}/)
  assert.match(page, /\{ icon: 'house', label: C\.home, onClick: \(\) => leave\('\/dashboard'\) \}/)
  assert.doesNotMatch(page, /[Ll]ogout|[Ss]ign out/, 'the app header handles signing out')
  assert.match(page, /const appraiser = saved\?\.appraiser \?\? team\.appraiser/, 'the appraiser comes from the server')
  assert.match(page, /<EmployeePicker id="ap-employee"[^>]*searchService=\{searchEmployees\}/, 'employee selection uses the searchable picker')
  assert.match(page, /const matches = term \? members\.filter/, 'employee matches include name and employee number')
})
