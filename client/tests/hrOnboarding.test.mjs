// HR onboarding screens of the hr-recruitment feature: Orientation Schedule
// (form 1101), Probation Evaluation (form 1064) and the Periodwise Employees
// report. Business rules, response contracts, services over the shared API
// client (mocked transport), the owner-approved in-memory demo adapter and
// static checks of the JSX. No backend, Oracle or browser storage is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { findAppRoute, implementedRoutes, isFeatureEnabled, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { registeredModules, registry } from '../src/config/registry/index.js'
import { resolveDemoMode } from '../src/features/hr-recruitment/hrRecruitmentConfig.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { readEmployee, readLookups, readOrientation, readProbation, readReport } from '../src/features/hr-recruitment/hrRecruitmentContract.js'
import { createHrRecruitmentServices } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { createDemoClient } from '../src/features/hr-recruitment/demo/demoClient.js'
import { DEMO_EMPLOYEES, DEMO_LOOKUPS } from '../src/features/hr-recruitment/demo/demoData.js'
import { RECRUITMENT_FLOW } from '../src/features/hr-recruitment/shared/recruitmentFlow.js'
import {
  SESSION_KEYS, addWorkdays, blankOrientation, calendarDays, draftPlan, formatHours, isOrientationLocked, isWeekend, nextWorkday,
  orientationFormFromRecord, orientationPayload, plannedCount, scheduleIssues, scheduleToDate, sessionDays, sessionHours, totalHours,
  validateOrientation,
} from '../src/features/hr-recruitment/orientation/orientationModel.js'
import {
  PASS_MARK, QUICK_PICKS, addMonths, blankProbation, clampPoints, contradictsResult, evaluationTotals, isProbationLocked, probationElapsed, probationEnd,
  probationFormFromRecord, probationPayload, quickPoints, ratingFor, resultFor, suggestedRecommendation, validateProbation, withEmployee, withFormType,
} from '../src/features/hr-recruitment/probation/probationModel.js'
import {
  ALL_DEPARTMENTS, PAGE_SIZE, ageBandCounts, ageOn, csvCell, csvFileName, filterRows, groupCount, inPeriod, quickRanges, runReport, sortRows, summarise,
  toCsv, validateParams, withBom, yearlyFlow, yearsBetween,
} from '../src/features/hr-recruitment/report/periodwiseModel.js'
import { createDemoReportRows } from '../src/features/hr-recruitment/demo/demoData.js'
import { SESSION_TOKEN, recordingFetch, success } from './helpers/http.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const FEATURE = '../src/features/hr-recruitment/'
const HEADS = DEMO_LOOKUPS.orientation.departmentHeads
const session = (overrides = {}) => ({ headCode: 'HEAD_HR_A', fromDate: '2026-11-01', toDate: '2026-11-01', timeFrom: '08:00', timeTo: '12:00', remark: '', ...overrides })
const withSessions = (sessions) => ({ ...blankOrientation().sessions, ...sessions })
const demoServices = (options = {}) => {
  const client = createDemoClient({ latencyMs: 0, now: () => new Date('2026-10-28T08:00:00Z'), ...options })
  return { client, services: createHrRecruitmentServices({ client }) }
}

// ------------------------------------------------------------ orientation rules

test('orientation: days = (To − From) + 1 calendar days; time = hours per day × days', () => {
  assert.equal(calendarDays('2026-11-01', '2026-11-01'), 1)
  assert.equal(calendarDays('2026-11-01', '2026-11-04'), 4)
  assert.equal(calendarDays('2026-11-30', '2026-12-02'), 3, 'across a month end')
  assert.equal(calendarDays('2026-11-04', '2026-11-01'), 0, 'reversed range')
  assert.equal(calendarDays('', '2026-11-01'), 0)
  assert.equal(sessionDays(session({ toDate: '2026-11-03' })), 3)
  assert.equal(sessionHours(session()), 4)
  assert.equal(sessionHours(session({ toDate: '2026-11-03' })), 12, '4 h per day × 3 days')
  assert.equal(sessionHours(session({ timeFrom: '09:30', timeTo: '11:00' })), 1.5)
  assert.equal(sessionHours(session({ timeFrom: '12:00', timeTo: '08:00' })), 0, 'end time not after start')
  assert.equal(sessionHours(session({ timeTo: '' })), 0)
  assert.equal(totalHours(withSessions({ hr: session(), it: session({ timeFrom: '13:00', timeTo: '14:30' }) })), 5.5)
  assert.deepEqual([formatHours(0), formatHours(4), formatHours(5.5)], ['—', '4 h', '5.5 h'])
})

test('orientation: To is read-only and equals the latest session end date', () => {
  assert.equal(scheduleToDate(blankOrientation().sessions), '')
  assert.equal(scheduleToDate(withSessions({ hr: session(), meet: session({ fromDate: '2026-11-04', toDate: '2026-11-05' }), it: session({ toDate: '2026-11-02' }) })), '2026-11-05')
})

test('orientation: Friday and Saturday are the weekend; working days skip them', () => {
  // 2026-11-05 is a Thursday, -06 Friday, -07 Saturday, -08 Sunday.
  assert.deepEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(isWeekend), [false, true, true, false])
  assert.equal(nextWorkday('2026-11-06'), '2026-11-08')
  assert.equal(nextWorkday('2026-11-05'), '2026-11-05')
  assert.equal(addWorkdays('2026-11-05', 1), '2026-11-08')
  assert.equal(addWorkdays('2026-11-04', 3), '2026-11-09')
})

test('orientation: "Plan it for me" drafts the five sessions on working days with suggested heads', () => {
  const plan = draftPlan('2026-11-04', blankOrientation().sessions, HEADS)
  const summary = Object.fromEntries(SESSION_KEYS.map((key) => [key, [plan[key].fromDate, plan[key].toDate, plan[key].timeFrom, plan[key].timeTo, plan[key].headCode]]))
  assert.deepEqual(summary, {
    hr: ['2026-11-04', '2026-11-04', '08:00', '12:00', 'HEAD_HR_A'],
    safety: ['2026-11-05', '2026-11-05', '08:00', '13:00', 'HEAD_SAF_A'],
    it: ['2026-11-08', '2026-11-08', '09:00', '12:00', 'HEAD_IT_A'], // Friday and Saturday skipped
    tour: ['2026-11-08', '2026-11-08', '13:00', '15:00', 'HEAD_PROD_A'],
    meet: ['2026-11-09', '2026-11-09', '10:00', '11:00', 'HEAD_HR_A'],
  })
  assert.equal(draftPlan('2026-11-06', blankOrientation().sessions, HEADS).hr.fromDate, '2026-11-08', 'a weekend start moves to the first working day')
  const kept = draftPlan('2026-11-04', withSessions({ hr: { ...session(), headCode: 'HEAD_HR_B', remark: 'Bring ID' } }), HEADS)
  assert.deepEqual([kept.hr.headCode, kept.hr.remark], ['HEAD_HR_B', 'Bring ID'], 'a chosen head and the remark are kept')
  assert.deepEqual(scheduleIssues(plan, { joiningDate: '2026-11-04', fromDate: '2026-11-04' }), [], 'the draft has no clash and no weekend session')
  assert.equal(plannedCount(plan), 5)
  assert.equal(totalHours(plan), 15)
})

test('orientation: blocking problems are end before start, end time not after start, and overlaps', () => {
  const codes = (sessions, context) => scheduleIssues(withSessions(sessions), context).map((issue) => [issue.key, issue.level, issue.code])
  assert.deepEqual(codes({ hr: session({ toDate: '2026-10-31' }) }), [['hr', 'bad', 'END_BEFORE_START']])
  assert.deepEqual(codes({ hr: session({ timeTo: '08:00' }) }), [['hr', 'bad', 'TIME_ORDER']])
  assert.deepEqual(codes({ hr: session(), it: session({ timeFrom: '11:00', timeTo: '13:00' }) }), [['it', 'bad', 'CLASH']], 'same day, overlapping hours')
  assert.deepEqual(codes({ hr: session(), it: session({ timeFrom: '12:00', timeTo: '13:00' }) }), [], 'back-to-back is not a clash')
  assert.deepEqual(codes({ hr: session(), it: session({ fromDate: '2026-11-02', toDate: '2026-11-02', timeFrom: '09:00', timeTo: '10:00' }) }), [], 'same hours on another day')
  assert.deepEqual(codes({ hr: session({ toDate: '2026-11-03' }), it: session({ fromDate: '2026-11-02', toDate: '2026-11-02', timeFrom: '09:00', timeTo: '10:00' }) }), [['it', 'bad', 'CLASH']], 'inside a multi-day session')
  const clash = scheduleIssues(withSessions({ hr: session(), meet: session({ timeFrom: '10:00', timeTo: '11:00' }) }))
  assert.equal(clash[0].text, 'HR and Wrap-up with HR overlap in time.')
})

test('orientation: warnings only for weekend sessions, before the joining date or before From', () => {
  const issues = scheduleIssues(withSessions({ hr: session({ fromDate: '2026-11-05', toDate: '2026-11-06' }) }), { joiningDate: '2026-11-08', fromDate: '2026-11-08' })
  assert.deepEqual(issues.map((issue) => [issue.level, issue.code]), [['warn', 'BEFORE_JOINING'], ['warn', 'BEFORE_WINDOW'], ['warn', 'WEEKEND']])
  assert.match(issues[2].text, /^HR falls on a weekend \(Friday,? 6 Nov\)\.$/, 'the separator depends on the runtime locale data')
  assert.equal(validateOrientation({ employeeId: '1', fromDate: '2026-11-08', sessions: withSessions({ hr: session({ fromDate: '2026-11-05', toDate: '2026-11-06' }) }) }, issues).valid, true, 'warnings never block saving')
})

test('orientation: save needs Name, From and one dated session, and no blocking problem', () => {
  const blank = validateOrientation(blankOrientation(), [])
  assert.deepEqual(Object.keys(blank.errors), ['employeeId', 'fromDate', 'toDate'])
  assert.equal(blank.errors.toDate, 'Schedule at least one session so the To date can be set')
  assert.equal(blank.firstStep, 0)
  const noSession = validateOrientation({ ...blankOrientation(), employeeId: '1', fromDate: '2026-11-01' }, [])
  assert.equal(noSession.firstStep, 1)
  const form = { ...blankOrientation(), employeeId: '1', fromDate: '2026-11-01', sessions: withSessions({ hr: session({ timeTo: '07:00' }) }) }
  const blocked = validateOrientation(form, scheduleIssues(form.sessions))
  assert.equal(blocked.firstStep, 2)
  assert.equal(blocked.errors.sessions, 'HR: the end time must be after the start time.')
  assert.equal(validateOrientation({ ...form, sessions: withSessions({ hr: session() }) }, []).valid, true, 'one dated session is enough')
  assert.equal(isOrientationLocked('SCHEDULED'), true)
  assert.equal(isOrientationLocked(undefined), false)
})

test('orientation: the request body carries only the answers; Ref #, To and Scheduled by are server values', () => {
  const body = orientationPayload({ employeeId: '2', fromDate: '2026-11-08', sessions: withSessions({ hr: session({ remark: '  Bring ID ' }) }) })
  assert.deepEqual(Object.keys(body), ['employeeId', 'fromDate', 'sessions'])
  assert.deepEqual(body.sessions.hr, { headCode: 'HEAD_HR_A', fromDate: '2026-11-01', toDate: '2026-11-01', timeFrom: '08:00', timeTo: '12:00', remark: 'Bring ID' })
  assert.deepEqual(body.sessions.it, { headCode: null, fromDate: null, toDate: null, timeFrom: null, timeTo: null, remark: '' })
})

// ------------------------------------------------------------ contract and services

const orientationRecord = (overrides = {}) => ({
  scheduleId: '7', scheduleNumber: 'ORT-2026-0007', status: 'SCHEDULED', employee: DEMO_EMPLOYEES[0], scheduledByName: 'Sample Scheduler',
  fromDate: '2026-11-01', toDate: '2026-11-04',
  sessions: Object.fromEntries(SESSION_KEYS.map((key) => [key, { headCode: null, fromDate: null, toDate: null, timeFrom: null, timeTo: null, remark: '' }])),
  updatedAt: '2026-10-28T08:00:00.000Z', ...overrides,
})

test('contracts: lookups carry the orientation heads; employee and schedule shapes are checked', () => {
  const lookups = readLookups(DEMO_LOOKUPS)
  assert.deepEqual(Object.keys(lookups.orientation.departmentHeads), SESSION_KEYS)
  assert.equal(readEmployee(DEMO_EMPLOYEES[0]).name, 'Sample Employee 001')
  const record = readOrientation(orientationRecord())
  assert.equal(record.employee.employeeNumber, '30401')
  assert.deepEqual(orientationFormFromRecord(record).sessions.hr, { headCode: '', fromDate: '', toDate: '', timeFrom: '', timeTo: '', remark: '' })
  const rejects = (fn) => assert.throws(fn, (error) => error.code === 'INVALID_RESPONSE')
  rejects(() => readOrientation(orientationRecord({ status: 'DRAFT' })))
  rejects(() => readOrientation(orientationRecord({ sessions: { hr: {} } })))
  rejects(() => readOrientation(orientationRecord({ sessions: { ...orientationRecord().sessions, hr: { ...orientationRecord().sessions.hr, timeFrom: '8am' } } })))
  rejects(() => readEmployee({ ...DEMO_EMPLOYEES[0], employeeId: 'x' }))
  rejects(() => readLookups({ ...DEMO_LOOKUPS, orientation: { departmentHeads: { hr: [] } } }))
})

test('orientation service uses the employee setup, skills, list and draft save endpoints', async () => {
  const apiRecord = {
    headerId: '7', reference: 'ORT-7', status: 'Draft', flag: 'Y', empNo: '30401', personId: '1', empname: 'Sample Employee 001',
    type: 'Employee', startDate: '2026-11-01', section: 'Operations', division: 'Food', position: 'Operator', fromOrient: '2026-11-01',
    toOrient: '2026-11-01', orientationBy: 'Test User', createdAt: '2026-10-28T08:00:00.000Z',
    lines: [{ lineId: '9', department: 'Training with HR Dept', departmentHead: 'Sample Manager', fromDate: '2026-11-01', toDate: '2026-11-01', orientationDays: 1, timeFrom: '08:00', timeTo: '12:00', remarks: '' }],
  }
  const { fetchImpl, calls } = recordingFetch((url, init) => {
    if (url.endsWith('/lookups/employees')) return success([{ personId: '1', empNo: '30401', fullName: 'Sample Employee 001', startDate: '2026-11-01', jobId: '10', name: 'Operator', section: 'Operations', division: 'Food', organizationId: '1', position: 'Operator', empType: 'Employee' }])
    if (url.endsWith('/lookups/managers')) return success([{ empNo: '30400', fullName: 'Sample Manager' }])
    if (url.includes('/lookups/employee-details')) return success({ personId: '1', empNo: '30401', empname: 'Sample Employee 001', empType: 'Employee', startDate: '2026-11-01', section: 'Operations', division: 'Food', position: 'Operator' })
    if (url.includes('/lookups/flag')) return success({ flag: 'Y', tableName: 'HR_ORIENTATION_TRAININGS' })
    if (url.includes('/lookups/skills')) return success({ skills: ['Training with HR Dept'] })
    if (url.includes('/hr/orientation-trainings?') && init.method === 'GET') return success([apiRecord], 200, { pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
    if (init.method === 'POST') return success({ headerId: '7', flag: 'Y', reference: 'ORT-7' }, 201)
    if (url.endsWith('/7')) return success(apiRecord)
    throw new Error(`Unexpected request: ${init.method} ${url}`)
  })
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const services = createHrRecruitmentServices({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore }) })
  const lookups = await services.orientations.getLookups()
  assert.equal(lookups.employees[0].employeeNumber, '30401')
  assert.equal(lookups.managers[0].name, 'Sample Manager')
  const setup = await services.orientations.employeeSetup('30401')
  assert.deepEqual(setup.departments, ['Training with HR Dept'])
  const form = { employee: setup.employee, flag: setup.flag, fromOrient: '2026-11-01', toOrient: '2026-11-01', lines: [{ department: setup.departments[0], departmentHead: 'Sample Manager', fromDate: '2026-11-01', toDate: '2026-11-01', orientationDays: 1, timeFrom: '08:00', timeTo: '12:00' }] }
  await services.orientations.save(null, form)
  const listed = await services.orientations.list({ flag: 'Y' })
  assert.equal(listed.items[0].scheduleNumber, 'ORT-7')
  await services.orientations.getById('7')
  assert.ok(calls.some((call) => call.url === '/api/v1/hr/orientation-trainings?flag=Y&page=1&pageSize=10'))
  const saveCall = calls.find((call) => call.init.method === 'POST')
  assert.equal(saveCall.url, '/api/v1/hr/orientation-trainings')
  assert.equal(saveCall.init.headers.get('X-CSRF-Token'), SESSION_TOKEN)
  assert.equal(JSON.parse(saveCall.init.body).lines[0].department, 'Training with HR Dept')
})

test('employee report service uses the contractor employee lookup and paginated list contracts', async () => {
  const row = {
    emp_id: '31', employee_number: '4001', employee_name: 'Sample Contractor Employee', division: '300000003618177', iqamah: 123456789,
    department: 'Production', prod_dep: '2', direct_boss: 'Sample Manager', direct_boss_id: '71', job: '81', job_title: 'Operator', place: 'Plant',
    replacement: null, rate: 30, start_date: '2026-01-01', end_date: null, status: 'Active', ajeer: false, sfda: true, blacklist: false,
    remark: null, con_number: 500, con_name: 'Sample Contractor', creation_date: '2026-01-01T00:00:00Z', updated_date: null,
  }
  const { fetchImpl, calls } = recordingFetch((url) => {
    if (url.endsWith('/lookups/divisions')) return success([{ value: '300000003618177', label: 'IPP BU' }])
    if (url.endsWith('/lookups/departments')) return success([{ value: 'ALL', label: 'ALL' }, { value: 'Production', label: 'Production' }])
    if (url.endsWith('/lookups/contractors')) return success([{ value: '500', label: 'Sample Contractor' }])
    if (url.includes('/hr/contractor-employees?')) return success([row], 200, { pagination: { page: 2, limit: 50, total: 51, totalPages: 2, hasNextPage: false, hasPreviousPage: true } })
    throw new Error(`Unexpected request: ${url}`)
  })
  const services = createHrRecruitmentServices({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl }) })
  const lookups = await services.employeeReport.getLookups()
  assert.equal(lookups.contractors[0].value, '500')
  const report = await services.employeeReport.list({ division: 'ALL', department: 'Production', contractorNumber: '500', status: 'Active', dateFrom: '2026-01-01', dateTo: '2026-12-31', page: 2 })
  assert.deepEqual([report.items[0].empId, report.items[0].contractorName, report.items[0].sfda], ['31', 'Sample Contractor', true])
  assert.deepEqual(report.pagination, { page: 2, limit: 50, total: 51, totalPages: 2, hasNextPage: false, hasPreviousPage: true })
  assert.equal(calls.at(-1).url, '/api/v1/hr/contractor-employees?division=ALL&department=Production&contractor_number=500&status=Active&date_from=2026-01-01&date_to=2026-12-31&page=2&limit=50&sort=employee_number&order=asc')
})

// ------------------------------------------------------------ static checks

test('orientation page: flow step 4 keeps the styled editor and uses backend employee skill rows', async () => {
  assert.deepEqual(RECRUITMENT_FLOW.map((item) => item.id).slice(0, 4), ['requisition', 'interview', 'offer', 'orientation'])
  const shell = await read(`${FEATURE}shared/components/RecruitmentShell.jsx`)
  assert.match(shell, /style=\{\{ '--f': index, '--n': FLOW\.length \}\}/, 'the flow has as many columns as forms')
  const picker = await read(`${FEATURE}shared/components/EmployeePicker.jsx`)
  for (const attribute of ['role="combobox"', 'aria-expanded={open}', 'aria-controls={listId}', 'aria-autocomplete="list"', 'role="listbox"', 'role="option"', 'aria-selected={index === active}', 'aria-activedescendant=']) {
    assert.ok(picker.includes(attribute), attribute)
  }
  assert.match(picker, /event\.key === 'Escape' && open/)
  assert.match(picker, /event\.key === 'ArrowDown'/)
  assert.match(picker, /role="status" aria-live="polite"/)
  const page = await read(`${FEATURE}orientation/OrientationPage.jsx`)
  assert.match(page, /<EmployeePicker id="ori-name" label=\{T\.labels\.name\} required/)
  assert.match(page, /loadLookups=\{service\.getLookups\}/)
  assert.match(page, /service\.employeeSetup\(picked\.employeeNumber\)/)
  assert.match(page, /const lines = form\.lines/)
  assert.match(page, /service\.save\(editor\.recordId, payload\)/)
  assert.match(page, /readOnly value=\{toDate \? enDate\(toDate\) : ''\}/, 'To is derived from line dates')
  const loader = await read(`${FEATURE}shared/components/RecruitmentLoader.jsx`)
  assert.match(loader, /useEffect\(\(\) => identifyDemoUser\(user\?\.fullName\), \[user\?\.fullName\]\)/)
})

test('fictional demo data: every demo person follows the "Sample …" pattern; no real-looking names', async () => {
  const lookups = readLookups(DEMO_LOOKUPS)
  const people = [
    ...DEMO_EMPLOYEES.map((employee) => employee.name),
    ...Object.values(lookups.orientation.departmentHeads).flat().map((head) => head.name),
  ]
  for (const name of people) assert.match(name, /^Sample [A-Za-z ]+[A-Z0-9]+$/, name)
  // "SURNAME, Firstname" was the incoming app's style for real-looking people.
  const sources = await Promise.all([`${FEATURE}demo/demoData.js`, `${FEATURE}hrRecruitmentText.js`, `${FEATURE}orientation/orientationModel.js`, `${FEATURE}probation/probationModel.js`].map(read))
  for (const source of sources) assert.equal(/['"][A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*, [A-Z][a-z]+['"]/.test(source), false, 'no "SURNAME, Firstname" literals')
})

// ------------------------------------------------------------ probation evaluation (form 1064)

const FORM_TYPES = readLookups(DEMO_LOOKUPS).probation.formTypes
const SCALE = readLookups(DEMO_LOOKUPS).probation.ratingScale
const WORKERS = FORM_TYPES.find((type) => type.code === 'WORKERS').criteria
const scoreAll = (criteria, fraction) => Object.fromEntries(criteria.map((criterion) => [criterion.code, quickPoints(criterion.points, fraction)]))
// Scores totalling `total` on the Workers form (allocations 20/15/15/15/10/10/10/5).
function scoresFor(total) {
  let left = total
  return Object.fromEntries(WORKERS.map((criterion) => {
    const points = Math.min(criterion.points, left)
    left -= points
    return [criterion.code, points]
  }))
}
const PROBATION_EMPLOYEE = Object.freeze({ ...DEMO_EMPLOYEES[4] }) // joined 2026-08-02, Workers form
const SIGNED = Object.freeze({ evaluator: '2026-10-28T08:00:00.000Z', employee: null })

test('probation: points are whole numbers clamped to 0..allocated; quick picks are shares of the allocation', () => {
  assert.deepEqual([clampPoints('7', 15), clampPoints('7.6', 15), clampPoints('-3', 15), clampPoints('99', 15), clampPoints('', 15), clampPoints('x', 15)], [7, 8, 0, 15, '', ''])
  assert.deepEqual(QUICK_PICKS.map((fraction) => quickPoints(15, fraction)), [0, 4, 8, 11, 15])
  assert.deepEqual(QUICK_PICKS.map((fraction) => quickPoints(5, fraction)), [0, 1, 3, 4, 5])
})

test('probation: totals, pass mark 71 and result', () => {
  for (const type of FORM_TYPES) assert.equal(type.criteria.reduce((sum, criterion) => sum + criterion.points, 0), 100, `${type.code} allocations total 100`)
  const partial = evaluationTotals(WORKERS, { [WORKERS[0].code]: 20 })
  assert.deepEqual([partial.total, partial.scored, partial.complete, partial.acceptable], [20, 1, false, false])
  assert.equal(evaluationTotals(WORKERS, scoresFor(71)).acceptable, true)
  assert.equal(evaluationTotals(WORKERS, scoresFor(70)).acceptable, false)
  assert.equal(evaluationTotals(WORKERS, scoreAll(WORKERS, 1)).percent, 100)
  assert.deepEqual([resultFor(100), resultFor(71), resultFor(70), resultFor(0)], ['ACCEPTABLE', 'ACCEPTABLE', 'NOT_ACCEPTABLE', 'NOT_ACCEPTABLE'])
  assert.equal(PASS_MARK, 71)
})

test('probation: rating scale 91 Outstanding, 81 Very good, 71 Good, 51 Needs improvement, below Unsatisfactory', () => {
  const rate = (percent) => ratingFor(percent, SCALE).label
  assert.deepEqual([0, 50, 51, 70, 71, 80, 81, 90, 91, 100].map(rate), [
    'Unsatisfactory', 'Unsatisfactory', 'Needs improvement', 'Needs improvement', 'Good', 'Good', 'Very good', 'Very good', 'Outstanding', 'Outstanding',
  ])
  assert.equal(ratingFor(60, [{ min: 0, label: 'Low' }, { min: 60, label: 'High' }]).label, 'High', 'the scale is configurable')
})

test('probation: suggested recommendation and the justification rule', () => {
  const suggest = (total) => suggestedRecommendation(evaluationTotals(WORKERS, scoresFor(total)))
  assert.deepEqual([suggest(100), suggest(71), suggest(70), suggest(51), suggest(50), suggest(0)], ['CONFIRM', 'CONFIRM', 'EXTEND', 'EXTEND', 'END', 'END'])
  assert.equal(suggestedRecommendation(evaluationTotals(WORKERS, {})), '', 'nothing suggested until every criterion is scored')
  const pass = evaluationTotals(WORKERS, scoresFor(80))
  const fail = evaluationTotals(WORKERS, scoresFor(60))
  assert.deepEqual(['CONFIRM', 'EXTEND', 'END'].map((value) => contradictsResult(value, pass)), [false, false, true], 'End on Acceptable needs a justification')
  assert.deepEqual(['CONFIRM', 'EXTEND', 'END'].map((value) => contradictsResult(value, fail)), [true, false, false], 'Confirm on Not acceptable needs a justification')
  assert.equal(contradictsResult('END', evaluationTotals(WORKERS, {})), false, 'no result yet')
})

test('probation: the period is the probation (joining + 3 months); extensions move the end', () => {
  assert.equal(probationEnd('2026-08-02'), '2026-11-02')
  assert.deepEqual([1, 2, 3].map((months) => probationEnd('2026-08-02', 'EXTEND', String(months))), ['2026-12-02', '2027-01-02', '2027-02-02'])
  assert.equal(probationEnd('2026-08-02', 'CONFIRM', '3'), '2026-11-02', 'an extension counts only when extending')
  assert.equal(addMonths('2026-11-30', 3), '2027-03-02', 'month arithmetic rolls over like the original form')
  assert.equal(probationElapsed('2026-08-02', '2026-11-02', '2026-09-17'), 0.5)
  assert.equal(probationElapsed('2026-08-02', '2026-11-02', '2026-12-01'), 1)
  const picked = withEmployee(blankProbation(), PROBATION_EMPLOYEE)
  assert.deepEqual([picked.employeeId, picked.formTypeCode, picked.fromDate, picked.toDate], ['5', 'WORKERS', '2026-08-02', '2026-11-02'])
  const kept = withEmployee({ ...blankProbation(), formTypeCode: 'TRAINEE', fromDate: '2026-09-01' }, PROBATION_EMPLOYEE)
  assert.deepEqual([kept.formTypeCode, kept.fromDate, kept.toDate], ['TRAINEE', '2026-09-01', '2026-11-02'], 'choices already made are kept')
  const scored = { ...picked, scores: scoreAll(WORKERS, 1), notes: { X: 'y' } }
  assert.equal(withFormType(scored, 'WORKERS'), scored)
  assert.deepEqual([withFormType(scored, 'TRAINEE').scores, withFormType(scored, 'TRAINEE').notes], [{}, {}], 'another form type clears the points')
})

test('probation: validation for save and submit opens the first step with a problem', () => {
  const blank = validateProbation(blankProbation(), { employee: null, criteria: [] })
  assert.deepEqual(Object.keys(blank.errors), ['formTypeCode', 'employeeId', 'fromDate', 'toDate'])
  assert.equal(blank.firstStep, 0)
  const base = { ...withEmployee(blankProbation(), PROBATION_EMPLOYEE), scores: scoreAll(WORKERS, 0.75) }
  const context = { employee: PROBATION_EMPLOYEE, criteria: WORKERS }
  assert.equal(validateProbation(base, context).valid, true, 'save: setup and every criterion scored')
  assert.equal(validateProbation({ ...base, toDate: '2026-08-01' }, context).errors.toDate, 'End date is before start date')
  assert.equal(validateProbation({ ...base, fromDate: '2026-08-01' }, context).errors.fromDate, 'Starts before the joining date')
  const unscored = validateProbation({ ...base, scores: { ...base.scores, [WORKERS[2].code]: '' } }, context)
  assert.deepEqual([Object.keys(unscored.errors), unscored.firstStep], [[`criterion:${WORKERS[2].code}`], 1])
  const submit = validateProbation(base, context, { submit: true })
  assert.deepEqual(Object.keys(submit.errors), ['recommendation', 'evaluatorSignature'])
  assert.equal(submit.firstStep, 2)
  assert.deepEqual(Object.keys(validateProbation({ ...base, recommendation: 'EXTEND', signatures: SIGNED }, context, { submit: true }).errors), ['extendBy'])
  const contradiction = { ...base, recommendation: 'END', signatures: SIGNED }
  assert.equal(validateProbation(contradiction, context, { submit: true }).errors.justification, 'Explain why the recommendation differs from the result')
  assert.equal(validateProbation({ ...contradiction, justification: 'Safety breach' }, context, { submit: true }).valid, true)
  assert.equal(validateProbation({ ...base, recommendation: 'CONFIRM' }, context, { submit: true }).firstStep, 3, 'only the signature missing: sign-off step')
  assert.deepEqual([isProbationLocked('SUBMITTED'), isProbationLocked('DRAFT')], [true, false])
})

test('probation: request body and contracts (criteria must total 100)', () => {
  const form = { ...withEmployee(blankProbation(), PROBATION_EMPLOYEE), scores: { A: '7', B: '' }, notes: { A: ' good ', B: '  ' }, recommendation: 'EXTEND', extendBy: '2' }
  const body = probationPayload(form)
  assert.deepEqual([body.scores, body.notes, body.extendByMonths, body.recommendation], [{ A: 7 }, { A: 'good' }, 2, 'EXTEND'])
  assert.equal(probationPayload({ ...form, recommendation: 'CONFIRM' }).extendByMonths, null)
  for (const field of ['evaluationNumber', 'status', 'preparedByName']) assert.equal(field in body, false, `${field} is server-assigned`)
  const broken = structuredClone(DEMO_LOOKUPS)
  broken.probation.formTypes[0].criteria[0].points = 25
  assert.throws(() => readLookups(broken), (error) => error.code === 'INVALID_RESPONSE', 'allocations must total 100')
  const record = {
    evaluationId: '3', evaluationNumber: 'PAF-2026-0003', status: 'DRAFT', employee: PROBATION_EMPLOYEE, preparedByName: 'Sample Evaluator', formTypeCode: 'WORKERS',
    fromDate: '2026-08-02', toDate: '2026-11-02', scores: { QUALITY_OF_WORK: 12 }, notes: {}, strengths: '', improvements: '', training: '', recommendation: 'EXTEND',
    extendByMonths: 2, justification: '', comments: '', suggestion: '', signatures: { evaluator: null, employee: null }, updatedAt: '2026-10-28T08:00:00.000Z',
  }
  assert.equal(probationFormFromRecord(readProbation(record)).extendBy, '2')
  assert.throws(() => readProbation({ ...record, extendByMonths: 4 }), (error) => error.code === 'INVALID_RESPONSE')
  assert.throws(() => readProbation({ ...record, scores: { QUALITY_OF_WORK: 7.5 } }), (error) => error.code === 'INVALID_RESPONSE')
})

test('probation service uses the backend draft and lookup contracts', async () => {
  const backendRecord = {
    headerId: '8', formDate: '28-Oct-2026', evaluationPeriod: 'Oct 2026', formType: 'Trainee', employeeName: 'Sample Employee 001',
    employeeNumber: '30401', empId: '71', grade: 2, jobTitle: 'Engineer', department: 'IT', fromDate: '01-Oct-2026', toDate: '28-Oct-2026',
    comment: '', comments: '', totalRating: 4, requestStatus: 'DRAFT', lines: [{ lineId: '81', param: 'Quality', paramAr: '', rating: 4 }],
  }
  const { fetchImpl, calls } = recordingFetch((url, init) => {
    if (url.endsWith('/lookups/form-types')) return success({ formTypes: ['Trainee'] })
    if (url.endsWith('/lookups/employees')) return success([{ hierarchyLevel: 2, userId: '71', fullName: 'Sample Employee 001' }])
    if (url.endsWith('/lookups/requestor')) return success({ fullName: 'Sample Requestor', employeeNumber: '2502' })
    if (url.includes('/lookups/employee-details')) return success({ ids: { personId: '71', employeeNumber: '30401' }, hire: { startDate: '01-Oct-2026' }, job: { name: 'Engineer' }, dept: { name: 'IT' } })
    if (init.method === 'POST') return success({ headerId: '8' }, 201)
    return success(backendRecord)
  })
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const services = createHrRecruitmentServices({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore }) })
  assert.deepEqual((await services.probations.getLookups()).probation.formTypes.map((item) => item.code), ['Trainee'])
  assert.deepEqual((await services.probations.searchEmployees('sample')).items.map((item) => item.name), ['Sample Employee 001'])
  assert.equal((await services.probations.employeeDetails('Sample Employee 001')).employeeNumber, '30401')
  const saved = await services.probations.save(null, {
    formDate: '2026-10-28', evaluationPeriod: 'Oct 2026', formType: 'Trainee', employee: { name: 'Sample Employee 001', employeeNumber: '30401', employeeId: '71', grade: 2, position: 'Engineer', departmentName: 'IT' },
    fromDate: '2026-10-01', toDate: '2026-10-28', comment: '', comments: '', lines: [{ param: 'Quality', paramAr: '', rating: 4 }],
  })
  assert.deepEqual([saved.evaluationId, saved.formType, saved.lines[0].rating], ['8', 'Trainee', 4])
  assert.deepEqual(calls.map((call) => `${call.init.method} ${call.url}`), [
    'GET /api/v1/hr/probation-evaluations/lookups/form-types',
    'GET /api/v1/hr/probation-evaluations/lookups/employees',
    'GET /api/v1/hr/probation-evaluations/lookups/requestor',
    'GET /api/v1/hr/probation-evaluations/lookups/employees',
    'GET /api/v1/hr/probation-evaluations/lookups/employee-details?empName=Sample+Employee+001',
    'POST /api/v1/hr/probation-evaluations',
    'GET /api/v1/hr/probation-evaluations/8',
  ])
  assert.equal(calls[5].init.headers.get('X-CSRF-Token'), SESSION_TOKEN)
  assert.deepEqual(JSON.parse(calls[5].init.body).lines, [{ param: 'Quality', paramAr: '', rating: 4 }])
})

test('probation page connects to backend supported fields', async () => {
  assert.deepEqual(RECRUITMENT_FLOW.map((item) => item.id), ['requisition', 'interview', 'offer', 'orientation', 'probation'])
  const page = await read(`${FEATURE}probation/ProbationPage.jsx`)
  assert.match(page, /loadLookups=\{\(signal\) => service\.getLookups\(\{ signal \}\)\}/)
  assert.match(page, /searchService=\{searchEmployees\}/)
  assert.match(page, /lookups\.employees\.filter/)
  assert.match(page, /<EmployeePicker id="pa-emp"/)
  assert.match(page, /Rating \(1–5\)/)
  assert.match(page, /Add criterion/)
  assert.match(page, /Save draft/)
  assert.doesNotMatch(page, /service\.submit|recommendation|signature/)
  const inputs = await read(`${FEATURE}shared/components/RecruitmentInputs.jsx`)
  assert.match(inputs, /role="radiogroup" aria-labelledby=\{`\$\{id\}-label`\} aria-required="true"/)
  assert.match(inputs, /<input type="radio" name=\{name\}/)
  const text = await read(`${FEATURE}hrRecruitmentText.js`)
  assert.match(text, /officialEn: 'Performance Appraisal Form \(PAF\) for Probation Period'/)
  assert.match(text, /officialAr: 'تقييم الأداء الوظيفي لفترة التجربة'/)
})

// ------------------------------------------------------------ periodwise employees report

const PERIOD = Object.freeze({ department: ALL_DEPARTMENTS, from: '2026-01-01', to: '2026-06-30' })
const TODAY = '2026-10-28'
const person = (number, overrides = {}) => ({
  employeeNumber: String(number), name: `Sample Employee ${number}`, birthDate: '1990-05-10', nationality: 'Saudi', job: 'Packer', departmentCode: 'PROD',
  departmentName: 'Production', position: 'Packer', nationalId: `10000000${number}`, startDate: '2020-01-01', endDate: null, leavingReason: '', ...overrides,
})

test('report: an employee is included when start ≤ To and (no end or end ≥ From)', () => {
  assert.equal(inPeriod(person(1), PERIOD), true)
  assert.equal(inPeriod(person(2, { startDate: '2026-06-30' }), PERIOD), true, 'starts on To')
  assert.equal(inPeriod(person(3, { startDate: '2026-07-01' }), PERIOD), false, 'starts after To')
  assert.equal(inPeriod(person(4, { endDate: '2026-01-01' }), PERIOD), true, 'ends on From')
  assert.equal(inPeriod(person(5, { endDate: '2025-12-31' }), PERIOD), false, 'left before From')
  const rows = runReport([person(1), person(2, { departmentCode: 'FIN' })], { ...PERIOD, department: 'FIN' }, TODAY)
  assert.deepEqual(rows.map((row) => row.employeeNumber), ['2'], 'one department')
})

test('report: age is today\'s age; years are service up to the earlier of end and To (2 decimals)', () => {
  assert.equal(ageOn('1990-10-28', TODAY), 36, 'birthday today')
  assert.equal(ageOn('1990-10-29', TODAY), 35, 'birthday tomorrow')
  assert.equal(ageOn(null, TODAY), null)
  assert.equal(yearsBetween('2020-01-01', '2026-01-01'), 6, '365.25-day years')
  assert.equal(yearsBetween('2020-01-01', '2026-06-30'), 6.49)
  assert.equal(yearsBetween('2026-07-01', '2026-06-30'), 0)
  const [stillThere, left] = runReport([person(1), person(2, { endDate: '2026-03-31' })], PERIOD, TODAY)
  assert.equal(stillThere.years, 6.49, 'service up to To')
  assert.equal(left.years, 6.25, 'service up to the end date')
  assert.deepEqual([stillThere.active, left.active], [true, false], 'active = no end, or ends after To')
  assert.equal(runReport([person(3, { endDate: '2026-07-15' })], PERIOD, TODAY)[0].active, true, 'leaves after the period: active within it')
})

test('report: 60+ rows are highlighted; missing national ID or age under 16 needs checking', () => {
  const [senior, young, noId, fine] = runReport([
    person(1, { birthDate: '1966-10-28' }), person(2, { birthDate: '2011-01-01' }), person(3, { nationalId: null }), person(4),
  ], PERIOD, TODAY)
  assert.deepEqual([senior.senior, senior.age], [true, 60])
  assert.deepEqual(young.flags, ['BIRTH_DATE'])
  assert.deepEqual(noId.flags, ['NATIONAL_ID'])
  assert.deepEqual([fine.flags, fine.senior], [[], false])
})

test('report: KPIs (turnover = leavers ÷ average of period and active headcount)', () => {
  const rows = runReport([
    person(1, { nationality: 'Saudi', birthDate: '1966-01-01' }), person(2, { nationality: 'Indian' }), person(3, { nationality: 'Saudi', startDate: '2026-02-01' }),
    person(4, { endDate: '2026-04-30' }), person(5, { nationalId: null, nationality: 'Egyptian' }),
  ], PERIOD, TODAY)
  const summary = summarise(rows, PERIOD)
  assert.deepEqual([summary.total, summary.active, summary.joiners, summary.leavers], [5, 4, 1, 1])
  assert.equal(summary.turnover, 22.2, '1 ÷ ((5 + 4) ÷ 2) = 22.2 %')
  assert.equal(summary.saudization, 50, '2 of 4 active are Saudi')
  assert.deepEqual([summary.senior, summary.flagged], [1, 1])
  assert.equal(summary.averageAge, 42, 'active employees: (60 + 36 + 36 + 36) ÷ 4')
  assert.equal(summary.averageService, 5, 'active employees only: (6.49 + 6.49 + 0.41 + 6.49) ÷ 4, one decimal')
  assert.deepEqual(summarise([], PERIOD), { total: 0, active: 0, joiners: 0, leavers: 0, turnover: 0, saudization: 0, averageAge: 0, senior: 0, averageService: 0, flagged: 0 })
})

test('report: chart groupings: departments, nationality, age bands, joiners and leavers by year', () => {
  const rows = runReport([
    person(1, { departmentCode: 'FIN' }), person(2), person(3), person(4, { birthDate: '1999-01-01', startDate: '2022-03-01' }),
    person(5, { birthDate: '1960-01-01', startDate: '2021-01-01', endDate: '2026-02-01' }),
  ], PERIOD, TODAY)
  assert.deepEqual(groupCount(rows, 'departmentCode'), [['PROD', 4], ['FIN', 1]])
  assert.deepEqual(ageBandCounts(rows.filter((row) => row.active)), [['UNDER_30', 1], ['30_39', 3], ['40_49', 0], ['50_59', 0], ['60_PLUS', 0]])
  assert.deepEqual(yearlyFlow(rows, 2026), [['2021', 1, 0], ['2022', 1, 0], ['2023', 0, 0], ['2024', 0, 0], ['2025', 0, 0], ['2026', 0, 1]])
})

test('report: table search, status, chart filters, needs checking and sorting', () => {
  const rows = runReport([
    person(1, { nationality: 'Indian', job: 'Electrician' }), person(2, { endDate: '2026-02-01' }), person(3, { nationalId: null, departmentCode: 'FIN', departmentName: 'Finance' }),
    person(10, { birthDate: '1966-01-01' }),
  ], PERIOD, TODAY)
  const numbers = (list) => list.map((row) => row.employeeNumber)
  assert.deepEqual(numbers(filterRows(rows, { search: 'electric' })), ['1'])
  assert.deepEqual(numbers(filterRows(rows, { search: 'finance' })), ['3'], 'department name')
  assert.deepEqual(numbers(filterRows(rows, { status: 'left' })), ['2'])
  assert.deepEqual(numbers(filterRows(rows, { status: 'active' })), ['1', '3', '10'])
  assert.deepEqual(numbers(filterRows(rows, { nationality: 'Indian' })), ['1'])
  assert.deepEqual(numbers(filterRows(rows, { band: '60_PLUS' })), ['10'])
  assert.deepEqual(numbers(filterRows(rows, { flagged: true })), ['3'])
  assert.deepEqual(numbers(sortRows(rows, { key: 'employeeNumber', direction: 1 })), ['1', '2', '3', '10'], 'numbers sort numerically')
  assert.deepEqual(numbers(sortRows(rows, { key: 'age', direction: -1 })), ['10', '1', '2', '3'], 'descending, stable for ties')
  assert.deepEqual(numbers(sortRows(rows, { key: 'nationalId', direction: 1 })), ['3', '1', '2', '10'], 'empty first ascending')
})

test('report: parameters, quick ranges and CSV with a UTF-8 BOM', () => {
  assert.deepEqual(validateParams({ from: '', to: '' }), { from: 'Choose a start date', to: 'Choose an end date' })
  assert.deepEqual(validateParams({ from: '2026-05-01', to: '2026-04-30' }), { to: 'End date is before start date' })
  assert.deepEqual(validateParams({ from: '2026-05-01', to: '2026-05-01' }), {})
  assert.deepEqual(quickRanges(TODAY), { THIS_YEAR: ['2026-01-01', TODAY], LAST_12_MONTHS: ['2025-10-28', TODAY], SINCE_2000: ['2000-01-01', TODAY] })
  assert.deepEqual(['plain', 'a,b', 'say "hi"', 'line\nbreak', null, 42].map(csvCell), ['plain', '"a,b"', '"say ""hi"""', '"line\nbreak"', '', '42'])
  assert.deepEqual(['=SUM(A1)', '+1', '-2', '@x'].map(csvCell), ["'=SUM(A1)", "'+1", "'-2", "'@x"], 'spreadsheet formulas are neutralised')
  const csv = toCsv([person(1), person(2, { name: 'Sample, Employee' })], [{ label: '#', value: (row, index) => index + 1 }, { label: 'Name', value: (row) => row.name }])
  assert.equal(csv, '#,Name\r\n1,Sample Employee 1\r\n2,"Sample, Employee"')
  assert.equal(withBom('a').charCodeAt(0), 0xfeff)
  assert.equal(withBom('a').length, 2)
  assert.equal(csvFileName({ department: 'ALL', from: '2026-01-01', to: '2026-06-30' }), 'periodwise_employees_ALL_2026-01-01_2026-06-30.csv')
  assert.equal(PAGE_SIZE, 25)
})

test('report: contract, service request and the demo adapter', async () => {
  const rows = createDemoReportRows()
  assert.ok(rows.length >= 150)
  assert.ok(rows.every((row) => /^Sample Employee \d+$/.test(row.name)), 'fictional names only')
  assert.ok(rows.every((row) => !row.endDate || row.endDate > row.startDate), 'every leaver leaves after joining')
  assert.ok(rows.every((row) => Boolean(row.endDate) === Boolean(row.leavingReason)), 'leavers, and only leavers, have a reason')
  assert.ok(rows.some((row) => !row.nationalId) && rows.some((row) => ageOn(row.birthDate, TODAY) < 16) && rows.some((row) => ageOn(row.birthDate, TODAY) >= 60), 'every flag has data')
  assert.equal(readReport({ rows: rows.slice(0, 3) }).rows.length, 3)
  assert.throws(() => readReport({ rows: [rows[0], rows[0]] }), (error) => error.code === 'INVALID_RESPONSE', 'duplicate employee numbers')
  assert.throws(() => readReport({ rows: [{ ...rows[0], startDate: '2026/01/01' }] }), (error) => error.code === 'INVALID_RESPONSE')
  const { fetchImpl, calls } = recordingFetch(() => success({ rows: rows.slice(0, 2) }))
  const services = createHrRecruitmentServices({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore: createCsrfStore() }) })
  await services.reports.periodwiseEmployees({ department: 'PROD', from: '2026-01-01', to: '2026-06-30' })
  assert.equal(`${calls[0].init.method} ${calls[0].url}`, 'GET /api/v1/hr/reports/periodwise-employees?department=PROD&from=2026-01-01&to=2026-06-30')
  const demo = demoServices().services
  const all = await demo.reports.periodwiseEmployees(PERIOD)
  assert.ok(all.rows.every((row) => inPeriod(row, PERIOD)), 'the server applies the period rule')
  const production = await demo.reports.periodwiseEmployees({ ...PERIOD, department: 'PROD' })
  assert.ok(production.rows.length > 0 && production.rows.every((row) => row.departmentCode === 'PROD'))
  await assert.rejects(demo.reports.periodwiseEmployees({ ...PERIOD, from: '2026-07-01' }), (error) => error.status === 422 && error.details[0].field === 'to')
  await assert.rejects(demo.reports.periodwiseEmployees({ ...PERIOD, department: 'NOPE' }), (error) => error.status === 422)
})

test('report page: outside the flow, sortable headers, column chooser, side panel and export', async () => {
  assert.equal(RECRUITMENT_FLOW.some((item) => item.path.includes('/reports/')), false, 'the report is not part of the flow')
  const page = await read(`${FEATURE}report/PeriodwiseEmployeesPage.jsx`)
  assert.equal(/<FlowNav|<RecruitmentShell/.test(page), false)
  assert.match(page, /<RecruitmentHeader title=\{T\.title\} subtitle=\{T\.subtitle\} breadcrumb=\{T\.breadcrumb\} demo=\{hrRecruitmentDemo\} \/>/)
  assert.match(page, /aria-sort=\{sort\.key === column\.key \? \(sort\.direction > 0 \? 'ascending' : 'descending'\) : column\.sort \? 'none' : undefined\}/)
  assert.match(page, /\{ key: 'position', label: C\.position, sort: true, hidden: true \}/, 'Position hidden by default')
  assert.match(page, /event\.key === 'Escape' && columnMenu/, 'Escape closes the column chooser')
  assert.match(page, /<Dialog title=\{open\.name\} onClose=\{\(\) => setOpen\(null\)\}>/, 'the side panel is the shared dialog (focus trap, Escape)')
  assert.match(page, /new Blob\(\[withBom\(csv\)\], \{ type: 'text\/csv;charset=utf-8' \}\)/)
  assert.match(page, /filtered\.slice\(current \* PAGE_SIZE, current \* PAGE_SIZE \+ PAGE_SIZE\)/)
  assert.match(page, /const view = printing \? filtered :/, 'printing lists every filtered row')
  for (const key of ['employeeNumber', 'name', 'birthDate', 'age', 'nationality', 'job', 'departmentName', 'position', 'nationalId', 'startDate', 'years', 'endDate', 'leavingReason']) {
    assert.match(page, new RegExp(`key: '${key}'`), key)
  }
  const css = await read('../src/styles/hr-recruitment.css')
  assert.match(css, /\.zrv-hr-rp-table th \{ position: sticky;/, 'sticky header')
})

// ------------------------------------------------------------ navigation

// VITE_FEATURE_HR_RECRUITMENT controls the visibility of HR workflow pages;
// each state is resolved through the same function used by the application.
const SWITCH = 'VITE_FEATURE_HR_RECRUITMENT'
const HR_SWITCHED_IDS = ['hr-orientation', 'hr-orientation-record', 'hr-probation', 'hr-probation-record', 'hr-employee-report']

test('HR visibility switch: true, false, unset in development and unset in production', () => {
  const states = [
    [{ [SWITCH]: 'true', DEV: false }, true, 'true (production build)'],
    [{ [SWITCH]: 'true', DEV: true }, true, 'true (development build)'],
    [{ [SWITCH]: 'false', DEV: true }, false, 'false wins over a development build'],
    [{ [SWITCH]: 'false', DEV: false }, false, 'false (production build)'],
    [{ DEV: true }, true, 'unset in a development build'],
    [{ DEV: false }, false, 'unset in a production build'],
    [{}, false, 'unset, no build information (plain Node)'],
    [{ [SWITCH]: 'yes', DEV: false }, false, 'only the exact value "true" turns it on'],
  ]
  for (const [env, visible, label] of states) {
    assert.equal(isFeatureEnabled({ env: SWITCH }, env), visible, label)
    assert.deepEqual(resolveNavigationEntries(registry.entries, env).filter((route) => HR_SWITCHED_IDS.includes(route.id)).map((route) => route.implemented), HR_SWITCHED_IDS.map(() => visible), label)
  }
  assert.equal(isFeatureEnabled(undefined, {}), true, 'entries without a switch are unaffected')
  const switched = registry.entries.filter((entry) => entry.enabledBy).map((entry) => entry.id)
  assert.deepEqual(switched, HR_SWITCHED_IDS, 'HR workflow pages use the shared feature switch')
  assert.ok(registry.entries.filter((entry) => entry.enabledBy).every((entry) => entry.enabledBy.env === SWITCH))
  // The data source is a separate switch.
  assert.equal(resolveDemoMode({ [SWITCH]: 'true', DEV: false }), false, 'visible pages can use the real API')
})

test('orientation, probation and employee report use backend HR permissions', () => {
  const orientation = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true' }).find((route) => route.id === 'hr-orientation')
  assert.equal(orientation.permission, 'HR.ORIENTATION_TRAININGS:VIEW')
  assert.equal(orientation.implemented, true)
  assert.equal(findAppRoute('/hr/recruitment/orientation/12')?.id, 'hr-orientation-record')
  const employeeReport = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true' }).find((route) => route.id === 'hr-employee-report')
  assert.equal(employeeReport.permission, 'HR.CONTRACTOR_EMPLOYEES:VIEW')
  assert.equal(employeeReport.implemented, true)
  assert.equal(findAppRoute('/hr/reports/periodwise-employees')?.id, 'hr-employee-report')
  const probation = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true' }).find((route) => route.id === 'hr-probation')
  assert.equal(probation.permission, 'HR.PROBATION_EVALUATIONS:VIEW')
  assert.equal(probation.implemented, true)
})
