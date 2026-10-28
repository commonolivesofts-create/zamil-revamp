// HR recruitment services. Each service takes a `client` with the shared API
// client's interface (get/post/put → { data, pagination }), so the screens
// never know whether the shared apiClient or the in-memory demo adapter
// answers. Unsafe requests are never retried automatically.
//
// TODO(backend): none of these endpoints exist yet. They are the proposed
// contract documented in the feature README; the backend must implement them
// (with OpenAPI) before VITE_HR_RECRUITMENT_DEMO can be switched off.
// Relative imports keep this module loadable by the Node-native tests.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { hrRecruitmentConfig } from './hrRecruitmentConfig.js'
import { createDemoClient } from './demo/demoClient.js'
import {
  ID_PATTERN, readEmployee, readInterview, readInterviewListItem, readLookups, readOffer, readOfferListItem, readOrientation,
  readOrientationListItem, readPage, readProbation, readProbationListItem, readReport, readRequisition, readRequisitionListItem,
} from './hrRecruitmentContract.js'

export const HR_BASE = '/hr/recruitment'
export const HR_REPORTS_BASE = '/hr/reports'
export const REPORT_PAGE_SIZE = 10

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
  const base = `${HR_BASE}/requisitions`
  const record = createRecordService({ client, base, readRecord: readRequisition, readListItem: readRequisitionListItem, actionName: 'submit' })
  return Object.freeze({
    list: record.list,
    getById: record.getById,
    // The submitted requisition with this number, or null (interview link).
    async findSubmitted(requisitionNumber, { signal } = {}) {
      const number = String(requisitionNumber ?? '').trim()
      if (!number) return null
      const result = readPage(await client.get(base, { params: { number, status: 'SUBMITTED', page: 1, limit: 1 }, signal }), readRequisitionListItem)
      return result.items[0] ?? null
    },
    // Saves without completeness checks; the record stays a DRAFT.
    saveDraft: record.save,
    // Submits a saved draft; the server checks completeness, assigns the
    // requisition number and locks the record.
    submit: record.act,
  })
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

// Employee search for the pickers: a page of matching employees.
export function createEmployeeService({ client }) {
  return Object.freeze({
    async search(search, { limit = 10, signal } = {}) {
      return readPage(await client.get(`${HR_BASE}/employees`, { params: query({ search: String(search ?? '').trim(), page: 1, limit }), signal }), readEmployee)
    },
  })
}

export function createOrientationService({ client }) {
  const record = createRecordService({
    client, base: `${HR_BASE}/orientation-schedules`, readRecord: readOrientation, readListItem: readOrientationListItem, actionName: 'submit',
  })
  return Object.freeze({
    list: record.list,
    getById: record.getById,
    // Saving schedules the orientation: the server checks it, assigns the
    // Ref # and Scheduled by, and locks it (a saved schedule is read-only).
    save: (body) => record.save(null, body),
  })
}

export function createProbationService({ client }) {
  const record = createRecordService({
    client, base: `${HR_BASE}/probation-evaluations`, readRecord: readProbation, readListItem: readProbationListItem, actionName: 'submit',
  })
  return Object.freeze({
    list: record.list,
    getById: record.getById,
    // Save needs the setup and every criterion scored; the server assigns the
    // evaluation number and "prepared by". The record stays a DRAFT.
    save: record.save,
    // Submitting needs the recommendation and the evaluator signature, and locks the evaluation.
    submit: record.act,
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

export function createHrRecruitmentServices({ client }) {
  return Object.freeze({
    client,
    lookups: createLookupService({ client }),
    requisitions: createRequisitionService({ client }),
    interviews: createInterviewService({ client }),
    offers: createOfferService({ client }),
    employees: createEmployeeService({ client }),
    orientations: createOrientationService({ client }),
    probations: createProbationService({ client }),
    reports: createReportService({ client }),
  })
}

// The demo adapter cannot see the session, so the signed-in user's name is
// passed to it for the server-assigned "requester", "scheduled by" and
// "prepared by" values. The real API takes them from the session; this is a
// no-op for any client without `identify`.
export function identifyDemoUser(name, client = hrRecruitmentServices.client) {
  client.identify?.(typeof name === 'string' && name.trim() ? name.trim() : null)
}

export const hrRecruitmentServices = createHrRecruitmentServices({ client: selectClient({ demo: hrRecruitmentConfig.demo }) })
export const hrRecruitmentDemo = hrRecruitmentConfig.demo
// Attachments need a multipart upload endpoint (and multipart support in the
// shared client, gate G3). Until then only the demo keeps file metadata.
export const attachmentsSupported = hrRecruitmentConfig.demo
