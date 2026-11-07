// Employee Clearance service over /api/v1/hr/employee-clearance (the shared
// apiClient). The backend exists, so there is no demo adapter. The server
// scopes every lookup and record to the signed-in user (self and direct
// reports; VIEW_ALL widens it).
import { apiClient } from '../../../services/api/apiClient.js'
import { createEmployeeList, employeePage } from '../shared/employeeList.js'
import { ID, invalidResponse, params, segment } from '../shared/formRecords.js'
import {
  clearanceBody, readApprovers, readClearanceEmployee, readClearancePage, readClearanceRecord, readDestinations,
} from './clearanceContract.js'
import { SECTIONS } from './clearanceModel.js'

export const CLEARANCE_BASE = '/hr/employee-clearance'

export function createClearanceService({ client }) {
  const getById = async (id, { signal } = {}) => readClearanceRecord((await client.get(`${CLEARANCE_BASE}/${segment(id)}`, { signal })).data)
  // The pickers' lists, loaded with the form (the server keeps each user's scope).
  const employeeList = (scope) => createEmployeeList({
    load: ({ signal } = {}) => client.get(`${CLEARANCE_BASE}/lookups/employees`, { params: params({ scope, pageSize: 100 }), signal })
      .then(({ data }) => {
        if (!data || !Array.isArray(data.items)) throw invalidResponse('employee list')
        return data.items
      }),
    shape: readClearanceEmployee,
  })
  const scopedEmployees = employeeList('scoped')
  const allEmployees = employeeList('all')
  const searchPage = async (scope, search, signal) => {
    const q = String(search).trim()
    // Opening the field lists the employees loaded with the form.
    if (!q) return employeePage(await (scope === 'all' ? allEmployees : scopedEmployees).list({ signal }))
    const { data } = await client.get(`${CLEARANCE_BASE}/lookups/employees`, { params: params({ scope, q, pageSize: 25 }), signal })
    if (!data || !Array.isArray(data.items)) throw invalidResponse('employee list')
    return employeePage(data.items.map(readClearanceEmployee))
  }
  return Object.freeze({
    // Department managers, the four section approvers and the computer receivers, loaded once per form.
    async getLookups({ signal } = {}) {
      const lookups = [...new Set(SECTIONS.map((section) => section.lookup))]
      const [destinations, ...lists] = await Promise.all([
        client.get(`${CLEARANCE_BASE}/lookups/computer-destinations`, { signal }),
        ...lookups.map((section) => client.get(`${CLEARANCE_BASE}/lookups/approvers`, { params: { section }, signal })),
      ])
      return Object.freeze({
        destinations: readDestinations(destinations.data),
        approvers: Object.freeze(Object.fromEntries(lookups.map((section, index) => [section, readApprovers(lists[index].data)]))),
      })
    },
    preloadEmployees: (options) => scopedEmployees.list(options),
    // The employees the user may raise a clearance for (legacy getEmpNum: self and direct reports).
    searchEmployees: (search = '', { signal } = {}) => searchPage('scoped', search, signal),
    // Names for the IT "access to" suggestions (legacy Empname(): every employee; the server
    // keeps it to the user's scope without VIEW_ALL).
    searchAllEmployees: (search = '', { signal } = {}) => searchPage('all', search, signal),
    async employeeDetails(employeeNumber, { signal } = {}) {
      return readClearanceEmployee((await client.get(`${CLEARANCE_BASE}/lookups/employees/${encodeURIComponent(employeeNumber)}`, { signal })).data)
    },
    async list({ page = 1, pageSize = 25, status, q, empNo, department, purpose, createdFrom, createdTo } = {}, { signal } = {}) {
      const { data } = await client.get(CLEARANCE_BASE, {
        params: params({ page, pageSize, status: status || 'ALL', q, empNo, department, purpose, createdFrom, createdTo }),
        signal,
      })
      return readClearancePage(data)
    },
    getById,
    // Creates or updates, then returns the reloaded record.
    async save(id, form) {
      if (!id) {
        const { data } = await client.post(CLEARANCE_BASE, clearanceBody(form))
        if (!ID.test(String(data?.headerId ?? ''))) throw invalidResponse('employee clearance request')
        return getById(String(data.headerId))
      }
      await client.put(`${CLEARANCE_BASE}/${segment(id)}`, clearanceBody(form))
      return getById(id)
    },
  })
}

export const clearanceService = createClearanceService({ client: apiClient })
