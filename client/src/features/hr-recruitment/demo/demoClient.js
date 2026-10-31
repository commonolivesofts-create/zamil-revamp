// DEMO ADAPTER ONLY (owner-approved for HR recruitment until its backend exists).
// An in-memory stand-in for the HR recruitment API with the shared API
// client's interface: get/post/put resolve to { status, data, pagination,
// requestId } and failures reject with ApiError, exactly like apiClient. It
// behaves like the proposed backend: it assigns numbers, statuses, requester
// and admin manager, validates submissions (422), refuses changes to locked
// records (409), reports unknown records (404) and answers after a short
// delay. Records live in memory only (never browser storage) and are lost on
// reload. Delete this folder when the real API exists (see the README).
import { ApiError } from '../../../services/api/apiClient.js'
import { businessToday } from '../shared/hrFormat.js'
import { INTERVIEW_TEXT } from '../hrRecruitmentText.js'
import { COMP_KEYS, HR_FIELDS, SPEC_KEYS } from '../interview/interviewModel.js'
import { BENEFIT_KEYS, issuedStatus } from '../offer/offerModel.js'
import { scheduleIssues, scheduleToDate } from '../orientation/orientationModel.js'
import { validateProbation } from '../probation/probationModel.js'
import { ALL_DEPARTMENTS, inPeriod } from '../report/periodwiseModel.js'
import { isIsoDate } from '../shared/hrFormat.js'
import { DEMO_ASSIGNED, DEMO_EMPLOYEES, DEMO_LOOKUPS, createDemoRecords, createDemoReportRows } from './demoData.js'

const BASE = '/hr/recruitment'
const ROUTE = /^\/hr\/recruitment\/(requisitions|interview-assessments|employment-offers|orientation-schedules|probation-evaluations)(?:\/([1-9][0-9]*)(?:\/(submit|issue))?)?$/
const MAX_LIMIT = 100

const clone = (value) => structuredClone(value)

const COLLECTIONS = Object.freeze({
  requisitions: Object.freeze({
    store: 'requisitions', id: 'requisitionId', number: 'requisitionNumber', prefix: 'PRQ', action: 'submit',
    listFields: ['requisitionId', 'requisitionNumber', 'status', 'jobTitle', 'departmentCode', 'updatedAt'],
    locked: (record) => record.status === 'SUBMITTED',
  }),
  'interview-assessments': Object.freeze({
    store: 'interviews', id: 'assessmentId', number: 'assessmentNumber', prefix: 'IA', action: 'submit',
    listFields: ['assessmentId', 'assessmentNumber', 'status', 'candidateName', 'positionTitle', 'outcome', 'updatedAt'],
    locked: (record) => record.status === 'SUBMITTED',
  }),
  'employment-offers': Object.freeze({
    store: 'offers', id: 'offerId', number: 'offerNumber', prefix: 'OFR', action: 'issue',
    listFields: ['offerId', 'offerNumber', 'status', 'position', 'candidateNameEn', 'updatedAt'],
    locked: (record) => record.status === 'ISSUED' || record.status === 'ACCEPTED',
  }),
  'orientation-schedules': Object.freeze({
    store: 'orientations', id: 'scheduleId', number: 'scheduleNumber', prefix: 'ORT', action: null,
    listItem: (record) => ({
      scheduleId: record.scheduleId, scheduleNumber: record.scheduleNumber, status: record.status, employeeName: record.employee.name,
      fromDate: record.fromDate, toDate: record.toDate, updatedAt: record.updatedAt,
    }),
    // A saved schedule is read-only.
    locked: () => true,
  }),
  'probation-evaluations': Object.freeze({
    store: 'evaluations', id: 'evaluationId', number: 'evaluationNumber', prefix: 'PAF', action: 'submit',
    listItem: (record) => ({
      evaluationId: record.evaluationId, evaluationNumber: record.evaluationNumber, status: record.status, employeeName: record.employee.name,
      formTypeCode: record.formTypeCode, totalPoints: Object.values(record.scores).reduce((sum, value) => sum + value, 0), updatedAt: record.updatedAt,
    }),
    locked: (record) => record.status === 'SUBMITTED',
  }),
})

// Writable fields per collection, as the backend's Joi schema would allow.
const REQUISITION_FIELDS = [
  'jobTitle', 'departmentCode', 'neededDate', 'remark', 'reason', 'replacementFor', 'additionReason', 'budgeted', 'budgetedSalary',
  'educationCodes', 'gccExperienceCode', 'workExperienceCode', 'skills', 'otherRequirements', 'attachments',
]
const INTERVIEW_FIELDS = [
  ...HR_FIELDS.map(([key]) => key), 'personalSpecification', 'personalSpecificationRemarks', 'competency', 'competencyRemarks',
  'strengths', 'weakness', 'outcome', 'departmentRepresentative', 'payroll', 'hrComment', 'interviewers',
]
const OFFER_FIELDS = ['position', 'offerDate', 'reportFormat', 'salutation', 'candidateNameEn', 'candidateNameAr', 'benefits', 'comments', 'signatures']
const ORIENTATION_FIELDS = ['employeeId', 'fromDate', 'sessions']
const PROBATION_FIELDS = [
  'formTypeCode', 'employeeId', 'fromDate', 'toDate', 'scores', 'notes', 'strengths', 'improvements', 'training', 'recommendation',
  'extendByMonths', 'justification', 'comments', 'suggestion', 'signatures',
]
const FIELDS = Object.freeze({
  requisitions: REQUISITION_FIELDS, interviews: INTERVIEW_FIELDS, offers: OFFER_FIELDS, orientations: ORIENTATION_FIELDS, evaluations: PROBATION_FIELDS,
})

const pick = (body, fields) => Object.fromEntries(fields.filter((field) => body && field in body).map((field) => [field, clone(body[field])]))
const blank = (value) => value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new ApiError('The API request was cancelled.', { code: 'ABORTED' }))
    if (signal?.aborted) return aborted()
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve() }, ms)
    function onAbort() { clearTimeout(timer); aborted() }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

// Missing answers of a requisition submission, as validation details.
function requisitionProblems(record) {
  const required = ['jobTitle', 'departmentCode', 'neededDate', 'reason', record.reason === 'ADDITION' ? 'additionReason' : 'replacementFor',
    'educationCodes', 'gccExperienceCode', 'workExperienceCode', 'skills']
  const problems = required.filter((field) => blank(record[field])).map((field) => ({ field, message: `${field} is required` }))
  if (record.budgeted === null) problems.push({ field: 'budgeted', message: 'budgeted is required' })
  if (record.budgeted === true && record.budgetedSalary === null) problems.push({ field: 'budgetedSalary', message: 'budgetedSalary is required' })
  return problems
}

function interviewComplete(record) {
  const hr = HR_FIELDS.filter(([, , rules]) => rules.required).every(([key]) => !blank(record[key]))
  const rated = (group, keys) => keys.every((key) => group?.[key]?.rating)
  return hr && rated(record.personalSpecification, SPEC_KEYS) && rated(record.competency, COMP_KEYS) && Boolean(record.outcome)
}

function offerProblems(record) {
  const problems = []
  if (blank(record.position)) problems.push({ field: 'position', message: 'position is required' })
  if (blank(record.candidateNameEn)) problems.push({ field: 'candidateNameEn', message: 'candidateNameEn is required' })
  if (blank(record.benefits?.basic?.en)) problems.push({ field: 'benefits.basic', message: 'benefits.basic is required' })
  if (blank(record.benefits?.start?.en)) problems.push({ field: 'benefits.start', message: 'benefits.start is required' })
  return problems
}

// Orientation submissions: the employee must exist, From must be set, at least
// one session must be dated (so To exists) and no blocking problem may remain.
function orientationProblems(record, employee) {
  const problems = []
  if (!employee) problems.push({ field: 'employeeId', message: 'employeeId is required' })
  if (!record.fromDate) problems.push({ field: 'fromDate', message: 'fromDate is required' })
  const sessions = Object.fromEntries(Object.entries(record.sessions ?? {}).map(([key, session]) => [key, {
    fromDate: session?.fromDate ?? '', toDate: session?.toDate ?? '', timeFrom: session?.timeFrom ?? '', timeTo: session?.timeTo ?? '',
  }]))
  if (Object.keys(sessions).length !== 5 || !scheduleToDate(sessions)) problems.push({ field: 'sessions', message: 'at least one dated session is required' })
  else {
    for (const issue of scheduleIssues(sessions).filter((item) => item.level === 'bad')) problems.push({ field: `sessions.${issue.key}`, message: issue.text })
  }
  return problems
}

// Probation checks as the backend would run them, on the stored record.
function probationProblems(record, employee, lookups, { submit }) {
  const formType = lookups.probation.formTypes.find((item) => item.code === record.formTypeCode)
  const form = {
    formTypeCode: formType ? record.formTypeCode : '', employeeId: employee ? employee.employeeId : '', fromDate: record.fromDate ?? '', toDate: record.toDate ?? '',
    scores: record.scores ?? {}, recommendation: record.recommendation ?? '', extendBy: record.extendByMonths ? String(record.extendByMonths) : '',
    justification: record.justification ?? '', signatures: record.signatures ?? {},
  }
  const { errors } = validateProbation(form, { employee, criteria: formType?.criteria ?? [] }, { submit })
  return Object.entries(errors).map(([field, message]) => ({ field, message }))
}

export function createDemoClient({
  latencyMs = 350, now = () => new Date(), records = createDemoRecords(), lookups = DEMO_LOOKUPS, employees = DEMO_EMPLOYEES, reportRows = createDemoReportRows(),
} = {}) {
  const store = clone(records)
  let requests = 0
  // The signed-in user's name (identifyDemoUser); a real backend uses the session.
  let actor = null

  const fail = (status, code, message, details = []) => {
    throw new ApiError(message, { code, status, details, requestId: `demo-${requests}` })
  }
  const respond = (data, { status = 200, pagination = null } = {}) =>
    Object.freeze({ status, data: clone(data), pagination: pagination && Object.freeze(pagination), requestId: `demo-${requests}` })
  const timestamp = () => now().toISOString()
  const today = () => businessToday(now())

  // Next number for a prefix and the current business year: PRQ-2026-0003.
  function nextNumber(collection) {
    const year = today().slice(0, 4)
    const pattern = new RegExp(`^${collection.prefix}-${year}-(\\d+)$`)
    const highest = store[collection.store]
      .map((record) => pattern.exec(record[collection.number] ?? '')?.[1])
      .filter(Boolean).map(Number).reduce((max, value) => Math.max(max, value), 0)
    return `${collection.prefix}-${year}-${String(highest + 1).padStart(4, '0')}`
  }
  const nextId = (collection) => String(store[collection.store].reduce((max, record) => Math.max(max, Number(record[collection.id])), 0) + 1)
  const find = (collection, id) => store[collection.store].find((record) => record[collection.id] === id) ?? fail(404, 'NOT_FOUND', 'The record was not found.')

  function list(collection, params = {}) {
    const page = Math.max(1, Number.parseInt(params.page, 10) || 1)
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(params.limit, 10) || 25))
    const number = String(params.number ?? '').trim().toLowerCase()
    const items = store[collection.store]
      .filter((record) => !number || String(record[collection.number] ?? '').toLowerCase() === number)
      .filter((record) => !params.status || record.status === params.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const total = items.length
    const totalPages = Math.ceil(total / limit)
    return respond(items.slice((page - 1) * limit, page * limit).map((record) => (collection.listItem ? collection.listItem(record) : pick(record, collection.listFields))), {
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
    })
  }

  // Server-side values for a saved record.
  function prepare(collection, record) {
    if (collection.store === 'interviews') {
      if (!interviewComplete(record)) fail(422, 'VALIDATION_ERROR', INTERVIEW_TEXT.errors.incomplete)
      const requisition = store.requisitions.find((item) => item.status === 'SUBMITTED' &&
        String(item.requisitionNumber).toLowerCase() === String(record.requisitionNumber).trim().toLowerCase())
      record.positionTitle = requisition ? requisition.jobTitle : null
      record.adminManagerName = DEMO_ASSIGNED.adminManagerName
      if (record.status !== 'SUBMITTED') record.status = 'COMPLETE'
      record.assessmentNumber ??= nextNumber(collection)
    }
    if (collection.store === 'requisitions') {
      record.attachments = (record.attachments ?? []).map(({ fileName, sizeBytes }) => ({ fileName: String(fileName), sizeBytes: Number(sizeBytes) || 0 }))
    }
    if (collection.store === 'offers') {
      record.benefits = Object.fromEntries(BENEFIT_KEYS.map((key) => [key, record.benefits?.[key] ?? { en: '', ar: '', autoArabic: true }]))
    }
    if (collection.store === 'orientations') {
      const person = employees.find((item) => item.employeeId === record.employeeId)
      const problems = orientationProblems(record, person)
      if (problems.length) fail(422, 'VALIDATION_ERROR', 'The orientation schedule cannot be saved.', problems)
      record.employee = clone(person)
      delete record.employeeId
      record.toDate = scheduleToDate(record.sessions)
      record.scheduledByName = actor ?? DEMO_ASSIGNED.scheduledByName
      record.status = 'SCHEDULED'
      record.scheduleNumber ??= nextNumber(collection)
    }
    if (collection.store === 'evaluations') {
      const person = employees.find((item) => item.employeeId === (record.employeeId ?? record.employee?.employeeId))
      const problems = probationProblems(record, person, lookups, { submit: false })
      if (problems.length) fail(422, 'VALIDATION_ERROR', 'The evaluation cannot be saved.', problems)
      record.employee = clone(person)
      delete record.employeeId
      record.scores ??= {}
      record.notes ??= {}
      record.signatures = { evaluator: record.signatures?.evaluator ?? null, employee: record.signatures?.employee ?? null }
      record.preparedByName = actor ?? record.preparedByName ?? DEMO_ASSIGNED.preparedByName
      record.status = 'DRAFT'
      record.evaluationNumber ??= nextNumber(collection)
    }
    record.updatedAt = timestamp()
    return record
  }

  function create(collection, body) {
    const base = {
      requisitions: () => ({ requisitionNumber: null, status: 'DRAFT', requesterName: actor ?? DEMO_ASSIGNED.requesterName, requestDate: today(), basicSalary: null, attachments: [] }),
      interviews: () => ({ assessmentNumber: null, status: 'INCOMPLETE', positionTitle: null, adminManagerName: null }),
      offers: () => ({ offerNumber: null, status: 'DRAFT', currency: lookups.offer.currency }),
      orientations: () => ({ scheduleNumber: null }),
      evaluations: () => ({
        evaluationNumber: null, strengths: '', improvements: '', training: '', recommendation: null, extendByMonths: null, justification: '', comments: '', suggestion: '',
      }),
    }[collection.store]()
    const record = prepare(collection, { [collection.id]: nextId(collection), ...base, ...pick(body, FIELDS[collection.store]) })
    store[collection.store].push(record)
    return respond(record, { status: 201 })
  }

  function update(collection, id, body) {
    const current = find(collection, id)
    if (collection.locked(current)) fail(409, 'CONFLICT', 'This record is read-only because it was already submitted or issued.')
    const record = prepare(collection, { ...clone(current), ...pick(body, FIELDS[collection.store]) })
    store[collection.store][store[collection.store].indexOf(current)] = record
    return respond(record)
  }

  function act(collection, id) {
    const current = find(collection, id)
    if (collection.locked(current)) fail(409, 'CONFLICT', 'This record is read-only because it was already submitted or issued.')
    const record = clone(current)
    if (collection.store === 'requisitions') {
      const problems = requisitionProblems(record)
      if (problems.length) fail(422, 'VALIDATION_ERROR', 'The requisition is incomplete.', problems)
      record.status = 'SUBMITTED'
    } else if (collection.store === 'interviews') {
      if (!interviewComplete(record)) fail(422, 'VALIDATION_ERROR', INTERVIEW_TEXT.errors.incomplete)
      record.status = 'SUBMITTED'
    } else if (collection.store === 'evaluations') {
      const problems = probationProblems({ ...record, employeeId: record.employee.employeeId }, record.employee, lookups, { submit: true })
      if (problems.length) fail(422, 'VALIDATION_ERROR', 'The evaluation cannot be submitted.', problems)
      record.status = 'SUBMITTED'
    } else {
      const problems = offerProblems(record)
      if (problems.length) fail(422, 'VALIDATION_ERROR', 'The offer is incomplete.', problems)
      record.status = issuedStatus(record.signatures)
    }
    record[collection.number] ??= nextNumber(collection)
    record.updatedAt = timestamp()
    store[collection.store][store[collection.store].indexOf(current)] = record
    return respond(record)
  }


  // Employees attached to the department at any point in [from, to].
  function periodwiseEmployees(params = {}) {
    const department = params.department || ALL_DEPARTMENTS
    const problems = []
    if (!isIsoDate(params.from)) problems.push({ field: 'from', message: 'from is required' })
    if (!isIsoDate(params.to)) problems.push({ field: 'to', message: 'to is required' })
    if (isIsoDate(params.from) && isIsoDate(params.to) && params.to < params.from) problems.push({ field: 'to', message: 'to must not be before from' })
    if (department !== ALL_DEPARTMENTS && !lookups.departments.some((item) => item.code === department)) problems.push({ field: 'department', message: 'unknown department' })
    if (problems.length) fail(422, 'VALIDATION_ERROR', 'The report parameters are not valid.', problems)
    const rows = reportRows.filter((row) => (department === ALL_DEPARTMENTS || row.departmentCode === department) && inPeriod(row, params))
    return respond({ rows })
  }

  async function request(method, path, { params, body, signal } = {}) {
    requests += 1
    await wait(latencyMs, signal)
    if (method === 'GET' && path === `${BASE}/lookups`) return respond(lookups)
    if (method === 'GET' && path === '/hr/reports/periodwise-employees') return periodwiseEmployees(params)
    const match = ROUTE.exec(path)
    if (!match) fail(404, 'NOT_FOUND', 'The requested resource does not exist.')
    const [, name, id, action] = match
    const collection = COLLECTIONS[name]
    if (method === 'GET' && !id) return list(collection, params)
    if (method === 'GET' && id && !action) return respond(find(collection, id))
    if (method === 'POST' && !id) return create(collection, body)
    if (method === 'PUT' && id && !action) return update(collection, id, body)
    if (method === 'POST' && id && action && action === collection.action) return act(collection, id)
    return fail(405, 'METHOD_NOT_ALLOWED', 'The request method is not supported for this resource.')
  }

  return Object.freeze({
    demo: true,
    identify: (name) => { actor = name },
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
  })
}
