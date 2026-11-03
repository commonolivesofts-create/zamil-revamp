// Response contract of Reward Nomination (form 1113, Employee of the Month):
// /api/v1/hr/employee-of-the-month. Readers turn backend data into the frozen
// shapes the screens use and reject anything unexpected; `rewardBody` builds
// the create/update payload. Pure (no React, no fetch).
import { ID, invalidResponse, isoDate, normalizeStatus, text } from '../shared/formRecords.js'

// The two legacy templates. The API value is the URL segment; the stored
// DEPT_TYPE is 'Production' or 'Shared-services'.
export const REWARD_DEPARTMENTS = Object.freeze(['production', 'shared-services'])
export const REWARD_RATING_CODES = Object.freeze(['A', 'AS', 'BS', 'CS'])
export const departmentFromApi = (value) => (String(value ?? '').toLowerCase() === 'production' ? 'production' : 'shared-services')

const fail = () => { throw invalidResponse('reward nomination') }

export function readRewardCriteria(data) {
  if (!data || !REWARD_DEPARTMENTS.includes(data.department) || !Array.isArray(data.criteria) || !Array.isArray(data.ratingScale)) {
    throw invalidResponse('criteria list')
  }
  const criteria = data.criteria.map((item, index) => {
    if (item?.lineNumber !== index || typeof item.criterion !== 'string') throw invalidResponse('criteria list')
    return Object.freeze({ lineNumber: index, criterion: item.criterion })
  })
  const ratingScale = data.ratingScale.map((item) => {
    if (!REWARD_RATING_CODES.includes(item?.code) || typeof item.label !== 'string') throw invalidResponse('rating scale')
    return Object.freeze({ code: item.code, label: item.label })
  })
  return Object.freeze({ department: data.department, criteria: Object.freeze(criteria), ratingScale: Object.freeze(ratingScale) })
}

// Employee lookup row (also the shape the employee picker lists).
export function readRewardEmployee(item) {
  if (!item || !text(item.employeeNumber) || typeof item.fullName !== 'string') throw invalidResponse('employee')
  return Object.freeze({
    employeeId: text(item.employeeNumber),
    employeeNumber: text(item.employeeNumber),
    name: item.fullName,
    email: text(item.email),
    position: text(item.position),
    departmentName: text(item.department),
  })
}

export function readRewardRequestor(data) {
  if (!data || !text(data.employeeNumber)) throw invalidResponse('requestor')
  return Object.freeze({ employeeNumber: text(data.employeeNumber), name: text(data.fullName), email: text(data.email) })
}

export function readRewardRecord(data) {
  if (!data || !ID.test(String(data.headerId ?? '')) || !Array.isArray(data.lines)) fail()
  return Object.freeze({
    nominationId: String(data.headerId),
    requestNo: text(data.requestNo),
    department: departmentFromApi(data.department),
    employee: Object.freeze({
      employeeId: text(data.employeeNumber),
      employeeNumber: text(data.employeeNumber),
      name: text(data.employeeName),
      email: text(data.employeeEmail),
      position: text(data.employeePosition),
      departmentName: text(data.employeeDepartment),
    }),
    activityDate: isoDate(data.activityDate),
    overallRating: REWARD_RATING_CODES.includes(data.overallRating) ? data.overallRating : '',
    remark: text(data.remark),
    status: normalizeStatus(data.status),
    createdAt: isoDate(data.createdAt),
    lines: Object.freeze(data.lines.map((line, index) => {
      if (line?.lineNumber !== index) fail()
      return Object.freeze({
        lineNumber: index,
        criterion: text(line.criterion),
        rating: REWARD_RATING_CODES.includes(line.rating) ? line.rating : '',
        remark: text(line.remark),
      })
    })),
  })
}

export function readRewardListItem(item) {
  if (!item || !ID.test(String(item.headerId ?? ''))) throw invalidResponse('nomination list')
  const ratings = item.ratings ?? {}
  return Object.freeze({
    nominationId: String(item.headerId),
    requestNo: text(item.requestNo) || String(item.headerId),
    department: departmentFromApi(item.department),
    employeeNumber: text(item.employeeNumber),
    employeeName: text(item.employeeName),
    employeePosition: text(item.employeePosition),
    activityDate: isoDate(item.activityDate),
    overallRating: REWARD_RATING_CODES.includes(item.overallRating) ? item.overallRating : '',
    remark: text(item.remark),
    ratings: Object.freeze(Object.fromEntries(REWARD_RATING_CODES.map((code) => [code, Number(ratings[code]) || 0]))),
    status: normalizeStatus(item.status),
    requestor: text(item.requestor),
    createdAt: isoDate(item.createdAt),
  })
}

// The employee details are sent exactly as the lookup returned them: the server
// re-reads the master and rejects a mismatch (EMPLOYEE_DATA_MISMATCH).
export function rewardBody(form, employee) {
  return {
    department: form.department,
    employee: {
      number: employee.employeeNumber,
      name: employee.name,
      email: employee.email,
      position: employee.position,
      departmentName: employee.departmentName,
    },
    activityDate: form.activityDate,
    overallRating: form.overallRating,
    remark: form.remark.trim(),
    lines: form.lines.map((line, index) => ({ lineNumber: index, rating: line.rating, remark: line.remark.trim() })),
  }
}
