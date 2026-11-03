// Calendar windows for the report overviews. Dates are plain YYYY-MM-DD values
// in KSA business time (see hrFormat.js); every window is inclusive.
const pad = (value) => String(value).padStart(2, '0')
const utc = (iso) => new Date(`${iso}T00:00:00Z`)
const isoOf = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function addDays(iso, days) {
  const date = utc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return isoOf(date)
}

export const shortDay = (iso) => DAY.format(utc(iso))

// The `count` calendar months up to today's, oldest first: { key, label, from, to }.
export function monthRanges(today, count) {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const first = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    return { key: isoOf(first), label: MONTH.format(first), year: first.getUTCFullYear(), from: isoOf(first), to: isoOf(last) }
  })
}

// `count` consecutive windows of `size` days; backwards ending today (oldest
// first) or forwards starting today.
export function dayWindows(today, size, count, { forward = false } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const from = forward ? addDays(today, index * size) : addDays(today, -size * (count - index) + 1)
    return { key: from, label: shortDay(from), from, to: addDays(from, size - 1) }
  })
}

// The window limited to the report's own date filter, or null when they do not overlap.
export function clampRange({ from, to }, { dateFrom, dateTo } = {}) {
  const start = dateFrom && dateFrom > from ? dateFrom : from
  const end = dateTo && dateTo < to ? dateTo : to
  return start > end ? null : { from: start, to: end }
}
