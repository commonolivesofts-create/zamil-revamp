// Sick Leave service over /api/v1/hr/sick-leave (the shared apiClient, or the
// in-memory demo adapter when VITE_HR_SICK_LEAVE_DEMO is 'true' in a
// development build). A new request is one multipart POST with its files;
// files added later go to the attachments endpoint.
import { apiClient } from '../../../services/api/apiClient.js'
import { employeeServicesFormsConfig } from '../employeeServicesFormsConfig.js'
import { createSickLeaveDemoClient } from '../demo/sickLeaveDemoClient.js'
import { createEmployeeList, employeePage } from '../shared/employeeList.js'
import { ID, invalidResponse, params, segment } from '../shared/formRecords.js'
import { readSickLeaveEmployee, readSickLeavePage, readSickLeaveRecord, sickLeaveFields } from './sickLeaveContract.js'

export const SICK_LEAVE_BASE = '/hr/sick-leave'

const formData = (fields, files) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  for (const item of files) data.append('files', item.file, item.fileName)
  return data
}

export function createSickLeaveService({ client }) {
  const getById = async (id, { signal } = {}) => readSickLeaveRecord((await client.get(`${SICK_LEAVE_BASE}/${segment(id)}`, { signal })).data)
  const list = async ({ page = 1, pageSize = 25, status, from, to, empId, empName, mine } = {}, { signal } = {}) => {
    const { data } = await client.get(SICK_LEAVE_BASE, {
      params: params({ page, pageSize, status: status || 'ALL', from, to, empId, empName, mine: mine ? 'true' : undefined }),
      signal,
    })
    return readSickLeavePage(data)
  }
  const upload = (id, files) => client.post(`${SICK_LEAVE_BASE}/${segment(id)}/attachments`, formData({}, files))
  // Self and direct reports only (legacy rule, applied by the server); loaded with the form.
  const employees = createEmployeeList({
    load: ({ signal } = {}) => client.get(`${SICK_LEAVE_BASE}/lookups/employees`, { params: params({ pageSize: 100 }), signal }).then(({ data }) => data),
    shape: readSickLeaveEmployee,
  })
  return Object.freeze({
    preloadEmployees: (options) => employees.list(options),
    async searchEmployees(search = '', { signal } = {}) {
      const term = String(search).trim()
      // Opening the field lists the employees loaded with the form.
      if (!term) return employeePage(await employees.list({ signal }))
      const { data } = await client.get(`${SICK_LEAVE_BASE}/lookups/employees`, { params: params({ q: term, pageSize: 25 }), signal })
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      return employeePage(data.map(readSickLeaveEmployee))
    },
    async employeeDetails(employeeNumber, { signal } = {}) {
      return readSickLeaveEmployee((await client.get(`${SICK_LEAVE_BASE}/lookups/employees/${encodeURIComponent(employeeNumber)}`, { signal })).data)
    },
    list,
    // The employee's requests that overlap the period (within what the user may see).
    async overlapping(employeeNumber, fromDate, toDate, { signal } = {}) {
      if (!employeeNumber || !fromDate || !toDate) return Object.freeze([])
      const { items } = await list({ empId: employeeNumber, from: fromDate, to: toDate, pageSize: 100 }, { signal })
      return items.filter((item) => item.employeeNumber === employeeNumber)
    },
    getById,
    // `files`: the new files ({ fileName, sizeBytes, file }). Returns the reloaded record.
    async save(id, form, files) {
      if (!id) {
        const { data } = await client.post(SICK_LEAVE_BASE, formData(sickLeaveFields(form), files))
        if (!ID.test(String(data?.headerId ?? ''))) throw invalidResponse('sick leave request')
        return getById(String(data.headerId))
      }
      await client.put(`${SICK_LEAVE_BASE}/${segment(id)}`, sickLeaveFields(form))
      if (files.length) await upload(id, files)
      return getById(id)
    },
    async removeAttachment(id, attachmentId) {
      await client.delete(`${SICK_LEAVE_BASE}/${segment(id)}/attachments/${segment(attachmentId)}`)
      return getById(id)
    },
  })
}

export const sickLeaveDemo = employeeServicesFormsConfig.demo.sickLeave
export const sickLeaveService = createSickLeaveService({ client: sickLeaveDemo ? createSickLeaveDemoClient() : apiClient })
