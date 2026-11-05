// Business Visa Request (legacy visa_request): /api/v1/hr/business-visa-requests,
// guarded by HR.BUSINESS_VISA_LETTERS (shared with the letters). A request for a visitor coming to the company:
// visitor, travel, visa type and expenses, and the passport copy and other
// documents (uploaded one per call after the request is saved). Readers reject
// unexpected data.
import { apiClient } from '../../../services/api/apiClient.js'
import { ID, invalidResponse, isoDate, normalizeStatus, pageOf, params, segment, text } from '../shared/formRecords.js'

export const BASE = '/hr/business-visa-requests'
export const RESOURCE = 'HR.BUSINESS_VISA_LETTERS'
export const TEXT_MAX = 500
export const FILE_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'txt', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odt', 'xml'])
export const FILE_MAX_MB = 24

export const TEXT_FIELDS = Object.freeze([
  'division', 'dept', 'visitorName', 'visitorPhone', 'nationality', 'profession', 'passportNo', 'companyName', 'address',
  'tel', 'fax', 'comingFrom', 'travelRoute', 'visitPurpose', 'saudiEmbassy', 'otherDetails',
])
export const DATE_FIELDS = Object.freeze(['requestDate', 'issueDate', 'expiryDate', 'arrivalDate'])
export const CHECK_FIELDS = Object.freeze(['visaSingle', 'visaMultiple', 'travelCompany', 'travelPersonal', 'travelOther', 'hotelCompany', 'hotelPersonal', 'hotelOther'])
// Required by the legacy form (address and "if other" were optional).
export const REQUIRED = Object.freeze([
  'division', 'dept', 'requestDate', 'visitorName', 'visitorPhone', 'nationality', 'profession', 'passportNo', 'issueDate',
  'expiryDate', 'companyName', 'tel', 'fax', 'arrivalDate', 'comingFrom', 'travelRoute', 'visitPurpose', 'saudiEmbassy',
])

export const blankRequest = (today) => Object.freeze({
  ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, ''])),
  ...Object.fromEntries(DATE_FIELDS.map((key) => [key, ''])),
  ...Object.fromEntries(CHECK_FIELDS.map((key) => [key, false])),
  requestDate: today,
})

const fields = (data) => ({
  ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, text(data[key])])),
  ...Object.fromEntries(DATE_FIELDS.map((key) => [key, isoDate(data[key])])),
  ...Object.fromEntries(CHECK_FIELDS.map((key) => [key, data[key] === true])),
})

const readDocument = (item) => {
  if (!item || !ID.test(String(item.lineId ?? ''))) throw invalidResponse('document')
  return Object.freeze({ attachmentId: String(item.lineId), name: text(item.name), fileName: text(item.fileName) || text(item.name), attachedOn: isoDate(item.attachedOn) })
}

export function readRequest(data) {
  if (!data || !ID.test(String(data.id ?? ''))) throw invalidResponse('business visa request')
  return Object.freeze({
    requestId: String(data.id),
    requestNo: text(data.requestNo),
    status: normalizeStatus(data.status),
    requestedBy: text(data.requestedBy),
    notedBy: text(data.notedBy),
    approvedBy: text(data.approvedBy),
    divisionName: text(data.divisionName),
    createdAt: isoDate(data.createdAt),
    editable: data.editable === true,
    documents: Object.freeze((Array.isArray(data.documents) ? data.documents : []).map(readDocument)),
    ...fields(data),
  })
}

export function readRequestPage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('business visa request list')
  return Object.freeze({ items: Object.freeze(data.items.map(readRequest)), pagination: pageOf(data) })
}

export function readOptions(data) {
  if (!data || !Array.isArray(data.divisions) || !Array.isArray(data.departments)) throw invalidResponse('options')
  return Object.freeze({
    divisions: Object.freeze(data.divisions.map((item) => Object.freeze({ code: text(item?.code), name: text(item?.name) })).filter((item) => item.code)),
    departments: Object.freeze(data.departments.map(text).filter(Boolean)),
  })
}

// Request body: the answers only; the server sets the number, status and requester.
export function requestBody(form) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, form[key].trim()])),
    ...Object.fromEntries(DATE_FIELDS.map((key) => [key, form[key]])),
    ...Object.fromEntries(CHECK_FIELDS.map((key) => [key, form[key] === true])),
  }
}

export function validateRequest(form) {
  const errors = {}
  for (const key of REQUIRED) if (!String(form[key] ?? '').trim()) errors[key] = 'Required.'
  for (const key of TEXT_FIELDS) if (String(form[key] ?? '').trim().length > TEXT_MAX) errors[key] = `Keep it within ${TEXT_MAX} characters.`
  if (form.issueDate && form.expiryDate && form.expiryDate < form.issueDate) errors.expiryDate = 'Expiry must be on or after the issue date.'
  if (!form.visaSingle && !form.visaMultiple) errors.visaType = 'Choose the visa type.'
  if ((form.travelOther || form.hotelOther) && !form.otherDetails.trim()) errors.otherDetails = 'Specify the other expenses.'
  return errors
}

export const fileProblem = (file) => {
  const extension = String(file?.name ?? '').split('.').pop().toLowerCase()
  if (!FILE_EXTENSIONS.includes(extension)) return `${file.name}: this file type is not allowed.`
  if (file.size > FILE_MAX_MB * 1024 * 1024) return `${file.name} is larger than ${FILE_MAX_MB} MB.`
  return ''
}
// Legacy "Document name": the file name without its extension.
export const documentName = (fileName) => String(fileName).replace(/\.[^.]+$/, '').slice(0, TEXT_MAX)

export function createBusinessVisaService({ client }) {
  const getById = async (value, { signal } = {}) => readRequest((await client.get(`${BASE}/${segment(value)}`, { signal })).data)
  return Object.freeze({
    getById,
    async options({ signal } = {}) {
      return readOptions((await client.get(`${BASE}/lookups/options`, { signal })).data)
    },
    async list({ page = 1, pageSize = 25, q, status, division, dept, dateFrom, dateTo } = {}, { signal } = {}) {
      const { data } = await client.get(BASE, { params: params({ page, pageSize, q, status, division, dept, dateFrom, dateTo }), signal })
      return readRequestPage(data)
    },
    // Creates or updates the request; returns the stored request.
    async save(value, form) {
      if (value) {
        await client.put(`${BASE}/${segment(value)}`, requestBody(form))
        return getById(value)
      }
      const { data } = await client.post(BASE, requestBody(form))
      if (!ID.test(String(data?.id ?? ''))) throw invalidResponse('business visa request')
      return getById(String(data.id))
    },
    // Uploads one document (after the request is saved); returns the stored request.
    async addDocument(value, item) {
      const body = new FormData()
      body.append('name', documentName(item.fileName))
      body.append('file', item.file)
      await client.post(`${BASE}/${segment(value)}/documents`, body)
      return getById(value)
    },
    async removeDocument(value, lineId) {
      await client.delete(`${BASE}/${segment(value)}/documents/${segment(lineId)}`)
      return getById(value)
    },
  })
}

export const businessVisaService = createBusinessVisaService({ client: apiClient })
