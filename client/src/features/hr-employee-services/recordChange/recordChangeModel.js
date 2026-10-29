// Personnel Record Change (form 1110) business rules. Pure functions, no I/O:
// the page, the demo adapter and the tests use the same rules.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

// Monthly pay items in form order (all SR per month).
export const PAY_KEYS = Object.freeze(['basic', 'house', 'transport', 'other', 'communication', 'car'])
// Coded values of the record that are chosen from a lookup.
export const CODE_KEYS = Object.freeze(['positionCode', 'gradeCode', 'levelCode', 'familyStatusCode'])
export const RECORD_KEYS = Object.freeze(['positionCode', ...PAY_KEYS, 'gradeCode', 'levelCode', 'familyStatusCode'])
export const RECORD_CHANGE_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED', 'APPROVED'])
export const CHANGE_TYPES = Object.freeze(['POSITION', 'SALARY_INCREASE', 'SALARY_DECREASE', 'ALLOWANCE', 'GRADE_LEVEL', 'FAMILY_STATUS'])
// Remarks and views & suggestions.
export const TEXT_MAX = 2000
// An amount: 0 or more with up to two decimals.
export const AMOUNT = /^\d+(\.\d{1,2})?$/

export const isRecordChangeLocked = (status) => status === 'SUBMITTED' || status === 'APPROVED'

const toCents = (value) => Math.round(Number(value) * 100)
const filled = (value) => value !== '' && value !== null && value !== undefined

// Total SR = basic + house + transport + other + communication + car.
export function recordTotal(record) {
  if (!record) return 0
  return PAY_KEYS.reduce((sum, key) => sum + (filled(record[key]) && AMOUNT.test(String(record[key])) ? toCents(record[key]) : 0), 0) / 100
}

// Difference of one amount: { amount, percent } (percent to one decimal, null
// when the current value is 0, so no percentage can be computed).
export function amountDelta(current, revised) {
  const amount = (toCents(revised) - toCents(current)) / 100
  const percent = Number(current) ? Math.round((amount / Number(current)) * 1000) / 10 : null
  return { amount, percent }
}

// The items whose revised value differs from the current one, in form order.
export function changedKeys(current, revised) {
  if (!current || !revised) return []
  return RECORD_KEYS.filter((key) => {
    if (!PAY_KEYS.includes(key)) return Boolean(revised[key]) && revised[key] !== current[key]
    return filled(revised[key]) && AMOUNT.test(String(revised[key])) && toCents(revised[key]) !== toCents(current[key])
  })
}

// The change types detected automatically from the changed items.
export function changeTypes(current, revised) {
  const types = new Set()
  for (const key of changedKeys(current, revised)) {
    if (key === 'positionCode') types.add('POSITION')
    else if (key === 'gradeCode' || key === 'levelCode') types.add('GRADE_LEVEL')
    else if (key === 'familyStatusCode') types.add('FAMILY_STATUS')
    else if (key === 'basic') types.add(toCents(revised.basic) > toCents(current.basic) ? 'SALARY_INCREASE' : 'SALARY_DECREASE')
    else types.add('ALLOWANCE')
  }
  return CHANGE_TYPES.filter((type) => types.has(type))
}

// A lower total is allowed but must be explained in the remarks (a reminder, not a block).
export const totalGoesDown = (current, revised) => Boolean(current && revised) && recordTotal(revised) < recordTotal(current)

export const blankRecordChange = (today) => ({ requestDate: today, effectiveDate: '', revised: null, remarks: '', views: '', attachments: [] })

// Request body: only the requester's answers. The request number, status,
// requester, employee snapshot and current record are server values.
export function recordChangePayload(form, employee) {
  const revised = form.revised ?? {}
  return {
    employeeId: employee?.employeeId ?? null,
    effectiveDate: form.effectiveDate || null,
    revised: Object.fromEntries(RECORD_KEYS.map((key) => [key, PAY_KEYS.includes(key)
      ? (filled(revised[key]) && AMOUNT.test(String(revised[key])) ? toCents(revised[key]) / 100 : null)
      : (revised[key] || null)])),
    remarks: form.remarks,
    views: form.views,
    // File name and size only: the upload endpoint is stubbed (see the README).
    attachments: form.attachments.map(({ fileName, sizeBytes }) => ({ fileName, sizeBytes })),
  }
}

// Problems as { field, code } in step order. `submit` adds the rules that
// apply to a submission only (effective date, every item and one change).
// Steps: 0 employee and effective date, 1 revised record, 2 remarks.
export function validateRecordChange(form, employee, { submit }) {
  const problems = []
  const add = (field, code, step) => problems.push({ field, code, step })
  if (!employee) add('employee', 'required', 0)
  if (!form.effectiveDate) { if (submit) add('effectiveDate', 'required', 0) }
  else if (!isIsoDate(form.effectiveDate)) add('effectiveDate', 'invalid', 0)
  else if (employee && form.effectiveDate < employee.startDate) add('effectiveDate', 'beforeStart', 0)
  const revised = form.revised
  if (employee && revised) {
    if (!revised.positionCode) add('positionCode', 'required', 1)
    for (const key of PAY_KEYS) {
      if (!filled(revised[key])) add(key, 'required', 1)
      else if (!AMOUNT.test(String(revised[key]))) add(key, 'amount', 1)
    }
    if (submit && !changedKeys(employee.current, revised).length) add('revised', 'noChange', 1)
  }
  if (form.remarks.length > TEXT_MAX) add('remarks', 'tooLong', 2)
  if (form.views.length > TEXT_MAX) add('views', 'tooLong', 2)
  return problems
}

// Counter state of a limited text: '', 'near' (over 90 %) or 'over'.
export const counterState = (length, max = TEXT_MAX) => (length > max ? 'over' : length > max * 0.9 ? 'near' : '')

// Approval route after submission: noted by the HR & Admin. Manager, then
// approved by the President. States: DRAFT (not submitted yet), PENDING
// (with this approver), WAITING (an earlier approver first) and APPROVED.
export const RECORD_CHANGE_ROUTE = Object.freeze(['NOTED_BY', 'APPROVED_BY'])
export const APPROVAL_STATES = Object.freeze(['DRAFT', 'PENDING', 'WAITING', 'APPROVED'])

// Approval states derived from the request status (the server assigns them).
export function routeStates(route, status) {
  return route.map((_, index) => {
    if (status === 'APPROVED') return 'APPROVED'
    if (status === 'SUBMITTED') return index === 0 ? 'PENDING' : 'WAITING'
    return 'DRAFT'
  })
}
