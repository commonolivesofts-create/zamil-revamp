const encoder = new TextEncoder()

export const utf8Bytes = (value) => encoder.encode(String(value ?? '')).length

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
