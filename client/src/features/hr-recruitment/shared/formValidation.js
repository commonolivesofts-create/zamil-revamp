const encoder = new TextEncoder()

export const utf8Bytes = (value) => encoder.encode(String(value ?? '')).length

// Saudi keyboards may use either Arabic digit set. Do not strip letters from
// numbers: that would silently change a pasted amount or identifier.
export const normalizeDigits = (value) => String(value ?? '')
  .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/٫/g, '.')

export function numberError(value, { integer = false, min = 0, max, decimals = 2 } = {}) {
  const raw = normalizeDigits(value).trim()
  if (!raw) return ''
  const pattern = integer ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`)
  if (!pattern.test(raw) || !Number.isFinite(Number(raw))) {
    return integer ? 'Enter a whole number using digits only.' : `Enter an amount using digits and up to ${decimals} decimal places.`
  }
  if (Number(raw) < min) return `Enter a value of ${min} or more.`
  if (max !== undefined && Number(raw) > Number(max)) return `Enter a value of ${max} or less.`
  return ''
}

export function phoneError(value) {
  const raw = normalizeDigits(value).trim()
  if (!raw) return ''
  const digits = raw.replace(/[+ ()-]/g, '')
  return /^\+?[\d ()-]+$/.test(raw) && /^\d{7,15}$/.test(digits)
    ? '' : 'Enter a valid phone number, including the country code for an international number.'
}

export function fieldValueError(value, { label = 'This field', maxLength, lengthUnit = 'bytes', numeric, min, max, required = false, phone = false, multiline = false } = {}) {
  if (required && !String(value ?? '').trim()) return `Complete ${label.toLowerCase()}.`
  if (numeric) {
    const message = numberError(value, { integer: numeric === 'numeric', min: min ?? 0, max })
    if (message) return message
  }
  if (phone && phoneError(value)) return phoneError(value)
  if (!maxLength) return ''
  if (lengthUnit === 'characters') return [...String(value ?? '')].length > maxLength ? `Use ${maxLength} characters or fewer for ${label.toLowerCase()}.` : ''
  return textLimitError(value, maxLength, label, { multiline })
}

export const normalizeShortText = (value) => String(value ?? '').replace(/\s+/gu, ' ').trim()

export const normalizeNotes = (value) => String(value ?? '').replace(/\r\n?/gu, '\n').trim()

export function textLimitError(value, maxBytes, label, { multiline = false } = {}) {
  const raw = String(value ?? '')
  const controls = multiline ? raw.replace(/\r\n?/gu, '\n').replace(/\n/gu, '') : raw
  if (/[\p{Cc}]/u.test(controls)) {
    return `${label} contains an unsupported control character.`
  }
  const text = multiline ? normalizeNotes(value) : normalizeShortText(value)
  if (utf8Bytes(text) > maxBytes) {
    return `${label} is too long. Shorten it to fit the ${maxBytes}-byte limit.`
  }
  return ''
}
