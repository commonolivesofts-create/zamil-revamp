// HR recruitment services. Personnel Requisition uses the live legacy-form
// API contract; Interview Assessment and Employment Offer remain on the
// existing recruitment client until their backend integrations are handled.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { hrRecruitmentConfig } from './hrRecruitmentConfig.js'
import { createDemoClient } from './demo/demoClient.js'
import {
  ID_PATTERN, readInterview, readInterviewListItem, readLookups, readOffer, readOfferListItem, readPage,
} from './hrRecruitmentContract.js'

export const HR_BASE = '/hr/recruitment'
export const REPORT_PAGE_SIZE = 10

const REQUISITIONS_BASE = '/hr/requisitions'
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

function query(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

export function createLookupService({ client }) {
  return Object.freeze({
    async get({ signal } = {}) {
      const { data } = await client.get(`${HR_BASE}/lookups`, { signal })
      return readLookups(data)
    },
  })
}

// A create (no id) is a POST; a change of an existing record is a PUT.
const write = (client, base, id, body) => (id ? client.put(`${base}/${segment(id)}`, body) : client.post(base, body))

// list, getById, a save that returns the record, and a workflow action
// (`/submit` or `/issue`) on a saved record. Pages save first and keep the
// returned id, so a failed action never leaves an unknown new record behind.
function createRecordService({ client, base, readRecord, readListItem, actionName }) {
  const list = async ({ page = 1, limit = REPORT_PAGE_SIZE } = {}, { signal } = {}) =>
    readPage(await client.get(base, { params: query({ page, limit }), signal }), readListItem)
  const getById = async (id, { signal } = {}) => readRecord((await client.get(`${base}/${segment(id)}`, { signal })).data)
  const save = async (id, body) => readRecord((await write(client, base, id, body)).data)
  const act = async (id) => readRecord((await client.post(`${base}/${segment(id)}/${actionName}`, {})).data)
  return { list, getById, save, act }
}

export function createRequisitionService({ client }) {
  return createBackendRequisitionService({ client })
}

export function createInterviewService({ client }) {
  const record = createRecordService({
    client, base: `${HR_BASE}/interview-assessments`, readRecord: readInterview, readListItem: readInterviewListItem, actionName: 'submit',
  })
  return Object.freeze({
    list: record.list,
    getById: record.getById,
    // Save requires all four tabs complete (checked by the page and by the
    // server); the record becomes COMPLETE with a server-assigned number.
    save: record.save,
    submit: record.act,
  })
}

export function createOfferService({ client }) {
  const record = createRecordService({
    client, base: `${HR_BASE}/employment-offers`, readRecord: readOffer, readListItem: readOfferListItem, actionName: 'issue',
  })
  return Object.freeze({
    list: record.list,
    getById: record.getById,
    saveDraft: record.save,
    // Issue: ISSUED, or ACCEPTED when the applicant already signed; the
    // server assigns the offer number.
    issue: record.act,
  })
}

// The one switch between demo data and the real API.
export function selectClient({ demo, api = apiClient, createDemo = createDemoClient } = {}) {
  return demo ? createDemo() : api
}

export function createHrRecruitmentServices({ client, requisitionClient = client }) {
  return Object.freeze({
    client,
    lookups: createLookupService({ client }),
    // The Personal Requisition backend is already available; unlike the two
    // later forms it always uses the authenticated API, including in dev.
    requisitions: createBackendRequisitionService({ client: requisitionClient }),
    interviews: createInterviewService({ client }),
    offers: createOfferService({ client }),
  })
}

export const hrRecruitmentServices = createHrRecruitmentServices({
  client: selectClient({ demo: hrRecruitmentConfig.demo }), requisitionClient: apiClient,
})
export const hrRecruitmentDemo = hrRecruitmentConfig.demo
export const attachmentsSupported = true
