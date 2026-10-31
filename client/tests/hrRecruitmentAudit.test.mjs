// Contract regressions found by the HR recruitment audit (docs/testing/hrms-recruitment-audit.md).
// Mocked client only: no Oracle, no browser storage. Every person is fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHrRecruitmentServices } from '../src/features/hr-recruitment/hrRecruitmentService.js'
import { blankInterview, interviewPayload, SPEC_KEYS, COMP_KEYS } from '../src/features/hr-recruitment/interview/interviewModel.js'

const FEATURE = new URL('../src/features/hr-recruitment/', import.meta.url)
const TODAY = '2026-10-28'

// Records every call; `routes` maps "METHOD path" to the response or a function of the call.
function fakeClient(routes) {
  const calls = []
  const handle = (method) => async (path, ...rest) => {
    const call = { method, path, body: method === 'POST' || method === 'PUT' ? rest[0] : undefined, options: method === 'GET' ? rest[0] ?? {} : rest[1] ?? {} }
    calls.push(call)
    const route = routes[`${method} ${path}`]
    if (route === undefined) throw new Error(`Unexpected ${method} ${path}`)
    return typeof route === 'function' ? route(call) : route
  }
  return { calls, get: handle('GET'), post: handle('POST'), put: handle('PUT'), delete: handle('DELETE') }
}

const services = (client) => createHrRecruitmentServices({ client })
const ratingSection = (count, ratePrefix, remarkPrefix) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  [`${ratePrefix}${index + 1}`, '4'], [`${remarkPrefix}${index + 1}`, '-'],
]).flat())

const INTERVIEW = Object.freeze({
  headerId: '700', intNo: 'IPP-0700', status: 'Incomplete', positionName: 'Quality Inspector', requisitionNo: 'PR-100',
  interviewDate: '28-Oct-26', division: 'Food', joining: null, interviewTime: '10:00', interviewType: 'Personal',
  candidateName: 'Test Applicant A', age: 30, nationality: 'Testland', materialStatus: 'Single', location: 'Test City',
  secondaryEducation: 'Degree', secondaryEducationChk: 'Yes', major: 'Testing', currentEmployer: 'Sample Co',
  lastPositionHeld: 'Inspector', relevantYearsExperience: 4, expSalBasic: null, expSalTotal: null, curSalBasic: null, curSalTotal: null,
  personalSpec: { ...ratingSection(SPEC_KEYS.length, 'rate', 'remark'), remarks: '-' },
  jobCompetency: { ...ratingSection(COMP_KEYS.length, 'cRating', 'cRemark'), cRemarks: '-', sumStrength: '-', sumWeekness: '-' },
  evaluation: { status: 'Passed', adminManager: 'Sample Manager A', managningDirector: 'Sample Director A', hrRep: 'Sample HR Rep A', deptRep: '-', comment: '-' },
  attribute3: '300000003618177', interviewedBy: 'Sample Interviewer A', interviewedBy2: '-', interviewedBy3: '-',
  updatedAt: '2026-10-28T08:00:00.000Z',
})

test('interview save sends the required position name and the admin manager entered on the form', async () => {
  const client = fakeClient({
    'POST /hr/interview-assessments': { data: { headerId: '700' } },
    'GET /hr/interview-assessments/700': { data: INTERVIEW },
  })
  const rated = (keys) => Object.fromEntries(keys.map((key) => [key, { rating: 4, remark: '' }]))
  const form = {
    ...blankInterview(TODAY), requisitionNumber: 'PR-100', divisionCode: 'Food', interviewTypeCode: 'Personal',
    candidateName: 'Test Applicant A', payroll: '300000003618177', spec: rated(SPEC_KEYS), comp: rated(COMP_KEYS),
    outcome: 'PASSED', adminManagerName: 'Sample Manager A',
  }
  await services(client).interviews.save(null, { ...interviewPayload(form), positionTitle: 'Quality Inspector' })
  const body = client.calls[0].body
  assert.equal(body.positionName, 'Quality Inspector')
  assert.equal(body.evaluation.adminManager, 'Sample Manager A')
})

test('interview records keep the managing director and HR representative so an update does not blank them', async () => {
  const client = fakeClient({ 'GET /hr/interview-assessments/700': { data: INTERVIEW } })
  const record = await services(client).interviews.getById('700')
  assert.equal(record.positionTitle, 'Quality Inspector')
  assert.equal(record.managingDirector, 'Sample Director A')
  assert.equal(record.hrRepresentative, 'Sample HR Rep A')
  assert.equal(record.adminManagerName, 'Sample Manager A')
})

test('the interview page passes the derived position and remark limits match the backend', async () => {
  const page = await readFile(new URL('interview/InterviewPage.jsx', FEATURE), 'utf8')
  assert.match(page, /\.\.\.interviewPayload\(form\), positionTitle: position/)
  assert.doesNotMatch(page, /maxLength=\{1000\}/)
})

const PROBATION = Object.freeze({
  headerId: '41', requestStatus: 'DRAFT', formDate: '28-Oct-26', evaluationPeriod: 'Q4', formType: 'Staff', empId: '9001',
  employeeNumber: 'E-9001', employeeName: 'Sample Employee 001', jobTitle: 'Clerk', grade: 3, department: 'Testing',
  fromDate: '01-Aug-26', toDate: '28-Oct-26', comment: '-', comments: '-', totalRating: 4,
  lines: [{ lineId: '1', param: 'Attendance', paramAr: '-', rating: 4 }, { lineId: '2', param: 'Teamwork', paramAr: '-', rating: 0 }],
})

test('probation reads a stored 0 as not rated and omits blank ratings on save', async () => {
  const client = fakeClient({
    'GET /hr/probation-evaluations/41': { data: PROBATION },
    'PUT /hr/probation-evaluations/41': { data: { headerId: '41' } },
  })
  const service = services(client).probations
  const record = await service.getById('41')
  assert.deepEqual(record.lines.map((line) => line.rating), [4, ''])
  await service.save('41', { ...record, lines: record.lines })
  const lines = client.calls.find((call) => call.method === 'PUT').body.lines
  assert.equal(lines[0].rating, 4)
  assert.equal('rating' in lines[1], false, 'the backend accepts only 1–5 and defaults an omitted rating to 0')
})

test('probation lookups load form types, employees and requestor from the API', async () => {
  const client = fakeClient({
    'GET /hr/probation-evaluations/lookups/form-types': { data: { formTypes: ['Staff', 'Worker'] } },
    'GET /hr/probation-evaluations/lookups/employees': { data: [{ userId: '9001', fullName: 'Sample Employee 001' }] },
    'GET /hr/probation-evaluations/lookups/requestor': { data: { fullName: 'Sample HR Head A' } },
  })
  const signal = new AbortController().signal
  const lookups = await services(client).probations.getLookups({ signal })
  assert.deepEqual(lookups.probation.formTypes.map((type) => type.code), ['Staff', 'Worker'])
  assert.equal(lookups.employees[0].name, 'Sample Employee 001')
  assert.ok(client.calls.every((call) => call.options.signal === signal))
})

const ORIENTATION_EMPLOYEE = Object.freeze({
  employeeId: '9002', employeeNumber: 'E-9002', name: 'Sample Employee 002', employmentType: 'Staff', startDate: '',
  section: 'Testing', division: 'Food', position: 'Clerk', grade: '', departmentName: 'Testing',
})
const ORIENTATION = Object.freeze({
  headerId: '55', reference: 'ORT-55', status: 'Draft', flag: 'Y', personId: '9002', empNo: 'E-9002', empname: 'Sample Employee 002',
  type: 'Staff', startDate: null, section: 'Testing', division: 'Food', position: 'Clerk', fromOrient: '2026-11-01', toOrient: '2026-11-01',
  orientationBy: 'Sample HR Head A', createdAt: '2026-10-28T08:00:00.000Z',
  lines: [{ lineId: '1', department: 'HR', departmentHead: 'Sample HR Head A', fromDate: '2026-11-01', toDate: '2026-11-01',
    orientationDays: 1, timeFrom: '08:00', timeTo: '10:00', orientationPeriod: '2.00 Hrs', remarks: '-' }],
})

test('orientation save omits an unknown joining date and lets the server recompute the period', async () => {
  const client = fakeClient({
    'PUT /hr/orientation-trainings/55': { data: { headerId: '55' } },
    'GET /hr/orientation-trainings/55': { data: ORIENTATION },
  })
  await services(client).orientations.save('55', {
    employee: ORIENTATION_EMPLOYEE, fromOrient: '2026-11-01', toOrient: '2026-11-01', orientationBy: '', flag: 'Y',
    lines: [{ ...ORIENTATION.lines[0], timeTo: '12:00' }],
  })
  const body = client.calls[0].body
  assert.equal('startDate' in body, false, 'Joi rejects an empty startDate')
  assert.equal(body.lines[0].orientationPeriod, '', 'a stale period would survive the time change')
})

test('orientation lookups load employees and managers from the API and the page forwards the abort signal', async () => {
  const client = fakeClient({
    'GET /hr/orientation-trainings/lookups/employees': { data: [{ personId: '9002', empNo: 'E-9002', fullName: 'Sample Employee 002', empType: 'Staff' }] },
    'GET /hr/orientation-trainings/lookups/managers': { data: [{ fullName: 'Sample HR Head A', empNo: 'E-9100' }] },
  })
  const signal = new AbortController().signal
  const lookups = await services(client).orientations.getLookups({ signal })
  assert.equal(lookups.employees[0].employeeNumber, 'E-9002')
  assert.equal(lookups.managers[0].name, 'Sample HR Head A')
  assert.ok(client.calls.every((call) => call.options.signal === signal))
  const page = await readFile(new URL('orientation/OrientationPage.jsx', FEATURE), 'utf8')
  assert.match(page, /loadLookups=\{\(signal\) => service\.getLookups\(\{ signal \}\)\}/)
})

test('requisition list converts the legacy creation date and the budget lookup sends a trimmed name', async () => {
  const client = fakeClient({
    'GET /hr/requisitions': {
      data: [{ requisitionId: '100020', requisitionNumber: 'PR-100', requisitionStatus: 'Draft', jobName: 'Inspector', deptName: 'Quality', creationDate: '28-Oct-26', lastUpdateDate: null }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false },
    },
  })
  const { items } = await services(client).requisitions.list()
  assert.equal(items[0].updatedAt, '2026-10-28')
  assert.ok(!Number.isNaN(Date.parse(items[0].updatedAt)))
  const page = await readFile(new URL('requisition/RequisitionPage.jsx', FEATURE), 'utf8')
  assert.match(page, /const budgetName = form\.replacementFor\.trim\(\)/)
})

test('interview lookups load nationalities, requisitions, interviewers and named payroll units from the API', async () => {
  const client = fakeClient({
    'GET /hr/interview-assessments/lookups/nationalities': { data: ['Testland'] },
    'GET /hr/interview-assessments/lookups/requisitions': { data: [{ requisitionNumber: 'PR-100', jobName: 'Quality Inspector' }] },
    'GET /hr/interview-assessments/lookups/employees': { data: ['Sample Interviewer A'] },
    'GET /hr/interview-assessments/lookups/payroll-units': { data: [{ code: '300000003618177', name: 'IPP' }, { code: '300000003618190', name: 'FPP' }] },
  })
  const signal = new AbortController().signal
  const lookups = await services(client).interviews.getLookups({ signal })
  assert.deepEqual(lookups.payrollBusinessUnits.map((unit) => unit.name), ['IPP', 'FPP'])
  assert.deepEqual(lookups.nationalities, ['Testland'])
  assert.equal(lookups.requisitions[0].requisitionNumber, 'PR-100')
  assert.deepEqual(lookups.employees, ['Sample Interviewer A'])
  assert.deepEqual(lookups.lookupErrors, [])
  assert.ok(client.calls.every((call) => call.options.signal === signal))
})

test('interview lookups report each failed lookup and still return the others', async () => {
  const client = fakeClient({
    'GET /hr/interview-assessments/lookups/nationalities': () => { throw new Error('offline') },
    'GET /hr/interview-assessments/lookups/requisitions': { data: [] },
    'GET /hr/interview-assessments/lookups/employees': { data: { unexpected: true } },
    'GET /hr/interview-assessments/lookups/payroll-units': { data: [{ code: '300000003618177', name: 'IPP' }] },
  })
  const lookups = await services(client).interviews.getLookups()
  assert.deepEqual([...lookups.lookupErrors], ['nationalities', 'employees'])
  assert.equal(lookups.payrollBusinessUnits.length, 1)
})

test('offer lookups load candidates, titles, business units and every allowance type from the API', async () => {
  const allowanceTypes = []
  const client = fakeClient({
    'GET /hr/employment-offers/lookups/candidates': { data: [{ headerId: '700', intNo: 'IPP-0700', candidateName: 'Test Applicant A', positionName: 'Quality Inspector', requisitionNo: 'PR-100' }] },
    'GET /hr/employment-offers/lookups/titles': { data: [{ meaning: 'Mr.', description: 'السيد' }] },
    'GET /hr/employment-offers/lookups/business-units': { data: { businessUnits: ['300000003618177'] } },
    'GET /hr/employment-offers/lookups/allowances': (call) => {
      allowanceTypes.push(call.options.params.type)
      return { data: [{ meaning: `${call.options.params.type} option`, description: '-' }] }
    },
  })
  const lookups = await services(client).offers.getLookups()
  assert.equal(lookups.candidates[0].candidateName, 'Test Applicant A')
  assert.equal(lookups.titles[0].meaning, 'Mr.')
  assert.deepEqual([...lookups.businessUnits], ['300000003618177'])
  assert.deepEqual(allowanceTypes.sort(), ['annual-vacation', 'contract-period', 'housing', 'medical', 'ticket', 'transportation'])
  assert.equal(lookups.allowances.housing[0].meaning, 'housing option')
  assert.equal(lookups.allowances.housing[0].description, '')
  assert.deepEqual(lookups.lookupErrors, [])
})

test('offer lookups mark an invalid business-unit response and a failed allowance as lookup errors', async () => {
  const client = fakeClient({
    'GET /hr/employment-offers/lookups/candidates': { data: [] },
    'GET /hr/employment-offers/lookups/titles': { data: [] },
    'GET /hr/employment-offers/lookups/business-units': { data: [] },
    'GET /hr/employment-offers/lookups/allowances': (call) => {
      if (call.options.params.type === 'medical') throw new Error('offline')
      return { data: [] }
    },
  })
  const lookups = await services(client).offers.getLookups()
  assert.deepEqual([...lookups.lookupErrors], ['businessUnits', 'allowance:medical'])
})

test('requisition lookups expose canManageTicket and the page shows the ticket selector only when it is true', async () => {
  const routes = (canManageTicket) => fakeClient({
    'GET /hr/requisitions/lookups/job-titles': { data: [] },
    'GET /hr/requisitions/lookups/departments': { data: [] },
    'GET /hr/requisitions/lookups/requestor': { data: { fullName: 'Sample Employee 001' } },
    'GET /hr/requisitions/lookups/replacement-for': { data: [] },
    'GET /hr/requisitions/lookups/capabilities': canManageTicket === undefined ? () => { throw new Error('offline') } : { data: { canManageTicket } },
  })
  assert.equal((await services(routes(true)).requisitions.getLookups()).capabilities.canManageTicket, true)
  assert.equal((await services(routes(false)).requisitions.getLookups()).capabilities.canManageTicket, false)
  const failed = await services(routes(undefined)).requisitions.getLookups()
  assert.equal(failed.capabilities.canManageTicket, false, 'hidden unless the backend confirms')
  assert.ok(failed.lookupErrors.includes('capabilities'))
  const page = await readFile(new URL('requisition/RequisitionPage.jsx', FEATURE), 'utf8')
  assert.match(page, /\{canSave && lookups\.capabilities\?\.canManageTicket && <HrField id="rq-ticket-status"/)
})

test('the recruitment loader and employee picker have no demo-only lookup or employee-search defaults', async () => {
  const loader = await readFile(new URL('shared/components/RecruitmentLoader.jsx', FEATURE), 'utf8')
  const picker = await readFile(new URL('shared/components/EmployeePicker.jsx', FEATURE), 'utf8')
  assert.match(loader, /param, load, loadLookups, demo = false,/)
  assert.doesNotMatch(loader + picker, /hrRecruitmentServices/)
  assert.equal('employees' in services(fakeClient({})), false)
})
