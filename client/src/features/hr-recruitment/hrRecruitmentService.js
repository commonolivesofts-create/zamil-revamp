// HR recruitment services use the existing requisition, interview and offer
// backend contracts without changing server-owned schemas or workflows.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { createDemoClient } from './demo/demoClient.js'
import {
  ID_PATTERN, readInterview, readInterviewListItem, readLookups, readOffer, readOfferListItem,
} from './hrRecruitmentContract.js'
import { COMP_KEYS, SPEC_KEYS } from './interview/interviewModel.js'
import { BENEFIT_KEYS } from './offer/offerModel.js'

export const HR_BASE = '/hr/recruitment'
export const REPORT_PAGE_SIZE = 10

const REQUISITIONS_BASE = '/hr/requisitions'
const INTERVIEWS_BASE = '/hr/interview-assessments'
const OFFERS_BASE = '/hr/employment-offers'
const OFFER_ALLOWANCE_TYPES = Object.freeze({
  housing: 'housing', transport: 'transportation', vacation: 'annual-vacation', ticket: 'ticket', medical: 'medical', contract: 'contract-period',
})
const INTERVIEW_PAYROLL_BUS = Object.freeze(['300000003618177', '300000003618190'])
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
  if (!INTERVIEW_PAYROLL_BUS.includes(payroll)) {
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
      adminManager: String(body.adminManager ?? '').trim(), managningDirector: String(body.managingDirector ?? '').trim(),
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
      const keys = ['jobs', 'departments', 'requester', 'replacements']
      const results = await Promise.allSettled([
        client.get(`${REQUISITIONS_BASE}/lookups/job-titles`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/departments`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/requestor`, { signal }),
        client.get(`${REQUISITIONS_BASE}/lookups/replacement-for`, { signal }),
      ])
      if (signal?.aborted) throw results.find((result) => result.status === 'rejected')?.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const data = results.map((result) => result.status === 'fulfilled' ? result.value?.data : null)
      const valid = [Array.isArray(data[0]), Array.isArray(data[1]), Boolean(data[2] && typeof data[2] === 'object' && !Array.isArray(data[2]) && typeof data[2].fullName === 'string'), Array.isArray(data[3])]
      const lookupErrors = Object.freeze(keys.filter((_, index) => results[index].status === 'rejected' || !valid[index]))
      const replacements = Array.isArray(data[3]) ? data[3].map((item) => {
        if (typeof item === 'string') return item
        return String(item?.fullName ?? item?.employeeName ?? item?.name ?? '')
      }).filter(Boolean) : []
      return Object.freeze({
        jobs: Object.freeze((Array.isArray(data[0]) ? data[0] : []).map((item) => ({ id: String(item.jobId ?? ''), name: String(item.name ?? '') })).filter((item) => item.name)),
        departments: Object.freeze((Array.isArray(data[1]) ? data[1] : []).map((item) => ({ id: String(item.deptId ?? ''), name: String(item.name ?? '') })).filter((item) => item.name)),
        requester: String(data[2]?.fullName ?? ''), replacements: Object.freeze(replacements), lookupErrors,
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
        departmentName: String(item.deptName ?? ''), updatedAt: item.lastUpdateDate ?? item.creationDate ?? null,
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
      const keys = ['nationalities', 'requisitions', 'employees']
      const results = await Promise.allSettled([
        client.get(`${INTERVIEWS_BASE}/lookups/nationalities`, { signal }),
        client.get(`${INTERVIEWS_BASE}/lookups/requisitions`, { signal }),
        client.get(`${INTERVIEWS_BASE}/lookups/employees`, { signal }),
      ])
      if (signal?.aborted) throw results.find((result) => result.status === 'rejected')?.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' })
      const data = results.map((result) => result.status === 'fulfilled' ? result.value?.data : null)
      const valid = data.map(Array.isArray)
      const lookupErrors = Object.freeze(keys.filter((_, index) => results[index].status === 'rejected' || !valid[index]))
      const approvedRequisitions = (Array.isArray(data[1]) ? data[1] : []).map((item) => ({
        requisitionNumber: String(item?.requisitionNumber ?? ''), jobName: String(item?.jobName ?? ''),
      })).filter((item) => item.requisitionNumber && item.jobName)
      return Object.freeze({
        // The existing service exposes valid attribute3 IDs but no friendly labels.
        payrollBusinessUnits: Object.freeze(INTERVIEW_PAYROLL_BUS.map((code) => Object.freeze({ code, name: code }))),
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

// The one switch between demo data and the real API.
export function selectClient({ demo, api = apiClient, createDemo = createDemoClient } = {}) {
  return demo ? createDemo() : api
}

export function createHrRecruitmentServices({ client, requisitionClient = client, interviewClient = client, offerClient = client }) {
  return Object.freeze({
    client,
    lookups: createLookupService({ client }),
    // All recruitment forms use the authenticated API, including in dev.
    requisitions: createBackendRequisitionService({ client: requisitionClient }),
    interviews: createInterviewService({ client: interviewClient }),
    offers: createOfferService({ client: offerClient }),
  })
}

export const hrRecruitmentServices = createHrRecruitmentServices({
  client: apiClient, requisitionClient: apiClient, interviewClient: apiClient, offerClient: apiClient,
})
export const attachmentsSupported = true
