// How security-administration results and failures are explained. Messages
// come from the backend's safe error envelope; reason codes in validation
// details are translated. An unknown outcome is never presented as success
// or as a rejection.
import { isOutcomeUnknown } from '../../services/api/apiClient.js'

const REASONS = Object.freeze({
  EMPLOYEE_NOT_FOUND: 'The employee was not found in the employee master.',
  EMPLOYEE_AMBIGUOUS: 'The employee number appears more than once in the employee master.',
  EMPLOYEE_NOT_CURRENT: 'The employee is not a current employee.',
  EMPLOYEE_TERMINATED: 'The employee has been terminated.',
  USERNAME_MISSING: 'The employee has no login username in the employee master.',
  USERNAME_AMBIGUOUS: 'The employee\'s login username is shared with another employee.',
  PASSWORD_NOT_SET: 'The employee has not set a password yet.',
  PASSWORD_ALREADY_SET: 'A password has already been set for this account.',
  MFA_NOT_ENROLLED: 'The account has no authenticator app enrolled.',
  ACCOUNT_PENDING: 'The account is pending activation.',
  ACCOUNT_ACTIVE: 'The account is already active.',
  ACCOUNT_DISABLED: 'The account is disabled.',
})

// A backend reason code (`EMPLOYEE_TERMINATED`) becomes a sentence; any other
// detail message is already readable and is kept as it is.
const REASON_CODE = /^[A-Z][A-Z0-9_]*$/
export function describeReason(reason) {
  if (typeof reason !== 'string') return ''
  if (REASONS[reason]) return REASONS[reason]
  if (!REASON_CODE.test(reason)) return reason
  const text = reason.toLowerCase().replace(/_+/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Returns { kind, message, details, permissionChanged, sessionEnded }.
export function describeFailure(error) {
  if (isOutcomeUnknown(error)) {
    return {
      kind: 'unknown',
      message: 'The server did not confirm the result. Refresh to check the current state before trying again.',
      details: [],
    }
  }
  const details = (error?.details || []).map((item) => describeReason(item.message) || item.message)
  if (error?.status === 401) {
    return { kind: 'error', message: 'Your session has ended. Sign in again to continue.', details: [], sessionEnded: true }
  }
  if (error?.status === 403 && error.code === 'FORBIDDEN') {
    return { kind: 'error', message: 'You no longer have permission for this action. Your access has been refreshed.', details: [], permissionChanged: true }
  }
  if (error?.status === 429) {
    const wait = Number.isInteger(error.retryAfterSeconds) ? ` Try again in about ${Math.max(1, Math.ceil(error.retryAfterSeconds / 60))} minute(s).` : ''
    return { kind: 'error', message: `${error.message}${wait}`, details: [] }
  }
  if (error?.code === 'ABORTED') return { kind: 'error', message: 'The request was cancelled.', details: [] }
  return { kind: 'error', message: error?.message || 'The request could not be completed.', details }
}

// Local date and time for an ISO instant, or a dash.
export function formatInstant(value) {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
