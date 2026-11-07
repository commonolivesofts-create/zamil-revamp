// The Business Visa Request report also shows the legacy workflow's ACCEPTED
// status (the shared record statuses do not, so a letter form cannot silently
// accept it). Accepted requests are read-only, like in-process and approved.
import {
  RECORD_STATUSES,
  STATUS_TEXT,
  STATUS_TONE,
  normalizeStatus,
} from '../shared/formRecords.js'

export const REQUEST_STATUSES = Object.freeze([...RECORD_STATUSES, 'ACCEPTED'])
export const REQUEST_STATUS_TEXT = Object.freeze({ ...STATUS_TEXT, ACCEPTED: 'Accepted' })
export const REQUEST_STATUS_TONE = Object.freeze({ ...STATUS_TONE, ACCEPTED: 'ok' })

export function normalizeRequestStatus(value) {
  const status = String(value ?? '').replace(/\s+/g, '').toUpperCase()
  return REQUEST_STATUSES.includes(status) ? status : normalizeStatus(value)
}
