// Annual Performance Appraisal business rules. Pure functions, no I/O: the
// page, the demo adapter and the tests use the same rules. The rating scale,
// the grade letters and the distribution come from the lookups, so they stay
// configurable; the defaults below are the values of the form.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const APPRAISAL_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED', 'INPROCESS'])
export const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'E'])
export const RATINGS = Object.freeze([1, 2, 3, 4, 5])
export const CRITERIA_COUNT = 20
export const GOALS_MIN = 3
export const GOALS_MAX = 5
export const TRAINING_MAX = 6
export const TEXT_MAX = 2000
export const EXPLANATION_MAX = 500

// Rating scale of the form: 4.25 & above A, 3.5–4.24 B, 2.5–3.49 C,
// 1.6–2.49 D, below E. The grade letters follow the same bands (an assumed
// mapping, see the README).
export const DEFAULT_SCALE = Object.freeze([
  Object.freeze({ min: 4.25, grade: 'A' }),
  Object.freeze({ min: 3.5, grade: 'B' }),
  Object.freeze({ min: 2.5, grade: 'C' }),
  Object.freeze({ min: 1.6, grade: 'D' }),
  Object.freeze({ min: 0, grade: 'E' }),
])
export const DEFAULT_DISTRIBUTION = Object.freeze({ A: 15, B: 30, C: 40, D: 10, E: 5 })

export const isAppraisalLocked = (status) => status === 'SUBMITTED' || status === 'INPROCESS'

// The band of an average: the first (highest) band whose minimum it reaches.
export function scaleFor(average, scale = DEFAULT_SCALE) {
  const ordered = [...scale].sort((a, b) => b.min - a.min)
  return ordered.find((band) => average >= band.min) ?? ordered.at(-1)
}

const ratingOf = (ratings, code) => ratings[code]?.rating ?? null

// Average of the rated criteria, to two decimals (null when none is rated).
// Submitting needs all of them, so the submitted rating is the average of all 20.
export function averageRating(ratings, criteria) {
  const values = criteria.map((item) => ratingOf(ratings, item.code)).filter((value) => RATINGS.includes(value))
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
}

export const ratedCount = (ratings, criteria) => criteria.filter((item) => RATINGS.includes(ratingOf(ratings, item.code))).length

// A rating of 1 or 5 must be explained.
export const needsExplanation = (rating) => rating === 1 || rating === 5
export const missingExplanations = (ratings, criteria) => criteria
  .filter((item) => needsExplanation(ratingOf(ratings, item.code)) && !String(ratings[item.code]?.explanation ?? '').trim())
  .map((item) => item.code)

// Employees allowed per grade: ceil(percentage × team size), at least 1.
export function gradeQuotas(teamSize, distribution = DEFAULT_DISTRIBUTION) {
  return Object.fromEntries(GRADES.map((grade) => [grade, Math.max(1, Math.ceil(((distribution[grade] ?? 0) / 100) * teamSize))]))
}

// Employees allocated per grade: the grades already given in the team (other
// members' saved grades) plus this employee's grade.
export function gradeAllocation(team, employeeId, grade) {
  const counts = Object.fromEntries(GRADES.map((item) => [item, 0]))
  for (const member of team) {
    const given = member.employeeId === employeeId ? grade : member.savedGrade
    if (given && GRADES.includes(given)) counts[given] += 1
  }
  if (grade && !team.some((member) => member.employeeId === employeeId)) counts[grade] += 1
  return counts
}

// Over a grade's share: a warning that needs the appraiser's remark (not a block).
export const isOverQuota = (grade, allocation, quotas) => Boolean(grade) && allocation[grade] > quotas[grade]

// Years from `from` to the period end or today, whichever is earlier, to one decimal.
export function yearsUntil(from, periodEnd, today) {
  if (!isIsoDate(from)) return null
  const to = periodEnd && periodEnd < today ? periodEnd : today
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5
  return Math.max(0, Math.floor((days / 365.25) * 10) / 10)
}

// The non-empty lines of a list editor.
export const filledLines = (lines) => lines.map((line) => line.trim()).filter(Boolean)

export const blankAppraisal = (periodCode) => ({
  periodCode, employeeId: '', ratings: {}, goals: ['', '', ''], training: [''], employeeRemarks: '', appraiserRemarks: '',
  signatures: { employee: null, appraiser: null },
})

// The grade, quotas and allocation of the form as it stands.
export function appraisalResult(form, criteria, team, scale, distribution, gradeStats = null) {
  const average = averageRating(form.ratings, criteria)
  const complete = ratedCount(form.ratings, criteria) === criteria.length
  const band = average === null ? null : scaleFor(average, scale)
  const quotas = gradeStats?.target ?? gradeQuotas(team.length, distribution)
  const allocation = gradeStats?.allocated
    ? Object.fromEntries(GRADES.map((grade) => [grade, (gradeStats.allocated[grade] ?? 0) + (complete && band.grade === grade ? 1 : 0)]))
    : gradeAllocation(team, form.employeeId, complete ? band.grade : null)
  return { average, complete, band, quotas, allocation, overQuota: complete && isOverQuota(band.grade, allocation, quotas) }
}

// Problems as { field, code, step } in step order (0 employee, 1 criteria,
// 2 result and development, 3 meeting). A draft needs the employee and texts
// within their limits; `submit` adds every rule of a submission.
export function validateAppraisal(form, { criteria, team, scale, distribution }, { submit, appraiserSignature = true }) {
  const problems = []
  const add = (field, code, step) => problems.push({ field, code, step })
  if (!team.some((member) => member.employeeId === form.employeeId)) add('employeeId', 'required', 0)
  for (const item of criteria) {
    const entry = form.ratings[item.code]
    if (submit && !RATINGS.includes(entry?.rating)) add(item.code, 'required', 1)
    else if (String(entry?.explanation ?? '').length > EXPLANATION_MAX) add(item.code, 'tooLong', 1)
    else if (submit && missingExplanations(form.ratings, [item]).length) add(item.code, 'explain', 1)
  }
  const goals = filledLines(form.goals)
  if (submit && goals.length < GOALS_MIN) add('goals', 'tooFew', 2)
  if (goals.length > GOALS_MAX) add('goals', 'tooMany', 2)
  if (filledLines(form.training).length > TRAINING_MAX) add('training', 'tooMany', 2)
  if (form.employeeRemarks.length > TEXT_MAX) add('employeeRemarks', 'tooLong', 3)
  if (form.appraiserRemarks.length > TEXT_MAX) add('appraiserRemarks', 'tooLong', 3)
  else if (submit && appraisalResult(form, criteria, team, scale, distribution).overQuota && !form.appraiserRemarks.trim()) add('appraiserRemarks', 'overQuota', 3)
  if (submit && appraiserSignature && !form.signatures.appraiser) add('appraiser', 'required', 3)
  return problems
}

// Request body: only the appraiser's answers. Number, status, appraiser,
// employee snapshot, rating and grade are server values.
export function appraisalPayload(form, criteria) {
  return {
    periodCode: form.periodCode,
    employeeId: form.employeeId || null,
    ratings: Object.fromEntries(criteria.map((item) => [item.code, {
      rating: RATINGS.includes(form.ratings[item.code]?.rating) ? form.ratings[item.code].rating : null,
      explanation: String(form.ratings[item.code]?.explanation ?? ''),
    }])),
    goals: filledLines(form.goals),
    training: filledLines(form.training),
    employeeRemarks: form.employeeRemarks,
    appraiserRemarks: form.appraiserRemarks,
    signatures: { employee: form.signatures.employee ?? null, appraiser: form.signatures.appraiser ?? null },
  }
}
