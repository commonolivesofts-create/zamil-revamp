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
const SAVE_TIMEOUT_MS = 60_000

function savedRecord(form, response, existingRecord) {
  if (!ID.test(String(response?.headerId ?? ''))) throw invalidResponse('employee clearance request')
  const body = clearanceBody(form)
  const employee = form.employee
  return readClearanceRecord({
    headerId: String(response.headerId),
    referenceNo: response.referenceNo ?? existingRecord?.referenceNo,
    status: response.status ?? existingRecord?.status ?? 'Draft',
    empNo: body.employee.empNo,
    empName: employee.name,
    jobTitle: employee.jobTitle ?? employee.position,
    department: employee.departmentName ?? employee.section,
    division: employee.division,
    contact: body.contact,
    purpose: body.purpose,
    vacationFrom: body.vacationFrom,
    vacationTo: body.vacationTo,
    departmentManager: body.departmentManager,
    itManager: body.itManager,
    computerReceivedBy: body.computerReceivedBy,
    computerSignature: body.computerSignature,
    itMatrix: body.itMatrix,
    sections: body.sections,
  })
}

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
    // Clearance writes multiple related rows; allow more time than the generic
    // API timeout, but never make confirmation depend on a follow-up GET.
    async save(id, form, existingRecord = null) {
      const body = clearanceBody(form)
      if (!id) {
        const { data } = await client.post(CLEARANCE_BASE, body, { timeout: SAVE_TIMEOUT_MS })
        return savedRecord(form, data, null)
      }
      const { data } = await client.put(`${CLEARANCE_BASE}/${segment(id)}`, body, { timeout: SAVE_TIMEOUT_MS })
      return savedRecord(form, { headerId: id, ...data }, existingRecord)
    },
  })
}

export const clearanceService = createClearanceService({ client: apiClient })
