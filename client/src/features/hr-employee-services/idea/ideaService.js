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

// IdeaReport fans out page, overview and breakdown list queries together. Keep
// these reads below the LOW-pool limit so the analytics cards do not exhaust
// database connections needed by the report page or other active forms.
function createListReadLimit(limit = 4) {
  let active = 0
  const queue = []
  const drain = () => {
    while (active < limit && queue.length) {
      const entry = queue.shift()
      entry.signal?.removeEventListener('abort', entry.cancel)
      if (entry.signal?.aborted) {
        entry.reject(entry.signal.reason ?? new DOMException('Aborted', 'AbortError'))
        continue
      }
      active += 1
      entry.resolve(() => {
        active -= 1
        drain()
      })
    }
  }
  return (operation, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const entry = { signal, resolve, reject, cancel: null }
    entry.cancel = () => {
      const index = queue.indexOf(entry)
      if (index !== -1) queue.splice(index, 1)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', entry.cancel, { once: true })
    queue.push(entry)
    drain()
  }).then(async (release) => {
    try {
      return await operation()
    } finally {
      release()
    }
  })
}

export function createIdeaService({ client }) {
  const runListRead = createListReadLimit()
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
      const { data } = await runListRead(
        () => client.get(IDEA_BASE, { params: params({ page, pageSize, q, status, division, category, invCategory, from, to }), signal }),
        signal,
      )
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
