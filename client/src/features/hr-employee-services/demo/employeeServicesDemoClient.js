// DEMO ADAPTER ONLY (owner-approved for the HR employee services until their
// backend exists). An in-memory stand-in for the proposed API with the shared
// API client's interface: get/post/put resolve to { status, data, pagination,
// requestId } and failures reject with ApiError, exactly like apiClient. It
// behaves like the proposed backend: it assigns numbers, statuses, the
// requester and approval states, validates saves and submissions (422),
// refuses changes to submitted records (409), reports unknown records (404)
// and answers after a short delay. Records live in memory only (never browser
// storage) and are lost on reload. Delete this folder when the real API exists.
import { ApiError } from '../../../services/api/apiClient.js'
import { businessToday } from '../../hr-recruitment/shared/hrFormat.js'
import {
  RECORD_CHANGE_ROUTE, changeTypes, isRecordChangeLocked, recordTotal, validateRecordChange,
} from '../recordChange/recordChangeModel.js'
import { routeStates } from '../shared/approvals.js'
import { TRANSFER_ROUTE, isTransferLocked, officeStates, sectionsOf, validateTransfer } from '../transfer/transferModel.js'
import { DEMO_EMPLOYEE_SERVICES_LOOKUPS, DEMO_REQUESTER, DEMO_SERVICE_EMPLOYEES, createDemoServiceRecords } from './employeeServicesDemoData.js'

export const EMPLOYEE_SERVICES_BASE = '/hr/employee-services'
const ROUTE = /^\/hr\/employee-services\/(record-change-requests|transfers)(?:\/([1-9][0-9]*)(?:\/(submit))?)?$/
const MAX_LIMIT = 100

const clone = (value) => structuredClone(value)
const pageOf = (items, params, limitDefault = 25) => {
  const page = Math.max(1, Number.parseInt(params.page, 10) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(params.limit, 10) || limitDefault))
  const total = items.length
  const totalPages = Math.ceil(total / limit)
  return {
    items: items.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new ApiError('The API request was cancelled.', { code: 'ABORTED' }))
    if (signal?.aborted) return aborted()
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve() }, ms)
    function onAbort() { clearTimeout(timer); aborted() }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

// Approval states as the server returns them.
const approvalsOf = (route, status) => routeStates(route, status).map((state, index) => ({ role: route[index], state }))

const COLLECTIONS = Object.freeze({
  'record-change-requests': Object.freeze({
    store: 'recordChanges', id: 'requestId', number: 'requestNumber', prefix: 'PCR', prepare: 'recordChange',
    locked: (record) => isRecordChangeLocked(record.status),
    present: (record) => ({ ...record, approvals: approvalsOf(RECORD_CHANGE_ROUTE, record.status) }),
    listItem: (record) => ({
      requestId: record.requestId, requestNumber: record.requestNumber, status: record.status,
      employeeName: record.employee.name, employeeNumber: record.employee.employeeNumber, effectiveDate: record.effectiveDate,
      changeTypes: changeTypes(record.employee.current, record.revised),
      totalChange: Math.round((recordTotal(record.revised) - recordTotal(record.employee.current)) * 100) / 100,
      requestDate: record.requestDate, updatedAt: record.updatedAt,
    }),
  }),
  transfers: Object.freeze({
    store: 'transfers', id: 'transferId', number: 'transferNumber', prefix: 'TRF', prepare: 'transfer',
    locked: (record) => isTransferLocked(record.status),
    present: (record) => ({
      ...record, approvals: approvalsOf(TRANSFER_ROUTE, record.status), office: officeStates(record.status, record.effectiveDate ?? record.requestDate),
    }),
    listItem: (record, lookups) => ({
      transferId: record.transferId, transferNumber: record.transferNumber, status: record.status,
      employeeName: record.employee.name, employeeNumber: record.employee.employeeNumber, fromDepartmentName: record.employee.departmentName,
      toDepartmentName: lookups.departments.find((item) => item.code === record.to.departmentCode)?.name ?? null,
      toSectionName: sectionsOf(lookups.departments, record.to.departmentCode).find((item) => item.code === record.to.sectionCode)?.name ?? null,
      effectiveDate: record.effectiveDate, salaryChange: record.salaryChange, budgetedSalary: record.budgetedSalary,
      requestDate: record.requestDate, updatedAt: record.updatedAt,
    }),
  }),
})

export function createEmployeeServicesDemoClient({
  latencyMs = 350, now = () => new Date(), records = createDemoServiceRecords(), lookups = DEMO_EMPLOYEE_SERVICES_LOOKUPS, employees = DEMO_SERVICE_EMPLOYEES,
} = {}) {
  const store = clone(records)
  let requests = 0
  // The signed-in user (identify); a real backend takes the requester from the session.
  let actor = null

  const fail = (status, code, message, details = []) => {
    throw new ApiError(message, { code, status, details, requestId: `demo-${requests}` })
  }
  const respond = (data, { status = 200, pagination = null } = {}) =>
    Object.freeze({ status, data: clone(data), pagination: pagination && Object.freeze(pagination), requestId: `demo-${requests}` })
  const timestamp = () => now().toISOString()
  const today = () => businessToday(now())
  const requester = () => (actor ? { ...actor } : { ...DEMO_REQUESTER })
  const findEmployee = (employeeId) => employees.find((item) => item.employeeId === employeeId) ?? null
  const details = (problems) => problems.map(({ field, code }) => ({ field, message: code }))

  // Next number for a prefix and the current business year: PCR-2026-0003.
  function nextNumber(collection) {
    const year = today().slice(0, 4)
    const pattern = new RegExp(`^${collection.prefix}-${year}-(\\d+)$`)
    const highest = store[collection.store]
      .map((record) => pattern.exec(record[collection.number] ?? '')?.[1])
      .filter(Boolean).map(Number).reduce((max, value) => Math.max(max, value), 0)
    return `${collection.prefix}-${year}-${String(highest + 1).padStart(4, '0')}`
  }
  const nextId = (collection) => String(store[collection.store].reduce((max, record) => Math.max(max, Number(record[collection.id])), 0) + 1)
  const find = (collection, id) => store[collection.store].find((record) => record[collection.id] === id) ?? fail(404, 'NOT_FOUND', 'The record was not found.')

  // Record change: the employee snapshot and current record are server values.
  function prepareRecordChange(body, current, { submit }) {
    const employee = current?.employee ?? findEmployee(body.employeeId)
    if (current && body.employeeId && body.employeeId !== current.employee.employeeId) fail(422, 'VALIDATION_ERROR', 'The employee of a saved request cannot change.')
    const form = { effectiveDate: body.effectiveDate ?? '', revised: body.revised, remarks: String(body.remarks ?? ''), views: String(body.views ?? '') }
    const problems = validateRecordChange(form, employee, { submit })
    if (problems.length) fail(422, 'VALIDATION_ERROR', submit ? 'The request cannot be submitted.' : 'The request cannot be saved.', details(problems))
    return {
      employee: clone(employee), effectiveDate: form.effectiveDate || null, revised: clone(body.revised ?? employee.current),
      remarks: form.remarks, views: form.views,
      // Demo only: file name and size stand in for the stubbed upload endpoint.
      attachments: (body.attachments ?? current?.attachments ?? []).map(({ fileName, sizeBytes }) => ({ fileName: String(fileName), sizeBytes: Number(sizeBytes) || 0 })),
    }
  }

  // Transfer: the employee snapshot, requester and approvals are server values.
  function prepareTransfer(body, current, { submit }) {
    const employee = current?.employee ?? findEmployee(body.employeeId)
    if (current && body.employeeId && body.employeeId !== current.employee.employeeId) fail(422, 'VALIDATION_ERROR', 'The employee of a saved request cannot change.')
    const to = { jobTitleCode: body.to?.jobTitleCode ?? '', departmentCode: body.to?.departmentCode ?? '', sectionCode: body.to?.sectionCode ?? '' }
    const form = {
      to, effectiveDate: body.effectiveDate ?? '', directorId: body.directorId ?? '', salaryChange: body.salaryChange ?? '', budgetedSalary: body.budgetedSalary ?? '',
    }
    const problems = validateTransfer(form, employee, lookups.departments, { submit })
    if (body.directorId && !lookups.directors.some((item) => item.directorId === body.directorId)) problems.push({ field: 'directorId', code: 'unknown' })
    if (body.companyCode && !lookups.companies.some((item) => item.code === body.companyCode)) problems.push({ field: 'companyCode', code: 'unknown' })
    if (problems.length) fail(422, 'VALIDATION_ERROR', submit ? 'The transfer cannot be submitted.' : 'The transfer cannot be saved.', details(problems))
    const orNull = (value) => value || null
    return {
      companyCode: body.companyCode ?? current?.companyCode ?? lookups.companies[0].code, employee: clone(employee),
      to: { jobTitleCode: orNull(to.jobTitleCode), departmentCode: orNull(to.departmentCode), sectionCode: orNull(to.sectionCode) },
      effectiveDate: orNull(form.effectiveDate), bloodType: orNull(body.bloodType), directorId: orNull(form.directorId),
      salaryChange: orNull(form.salaryChange), budgetedSalary: orNull(form.budgetedSalary),
    }
  }
  const prepare = (collection, body, current, options) =>
    (collection.prepare === 'transfer' ? prepareTransfer : prepareRecordChange)(body, current, options)

  function list(collection, params = {}) {
    const items = [...store[collection.store]].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const { items: slice, pagination } = pageOf(items, params)
    return respond(slice.map((record) => collection.listItem(record, lookups)), { pagination })
  }

  function create(collection, body = {}) {
    const record = {
      [collection.id]: nextId(collection), [collection.number]: nextNumber(collection), status: 'DRAFT', requestDate: today(),
      requestedBy: requester(), ...prepare(collection, body, null, { submit: false }), updatedAt: timestamp(),
    }
    store[collection.store].push(record)
    return respond(collection.present(record), { status: 201 })
  }

  function update(collection, id, body = {}) {
    const current = find(collection, id)
    if (collection.locked(current)) fail(409, 'CONFLICT', 'This request is read-only because it was already submitted.')
    const record = { ...clone(current), ...prepare(collection, body, current, { submit: false }), updatedAt: timestamp() }
    store[collection.store][store[collection.store].indexOf(current)] = record
    return respond(collection.present(record))
  }

  function submit(collection, id) {
    const current = find(collection, id)
    if (collection.locked(current)) fail(409, 'CONFLICT', 'This request is read-only because it was already submitted.')
    prepare(collection, { ...current, employeeId: current.employee.employeeId, directorId: current.directorId }, current, { submit: true })
    const record = { ...clone(current), status: 'SUBMITTED', updatedAt: timestamp() }
    store[collection.store][store[collection.store].indexOf(current)] = record
    return respond(collection.present(record))
  }

  // Employees whose name or number contains the search text.
  function searchEmployees(params = {}) {
    const search = String(params.search ?? '').trim().toLowerCase()
    const items = employees.filter((item) => !search || `${item.name} ${item.employeeNumber}`.toLowerCase().includes(search))
    const { items: slice, pagination } = pageOf(items, params, 10)
    return respond(slice, { pagination })
  }

  async function request(method, path, { params, body, signal } = {}) {
    requests += 1
    await wait(latencyMs, signal)
    if (method === 'GET' && path === `${EMPLOYEE_SERVICES_BASE}/lookups`) return respond(lookups)
    if (method === 'GET' && path === `${EMPLOYEE_SERVICES_BASE}/employees`) return searchEmployees(params)
    const match = ROUTE.exec(path)
    if (!match) fail(404, 'NOT_FOUND', 'The requested resource does not exist.')
    const [, name, id, action] = match
    const collection = COLLECTIONS[name]
    if (method === 'GET' && !id) return list(collection, params)
    if (method === 'GET' && id && !action) return respond(collection.present(find(collection, id)))
    if (method === 'POST' && !id) return create(collection, body)
    if (method === 'PUT' && id && !action) return update(collection, id, body)
    if (method === 'POST' && id && action === 'submit') return submit(collection, id)
    return fail(405, 'METHOD_NOT_ALLOWED', 'The request method is not supported for this resource.')
  }

  return Object.freeze({
    demo: true,
    // { name, employeeNumber } of the signed-in user, or null.
    identify: (user) => { actor = user?.name ? { name: user.name, employeeNumber: user.employeeNumber ?? '' } : null },
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
  })
}
