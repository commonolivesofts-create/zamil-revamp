// Response contract of Employee Clearance (form 1063): /api/v1/hr/employee-clearance.
// Readers turn backend data into the frozen shapes the screens use and reject
// anything unexpected; `clearanceBody` builds the request body. Pure.
import { ID, invalidResponse, isoDate, normalizeStatus, optionalNumber, pageOf, text } from '../shared/formRecords.js'
import { IT_ACTIONS, IT_SUBJECTS, SECTIONS, SECTION_KEYS, SIGNATURES, blankSection, hasCost } from './clearanceModel.js'

const ACTIONS = IT_ACTIONS.map((item) => item.value)
const signature = (value) => (SIGNATURES.includes(value) ? value : '')

// Employee lookup row (scoped list or autofill) in the picker's shape.
export function readClearanceEmployee(item) {
  if (!item || !text(item.empNo)) throw invalidResponse('employee')
  return Object.freeze({
    employeeId: text(item.empNo), employeeNumber: text(item.empNo), name: text(item.fullName) || text(item.empNo),
    position: text(item.jobTitle), section: text(item.department), jobTitle: text(item.jobTitle), departmentName: text(item.department),
    division: text(item.division), directManager: text(item.directManager),
  })
}

export function readApprovers(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('approver list')
  return Object.freeze(data.items.map((item) => Object.freeze({ name: text(item.name), empNo: text(item.empNo) })).filter((item) => item.name))
}

// Computer / laptop receivers: employees plus the fixed IT and No Computer choices.
export function readDestinations(data) {
  if (!Array.isArray(data)) throw invalidResponse('computer destination list')
  return Object.freeze(data.map((item) => {
    if (!item || !text(item.value)) throw invalidResponse('computer destination')
    return Object.freeze({ value: text(item.value), label: text(item.label) || text(item.value), kind: ['employee', 'it', 'none'].includes(item.kind) ? item.kind : 'employee' })
  }))
}

const readSection = (key, data) => {
  const codes = new Set(SECTIONS.find((section) => section.key === key).items.map((item) => item.code))
  if (!data) return Object.freeze(blankSection(key))
  return Object.freeze({
    items: Object.freeze((Array.isArray(data.items) ? data.items : []).filter((code) => codes.has(code))),
    comments: text(data.comments),
    ...(hasCost(key) ? { cost: optionalNumber(data.cost) === null ? '' : String(optionalNumber(data.cost)) } : {}),
    approver: text(data.approver),
    signature: signature(data.signature),
    ...(key === 'admin' ? { appDate: isoDate(data.appDate), visaExpiry: isoDate(data.visaExpiry) } : {}),
  })
}

export function readClearanceRecord(data) {
  if (!data || !ID.test(String(data.headerId ?? ''))) throw invalidResponse('employee clearance request')
  const lines = Array.isArray(data.itMatrix) ? data.itMatrix : []
  return Object.freeze({
    clearanceId: String(data.headerId),
    referenceNo: text(data.referenceNo),
    status: normalizeStatus(data.status),
    employee: Object.freeze({
      employeeId: text(data.empNo), employeeNumber: text(data.empNo), name: text(data.empName) || text(data.empNo),
      position: text(data.jobTitle), section: text(data.department), jobTitle: text(data.jobTitle), departmentName: text(data.department),
      division: text(data.division), directManager: '',
    }),
    contact: text(data.contact),
    purpose: text(data.purpose),
    vacationFrom: isoDate(data.vacationFrom),
    vacationTo: isoDate(data.vacationTo),
    departmentManager: Object.freeze({
      name: text(data.departmentManager?.name), date: isoDate(data.departmentManager?.date), signature: signature(data.departmentManager?.signature),
    }),
    itManager: Object.freeze({ name: text(data.itManager?.name), date: isoDate(data.itManager?.date), signature: signature(data.itManager?.signature) }),
    computerReceivedBy: text(data.computerReceivedBy),
    computerSignature: signature(data.computerSignature),
    itMatrix: Object.freeze(IT_SUBJECTS.map((_, index) => {
      const line = lines[index]
      const action = ACTIONS.includes(line?.action) ? line.action : ''
      return Object.freeze({ action, accessTo: action === 'disabled untill' ? isoDate(line?.accessTo) : text(line?.accessTo) })
    })),
    sections: Object.freeze(Object.fromEntries(SECTION_KEYS.map((key) => [key, readSection(key, data.sections?.[key])]))),
  })
}

export function readClearanceListItem(item) {
  if (!item || !ID.test(String(item.headerId ?? ''))) throw invalidResponse('employee clearance list')
  return Object.freeze({
    clearanceId: String(item.headerId),
    referenceNo: text(item.referenceNo),
    employeeNumber: text(item.empNo),
    employeeName: text(item.empName),
    jobTitle: text(item.jobTitle),
    department: text(item.department),
    contact: text(item.contact),
    purpose: text(item.purpose),
    vacationFrom: isoDate(item.vacationFrom),
    vacationTo: isoDate(item.vacationTo),
    status: normalizeStatus(item.status),
    createdAt: isoDate(item.createdAt),
  })
}

export function readClearancePage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('employee clearance list')
  return Object.freeze({ items: Object.freeze(data.items.map(readClearanceListItem)), pagination: pageOf(data) })
}

const orNull = (value) => value || null

// Request body. The server re-reads the employee (name, job title,
// department, division), resolves the department manager's number, builds the
// reference number and owns the status.
export function clearanceBody(form) {
  return {
    employee: { empNo: Number(form.employee.employeeNumber) },
    contact: form.contact.trim(),
    purpose: form.purpose.trim(),
    vacationFrom: orNull(form.vacationFrom),
    vacationTo: orNull(form.vacationTo),
    departmentManager: { name: form.departmentManager.name, date: orNull(form.departmentManager.date), signature: form.departmentManager.signature },
    itManager: { name: form.itManager.name.trim(), date: orNull(form.itManager.date), signature: form.itManager.signature },
    computerReceivedBy: form.computerReceivedBy,
    computerSignature: form.computerSignature,
    itMatrix: form.itMatrix.map((row) => ({ action: row.action, accessTo: row.accessTo.trim() })),
    sections: Object.fromEntries(SECTION_KEYS.map((key) => {
      const value = form.sections[key]
      return [key, {
        items: [...value.items], comments: value.comments.trim(), approver: value.approver, signature: value.signature,
        ...(hasCost(key) ? { cost: value.cost === '' ? null : Number(value.cost) } : { appDate: orNull(value.appDate), visaExpiry: orNull(value.visaExpiry) }),
      }]
    })),
  }
}
