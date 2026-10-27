// Response readers for the HR recruitment API (proposed contract, see the
// feature README). Each reader keeps only documented fields, keeps Oracle IDs
// as decimal strings and rejects a malformed response as a whole. The demo
// adapter returns the same shapes and is read through the same functions.
import { ApiError } from '../../services/api/apiClient.js'
import { isIsoDate } from './shared/hrFormat.js'
import { REQUISITION_STATUSES, REASONS } from './requisition/requisitionModel.js'
import { COMP_KEYS, HR_FIELDS, INTERVIEW_STATUSES, OUTCOMES, SPEC_KEYS } from './interview/interviewModel.js'
import { BENEFIT_KEYS, OFFER_STATUSES, SALUTATIONS, SIGNATURE_ROLES } from './offer/offerModel.js'

export const ID_PATTERN = /^[1-9][0-9]{0,18}$/
export const LOOKUP_CODE = /^[A-Za-z0-9_-]{1,40}$/
const CURRENCY = /^[A-Z]{3}$/

function invalid() {
  throw new ApiError('The server returned an unexpected response.', { code: 'INVALID_RESPONSE' })
}
const check = (condition) => { if (!condition) invalid() }
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const id = (value) => { check(typeof value === 'string' && ID_PATTERN.test(value)); return value }
const text = (value, max = 4000) => { check(typeof value === 'string' && value.length <= max); return value }
const nullableText = (value, max = 4000) => (value === null ? null : text(value, max))
const date = (value) => { check(value === null || isIsoDate(value)); return value }
const instant = (value) => { check(typeof value === 'string' && !Number.isNaN(Date.parse(value))); return value }
const nullableInstant = (value) => (value === null ? null : instant(value))
const amount = (value) => { check(value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)); return value }
const oneOf = (value, allowed, { nullable = false } = {}) => { check((nullable && value === null) || allowed.includes(value)); return value }
const code = (value) => { check(value === null || (typeof value === 'string' && LOOKUP_CODE.test(value))); return value }
const textList = (value, max = 120) => { check(Array.isArray(value)); return Object.freeze(value.map((item) => text(item, max))) }
const codeList = (value) => { check(Array.isArray(value)); return Object.freeze(value.map((item) => { check(item !== null); return code(item) })) }
const currency = (value) => { check(typeof value === 'string' && CURRENCY.test(value)); return value }
const nullableBoolean = (value) => { check(value === null || typeof value === 'boolean'); return value }

const option = (item) => {
  check(isObject(item))
  return Object.freeze({ code: code(item.code) ?? invalid(), name: text(item.name, 200) })
}
const options = (list) => { check(Array.isArray(list)); return Object.freeze(list.map(option)) }
const routeStep = (step) => {
  check(isObject(step))
  return Object.freeze({ code: code(step.code) ?? invalid(), label: text(step.label, 120), note: text(step.note, 200) })
}

export function readLookups(data) {
  check(isObject(data) && isObject(data.approvalRoute) && isObject(data.offer) && isObject(data.interview))
  check(Array.isArray(data.educationLevels) && Array.isArray(data.approvalRoute.steps) && Array.isArray(data.offer.signatories))
  const { offer } = data
  check(isObject(offer.probation))
  const signatories = offer.signatories.map((item) => {
    check(isObject(item))
    return Object.freeze({ role: oneOf(item.role, ['HR_MANAGER', 'GENERAL_MANAGER']), name: text(item.name, 120), title: text(item.title, 120) })
  })
  check(['HR_MANAGER', 'GENERAL_MANAGER'].every((role) => signatories.some((item) => item.role === role)))
  return Object.freeze({
    departments: options(data.departments),
    divisions: options(data.divisions),
    interviewTypes: options(data.interviewTypes),
    certificates: options(data.certificates),
    maritalStatuses: options(data.maritalStatuses),
    experienceBands: options(data.experienceBands),
    educationLevels: Object.freeze(data.educationLevels.map((item) => {
      check(isObject(item) && Number.isInteger(item.level) && item.level >= 1 && item.level <= 5)
      return Object.freeze({ ...option(item), level: item.level })
    })),
    approvalRoute: Object.freeze({
      steps: Object.freeze(data.approvalRoute.steps.map(routeStep)),
      unbudgetedStep: data.approvalRoute.unbudgetedStep === null ? null : routeStep(data.approvalRoute.unbudgetedStep),
    }),
    interview: Object.freeze({ payrollDefault: text(data.interview.payrollDefault, 60) }),
    offer: Object.freeze({
      currency: currency(offer.currency),
      reportFormat: text(offer.reportFormat, 60),
      probation: Object.freeze({ en: text(offer.probation.en, 300), ar: text(offer.probation.ar, 300) }),
      signatories: Object.freeze(signatories),
    }),
  })
}

const attachment = (item) => {
  check(isObject(item) && Number.isInteger(item.sizeBytes) && item.sizeBytes >= 0)
  return Object.freeze({ fileName: text(item.fileName, 255), sizeBytes: item.sizeBytes })
}

export function readRequisition(data) {
  check(isObject(data) && Array.isArray(data.attachments))
  return Object.freeze({
    requisitionId: id(data.requisitionId),
    requisitionNumber: nullableText(data.requisitionNumber, 40),
    status: oneOf(data.status, REQUISITION_STATUSES),
    requesterName: nullableText(data.requesterName, 200),
    requestDate: date(data.requestDate),
    jobTitle: text(data.jobTitle, 200),
    departmentCode: code(data.departmentCode),
    neededDate: date(data.neededDate),
    remark: text(data.remark),
    reason: oneOf(data.reason, REASONS, { nullable: true }),
    replacementFor: text(data.replacementFor, 200),
    additionReason: text(data.additionReason),
    budgeted: nullableBoolean(data.budgeted),
    budgetedSalary: amount(data.budgetedSalary),
    basicSalary: amount(data.basicSalary),
    educationCodes: codeList(data.educationCodes),
    gccExperienceCode: code(data.gccExperienceCode),
    workExperienceCode: code(data.workExperienceCode),
    skills: textList(data.skills, 40),
    otherRequirements: text(data.otherRequirements),
    attachments: Object.freeze(data.attachments.map(attachment)),
    updatedAt: instant(data.updatedAt),
  })
}

export function readRequisitionListItem(data) {
  check(isObject(data))
  return Object.freeze({
    requisitionId: id(data.requisitionId),
    requisitionNumber: nullableText(data.requisitionNumber, 40),
    status: oneOf(data.status, REQUISITION_STATUSES),
    jobTitle: text(data.jobTitle, 200),
    departmentCode: code(data.departmentCode),
    updatedAt: instant(data.updatedAt),
  })
}

const ratings = (group, keys) => {
  check(isObject(group))
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    const item = group[key]
    check(isObject(item) && (item.rating === null || (Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5)))
    return [key, Object.freeze({ rating: item.rating, remark: text(item.remark, 500) })]
  })))
}

export function readInterview(data) {
  check(isObject(data) && Array.isArray(data.interviewers) && data.interviewers.length === 3)
  const fields = {}
  for (const [key, type] of HR_FIELDS) {
    const value = data[key]
    if (type === 'number') fields[key] = amount(value)
    else if (type === 'date') fields[key] = date(value)
    else if (type === 'select') fields[key] = code(value)
    else fields[key] = text(value, 200)
  }
  return Object.freeze({
    assessmentId: id(data.assessmentId),
    assessmentNumber: nullableText(data.assessmentNumber, 40),
    status: oneOf(data.status, INTERVIEW_STATUSES),
    positionTitle: nullableText(data.positionTitle, 200),
    ...fields,
    personalSpecification: ratings(data.personalSpecification, SPEC_KEYS),
    personalSpecificationRemarks: text(data.personalSpecificationRemarks, 1000),
    competency: ratings(data.competency, COMP_KEYS),
    competencyRemarks: text(data.competencyRemarks, 1000),
    strengths: text(data.strengths),
    weakness: text(data.weakness),
    outcome: oneOf(data.outcome, OUTCOMES, { nullable: true }),
    adminManagerName: nullableText(data.adminManagerName, 200),
    departmentRepresentative: text(data.departmentRepresentative, 200),
    payroll: text(data.payroll, 60),
    hrComment: text(data.hrComment, 1000),
    interviewers: textList(data.interviewers, 200),
    updatedAt: instant(data.updatedAt),
  })
}

export function readInterviewListItem(data) {
  check(isObject(data))
  return Object.freeze({
    assessmentId: id(data.assessmentId),
    assessmentNumber: nullableText(data.assessmentNumber, 40),
    status: oneOf(data.status, INTERVIEW_STATUSES),
    candidateName: text(data.candidateName, 200),
    positionTitle: nullableText(data.positionTitle, 200),
    outcome: oneOf(data.outcome, OUTCOMES, { nullable: true }),
    updatedAt: instant(data.updatedAt),
  })
}

export function readOffer(data) {
  check(isObject(data) && isObject(data.benefits) && isObject(data.signatures))
  return Object.freeze({
    offerId: id(data.offerId),
    offerNumber: nullableText(data.offerNumber, 40),
    status: oneOf(data.status, OFFER_STATUSES),
    position: text(data.position, 200),
    offerDate: date(data.offerDate),
    reportFormat: text(data.reportFormat, 60),
    salutation: oneOf(data.salutation, SALUTATIONS),
    candidateNameEn: text(data.candidateNameEn, 200),
    candidateNameAr: text(data.candidateNameAr, 200),
    benefits: Object.freeze(Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = data.benefits[key]
      check(isObject(row) && typeof row.autoArabic === 'boolean')
      return [key, Object.freeze({ en: text(row.en, 300), ar: text(row.ar, 300), autoArabic: row.autoArabic })]
    }))),
    comments: text(data.comments),
    signatures: Object.freeze(Object.fromEntries(SIGNATURE_ROLES.map((role) => [role, nullableInstant(data.signatures[role])]))),
    currency: currency(data.currency),
    updatedAt: instant(data.updatedAt),
  })
}

export function readOfferListItem(data) {
  check(isObject(data))
  return Object.freeze({
    offerId: id(data.offerId),
    offerNumber: nullableText(data.offerNumber, 40),
    status: oneOf(data.status, OFFER_STATUSES),
    position: text(data.position, 200),
    candidateNameEn: text(data.candidateNameEn, 200),
    updatedAt: instant(data.updatedAt),
  })
}

// `result` is the client result: { data, pagination } (pagination already validated).
export function readPage(result, reader) {
  if (!Array.isArray(result?.data) || !result.pagination) invalid()
  return Object.freeze({ items: Object.freeze(result.data.map(reader)), pagination: result.pagination })
}
