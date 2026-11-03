// Rules of the live Probation Evaluation form (1064), taken from the legacy CI3 form
// (views/probation/probation.php to create, prf_uplines.php to edit a saved evaluation).
import { resultFor } from './probationModel.js'

export const RESULT_TEXT = Object.freeze({ ACCEPTABLE: 'Acceptable', NOT_ACCEPTABLE: 'Not Acceptable' })
export const RESULT_TONE = Object.freeze({ ACCEPTABLE: 'ok', NOT_ACCEPTABLE: 'warn' })

// The legacy dropSelect values and their labels.
export const FORM_TYPE_LABELS = Object.freeze({
  Workers_Technicians: 'Workers_Technicians',
  Trainee: 'Trainee',
  Engineers_Staff: 'Engineers & Staff',
  Department_Managers: 'Department Managers',
  Supervisors_and_Foremens: 'Supervisors and Foremens',
})
export const formTypeLabel = (code) => FORM_TYPE_LABELS[code] ?? (code || '')

// Every criterion is worth 5 points ("Allocated"); 20 criteria make 100.
export const ALLOCATED_POINTS = 5

// Legacy band of the total rating: 71–100 Acceptable, 0–70 Not Acceptable.
export const evaluationResult = (total) => resultFor(Number(total) || 0)

export const totalRating = (lines) => lines.reduce((sum, line) => sum + (Number(line.rating) || 0), 0)

// The result shows once a criterion is rated (an unrated form has no result yet).
export function formResult(lines) {
  if (!lines.some((line) => line.rating !== '' && line.rating != null)) return null
  return evaluationResult(totalRating(lines))
}

// Draft and Rejected evaluations can be saved again; the legacy workflow cannot be restarted while
// a request is Inprocess or Approved, so those are read only.
export const isEditable = (status) => ['DRAFT', 'REJECTED'].includes(String(status ?? '').toUpperCase())

// The legacy "Approved by" box shows HR SUPERVISOR once the request is approved.
export const approvedBy = (status) => (String(status ?? '').toUpperCase() === 'APPROVED' ? 'HR SUPERVISOR' : '')

const blank = (value) => !String(value ?? '').trim()

// The legacy create form: the form type, the employee and the period From / To are needed; the
// criteria come from the form type and their ratings are optional. Keys: the field with the error.
export function validateForCreate(form, { employee, criteria }) {
  const errors = {}
  if (!form.formType) errors.formType = 'Select Form Type.'
  else if (!criteria.length) errors.formType = 'The criteria of this form type are not available.'
  if (!employee?.name || !employee?.employeeNumber) errors.employee = 'Select Employee.'
  if (!form.fromDate) errors.fromDate = 'Evaluation period From is required.'
  if (!form.toDate) errors.toDate = 'Evaluation period To is required.'
  if (form.fromDate && form.toDate && form.toDate < form.fromDate) errors.toDate = 'To must be on or after From.'
  return { errors, valid: Object.keys(errors).length === 0 }
}

// The legacy edit form (and the submit that follows it): Comments, Suggestion and a 1–5 rating on
// every criterion are required.
export function validateForSubmit(form) {
  const errors = {}
  if (blank(form.comment)) errors.comment = 'Comments are required.'
  if (blank(form.comments)) errors.comments = 'Suggestion is required.'
  form.lines.forEach((line, index) => {
    const rating = Number(line.rating)
    if (line.rating === '' || line.rating == null || !Number.isInteger(rating) || rating < 1 || rating > 5) errors[`rating:${index}`] = 'Rate this criterion from 1 to 5.'
  })
  return { errors, valid: Object.keys(errors).length === 0 }
}
