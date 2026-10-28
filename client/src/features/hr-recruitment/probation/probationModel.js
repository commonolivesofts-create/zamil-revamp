// Probation Evaluation (Performance Appraisal Form for the probation period,
// form 1064): points per criterion, total, pass mark, rating, recommendation,
// probation end and validation. Pure functions on YYYY-MM-DD dates (UTC). The
// form types, their criteria and the rating scale come from the server; the
// backend assigns the evaluation number and "prepared by".
import { PROBATION_TEXT } from '../hrRecruitmentText.js'
import { daysBetween, isIsoDate } from '../shared/hrFormat.js'

export const PROBATION_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED'])
export const RECOMMENDATIONS = Object.freeze(['CONFIRM', 'EXTEND', 'END'])
export const EXTENSIONS = Object.freeze([1, 2, 3])
export const SIGNATURE_KEYS = Object.freeze(['evaluator', 'employee'])
// Result: 71–100 % Acceptable, 0–70 % Not acceptable.
export const PASS_MARK = 71
// Below this, the suggested recommendation is to end employment.
export const EXTEND_FROM = 51
export const PROBATION_MONTHS = 3
// Quick picks: 0/25/50/75/100 % of a criterion's allocation.
export const QUICK_PICKS = Object.freeze([0, 0.25, 0.5, 0.75, 1])

export const isProbationLocked = (status) => status === 'SUBMITTED'

// Calendar months later (JavaScript month arithmetic, as in the original form:
// a day that does not exist in the target month rolls into the next month).
export function addMonths(iso, months) {
  if (!isIsoDate(iso)) return ''
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

// Whole points clamped to 0..allocated; an empty entry stays empty.
export function clampPoints(value, allocated) {
  if (value === '' || value === null || value === undefined) return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return Math.max(0, Math.min(allocated, Math.round(number)))
}
export const quickPoints = (allocated, fraction) => Math.round(allocated * fraction)

const isScored = (value) => value !== '' && value !== null && value !== undefined

// Total points, allocation, scored count and the percentage of the allocation.
export function evaluationTotals(criteria, scores) {
  const allocated = criteria.reduce((sum, criterion) => sum + criterion.points, 0)
  const total = criteria.reduce((sum, criterion) => sum + (Number(scores[criterion.code]) || 0), 0)
  const scored = criteria.filter((criterion) => isScored(scores[criterion.code])).length
  const complete = criteria.length > 0 && scored === criteria.length
  const percent = allocated ? Math.round((total / allocated) * 100) : 0
  return { total, allocated, scored, complete, percent, acceptable: complete && percent >= PASS_MARK }
}

export const resultFor = (percent) => (percent >= PASS_MARK ? 'ACCEPTABLE' : 'NOT_ACCEPTABLE')

// The highest rating band whose minimum the percentage reaches.
export function ratingFor(percent, scale) {
  const ordered = [...scale].sort((a, b) => a.min - b.min)
  return ordered.reduce((found, band) => (percent >= band.min ? band : found), ordered[0] ?? null)
}

// Suggested from the score: confirm when acceptable, extend from 51 %, else end.
export function suggestedRecommendation(totals) {
  if (!totals.complete) return ''
  if (totals.percent >= PASS_MARK) return 'CONFIRM'
  return totals.percent >= EXTEND_FROM ? 'EXTEND' : 'END'
}

// A justification is required when the recommendation contradicts the result.
export function contradictsResult(recommendation, totals) {
  if (!totals.complete || !recommendation) return false
  const acceptable = totals.percent >= PASS_MARK
  return (acceptable && recommendation === 'END') || (!acceptable && recommendation === 'CONFIRM')
}

// Probation ends 3 months after joining, plus the extension when extending.
export function probationEnd(joiningDate, recommendation = '', extendBy = '') {
  const extra = recommendation === 'EXTEND' ? Number(extendBy) || 0 : 0
  return addMonths(joiningDate, PROBATION_MONTHS + extra)
}

// Share of the probation already elapsed (0..1) on `today`.
export function probationElapsed(joiningDate, endDate, today) {
  const length = daysBetween(joiningDate, endDate)
  const done = daysBetween(joiningDate, today)
  if (!length || done === null) return 0
  return Math.min(1, Math.max(0, done / length))
}

export function blankProbation() {
  return {
    formTypeCode: '', employeeId: '', fromDate: '', toDate: '', scores: {}, notes: {}, strengths: '', improvements: '', training: '',
    recommendation: '', extendBy: '', justification: '', comments: '', suggestion: '', signatures: { evaluator: null, employee: null },
  }
}

// Choosing an employee fills an empty form type and period from their record.
export function withEmployee(form, employee) {
  return {
    ...form,
    employeeId: employee.employeeId,
    formTypeCode: form.formTypeCode || employee.evaluationFormCode || '',
    fromDate: form.fromDate || employee.startDate || '',
    toDate: form.toDate || addMonths(employee.startDate, PROBATION_MONTHS),
  }
}

// Changing the form type clears points and notes of another type.
export function withFormType(form, code) {
  if (form.formTypeCode === code) return form
  return { ...form, formTypeCode: code, scores: {}, notes: {} }
}

// Errors for saving (setup and every criterion scored) and, for submitting,
// the recommendation, extension, justification and evaluator signature.
export function validateProbation(form, { employee, criteria }, { submit = false } = {}) {
  const text = PROBATION_TEXT.errors
  const errors = {}
  if (!form.formTypeCode) errors.formTypeCode = text.type
  if (!form.employeeId) errors.employeeId = text.employee
  if (!form.fromDate) errors.fromDate = text.from
  if (!form.toDate) errors.toDate = text.to
  if (form.fromDate && form.toDate && form.toDate < form.fromDate) errors.toDate = text.toBeforeFrom
  if (employee && form.fromDate && form.fromDate < employee.startDate) errors.fromDate = text.beforeJoining
  for (const criterion of criteria) {
    if (!isScored(form.scores[criterion.code])) errors[`criterion:${criterion.code}`] = text.criterion
  }
  if (submit) {
    const totals = evaluationTotals(criteria, form.scores)
    if (!form.recommendation) errors.recommendation = text.recommendation
    if (form.recommendation === 'EXTEND' && !form.extendBy) errors.extendBy = text.extendBy
    if (contradictsResult(form.recommendation, totals) && !form.justification.trim()) errors.justification = text.justification
    if (!form.signatures.evaluator) errors.evaluatorSignature = text.signature
  }
  const stepOf = (key) => (['formTypeCode', 'employeeId', 'fromDate', 'toDate'].includes(key) ? 0
    : key.startsWith('criterion:') ? 1 : ['recommendation', 'extendBy', 'justification'].includes(key) ? 2 : 3)
  const keys = Object.keys(errors)
  return { errors, firstStep: keys.length ? Math.min(...keys.map(stepOf)) : -1, valid: keys.length === 0 }
}

export function probationPayload(form) {
  return {
    formTypeCode: form.formTypeCode || null,
    employeeId: form.employeeId || null,
    fromDate: form.fromDate || null,
    toDate: form.toDate || null,
    scores: Object.fromEntries(Object.entries(form.scores).filter(([, value]) => isScored(value)).map(([code, value]) => [code, Number(value)])),
    notes: Object.fromEntries(Object.entries(form.notes).map(([code, note]) => [code, note.trim()]).filter(([, note]) => note)),
    strengths: form.strengths.trim(), improvements: form.improvements.trim(), training: form.training.trim(),
    recommendation: form.recommendation || null,
    extendByMonths: form.recommendation === 'EXTEND' && form.extendBy ? Number(form.extendBy) : null,
    justification: form.justification.trim(), comments: form.comments.trim(), suggestion: form.suggestion.trim(),
    signatures: { evaluator: form.signatures.evaluator ?? null, employee: form.signatures.employee ?? null },
  }
}

export function probationFormFromRecord(record) {
  return {
    formTypeCode: record.formTypeCode ?? '', employeeId: record.employee.employeeId, fromDate: record.fromDate ?? '', toDate: record.toDate ?? '',
    scores: { ...record.scores }, notes: { ...record.notes }, strengths: record.strengths, improvements: record.improvements, training: record.training,
    recommendation: record.recommendation ?? '', extendBy: record.extendByMonths ? String(record.extendByMonths) : '', justification: record.justification,
    comments: record.comments, suggestion: record.suggestion, signatures: { ...record.signatures },
  }
}
