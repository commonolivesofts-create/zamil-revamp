// Response readers for the HR recruitment API (proposed contract, see the
// feature README). Each reader keeps only documented fields, keeps Oracle IDs
// as decimal strings and rejects a malformed response as a whole. The demo
// adapter returns the same shapes and is read through the same functions.
import { ApiError } from '../../services/api/apiClient.js'
import { isIsoDate } from './shared/hrFormat.js'
import { REQUISITION_STATUSES, REASONS } from './requisition/requisitionModel.js'
import { COMP_KEYS, HR_FIELDS, INTERVIEW_STATUSES, OUTCOMES, SPEC_KEYS } from './interview/interviewModel.js'
import { BENEFIT_KEYS, OFFER_STATUSES } from './offer/offerModel.js'
import { ORIENTATION_STATUSES, SESSION_KEYS, TIME } from './orientation/orientationModel.js'
import { EXTENSIONS, PROBATION_STATUSES, RECOMMENDATIONS, SIGNATURE_KEYS as PROBATION_SIGNATURES } from './probation/probationModel.js'

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

// An evaluation form type: its criteria and allocated points, totalling 100.
function readFormType(item) {
  check(isObject(item) && Array.isArray(item.criteria) && item.criteria.length > 0)
  const criteria = item.criteria.map((criterion) => {
    check(isObject(criterion) && Number.isInteger(criterion.points) && criterion.points > 0)
    return Object.freeze({ code: code(criterion.code) ?? invalid(), name: text(criterion.name, 120), nameAr: text(criterion.nameAr, 120), points: criterion.points })
  })
  check(criteria.reduce((sum, criterion) => sum + criterion.points, 0) === 100)
  check(new Set(criteria.map((criterion) => criterion.code)).size === criteria.length)
  return Object.freeze({ code: code(item.code) ?? invalid(), name: text(item.name, 120), nameAr: text(item.nameAr, 120), criteria: Object.freeze(criteria) })
}

export function readLookups(data) {
  check(isObject(data) && isObject(data.approvalRoute) && isObject(data.offer) && isObject(data.interview) && isObject(data.orientation))
  check(isObject(data.orientation.departmentHeads) && isObject(data.probation))
  check(Array.isArray(data.probation.formTypes) && data.probation.formTypes.length > 0 && Array.isArray(data.probation.ratingScale) && data.probation.ratingScale.length > 0)
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
    orientation: Object.freeze({
      departmentHeads: Object.freeze(Object.fromEntries(SESSION_KEYS.map((key) => [key, options(data.orientation.departmentHeads[key])]))),
    }),
    probation: Object.freeze({
      formTypes: Object.freeze(data.probation.formTypes.map(readFormType)),
      ratingScale: Object.freeze(data.probation.ratingScale.map((band) => {
        check(isObject(band) && Number.isInteger(band.min) && band.min >= 0 && band.min <= 100)
        return Object.freeze({ min: band.min, label: text(band.label, 60), labelAr: text(band.labelAr, 60) })
      })),
    }),
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
    check(isObject(item) && (item.rating === null || item.rating === 'N/A' || (Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5)))
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
    // Kept so an update does not overwrite these backend evaluation fields with blanks.
    managingDirector: text(data.managingDirector ?? '', 200),
    hrRepresentative: text(data.hrRepresentative ?? '', 200),
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
  check(isObject(data) && isObject(data.benefits))
  return Object.freeze({
    offerId: id(data.offerId),
    offerNumber: nullableText(data.offerNumber, 40),
    status: oneOf(data.status, OFFER_STATUSES),
    position: text(data.position, 200),
    offerDate: date(data.offerDate),
    division: text(data.division, 40),
    salutation: text(data.salutation, 50),
    salutationAr: text(data.salutationAr, 50),
    candidateNameEn: text(data.candidateNameEn, 200),
    candidateNameAr: text(data.candidateNameAr, 200),
    intNo: text(data.intNo, 100),
    reqNo: text(data.reqNo, 100),
    applicant: text(data.applicant, 200),
    benefits: Object.freeze(Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = data.benefits[key]
      check(isObject(row) && typeof row.autoArabic === 'boolean')
      return [key, Object.freeze({ en: text(row.en, 500), ar: text(row.ar, 1000), autoArabic: row.autoArabic })]
    }))),
    comments: text(data.comments),
    currency: currency(data.currency),
    updatedAt: nullableInstant(data.updatedAt),
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

// An employee from the employee search (pickers): identity and job details.
export function readEmployee(data) {
  check(isObject(data))
  return Object.freeze({
    employeeId: id(data.employeeId),
    employeeNumber: text(data.employeeNumber, 30),
    name: text(data.name, 200),
    employmentType: text(data.employmentType, 60),
    startDate: date(data.startDate),
    section: text(data.section, 120),
    division: text(data.division, 120),
    position: text(data.position, 200),
    grade: text(data.grade, 20),
    departmentName: text(data.departmentName, 120),
    evaluationFormCode: code(data.evaluationFormCode),
  })
}

const time = (value) => { check(value === null || (typeof value === 'string' && TIME.test(value))); return value }

export function readOrientation(data) {
  check(isObject(data) && isObject(data.sessions))
  return Object.freeze({
    scheduleId: id(data.scheduleId),
    scheduleNumber: nullableText(data.scheduleNumber, 40),
    status: oneOf(data.status, ORIENTATION_STATUSES),
    employee: readEmployee(data.employee),
    scheduledByName: nullableText(data.scheduledByName, 200),
    fromDate: date(data.fromDate),
    toDate: date(data.toDate),
    sessions: Object.freeze(Object.fromEntries(SESSION_KEYS.map((key) => {
      const session = data.sessions[key]
      check(isObject(session))
      return [key, Object.freeze({
        headCode: code(session.headCode), fromDate: date(session.fromDate), toDate: date(session.toDate),
        timeFrom: time(session.timeFrom), timeTo: time(session.timeTo), remark: text(session.remark, 500),
      })]
    }))),
    updatedAt: instant(data.updatedAt),
  })
}

export function readOrientationListItem(data) {
  check(isObject(data))
  return Object.freeze({
    scheduleId: id(data.scheduleId),
    scheduleNumber: nullableText(data.scheduleNumber, 40),
    status: oneOf(data.status, ORIENTATION_STATUSES),
    employeeName: text(data.employeeName, 200),
    fromDate: date(data.fromDate),
    toDate: date(data.toDate),
    updatedAt: instant(data.updatedAt),
  })
}

// Periodwise Employees report (GET /hr/reports/periodwise-employees). The API never returns the
// national ID itself, only whether one is on file.
export const REPORT_FLAGS = Object.freeze(['BIRTH_DATE', 'NATIONAL_ID'])
export const REPORT_AGE_BANDS = Object.freeze(['UNDER_30', '30_39', '40_49', '50_59', '60_PLUS'])
const count = (value) => { check(Number.isInteger(value) && value >= 0); return value }
const decimal = (value) => { check(typeof value === 'number' && Number.isFinite(value) && value >= 0); return value }
const departmentCode = (value) => { check(value === null || (typeof value === 'string' && ID_PATTERN.test(value))); return value }

export function readReportRow(data) {
  check(isObject(data) && Array.isArray(data.flags) && typeof data.hasNationalId === 'boolean')
  check(typeof data.active === 'boolean' && typeof data.senior === 'boolean')
  check(data.age === null || Number.isInteger(data.age))
  return Object.freeze({
    employeeNumber: text(data.employeeNumber, 60),
    name: text(data.name, 240),
    birthDate: date(data.birthDate),
    age: data.age,
    nationality: text(data.nationality, 100),
    jobTitle: text(data.jobTitle, 240),
    position: text(data.position, 240),
    departmentCode: departmentCode(data.departmentCode),
    departmentName: text(data.departmentName, 240),
    hasNationalId: data.hasNationalId,
    startDate: date(data.startDate) ?? invalid(),
    endDate: date(data.endDate),
    years: decimal(data.years),
    leavingReason: text(data.leavingReason, 240),
    active: data.active,
    senior: data.senior,
    flags: Object.freeze(data.flags.map((flag) => oneOf(flag, REPORT_FLAGS))),
  })
}

export function readReportSummary(data) {
  check(isObject(data) && Array.isArray(data.byDepartment) && Array.isArray(data.byNationality))
  check(Array.isArray(data.ageBands) && Array.isArray(data.yearlyFlow))
  return Object.freeze({
    total: count(data.total), active: count(data.active), joiners: count(data.joiners), leavers: count(data.leavers),
    turnover: decimal(data.turnover), saudization: decimal(data.saudization), averageAge: decimal(data.averageAge),
    senior: count(data.senior), averageService: decimal(data.averageService), flagged: count(data.flagged),
    byDepartment: Object.freeze(data.byDepartment.map((item) => {
      check(isObject(item))
      return Object.freeze({ code: departmentCode(item.code), name: text(item.name, 240), count: count(item.count) })
    })),
    byNationality: Object.freeze(data.byNationality.map((item) => {
      check(isObject(item))
      return Object.freeze({ name: text(item.name, 100), count: count(item.count) })
    })),
    ageBands: Object.freeze(data.ageBands.map((item) => {
      check(isObject(item))
      return Object.freeze({ band: oneOf(item.band, REPORT_AGE_BANDS), count: count(item.count) })
    })),
    yearlyFlow: Object.freeze(data.yearlyFlow.map((item) => {
      check(isObject(item) && /^\d{4}$/.test(item.year))
      return Object.freeze({ year: item.year, joiners: count(item.joiners), leavers: count(item.leavers) })
    })),
  })
}

// The client result `{ data: { rows, summary }, pagination }`: one page of rows, the pagination
// and the summary of the full scope.
export function readReport(result) {
  check(isObject(result?.data) && Array.isArray(result.data.rows) && isObject(result.pagination))
  const rows = result.data.rows.map(readReportRow)
  check(new Set(rows.map((row) => row.employeeNumber)).size === rows.length)
  return Object.freeze({ rows: Object.freeze(rows), pagination: result.pagination, summary: readReportSummary(result.data.summary) })
}

export function readReportDepartments(data) {
  check(Array.isArray(data))
  return Object.freeze(data.map((item) => {
    check(isObject(item))
    return Object.freeze({ code: departmentCode(item.code) ?? invalid(), name: text(item.name, 240) })
  }))
}

const wholePoints = (value) => { check(Number.isInteger(value) && value >= 0 && value <= 100); return value }
const codeMap = (value, read) => {
  check(isObject(value))
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => {
    check(LOOKUP_CODE.test(key))
    return [key, read(item)]
  })))
}

export function readProbation(data) {
  check(isObject(data) && isObject(data.signatures))
  return Object.freeze({
    evaluationId: id(data.evaluationId),
    evaluationNumber: nullableText(data.evaluationNumber, 40),
    status: oneOf(data.status, PROBATION_STATUSES),
    employee: readEmployee(data.employee),
    preparedByName: nullableText(data.preparedByName, 200),
    formTypeCode: code(data.formTypeCode),
    fromDate: date(data.fromDate),
    toDate: date(data.toDate),
    scores: codeMap(data.scores, wholePoints),
    notes: codeMap(data.notes, (value) => text(value, 500)),
    strengths: text(data.strengths), improvements: text(data.improvements), training: text(data.training, 1000),
    recommendation: oneOf(data.recommendation, RECOMMENDATIONS, { nullable: true }),
    extendByMonths: oneOf(data.extendByMonths, EXTENSIONS, { nullable: true }),
    justification: text(data.justification), comments: text(data.comments), suggestion: text(data.suggestion),
    signatures: Object.freeze(Object.fromEntries(PROBATION_SIGNATURES.map((key) => [key, nullableInstant(data.signatures[key])]))),
    updatedAt: instant(data.updatedAt),
  })
}

export function readProbationListItem(data) {
  check(isObject(data))
  return Object.freeze({
    evaluationId: id(data.evaluationId),
    evaluationNumber: nullableText(data.evaluationNumber, 40),
    status: oneOf(data.status, PROBATION_STATUSES),
    employeeName: text(data.employeeName, 200),
    formTypeCode: code(data.formTypeCode),
    totalPoints: wholePoints(data.totalPoints),
    updatedAt: instant(data.updatedAt),
  })
}

// `result` is the client result: { data, pagination } (pagination already validated).
export function readPage(result, reader) {
  if (!Array.isArray(result?.data) || !result.pagination) invalid()
  return Object.freeze({ items: Object.freeze(result.data.map(reader)), pagination: result.pagination })
}
