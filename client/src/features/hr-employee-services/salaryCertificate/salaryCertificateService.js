// Salary Certificate in English or Arabic: one screen over the two existing
// APIs, /api/v1/salary-certificates (English, HR.SALARY_CERTIFICATES) and
// /api/v1/salary-certificates-ar (Arabic, HR.SALARY_CERTIFICATES_AR). Both
// keep the same record shape (the Arabic one stores Arabic names, nationality
// and titles). A record id carries its language ("en-12", "ar-7") because each
// language has its own table. Readers reject unexpected data; the server
// re-reads the employee and salary snapshot, so the body carries only the
// requester's answers plus the two consistency assertions it requires.
import { apiClient, ApiError } from '../../../services/api/apiClient.js'
import { ID, invalidResponse, isoDate, optionalNumber, pageOf, params, text } from '../shared/formRecords.js'

export const LANGUAGES = Object.freeze({
  en: Object.freeze({ code: 'en', label: 'English', native: 'English', base: '/salary-certificates', permission: 'HR.SALARY_CERTIFICATES', dir: 'ltr' }),
  ar: Object.freeze({ code: 'ar', label: 'Arabic', native: 'العربية', base: '/salary-certificates-ar', permission: 'HR.SALARY_CERTIFICATES_AR', dir: 'rtl' }),
})
export const TO_MAX = 1000
export const SALARY_KEYS = Object.freeze(['basicSalary', 'housingAllowance', 'transportAllowance', 'commAllowance', 'carAllowance', 'totalSalary'])

const language = (code) => {
  if (!LANGUAGES[code]) throw new ApiError('The selected certificate is invalid.', { code: 'INVALID_ID' })
  return LANGUAGES[code]
}

// "en-12" → { language: 'en', id: '12' }.
export function parseCertificateId(value) {
  const match = /^(en|ar)-([1-9][0-9]{0,18})$/.exec(String(value ?? ''))
  if (!match) throw new ApiError('The selected certificate is invalid.', { code: 'INVALID_ID' })
  return { language: match[1], id: match[2] }
}
export const certificateId = (lang, id) => `${lang}-${id}`

const salaries = (data) => Object.freeze(Object.fromEntries(SALARY_KEYS.map((key) => [key, optionalNumber(data?.[key])])))

export function readEmployee(lang, data) {
  if (!data || !text(data.employeeNo)) throw invalidResponse('employee')
  return Object.freeze({
    employeeNo: text(data.employeeNo),
    // The certificate's own language (the Arabic API returns Arabic in these fields).
    name: text(data.employeeName), nationality: text(data.nationality), jobTitle: text(data.jobTitle),
    // The English values the Arabic lookup also returns (used as a hint under the Arabic text).
    nameOther: lang === 'ar' ? text(data.name) : '', jobTitleOther: lang === 'ar' ? text(data.position) : '',
    nationalIdentifier: text(data.nationalIdentifier), joiningDate: isoDate(data.joiningDate), division: text(data.division),
    allowanceFlag: data.allowanceFlag === 'Yes' ? 'Yes' : 'No',
    ...salaries(data),
  })
}

export function readApprovers(lang, data) {
  if (!Array.isArray(data)) throw invalidResponse('approver list')
  return Object.freeze(data.map((item) => Object.freeze({
    employeeNo: text(item?.employeeNo),
    name: text(lang === 'ar' ? item?.nameAr : item?.name),
    position: text(lang === 'ar' ? item?.positionAr : item?.position),
  })).filter((item) => item.name))
}

export function readCertificate(lang, data) {
  if (!data || !ID.test(String(data.id ?? ''))) throw invalidResponse('salary certificate')
  return Object.freeze({
    certificateId: certificateId(lang, data.id),
    language: lang,
    refNo: text(data.refNo),
    certDate: isoDate(data.certDate),
    toEmpName: text(data.toEmpName),
    approvalName: text(data.approvalName),
    approvalPosition: text(data.positionName),
    status: text(data.status).toUpperCase() || 'DRAFT',
    createdAt: isoDate(data.createdAt),
    employee: readEmployee(lang, { ...data, employeeNo: data.employeeNo }),
  })
}

export function readCertificatePage(lang, data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('salary certificate list')
  return Object.freeze({
    items: Object.freeze(data.items.map((item) => {
      if (!item || !ID.test(String(item.id ?? ''))) throw invalidResponse('salary certificate list')
      return Object.freeze({
        certificateId: certificateId(lang, item.id), language: lang, refNo: text(item.refNo), certDate: isoDate(item.certDate),
        employeeNo: text(item.employeeNo), employeeName: text(item.employeeName), nationality: text(item.nationality),
        nationalIdentifier: text(item.nationalIdentifier), joiningDate: isoDate(item.joiningDate), division: text(item.division),
        totalSalary: optionalNumber(item.totalSalary), toEmpName: text(item.toEmpName), status: text(item.status).toUpperCase(),
        createdAt: isoDate(item.createdAt),
      })
    })),
    pagination: pageOf(data),
  })
}

// Request body (both APIs): joiningDate and allowanceFlag must match the
// employee master; the server rejects a mismatch rather than trusting them.
export function certificateBody(form) {
  return {
    employeeNo: form.employee.employeeNo,
    certDate: form.certDate,
    toEmpName: form.toEmpName.trim(),
    approvalName: form.approvalName,
    allowanceFlag: form.employee.allowanceFlag,
    joiningDate: form.employee.joiningDate,
  }
}

export function validateCertificate(form, { approvers }) {
  const errors = {}
  if (!form.employee) errors.employee = 'Choose the employee.'
  else if (!form.employee.joiningDate) errors.employee = 'This employee has no joining date in the master.'
  if (!form.certDate) errors.certDate = 'Date is required.'
  if (!form.toEmpName.trim()) errors.toEmpName = 'Enter who the certificate is addressed to.'
  else if (form.toEmpName.trim().length > TO_MAX) errors.toEmpName = `Keep it within ${TO_MAX} characters.`
  if (!form.approvalName) errors.approvalName = 'Choose the approver.'
  else if (approvers.filter((item) => item.name === form.approvalName).length !== 1) errors.approvalName = 'Choose the approver from the list.'
  return errors
}

export function createSalaryCertificateService({ client }) {
  const getById = async (value, { signal } = {}) => {
    const { language: lang, id } = parseCertificateId(value)
    return readCertificate(lang, (await client.get(`${language(lang).base}/${id}`, { signal })).data)
  }
  return Object.freeze({
    getById,
    async approvers(lang, { signal } = {}) {
      return readApprovers(lang, (await client.get(`${language(lang).base}/lookups/approvers`, { signal })).data)
    },
    // Employee numbers matching the search (the legacy datalist), in the picker's shape.
    async searchEmployees(lang, search = '', { signal } = {}) {
      const { data } = await client.get(`${language(lang).base}/lookups/employee-numbers`, { params: params({ q: String(search).trim(), pageSize: 20 }), signal })
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      const items = Object.freeze(data.map((item) => text(item?.employeeNo)).filter(Boolean)
        .map((no) => Object.freeze({ employeeId: no, employeeNumber: no, name: no })))
      return Object.freeze({ items, pagination: Object.freeze({ page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }) })
    },
    async employee(lang, employeeNo, { signal } = {}) {
      return readEmployee(lang, (await client.get(`${language(lang).base}/lookups/employees/${encodeURIComponent(employeeNo)}`, { signal })).data)
    },
    async list(lang, { page = 1, pageSize = 25, q, employeeNo, division, from, to, createdFrom, createdTo } = {}, { signal } = {}) {
      const { data } = await client.get(language(lang).base, { params: params({ page, pageSize, q, employeeNo, division, from, to, createdFrom, createdTo }), signal })
      return readCertificatePage(lang, data)
    },
    // Creates (in the chosen language) or updates; returns the stored certificate.
    async save(value, lang, form) {
      if (!value) {
        const { data } = await client.post(language(lang).base, certificateBody(form))
        if (!ID.test(String(data?.id ?? ''))) throw invalidResponse('salary certificate')
        return getById(certificateId(lang, data.id))
      }
      const { language: saved, id } = parseCertificateId(value)
      await client.put(`${language(saved).base}/${id}`, certificateBody(form))
      return getById(value)
    },
  })
}

export const salaryCertificateService = createSalaryCertificateService({ client: apiClient })
