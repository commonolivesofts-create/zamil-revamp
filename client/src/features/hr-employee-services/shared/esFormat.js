// Formatting and list helpers of the HR employee services. Pure functions.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

// The date in Arabic on the Umm al-Qura (Hijri) calendar, e.g. for the form
// header; '' for an invalid date. Calendar dates are taken as UTC so the
// browser's time zone never moves them.
export function hijriDate(iso) {
  if (!isIsoDate(iso)) return ''
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`))
}

// Status tab counts: [['ALL', n], [status, n], ...].
export function statusCounts(rows, statuses) {
  return [['ALL', rows.length], ...statuses.map((status) => [status, rows.filter((row) => row.status === status).length])]
}

// Rows of a list view: status tab, then a case-insensitive search over
// `searchText(row)`, then the sort ({ key, dir: 1 | -1 }, nulls last).
export function filterAndSort(rows, { status = 'ALL', search = '', searchText, sort, valueFor = (row, key) => row[key] }) {
  const term = search.trim().toLocaleLowerCase()
  const kept = rows
    .filter((row) => status === 'ALL' || row.status === status)
    .filter((row) => !term || searchText(row).toLocaleLowerCase().includes(term))
  if (!sort) return kept
  return [...kept].sort((a, b) => {
    const x = valueFor(a, sort.key)
    const y = valueFor(b, sort.key)
    if (x === y) return 0
    if (x === null || x === undefined) return 1
    if (y === null || y === undefined) return -1
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
  })
}

// Clicking the sorted column reverses it; another column sorts ascending.
export const nextSort = (sort, key) => (sort?.key === key ? { key, dir: -sort.dir } : { key, dir: 1 })
export const ariaSort = (sort, key) => (sort?.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none')
