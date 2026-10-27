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
import { DEMO_ASSIGNED, DEMO_LOOKUPS, createDemoRecords } from './demoData.js'

const BASE = '/hr/recruitment'
const ROUTE = /^\/hr\/recruitment\/(requisitions|interview-assessments|employment-offers)(?:\/([1-9][0-9]*)(?:\/(submit|issue))?)?$/
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

export function createDemoClient({ latencyMs = 350, now = () => new Date(), records = createDemoRecords(), lookups = DEMO_LOOKUPS } = {}) {
  const store = clone(records)
  let requests = 0

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
    return respond(items.slice((page - 1) * limit, page * limit).map((record) => pick(record, collection.listFields)), {
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
    record.updatedAt = timestamp()
    return record
  }

  function create(collection, body) {
    const fields = { requisitions: REQUISITION_FIELDS, interviews: INTERVIEW_FIELDS, offers: OFFER_FIELDS }[collection.store]
    const base = {
      requisitions: () => ({ requisitionNumber: null, status: 'DRAFT', requesterName: DEMO_ASSIGNED.requesterName, requestDate: today(), basicSalary: null, attachments: [] }),
      interviews: () => ({ assessmentNumber: null, status: 'INCOMPLETE', positionTitle: null, adminManagerName: null }),
      offers: () => ({ offerNumber: null, status: 'DRAFT', currency: lookups.offer.currency }),
    }[collection.store]()
    const record = prepare(collection, { [collection.id]: nextId(collection), ...base, ...pick(body, fields) })
    store[collection.store].push(record)
    return respond(record, { status: 201 })
  }

  function update(collection, id, body) {
    const current = find(collection, id)
    if (collection.locked(current)) fail(409, 'CONFLICT', 'This record is read-only because it was already submitted or issued.')
    const fields = { requisitions: REQUISITION_FIELDS, interviews: INTERVIEW_FIELDS, offers: OFFER_FIELDS }[collection.store]
    const record = prepare(collection, { ...clone(current), ...pick(body, fields) })
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

  async function request(method, path, { params, body, signal } = {}) {
    requests += 1
    await wait(latencyMs, signal)
    if (method === 'GET' && path === `${BASE}/lookups`) return respond(lookups)
    const match = ROUTE.exec(path)
    if (!match) fail(404, 'NOT_FOUND', 'The requested resource does not exist.')
    const [, name, id, action] = match
    const collection = COLLECTIONS[name]
    if (method === 'GET' && !id) return list(collection, params)
    if (method === 'GET' && id && !action) return respond(find(collection, id))
    if (method === 'POST' && !id) return create(collection, body)
    if (method === 'PUT' && id && !action) return update(collection, id, body)
    if (method === 'POST' && id && action === collection.action) return act(collection, id)
    return fail(405, 'METHOD_NOT_ALLOWED', 'The request method is not supported for this resource.')
  }

  return Object.freeze({
    demo: true,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    put: (path, body, options) => request('PUT', path, { ...options, body }),
  })
}
