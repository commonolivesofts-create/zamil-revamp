// HR onboarding screens of the HR_RECRUITMENT feature: Orientation Schedule
// (form 1101). Business rules, response contracts, services over the shared API
// client (mocked transport), the owner-approved in-memory demo adapter and
// static checks of the JSX. No backend, Oracle or browser storage is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createApiClient } from '../src/services/api/apiClient.js'
import { createCsrfStore } from '../src/services/api/csrfStore.js'
import { readEmployee, readLookups, readOrientation } from '../src/features/hr-recruitment/hrRecruitmentContract.js'
import { createHrRecruitmentServices, identifyDemoUser } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { createDemoClient } from '../src/features/hr-recruitment/demo/demoClient.js'
import { DEMO_EMPLOYEES, DEMO_LOOKUPS } from '../src/features/hr-recruitment/demo/demoData.js'
import { RECRUITMENT_FLOW } from '../src/features/hr-recruitment/shared/recruitmentFlow.js'
import {
  SESSION_KEYS, addWorkdays, blankOrientation, calendarDays, draftPlan, formatHours, isOrientationLocked, isWeekend, nextWorkday,
  orientationFormFromRecord, orientationPayload, plannedCount, scheduleIssues, scheduleToDate, sessionDays, sessionHours, totalHours,
  validateOrientation,
} from '../src/features/hr-recruitment/orientation/orientationModel.js'
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
  const sources = await Promise.all([`${FEATURE}demo/demoData.js`, `${FEATURE}hrRecruitmentText.js`, `${FEATURE}orientation/orientationModel.js`].map(read))
  for (const source of sources) assert.equal(/['"][A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)*, [A-Z][a-z]+['"]/.test(source), false, 'no "SURNAME, Firstname" literals')
})
