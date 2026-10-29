// Dates, numbers and initials for the recruitment forms. Calendar dates are
// plain YYYY-MM-DD values in KSA business time (Asia/Riyadh); nothing here
// depends on the browser's time zone.
const BUSINESS_TIME_ZONE = 'Asia/Riyadh'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const isIsoDate = (value) => typeof value === 'string' && ISO_DATE.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

// Today's calendar date in KSA business time.
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const utc = (iso) => new Date(`${iso}T00:00:00Z`)

export function enDate(iso) {
  if (!isIsoDate(iso)) return ''
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(utc(iso))
}

export function arDate(iso) {
  if (!isIsoDate(iso)) return ''
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(iso))
}

// Whole days from `today` to `iso` (negative in the past), or null.
export function daysBetween(today, iso) {
  if (!isIsoDate(today) || !isIsoDate(iso)) return null
  return Math.round((utc(iso) - utc(today)) / 864e5)
}

// A plain non-negative amount ("4500", "4,500", "4500.50"), or null.
export function toAmount(value) {
  return /^\s*\d[\d,]*(\.\d+)?\s*$/.test(value ?? '') ? Number(String(value).replace(/,/g, '')) : null
}

export function initials(name, fallback = '?') {
  const text = String(name ?? '').trim()
  if (!text) return fallback
  return text.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase()
}

export const formatAmount = (value) => Number(value || 0).toLocaleString('en-US')

// Page titles animate per character but wrap only between words: each word is
// one unbreakable group. `start` is the animation index of the word's first
// character (the spaces between words count, so the stagger is unchanged).
export function titleWords(title) {
  let start = 0
  return String(title ?? '').split(' ').map((text) => {
    const word = { text, start }
    start += text.length + 1
    return word
  })
}
