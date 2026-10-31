// HR recruitment services use the existing requisition, interview and offer
// backend contracts without changing server-owned schemas or workflows.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { hrRecruitmentConfig } from './hrRecruitmentConfig.js'
import { createDemoClient } from './demo/demoClient.js'
import {
  ID_PATTERN, readInterview, readInterviewListItem, readLookups, readOffer, readOfferListItem, readReport,
} from './hrRecruitmentContract.js'
import { COMP_KEYS, SPEC_KEYS } from './interview/interviewModel.js'
import { BENEFIT_KEYS } from './offer/offerModel.js'

export const HR_BASE = '/hr/recruitment'
export const HR_REPORTS_BASE = '/hr/reports'
export const REPORT_PAGE_SIZE = 10

const REQUISITIONS_BASE = '/hr/requisitions'
const INTERVIEWS_BASE = '/hr/interview-assessments'
const OFFERS_BASE = '/hr/employment-offers'
const PROBATION_BASE = '/hr/probation-evaluations'
const ORIENTATION_BASE = '/hr/orientation-trainings'
const CONTRACTOR_EMPLOYEES_BASE = '/hr/contractor-employees'
const OFFER_ALLOWANCE_TYPES = Object.freeze({
  housing: 'housing', transport: 'transportation', vacation: 'annual-vacation', ticket: 'ticket', medical: 'medical', contract: 'contract-period',
})
const SECONDARY_EDUCATION = Object.freeze({
  SECONDARY_EDUCATION: 'Secondary Education', DIPLOMA: 'Diploma', DEGREE: 'Degree', MASTERS_DEGREE: 'Masters Degree',
})
const DIVISION_OPTIONS = Object.freeze(['Food', 'Non-Food'].map((name) => Object.freeze({ code: name, name })))
const INTERVIEW_TYPE_OPTIONS = Object.freeze(['Personal', 'Online'].map((name) => Object.freeze({ code: name, name })))
const MARITAL_OPTIONS = Object.freeze(['Single', 'Married'].map((name) => Object.freeze({ code: name, name })))
const CERTIFICATE_CHECK_OPTIONS = Object.freeze(['Yes', 'No'].map((name) => Object.freeze({ code: name, name })))
const EDUCATION_OPTIONS = Object.freeze(Object.entries(SECONDARY_EDUCATION).map(([code, name]) => Object.freeze({ code, name })))
const uploadedFiles = new WeakSet()

function legacyDate(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') return ''
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(value)
  if (!match) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months.findIndex((item) => item.toLowerCase() === match[2].toLowerCase())
  if (month < 0) return ''
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]
  return `${year}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function requisitionRecord(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.requisitionId ?? ''))) {
    throw new ApiError('The server returned an unexpected requisition response.', { code: 'INVALID_RESPONSE' })
  }
  const text = (value) => value == null ? '' : String(value)
  const yn = (value) => value === 'Y' ? true : value === 'N' ? false : null
  return Object.freeze({
    requisitionId: String(data.requisitionId), requisitionNumber: text(data.requisitionNumber),
    status: text(data.requisitionStatus), requesterName: text(data.requesterName),
    requestDate: legacyDate(data.requestDate), jobId: text(data.jobId), jobTitle: text(data.jobName),
    departmentId: text(data.deptId), departmentName: text(data.deptName), neededDate: legacyDate(data.dateNeeded),
    remark: text(data.remark), reason: data.reasonOfReq === 'Replacement' ? 'REPLACEMENT' : data.reasonOfReq === 'Addition' ? 'ADDITION' : '',
    replacementFor: text(data.replacementFor), additionReason: text(data.reason),
    budgeted: yn(data.budgeted), budgetedSalary: data.budgetedSal == null ? '' : String(data.budgetedSal),
    highSchool: yn(data.highSchool), diploma: yn(data.diploma), higherDiploma: yn(data.higherDiploma),
    degree: yn(data.degree), masterDegree: yn(data.masterDegree), gccExp: text(data.gccExp), workExp: text(data.workExp),
    skills: text(data.skills), otherRequirements: text(data.other), totalPackage: data.totalPackage ?? null,
    ticketStatus: text(data.ticketStatus), attachments: Array.isArray(data.attachments) ? data.attachments.map((file) => ({
      attachmentId: String(file.attachmentId), fileName: text(file.fileName), sizeBytes: 0,
    })) : [], updatedAt: data.updatedAt ?? data.lastUpdateDate ?? null,
  })
}

function requisitionBody(body, requestDate) {
  const result = {
    ...(requestDate ? { requestDate } : {}),
    jobId: body.jobId || '', jobName: body.jobName, deptId: body.deptId || '', deptName: body.deptName,
    dateNeeded: body.dateNeeded, reasonOfReq: body.reasonOfReq,
    replacementFor: body.replacementFor || '', reason: body.reason || '',
    budgeted: body.budgeted || 'N', budgetedSal: body.budgetedSal === '' ? 0 : Number(body.budgetedSal),
    highSchool: body.highSchool || 'N', diploma: body.diploma || 'N', higherDiploma: body.higherDiploma || 'N',
    degree: body.degree || 'N', masterDegree: body.masterDegree || 'N', gccExp: body.gccExp || '0 - 2',
    workExp: body.workExp || '0 - 2', skills: body.skills || '', other: body.other || '', remark: body.remark || '',
    totalPackage: body.totalPackage === '' || body.totalPackage == null ? null : Number(body.totalPackage),
    ...(body.ticketStatus !== undefined ? { ticketStatus: body.ticketStatus } : {}),
  }
  return result
}

const cleanBackendText = (value) => value == null || value === '-' ? '' : String(value)
const BACKEND_INTERVIEW_STATUSES = Object.freeze({
  incomplete: 'INCOMPLETE', inprocess: 'INPROCESS', approved: 'APPROVED', rejected: 'REJECTED',
})
const BACKEND_OUTCOMES = Object.freeze({ passed: 'PASSED', hold: 'HOLD', failed: 'FAILED' })
const FRONTEND_OUTCOMES = Object.freeze({ PASSED: 'Passed', HOLD: 'Hold', FAILED: 'Failed' })
const codeFromEducation = (value) => Object.entries(SECONDARY_EDUCATION).find(([, name]) => name === value)?.[0] ?? ''
const textFromEducation = (value) => SECONDARY_EDUCATION[value] ?? ''
const interviewStatus = (value) => BACKEND_INTERVIEW_STATUSES[String(value ?? '').toLowerCase()] ?? 'INCOMPLETE'
const interviewOutcome = (value) => BACKEND_OUTCOMES[String(value ?? '').toLowerCase()] ?? null
const backendOutcome = (value) => FRONTEND_OUTCOMES[value] ?? ''

function readBackendRatings(section, keys, ratePrefix, remarkPrefix) {
  const source = section ?? {}
  return Object.fromEntries(keys.map((key, index) => {
    const rating = source[`${ratePrefix}${index + 1}`]
    const remark = cleanBackendText(source[`${remarkPrefix}${index + 1}`])
    const normalizedRating = rating === 'N/A' ? 'N/A' : Number.isInteger(Number(rating)) && Number(rating) >= 1 && Number(rating) <= 5 ? Number(rating) : null
    return [key, { rating: normalizedRating, remark }]
  }))
}

function interviewRecord(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.headerId ?? ''))) {
    throw new ApiError('The server returned an unexpected interview assessment response.', { code: 'INVALID_RESPONSE' })
  }
  const personal = data.personalSpec ?? {}
  const competency = data.jobCompetency ?? {}
  const evaluation = data.evaluation ?? {}
  const number = (value) => value == null || Number(value) === 0 ? null : Number(value)
  const date = (value) => legacyDate(value) || null
  return readInterview({
    assessmentId: String(data.headerId), assessmentNumber: cleanBackendText(data.intNo) || null,
    status: interviewStatus(data.status), positionTitle: cleanBackendText(data.positionName) || null,
    requisitionNumber: cleanBackendText(data.requisitionNo), preScreeningDate: date(data.interviewDate),
    divisionCode: cleanBackendText(data.division) || null, expectedJoiningDate: date(data.joining),
    interviewTime: cleanBackendText(data.interviewTime), interviewTypeCode: cleanBackendText(data.interviewType) || null, candidateName: cleanBackendText(data.candidateName),
    candidateAge: number(data.age), nationality: cleanBackendText(data.nationality),
    maritalStatusCode: cleanBackendText(data.materialStatus) || null, location: cleanBackendText(data.location),
    certificateCode: codeFromEducation(data.secondaryEducation) || null,
    certificateCheckedCode: cleanBackendText(data.secondaryEducationChk) || null, major: cleanBackendText(data.major),
    currentEmployer: cleanBackendText(data.currentEmployer || data.companyName), lastPosition: cleanBackendText(data.lastPositionHeld),
    relevantExperienceYears: number(data.relevantYearsExperience), expectedBasic: data.expSalBasic ?? null,
    expectedTotal: data.expSalTotal ?? null, currentBasic: data.curSalBasic ?? null, currentTotal: data.curSalTotal ?? null,
    personalSpecification: readBackendRatings(personal, SPEC_KEYS, 'rate', 'remark'),
    personalSpecificationRemarks: cleanBackendText(personal.remarks),
    competency: readBackendRatings(competency, COMP_KEYS, 'cRating', 'cRemark'),
    competencyRemarks: cleanBackendText(competency.cRemarks),
    strengths: cleanBackendText(competency.sumStrength), weakness: cleanBackendText(competency.sumWeekness),
    outcome: interviewOutcome(evaluation.status), adminManagerName: cleanBackendText(evaluation.adminManager) || null,
    adminManager: cleanBackendText(evaluation.adminManager), managingDirector: cleanBackendText(evaluation.managningDirector),
    hrRepresentative: cleanBackendText(evaluation.hrRep), departmentRepresentative: cleanBackendText(evaluation.deptRep),
    payroll: cleanBackendText(data.attribute3), hrComment: cleanBackendText(evaluation.comment),
    interviewers: [data.interviewedBy, data.interviewedBy2, data.interviewedBy3].map(cleanBackendText),
    updatedAt: data.updatedAt ?? data.createdAt,
  })
}

function backendInterviewPayload(body) {
  const amount = (value) => String(value ?? '').trim() === '' ? undefined : Number(value)
  const isoDate = (value) => String(value ?? '').trim() || undefined
  const cleanRatings = (group, keys, ratingPrefix, remarkPrefix) => Object.fromEntries(keys.flatMap((key, index) => {
    const item = group[key] ?? {}
    const rating = item.rating === 'N/A' ? 'N/A' : item.rating ? String(item.rating) : ''
    return [[`${ratingPrefix}${index + 1}`, rating], [`${remarkPrefix}${index + 1}`, String(item.remark ?? '').trim()]]
  }))
  const ratingTotal = (group, keys) => keys.reduce((total, key) => total + (Number.isInteger(group[key]?.rating) ? group[key].rating : 0), 0)
  const interviewers = body.interviewers ?? ['', '', '']
  const outcome = backendOutcome(body.outcome)
  const payroll = String(body.payroll ?? '').trim()
  // The allowed units come from /lookups/payroll-units; the backend validates the value.
  if (!payroll) {
    throw new ApiError('Choose one of the available payroll business units.', { code: 'VALIDATION_ERROR', details: [{ field: 'payroll', message: 'Choose a payroll business unit.' }] })
  }
  const result = {
    candidateName: String(body.candidateName ?? '').trim(), requisitionNo: String(body.requisitionNumber ?? '').trim(),
    positionName: String(body.positionTitle ?? '').trim(), attribute3: payroll, status: 'Incomplete',
    interviewTime: String(body.interviewTime ?? ''), interviewType: String(body.interviewTypeCode ?? ''), materialStatus: String(body.maritalStatusCode ?? ''),
    secondaryEducation: textFromEducation(body.certificateCode), secondaryEducationChk: String(body.certificateCheckedCode ?? ''),
    lastPositionHeld: String(body.lastPosition ?? '').trim(), companyName: String(body.currentEmployer ?? '').trim(),
    currentEmployer: String(body.currentEmployer ?? '').trim(), location: String(body.location ?? '').trim(),
    major: String(body.major ?? '').trim(), division: String(body.divisionCode ?? ''), nationality: String(body.nationality ?? '').trim(),
    relevantYearsExperience: amount(body.relevantExperienceYears), age: amount(body.candidateAge),
    interviewDate: isoDate(body.preScreeningDate), joining: isoDate(body.expectedJoiningDate),
    curSalBasic: amount(body.currentBasic), expSalBasic: amount(body.expectedBasic),
    curSalTotal: amount(body.currentTotal), expSalTotal: amount(body.expectedTotal),
    interviewedBy: String(interviewers[0] ?? '').trim(), interviewedBy2: String(interviewers[1] ?? '').trim(),
    interviewedBy3: String(interviewers[2] ?? '').trim(),
    personalSpec: {
      ...cleanRatings(body.personalSpecification, SPEC_KEYS, 'rate', 'remark'),
      rate9: ratingTotal(body.personalSpecification, SPEC_KEYS), remarks: String(body.personalSpecificationRemarks ?? '').trim(),
    },
    jobCompetency: {
      ...cleanRatings(body.competency, COMP_KEYS, 'cRating', 'cRemark'),
      cRating7: ratingTotal(body.competency, COMP_KEYS), cRemarks: String(body.competencyRemarks ?? '').trim(),
      sumStrength: String(body.strengths ?? '').trim(), sumWeekness: String(body.weakness ?? '').trim(),
    },
    evaluation: {
      status: outcome, interviewedBy: String(interviewers[0] ?? '').trim(),
      adminManager: String(body.adminManagerName ?? body.adminManager ?? '').trim(), managningDirector: String(body.managingDirector ?? '').trim(),
      hrRep: String(body.hrRepresentative ?? '').trim(), deptRep: String(body.departmentRepresentative ?? '').trim(),
      comment: String(body.hrComment ?? '').trim(),
    },
  }
  for (const key of ['age', 'relevantYearsExperience', 'curSalBasic', 'expSalBasic', 'curSalTotal', 'expSalTotal']) {
    if (result[key] === undefined) delete result[key]
  }
  for (const key of ['interviewDate', 'joining']) if (!result[key]) delete result[key]
  return result
}

function interviewListItem(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.headerId ?? ''))) {
    throw new ApiError('The server returned an unexpected interview assessment list.', { code: 'INVALID_RESPONSE' })
  }
  const updatedAt = data.creationDate instanceof Date ? data.creationDate.toISOString() : String(data.creationDate ?? '')
  return readInterviewListItem({
    assessmentId: String(data.headerId), assessmentNumber: cleanBackendText(data.intNo) || null,
    status: interviewStatus(data.headerStatus), candidateName: cleanBackendText(data.candidateName),
    positionTitle: cleanBackendText(data.positionName) || null, outcome: interviewOutcome(data.evaluationStatus), updatedAt,
  })
}

const OFFER_LINE_FIELDS = Object.freeze({
  basic: ['basicSalary', 'basicSalaryAr'], housing: ['housingAllowance', 'housingAllowanceAr'],
  transport: ['transportation', 'transportationAr'], vacation: ['annualVacation', 'annualVacationAr'],
  ticket: ['ticket', 'ticketAr'], medical: ['medical', 'medicalAr'], contract: ['contractPeriod', 'contractPeriodAr'],
  start: ['approximateStartingDate', 'approximateStartingDateAr'], probation: ['probationaryPeriod', 'probationaryPeriodAr'],
})
const backendOfferStatus = () => 'INCOMPLETE'
const offerText = (value) => value == null || value === '-' ? '' : String(value)

function offerRecord(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.headerId ?? ''))) {
    throw new ApiError('The server returned an unexpected employment offer response.', { code: 'INVALID_RESPONSE' })
  }
  const line = data.line ?? {}
  const benefits = Object.fromEntries(BENEFIT_KEYS.map((key) => {
    const [englishKey, arabicKey] = OFFER_LINE_FIELDS[key]
    return [key, {
      en: line[englishKey] == null ? '' : String(line[englishKey]), ar: offerText(line[arabicKey]), autoArabic: key === 'basic' || key === 'start',
    }]
  }))
  const reqNo = data.reqNo == null || Number(data.reqNo) === 0 ? '' : String(data.reqNo)
  const updatedAt = data.updatedAt ?? data.createdAt
  return readOffer({
    offerId: String(data.headerId), offerNumber: null, status: backendOfferStatus(data.status),
    position: offerText(data.position), offerDate: data.offerDate ?? null, division: offerText(data.division),
    salutation: offerText(data.to), salutationAr: offerText(data.toArabic),
    candidateNameEn: offerText(data.employeeName), candidateNameAr: offerText(data.employeeNameAr),
    intNo: offerText(data.intNo), reqNo, applicant: offerText(data.applicant), benefits, comments: offerText(line.comment),
    currency: 'SAR', updatedAt: updatedAt == null ? null : updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt),
  })
}

function offerListItem(data) {
  if (!data || typeof data !== 'object' || !ID_PATTERN.test(String(data.headerId ?? ''))) {
    throw new ApiError('The server returned an unexpected employment offer list.', { code: 'INVALID_RESPONSE' })
  }
  return readOfferListItem({
    offerId: String(data.headerId), offerNumber: null, status: backendOfferStatus(data.status),
    position: offerText(data.position), candidateNameEn: offerText(data.employeeName),
    updatedAt: data.lastUpdateDate || data.creationDate,
  })
}

function backendOfferPayload(body) {
  const basicText = String(body.benefits.basic.en ?? '').trim().replaceAll(',', '')
  const basicSalary = basicText === '' ? undefined : Number(basicText)
  if (basicText !== '' && (!Number.isFinite(basicSalary) || basicSalary < 0)) {
    throw new ApiError('Enter a valid basic salary.', { code: 'VALIDATION_ERROR', details: [{ field: 'basic', message: 'Enter a valid basic salary.' }] })
  }
  const line = Object.fromEntries(BENEFIT_KEYS.flatMap((key) => {
    const [englishKey, arabicKey] = OFFER_LINE_FIELDS[key]
    const row = body.benefits[key]
    if (key === 'basic') return [[englishKey, basicSalary], [arabicKey, String(row.ar ?? '').trim()]]
    return [[englishKey, String(row.en ?? '').trim()], [arabicKey, String(row.ar ?? '').trim()]]
  }))
  line.approximateStartingDate = String(body.benefits.start.en ?? '').trim()
  line.comment = String(body.comments ?? '').trim()
  if (basicSalary === undefined) delete line.basicSalary
  const result = {
    offerDate: String(body.offerDate ?? '').trim(), employeeName: String(body.candidateNameEn ?? '').trim(),
    employeeNameAr: String(body.candidateNameAr ?? '').trim(), position: String(body.position ?? '').trim(),
    division: String(body.division ?? '').trim(), to: String(body.salutation ?? '').trim(),
    toArabic: String(body.salutationAr ?? '').trim(), applicant: String(body.applicant ?? '').trim(),
    intNo: String(body.intNo ?? '').trim(), line,
  }
  const reqNo = String(body.reqNo ?? '').trim()
  if (reqNo) result.reqNo = reqNo
  return result
}

function createBackendRequisitionService({ client }) {
  const getById = async (id, { signal } = {}) => requisitionRecord((await client.get(`${REQUISITIONS_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const keys = ['jobs', 'departments', 'requester', 'replacements', 'capabilities']
      const results = await Promise.allSettled([
        client.get(`${REQUISITIONS_BASE}/lookups/job-titles`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/departments`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/requestor`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/replacement-for`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/capabilities`, { signal }),
      ])
      if (signal?.aborted) throw results.find((result) => result.status === 'rejected')?.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const data = results.map((result) => result.status === 'fulfilled' ? result.value?.data : null)
      const valid = [Array.isArray(data[0]), Array.isArray(data[1]), Boolean(data[2] && typeof data[2] === 'object' && !Array.isArray(data[2]) && typeof data[2].fullName === 'string'), Array.isArray(data[3]), typeof data[4]?.canManageTicket === 'boolean']
      const lookupErrors = Object.freeze(keys.filter((_, index) => results[index].status === 'rejected' || !valid[index]))
      const replacements = Array.isArray(data[3]) ? data[3].map((item) => {
        if (typeof item === 'string') return item
        return String(item?.fullName ?? item?.employeeName ?? item?.name ?? '')
      }).filter(Boolean) : []
      return Object.freeze({
        jobs: Object.freeze((Array.isArray(data[0]) ? data[0] : []).map((item) => ({ id: String(item.jobId ?? ''), name: String(item.name ?? '') })).filter((item) => item.name)),
        departments: Object.freeze((Array.isArray(data[1]) ? data[1] : []).map((item) => ({ id: String(item.deptId ?? ''), name: String(item.name ?? '') })).filter((item) => item.name)),
        requester: String(data[2]?.fullName ?? ''), replacements: Object.freeze(replacements),
        // The selector stays hidden unless the backend confirms; the backend also refuses the change.
        capabilities: Object.freeze({ canManageTicket: data[4]?.canManageTicket === true }), lookupErrors,
      })
    },
    getById,
    async removeAttachment(requisitionId, attachmentId) {
      await client.delete(`${REQUISITIONS_BASE}/${segment(requisitionId)}/attachments/${segment(attachmentId)}`)
    },
    async deleteDraft(requisitionId) {
      await client.delete(`${REQUISITIONS_BASE}/${segment(requisitionId)}`)
    },
    async getBudget(fullName, { signal } = {}) {
      const result = await client.get(`${REQUISITIONS_BASE}/lookups/budget`, { params: { fullName }, signal })
      if (!result.data || result.data.fullName !== fullName || typeof result.data.totalPackage !== 'number') {
        throw new ApiError('The server returned an unexpected budget response.', { code: 'INVALID_RESPONSE' })
      }
      return result.data
    },
    async findSubmitted(requisitionNumber, { signal } = {}) {
      const number = String(requisitionNumber ?? '').trim()
      if (!number) return null
      const result = await client.get(REQUISITIONS_BASE, { params: { search: number, requisitionStatus: 'Approved', page: 1, pageSize: 100 }, signal })
      if (!Array.isArray(result.data)) throw new ApiError('The server returned an unexpected requisition list.', { code: 'INVALID_RESPONSE' })
      const item = result.data.find((row) => String(row.requisitionNumber ?? '').toLowerCase() === number.toLowerCase())
      return item ? Object.freeze({ requisitionId: String(item.requisitionId), requisitionNumber: String(item.requisitionNumber), status: String(item.requisitionStatus), jobTitle: String(item.jobName ?? '') }) : null
    },
    async saveDraft(id, body, requestDate, attachments = []) {
      const payload = requisitionBody(body, id ? null : requestDate)
      const files = typeof Blob === 'undefined' ? [] : attachments.filter((item) => item?.file instanceof Blob && !uploadedFiles.has(item.file))
      const requestBody = files.length ? (() => {
        const form = new FormData()
        for (const [key, value] of Object.entries(payload)) {
          if (value !== null && value !== undefined) form.append(key, String(value))
        }
        for (const item of files) form.append('files', item.file, item.fileName)
        return form
      })() : payload
      const response = id
        ? await client.put(`${REQUISITIONS_BASE}/${segment(id)}`, requestBody)
        : await client.post(REQUISITIONS_BASE, requestBody)
      files.forEach((item) => uploadedFiles.add(item.file))
      const savedId = id ? String(response.data.requisitionId) : String(response.data.requisitionId)
      return getById(savedId)
    },
    async list({ page = 1, limit = REPORT_PAGE_SIZE } = {}, { signal } = {}) {
      const result = await client.get(REQUISITIONS_BASE, { params: { page, pageSize: limit }, signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected requisition list.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({ items: Object.freeze(result.data.map((item) => Object.freeze({
        requisitionId: String(item.requisitionId), requisitionNumber: String(item.requisitionNumber ?? ''),
        status: String(item.requisitionStatus ?? ''), jobTitle: String(item.jobName ?? ''),
        // CREATION_DATE arrives as 'DD-Mon-YY', which Date cannot parse reliably.
        departmentName: String(item.deptName ?? ''), updatedAt: item.lastUpdateDate ?? (legacyDate(item.creationDate) || null),
      }))), pagination: result.pagination })
    },
  })
}

// Path identifiers are Oracle NUMBER values kept as decimal strings.
export function segment(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ApiError('The selected record is invalid.', { code: 'INVALID_ID' })
  }
  return value
}

// Only defined values are sent; empty strings mean "no filter".
function query(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

// Lookup suggestions for the recruitment flow and the session-only HR report.
export function createLookupService({ client }) {
  return Object.freeze({
    async get({ signal } = {}) {
      const { data } = await client.get(`${HR_BASE}/lookups`, { signal })
      return readLookups(data)
    },
  })
}

export function createRequisitionService({ client }) {
  return createBackendRequisitionService({ client })
}

export function createInterviewService({ client }) {
  const getById = async (id, { signal } = {}) => interviewRecord((await client.get(`${INTERVIEWS_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const keys = ['nationalities', 'requisitions', 'employees', 'payrollUnits']
      const results = await Promise.allSettled([
        client.get(`${INTERVIEWS_BASE}/lookups/nationalities`, { signal }),
        client.get(`${INTERVIEWS_BASE}/lookups/requisitions`, { signal }),
        client.get(`${INTERVIEWS_BASE}/lookups/employees`, { signal }),
        client.get(`${INTERVIEWS_BASE}/lookups/payroll-units`, { signal }),
      ])
      if (signal?.aborted) throw results.find((result) => result.status === 'rejected')?.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const data = results.map((result) => result.status === 'fulfilled' ? result.value?.data : null)
      const valid = data.map(Array.isArray)
      const lookupErrors = Object.freeze(keys.filter((_, index) => results[index].status === 'rejected' || !valid[index]))
      const approvedRequisitions = (Array.isArray(data[1]) ? data[1] : []).map((item) => ({
        requisitionNumber: String(item?.requisitionNumber ?? ''), jobName: String(item?.jobName ?? ''),
      })).filter((item) => item.requisitionNumber && item.jobName)
      return Object.freeze({
        payrollBusinessUnits: Object.freeze((Array.isArray(data[3]) ? data[3] : []).map((item) => Object.freeze({
          code: String(item?.code ?? ''), name: String(item?.name ?? '') || String(item?.code ?? ''),
        })).filter((item) => item.code)),
        divisions: DIVISION_OPTIONS, interviewTypes: INTERVIEW_TYPE_OPTIONS, maritalStatuses: MARITAL_OPTIONS,
        certificates: EDUCATION_OPTIONS, certificateChecks: CERTIFICATE_CHECK_OPTIONS,
        nationalities: Object.freeze((Array.isArray(data[0]) ? data[0] : []).map(String).filter(Boolean)),
        requisitions: Object.freeze(approvedRequisitions),
        employees: Object.freeze((Array.isArray(data[2]) ? data[2] : []).map(String).filter(Boolean)),
        lookupErrors,
      })
    },
    async list({ page = 1, limit = REPORT_PAGE_SIZE } = {}, { signal } = {}) {
      const result = await client.get(INTERVIEWS_BASE, { params: { page, pageSize: limit }, signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected interview assessment list.', { code: 'INVALID_RESPONSE' })
      const items = Object.freeze(result.data.map(interviewListItem))
      return Object.freeze({ items, pagination: Object.freeze({ ...result.pagination, limit: result.pagination.limit ?? limit }) })
    },
    getById,
    async save(id, body) {
      const payload = backendInterviewPayload(body)
      const result = id
        ? await client.put(`${INTERVIEWS_BASE}/${segment(id)}`, payload)
        : await client.post(INTERVIEWS_BASE, payload)
      const savedId = String(id ?? result.data?.headerId ?? '')
      if (!ID_PATTERN.test(savedId)) throw new ApiError('The server did not return an interview assessment ID.', { code: 'INVALID_RESPONSE' })
      return getById(savedId)
    },
    async remove(id) {
      await client.delete(`${INTERVIEWS_BASE}/${segment(id)}`)
    },
  })
}

export function createOfferService({ client }) {
  const getById = async (id, { signal } = {}) => offerRecord((await client.get(`${OFFERS_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const allowanceEntries = Object.entries(OFFER_ALLOWANCE_TYPES)
      const keys = ['candidates', 'titles', 'businessUnits', ...allowanceEntries.map(([key]) => `allowance:${key}`)]
      const requests = [
        client.get(`${OFFERS_BASE}/lookups/candidates`, { signal }),
        client.get(`${OFFERS_BASE}/lookups/titles`, { signal }),
        client.get(`${OFFERS_BASE}/lookups/business-units`, { signal }),
        ...allowanceEntries.map(([, type]) => client.get(`${OFFERS_BASE}/lookups/allowances`, { params: { type }, signal })),
      ]
      const results = await Promise.allSettled(requests)
      if (signal?.aborted) throw results.find((result) => result.status === 'rejected')?.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const data = results.map((result) => result.status === 'fulfilled' ? result.value?.data : null)
      const valid = data.map((value, index) => index === 2 ? Array.isArray(value?.businessUnits) : Array.isArray(value))
      const lookupErrors = Object.freeze(keys.filter((_, index) => results[index].status === 'rejected' || !valid[index]))
      const allowances = Object.fromEntries(allowanceEntries.map(([key], index) => {
        const value = data[index + 3]
        return [key, Object.freeze((Array.isArray(value) ? value : []).map((item) => Object.freeze({
          meaning: String(item?.meaning ?? ''), description: offerText(item?.description),
        })).filter((item) => item.meaning))]
      }))
      return Object.freeze({
        candidates: Object.freeze((Array.isArray(data[0]) ? data[0] : []).map((item) => Object.freeze({
          headerId: String(item?.headerId ?? ''), intNo: String(item?.intNo ?? ''), candidateName: offerText(item?.candidateName),
          positionName: offerText(item?.positionName), requisitionNo: item?.requisitionNo == null ? '' : String(item.requisitionNo),
        })).filter((item) => item.intNo && item.candidateName)),
        titles: Object.freeze((Array.isArray(data[1]) ? data[1] : []).map((item) => Object.freeze({
          meaning: offerText(item?.meaning), description: offerText(item?.description),
        })).filter((item) => item.meaning)),
        businessUnits: Object.freeze(Array.isArray(data[2]?.businessUnits) ? data[2].businessUnits.map(String) : []),
        allowances: Object.freeze(allowances), lookupErrors,
      })
    },
    async numberToArabic(number, { signal } = {}) {
      const { data } = await client.get(`${OFFERS_BASE}/lookups/number-to-arabic`, { params: { number }, signal })
      return offerText(data?.output)
    },
    async hijriDate(date, { signal } = {}) {
      const { data } = await client.get(`${OFFERS_BASE}/lookups/hijri-date`, { params: { date }, signal })
      return offerText(data?.hijri)
    },
    async list({ page = 1, limit = REPORT_PAGE_SIZE } = {}, { signal } = {}) {
      const result = await client.get(OFFERS_BASE, { params: { page, pageSize: limit }, signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected employment offer list.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({ items: Object.freeze(result.data.map(offerListItem)), pagination: Object.freeze({ ...result.pagination, limit: result.pagination.limit ?? limit }) })
    },
    getById,
    async save(id, body) {
      const payload = backendOfferPayload(body)
      const result = id
        ? await client.put(`${OFFERS_BASE}/${segment(id)}`, payload)
        : await client.post(OFFERS_BASE, payload)
      const savedId = String(id ?? result.data?.headerId ?? '')
      if (!ID_PATTERN.test(savedId)) throw new ApiError('The server did not return an employment offer ID.', { code: 'INVALID_RESPONSE' })
      return getById(savedId)
    },
    async remove(id) {
      await client.delete(`${OFFERS_BASE}/${segment(id)}`)
    },
  })
}

export function createOrientationService({ client }) {
  const dateOnly = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
  const textValue = (value) => value == null || value === '-' ? '' : String(value)
  const readRecord = (data) => {
    if (!data || !ID_PATTERN.test(String(data.headerId ?? '')) || !Array.isArray(data.lines) || !['Y', 'N'].includes(data.flag)) {
      throw new ApiError('The server returned an unexpected orientation training.', { code: 'INVALID_RESPONSE' })
    }
    return Object.freeze({
      scheduleId: String(data.headerId), scheduleNumber: textValue(data.reference) || String(data.headerId), status: String(data.status ?? ''), flag: data.flag,
      employee: Object.freeze({ employeeId: textValue(data.personId), employeeNumber: textValue(data.empNo), name: textValue(data.empname),
        employmentType: textValue(data.type), startDate: dateOnly(data.startDate), section: textValue(data.section), division: textValue(data.division),
        position: textValue(data.position), grade: '', departmentName: textValue(data.section) }),
      fromDate: dateOnly(data.fromOrient), toDate: dateOnly(data.toOrient), scheduledByName: textValue(data.orientationBy),
      lines: Object.freeze(data.lines.map((line) => Object.freeze({
        lineId: String(line.lineId), department: textValue(line.department), departmentHead: textValue(line.departmentHead),
        fromDate: dateOnly(line.fromDate), toDate: dateOnly(line.toDate), orientationDays: Number(line.orientationDays ?? 0),
        timeFrom: textValue(line.timeFrom), timeTo: textValue(line.timeTo), orientationPeriod: textValue(line.orientationPeriod), remarks: textValue(line.remarks),
      }))),
      updatedAt: data.createdAt ?? null,
    })
  }
  const readListItem = (data, flag) => Object.freeze({
    scheduleId: String(data.headerId), scheduleNumber: textValue(data.reference) || String(data.headerId), status: String(data.status ?? ''), flag,
    employeeName: textValue(data.empname), fromDate: dateOnly(data.fromOrient), toDate: dateOnly(data.toOrient), updatedAt: data.createdAt ?? null,
  })
  const getById = async (id, { signal } = {}) => readRecord((await client.get(`${ORIENTATION_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const [employees, managers] = await Promise.all([
        client.get(`${ORIENTATION_BASE}/lookups/employees`, { signal }),
        client.get(`${ORIENTATION_BASE}/lookups/managers`, { signal }),
      ])
      if (!Array.isArray(employees.data) || !Array.isArray(managers.data)) throw new ApiError('The server returned unexpected orientation options.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({
        employees: Object.freeze(employees.data.map((item) => Object.freeze({
          employeeId: String(item.personId), employeeNumber: String(item.empNo), name: String(item.fullName), employmentType: String(item.empType ?? ''),
          startDate: dateOnly(item.startDate), section: textValue(item.section), division: textValue(item.division), position: textValue(item.position), grade: '',
          departmentName: textValue(item.section),
        }))),
        managers: Object.freeze(managers.data.map((item) => Object.freeze({ code: String(item.fullName), name: String(item.fullName), employeeNumber: String(item.empNo) }))),
      })
    },
    async employeeSetup(empNo, { signal } = {}) {
      const [detailsResult, flagResult] = await Promise.all([
        client.get(`${ORIENTATION_BASE}/lookups/employee-details`, { params: { empNo }, signal }),
        client.get(`${ORIENTATION_BASE}/lookups/flag`, { params: { empNo }, signal }),
      ])
      const details = detailsResult.data
      const type = String(details?.empType ?? '')
      const { data: skillResult } = await client.get(`${ORIENTATION_BASE}/lookups/skills`, { params: { empType: type }, signal })
      if (!Array.isArray(skillResult?.skills) || !['Y', 'N'].includes(flagResult.data?.flag)) throw new ApiError('The server returned unexpected employee orientation details.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({
        employee: Object.freeze({ employeeId: String(details.personId), employeeNumber: String(details.empNo), name: String(details.empname),
          employmentType: type, startDate: dateOnly(details.startDate), section: textValue(details.section), division: textValue(details.division),
          position: textValue(details.position), grade: '', departmentName: textValue(details.section), directManager: textValue(details.directManager) }),
        flag: flagResult.data.flag, departments: Object.freeze(skillResult.skills.map(String)),
      })
    },
    async list({ page = 1, limit = REPORT_PAGE_SIZE, flag = 'Y' } = {}, { signal } = {}) {
      if (!['Y', 'N'].includes(flag)) throw new ApiError('Choose a valid orientation table.', { code: 'INVALID_PARAMS' })
      const result = await client.get(ORIENTATION_BASE, { params: { flag, page, pageSize: limit }, signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected orientation training list.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({ items: Object.freeze(result.data.map((item) => readListItem(item, flag))), pagination: result.pagination })
    },
    getById,
    async save(id, body) {
      const payload = {
        // startDate is optional but must be a valid date when sent, so an unknown joining date is omitted.
        empNo: body.employee.employeeNumber, fromOrient: body.fromOrient, toOrient: body.toOrient, ...(body.employee.startDate ? { startDate: body.employee.startDate } : {}),
        orientationBy: body.orientationBy || '', flag: body.flag, section: body.employee.section, empname: body.employee.name,
        personId: body.employee.employeeId, division: body.employee.division, type: body.employee.employmentType, position: body.employee.position,
        lines: body.lines.map((line) => ({ ...(line.lineId ? { lineId: line.lineId } : {}), department: line.department, departmentHead: line.departmentHead,
          fromDate: line.fromDate, toDate: line.toDate, orientationDays: line.orientationDays, timeFrom: line.timeFrom, timeTo: line.timeTo,
          // Blank lets the server recompute the period from the (possibly edited) times.
          orientationPeriod: '', remarks: line.remarks || '' })),
      }
      const result = id ? await client.put(`${ORIENTATION_BASE}/${segment(id)}`, payload) : await client.post(ORIENTATION_BASE, payload)
      const savedId = String(id ?? result.data?.headerId ?? '')
      if (!ID_PATTERN.test(savedId)) throw new ApiError('The server did not return an orientation training ID.', { code: 'INVALID_RESPONSE' })
      return getById(savedId)
    },
    async remove(id) { await client.delete(`${ORIENTATION_BASE}/${segment(id)}`) },
    async removeLine(id, lineId) { await client.delete(`${ORIENTATION_BASE}/${segment(id)}/lines/${segment(lineId)}`) },
  })
}

export function createEmployeeReportService({ client }) {
  const readEmployee = (item) => {
    if (!item || !ID_PATTERN.test(String(item.emp_id ?? '')) || !String(item.employee_number ?? '') ||
      !String(item.employee_name ?? '') || !String(item.con_number ?? '') || !['Active', 'Inactive'].includes(item.status)) {
      throw new ApiError('The server returned an unexpected employee report row.', { code: 'INVALID_RESPONSE' })
    }
    return Object.freeze({
      empId: String(item.emp_id), employeeNumber: String(item.employee_number), name: String(item.employee_name), division: String(item.division ?? ''),
      iqamah: Number(item.iqamah), department: String(item.department ?? ''), productionSection: String(item.prod_dep ?? ''), directBoss: String(item.direct_boss ?? ''),
      directBossId: item.direct_boss_id == null ? '' : String(item.direct_boss_id), jobId: item.job == null ? '' : String(item.job), jobTitle: String(item.job_title ?? ''),
      place: String(item.place ?? ''), replacement: item.replacement == null ? '' : String(item.replacement), rate: Number(item.rate ?? 0),
      startDate: String(item.start_date ?? ''), endDate: String(item.end_date ?? ''), status: item.status,
      ajeer: Boolean(item.ajeer), sfda: Boolean(item.sfda), blacklist: Boolean(item.blacklist), remark: String(item.remark ?? ''),
      contractorNumber: String(item.con_number), contractorName: String(item.con_name ?? ''), createdAt: item.creation_date ?? null, updatedAt: item.updated_date ?? null,
    })
  }
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const names = ['divisions', 'departments', 'contractors']
      const results = await Promise.all(names.map((name) => client.get(`${CONTRACTOR_EMPLOYEES_BASE}/lookups/${name}`, { signal })))
      const valid = results.map((result) => Array.isArray(result.data))
      if (valid.some((ok) => !ok)) throw new ApiError('The server returned unexpected employee report filters.', { code: 'INVALID_RESPONSE' })
      const [divisions, departments, contractors] = results.map((result) => result.data.map((item) => Object.freeze({ value: String(item.value), label: String(item.label) })))
      return Object.freeze({ divisions: Object.freeze(divisions), departments: Object.freeze(departments), contractors: Object.freeze(contractors) })
    },
    async list(params = {}, { signal } = {}) {
      const result = await client.get(CONTRACTOR_EMPLOYEES_BASE, { params: query({
        division: params.division, department: params.department, contractor_number: params.contractorNumber, status: params.status,
        date_from: params.dateFrom, date_to: params.dateTo, page: params.page ?? 1, limit: params.limit ?? 50,
        sort: params.sort ?? 'employee_number', order: params.order ?? 'asc',
      }), signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected employee report.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({ items: Object.freeze(result.data.map(readEmployee)), pagination: result.pagination })
    },
  })
}

export function createProbationService({ client }) {
  const fromLegacyDate = (value) => {
    if (typeof value !== 'string') return ''
    const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(value)
    if (!match) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months.findIndex((name) => name.toLowerCase() === match[2].toLowerCase())
    return month < 0 ? '' : `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
  const textValue = (value) => value == null || value === '-' ? '' : String(value)
  const readRecord = (data) => {
    if (!data || !ID_PATTERN.test(String(data.headerId ?? '')) || !Array.isArray(data.lines)) throw new ApiError('The server returned an unexpected probation evaluation.', { code: 'INVALID_RESPONSE' })
    return Object.freeze({
      evaluationId: String(data.headerId), evaluationNumber: String(data.headerId), status: String(data.requestStatus ?? 'DRAFT'),
      formDate: fromLegacyDate(data.formDate), evaluationPeriod: textValue(data.evaluationPeriod), formType: textValue(data.formType),
      employee: Object.freeze({ employeeId: textValue(data.empId), employeeNumber: textValue(data.employeeNumber), name: textValue(data.employeeName),
        position: textValue(data.jobTitle), grade: textValue(data.grade), departmentName: textValue(data.department), startDate: '' }),
      fromDate: fromLegacyDate(data.fromDate), toDate: fromLegacyDate(data.toDate), comment: textValue(data.comment), comments: textValue(data.comments),
      totalRating: Number(data.totalRating ?? 0), lines: Object.freeze(data.lines.map((line) => Object.freeze({
        // A stored 0 means "not rated"; the form represents that as blank.
        lineId: String(line.lineId), param: textValue(line.param), paramAr: textValue(line.paramAr), rating: Number(line.rating) || '',
      }))),
    })
  }
  const listItem = (data) => Object.freeze({
    evaluationId: String(data.headerId), evaluationNumber: String(data.headerId), status: String(data.requestStatus ?? 'DRAFT'),
    employeeName: String(data.employeeName ?? ''), formType: String(data.formType ?? ''), totalRating: Number(data.totalRating ?? 0),
    updatedAt: data.createdAt ?? null,
  })
  const getById = async (id, { signal } = {}) => readRecord((await client.get(`${PROBATION_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const [types, employees, requestor] = await Promise.all([
        client.get(`${PROBATION_BASE}/lookups/form-types`, { signal }),
        client.get(`${PROBATION_BASE}/lookups/employees`, { signal }),
        client.get(`${PROBATION_BASE}/lookups/requestor`, { signal }),
      ])
      if (!Array.isArray(types.data?.formTypes) || !Array.isArray(employees.data)) throw new ApiError('The server returned unexpected probation form options.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({
        probation: Object.freeze({ formTypes: Object.freeze(types.data.formTypes.map((name) => Object.freeze({ code: String(name), name: String(name), criteria: Object.freeze([]) }))), ratingScale: Object.freeze([]) }),
        employees: Object.freeze(employees.data.map((item) => Object.freeze({ employeeId: String(item.userId), employeeNumber: '', name: String(item.fullName), position: '', grade: '', departmentName: '', startDate: '' }))),
        requestor: requestor.data ?? null,
      })
    },
    async employeeDetails(name, { signal } = {}) {
      const { data } = await client.get(`${PROBATION_BASE}/lookups/employee-details`, { params: { empName: name }, signal })
      return Object.freeze({ employeeId: String(data?.ids?.personId ?? ''), employeeNumber: String(data?.ids?.employeeNumber ?? ''), name,
        startDate: fromLegacyDate(data?.hire?.startDate), position: String(data?.job?.name ?? ''), grade: '', departmentName: String(data?.dept?.name ?? '') })
    },
    async searchEmployees(search = '', { signal } = {}) {
      const { data } = await client.get(`${PROBATION_BASE}/lookups/employees`, { signal })
      if (!Array.isArray(data)) throw new ApiError('The server returned unexpected employees.', { code: 'INVALID_RESPONSE' })
      const value = String(search).trim().toLocaleLowerCase()
      const items = data.map((item) => Object.freeze({ employeeId: String(item.userId), employeeNumber: '', name: String(item.fullName), position: '', grade: '', departmentName: '', startDate: '' }))
        .filter((item) => item.name.toLocaleLowerCase().includes(value))
      return Object.freeze({ items: Object.freeze(items), pagination: Object.freeze({ page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }) })
    },
    async list({ page = 1, limit = REPORT_PAGE_SIZE } = {}, { signal } = {}) {
      const result = await client.get(PROBATION_BASE, { params: { page, pageSize: limit }, signal })
      if (!Array.isArray(result.data) || !result.pagination) throw new ApiError('The server returned an unexpected probation evaluation list.', { code: 'INVALID_RESPONSE' })
      return Object.freeze({ items: Object.freeze(result.data.map(listItem)), pagination: result.pagination })
    },
    getById,
    async save(id, body) {
      const payload = {
        formDate: body.formDate, evaluationPeriod: body.evaluationPeriod, formType: body.formType,
        employeeName: body.employee.name, employeeNumber: body.employee.employeeNumber, empId: body.employee.employeeId,
        grade: Number(body.employee.grade) || 0, jobTitle: body.employee.position, department: body.employee.departmentName,
        fromDate: body.fromDate, toDate: body.toDate, comment: body.comment, comments: body.comments,
        totalRating: body.lines.reduce((total, line) => total + (Number(line.rating) || 0), 0),
        // The backend accepts only 1–5 and stores an omitted rating as 0 (not rated).
        lines: body.lines.map((line) => ({ ...(id ? { lineId: line.lineId } : {}), param: line.param, paramAr: line.paramAr || '', ...(Number(line.rating) ? { rating: Number(line.rating) } : {}) })),
      }
      const result = id ? await client.put(`${PROBATION_BASE}/${segment(id)}`, payload) : await client.post(PROBATION_BASE, payload)
      const savedId = String(id ?? result.data?.headerId ?? '')
      if (!ID_PATTERN.test(savedId)) throw new ApiError('The server did not return a probation evaluation ID.', { code: 'INVALID_RESPONSE' })
      return getById(savedId)
    },
    async remove(id) { await client.delete(`${PROBATION_BASE}/${segment(id)}`) },
  })
}

// Periodwise Employees: every employee attached to the department (or all
// departments) at any point in [from, to]. Age, service, KPIs and charts are
// derived on the page (report/periodwiseModel.js).
export function createReportService({ client }) {
  return Object.freeze({
    async periodwiseEmployees({ department, from, to }, { signal } = {}) {
      const { data } = await client.get(`${HR_REPORTS_BASE}/periodwise-employees`, { params: query({ department, from, to }), signal })
      return readReport(data)
    },
  })
}

// The one switch between demo data and the real API.
export function selectClient({ demo, api = apiClient, createDemo = createDemoClient } = {}) {
  return demo ? createDemo() : api
}

// `onboardingClient` serves the session-only report, legacy suggestions and
// employee search. Orientation, probation and the three recruitment forms use
// authenticated API clients.
export function createHrRecruitmentServices({
  client, requisitionClient = client, interviewClient = client, offerClient = client, onboardingClient = client, probationClient = client, orientationClient = client,
}) {
  return Object.freeze({
    client,
    onboardingClient,
    // All recruitment forms use the authenticated API, including in dev.
    requisitions: createBackendRequisitionService({ client: requisitionClient }),
    interviews: createInterviewService({ client: interviewClient }),
    offers: createOfferService({ client: offerClient }),
    // Suggestions/report lookup and employee search remain on the onboarding adapter.
    lookups: createLookupService({ client: onboardingClient }),
    orientations: createOrientationService({ client: orientationClient }),
    employeeReport: createEmployeeReportService({ client }),
    probations: createProbationService({ client: probationClient }),
    reports: createReportService({ client: onboardingClient }),
  })
}

// The demo adapter cannot see the session, so the signed-in user's name is
// passed to it for the server-assigned "scheduled by" and "prepared by"
// values. The real API takes them from the session; this is a no-op for any
// client without `identify`.
export function identifyDemoUser(name, client = hrRecruitmentServices.onboardingClient) {
  client.identify?.(typeof name === 'string' && name.trim() ? name.trim() : null)
}

export const hrRecruitmentServices = createHrRecruitmentServices({
  client: apiClient, requisitionClient: apiClient, interviewClient: apiClient, offerClient: apiClient,
  onboardingClient: selectClient({ demo: hrRecruitmentConfig.demo }), probationClient: apiClient, orientationClient: apiClient,
})
// The onboarding screens show a "Demo data" badge while they use the demo adapter.
export const hrRecruitmentDemo = hrRecruitmentConfig.demo
export const attachmentsSupported = true
