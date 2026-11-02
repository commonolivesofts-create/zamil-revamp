// DEMO ADAPTER ONLY: an in-memory /hr/employee-of-the-month with the backend's
// response shapes and rules (criteria per department, the A/AS/BS/CS scale,
// employee details checked against the master, no self-nomination, edits only
// while DRAFT or REJECTED, PROD-/SS- request numbers, standard pagination).
// Fictional people only.
import { clone, containsText, createDemoTransport } from './formsDemoKit.js'

const LABELS = Object.freeze({
  production: ['Adherence to Core Values', 'Demonstrates Excellence in Production', 'Demonstrate Excellence in Quality - Production',
    'Demonstrate Excellence in Overall Work Performance'],
  'shared-services': ['Adherence to Core Values', 'Demonstrate Excellence in Cost Managemnet',
    'Demonstrate Excellence in Dealing with Internal and External Customers', 'Demonstrate Excellence in Overall Work Performance',
    'Innovation', 'Process Adherence'],
})
const SCALE = [{ code: 'A', label: 'At Standard' }, { code: 'AS', label: 'Above Standard' }, { code: 'BS', label: 'Below Standard' }, { code: 'CS', label: 'Close to Standard' }]
const CODES = SCALE.map((item) => item.code)

export const DEMO_REWARD_REQUESTOR = Object.freeze({ employeeNumber: '9100', fullName: 'Demo Requester', email: 'requester@example.invalid' })
export const DEMO_REWARD_EMPLOYEES = Object.freeze([
  { employeeNumber: '9100', fullName: 'Demo Requester', email: 'requester@example.invalid', position: 'HR Officer', department: 'HR Department', personId: 1 },
  { employeeNumber: '9101', fullName: 'Sample Employee 001', email: 'employee001@example.invalid', position: 'Injection Operator', department: 'Injection Department', personId: 2 },
  { employeeNumber: '9102', fullName: 'Sample Employee 002', email: 'employee002@example.invalid', position: 'Line Supervisor', department: 'Assembly Department', personId: 3 },
  { employeeNumber: '9103', fullName: 'Sample Employee 003', email: 'employee003@example.invalid', position: 'Accountant', department: 'Finance Department', personId: 4 },
  { employeeNumber: '9104', fullName: 'Sample Employee 004', email: 'employee004@example.invalid', position: 'IT Supervisor', department: 'IT Department', personId: 5 },
  { employeeNumber: '9105', fullName: 'Sample Employee 005', email: '', position: 'Packer', department: 'Assembly Department', personId: 6 },
].map(Object.freeze))

const line = (rating) => ({ rating, remark: 'Demo evidence for this criterion.' })
export function createDemoRewardRecords() {
  return [
    { headerId: 3, department: 'Production', employee: '9102', activityDate: '2026-10-31', overallRating: 'AS', remark: 'Demo remark.', status: 'INPROCESS', createdAt: '2026-10-28T09:10:00', lines: ['AS', 'AS', 'A', 'AS'].map(line) },
    { headerId: 2, department: 'Shared-services', employee: '9103', activityDate: '2026-09-30', overallRating: 'A', remark: 'Demo remark.', status: 'APPROVED', createdAt: '2026-09-25T11:00:00', lines: ['A', 'AS', 'A', 'A', 'CS', 'A'].map(line) },
    { headerId: 1, department: 'Production', employee: '9101', activityDate: '2026-09-30', overallRating: 'A', remark: 'Demo remark.', status: 'DRAFT', createdAt: '2026-09-24T08:30:00', lines: ['A', 'A', 'BS', 'A'].map(line) },
  ]
}

const canonical = (value) => (value === 'Production' || value === 'production' ? 'production' : 'shared-services')
const stored = (department) => (department === 'production' ? 'Production' : 'Shared-services')
const SORT = Object.freeze({ headerId: 'headerId', requestNo: 'requestNo', employeeName: 'employeeName', activityDate: 'activityDate', status: 'status', createdAt: 'createdAt' })

export function createRewardDemoClient({ latencyMs = 300, now = () => new Date(), records = createDemoRewardRecords(), employees = DEMO_REWARD_EMPLOYEES, requestor = DEMO_REWARD_REQUESTOR } = {}) {
  const store = clone(records)
  const employeeOf = (number) => employees.find((item) => item.employeeNumber === String(number)) ?? null
  const requestNo = (record) => `${record.department === 'Production' ? 'PROD' : 'SS'}-${String(record.headerId).padStart(4, '0')}`
  const detail = (record) => {
    const employee = employeeOf(record.employee)
    const department = canonical(record.department)
    return {
      headerId: record.headerId, uuid: `demo-${record.headerId}`, requestNo: requestNo(record), department: record.department,
      employeeNumber: employee.employeeNumber, employeeName: employee.fullName, employeeEmail: employee.email,
      employeePosition: employee.position, employeeDepartment: employee.department, activityDate: record.activityDate,
      overallRating: record.overallRating, remark: record.remark, status: record.status, createdBy: '1',
      createdByEmpNum: requestor.employeeNumber, createdAt: record.createdAt, updatedBy: null,
      lines: LABELS[department].map((criterion, index) => ({
        lineNumber: index, criterion, rating: record.lines[index]?.rating ?? null, remark: record.lines[index]?.remark ?? null,
      })),
    }
  }
  const listItem = (record) => {
    const item = detail(record)
    const ratings = Object.fromEntries(CODES.map((code) => [code, record.lines.filter((value) => value.rating === code).length]))
    return {
      headerId: item.headerId, requestNo: item.requestNo, department: item.department, employeeNumber: item.employeeNumber,
      employeeName: item.employeeName, employeePosition: item.employeePosition, employeeDepartment: item.employeeDepartment,
      activityDate: item.activityDate, overallRating: item.overallRating, remark: item.remark, ratings, status: item.status,
      requestor: requestor.fullName, createdAt: item.createdAt,
    }
  }
  const find = (id, fail) => store.find((record) => String(record.headerId) === id) ?? fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found')

  // The backend's validation order and error codes.
  function prepare(body, fail, old) {
    const department = body?.department
    if (!LABELS[department]) fail(400, 'INVALID_DEPARTMENT', 'Invalid department')
    if (old && canonical(old.department) !== department) fail(400, 'INVALID_DEPARTMENT', 'Department cannot be changed')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.activityDate ?? '')) fail(400, 'INVALID_DATE', 'Invalid activity date')
    if (!CODES.includes(body.overallRating)) fail(400, 'INVALID_RATING', 'Invalid overall rating')
    if (!String(body.remark ?? '').trim()) fail(400, 'REQUIRED_FIELD', 'Remark is required')
    const lines = body.lines ?? []
    if (lines.length !== LABELS[department].length || lines.some((item, index) => item.lineNumber !== index)) {
      fail(400, 'INVALID_LINE_COUNT', 'Invalid criterion lines')
    }
    for (const item of lines) {
      if (!CODES.includes(item.rating)) fail(400, 'INVALID_RATING', 'Invalid line rating')
      if (!String(item.remark ?? '').trim()) fail(400, 'REQUIRED_FIELD', 'Line remark is required')
      if (item.remark.length > 500) fail(400, 'LINE_REMARK_TOO_LONG', 'Line remark must not exceed 500 characters')
    }
    const sent = body.employee ?? {}
    for (const key of ['number', 'name', 'email', 'position', 'departmentName']) {
      if (!String(sent[key] ?? '')) fail(400, 'REQUIRED_FIELD', 'Validation failed', [{ field: `employee.${key}`, message: `"employee.${key}" is not allowed to be empty` }])
    }
    const employee = employeeOf(sent.number)
    if (!employee) fail(400, 'INVALID_EMPLOYEE', 'Employee is not active or does not exist')
    if (sent.name !== employee.fullName || sent.email !== employee.email || sent.position !== employee.position || sent.departmentName !== employee.department) {
      fail(400, 'EMPLOYEE_DATA_MISMATCH', 'Employee details do not match the master')
    }
    if (employee.employeeNumber === requestor.employeeNumber) fail(400, 'SELF_NOMINATION_NOT_ALLOWED', 'Self nomination is not allowed')
    return {
      department: stored(department), employee: employee.employeeNumber, activityDate: body.activityDate, overallRating: body.overallRating,
      remark: body.remark, lines: lines.map((item) => ({ rating: item.rating, remark: item.remark })),
    }
  }

  return createDemoTransport({
    latencyMs,
    routes: [
      [/^\/hr\/employee-of-the-month\/lookups\/criteria$/, {
        get: ({ params, respond, fail }) => (LABELS[params.department]
          ? respond({ department: params.department, criteria: LABELS[params.department].map((criterion, lineNumber) => ({ lineNumber, criterion })), ratingScale: SCALE })
          : fail(400, 'INVALID_DEPARTMENT', 'Invalid department')),
      }],
      [/^\/hr\/employee-of-the-month\/lookups\/requestor$/, { get: ({ respond }) => respond(requestor) }],
      [/^\/hr\/employee-of-the-month\/lookups\/employees$/, {
        get: ({ params, respond }) => respond(employees.filter((item) =>
          (!params.empNo || containsText(item.employeeNumber, params.empNo)) && (!params.name || containsText(item.fullName, params.name)) &&
          (!params.email || containsText(item.email, params.email))).slice(0, Number(params.limit) || 50)),
      }],
      [/^\/hr\/employee-of-the-month$/, {
        get: ({ params, respond, paginate }) => {
          const page = Number(params.page) || 1
          const pageSize = Math.min(100, Number(params.pageSize) || 25)
          const rows = store.map(listItem).filter((item) =>
            (!params.status || item.status === params.status) &&
            (!params.department || canonical(item.department) === params.department) &&
            (!params.employeeNumber || item.employeeNumber === params.employeeNumber) &&
            (!params.date_from || item.activityDate >= params.date_from) && (!params.date_to || item.activityDate <= params.date_to) &&
            (!params.search || [item.requestNo, item.employeeName, item.employeePosition, item.employeeDepartment, item.employeeNumber].some((value) => containsText(value, params.search))))
          const key = SORT[params.sort] ?? 'createdAt'
          const direction = params.order === 'asc' ? 1 : -1
          rows.sort((a, b) => (String(a[key]) < String(b[key]) ? -direction : String(a[key]) > String(b[key]) ? direction : b.headerId - a.headerId))
          const { items, pagination } = paginate(rows, page, pageSize)
          return respond(items, { pagination })
        },
        post: ({ body, respond, fail }) => {
          const record = { ...prepare(body, fail), headerId: Math.max(0, ...store.map((item) => item.headerId)) + 1, status: 'DRAFT', createdAt: now().toISOString().slice(0, 19) }
          store.unshift(record)
          return respond(detail(record), { status: 201 })
        },
      }],
      [/^\/hr\/employee-of-the-month\/([1-9][0-9]*)$/, {
        get: ({ match, respond, fail }) => respond(detail(find(match[1], fail))),
        put: ({ match, body, respond, fail }) => {
          const record = find(match[1], fail)
          if (record.status === 'INPROCESS') fail(409, 'CONFLICT', 'Cannot update nomination while it is In Process')
          if (!['DRAFT', 'REJECTED'].includes(record.status)) fail(409, 'CONFLICT', 'Cannot update nomination in its current status')
          Object.assign(record, prepare(body, fail, record))
          return respond(detail(record))
        },
      }],
    ],
  })
}
