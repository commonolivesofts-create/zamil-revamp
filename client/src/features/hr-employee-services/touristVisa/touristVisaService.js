// Tourist Visa Letter (legacy Tourist_visa): /api/v1/hr/tourist-visa-letters,
// HR.TOURIST_VISA_LETTERS. A bilingual letter to the consul general for an
// employee's tourist visa. The server copies the employee's name, nationality,
// passport, national ID, position, contract and salary (English and Arabic)
// from the master, writes the salary in words and the Hijri date, and checks
// the countries and the approver. A letter is addressed by its UUID.
import { apiClient, ApiError } from '../../../services/api/apiClient.js'
import { invalidResponse, isoDate, params, text } from '../shared/formRecords.js'

export const BASE = '/hr/tourist-visa-letters'
export const RESOURCE = 'HR.TOURIST_VISA_LETTERS'
// The legacy divisions.
export const DIVISIONS = Object.freeze(['ZPIL', 'Z3P'])
// Dates the requester enters (legacy: an English and an Arabic input each; the Arabic copy follows the English one).
export const DATE_FIELDS = Object.freeze([
  ['pass_issue_date', 'Passport issue date', 'تاريخ إصدار الجواز'],
  ['nati_issue_date', 'National ID issue date', 'تاريخ إصدار الهوية الوطنية'],
  ['position_start_date', 'Position start date', 'تاريخ بدء الوظيفة'],
  ['contract_expired', 'Contract expires on', 'انتهاء العقد في'],
].map(([key, en, ar]) => Object.freeze({ key, en, ar })))
// Employee details from the master: [field, English label, Arabic label].
export const EMPLOYEE_FIELDS = Object.freeze([
  ['employee_name', 'Name', 'اسم الموظف'], ['nationality', 'Nationality', 'الجنسية'], ['passport_no', 'Passport no.', 'رقم الجواز'],
  ['national_id', 'National ID', 'الهوية الوطنية'], ['position', 'Position', 'المسمى الوظيفي'], ['contract', 'Contract', 'العقد'],
].map(([key, en, ar]) => Object.freeze({ key, en, ar })))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const uuidOf = (value) => {
  if (!UUID.test(String(value ?? ''))) throw new ApiError('The selected letter is invalid.', { code: 'INVALID_ID' })
  return String(value)
}

const EMPLOYEE_KEYS = Object.freeze([
  'employee_no', 'employee_no_ar', 'employee_name', 'employee_name_ar', 'nationality', 'nationality_ar', 'passport_no', 'passport_no_ar',
  'national_id', 'national_id_ar', 'position', 'position_ar', 'contract', 'contract_ar', 'salary', 'tourism_from', 'tourism_from_ar',
])
export function readEmployee(data) {
  if (!data || !text(data.employee_no)) throw invalidResponse('employee')
  return Object.freeze(Object.fromEntries(EMPLOYEE_KEYS.map((key) => [key, text(data[key])])))
}

export function readLetter(data) {
  if (!data || !UUID.test(String(data.uuid ?? ''))) throw invalidResponse('tourist visa letter')
  return Object.freeze({
    letterId: String(data.uuid),
    refNo: text(data.ref_no),
    curDate: isoDate(data.cur_date),
    curDateAr: text(data.cur_date_ar),
    division: text(data.division),
    country: text(data.country),
    countryAr: text(data.country_ar),
    tourismTo: text(data.tourism_to),
    tourismToAr: text(data.tourism_to_ar),
    tourismFrom: text(data.tourism_from),
    tourismFromAr: text(data.tourism_from_ar),
    salaryWord: text(data.salary_word),
    salaryWordAr: text(data.salary_word_ar),
    approvalName: text(data.approval_name),
    positionName: text(data.position_name),
    createdAt: isoDate(data.created_at),
    dates: Object.freeze(Object.fromEntries(DATE_FIELDS.map(({ key }) => [key, isoDate(data[key])]))),
    employee: readEmployee({ ...data, tourism_from: data.tourism_from, tourism_from_ar: data.tourism_from_ar }),
  })
}

export function readLetterPage(data) {
  const pages = data?.pagination
  if (!data || !Array.isArray(data.rows) || !pages) throw invalidResponse('tourist visa letter list')
  const counts = [pages.total_records, pages.current_page, pages.limit].map(Number)
  if (!counts.every((value) => Number.isInteger(value) && value >= 0)) throw invalidResponse('page')
  const [total, page, limit] = counts
  const totalPages = limit ? Math.ceil(total / limit) : 1
  const items = data.rows.map((row) => {
    if (!row || !UUID.test(String(row.uuid ?? ''))) throw invalidResponse('tourist visa letter list')
    return Object.freeze({
      letterId: String(row.uuid), refNo: text(row.ref_no), curDate: isoDate(row.cur_date), division: text(row.division),
      country: text(row.country), employeeNo: text(row.employee_no), employeeName: text(row.employee_name),
      nationality: text(row.nationality), nationalId: text(row.national_id), salary: text(row.salary),
      approvalName: text(row.approval_name), positionName: text(row.position_name),
    })
  })
  return Object.freeze({
    items: Object.freeze(items),
    pagination: Object.freeze({ page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }),
  })
}

export const blankLetter = (today) => ({
  curDate: today, division: '', country: '', employee: null, tourismTo: '', tourismFrom: '', approvalName: '',
  dates: Object.fromEntries(DATE_FIELDS.map(({ key }) => [key, ''])),
})
export const letterFormOf = (letter) => ({
  curDate: letter.curDate, division: letter.division, country: letter.country, employee: letter.employee,
  tourismTo: letter.tourismTo, tourismFrom: letter.tourismFrom, approvalName: letter.approvalName, dates: { ...letter.dates },
})

// Request body. The server re-reads the employee snapshot, so only the
// requester's answers travel; an Arabic date follows its English date.
export function letterBody(form, { approvers, saved }) {
  const approver = approvers.find((item) => item.name === form.approvalName)
  const dates = Object.fromEntries(DATE_FIELDS.flatMap(({ key }) => [[key, form.dates[key] || null], [`${key}_ar`, form.dates[key] || null]]))
  const body = {
    cur_date: form.curDate, division: form.division, country: form.country, employee_no: form.employee.employee_no,
    tourism_to: form.tourismTo, tourism_from: form.tourismFrom, approval_name: form.approvalName, position_name: approver?.position ?? '',
    ...dates,
  }
  // A changed date, destination or origin gets its Hijri date / Arabic name again from the server.
  if (saved) {
    if (form.curDate !== saved.curDate) body.cur_date_ar = ''
    if (form.tourismTo !== saved.tourismTo) body.tourism_to_ar = ''
    if (form.tourismFrom !== saved.tourismFrom) body.tourism_from_ar = ''
    body.salary = saved.employee.salary
  }
  return body
}

export function validateLetter(form, { approvers }) {
  const errors = {}
  if (!form.curDate) errors.curDate = 'Date is required.'
  if (!form.division) errors.division = 'Choose the division.'
  if (!form.country) errors.country = 'Choose who the letter is addressed to.'
  if (!form.employee) errors.employee = 'Choose the employee.'
  if (!form.tourismTo) errors.tourismTo = 'Choose the destination.'
  if (!form.tourismFrom) errors.tourismFrom = 'Choose the origin.'
  if (!form.approvalName) errors.approvalName = 'Choose the approver.'
  else if (!approvers.some((item) => item.name === form.approvalName)) errors.approvalName = 'Choose the approver from the list.'
  return errors
}

export function createTouristVisaService({ client }) {
  const getById = async (value, { signal } = {}) => readLetter((await client.get(`${BASE}/${uuidOf(value)}`, { signal })).data)
  return Object.freeze({
    getById,
    async lookups({ signal } = {}) {
      const [countries, approvers] = await Promise.all([
        client.get(`${BASE}/lookups/countries`, { signal }), client.get(`${BASE}/lookups/approvers`, { signal }),
      ])
      if (!Array.isArray(countries.data) || !Array.isArray(approvers.data)) throw invalidResponse('lookups')
      return Object.freeze({
        countries: Object.freeze(countries.data.map((item) => text(item?.country)).filter(Boolean)),
        approvers: Object.freeze(approvers.data.map((item) => Object.freeze({ name: text(item?.approval_name), position: text(item?.position_name) })).filter((item) => item.name)),
      })
    },
    // The legacy number / name search (at least two characters), in the picker's shape.
    async searchEmployees(search = '', { signal } = {}) {
      const q = String(search).trim()
      const data = q.length < 2 ? [] : (await client.get(`${BASE}/lookups/employees`, { params: { q }, signal })).data
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      const items = Object.freeze(data.filter((item) => text(item?.employee_no)).map((item) => Object.freeze({
        employeeId: text(item.employee_no), employeeNumber: text(item.employee_no), name: text(item.employee_name),
      })))
      return Object.freeze({ items, pagination: Object.freeze({ page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }) })
    },
    async employee(employeeNo, { signal } = {}) {
      return readEmployee((await client.get(`${BASE}/lookups/employees/${encodeURIComponent(employeeNo)}`, { signal })).data)
    },
    async list({ page = 1, pageSize = 25, q, division, country, dateFrom, dateTo } = {}, { signal } = {}) {
      const { data } = await client.get(BASE, { params: params({ page, limit: pageSize, search: q, division, country, date_from: dateFrom, date_to: dateTo }), signal })
      return readLetterPage(data)
    },
    async save(saved, form, approvers) {
      const body = letterBody(form, { approvers, saved })
      if (saved) return readLetter((await client.put(`${BASE}/${uuidOf(saved.letterId)}`, body)).data)
      return readLetter((await client.post(BASE, body)).data)
    },
  })
}

export const touristVisaService = createTouristVisaService({ client: apiClient })
