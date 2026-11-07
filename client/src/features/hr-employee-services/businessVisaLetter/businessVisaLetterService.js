// Business Visa Letter (legacy Business_visa_letter): /api/v1/hr/business-visa-letters,
// HR.BUSINESS_VISA_LETTERS. A bilingual letter to an embassy for an employee's
// business visit visa. The employee details are copied from the master into
// editable fields (the table keeps the letter's text, not the employee
// number). Readers reject unexpected data.
import { apiClient } from '../../../services/api/apiClient.js'
import { createEmployeeList, employeePage } from '../shared/employeeList.js'
import { ID, invalidResponse, isoDate, params, segment, text } from '../shared/formRecords.js'

export const BASE = '/hr/business-visa-letters'
export const RESOURCE = 'HR.BUSINESS_VISA_LETTERS'
export const STATUSES = Object.freeze(['DRAFT', 'FINAL'])

// Text fields and their API limits (the backend's write schema).
export const TEXT_FIELDS = Object.freeze({
  ref_no: 50, division_id: 50, consul_general: 1000, embassy: 1000, embassy_location: 1000, opening_text: 1000, request_for: 50,
  subject: 1000, employee_name: 250, nationality: 1000, passport_no: 1000, id_no: 1000, job_title: 1000, contract_nature: 1000,
  visit_place: 1000, visit_purpose: 1000, expense_employee_name: 1000, expense_borne_by: 1000, return_employee_name: 1000,
  return_statement: 1000, closing_text: 1000, status: 10, embassy_ar: 1000, job_title_ar: 1000, contract_nature_ar: 1000,
  nationality_ar: 1000, visit_purpose_ar: 1000,
})
export const DATE_FIELDS = Object.freeze(['letter_date', 'passport_date', 'id_expiration_date', 'employed_since', 'contract_expiry'])
export const NUMBER_FIELDS = Object.freeze(['monthly_salary', 'visit_days'])
const FIELDS = [...Object.keys(TEXT_FIELDS), ...DATE_FIELDS, ...NUMBER_FIELDS]

// The legacy defaults (the server applies the same ones to a blank value).
export const blankLetter = (today) => ({
  ...Object.fromEntries(FIELDS.map((key) => [key, ''])),
  letter_date: today, status: 'DRAFT', visit_purpose: 'Business discussions.', visit_purpose_ar: 'زيارة تجارية', expense_borne_by: 'Company',
  return_statement: 'return to Saudi Arabia to resume his duties.', closing_text: 'Anticipating your assistance in this regard.',
})

const value = (data, key) => (DATE_FIELDS.includes(key) ? isoDate(data[key]) : data[key] == null ? '' : text(data[key]))

export function readLetter(data) {
  if (!data || !ID.test(String(data.id ?? ''))) throw invalidResponse('business visa letter')
  return Object.freeze({
    letterId: String(data.id),
    createdAt: isoDate(data.created_at),
    form: Object.freeze(Object.fromEntries(FIELDS.map((key) => [key, value(data, key)]))),
  })
}

export function readLetterPage(data) {
  const pages = data?.pagination
  if (!data || !Array.isArray(data.letters) || !pages) throw invalidResponse('business visa letter list')
  const counts = [pages.total_records, pages.current_page, pages.limit].map(Number)
  if (!counts.every((item) => Number.isInteger(item) && item >= 0)) throw invalidResponse('page')
  const [total, page, limit] = counts
  const totalPages = limit ? Math.ceil(total / limit) : 1
  return Object.freeze({
    items: Object.freeze(data.letters.map(readLetter)),
    pagination: Object.freeze({ page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }),
  })
}

export function readOptions(data) {
  const list = (items) => (Array.isArray(items) ? items : []).map((item) => Object.freeze({ value: text(item?.value), label: text(item?.label), ar: text(item?.ar) })).filter((item) => item.value)
  if (!data) throw invalidResponse('options')
  return Object.freeze({ divisions: Object.freeze(list(data.divisions)), requestFor: Object.freeze(list(data.request_for)), embassies: Object.freeze(list(data.embassies)) })
}

// The master's details, as the letter's fields (blank ones stay blank to fill in).
export function readEmployee(data) {
  if (!data || !text(data.employee_name)) throw invalidResponse('employee')
  return Object.freeze({
    employee_name: text(data.employee_name), nationality: text(data.nationality), nationality_ar: text(data.nationality_ar),
    passport_no: text(data.passport_no), id_no: text(data.id_no), id_expiration_date: isoDate(data.id_expiration_date),
    job_title: text(data.job_title), job_title_ar: text(data.job_title_ar), employed_since: isoDate(data.employed_since),
    contract_nature: text(data.contract_nature), monthly_salary: data.monthly_salary == null ? '' : text(data.monthly_salary),
  })
}

// Request body: every field, blanks as null (the server applies the legacy defaults).
export function letterBody(form) {
  return Object.fromEntries(FIELDS.map((key) => {
    const raw = String(form[key] ?? '').trim()
    if (!raw) return [key, null]
    return [key, NUMBER_FIELDS.includes(key) ? Number(raw) : raw]
  }))
}

export function validateLetter(form) {
  const errors = {}
  if (!form.ref_no.trim()) errors.ref_no = 'Reference no. is required.'
  if (!form.letter_date) errors.letter_date = 'Letter date is required.'
  if (!form.division_id) errors.division_id = 'Choose the division.'
  if (!form.employee_name.trim()) errors.employee_name = 'Choose the employee.'
  for (const [key, max] of Object.entries(TEXT_FIELDS)) if (String(form[key] ?? '').trim().length > max) errors[key] = `Keep it within ${max} characters.`
  for (const key of NUMBER_FIELDS) {
    const raw = String(form[key] ?? '').trim()
    if (raw && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) errors[key] = 'Enter a number (0 or more).'
  }
  return errors
}

export function createBusinessVisaLetterService({ client }) {
  const getById = async (id, { signal } = {}) => readLetter((await client.get(`${BASE}/${segment(id)}`, { signal })).data)
  // Every current employee once, loaded with the form.
  const employees = createEmployeeList({
    load: ({ signal } = {}) => client.get(`${BASE}/lookups/employees`, { signal }).then(({ data }) => data),
    shape: (item) => (text(item?.employee_number)
      ? Object.freeze({ employeeId: text(item.employee_number), employeeNumber: text(item.employee_number), name: text(item.full_name) })
      : null),
  })
  return Object.freeze({
    getById,
    async options({ signal } = {}) {
      return readOptions((await client.get(`${BASE}/lookups/options`, { signal })).data)
    },
    preloadEmployees: (options) => employees.list(options),
    // The API returns every current employee once; the picker filters them by number or name.
    async searchEmployees(search = '', { signal } = {}) {
      const term = String(search).trim().toUpperCase()
      const list = await employees.list({ signal })
      return employeePage(list.filter((item) => !term || item.employeeNumber.toUpperCase().includes(term) || item.name.toUpperCase().includes(term)))
    },
    async employee(employeeNumber, { signal } = {}) {
      return readEmployee((await client.get(`${BASE}/lookups/employee/${encodeURIComponent(employeeNumber)}`, { signal })).data)
    },
    async list({ page = 1, pageSize = 25, q, status, division, dateFrom, dateTo } = {}, { signal } = {}) {
      const { data } = await client.get(BASE, { params: params({ page, limit: pageSize, search: q, status, division_id: division, from: dateFrom, to: dateTo }), signal })
      return readLetterPage(data)
    },
    // Create returns the letter; update returns { changed, letter }; both end with the stored letter.
    async save(id, form) {
      if (!id) return readLetter((await client.post(BASE, letterBody(form))).data)
      await client.put(`${BASE}/${segment(id)}`, letterBody(form))
      return getById(id)
    },
  })
}

export const businessVisaLetterService = createBusinessVisaLetterService({ client: apiClient })
