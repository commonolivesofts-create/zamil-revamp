// Dates, numbers and initials for the recruitment forms. Calendar dates are
// plain YYYY-MM-DD values in KSA business time (Asia/Riyadh); nothing here
// depends on the browser's time zone.
const BUSINESS_TIME_ZONE = 'Asia/Riyadh'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

// Today's calendar date in KSA business time.
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const date = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${date.year}-${date.month}-${date.day}`
}

// The current clock time in KSA business time, as HH:mm. Assessments record
// this automatically; users never type it.
export function businessNowTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const time = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${time.hour}:${time.minute}`
}

const utc = (iso) => new Date(`${iso}T00:00:00Z`)

export function enDate(iso) {
  if (!isIsoDate(iso)) return ''
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc(iso))
}

const ARABIC_DIGITS = Object.freeze(['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'])

// Arabic-Indic digits for the ASCII digits in a value. Everything else
// (separators, currency, words) is left untouched.
export function arabicDigits(value) {
  return String(value ?? '').replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)])
}

// A Gregorian (English calendar) date written with Arabic-Indic digits:
// 2026-11-20 → ٢٠/١١/٢٠٢٦. The day, month and year never change; only their
// numerals are localized. This deliberately avoids the Hijri calendar.
export function arDate(iso) {
  if (!isIsoDate(iso)) return ''
  const [year, month, day] = iso.split('-')
  return `${arabicDigits(day)}/${arabicDigits(month)}/${arabicDigits(year)}`
}

// Whole days from `today` to `iso` (negative in the past), or null.
export function daysBetween(today, iso) {
  if (!isIsoDate(today) || !isIsoDate(iso)) return null
  return Math.round((utc(iso) - utc(today)) / 864e5)
}

// A plain non-negative amount ("4500", "4,500", "4500.50"), or null.
export function toAmount(value) {
  return /^\s*\d[\d,]*(\.\d+)?\s*$/.test(value ?? '')
    ? Number(String(value).replace(/,/g, ''))
    : null
}

export function initials(name, fallback = '?') {
  const text = String(name ?? '').trim()
  if (!text) return fallback
  return text
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export const formatAmount = (value) => Number(value || 0).toLocaleString('en-US')

// Page titles animate per character but wrap only between words: each word is
// one unbreakable group. `start` is the animation index of the word's first
// character (the spaces between words count, so the stagger is unchanged).
export function titleWords(title) {
  let start = 0
  return String(title ?? '')
    .split(' ')
    .map((text) => {
      const word = { text, start }
      start += text.length + 1
      return word
    })
}
