// Share an Idea service over /api/v1/ideas (the shared apiClient, or the
// in-memory demo adapter when VITE_HR_IDEAS_DEMO is 'true' in a development
// build).
import { apiClient } from '../../../services/api/apiClient.js'
import { employeeServicesFormsConfig } from '../employeeServicesFormsConfig.js'
import { createIdeaDemoClient } from '../demo/ideaDemoClient.js'
import { createEmployeeList, employeePage } from '../shared/employeeList.js'
import { invalidResponse, params, segment } from '../shared/formRecords.js'
import { ideaBody, readIdeaEmployee, readIdeaEmployeeDetails, readIdeaLookups, readIdeaPage, readIdeaRecord } from './ideaContract.js'

export const IDEA_BASE = '/ideas'

export function createIdeaService({ client }) {
  const getById = async (id, { signal } = {}) => readIdeaRecord((await client.get(`${IDEA_BASE}/${segment(id)}`, { signal })).data)
  // The picker's list, loaded with the form.
  const employees = createEmployeeList({
    load: ({ signal } = {}) => client.get(`${IDEA_BASE}/lookups/employees`, { signal }).then(({ data }) => data),
    shape: readIdeaEmployee,
  })
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const [divisions, categories] = await Promise.all([
        client.get(`${IDEA_BASE}/lookups/divisions`, { signal }),
        client.get(`${IDEA_BASE}/lookups/categories`, { signal }),
      ])
      return readIdeaLookups(divisions.data, categories.data)
    },
    preloadEmployees: (options) => employees.list(options),
    async searchEmployees(search = '', { signal } = {}) {
      const term = String(search).trim()
      // Opening the field lists the employees loaded with the form.
      if (!term) return employeePage(await employees.list({ signal }))
      const { data } = await client.get(`${IDEA_BASE}/lookups/employees`, { params: params({ q: term }), signal })
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      return employeePage(data.slice(0, 25).map(readIdeaEmployee))
    },
    async employeeDetails(employeeNumber, { signal } = {}) {
      return readIdeaEmployeeDetails((await client.get(`${IDEA_BASE}/lookups/employees/${encodeURIComponent(employeeNumber)}`, { signal })).data)
    },
    // The ideas API has no sort parameter: rows come newest first.
    async list({ page = 1, pageSize = 25, q, status, division, category, invCategory, from, to } = {}, { signal } = {}) {
      const { data } = await client.get(IDEA_BASE, { params: params({ page, pageSize, q, status, division, category, invCategory, from, to }), signal })
      return readIdeaPage(data)
    },
    getById,
    async save(id, form) {
      const body = ideaBody(form)
      const { data } = id ? await client.put(`${IDEA_BASE}/${segment(id)}`, body) : await client.post(IDEA_BASE, body)
      const saved = readIdeaRecord(data)
      // PUT does not return the attachments; reload the full record.
      return id ? getById(saved.ideaId) : saved
    },
  })
}

export const ideaDemo = employeeServicesFormsConfig.demo.idea
export const ideaService = createIdeaService({ client: ideaDemo ? createIdeaDemoClient() : apiClient })
