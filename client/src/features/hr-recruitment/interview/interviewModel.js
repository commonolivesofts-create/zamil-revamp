// Interview Assessment (form 1061): fields, rating criteria, score bands,
// validation across the four tabs and the request body. Pure functions,
// testable in Node. The backend validates again and assigns the assessment
// number, status and admin manager.
import { INTERVIEW_TEXT } from '../hrRecruitmentText.js'
import { isIsoDate } from '../shared/hrFormat.js'
import { normalizeNotes, normalizeShortText, textLimitError } from '../shared/formValidation.js'

export const INTERVIEW_STATUSES = Object.freeze(['INCOMPLETE', 'INPROCESS', 'APPROVED', 'REJECTED', 'COMPLETE', 'SUBMITTED'])
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
  ['interviewTime', 'time', {}],
  ['divisionCode', 'select', { required: true, lookup: 'divisions' }],
  ['expectedJoiningDate', 'date', {}],
  ['interviewTypeCode', 'select', { required: true, lookup: 'interviewTypes' }],
  ['candidateName', 'text', { required: true }],
  ['candidateAge', 'number', { min: 18, max: 70 }],
  ['nationality', 'text', {}],
  ['maritalStatusCode', 'select', { lookup: 'maritalStatuses' }],
  ['location', 'text', {}],
  ['certificateCode', 'select', { lookup: 'certificates' }],
  ['certificateCheckedCode', 'select', { lookup: 'certificateChecks' }],
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

const INTERVIEW_API_FIELDS = {
  candidateName: 'candidateName', requisitionNo: 'requisitionNumber', positionName: 'requisitionNumber',
  interviewDate: 'preScreeningDate', interviewTime: 'interviewTime', division: 'divisionCode', joining: 'expectedJoiningDate',
  interviewType: 'interviewTypeCode', nationality: 'nationality', materialStatus: 'maritalStatusCode', age: 'candidateAge',
  secondaryEducation: 'certificateCode', secondaryEducationChk: 'certificateCheckedCode', lastPositionHeld: 'lastPosition',
  companyName: 'currentEmployer', currentEmployer: 'currentEmployer', relevantYearsExperience: 'relevantExperienceYears',
  location: 'location', major: 'major', curSalBasic: 'currentBasic', expSalBasic: 'expectedBasic',
  curSalTotal: 'currentTotal', expSalTotal: 'expectedTotal',
}
export const INTERVIEW_VALIDATION_FIELDS = Object.freeze(Object.fromEntries([
  ...Object.entries(INTERVIEW_API_FIELDS).map(([api, key]) => [api, { key, step: 0, label: INTERVIEW_TEXT.labels[key] }]),
  ...['attribute3', 'payroll'].map((api) => [api, { key: 'payroll', step: 3, label: 'Payroll business unit' }]),
  ['evaluation.status', { key: 'outcome', step: 3, label: 'Result' }],
  ['evaluation.interviewedBy', { key: 'interviewer0', step: 3, label: 'Interviewer 1', fields: ['interviewers.0'] }],
  ...[['adminManager', 'adminManagerName'], ['managningDirector', 'managingDirector'], ['hrRep', 'hrRepresentative'], ['deptRep', 'departmentRepresentative'], ['comment', 'hrComment']].map(([api, key]) => [`evaluation.${api}`, { key, step: 3, label: key }]),
  ...['interviewedBy', 'interviewedBy2', 'interviewedBy3'].map((api, index) => [api, { key: `interviewer${index}`, step: 3, label: `Interviewer ${index + 1}`, fields: [`interviewers.${index}`] }]),
  ...[['personalSpec', 'spec', SPEC_KEYS, 'rate', 'remark', 1], ['jobCompetency', 'comp', COMP_KEYS, 'cRating', 'cRemark', 2]].flatMap(([api, group, keys, rate, remark, step]) => keys.flatMap((key, index) => [
    [`${api}.${rate}${index + 1}`, { key: `${group}.${key}`, step, label: INTERVIEW_TEXT.criteria[key][0], fields: [`${group}.${key}.rating`] }],
    [`${api}.${remark}${index + 1}`, { key: `${group}.${key}.remark`, step, label: 'Remark', fields: [`${group}.${key}.remark`] }],
  ])),
  ...[['personalSpec.remarks', 'specRemarks', 1], ['jobCompetency.cRemarks', 'compRemarks', 2], ['jobCompetency.sumStrength', 'strengths', 2], ['jobCompetency.sumWeekness', 'weakness', 2]].map(([api, key, step]) => [api, { key, step, label: INTERVIEW_TEXT.labels[key] }]),
]))

export const isInterviewLocked = (status) => status === 'SUBMITTED'
export const canCreateEmploymentOffer = (record) => Boolean(record?.status === 'APPROVED' && record?.outcome === 'PASSED' && record?.assessmentNumber)

const blankRatings = (keys) => Object.fromEntries(keys.map((key) => [key, { rating: null, remark: '' }]))

export function blankInterview(today) {
  const form = Object.fromEntries(HR_FIELDS.map(([key]) => [key, '']))
  return {
    ...form, preScreeningDate: today,
    spec: blankRatings(SPEC_KEYS), comp: blankRatings(COMP_KEYS), specRemarks: '', compRemarks: '', strengths: '', weakness: '',
    outcome: '', adminManagerName: '', managingDirector: '', hrRepresentative: '', departmentRepresentative: '',
    payroll: '', hrComment: '', interviewers: ['', '', ''],
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
    adminManagerName: record.adminManagerName ?? '', managingDirector: record.managingDirector ?? '', hrRepresentative: record.hrRepresentative ?? '',
    departmentRepresentative: record.departmentRepresentative, payroll: record.payroll, hrComment: record.hrComment,
    interviewers: [...record.interviewers],
  }
}

export function interviewPayload(form) {
  const body = {}
  for (const [key, type] of HR_FIELDS) {
    const value = type === 'text' ? normalizeShortText(form[key]) : String(form[key] ?? '').trim()
    if (type === 'number') body[key] = value === '' ? null : Number(value)
    else if (type === 'text') body[key] = value
    else body[key] = value || null
  }
  const ratings = (group, keys) => Object.fromEntries(keys.map((key) => [key, { rating: group[key].rating, remark: normalizeShortText(group[key].remark) }]))
  return {
    ...body,
    personalSpecification: ratings(form.spec, SPEC_KEYS), personalSpecificationRemarks: normalizeShortText(form.specRemarks),
    competency: ratings(form.comp, COMP_KEYS), competencyRemarks: normalizeShortText(form.compRemarks),
    strengths: normalizeNotes(form.strengths), weakness: normalizeNotes(form.weakness), outcome: form.outcome || null,
    adminManagerName: form.adminManagerName, managingDirector: form.managingDirector, hrRepresentative: form.hrRepresentative,
    departmentRepresentative: normalizeShortText(form.departmentRepresentative), payroll: form.payroll.trim(), hrComment: normalizeShortText(form.hrComment),
    interviewers: form.interviewers.map(normalizeShortText),
  }
}

export const sumRatings = (group) => Object.values(group).reduce((total, item) => total + (Number.isInteger(item?.rating) ? item.rating : 0), 0)
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
  if (savedStatus) return savedStatus
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
      const whole = ['candidateAge', 'relevantExperienceYears'].includes(key)
      if ((whole && !/^\d+$/.test(value)) || (!whole && !/^\d+(?:\.\d{1,2})?$/.test(value)) || !Number.isFinite(number) || (rules.min != null && number < rules.min) || (rules.max != null && number > rules.max)) {
        errors[key] = key === 'candidateAge' ? 'Enter a whole-number age from 18 to 70.'
          : key === 'relevantExperienceYears' ? 'Enter whole years of experience from 0 to 50.'
            : 'Enter a nonnegative amount with up to two decimal places.'
      }
    }
    if (value && type === 'date' && !isIsoDate(value)) errors[key] = 'Enter a valid date.'
  }
  const amount = (key) => (String(form[key] ?? '').trim() === '' ? null : Number(form[key]))
  if (!errors.expectedTotal && amount('expectedBasic') !== null && amount('expectedTotal') !== null && amount('expectedTotal') < amount('expectedBasic')) errors.expectedTotal = text.errors.total
  if (!errors.currentTotal && amount('currentBasic') !== null && amount('currentTotal') !== null && amount('currentTotal') < amount('currentBasic')) errors.currentTotal = text.errors.total
  if (form.expectedJoiningDate && form.preScreeningDate && form.expectedJoiningDate < form.preScreeningDate) errors.expectedJoiningDate = text.errors.joining
  const check = (key, value, limit, label, { multiline = false } = {}) => {
    const message = textLimitError(value, limit, label, { multiline })
    if (message) errors[key] = message
  }
  for (const [key, limit] of Object.entries({ requisitionNumber: 50, candidateName: 200, nationality: 100, location: 100, major: 100, currentEmployer: 200, lastPosition: 200 })) {
    check(key, form[key], limit, text.labels[key])
  }
  for (const [group, keys] of [['spec', SPEC_KEYS], ['comp', COMP_KEYS]]) {
    keys.forEach((key) => check(`${group}.${key}.remark`, form[group][key]?.remark, 200, `${text.criteria[key][0]} remark`))
  }
  check('strengths', form.strengths, 200, text.labels.strengths, { multiline: true })
  check('weakness', form.weakness, 200, text.labels.weakness, { multiline: true })
  check('departmentRepresentative', form.departmentRepresentative, 50, text.labels.deptRep)
  check('hrComment', form.hrComment, 50, text.labels.hrComment)
  form.interviewers.forEach((name, index) => check(`interviewer${index}`, name, index === 0 ? 50 : 200, text.labels.interviewer(index)))
  const missing = {
    spec: SPEC_KEYS.filter((key) => ![1, 2, 3, 4, 5, 'N/A'].includes(form.spec[key]?.rating)),
    comp: COMP_KEYS.filter((key) => ![1, 2, 3, 4, 5, 'N/A'].includes(form.comp[key]?.rating)),
    outcome: !OUTCOMES.includes(form.outcome),
  }
  const hrInvalid = Object.keys(errors).some((key) => HR_FIELDS.some(([field]) => field === key))
  if (!form.payroll.trim()) errors.payroll = 'Choose a payroll business unit.'
  const firstStep = hrInvalid ? 0 : missing.spec.length || SPEC_KEYS.some((key) => errors[`spec.${key}.remark`]) ? 1
    : missing.comp.length || COMP_KEYS.some((key) => errors[`comp.${key}.remark`]) || errors.strengths || errors.weakness ? 2
      : missing.outcome || errors.payroll || errors.departmentRepresentative || errors.hrComment || form.interviewers.some((_, index) => errors[`interviewer${index}`]) ? 3 : -1
  return { errors, missing, firstStep, valid: firstStep === -1 }
}

export function interviewStepErrors(form) {
  const { errors, missing } = validateInterview(form)
  const { payroll, strengths, weakness, departmentRepresentative, hrComment, interviewer0, interviewer1, interviewer2, ...remaining } = errors
  const hrErrors = Object.fromEntries(Object.entries(remaining).filter(([key]) => !key.startsWith('spec.') && !key.startsWith('comp.')))
  return [
    hrErrors,
    { ...Object.fromEntries(missing.spec.map((key) => [`spec.${key}`, 'Choose a rating from 1 to 5 or N/A.'])), ...Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith('spec.'))) },
    { ...Object.fromEntries(missing.comp.map((key) => [`comp.${key}`, 'Choose a rating from 1 to 5 or N/A.'])), ...Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith('comp.'))), ...(strengths ? { strengths } : {}), ...(weakness ? { weakness } : {}) },
    { ...(payroll ? { payroll } : {}), ...(missing.outcome ? { outcome: INTERVIEW_TEXT.errors.outcome } : {}), ...(departmentRepresentative ? { departmentRepresentative } : {}), ...(hrComment ? { hrComment } : {}), ...(interviewer0 ? { interviewer0 } : {}), ...(interviewer1 ? { interviewer1 } : {}), ...(interviewer2 ? { interviewer2 } : {}) },
    {},
  ]
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
