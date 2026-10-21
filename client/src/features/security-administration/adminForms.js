// Client-side checks mirroring the backend Joi schemas (users.validation.js,
// rbac.validation.js), so obvious mistakes are explained before a request is
// sent. The backend validates again and its result is authoritative.
import { CODE_PATTERN } from './securityAdminContract.js'

const CONTROL_CHARACTERS = /\p{Cc}/u
const EMPLOYEE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

// aria attributes for an input rendered inside <Field>.
export const fieldProps = (id, { hint, error } = {}) => ({
  id,
  'aria-invalid': Boolean(error),
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
})

// Search terms: 2–100 characters, no control characters (or empty for no search).
export function checkSearch(value) {
  const term = String(value ?? '').trim()
  if (!term) return { term: '', error: null }
  if (term.length < 2) return { term, error: 'Enter at least 2 characters.' }
  if (term.length > 100 || CONTROL_CHARACTERS.test(term)) return { term, error: 'Enter at most 100 characters.' }
  return { term, error: null }
}

export function checkCode(value, max, label = 'Code') {
  if (!value) return `${label} is required.`
  if (value.length > max) return `${label} must be at most ${max} characters.`
  if (!CODE_PATTERN.test(value)) return `${label} must use upper-case letters, digits and underscores, starting with a letter.`
  return null
}

export function checkName(value, label = 'Name') {
  const name = String(value ?? '').trim()
  if (!name) return `${label} is required.`
  if (name.length > 120) return `${label} must be at most 120 characters.`
  if (CONTROL_CHARACTERS.test(name)) return `${label} contains characters that are not allowed.`
  return null
}

export function checkDescription(value, label = 'Description') {
  const text = String(value ?? '').trim()
  if (text.length > 500) return `${label} must be at most 500 characters.`
  return null
}

// Optional description: trimmed text, or null when empty.
export const descriptionValue = (value) => String(value ?? '').trim() || null

export function checkJustification(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'A justification is required.'
  if (text.length > 500) return 'The justification must be at most 500 characters.'
  if (CONTROL_CHARACTERS.test(text)) return 'The justification contains characters that are not allowed.'
  return null
}

export function checkEmployeeNumber(value) {
  const text = String(value ?? '').trim()
  if (!text) return 'Enter the employee number.'
  if (text.length > 30 || !EMPLOYEE_NUMBER.test(text)) return 'Enter a valid employee number.'
  return null
}

// `datetime-local` input → ISO instant in the future, or null when empty.
export function readFutureInstant(value, now = Date.now()) {
  if (!value) return { value: null, error: null }
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return { value: null, error: 'Enter a valid date and time.' }
  if (time <= now) return { value: null, error: 'The expiry must be in the future.' }
  return { value: new Date(time).toISOString(), error: null }
}
