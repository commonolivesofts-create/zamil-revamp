// Response contract of Sick Leave (form 1076): /api/v1/hr/sick-leave. Readers
// turn backend data into the frozen shapes the screens use and reject anything
// unexpected; `sickLeaveFields` builds the request fields. Pure.
import { ID, invalidResponse, isoDate, normalizeStatus, optionalNumber, pageOf, text } from '../shared/formRecords.js'

export const DAY_TYPES = Object.freeze(['FULL', 'HALF'])
export const SICK_LEAVE_TYPE = 'Sick Leave'

// Employee lookup row (self or a direct report) in the picker's shape.
export function readSickLeaveEmployee(item) {
  if (!item || !text(item.empNumber)) throw invalidResponse('employee')
  return Object.freeze({
    employeeId: text(item.empNumber), employeeNumber: text(item.empNumber), name: text(item.empName) || text(item.empNumber),
    departmentName: text(item.department), position: text(item.department),
  })
}

const readAttachment = (item) => {
  if (!item || !ID.test(String(item.attachmentId ?? ''))) throw invalidResponse('attachment')
  return Object.freeze({ attachmentId: String(item.attachmentId), fileName: text(item.fileName), attachedOn: isoDate(item.attachedOn) })
}

export function readSickLeaveRecord(data) {
  if (!data || !ID.test(String(data.headerId ?? ''))) throw invalidResponse('sick leave request')
  return Object.freeze({
    leaveId: String(data.headerId),
    employee: Object.freeze({
      employeeId: text(data.empId), employeeNumber: text(data.empId), name: text(data.empName) || text(data.empId), departmentName: '', position: '',
    }),
    leaveType: text(data.leaveType) || SICK_LEAVE_TYPE,
    fromDate: isoDate(data.fromDate),
    toDate: isoDate(data.toDate),
    fromDayType: DAY_TYPES.includes(data.fromDayType) ? data.fromDayType : 'FULL',
    toDayType: DAY_TYPES.includes(data.toDayType) ? data.toDayType : 'FULL',
    days: optionalNumber(data.days),
    comments: text(data.comments) === '-' ? '' : text(data.comments),
    status: normalizeStatus(data.status),
    createdAt: isoDate(data.createdAt),
    attachments: Object.freeze((Array.isArray(data.attachments) ? data.attachments : []).map(readAttachment)),
  })
}

export function readSickLeaveListItem(item) {
  if (!item || !ID.test(String(item.headerId ?? ''))) throw invalidResponse('sick leave list')
  return Object.freeze({
    leaveId: String(item.headerId),
    employeeNumber: text(item.empId),
    employeeName: text(item.empName),
    leaveType: text(item.leaveType) || SICK_LEAVE_TYPE,
    fromDate: isoDate(item.fromDate),
    toDate: isoDate(item.toDate),
    days: optionalNumber(item.days),
    // Present for HR only: total days of the employee within the filter.
    totalLeaveDays: optionalNumber(item.totalLeaveDays),
    status: normalizeStatus(item.status),
    pendingAt: text(item.pendingAt),
    createdAt: isoDate(item.createdAt),
  })
}

export function readSickLeavePage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('sick leave list')
  return Object.freeze({ items: Object.freeze(data.items.map(readSickLeaveListItem)), pagination: pageOf(data) })
}

// The server recomputes the number of days, resolves the employee name and
// stores the fixed leave type; these are the only fields it accepts.
export function sickLeaveFields(form) {
  return {
    empNumber: form.employee.employeeNumber,
    leaveType: SICK_LEAVE_TYPE,
    fromDate: form.fromDate,
    toDate: form.toDate,
    fromDayType: form.fromDayType,
    toDayType: form.fromDate === form.toDate ? form.fromDayType : form.toDayType,
    comments: form.comments.trim(),
  }
}
