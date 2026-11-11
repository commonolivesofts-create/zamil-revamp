// Employee Clearance (form 1063): response contract, request body, client
// validation (mirrors the backend write schema), legacy rules (IT access-to
// kind, tab approvers), the service's requests, the sidebar entry by switch
// and permission, and source rules. Mocked: a recording client stands in for
// the API; no network, no Oracle.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { authorizedNavigation, resolveNavigationEntries } from '../src/config/appNavigation.js'
import { NAVIGATION_GROUPS, registry } from '../src/config/registry/index.js'
import {
  clearanceBody, readClearanceListItem, readClearancePage, readClearanceRecord, readDestinations,
} from '../src/features/hr-employee-services/clearance/clearanceContract.js'
import {
  DISABLED_UNTIL, IT_SUBJECTS, SECTIONS, blankClearance, returnedCount, sectionApprovers, validateClearance, withItAction,
} from '../src/features/hr-employee-services/clearance/clearanceModel.js'
import { createClearanceService } from '../src/features/hr-employee-services/clearance/clearanceService.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const ready = (keys) => {
  const set = new Set(keys)
  return { status: 'ready', mfaVerified: false, has: (key) => set.has(key) }
}
const VIEW = 'HR.EMPLOYEE_CLEARANCE:VIEW'
const MANAGERS = [{ name: 'Manager One', empNo: '9001' }, { name: 'Same Name', empNo: '9002' }, { name: 'Same Name', empNo: '9003' }]
const DESTINATIONS = [{ value: '1001', label: 'Employee A', kind: 'employee' }, { value: 'it', label: 'IT', kind: 'it' }, { value: 'none', label: 'No Computer', kind: 'none' }]

// A complete, valid form (fictitious values).
function validForm() {
  const form = blankClearance()
  form.employee = { employeeNumber: '1001', name: 'Employee A' }
  form.contact = ' 0500000000 '
  form.purpose = ' Annual vacation '
  form.vacationFrom = '2026-12-01'
  form.vacationTo = '2026-12-20'
  form.departmentManager = { name: 'Manager One', date: '', signature: '' }
  form.computerReceivedBy = 'it'
  form.itMatrix = IT_SUBJECTS.map(() => ({ action: 'no action', accessTo: '' }))
  return form
}

// The GET /hr/employee-clearance/:id shape of employee_clearance_service.js present().
const RECORD = {
  headerId: '42', referenceNo: 'DIV/26/042', empNo: 1001, empName: 'Employee A', jobTitle: 'Engineer', department: 'Quality', division: 'DIV',
  contact: '0500000000', purpose: 'Final exit', computerReturned: true, status: 'InProcess', createdBy: '7',
  vacationFrom: '2026-12-01', vacationTo: '2026-12-20',
  departmentManager: { name: 'Manager One', empNo: 9001, date: '2026-11-30', signature: 'Approved' },
  computerReceivedBy: 'it', computerSignature: 'Hold',
  itManager: { name: 'IT Lead', date: null, signature: 'bogus' },
  itMatrix: [
    { lineId: 1, subject: 'Email:', action: 'forward copy to', accessTo: 'Employee B' },
    { lineId: 2, subject: 'Oracle Access:', action: 'disabled untill', accessTo: '2027-01-15' },
    { lineId: 3, subject: 'Tel. Extension:', action: 'delete', accessTo: null },
    { lineId: 4, subject: 'Computer Data:', action: 'unknown', accessTo: 'x' },
  ],
  sections: {
    employeeDept: { items: ['files', 'book_manuals', 'not_a_column'], comments: null, cost: 12.5, approver: 'Direct Manager', signature: 'Approved' },
    quality: null,
    warehouse: { items: [], comments: 'ok', cost: null, approver: 'WH', signature: '' },
    accounts: { items: ['loans'], comments: '', cost: 0, approver: 'ACC', signature: 'Rejected' },
    admin: { items: ['bank_loan'], comments: '', cost: 99, approver: 'ADM', signature: '', appDate: '2026-11-01', visaExpiry: null },
  },
}

test('records: statuses, YYYY-MM-DD dates, five IT rows and known items only; unexpected data is refused', () => {
  const record = readClearanceRecord(RECORD)
  assert.equal(record.clearanceId, '42')
  assert.equal(record.status, 'INPROCESS')
  assert.equal(record.employee.employeeNumber, '1001')
  assert.equal(record.departmentManager.signature, 'Approved')
  assert.equal(record.itManager.signature, '', 'an unknown signature is blank')
  assert.equal(record.computerSignature, 'Hold')
  assert.equal(record.itMatrix.length, 5)
  assert.deepEqual(record.itMatrix.map((row) => row.action), ['forward copy to', DISABLED_UNTIL, 'delete', '', ''])
  assert.equal(record.itMatrix[1].accessTo, '2027-01-15')
  assert.deepEqual(record.sections.employeeDept.items, ['files', 'book_manuals'], 'unknown item codes are dropped')
  assert.equal(record.sections.employeeDept.cost, '12.5')
  assert.equal(record.sections.accounts.cost, '0')
  assert.deepEqual(record.sections.quality, { items: [], comments: '', cost: '', approver: '', signature: '' }, 'a missing tab is blank')
  assert.equal(record.sections.admin.cost, undefined, 'admin has no cost')
  assert.equal(record.sections.admin.appDate, '2026-11-01')
  assert.ok(Object.isFrozen(record) && Object.isFrozen(record.sections.employeeDept))
  assert.equal(readClearanceRecord({ ...RECORD, status: 'Approved' }).status, 'APPROVED')
  assert.throws(() => readClearanceRecord({ headerId: 'x' }), { code: 'INVALID_RESPONSE' })
  assert.throws(() => readDestinations({ items: [] }), { code: 'INVALID_RESPONSE' })
  assert.throws(() => readClearancePage({}), { code: 'INVALID_RESPONSE' })
  const row = readClearanceListItem({ headerId: 7, referenceNo: 'D/26/007', empNo: 1, empName: 'A', status: 'Inprocess', createdAt: '2026-11-03T21:00:00.000Z' })
  assert.equal(row.status, 'INPROCESS')
  assert.equal(row.createdAt, '2026-11-03')
})

test('request body: the backend write schema, trimmed text, null blanks, cost only where it exists', () => {
  const form = validForm()
  form.sections.employeeDept.items = ['files']
  form.sections.employeeDept.cost = '15'
  form.sections.admin.visaExpiry = '2027-03-01'
  const body = clearanceBody(form)
  assert.deepEqual(body.employee, { empNo: 1001 })
  assert.equal(body.contact, '0500000000')
  assert.equal(body.purpose, 'Annual vacation')
  assert.deepEqual(body.departmentManager, { name: 'Manager One', date: null, signature: '' })
  assert.deepEqual(body.itManager, { name: '', date: null, signature: '' })
  assert.equal(body.itMatrix.length, 5)
  assert.deepEqual(Object.keys(body.sections), ['employeeDept', 'quality', 'warehouse', 'accounts', 'admin'])
  assert.equal(body.sections.employeeDept.cost, 15)
  assert.equal(body.sections.quality.cost, null)
  assert.equal('cost' in body.sections.admin, false)
  assert.deepEqual([body.sections.admin.appDate, body.sections.admin.visaExpiry], [null, '2027-03-01'])
  for (const key of ['referenceNo', 'status', 'empName', 'jobTitle', 'department', 'division']) assert.equal(key in body, false, `${key} is a server value`)
})

test('validation: legacy required fields, date order, IT actions and the department manager lookup', () => {
  const lookups = { managers: MANAGERS, destinations: DESTINATIONS }
  assert.deepEqual(validateClearance(validForm(), lookups), [])
  const fields = (form) => validateClearance(form, lookups).map((problem) => problem.field)

  const blank = blankClearance()
  assert.deepEqual(fields(blank), ['employee', 'contact', 'purpose', 'it:0', 'it:1', 'it:2', 'it:3', 'it:4', 'departmentManager', 'computerReceivedBy'])
  assert.deepEqual(validateClearance(blank, lookups).map((problem) => problem.step), [0, 0, 0, 1, 1, 1, 1, 1, 2, 2], 'problems come in step order')

  const order = validForm()
  order.vacationTo = '2026-11-30'
  assert.deepEqual(fields(order), ['vacationTo'])

  const it = validForm()
  it.itMatrix[0] = { action: DISABLED_UNTIL, accessTo: '' }
  it.itMatrix[1] = { action: 'copy give to', accessTo: '2026-12-01' }
  assert.deepEqual(fields(it), ['it:0', 'it:1'], 'Disabled Untill needs a date; other actions take a name')

  const unknown = validForm()
  unknown.departmentManager.name = 'Typed Name'
  assert.deepEqual(fields(unknown), ['departmentManager'])
  const ambiguous = validForm()
  ambiguous.departmentManager.name = 'Same Name'
  assert.match(validateClearance(ambiguous, lookups)[0].message, /cannot tell them apart/)

  const receiver = validForm()
  receiver.computerReceivedBy = 'Some Name'
  assert.deepEqual(fields(receiver), ['computerReceivedBy'])

  const cost = validForm()
  cost.sections.warehouse.cost = '-1'
  assert.deepEqual(validateClearance(cost, lookups).map((problem) => [problem.field, problem.step]), [['warehouse:cost', 3]])
})

test('legacy rules: access-to kind follows the action; tab approvers come from the employee and the lookups', () => {
  assert.deepEqual(withItAction({ action: 'forward copy to', accessTo: 'Employee B' }, 'copy give to'), { action: 'copy give to', accessTo: 'Employee B' })
  assert.deepEqual(withItAction({ action: 'forward copy to', accessTo: 'Employee B' }, DISABLED_UNTIL), { action: DISABLED_UNTIL, accessTo: '' })
  assert.deepEqual(withItAction({ action: DISABLED_UNTIL, accessTo: '2027-01-01' }, 'delete'), { action: 'delete', accessTo: '' })
  assert.deepEqual(withItAction({ action: '', accessTo: '' }, 'delete'), { action: 'delete', accessTo: '' })

  const approvers = { quality: [{ name: 'Q1' }, { name: 'Q2' }], warehouse: [{ name: 'W1' }], accounts: [], admin: [{ name: 'A1' }] }
  assert.deepEqual(sectionApprovers({ directManager: 'Direct Manager' }, approvers),
    { employeeDept: 'Direct Manager', quality: 'Q1', warehouse: 'W1', accounts: '', admin: 'A1' })
  assert.equal(sectionApprovers(null, approvers).employeeDept, '')

  const form = blankClearance()
  form.sections.employeeDept.items = ['files', 'tools']
  form.sections.admin.items = ['iqama']
  assert.equal(returnedCount(form.sections), 3)
  assert.deepEqual(SECTIONS.map((section) => section.items.length), [12, 4, 2, 2, 9], 'the legacy checkbox count of each tab')
})

test('service: the API paths, scoped and all-employee lookups, list filters, create then reload', async () => {
  const calls = []
  const respond = (method, path, options) => {
    if (path === '/hr/employee-clearance/lookups/computer-destinations') return DESTINATIONS
    if (path === '/hr/employee-clearance/lookups/approvers') return { section: options.params.section, items: [{ name: `${options.params.section} approver`, empNo: 1, userId: 2 }] }
    if (path === '/hr/employee-clearance/lookups/employees') return { page: 1, pageSize: 25, total: 1, items: [{ empNo: 1001, fullName: 'Employee A', jobTitle: 'Engineer', department: 'Quality' }] }
    if (path === '/hr/employee-clearance/lookups/employees/1001') return { empNo: 1001, fullName: 'Employee A', directManager: 'Direct Manager' }
    if (path === '/hr/employee-clearance' && method === 'GET') return { page: 1, pageSize: 20, total: 1, items: [{ headerId: '42', status: 'Draft' }] }
    if (path === '/hr/employee-clearance' && method === 'POST') return { headerId: '42', referenceNo: 'DIV/26/042', status: 'Draft' }
    if (path === '/hr/employee-clearance/42') return method === 'GET' ? RECORD : { headerId: '42', updated: true }
    throw new Error(`unexpected ${method} ${path}`)
  }
  const call = (method) => async (path, ...rest) => {
    const options = method === 'GET' ? rest[0] ?? {} : rest[1] ?? {}
    calls.push({ method, path, params: options.params, body: method === 'GET' ? undefined : rest[0] })
    return { data: respond(method, path, options) }
  }
  const service = createClearanceService({ client: { get: call('GET'), post: call('POST'), put: call('PUT') } })

  const lookups = await service.getLookups()
  assert.deepEqual(Object.keys(lookups.approvers), ['department', 'quality', 'warehouse', 'accounts', 'admin'])
  assert.equal(lookups.destinations.length, 3)

  const scoped = await service.searchEmployees(' emp ')
  assert.deepEqual(calls.at(-1).params, { scope: 'scoped', q: 'emp', pageSize: 25 })
  assert.equal(scoped.items[0].position, 'Engineer')
  await service.searchAllEmployees('emp')
  assert.equal(calls.at(-1).params.scope, 'all')
  assert.equal((await service.employeeDetails('1001')).directManager, 'Direct Manager')

  const page = await service.list({ page: 2, pageSize: 20, status: '', q: 'A', createdFrom: '2026-01-01', department: '' })
  assert.deepEqual(calls.at(-1).params, { page: 2, pageSize: 20, status: 'ALL', q: 'A', createdFrom: '2026-01-01' }, 'blank filters are left out')
  assert.equal(page.items[0].status, 'DRAFT')

  const created = await service.save(null, validForm())
  assert.deepEqual(calls.slice(-2).map((item) => [item.method, item.path]), [['POST', '/hr/employee-clearance'], ['GET', '/hr/employee-clearance/42']])
  assert.equal(created.referenceNo, 'DIV/26/042')
  await service.save('42', validForm())
  assert.deepEqual(calls.slice(-2).map((item) => [item.method, item.path]), [['PUT', '/hr/employee-clearance/42'], ['GET', '/hr/employee-clearance/42']])
  await assert.rejects(service.getById('../1'), { code: 'INVALID_ID' })
})

test('sidebar: the form appears in Talent Management only with its switch on AND the backend VIEW permission', () => {
  const entries = (env) => resolveNavigationEntries(registry.entries, env)
  const items = (env, keys) => authorizedNavigation(ready(keys), entries(env))
    .flatMap((section) => section.items).filter((item) => item.id.startsWith('hr-clearance')).map((item) => item.id)
  const on = { VITE_FEATURE_HR_EMPLOYEE_CLEARANCE: 'true', DEV: false }
  assert.deepEqual(items(on, [VIEW]), ['hr-clearance'], 'the report and record pages are reached from the form')
  assert.deepEqual(items(on, []), [], 'no permission, no entry')
  assert.deepEqual(items({ VITE_FEATURE_HR_EMPLOYEE_CLEARANCE: 'false', DEV: true }, [VIEW]), [])
  assert.deepEqual(items({ DEV: false }, [VIEW]), [], 'unset is off in production builds')
  assert.deepEqual(items({ DEV: true }, [VIEW]), ['hr-clearance'], 'unset is on in development builds')
  const route = entries(on).find((item) => item.id === 'hr-clearance')
  assert.equal(route.subgroup, 'hr-talent-management')
  assert.ok(NAVIGATION_GROUPS.find((group) => group.id === route.section).subgroups.some((group) => group.id === route.subgroup))
  assert.deepEqual(registry.permissions.filter((item) => item.key.startsWith('HR.EMPLOYEE_CLEARANCE:')).map((item) => item.key),
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((action) => `HR.EMPLOYEE_CLEARANCE:${action}`))
})

test('source: live API only, no browser storage, routed, permission-gated writes, legacy create-screen locks', async () => {
  const dir = new URL('../src/features/hr-employee-services/clearance/', import.meta.url)
  const files = await readdir(dir)
  assert.deepEqual(files.sort(), ['ClearancePage.jsx', 'ClearanceReportPage.jsx', 'clearanceContract.js', 'clearanceModel.js', 'clearanceService.js'])
  for (const file of files) {
    const source = await readFile(new URL(file, dir), 'utf8')
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, file)
    assert.doesNotMatch(source, /\/demo\/|DemoClient|DemoData/, `${file}: no demo data`)
  }
  const service = await read('../src/features/hr-employee-services/clearance/clearanceService.js')
  assert.match(service, /createClearanceService\(\{ client: apiClient \}\)/)
  const page = await read('../src/features/hr-employee-services/clearance/ClearancePage.jsx')
  assert.match(page, /permissions\.can\(`\$\{PERMISSION\}:\$\{record \? 'UPDATE' : 'CREATE'\}`\)/)
  assert.match(page, /disabled=\{!saved\}/, 'the tabs and signatures stay disabled until the first save')
  const router = await read('../src/app/router.jsx')
  for (const path of ['hr/talent-management/clearance', 'hr/talent-management/clearance/report', 'hr/talent-management/clearance/:clearanceId']) {
    assert.ok(router.includes(`path: '${path}'`), path)
  }
})
