// HR onboarding screens of the hr-recruitment feature: Orientation Schedule
// (form 1101), Probation Evaluation (form 1064) and the Periodwise Employees
// report. Business rules, response contracts, services over the shared API
// client (mocked transport), the owner-approved in-memory demo adapter and
// static checks of the JSX. No backend, Oracle or browser storage is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { authorizedNavigation, canAccessRoute, findAppRoute, implementedRoutes, isFeatureEnabled, paletteCommands, resolveNavigationEntries, routeAccess } from '../src/config/appNavigation.js'
import { registeredModules, registry } from '../src/config/registry/index.js'
import { resolveDemoMode } from '../src/features/hr-recruitment/hrRecruitmentConfig.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { readEmployee, readLookups, readOrientation, readProbation, readReport } from '../src/features/hr-recruitment/hrRecruitmentContract.js'
import { createHrRecruitmentServices, identifyDemoUser } from '../src/features/hr-recruitment/hrRecruitmentService.js'
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
import { SESSION_TOKEN, forbidBrowserStorage, recordingFetch, success } from './helpers/http.mjs'

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

test('services: employee search and orientation schedules use their paths, with CSRF on the save', async () => {
  const { fetchImpl, calls } = recordingFetch((url) => (url.includes('/employees')
    ? success([DEMO_EMPLOYEES[0]], 200, { pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } })
    : success(orientationRecord(), 201)))
  const csrfStore = createCsrfStore()
  csrfStore.setSessionToken(SESSION_TOKEN)
  const services = createHrRecruitmentServices({ client: createApiClient({ baseUrl: '/api/v1', fetchImpl, csrfStore }) })
  assert.equal((await services.employees.search(' sample ')).items.length, 1)
  await services.orientations.save({ employeeId: '1' })
  await services.orientations.getById('7')
  assert.deepEqual(calls.map((call) => `${call.init.method} ${call.url}`), [
    'GET /api/v1/hr/recruitment/employees?search=sample&page=1&limit=10',
    'POST /api/v1/hr/recruitment/orientation-schedules',
    'GET /api/v1/hr/recruitment/orientation-schedules/7',
  ])
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), SESSION_TOKEN)
  assert.equal(calls[0].init.headers.get('X-CSRF-Token'), null)
  assert.equal(typeof services.orientations.submit, 'undefined', 'saving schedules and locks; there is no separate submit')
})

test('demo adapter: saving schedules and locks, assigns the Ref #, To and the signed-in name', async () => {
  const restore = forbidBrowserStorage()
  try {
    const { client, services } = demoServices()
    const employees = await services.employees.search('employee 00')
    assert.ok(employees.items.every((item) => /^Sample Employee \d{3}$/.test(item.name)), 'fictional names only')
    assert.equal((await services.employees.search('30402')).items[0].name, 'Sample Employee 002', 'search by employee number')
    const form = { ...blankOrientation(), employeeId: '1', fromDate: '2026-11-01' }
    form.sessions = draftPlan('2026-11-01', form.sessions, HEADS)
    identifyDemoUser('Signed In User', client)
    const saved = await services.orientations.save(orientationPayload(form))
    assert.deepEqual([saved.scheduleNumber, saved.status, saved.toDate, saved.scheduledByName, saved.employee.name],
      ['ORT-2026-0001', 'SCHEDULED', '2026-11-04', 'Signed In User', 'Sample Employee 001'])
    await assert.rejects(client.put(`/hr/recruitment/orientation-schedules/${saved.scheduleId}`, orientationPayload(form)), (error) => error.status === 409, 'a saved schedule is read-only')
    await assert.rejects(services.orientations.save(orientationPayload(blankOrientation())), (error) => error.status === 422 && error.details.map((d) => d.field).join() === 'employeeId,fromDate,sessions')
    const clash = { ...form, sessions: { ...form.sessions, it: { ...form.sessions.hr } } }
    await assert.rejects(services.orientations.save(orientationPayload(clash)), (error) => error.status === 422 && error.details.some((d) => d.field === 'sessions.it'))
    identifyDemoUser('   ', client)
    const second = await services.orientations.save(orientationPayload({ ...form, employeeId: '2' }))
    assert.deepEqual([second.scheduleNumber, second.scheduledByName], ['ORT-2026-0002', 'Demo Scheduler'], 'no name: the demo default')
    assert.equal((await services.orientations.list()).pagination.total, 2)
  } finally {
    restore()
  }
})

// ------------------------------------------------------------ static checks

test('orientation page: flow step 4, searchable picker with listbox semantics, locked after save', async () => {
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
  assert.match(page, /<input \{\.\.\.fieldProps\('ori-to', \{ error: errors\.toDate, hint: T\.hints\.to \}\)\} className="ux-input zrv-hr-input" readOnly value=\{toDate \? enDate\(toDate\) : ''\}/, 'To is read-only')
  assert.match(page, /const locked = isOrientationLocked\(record\?\.status\)/)
  assert.match(page, /editor\.reject\(result\.firstStep/)
  assert.match(page, /role="group" aria-labelledby=\{titleId\}/, 'each session is a labelled group')
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

test('demo adapter: probation draft, server checks on save and submit, then locked', async () => {
  const { client, services } = demoServices()
  identifyDemoUser('Signed In Evaluator', client)
  const form = { ...withEmployee(blankProbation(), PROBATION_EMPLOYEE), scores: scoresFor(60) }
  await assert.rejects(services.probations.save(null, probationPayload({ ...form, scores: {} })), (error) => error.status === 422 && error.details.some((d) => d.field.startsWith('criterion:')))
  const draft = await services.probations.save(null, probationPayload(form))
  assert.deepEqual([draft.evaluationNumber, draft.status, draft.preparedByName, draft.employee.name], ['PAF-2026-0001', 'DRAFT', 'Signed In Evaluator', 'Sample Employee 005'])
  await assert.rejects(services.probations.submit(draft.evaluationId), (error) => error.status === 422 && error.details.map((d) => d.field).join() === 'recommendation,evaluatorSignature')
  const signed = { ...form, recommendation: 'CONFIRM', signatures: SIGNED }
  await services.probations.save(draft.evaluationId, probationPayload(signed))
  await assert.rejects(services.probations.submit(draft.evaluationId), (error) => error.status === 422 && error.details[0].field === 'justification', 'Confirm on Not acceptable needs a justification')
  await services.probations.save(draft.evaluationId, probationPayload({ ...signed, justification: 'Clear improvement in the last month' }))
  assert.equal((await services.probations.submit(draft.evaluationId)).status, 'SUBMITTED')
  await assert.rejects(services.probations.save(draft.evaluationId, probationPayload(signed)), (error) => error.status === 409)
  const list = await services.probations.list()
  assert.deepEqual([list.items[0].totalPoints, list.items[0].employeeName], [60, 'Sample Employee 005'])
})

test('probation page: banner title, radio groups, reused gauge, step 5 of the flow', async () => {
  assert.deepEqual(RECRUITMENT_FLOW.map((item) => item.id), ['requisition', 'interview', 'offer', 'orientation', 'probation'])
  const page = await read(`${FEATURE}probation/ProbationPage.jsx`)
  assert.match(page, /<span>\{T\.officialEn\}<\/span>\s*<span lang="ar" dir="rtl">\{T\.officialAr\}<\/span>/)
  assert.equal((page.match(/T\.officialEn/g) || []).length, 1, 'the official title appears only on the step-1 banner')
  assert.match(page, /<RadioCards name="pa-type"/)
  assert.match(page, /<RadioCards name="pa-rec"/)
  assert.match(page, /<Gauge total=\{totals\.total\} max=\{100\} bands=\{GAUGE_BANDS\}/)
  assert.match(page, /<EmployeePicker id="pa-emp"/)
  assert.match(page, /aria-label=\{T\.labels\.points\(criterion\.name, criterion\.points\)\}/)
  assert.match(page, /\{contradicts && \(/, 'the justification appears only when it contradicts the result')
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

// VITE_FEATURE_HR_RECRUITMENT controls the visibility of the onboarding pages
// (module HR_ONBOARDING); each state is resolved through the same function the
// application uses for this build. The three permission-backed recruitment
// forms are not switched.
const SWITCH = 'VITE_FEATURE_HR_RECRUITMENT'
const ONBOARDING_IDS = ['hr-orientation', 'hr-orientation-record', 'hr-probation', 'hr-probation-record', 'hr-periodwise-employees']
// The listed (sidebar and command palette) onboarding pages.
const ONBOARDING_NAV_IDS = ONBOARDING_IDS.filter((id) => !id.endsWith('-record'))
const onboardingFor = (env) => resolveNavigationEntries(registry.entries, env).filter((route) => ONBOARDING_IDS.includes(route.id))
const employee = { status: 'ready', mfaVerified: false, has: () => false }

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
    assert.deepEqual(onboardingFor(env).map((route) => route.implemented), ONBOARDING_IDS.map(() => visible), label)
  }
  assert.equal(isFeatureEnabled(undefined, {}), true, 'entries without a switch are unaffected')
  const switched = registry.entries.filter((entry) => entry.enabledBy).map((entry) => entry.id)
  assert.deepEqual(switched, ONBOARDING_IDS, 'only the onboarding pages are switched')
  assert.ok(registry.entries.filter((entry) => entry.enabledBy).every((entry) => entry.enabledBy.env === SWITCH))
  // The data source is a separate switch.
  assert.equal(resolveDemoMode({ [SWITCH]: 'true', DEV: false }), false, 'visible pages can use the real API')
})

test('a switched-off onboarding page is absent from the sidebar, command palette, guard and router', async () => {
  const off = resolveNavigationEntries(registry.entries, { [SWITCH]: 'false', DEV: true })
  const on = resolveNavigationEntries(registry.entries, { [SWITCH]: 'true' })
  const listed = (ids) => ids.filter((id) => ONBOARDING_IDS.includes(id))
  const sidebar = (routes) => authorizedNavigation(employee, routes).flatMap((section) => section.items.map((item) => item.id))
  const palette = (routes) => paletteCommands(employee, 'authenticated', routes).map((command) => command.id)
  assert.deepEqual(listed(sidebar(on)), ONBOARDING_NAV_IDS)
  assert.deepEqual(listed(sidebar(off)), [])
  assert.deepEqual(listed(palette(on)), ONBOARDING_NAV_IDS)
  assert.deepEqual(listed(palette(off)), [])
  assert.ok(!palette(on).some((id) => id.endsWith('-record')), 'record pages are not searchable')
  for (const id of ONBOARDING_IDS) {
    assert.equal(routeAccess(off.find((route) => route.id === id), employee), 'unavailable', `${id}: the guard renders Not found`)
    assert.equal(routeAccess(on.find((route) => route.id === id), employee), 'allowed', `${id}: allowed when on`)
  }
  // This (plain Node) build has the switch unset outside development: the router leaves the lines out.
  assert.deepEqual(implementedRoutes.filter((route) => ONBOARDING_IDS.includes(route.id)), [])
  const router = await read('../src/app/router.jsx')
  assert.match(router, /const implementedRouteIds = new Set\(implementedRoutes\.map\(\(route\) => route\.id\)\)/)
  assert.match(router, /children: implementedOnly\(\[/)
  for (const id of ONBOARDING_IDS) assert.ok(router.includes(`handle: { routeId: '${id}' }`), `${id} has a router line, filtered by implementedOnly`)
})

test('HR onboarding routes (switch on): session-only, record pages hidden, reachable by every signed-in user', () => {
  const module = registeredModules.find((item) => item.code === 'HR_ONBOARDING')
  assert.equal(module.rbac, false)
  const on = onboardingFor({ [SWITCH]: 'true' })
  assert.deepEqual(on.map((route) => [route.id, route.path, route.nav !== false]), [
    ['hr-orientation', '/hr/recruitment/orientation', true],
    ['hr-orientation-record', '/hr/recruitment/orientation/:scheduleId', false],
    ['hr-probation', '/hr/recruitment/probation-evaluation', true],
    ['hr-probation-record', '/hr/recruitment/probation-evaluation/:evaluationId', false],
    ['hr-periodwise-employees', '/hr/reports/periodwise-employees', true],
  ])
  for (const route of on) {
    assert.equal(route.permission, undefined)
    assert.equal(canAccessRoute(route, employee), true, route.id)
  }
  assert.equal(findAppRoute('/hr/recruitment/orientation/12')?.id, 'hr-orientation-record')
})
