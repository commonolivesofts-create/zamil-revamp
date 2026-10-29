// Services of the HR employee services screens. Personal Status Change uses
// its real backend routes; transfer and appraisal use the shared API client or
// the in-memory demo adapter selected by VITE_HR_EMPLOYEE_SERVICES_DEMO.
import { ApiError, apiClient } from '../../services/api/apiClient.js'
import { createEmployeeServicesDemoClient } from './demo/employeeServicesDemoClient.js'
import { hrEmployeeServicesConfig } from './hrEmployeeServicesConfig.js'
import {
  ID_PATTERN, readEmployeeServicesLookups, readPage, readRecordChange, readRecordChangeListItem, readServiceEmployee, readTransfer, readTransferListItem,
  readAppraisal, readAppraisalListItem, readAppraisalTeam, readPerformanceLookups,
} from './hrEmployeeServicesContract.js'

export const EMPLOYEE_SERVICES_BASE = '/hr/employee-services'
export const PERFORMANCE_BASE = '/hr/performance'
export const PERSONNEL_RECORD_CHANGES_BASE = '/hr/personnel-record-changes'
export const TRANSFER_REQUESTS_BASE = '/hr/transfer-requests'
export const PERFORMANCE_APPRAISALS_BASE = '/hr/performance-appraisals'
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

const POSITION_CODE_PREFIX = 'POS_'
const positionCode = (name) => {
  let hash = 2166136261
  for (const char of String(name ?? '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `${POSITION_CODE_PREFIX}${(hash >>> 0).toString(36).toUpperCase()}`
}
const textValue = (value) => value == null ? '' : String(value)
const amountValue = (value) => {
  if (value == null) return ''
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new ApiError('The server returned an invalid employee amount.', { code: 'INVALID_RESPONSE' })
  return amount
}
const familyCode = (value) => value === 'S' || value === 'M' ? value : ''
const toFrontRecordValues = (source = {}) => ({
  positionCode: source.position ? positionCode(source.position) : '',
  positionName: textValue(source.position),
  basic: amountValue(source.basicSal), house: amountValue(source.houseAll), transport: amountValue(source.transAll),
  other: amountValue(source.otherAll), communication: amountValue(source.communAll), car: amountValue(source.carAll),
  gradeCode: '', levelCode: '', familyStatusCode: familyCode(source.maritalStatus),
})
const fromApiStatus = (value) => String(value ?? '').toUpperCase()

function personalStatusEmployee(source) {
  if (!source || typeof source !== 'object' || !/^\d{1,19}$/.test(String(source.empNo ?? '')) || !source.old) {
    throw new ApiError('The server returned an unexpected personal status employee.', { code: 'INVALID_RESPONSE' })
  }
  const number = String(source.empNo)
  return Object.freeze({
    employeeId: number, employeeNumber: number, name: textValue(source.empName) || number, nationality: textValue(source.nationality),
    departmentCode: '', departmentName: textValue(source.department), sectionCode: '', sectionName: textValue(source.section),
    startDate: textValue(source.startDate), jobTitleCode: '', bloodType: null,
    current: Object.freeze(toFrontRecordValues(source.old)),
  })
}

function personalStatusRecord(source) {
  if (!source || typeof source !== 'object' || !/^\d{1,19}$/.test(String(source.headerId ?? '')) ||
    !/^\d{1,19}$/.test(String(source.empNo ?? ''))) {
    throw new ApiError('The server returned an unexpected personal status record.', { code: 'INVALID_RESPONSE' })
  }
  const employee = personalStatusEmployee({
    empNo: source.empNo, empName: source.empName, nationality: source.nationality, department: source.department,
    section: source.section, startDate: source.startDate, old: source.old,
  })
  const signature = source.signatures ?? {}
  const approvals = [
    { role: 'NOTED_BY', state: signature.hrAdminSign ? 'APPROVED' : 'DRAFT' },
    { role: 'APPROVED_BY', state: signature.presidentSign ? 'APPROVED' : 'DRAFT' },
  ]
  const updatedAt = source.updatedAt ?? source.createdAt ?? `${source.formDate}T00:00:00.000Z`
  return Object.freeze({
    requestId: String(source.headerId), requestNumber: textValue(source.refNo), status: fromApiStatus(source.status),
    requestDate: textValue(source.formDate), requestedBy: Object.freeze({ name: '', employeeNumber: '' }), employee,
    effectiveDate: textValue(source.effectiveDate) || null, revised: Object.freeze(toFrontRecordValues(source.new)),
    remarks: textValue(source.remarks), views: textValue(source.views), attachments: Object.freeze([]),
    approvals: Object.freeze(approvals.map((item) => Object.freeze(item))), updatedAt,
  })
}

function personalStatusListItem(source) {
  if (!source || typeof source !== 'object' || !/^\d{1,19}$/.test(String(source.headerId ?? '')) ||
    !/^\d{1,19}$/.test(String(source.empNo ?? ''))) {
    throw new ApiError('The server returned an unexpected personal status report row.', { code: 'INVALID_RESPONSE' })
  }
  const oldTotal = source.oldTotal == null ? null : Number(source.oldTotal)
  const newTotal = source.newTotal == null ? null : Number(source.newTotal)
  if ((oldTotal !== null && !Number.isFinite(oldTotal)) || (newTotal !== null && !Number.isFinite(newTotal))) {
    throw new ApiError('The server returned an unexpected personal status report row.', { code: 'INVALID_RESPONSE' })
  }
  return Object.freeze({
    requestId: String(source.headerId), requestNumber: textValue(source.refNo), status: fromApiStatus(source.status),
    employeeName: textValue(source.empName), employeeNumber: String(source.empNo), effectiveDate: source.effectiveDate ?? null,
    changeTypes: Object.freeze([]), position: textValue(source.position),
    totalChange: oldTotal === null || newTotal === null ? null : Math.round((newTotal - oldTotal) * 100) / 100,
    requestDate: textValue(source.formDate),
  })
}

const transferCode = (prefix, value) => {
  let hash = 2166136261
  for (const char of String(value ?? '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `${prefix}_${(hash >>> 0).toString(36).toUpperCase()}`
}
const transferStatus = (value) => ({ DRAFT: 'DRAFT', INPROCESS: 'INPROCESS', APPROVED: 'APPROVED', REJECTED: 'REJECTED' })[
  String(value ?? '').replace(/\s+/g, '').toUpperCase()
] ?? 'DRAFT'
const approvalStatus = (value) => ({ APPROVED: 'APPROVED', INPROCESS: 'PENDING', REJECTED: 'PENDING' })[
  String(value ?? '').replace(/\s+/g, '').toUpperCase()
] ?? 'DRAFT'

function createTransferRequestService({ client }) {
  let lookups = null
  let employeeNames = null
  let requestor = null
  const codeFor = (prefix, name) => transferCode(prefix, name)
  const findName = (items, code) => items.find((item) => item.code === code)?.name ?? ''
  const employeeFromApi = (data, name = data.empName) => {
    const sectionName = textValue(data.section ?? data.deptName)
    const departmentName = textValue(data.department ?? data.deptName?.replace(/\s*Section\s*$/i, ''))
    const jobTitle = textValue(data.jobTitle)
    const normalizeOrg = (value) => String(value ?? '').toLowerCase().replace(/\b(department|section)\b/g, '').replace(/[^a-z0-9]/g, '')
    const normalizedDepartment = normalizeOrg(departmentName)
    const department = lookups.departments.find((item) => item.name === departmentName) ??
      lookups.departments.find((item) => normalizeOrg(item.name) === normalizedDepartment) ??
      lookups.departments.find((item) => normalizedDepartment && normalizeOrg(item.name).includes(normalizedDepartment))
    return Object.freeze({
      employeeId: textValue(data.personId ?? data.empNo), employeeNumber: textValue(data.empNo), name: textValue(name) || textValue(data.empNo),
      nationality: '', departmentCode: department?.code ?? codeFor('DEPT', departmentName), departmentName: department?.name ?? departmentName,
      sectionCode: codeFor('SECTION', sectionName), sectionName, startDate: textValue(data.dateOfJoining),
      jobTitleCode: jobTitle ? codeFor('JOB', jobTitle) : '', bloodType: null,
      current: Object.freeze({ positionCode: jobTitle ? codeFor('JOB', jobTitle) : '', basic: 0, house: 0, transport: 0, other: 0,
        communication: 0, car: 0, gradeCode: '', levelCode: '', familyStatusCode: '' }),
    })
  }
  const apiEmployee = async (name, { signal } = {}) => {
    const { data } = await client.get(`${TRANSFER_REQUESTS_BASE}/lookups/employees/${encodeURIComponent(name)}`, { signal })
    return employeeFromApi({ ...data, empName: name }, name)
  }
  const ensureLookups = async (signal) => {
    if (lookups) return lookups
    const [jobs, sections, departments, directors, bloodTypes, requestors] = await Promise.all([
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/jobs`, { signal }),
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/sections`, { signal }),
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/departments`, { signal }),
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/directors`, { signal }),
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/blood-types`, { signal }),
      client.get(`${TRANSFER_REQUESTS_BASE}/lookups/requestor`, { signal }),
    ])
    const sectionOptions = (sections.data ?? []).map((item) => Object.freeze({ code: codeFor('SECTION', item.name), name: item.name }))
    const departmentOptions = (departments.data ?? []).map((name) => Object.freeze({
      code: codeFor('DEPT', name), name,
      // The API exposes a global section list with no department association.
      sections: Object.freeze(sectionOptions),
    }))
    lookups = Object.freeze({
      positions: Object.freeze([]), grades: Object.freeze([]), levels: Object.freeze([]), familyStatuses: Object.freeze([]),
      departments: Object.freeze(departmentOptions),
      jobTitles: Object.freeze((jobs.data ?? []).map((item) => Object.freeze({ code: codeFor('JOB', item.name), name: item.name }))),
      directors: Object.freeze((directors.data ?? []).map((item) => Object.freeze({ directorId: String(item.empNo), name: item.name, area: '' }))),
      bloodTypes: Object.freeze((bloodTypes.data ?? []).map((item) => Object.freeze({ code: String(item.code), name: String(item.code) }))),
      companies: Object.freeze(['Zamil Plastic Non-Food', 'Zamil Plastic Food'].map((name) => Object.freeze({ code: codeFor('PLANT', name), name }))),
      transferDocument: Object.freeze({ title: 'Transfer Request Form', controlNumber: 'ZPI.TCN.FM.01', version: '', issueDate: '', pages: '' }),
    })
    requestor = (requestors.data ?? [])[0] ?? null
    return lookups
  }
  const getLookups = async ({ signal } = {}) => ensureLookups(signal)
  const searchEmployees = async (search = '', { signal, limit = 10 } = {}) => {
    const term = String(search).trim().toLocaleLowerCase()
    if (!term) return Object.freeze({ items: Object.freeze([]), pagination: Object.freeze({ page: 1, limit, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }) })
    if (!employeeNames) {
      const { data } = await client.get(`${TRANSFER_REQUESTS_BASE}/lookups/employees`, { signal })
      employeeNames = (data ?? []).map((item) => item.name).filter((name) => typeof name === 'string')
    }
    const names = employeeNames.filter((name) => name.toLocaleLowerCase().includes(term)).slice(0, limit)
    const settled = await Promise.allSettled(names.map((name) => apiEmployee(name, { signal })))
    const failed = settled.find((item) => item.status === 'rejected' && item.reason?.status !== 404)
    if (failed) throw failed.reason
    const items = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value)
    return Object.freeze({ items: Object.freeze(items), pagination: Object.freeze({ page: 1, limit, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }) })
  }
  const makeRecord = async (data, { signal } = {}) => {
    await ensureLookups(signal)
    const current = data.current ?? {}
    const transfer = data.transfer ?? {}
    const employee = employeeFromApi({ ...current, empName: current.empName })
    const byStatus = (value) => approvalStatus(value)
    const approvals = [
      ['NEW_DEPARTMENT_HEAD', data.approvals?.transferDeptHead], ['OLD_DEPARTMENT_HEAD', data.approvals?.adminSignature],
      ['NEW_DIRECTOR', data.approvals?.president], ['HR_ADMIN_MANAGER', data.approvals?.hrManager], ['GENERAL_MANAGER', data.approvals?.generalManager],
    ].map(([role, value]) => Object.freeze({ role, state: byStatus(value) }))
    const office = [
      ['HR_SUPERVISOR', data.itHr?.hrSignature, data.itHr?.hrDate], ['IT', data.itHr?.itSignature, data.itHr?.itDate],
      ['ADMIN_MANAGER', data.itHr?.adminSignature, data.itHr?.adminDate],
    ].map(([role, signature, date]) => Object.freeze({ role, state: signature ? 'APPROVED' : 'WAITING', date: date || null }))
    const date = textValue(data.mgrDate)
    return Object.freeze({
      transferId: String(data.headerId), transferNumber: String(data.headerId), status: transferStatus(data.status), requestDate: date,
      requestedBy: Object.freeze({ name: textValue(data.requestedBy) || textValue(requestor?.fullName), employeeNumber: textValue(requestor?.empNo) }),
      companyCode: codeFor('PLANT', data.plant), employee,
      to: Object.freeze({ jobTitleCode: transfer.jobTitle ? codeFor('JOB', transfer.jobTitle) : null,
        departmentCode: transfer.dept ? codeFor('DEPT', transfer.dept) : null,
        sectionCode: transfer.section ? codeFor('SECTION', transfer.section) : null }),
      effectiveDate: transfer.effectiveDate || null, bloodType: transfer.bloodType || null,
      directorId: transfer.superiorNo == null ? null : String(transfer.superiorNo),
      salaryChange: transfer.changeSalary?.toUpperCase() ?? null, budgetedSalary: transfer.budgetedSalary?.toUpperCase() ?? null,
      approvals: Object.freeze(approvals), office: Object.freeze(office),
    })
  }
  const bodyForApi = (body, employee) => {
    const selectedDirector = lookups.directors.find((item) => item.directorId === body.directorId)
    return {
      plant: findName(lookups.companies, body.companyCode),
      current: { empNo: employee.employeeNumber, empName: employee.name, dateOfJoining: employee.startDate,
        jobTitle: findName(lookups.jobTitles, employee.jobTitleCode), dept: employee.departmentName, section: employee.sectionName },
      transfer: { jobTitle: findName(lookups.jobTitles, body.to.jobTitleCode), dept: findName(lookups.departments, body.to.departmentCode),
        section: findName(lookups.departments.find((item) => item.code === body.to.departmentCode)?.sections ?? [], body.to.sectionCode), effectiveDate: body.effectiveDate,
        bloodType: body.bloodType, superiorNo: selectedDirector?.directorId,
        changeSalary: body.salaryChange === 'YES' ? 'Yes' : body.salaryChange === 'NO' ? 'No' : '',
        budgetedSalary: body.budgetedSalary === 'YES' ? 'Yes' : body.budgetedSalary === 'NO' ? 'No' : '' },
    }
  }
  return Object.freeze({
    getLookups,
    searchEmployees,
    async list({ signal } = {}) {
      await ensureLookups(signal)
      const rows = []
      let page = 1
      let total = Infinity
      while (rows.length < total) {
        const { data } = await client.get(TRANSFER_REQUESTS_BASE, { params: { page, pageSize: 100, sort: 'headerId', order: 'desc' }, signal })
        if (!data || !Array.isArray(data.rows) || !Number.isInteger(data.meta?.total) || !Number.isInteger(data.meta?.pageSize)) {
          throw new ApiError('The server returned an unexpected transfer report.', { code: 'INVALID_RESPONSE' })
        }
        rows.push(...data.rows)
        total = data.meta.total
        if (!data.rows.length) break
        page += 1
      }
      const items = rows.map((item) => ({ transferId: String(item.headerId), transferNumber: String(item.headerId), status: transferStatus(item.status),
        employeeName: textValue(item.empName), employeeNumber: String(item.empNo ?? ''), fromDepartmentName: textValue(item.currentDept),
        toDepartmentName: item.transferDept ?? null, toSectionName: null, effectiveDate: item.effectiveDate ?? null,
        salaryChange: null, budgetedSalary: null, requestDate: item.mgrDate }))
      return Object.freeze({ items: Object.freeze(items), pagination: Object.freeze({ page: 1, limit: items.length, total, totalPages: Math.ceil(total / 100), hasNextPage: false, hasPreviousPage: false }) })
    },
    async getById(id, { signal } = {}) {
      const { data } = await client.get(`${TRANSFER_REQUESTS_BASE}/${segment(id)}`, { signal })
      return makeRecord(data, { signal })
    },
    async save(id, body, employee = body.employee) {
      await ensureLookups()
      const payload = bodyForApi(body, employee)
      const result = id
        ? await client.put(`${TRANSFER_REQUESTS_BASE}/${segment(id)}`, payload)
        : await client.post(TRANSFER_REQUESTS_BASE, payload)
      const recordId = result.data.headerId ?? id
      const { data } = await client.get(`${TRANSFER_REQUESTS_BASE}/${segment(recordId)}`)
      return makeRecord(data)
    },
    async delete(id) { await client.delete(`${TRANSFER_REQUESTS_BASE}/${segment(id)}`) },
  })
}

// The personal-status API has its own routes and DTOs. Translate those into
// the existing form model so the current UI can stay unchanged.
function createPersonalStatusRecordService({ client }) {
  let positions = Object.freeze([])
  let employeeNumbers = null
  const positionName = (code) => positions.find((item) => item.code === code)?.name ?? ''
  const valuesForApi = (values = {}) => {
    const result = {}
    const position = positionName(values.positionCode)
    if (position) result.position = position
    const fields = { basic: 'basicSal', house: 'houseAll', transport: 'transAll', other: 'otherAll', communication: 'communAll', car: 'carAll' }
    for (const [key, field] of Object.entries(fields)) {
      if (values[key] !== '' && values[key] != null) result[field] = Number(values[key])
    }
    const amounts = Object.keys(fields).map((key) => values[key] === '' || values[key] == null ? null : Number(values[key]))
    if (amounts.every((value) => value !== null && Number.isFinite(value))) result.total = Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100
    if (values.familyStatusCode) result.maritalStatus = values.familyStatusCode
    return result
  }
  const payloadForApi = (body, employee) => ({
    empNo: employee?.employeeNumber ?? body.employeeId,
    formDate: body.requestDate,
    ...(body.arbDate ? { arbDate: body.arbDate } : {}),
    effectiveDate: body.effectiveDate,
    empName: employee?.name ?? '', nationality: employee?.nationality ?? '',
    section: employee?.sectionName ?? '', department: employee?.departmentName ?? '', startDate: employee?.startDate ?? '',
    old: valuesForApi(employee?.current), new: valuesForApi(body.revised), remarks: body.remarks ?? '', views: body.views ?? '',
  })
  const record = (response) => personalStatusRecord(response)
  return Object.freeze({
    async getLookups({ signal } = {}) {
      const { data } = await client.get(`${PERSONNEL_RECORD_CHANGES_BASE}/lookups/positions`, { signal })
      if (!Array.isArray(data)) {
        throw new ApiError('The server returned unexpected personal status form options.', { code: 'INVALID_RESPONSE' })
      }
      positions = Object.freeze(data.filter((item) => typeof item?.name === 'string' && item.name.trim())
        .map((item) => Object.freeze({ code: positionCode(item.name), name: item.name })))
      return Object.freeze({ positions, grades: Object.freeze([]), levels: Object.freeze([]),
        familyStatuses: Object.freeze([{ code: 'S', name: 'Single' }, { code: 'M', name: 'Married' }]),
        departments: Object.freeze([]), jobTitles: Object.freeze([]), directors: Object.freeze([]), bloodTypes: Object.freeze([]), companies: Object.freeze([]),
        transferDocument: null })
    },
    async searchEmployees(search = '', { signal, limit = 10 } = {}) {
      const term = String(search).trim()
      if (!term || !/^\d+$/.test(term)) return Object.freeze({ items: Object.freeze([]), pagination: Object.freeze({ page: 1, limit, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }) })
      if (!employeeNumbers) {
        const result = await client.get(`${PERSONNEL_RECORD_CHANGES_BASE}/lookups/employees`, { signal })
        if (!Array.isArray(result.data)) {
          throw new ApiError('The server returned unexpected employee options.', { code: 'INVALID_RESPONSE' })
        }
        employeeNumbers = Object.freeze(result.data.map((item) => String(item?.empNo ?? '')).filter((number) => /^\d{1,19}$/.test(number)))
      }
      const matches = employeeNumbers.filter((number) => number.includes(term)).slice(0, limit)
      const fetched = await Promise.allSettled(matches.map(async (number) => {
        const { data } = await client.get(`${PERSONNEL_RECORD_CHANGES_BASE}/lookups/employees/${segment(number)}`, { signal })
        return personalStatusEmployee(data)
      }))
      const failure = fetched.find((item) => item.status === 'rejected' && item.reason?.status !== 404)
      if (failure) throw failure.reason
      const items = fetched.filter((item) => item.status === 'fulfilled').map((item) => item.value)
      return Object.freeze({ items: Object.freeze(items), pagination: Object.freeze({ page: 1, limit, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }) })
    },
    async list({ signal } = {}) {
      const fetchPage = async (page) => {
        const result = await client.get(PERSONNEL_RECORD_CHANGES_BASE, { params: { page, pageSize: 100, sort: 'headerId', order: 'desc' }, signal })
        const data = result.data
        if (!data || !Array.isArray(data.rows) || !data.meta || !Number.isInteger(data.meta.total) || data.meta.total < 0 || !Number.isInteger(data.meta.pageSize) || data.meta.pageSize < 1) {
          throw new ApiError('The server returned an unexpected personal status report.', { code: 'INVALID_RESPONSE' })
        }
        return data
      }
      const first = await fetchPage(1)
      const pageCount = Math.ceil(first.meta.total / first.meta.pageSize)
      const rows = [...first.rows]
      for (let page = 2; page <= pageCount; page += 1) rows.push(...(await fetchPage(page)).rows)
      return Object.freeze({ items: Object.freeze(rows.map(personalStatusListItem)), pagination: Object.freeze({
        page: 1, limit: rows.length, total: first.meta.total, totalPages: pageCount, hasNextPage: false, hasPreviousPage: false,
      }) })
    },
    async getById(id, { signal } = {}) {
      const { data } = await client.get(`${PERSONNEL_RECORD_CHANGES_BASE}/${segment(id)}`, { signal })
      return record(data)
    },
    async save(id, body, employee) {
      const payload = payloadForApi(body, employee)
      const response = id
        ? await client.put(`${PERSONNEL_RECORD_CHANGES_BASE}/${segment(id)}`, payload)
        : await client.post(PERSONNEL_RECORD_CHANGES_BASE, payload)
      return record(response.data)
    },
    async delete(id) { await client.delete(`${PERSONNEL_RECORD_CHANGES_BASE}/${segment(id)}`) },
  })
}

const APPRAISAL_CRITERIA = Object.freeze([
  'Quality / Accuracy of Work', 'Quanitity of Work', 'Dependability', 'Attendance / Punctuality',
  'Professional Communication Skills with co-workers/Supervisors', 'Customer-focused Communication Skills',
  'Ability to work as a member of a team; teamwork', 'Demonstrates Positive Attitude', 'Ability to work independently',
  'Open to feedback', 'Willingness to take on additional responsibilities', 'Complies with company policies and procedures',
  'Exhibits effective problem solving skills', 'Eagerness to learn new-job related skills', 'Ask questions and seek guidance as needed',
  'Makes progress towards professional development goals', 'Demonstrates Zamil Group Core Values', 'Initiative', 'Developing Others',
  'Health Safety & Environment (HSE)',
])
const APPRAISAL_GRADES = Object.freeze([
  { grade: 'A', min: 4.25, title: 'Consistently Exceeds', description: 'Consistently exceeds expectations.' },
  { grade: 'B', min: 3.5, title: 'Meets and Exceeds', description: 'Meets and exceeds expectations.' },
  { grade: 'C', min: 2.5, title: 'Successfully Meets', description: 'Successfully meets expectations.' },
  { grade: 'D', min: 1.6, title: 'Meets Some', description: 'Meets some expectations.' },
  { grade: 'E', min: 0, title: 'Below Expectations', description: 'Below expectations.' },
])

function createPerformanceAppraisalService({ client }) {
  const criteria = Object.freeze(APPRAISAL_CRITERIA.map((label, index) => Object.freeze({ code: `C${String(index + 1).padStart(2, '0')}`, label })))
  const yearOf = (value) => Number(value ?? new Date().getFullYear())
  const emptyPage = (total = 0) => Object.freeze({ page: 1, limit: 100, total, totalPages: Math.ceil(total / 100), hasNextPage: false, hasPreviousPage: false })
  const periods = () => Object.freeze(Array.from({ length: 6 }, (_, index) => {
    const year = new Date().getFullYear() - index
    return Object.freeze({ code: String(year), label: String(year), from: `${year}-01-01`, to: `${year}-12-31` })
  }))
  const employee = (data) => Object.freeze({
    employeeId: String(data.number), employeeNumber: String(data.number), personId: String(data.personId), name: data.name,
    jobTitle: data.jobTitle ?? '', grade: '', companyName: '', departmentName: data.department ?? '',
    joinedDate: data.hireDate ?? '', positionDate: '', yearsInCompany: data.yearsInCompany ?? null, yearsInPosition: data.yearsInPosition ?? null,
  })
  const readRecord = (data) => {
    const year = Number(data.period?.year)
    const ratings = Object.fromEntries(criteria.map((item) => {
      const line = data.criteria?.find((entry) => Number(entry.id) === Number(item.code.slice(1)))
      return [item.code, { rating: line?.rating == null ? null : Number(line.rating), explanation: line?.justification ?? '' }]
    }))
    return Object.freeze({
      appraisalId: String(data.headerId), appraisalNumber: String(data.headerId),
      status: String(data.status).toUpperCase() === 'INPROCESS' ? 'INPROCESS' : String(data.status).toUpperCase(),
      periodCode: String(year), appraiser: Object.freeze({ name: data.appraiser?.evaluatedBy ?? '', employeeNumber: '' }),
      employee: Object.freeze({ ...employee({ ...data.employee, ...data.appraiser, number: data.employee?.number, name: data.employee?.name }), grade: data.result?.grade ?? '' }),
      ratings: Object.freeze(ratings), goals: Object.freeze((data.development ?? []).map((item) => item.need)),
      training: Object.freeze((data.training ?? []).map((item) => item.objective)),
      employeeRemarks: data.remarks?.employee === '-' ? '' : (data.remarks?.employee ?? ''),
      appraiserRemarks: data.remarks?.appraiser === '-' ? '' : (data.remarks?.appraiser ?? ''),
      signatures: Object.freeze({ employee: null, appraiser: null }), rating: data.result?.rating == null ? null : Number(data.result.rating),
      grade: data.result?.grade ?? null, updatedAt: data.creationDate ? `${data.creationDate}T00:00:00.000Z` : new Date().toISOString(),
    })
  }
  const bodyForApi = (body, employeeItem) => ({
    year: yearOf(body.periodCode),
    employee: { name: employeeItem.name, number: employeeItem.employeeNumber, personId: employeeItem.personId },
    criteria: criteria.map((item, index) => ({ id: index + 1, rating: body.ratings[item.code]?.rating, justification: body.ratings[item.code]?.explanation ?? '' })),
    development: body.goals, training: body.training,
    remarks: { employee: body.employeeRemarks, appraiser: body.appraiserRemarks }, formLanguage: 'English',
  })
  return Object.freeze({
    async lookups({ signal } = {}) {
      const [statsResponse] = await Promise.all([client.get(`${PERFORMANCE_APPRAISALS_BASE}/lookups/grade-stats`, { signal })])
      const stats = statsResponse.data
      const percent = stats?.quota?.percent
      if (!percent || !stats?.quota?.target || !stats?.quota?.allocated ||
        ['A', 'B', 'C', 'D', 'E'].some((grade) => ![percent[grade], stats.quota.target[grade], stats.quota.allocated[grade]].every(Number.isFinite))) {
        throw new ApiError('The server returned unexpected appraisal grade statistics.', { code: 'INVALID_RESPONSE' })
      }
      const scale = APPRAISAL_GRADES.map((item, index) => {
        const upper = index === 0 ? 5 : APPRAISAL_GRADES[index - 1].min - 0.01
        const range = index === APPRAISAL_GRADES.length - 1
          ? `< ${item.min.toFixed(2)}`
          : `${item.min.toFixed(2)}–${upper.toFixed(2)}`
        return Object.freeze({ ...item, range })
      })
      return Object.freeze({ criteria, scale: Object.freeze(scale),
        distribution: Object.freeze({ ...percent }), periods: periods(), gradeStats: Object.freeze({
          percent: Object.freeze({ ...percent }), target: Object.freeze({ ...stats.quota.target }), allocated: Object.freeze({ ...stats.quota.allocated }),
        }) })
    },
    async team(periodCode, { signal } = {}) {
      const year = yearOf(periodCode)
      const [peopleResult, requestorResult] = await Promise.all([
        client.get(`${PERFORMANCE_APPRAISALS_BASE}/lookups/employees`, { params: { year }, signal }),
        client.get(`${PERFORMANCE_APPRAISALS_BASE}/lookups/requestor`, { signal }),
      ])
      if (!Array.isArray(peopleResult.data)) throw new ApiError('The server returned unexpected appraisal employees.', { code: 'INVALID_RESPONSE' })
      const members = peopleResult.data.map((item) => Object.freeze({
        employeeId: String(item.number), employeeNumber: String(item.number), personId: null, name: String(item.name ?? ''),
        jobTitle: '', grade: '', companyName: '', departmentName: '', joinedDate: '', positionDate: '',
        yearsInCompany: null, yearsInPosition: null, savedGrade: null,
      })).filter((item) => item.name && /^\d{1,19}$/.test(item.employeeId))
      const requestor = requestorResult.data ?? {}
      return Object.freeze({ appraiser: Object.freeze({ name: requestor.fullName ?? '', employeeNumber: String(requestor.employeeNumber ?? '') }), members: Object.freeze(members) })
    },
    async employee(name, year, { signal } = {}) {
      const response = await client.get(`${PERFORMANCE_APPRAISALS_BASE}/lookups/employees/${encodeURIComponent(name)}`, { params: { year: yearOf(year) }, signal })
      return employee(response.data)
    },
    async list({ signal } = {}) {
      const year = new Date().getFullYear()
      const { data, pagination } = await client.get(PERFORMANCE_APPRAISALS_BASE, { params: { year, page: 1, pageSize: 100, sort: 'headerId', order: 'desc' }, signal })
      const items = (data ?? []).map((item) => Object.freeze({ appraisalId: String(item.headerId), appraisalNumber: String(item.headerId),
        status: String(item.status ?? '').toUpperCase(), employeeName: item.empName ?? '', periodCode: String(item.year),
        rating: item.rating == null ? null : Number(item.rating), grade: item.grade ?? null,
        updatedAt: item.creationDate ? `${item.creationDate}T00:00:00.000Z` : new Date().toISOString() }))
      return Object.freeze({ items: Object.freeze(items), pagination: Object.freeze(pagination ?? emptyPage(items.length)) })
    },
    async getById(id, { signal } = {}) {
      const { data } = await client.get(`${PERFORMANCE_APPRAISALS_BASE}/${segment(id)}`, { signal })
      return readRecord(data)
    },
    async save(id, body, selectedEmployee) {
      const employeeItem = selectedEmployee
      if (!employeeItem?.personId) throw new ApiError('Select an eligible employee before saving.', { code: 'EMPLOYEE_REQUIRED' })
      const payload = bodyForApi(body, employeeItem)
      const response = id
        ? await client.put(`${PERFORMANCE_APPRAISALS_BASE}/${segment(id)}`, payload)
        : await client.post(PERFORMANCE_APPRAISALS_BASE, payload)
      const recordId = response.data?.headerId ?? id
      if (!recordId) throw new ApiError('The server did not return the created appraisal number.', { code: 'INVALID_RESPONSE' })
      return this.getById(String(recordId))
    },
    submit() { throw new ApiError('The appraisal API creates the request in process when it is saved.', { code: 'SUBMIT_UNSUPPORTED' }) },
    async delete(id) { await client.delete(`${PERFORMANCE_APPRAISALS_BASE}/${segment(id)}`) },
  })
}

export function createEmployeeServices({ client, recordChangeClient, transferClient, appraisalClient }) {
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
    recordChanges: recordChangeClient
      ? createPersonalStatusRecordService({ client: recordChangeClient })
      : createRecordService({ client, base: `${EMPLOYEE_SERVICES_BASE}/record-change-requests`, readRecord: readRecordChange, readListItem: readRecordChangeListItem }),
    transfers: transferClient
      ? createTransferRequestService({ client: transferClient })
      : client?.identify
        ? createRecordService({ client, base: `${EMPLOYEE_SERVICES_BASE}/transfers`, readRecord: readTransfer, readListItem: readTransferListItem })
        : createTransferRequestService({ client }),
    performance: appraisalClient ? (() => {
      const service = createPerformanceAppraisalService({ client: appraisalClient })
      return Object.freeze({ lookups: service.lookups, team: service.team, employee: service.employee })
    })() : Object.freeze({
      lookups: async ({ signal } = {}) => readPerformanceLookups((await client.get(`${PERFORMANCE_BASE}/lookups`, { signal })).data),
      team: async (periodCode, { signal } = {}) => readAppraisalTeam((await client.get(`${PERFORMANCE_BASE}/team`, { params: { periodCode }, signal })).data),
    }),
    appraisals: appraisalClient ? createPerformanceAppraisalService({ client: appraisalClient }) : createRecordService({
      client, base: `${PERFORMANCE_BASE}/appraisals`, readRecord: readAppraisal, readListItem: readAppraisalListItem,
    }),
  })
}

// The one switch between demo data and the real API.
export function selectEmployeeServicesClient({ demo, api = apiClient, createDemo = createEmployeeServicesDemoClient } = {}) {
  return demo ? createDemo() : api
}

export const hrEmployeeServices = createEmployeeServices({ client: selectEmployeeServicesClient({ demo: hrEmployeeServicesConfig.demo }), recordChangeClient: apiClient, transferClient: apiClient, appraisalClient: apiClient })
export const employeeServicesDemo = hrEmployeeServicesConfig.demo

// Demo only: the adapter records the signed-in user as requester or appraiser
// (a real backend takes them from the session). A no-op for apiClient.
export function identifyEmployeeServicesUser(user, client = hrEmployeeServices.client) {
  const name = typeof user?.fullName === 'string' ? user.fullName.trim() : ''
  client.identify?.(name ? { name, employeeNumber: String(user.employeeNumber ?? '') } : null)
}
