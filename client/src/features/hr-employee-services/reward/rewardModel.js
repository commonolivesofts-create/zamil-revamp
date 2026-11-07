// Business rules of Reward Nomination (form 1113). Legacy rules (spec
// README_employee_of_the_month_form.md, backend validation) win over the
// prototype: the A / AS / BS / CS scale (no numeric score), a rating and
// evidence (≤ 500) per criterion, an overall rating and a remark, no
// self-nomination. Kept from the prototype as new rules: one nomination per
// employee per month (checked against the nominations the user can see).
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const LINE_REMARK_MAX = 500
// Assumed: the REMARK column length is not documented (the backend checks only
// that it is present); 500 matches the line remark column.
export const REMARK_MAX = 500

// Display order of the legacy scale, as the CI3 dropdown lists it (the codes
// have no numeric meaning): A, AS, BS, CS.
export const RATING_ORDER = Object.freeze(['A', 'AS', 'BS', 'CS'])
export const RATING_TONE = Object.freeze({ AS: 'ok', A: 'ok', CS: 'warn', BS: 'bad' })

export const DEPARTMENT_TEXT = Object.freeze({
  production: Object.freeze({ name: 'Production', icon: 'factory', desc: 'Operators, technicians and supervisors on the shop floor' }),
  'shared-services': Object.freeze({ name: 'Shared Services', icon: 'users', desc: 'HR, Finance, IT, Sales, Procurement and support teams' }),
})


export const monthOf = (iso) => (isIsoDate(iso) ? iso.slice(0, 7) : '')
export function monthRange(iso) {
  if (!isIsoDate(iso)) return null
  const [year, month] = iso.split('-').map(Number)
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${iso.slice(0, 7)}-01`, to: `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

// Rating counts in legacy report order (A, AS, BS, CS) plus how many are rated.
export function ratingSummary(lines) {
  const counts = { A: 0, AS: 0, BS: 0, CS: 0 }
  for (const line of lines) if (counts[line.rating] !== undefined) counts[line.rating] += 1
  return { counts, rated: lines.filter((line) => line.rating).length, total: lines.length }
}

// A nomination of the same employee in the same month (another record, any status but rejected).
export function duplicateOf(existing, { nominationId, employeeNumber, activityDate }) {
  const month = monthOf(activityDate)
  if (!month || !employeeNumber) return null
  return existing.find((item) => item.nominationId !== nominationId && item.employeeNumber === employeeNumber &&
    monthOf(item.activityDate) === month && item.status !== 'REJECTED') ?? null
}

// Field errors keyed by field ('department', 'employee', 'activityDate',
// 'rating:<n>', 'remark:<n>', 'overallRating', 'remark'). Empty when valid.
export function validateReward(form, { employee, requestor, criteria, duplicate }) {
  const errors = {}
  if (!form.department) errors.department = 'Choose the department.'
  if (!employee) errors.employee = 'Choose the employee.'
  else if (!employee.email || !employee.position || !employee.departmentName) {
    errors.employee = 'This employee has incomplete HR details (email, position or department) and cannot be nominated.'
  } else if (requestor && employee.employeeNumber === requestor.employeeNumber) {
    errors.employee = 'You cannot nominate yourself.'
  } else if (duplicate) {
    errors.employee = `${employee.name} already has a nomination for this month (${duplicate.requestNo}).`
  }
  if (!form.activityDate) errors.activityDate = 'Effective date is required.'
  else if (!isIsoDate(form.activityDate)) errors.activityDate = 'Enter a valid date.'
  criteria.forEach((_, index) => {
    const line = form.lines[index] ?? { rating: '', remark: '' }
    if (!line.rating) errors[`rating:${index}`] = 'Choose a rating.'
    if (!line.remark.trim()) errors[`remark:${index}`] = 'Add evidence for this rating.'
    else if (line.remark.length > LINE_REMARK_MAX) errors[`remark:${index}`] = `Keep the evidence within ${LINE_REMARK_MAX} characters.`
  })
  if (!form.overallRating) errors.overallRating = 'Choose the overall feedback.'
  if (!form.remark.trim()) errors.remark = 'Remark is required.'
  else if (form.remark.length > REMARK_MAX) errors.remark = `Keep the remark within ${REMARK_MAX} characters.`
  return errors
}

// The step that holds the first problem.
export function stepOfErrors(errors) {
  const keys = Object.keys(errors)
  if (keys.some((key) => ['department', 'employee', 'activityDate'].includes(key))) return 0
  if (keys.some((key) => key.startsWith('rating:') || key.startsWith('remark:'))) return 1
  return 2
}
