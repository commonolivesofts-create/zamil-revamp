// Project Charter service over /api/v1/projects/charters (the shared
// apiClient; the backend exists, so there is no demo adapter).
import { apiClient } from '../../../services/api/apiClient.js'
import { ID, invalidResponse, params, segment } from '../shared/formRecords.js'
import { charterBody, readCharterPage, readCharterRecord, readEmployeeOption, readIdeaOption } from './charterContract.js'

export const CHARTER_BASE = '/projects/charters'

export function createCharterService({ client }) {
  const getById = async (id, { signal } = {}) => readCharterRecord((await client.get(`${CHARTER_BASE}/${segment(id)}`, { signal })).data)
  return Object.freeze({
    // Approved ideas (legacy "Select Idea No").
    async getLookups({ signal } = {}) {
      const { data } = await client.get(`${CHARTER_BASE}/lookups/ideas`, { signal })
      if (!Array.isArray(data)) throw invalidResponse('idea list')
      return Object.freeze({ ideas: Object.freeze(data.map(readIdeaOption)) })
    },
    // Legacy proj_name: project name and business unit of the chosen idea.
    async idea(ideaId, { signal } = {}) {
      return readIdeaOption((await client.get(`${CHARTER_BASE}/lookups/ideas/${segment(ideaId)}`, { signal })).data)
    },
    // Names for the project manager suggestions (legacy datalist of all employees).
    async searchEmployees(search = '', { signal } = {}) {
      const { data } = await client.get(`${CHARTER_BASE}/lookups/employees`, { params: params({ q: String(search).trim(), pageSize: 20 }), signal })
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      return Object.freeze(data.map(readEmployeeOption))
    },
    async list({ page = 1, pageSize = 25, q, ideaNo, projectManager, processOwner, createdFrom, createdTo } = {}, { signal } = {}) {
      const { data } = await client.get(CHARTER_BASE, {
        params: params({ page, pageSize, q, ideaNo, projectManager, processOwner, createdFrom, createdTo }),
        signal,
      })
      return readCharterPage(data)
    },
    getById,
    // Creates or updates; returns the stored charter.
    async save(id, form) {
      if (!id) {
        const { data } = await client.post(CHARTER_BASE, charterBody(form, { isNew: true }))
        if (!ID.test(String(data?.headerId ?? ''))) throw invalidResponse('project charter')
        return readCharterRecord(data)
      }
      return readCharterRecord((await client.put(`${CHARTER_BASE}/${segment(id)}`, charterBody(form, { isNew: false }))).data)
    },
  })
}

export const charterService = createCharterService({ client: apiClient })
