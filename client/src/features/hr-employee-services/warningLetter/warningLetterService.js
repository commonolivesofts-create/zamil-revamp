// Warning Letter (legacy Warning_letter): /api/v1/hr/warning-letters,
// HR.WARNING_LETTERS. The server copies the employee's name, division and
// position from the master and numbers the letter (reference ZPIL/<id>/<n>,
// warning no. = the employee's count + 1). Readers reject unexpected data.
import { apiClient } from '../../../services/api/apiClient.js'
import { createEmployeeList, employeePage } from '../shared/employeeList.js'
import { ID, invalidResponse, isoDate, normalizeStatus, params, segment, text } from '../shared/formRecords.js'

export const BASE = '/hr/warning-letters'
export const RESOURCE = 'HR.WARNING_LETTERS'
export const TEXT_MAX = 2000

// The legacy reasons, English and Arabic as on the form.
export const REASONS = Object.freeze([
  ['irregular', 'Irregular on duty', 'التأخير المتكرر في الحضور أو الانصراف'],
  ['absent', 'Absent without permission', 'الغياب بدون إذن'],
  ['eating', 'Eating in a prohibited place', 'الأكل في غير المكان المحدد'],
  ['delaying', 'Delaying the assigned job', 'التأخير في أداء العمل'],
  ['makeProblems', 'Creating problems at work', 'إحداث مشاكل في مكان العمل'],
].map(([key, en, ar]) => Object.freeze({ key, en, ar })))
const FLAGS = Object.freeze({
  irregular: 'irregular_flag', absent: 'absent_flag', eating: 'eating_flag', delaying: 'delaying_flag', makeProblems: 'make_problems_flag',
  warningLetter: 'warning_letter_flag', otherLetter: 'other_letter_flag',
})
const TEXTS = Object.freeze({
  othersText: 'others_text', othersTextAr: 'others_text_ar', actionText: 'action_text', actionTextAr: 'action_text_ar',
  warningComment: 'warning_letter_comment', otherComment: 'other_letter_comment',
})

export const blankLetter = (today) => Object.freeze({
  warDate: today, employee: null,
  ...Object.fromEntries(Object.keys(FLAGS).map((key) => [key, false])),
  ...Object.fromEntries(Object.keys(TEXTS).map((key) => [key, ''])),
})

export function readEmployee(data) {
  if (!data || !text(data.emp_no)) throw invalidResponse('employee')
  return Object.freeze({
    employeeNo: text(data.emp_no), name: text(data.emp_name), division: text(data.emp_div), position: text(data.emp_job),
    nextWarningNo: data.warning_no == null ? '' : text(data.warning_no),
  })
}

export function readLetter(data) {
  if (!data || !ID.test(String(data.id ?? ''))) throw invalidResponse('warning letter')
  return Object.freeze({
    letterId: String(data.id),
    referenceNo: text(data.reference_no),
    warningNo: text(data.warning_no),
    status: normalizeStatus(data.status),
    warDate: isoDate(data.war_date),
    createdAt: isoDate(data.created_at),
    employee: readEmployee(data),
    ...Object.fromEntries(Object.entries(FLAGS).map(([key, column]) => [key, String(data[column] ?? '').toUpperCase() === 'Y'])),
    ...Object.fromEntries(Object.entries(TEXTS).map(([key, column]) => [key, text(data[column])])),
  })
}

export function readLetterPage(data) {
  const pages = data?.pagination
  if (!data || !Array.isArray(data.rows) || !pages) throw invalidResponse('warning letter list')
  const counts = [pages.total_records, pages.current_page, pages.limit].map(Number)
  if (!counts.every((value) => Number.isInteger(value) && value >= 0)) throw invalidResponse('page')
  const [total, page, limit] = counts
  const totalPages = limit ? Math.ceil(total / limit) : 1
  return Object.freeze({
    items: Object.freeze(data.rows.map(readLetter)),
    pagination: Object.freeze({ page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }),
  })
}

export const letterFormOf = (letter) => ({
  warDate: letter.warDate, employee: letter.employee,
  ...Object.fromEntries(Object.keys(FLAGS).map((key) => [key, letter[key]])),
  ...Object.fromEntries(Object.keys(TEXTS).map((key) => [key, letter[key]])),
})

// Request body (snake_case API). The employee is fixed once saved; the server
// clears a letter comment whose box is not ticked.
export function letterBody(form, { creating }) {
  return {
    war_date: form.warDate,
    ...(creating ? { emp_no: form.employee.employeeNo } : {}),
    ...Object.fromEntries(Object.entries(FLAGS).map(([key, column]) => [column, form[key] ? 'Y' : 'N'])),
    ...Object.fromEntries(Object.entries(TEXTS).map(([key, column]) => [column, form[key].trim()])),
  }
}

// The backend rules: a reason (a box or "Others"), and a comment for each ticked letter.
export function validateLetter(form) {
  const errors = {}
  if (!form.employee) errors.employee = 'Choose the employee.'
  if (!form.warDate) errors.warDate = 'Date is required.'
  if (!REASONS.some((item) => form[item.key]) && !form.othersText.trim() && !form.othersTextAr.trim()) {
    errors.reasons = 'Tick a reason or describe it under Others.'
  }
  if (form.warningLetter && !form.warningComment.trim()) errors.warningComment = 'Add the warning letter comment.'
  if (form.otherLetter && !form.otherComment.trim()) errors.otherComment = 'Add the other letter comment.'
  for (const key of Object.keys(TEXTS)) if (form[key].trim().length > TEXT_MAX) errors[key] = `Keep it within ${TEXT_MAX} characters.`
  return errors
}

const employeeOption = (item) => (text(item?.emp_no)
  ? Object.freeze({ employeeId: text(item.emp_no), employeeNumber: text(item.emp_no), name: text(item.emp_name) })
  : null)

export function createWarningLetterService({ client }) {
  const getById = async (value, { signal } = {}) => readLetter((await client.get(`${BASE}/${segment(value)}`, { signal })).data)
  // The picker's list, loaded with the form (the legacy datalist of employees).
  const employees = createEmployeeList({
    load: ({ signal } = {}) => client.get(`${BASE}/lookups/employees`, { signal }).then(({ data }) => data),
    shape: employeeOption,
  })
  return Object.freeze({
    getById,
    preloadEmployees: (options) => employees.list(options),
    // The legacy name / number search (at least two characters), in the picker's shape.
    async searchEmployees(search = '', { signal } = {}) {
      const q = String(search).trim()
      // Opening the field lists the employees loaded with the form.
      if (!q) return employeePage(await employees.list({ signal }))
      if (q.length < 2) return employeePage([])
      const data = (await client.get(`${BASE}/lookups/employees`, { params: { q }, signal })).data
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      return employeePage(data.map(employeeOption).filter(Boolean))
    },
    async employee(employeeNo, { signal } = {}) {
      return readEmployee((await client.get(`${BASE}/lookups/employee/${encodeURIComponent(employeeNo)}`, { signal })).data)
    },
    async list({ page = 1, pageSize = 25, q, division, flag, dateFrom, dateTo } = {}, { signal } = {}) {
      const { data } = await client.get(BASE, {
        params: params({ page, limit: pageSize, search: q, division, flag, date_from: dateFrom, date_to: dateTo }), signal,
      })
      return readLetterPage(data)
    },
    async save(value, form) {
      if (value) return readLetter((await client.put(`${BASE}/${segment(value)}`, letterBody(form, { creating: false }))).data)
      return readLetter((await client.post(BASE, letterBody(form, { creating: true }))).data)
    },
  })
}

export const warningLetterService = createWarningLetterService({ client: apiClient })
