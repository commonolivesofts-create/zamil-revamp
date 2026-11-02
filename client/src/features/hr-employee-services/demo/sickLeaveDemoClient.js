// DEMO ADAPTER ONLY: an in-memory /hr/sick-leave with the backend's response
// shapes and rules (self and direct reports only, the fixed "Sick Leave" type,
// the server's day calculation with half days, at least one attachment on
// create, edits and attachment changes only while Draft or REJECTED,
// { items, page, pageSize, total } lists). Files keep their name only; nothing
// is uploaded. Fictional people only.
import { businessToday } from '../../hr-recruitment/shared/hrFormat.js'
import { clone, containsText, createDemoTransport } from './formsDemoKit.js'

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'txt', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'csv', 'html', 'ppt', 'pptx', 'odt', 'xml']
const DAY = 86400000

export const DEMO_SICK_LEAVE_SELF = '9200'
export const DEMO_SICK_LEAVE_EMPLOYEES = Object.freeze([
  { empNumber: '9200', empName: 'Demo Requester', department: 'Assembly Department' },
  { empNumber: '9201', empName: 'Sample Employee 011', department: 'Assembly Department' },
  { empNumber: '9202', empName: 'Sample Employee 012', department: 'Assembly Department' },
].map(Object.freeze))

export function createDemoSickLeaveRecords() {
  return [
    { headerId: 3, empId: '9201', fromDate: '2026-10-19', toDate: '2026-10-23', fromDayType: 'FULL', toDayType: 'FULL', comments: 'Demo: surgery and recovery.', status: 'INPROCESS', createdAt: '2026-10-18T07:30:00.000Z', attachments: [{ attachmentId: 31, fileName: 'certificate-demo.pdf', attachedOn: '2026-10-18' }] },
    { headerId: 2, empId: '9200', fromDate: '2026-10-05', toDate: '2026-10-06', fromDayType: 'FULL', toDayType: 'HALF', comments: 'Demo: fever.', status: 'APPROVED', createdAt: '2026-10-07T06:00:00.000Z', attachments: [{ attachmentId: 21, fileName: 'clinic-note-demo.jpg', attachedOn: '2026-10-07' }] },
    { headerId: 1, empId: '9202', fromDate: '2026-10-27', toDate: '2026-10-27', fromDayType: 'FULL', toDayType: 'FULL', comments: 'Demo: medical appointment.', status: 'Draft', createdAt: '2026-10-27T05:45:00.000Z', attachments: [{ attachmentId: 11, fileName: 'appointment-demo.pdf', attachedOn: '2026-10-27' }] },
  ]
}

// The backend's calculation (both endpoints inclusive, half days count 0.5).
function days({ fromDate, toDate, fromDayType, toDayType }) {
  const start = Date.parse(`${fromDate}T00:00:00Z`)
  const end = Date.parse(`${toDate}T00:00:00Z`)
  if (fromDate === toDate) return fromDayType === 'HALF' ? 0.5 : 1
  return Math.round((end - start) / DAY) + 1 - (fromDayType === 'HALF' ? 0.5 : 0) - (toDayType === 'HALF' ? 0.5 : 0)
}

const fieldsOf = (body) => (typeof FormData !== 'undefined' && body instanceof FormData
  ? { fields: Object.fromEntries([...body.entries()].filter(([, value]) => typeof value === 'string')), files: body.getAll('files') }
  : { fields: body ?? {}, files: [] })

export function createSickLeaveDemoClient({ latencyMs = 300, now = () => new Date(), records = createDemoSickLeaveRecords(), employees = DEMO_SICK_LEAVE_EMPLOYEES } = {}) {
  const store = clone(records)
  let nextAttachment = 100
  const employeeOf = (number) => employees.find((item) => item.empNumber === String(number)) ?? null
  const editable = (record) => ['Draft', 'REJECTED'].includes(record.status)
  const item = (record) => ({
    headerId: record.headerId, empId: record.empId, empName: employeeOf(record.empId).empName, leaveType: 'Sick Leave',
    fromDate: record.fromDate, toDate: record.toDate, days: days(record), status: record.status, createdAt: record.createdAt, pendingAt: null,
  })
  const find = (id, fail) => store.find((record) => String(record.headerId) === id) ?? fail(404, 'NOT_FOUND', 'Sick leave request not found')
  const invalid = (fail, field, message) => fail(400, 'VALIDATION_ERROR', 'Validation failed', [{ field, message }])
  const checkFiles = (files, fail) => {
    if (!files.length) invalid(fail, 'files', 'At least one attachment is required')
    for (const file of files) {
      if (!EXTENSIONS.includes(String(file.name).split('.').pop().toLowerCase()) || !file.size) invalid(fail, 'files', 'Invalid attachment')
    }
  }
  const attach = (record, files) => files.map((file) => {
    const saved = { attachmentId: nextAttachment++, fileName: String(file.name).replace(/[^A-Za-z0-9._-]/g, '_'), attachedOn: businessToday(now()) }
    record.attachments.push(saved)
    return { attachmentId: saved.attachmentId, fileName: saved.fileName }
  })
  function prepare(fields, fail) {
    for (const key of ['empNumber', 'fromDate', 'toDate', 'fromDayType', 'toDayType', 'comments']) {
      if (!String(fields[key] ?? '').trim()) invalid(fail, key, `"${key}" is required`)
    }
    if (fields.leaveType && fields.leaveType !== 'Sick Leave') invalid(fail, 'leaveType', '"leaveType" must be [Sick Leave]')
    if (!['FULL', 'HALF'].includes(fields.fromDayType) || !['FULL', 'HALF'].includes(fields.toDayType)) invalid(fail, 'dates', 'Invalid day type')
    if (fields.toDate < fields.fromDate) invalid(fail, 'dates', 'toDate must not be before fromDate')
    if (fields.fromDate === fields.toDate && fields.fromDayType !== fields.toDayType) invalid(fail, 'dates', 'Single-date day types must match')
    if (!employeeOf(fields.empNumber)) fail(404, 'NOT_FOUND', 'Employee not found')
    return {
      empId: String(fields.empNumber), fromDate: fields.fromDate, toDate: fields.toDate, fromDayType: fields.fromDayType,
      toDayType: fields.toDayType, comments: fields.comments.trim(),
    }
  }

  return createDemoTransport({
    latencyMs,
    routes: [
      [/^\/hr\/sick-leave\/lookups\/employees$/, {
        get: ({ params, respond }) => respond(employees.filter((employee) => !params.q || containsText(employee.empName, params.q) || containsText(employee.empNumber, params.q))),
      }],
      [/^\/hr\/sick-leave\/lookups\/employees\/([^/]+)$/, {
        get: ({ match, respond, fail }) => respond(employeeOf(decodeURIComponent(match[1])) ?? fail(404, 'NOT_FOUND', 'Employee not found')),
      }],
      [/^\/hr\/sick-leave$/, {
        get: ({ params, respond }) => {
          const page = Number(params.page) || 1
          const pageSize = Math.min(100, Number(params.pageSize) || 25)
          const status = String(params.status ?? 'ALL').toUpperCase()
          const rows = store.map(item).filter((row) =>
            (status === 'ALL' || row.status.toUpperCase() === status) && (!params.from || row.toDate >= params.from) && (!params.to || row.fromDate <= params.to) &&
            (!params.empId || containsText(row.empId, params.empId)) && (!params.empName || containsText(row.empName, params.empName)) &&
            (params.mine !== 'true' || row.empId === DEMO_SICK_LEAVE_SELF))
            .sort((a, b) => b.headerId - a.headerId)
          // The demo user is HR: each row carries the employee's total within the filter.
          const totals = (empId) => rows.filter((row) => row.empId === empId).reduce((sum, row) => sum + row.days, 0)
          return respond({ items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ ...row, totalLeaveDays: totals(row.empId) })), page, pageSize, total: rows.length })
        },
        post: ({ body, respond, fail }) => {
          const { fields, files } = fieldsOf(body)
          checkFiles(files, fail)
          const record = { ...prepare(fields, fail), headerId: Math.max(0, ...store.map((row) => row.headerId)) + 1, status: 'Draft', createdAt: now().toISOString(), attachments: [] }
          store.unshift(record)
          return respond({ headerId: record.headerId, days: days(record), attachments: attach(record, files) }, { status: 201 })
        },
      }],
      [/^\/hr\/sick-leave\/([1-9][0-9]*)$/, {
        get: ({ match, respond, fail }) => {
          const record = find(match[1], fail)
          return respond({ ...item(record), comments: record.comments, fromDayType: record.fromDayType, toDayType: record.toDayType, attachments: record.attachments })
        },
        put: ({ match, body, respond, fail }) => {
          const record = find(match[1], fail)
          if (!editable(record)) fail(409, 'STATE_CONFLICT', `Request is ${record.status} and cannot be modified`)
          Object.assign(record, prepare(body, fail))
          return respond({ headerId: record.headerId, days: days(record) })
        },
      }],
      [/^\/hr\/sick-leave\/([1-9][0-9]*)\/attachments$/, {
        post: ({ match, body, respond, fail }) => {
          const record = find(match[1], fail)
          if (!editable(record)) fail(409, 'STATE_CONFLICT', `Request is ${record.status} and cannot be modified`)
          const { files } = fieldsOf(body)
          checkFiles(files, fail)
          return respond({ attachments: attach(record, files) })
        },
      }],
      [/^\/hr\/sick-leave\/([1-9][0-9]*)\/attachments\/([1-9][0-9]*)$/, {
        delete: ({ match, respond, fail }) => {
          const record = find(match[1], fail)
          if (!editable(record)) fail(409, 'STATE_CONFLICT', `Request is ${record.status} and cannot be modified`)
          const index = record.attachments.findIndex((file) => String(file.attachmentId) === match[2])
          if (index < 0) fail(404, 'NOT_FOUND', 'Attachment not found')
          record.attachments.splice(index, 1)
          return respond({ attachmentId: Number(match[2]), deleted: true })
        },
      }],
    ],
  })
}
