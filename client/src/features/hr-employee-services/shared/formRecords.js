// Shared contract helpers of Reward Nomination, Share an Idea and Sick Leave:
// record status, editability, paging and the response guards. Pure.
import { ApiError } from '../../../services/api/apiClient.js'
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const RECORD_STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED'])
export const STATUS_TEXT = Object.freeze({
  DRAFT: 'Draft', INPROCESS: 'In process', APPROVED: 'Approved', REJECTED: 'Rejected', UNKNOWN: 'Unknown',
})
export const STATUS_TONE = Object.freeze({ DRAFT: 'warn', INPROCESS: 'warn', APPROVED: 'ok', REJECTED: 'bad', UNKNOWN: 'warn' })
export const ID = /^[1-9][0-9]{0,18}$/

// The backends store 'Draft', 'DRAFT', 'INPROCESS', 'Inprocess'… An unknown
// value is never treated as a draft (it would become editable).
export function normalizeStatus(value) {
  const status = String(value ?? '').replace(/\s+/g, '').toUpperCase()
  return RECORD_STATUSES.includes(status) ? status : 'UNKNOWN'
}

// Owner decision (2026-11-02): drafts and rejected requests can be changed;
// in-process and approved ones are read-only (the backends answer 409).
export const isEditable = (status) => status === 'DRAFT' || status === 'REJECTED'

export const invalidResponse = (what) =>
  new ApiError(`The server returned an unexpected ${what}.`, { code: 'INVALID_RESPONSE' })

export const text = (value) => (value == null ? '' : String(value))
// Dates travel as YYYY-MM-DD strings end to end; anything else is blank.
export const isoDate = (value) => (typeof value === 'string' && isIsoDate(value.slice(0, 10)) ? value.slice(0, 10) : '')
export const optionalNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// The apiClient pagination shape, from the { items, page, pageSize, total } data the
// ideas and sick leave lists return.
export function pageOf({ page, pageSize, total }) {
  if (![page, pageSize, total].every((value) => Number.isInteger(value) && value >= 0) || pageSize < 1) {
    throw invalidResponse('page')
  }
  const totalPages = Math.ceil(total / pageSize)
  return Object.freeze({
    page, limit: pageSize, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1,
  })
}

// Query parameters without blank values.
export const params = (values) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''))

export const segment = (value) => {
  if (!ID.test(String(value ?? ''))) throw new ApiError('The selected record is invalid.', { code: 'INVALID_ID' })
  return String(value)
}
