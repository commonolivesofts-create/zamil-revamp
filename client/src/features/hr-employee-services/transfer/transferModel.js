// Transfer Request (ZPI.TCN.FM.01) business rules. Pure functions, no I/O:
// the page, the demo adapter and the tests use the same rules.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const TRANSFER_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED', 'APPROVED'])
export const YES_NO = Object.freeze(['YES', 'NO'])
// Sign-off chain, in order (states: shared/approvals.js).
export const TRANSFER_ROUTE = Object.freeze(['NEW_DEPARTMENT_HEAD', 'OLD_DEPARTMENT_HEAD', 'NEW_DIRECTOR', 'HR_ADMIN_MANAGER', 'GENERAL_MANAGER'])
// "For IT & HR use only": completed after the chain approves; read-only for the requester.
export const OFFICE_APPROVALS = Object.freeze(['HR_SUPERVISOR', 'IT', 'ADMIN_MANAGER'])
// The three things a transfer can change.
export const MOVE_KEYS = Object.freeze(['jobTitleCode', 'departmentCode', 'sectionCode'])

export const isTransferLocked = (status) => status === 'SUBMITTED' || status === 'APPROVED'

// Sections of a department (they depend on the department).
export const sectionsOf = (departments, departmentCode) => departments.find((item) => item.code === departmentCode)?.sections ?? []

// What moves: the parts of "Transfer to" that are chosen and differ from now.
export function transferMoves(employee, to) {
  if (!employee) return []
  return MOVE_KEYS.filter((key) => Boolean(to[key]) && to[key] !== employee[key])
}

export const blankTransfer = (today, companyCode) => ({
  requestDate: today, companyCode, to: { jobTitleCode: '', departmentCode: '', sectionCode: '' }, effectiveDate: '', bloodType: '', directorId: '',
  salaryChange: '', budgetedSalary: '',
})

// After choosing the employee: the new job title starts as the current one and
// the blood type is prefilled from the employee record when it is known.
export function withTransferEmployee(form, employee) {
  return { ...form, to: { jobTitleCode: employee.jobTitleCode, departmentCode: '', sectionCode: '' }, bloodType: form.bloodType || employee.bloodType || '' }
}

// Choosing a department clears the section, which must belong to it.
export const withDestination = (to, key, value) => ({ ...to, [key]: value, ...(key === 'departmentCode' ? { sectionCode: '' } : {}) })

// Request body: only the requester's answers. Number, status, requester,
// employee snapshot and approval states are server values.
export function transferPayload(form, employee) {
  const orNull = (value) => value || null
  return {
    companyCode: orNull(form.companyCode),
    employeeId: employee?.employeeId ?? null,
    to: { jobTitleCode: orNull(form.to.jobTitleCode), departmentCode: orNull(form.to.departmentCode), sectionCode: orNull(form.to.sectionCode) },
    effectiveDate: orNull(form.effectiveDate),
    bloodType: orNull(form.bloodType),
    directorId: orNull(form.directorId),
    salaryChange: orNull(form.salaryChange),
    budgetedSalary: orNull(form.budgetedSalary),
  }
}

// Problems as { field, code, step } in step order (0 move, 1 details).
// `submit` adds the rules for a submission; a draft needs the employee only,
// and what it holds must be consistent (section of the department, date).
export function validateTransfer(form, employee, departments, { submit }) {
  const problems = []
  const add = (field, code, step) => problems.push({ field, code, step })
  const { to } = form
  if (!employee) add('employee', 'required', 0)
  if (submit && !to.jobTitleCode) add('jobTitleCode', 'required', 0)
  if (submit && !to.departmentCode) add('departmentCode', 'required', 0)
  if (submit && !to.sectionCode) add('sectionCode', 'required', 0)
  if (to.sectionCode && !sectionsOf(departments, to.departmentCode).some((item) => item.code === to.sectionCode)) add('sectionCode', 'notInDepartment', 0)
  if (submit && employee && to.jobTitleCode && to.departmentCode && to.sectionCode && !transferMoves(employee, to).length) add('to', 'noMove', 0)
  if (!form.effectiveDate) { if (submit) add('effectiveDate', 'required', 1) }
  else if (!isIsoDate(form.effectiveDate)) add('effectiveDate', 'invalid', 1)
  else if (employee && form.effectiveDate < employee.startDate) add('effectiveDate', 'beforeJoining', 1)
  if (submit && !form.directorId) add('directorId', 'required', 1)
  if (submit && !YES_NO.includes(form.salaryChange)) add('salaryChange', 'required', 1)
  if (submit && !YES_NO.includes(form.budgetedSalary)) add('budgetedSalary', 'required', 1)
  return problems
}

// Office approvals ("For IT & HR use only") as the server reports them: done
// with a date once the chain has approved, waiting before.
export function officeStates(status, date) {
  return OFFICE_APPROVALS.map((role) => (status === 'APPROVED' ? { role, state: 'APPROVED', date } : { role, state: 'WAITING', date: null }))
}
