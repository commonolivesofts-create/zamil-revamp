// Response readers for the HR employee services API (proposed contract, see
// the feature README). Each reader keeps only documented fields, keeps Oracle
// IDs as decimal strings and rejects a malformed response as a whole. The demo
// adapter returns the same shapes and is read through the same functions.
import { ApiError } from '../../services/api/apiClient.js'
import { isIsoDate } from '../hr-recruitment/shared/hrFormat.js'
import { APPROVAL_STATES, CHANGE_TYPES, PAY_KEYS, RECORD_CHANGE_ROUTE, RECORD_CHANGE_STATUSES } from './recordChange/recordChangeModel.js'

export const ID_PATTERN = /^[1-9][0-9]{0,18}$/
export const LOOKUP_CODE = /^[A-Za-z0-9_+-]{1,40}$/

function invalid() {
  throw new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
}
const check = (condition) => { if (!condition) invalid() }
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const id = (value) => { check(typeof value === 'string' && ID_PATTERN.test(value)); return value }
const text = (value, max = 4000) => { check(typeof value === 'string' && value.length <= max); return value }
const date = (value) => { check(isIsoDate(value)); return value }
const nullableDate = (value) => (value === null ? null : date(value))
const instant = (value) => { check(typeof value === 'string' && !Number.isNaN(Date.parse(value))); return value }
const code = (value) => { check(typeof value === 'string' && LOOKUP_CODE.test(value)); return value }
const nullableCode = (value) => (value === null ? null : code(value))
const amount = (value) => { check(typeof value === 'number' && Number.isFinite(value) && value >= 0); return value }
const nullableAmount = (value) => (value === null ? null : amount(value))
const oneOf = (value, allowed) => { check(allowed.includes(value)); return value }
const list = (value, read) => { check(Array.isArray(value)); return Object.freeze(value.map(read)) }

const option = (item) => {
  check(isObject(item))
  return Object.freeze({ code: code(item.code), name: text(item.name, 200) })
}
const options = (value) => list(value, option)
const person = (value) => {
  check(isObject(value))
  return Object.freeze({ name: text(value.name, 200), employeeNumber: text(value.employeeNumber, 40) })
}
const attachment = (item) => {
  check(isObject(item))
  check(Number.isInteger(item.sizeBytes) && item.sizeBytes >= 0)
  return Object.freeze({ fileName: text(item.fileName, 255), sizeBytes: item.sizeBytes })
}

// The current (or revised) employee record: position, the six monthly pay
// items, grade, level and family status.
function readRecordValues(value, { nullable }) {
  check(isObject(value))
  const pay = nullable ? nullableAmount : amount
  const coded = nullable ? (item) => (item === null ? null : code(item)) : code
  return Object.freeze({
    positionCode: coded(value.positionCode),
    ...Object.fromEntries(PAY_KEYS.map((key) => [key, pay(value[key])])),
    gradeCode: coded(value.gradeCode),
    levelCode: coded(value.levelCode),
    familyStatusCode: coded(value.familyStatusCode),
  })
}

// GET /hr/employee-services/lookups
export function readEmployeeServicesLookups(data) {
  check(isObject(data))
  return Object.freeze({
    positions: options(data.positions),
    grades: options(data.grades),
    levels: options(data.levels),
    familyStatuses: options(data.familyStatuses),
  })
}

// One employee from GET /hr/employee-services/employees, with the current record.
export function readServiceEmployee(item) {
  check(isObject(item))
  return Object.freeze({
    employeeId: id(item.employeeId),
    employeeNumber: text(item.employeeNumber, 40),
    name: text(item.name, 200),
    nationality: text(item.nationality, 100),
    departmentCode: code(item.departmentCode),
    departmentName: text(item.departmentName, 200),
    sectionCode: code(item.sectionCode),
    sectionName: text(item.sectionName, 200),
    startDate: date(item.startDate),
    jobTitleCode: code(item.jobTitleCode),
    bloodType: nullableCode(item.bloodType),
    current: readRecordValues(item.current, { nullable: false }),
  })
}

const approval = (allowedRoles) => (item) => {
  check(isObject(item))
  return Object.freeze({ role: oneOf(item.role, allowedRoles), state: oneOf(item.state, APPROVAL_STATES) })
}

// One personnel record change request.
export function readRecordChange(data) {
  check(isObject(data))
  const approvals = list(data.approvals, approval(RECORD_CHANGE_ROUTE))
  check(approvals.length === RECORD_CHANGE_ROUTE.length)
  return Object.freeze({
    requestId: id(data.requestId),
    requestNumber: text(data.requestNumber, 40),
    status: oneOf(data.status, RECORD_CHANGE_STATUSES),
    requestDate: date(data.requestDate),
    requestedBy: person(data.requestedBy),
    employee: readServiceEmployee(data.employee),
    effectiveDate: nullableDate(data.effectiveDate),
    revised: readRecordValues(data.revised, { nullable: true }),
    remarks: text(data.remarks, 2000),
    views: text(data.views, 2000),
    attachments: list(data.attachments, attachment),
    approvals,
    updatedAt: instant(data.updatedAt),
  })
}

export function readRecordChangeListItem(item) {
  check(isObject(item))
  check(typeof item.totalChange === 'number' && Number.isFinite(item.totalChange))
  return Object.freeze({
    requestId: id(item.requestId),
    requestNumber: text(item.requestNumber, 40),
    status: oneOf(item.status, RECORD_CHANGE_STATUSES),
    employeeName: text(item.employeeName, 200),
    employeeNumber: text(item.employeeNumber, 40),
    effectiveDate: nullableDate(item.effectiveDate),
    changeTypes: list(item.changeTypes, (type) => oneOf(type, CHANGE_TYPES)),
    totalChange: item.totalChange,
    requestDate: date(item.requestDate),
    updatedAt: instant(item.updatedAt),
  })
}

// `result` is the client result: { data, pagination } (pagination already validated).
export function readPage(result, reader) {
  if (!Array.isArray(result?.data) || !result.pagination) invalid()
  return Object.freeze({ items: Object.freeze(result.data.map(reader)), pagination: result.pagination })
}
