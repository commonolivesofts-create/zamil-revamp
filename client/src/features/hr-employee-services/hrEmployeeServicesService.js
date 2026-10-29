// Services of the HR employee services screens. Screens talk only to these
// functions; every response passes a contract reader. The client is the
// shared apiClient, or the in-memory demo adapter while
// VITE_HR_EMPLOYEE_SERVICES_DEMO selects it (see hrEmployeeServicesConfig.js).
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { createEmployeeServicesDemoClient } from './demo/employeeServicesDemoClient.js'
import { hrEmployeeServicesConfig } from './hrEmployeeServicesConfig.js'
import {
  ID_PATTERN, readEmployeeServicesLookups, readPage, readRecordChange, readRecordChangeListItem, readServiceEmployee,
} from './hrEmployeeServicesContract.js'

export const EMPLOYEE_SERVICES_BASE = '/hr/employee-services'
// List views load one page of this size and search, filter and sort it in the browser.
export const LIST_LIMIT = 100

export function segment(value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ApiError('The selected record is invalid.', { code: 'INVALID_ID' })
  }
  return value
}

// A create (no id) is a POST; a change of an existing record is a PUT.
const write = (client, base, id, body) => (id ? client.put(`${base}/${segment(id)}`, body) : client.post(base, body))

// list, getById, save (create or change a draft) and submit of one record type.
function createRecordService({ client, base, readRecord, readListItem }) {
  return Object.freeze({
    list: async ({ signal } = {}) => readPage(await client.get(base, { params: { page: 1, limit: LIST_LIMIT }, signal }), readListItem),
    getById: async (id, { signal } = {}) => readRecord((await client.get(`${base}/${segment(id)}`, { signal })).data),
    save: async (id, body) => readRecord((await write(client, base, id, body)).data),
    submit: async (id) => readRecord((await client.post(`${base}/${segment(id)}/submit`, {})).data),
  })
}

export function createEmployeeServices({ client }) {
  return Object.freeze({
    client,
    lookups: Object.freeze({
      get: async ({ signal } = {}) => readEmployeeServicesLookups((await client.get(`${EMPLOYEE_SERVICES_BASE}/lookups`, { signal })).data),
    }),
    employees: Object.freeze({
      search: async (search, { signal, limit = 10 } = {}) => readPage(await client.get(`${EMPLOYEE_SERVICES_BASE}/employees`, {
        params: { search: String(search ?? '').trim(), page: 1, limit }, signal,
      }), readServiceEmployee),
    }),
    recordChanges: createRecordService({
      client, base: `${EMPLOYEE_SERVICES_BASE}/record-change-requests`, readRecord: readRecordChange, readListItem: readRecordChangeListItem,
    }),
  })
}

// The one switch between demo data and the real API.
export function selectEmployeeServicesClient({ demo, api = apiClient, createDemo = createEmployeeServicesDemoClient } = {}) {
  return demo ? createDemo() : api
}

export const hrEmployeeServices = createEmployeeServices({ client: selectEmployeeServicesClient({ demo: hrEmployeeServicesConfig.demo }) })
export const employeeServicesDemo = hrEmployeeServicesConfig.demo

// Demo only: the adapter records the signed-in user as requester or appraiser
// (a real backend takes them from the session). A no-op for apiClient.
export function identifyEmployeeServicesUser(user, client = hrEmployeeServices.client) {
  const name = typeof user?.fullName === 'string' ? user.fullName.trim() : ''
  client.identify?.(name ? { name, employeeNumber: String(user.employeeNumber ?? '') } : null)
}
