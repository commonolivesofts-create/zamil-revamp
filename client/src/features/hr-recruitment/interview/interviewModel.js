// Interview Assessment (form 1061): fields, rating criteria, score bands,
// validation across the four tabs and the request body. Pure functions,
// testable in Node. The backend validates again and assigns the assessment
// number, status and admin manager.
import { INTERVIEW_TEXT } from '../hrRecruitmentText.js'

export const INTERVIEW_STATUSES = Object.freeze(['INCOMPLETE', 'COMPLETE', 'SUBMITTED'])
export const OUTCOMES = Object.freeze(['PASSED', 'HOLD', 'FAILED'])
export const SPEC_KEYS = Object.freeze(['conf', 'att', 'gk', 'exp', 'eng', 'comm', 'safe', 'health'])
export const COMP_KEYS = Object.freeze(['jrk', 'lead', 'press', 'nat', 'shift', 'ot'])
export const RATING_MAX = 5
export const SCORE_MAX = Object.freeze({ spec: SPEC_KEYS.length * RATING_MAX, comp: COMP_KEYS.length * RATING_MAX })
// [minimum total, band]: Personal specification 0–19 Poor, 20+ Good, 35+ Outstanding;
// Competency 0–14 Poor, 15+ Good, 25+ Outstanding.
export const BANDS = Object.freeze({
  spec: Object.freeze([Object.freeze([0, 'POOR']), Object.freeze([20, 'GOOD']), Object.freeze([35, 'OUTSTANDING'])]),
  comp: Object.freeze([Object.freeze([0, 'POOR']), Object.freeze([15, 'GOOD']), Object.freeze([25, 'OUTSTANDING'])]),
})

// HR tab fields: [key, input type, rules]; `lookup` names the option list.
export const HR_FIELDS = Object.freeze([
  ['requisitionNumber', 'text', { required: true }],
  ['preScreeningDate', 'date', { required: true }],
  ['divisionCode', 'select', { required: true, lookup: 'divisions' }],
  ['expectedJoiningDate', 'date', {}],
  ['interviewTypeCode', 'select', { required: true, lookup: 'interviewTypes' }],
  ['candidateName', 'text', { required: true }],
  ['candidateAge', 'number', { min: 18, max: 70 }],
  ['nationality', 'text', {}],
  ['maritalStatusCode', 'select', { lookup: 'maritalStatuses' }],
  ['location', 'text', {}],
  ['certificateCode', 'select', { lookup: 'certificates' }],
  ['major', 'text', {}],
  ['currentEmployer', 'text', {}],
  ['lastPosition', 'text', {}],
  ['relevantExperienceYears', 'number', { min: 0, max: 50 }],
  ['expectedBasic', 'number', { min: 0 }],
  ['expectedTotal', 'number', { min: 0 }],
  ['currentBasic', 'number', { min: 0 }],
  ['currentTotal', 'number', { min: 0 }],
].map((field) => Object.freeze(field)))

export const hrField = (key) => HR_FIELDS.find(([name]) => name === key)

export const isInterviewLocked = (status) => status === 'SUBMITTED'

const blankRatings = (keys) => Object.fromEntries(keys.map((key) => [key, { rating: null, remark: '' }]))

export function blankInterview(today, { payrollDefault = '', maritalDefault = '' } = {}) {
  const form = Object.fromEntries(HR_FIELDS.map(([key]) => [key, '']))
  return {
    ...form, preScreeningDate: today, maritalStatusCode: maritalDefault,
    spec: blankRatings(SPEC_KEYS), comp: blankRatings(COMP_KEYS), specRemarks: '', compRemarks: '', strengths: '', weakness: '',
    outcome: '', departmentRepresentative: '', payroll: payrollDefault, hrComment: '', interviewers: ['', '', ''],
  }
}

const textOf = (value) => (value === null || value === undefined ? '' : String(value))

export function interviewFormFromRecord(record) {
  const form = Object.fromEntries(HR_FIELDS.map(([key]) => [key, textOf(record[key])]))
  const ratings = (group, keys) => Object.fromEntries(keys.map((key) => [key, { rating: group[key].rating, remark: group[key].remark }]))
  return {
    ...form,
    spec: ratings(record.personalSpecification, SPEC_KEYS), comp: ratings(record.competency, COMP_KEYS),
    specRemarks: record.personalSpecificationRemarks, compRemarks: record.competencyRemarks,
    strengths: record.strengths, weakness: record.weakness, outcome: record.outcome ?? '',
    departmentRepresentative: record.departmentRepresentative, payroll: record.payroll, hrComment: record.hrComment,
    interviewers: [...record.interviewers],
  }
}

export function interviewPayload(form) {
  const body = {}
  for (const [key, type] of HR_FIELDS) {
    const value = String(form[key] ?? '').trim()
    if (type === 'number') body[key] = value === '' ? null : Number(value)
    else if (type === 'text') body[key] = value
    else body[key] = value || null
  }
  const ratings = (group, keys) => Object.fromEntries(keys.map((key) => [key, { rating: group[key].rating, remark: group[key].remark.trim() }]))
  return {
    ...body,
    personalSpecification: ratings(form.spec, SPEC_KEYS), personalSpecificationRemarks: form.specRemarks.trim(),
    competency: ratings(form.comp, COMP_KEYS), competencyRemarks: form.compRemarks.trim(),
    strengths: form.strengths.trim(), weakness: form.weakness.trim(), outcome: form.outcome || null,
    departmentRepresentative: form.departmentRepresentative.trim(), payroll: form.payroll.trim(), hrComment: form.hrComment.trim(),
    interviewers: form.interviewers.map((name) => name.trim()),
  }
}

export const sumRatings = (group) => Object.values(group).reduce((total, item) => total + (item?.rating || 0), 0)
export const ratedCount = (group, keys) => keys.filter((key) => group[key]?.rating).length

// [band index, band code]; [-1, null] while nothing is rated.
export function bandOf(total, bands, anyRated) {
  if (!anyRated) return [-1, null]
  let index = 0
  bands.forEach(([minimum], position) => { if (total >= minimum) index = position })
  return [index, bands[index][1]]
}

export function bandLabel(total, bands, anyRated) {
  const [, code] = bandOf(total, bands, anyRated)
  return code ? INTERVIEW_TEXT.bands[code] : INTERVIEW_TEXT.bands.notRated
}

export function interviewDoneSteps(form) {
  const hrDone = HR_FIELDS.filter(([, , rules]) => rules.required).every(([key]) => String(form[key] ?? '').trim())
  return [hrDone, ratedCount(form.spec, SPEC_KEYS) === SPEC_KEYS.length, ratedCount(form.comp, COMP_KEYS) === COMP_KEYS.length, OUTCOMES.includes(form.outcome)]
}

// The displayed status: a submitted assessment stays Submitted; otherwise it
// is Complete only when all four tabs are.
export function interviewStatus(form, savedStatus) {
  if (savedStatus === 'SUBMITTED') return 'SUBMITTED'
  return interviewDoneSteps(form).every(Boolean) ? 'COMPLETE' : 'INCOMPLETE'
}

export function interviewProgress(form) {
  const filled = HR_FIELDS.filter(([key]) => String(form[key] ?? '').trim()).length +
    ratedCount(form.spec, SPEC_KEYS) + ratedCount(form.comp, COMP_KEYS) + (form.outcome ? 1 : 0)
  return { filled, total: HR_FIELDS.length + SPEC_KEYS.length + COMP_KEYS.length + 1 }
}

// Field errors on the HR tab, missing ratings and result, and the first tab
// with a problem (-1 when the assessment can be saved).
export function validateInterview(form) {
  const text = INTERVIEW_TEXT
  const errors = {}
  for (const [key, type, rules] of HR_FIELDS) {
    const value = String(form[key] ?? '').trim()
    if (rules.required && !value) errors[key] = text.errors.required(text.labels[key])
    else if (value && type === 'number') {
      const number = Number(value)
      if (!Number.isFinite(number) || (rules.min != null && number < rules.min) || (rules.max != null && number > rules.max)) {
        errors[key] = text.errors.range(rules.min, rules.max)
      }
    }
  }
  const amount = (key) => (String(form[key] ?? '').trim() === '' ? null : Number(form[key]))
  if (!errors.expectedTotal && amount('expectedBasic') !== null && amount('expectedTotal') !== null && amount('expectedTotal') < amount('expectedBasic')) errors.expectedTotal = text.errors.total
  if (!errors.currentTotal && amount('currentBasic') !== null && amount('currentTotal') !== null && amount('currentTotal') < amount('currentBasic')) errors.currentTotal = text.errors.total
  if (form.expectedJoiningDate && form.preScreeningDate && form.expectedJoiningDate < form.preScreeningDate) errors.expectedJoiningDate = text.errors.joining
  const missing = {
    spec: SPEC_KEYS.filter((key) => !form.spec[key]?.rating),
    comp: COMP_KEYS.filter((key) => !form.comp[key]?.rating),
    outcome: !OUTCOMES.includes(form.outcome),
  }
  const firstStep = Object.keys(errors).length ? 0 : missing.spec.length ? 1 : missing.comp.length ? 2 : missing.outcome ? 3 : -1
  return { errors, missing, firstStep, valid: firstStep === -1 }
}

// Expected total versus current total, in percent (rounded), or null.
export function salaryDelta(expectedTotal, currentTotal) {
  const expected = Number(expectedTotal) || 0
  const current = Number(currentTotal) || 0
  return expected && current ? Math.round(((expected - current) / current) * 100) : null
}

// "Position apply for" comes from an approved requisition with this number
// (case-insensitive); anything else leaves it empty.
export function linkedPosition(requisitionNumber, requisition) {
  const number = String(requisitionNumber ?? '').trim().toLowerCase()
  if (!number || !requisition || !['SUBMITTED', 'Approved'].includes(requisition.status)) return ''
  return String(requisition.requisitionNumber ?? '').toLowerCase() === number ? requisition.jobTitle : ''
}
