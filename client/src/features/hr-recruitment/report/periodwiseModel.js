// Periodwise Employees report: who was attached to a department during a
// period, their age and service, flags, KPIs, chart groupings, table filters,
// sorting and the CSV export. Pure functions on YYYY-MM-DD dates (UTC).
import { REPORT_TEXT } from '../hrRecruitmentText.js'
import { isIsoDate } from '../shared/hrFormat.js'

export const ALL_DEPARTMENTS = 'ALL'
export const RETIREMENT_AGE = 60
export const MINIMUM_AGE = 16
export const PAGE_SIZE = 25
export const SAUDI = 'Saudi'
// [label key, minimum age, maximum age] of the active employees' age bands.
export const AGE_BANDS = Object.freeze([
  Object.freeze(['UNDER_30', 0, 29]), Object.freeze(['30_39', 30, 39]), Object.freeze(['40_49', 40, 49]),
  Object.freeze(['50_59', 50, 59]), Object.freeze(['60_PLUS', 60, 200]),
])
export const FLAGS = Object.freeze({ BIRTH_DATE: 'BIRTH_DATE', NATIONAL_ID: 'NATIONAL_ID' })

const utc = (iso) => new Date(`${iso}T00:00:00Z`)

// Completed years on `on`.
export function ageOn(birthDate, on) {
  if (!isIsoDate(birthDate) || !isIsoDate(on)) return null
  const birth = utc(birthDate)
  const day = utc(on)
  let age = day.getUTCFullYear() - birth.getUTCFullYear()
  if (day.getUTCMonth() < birth.getUTCMonth() || (day.getUTCMonth() === birth.getUTCMonth() && day.getUTCDate() < birth.getUTCDate())) age -= 1
  return age
}

// Years between two dates (365.25-day years), 2 decimals; 0 when reversed.
export function yearsBetween(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return 0
  return Math.round(((utc(to) - utc(from)) / (365.25 * 864e5)) * 100) / 100
}

// Included when start ≤ To and (no end date or end ≥ From).
export const inPeriod = (row, { from, to }) => row.startDate <= to && (!row.endDate || row.endDate >= from)

// Rows of the period with age (today), service (start to the earlier of end and
// To), active, 60+ and "needs checking" flags (missing national ID, age under 16).
export function runReport(rows, params, today) {
  return rows
    .filter((row) => (params.department === ALL_DEPARTMENTS || row.departmentCode === params.department) && inPeriod(row, params))
    .map((row) => {
      const age = ageOn(row.birthDate, today)
      const flags = []
      if (age !== null && age < MINIMUM_AGE) flags.push(FLAGS.BIRTH_DATE)
      if (!row.nationalId) flags.push(FLAGS.NATIONAL_ID)
      return {
        ...row, age,
        years: yearsBetween(row.startDate, row.endDate && row.endDate < params.to ? row.endDate : params.to),
        active: !row.endDate || row.endDate > params.to,
        senior: age !== null && age >= RETIREMENT_AGE,
        flags,
      }
    })
}

const average = (rows, key) => (rows.length ? rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length : 0)
const oneDecimal = (value) => Math.round(value * 10) / 10

// KPIs. Turnover = leavers ÷ average of period headcount and active headcount.
export function summarise(rows, { from, to }) {
  const active = rows.filter((row) => row.active)
  const joiners = rows.filter((row) => row.startDate >= from && row.startDate <= to)
  const leavers = rows.filter((row) => row.endDate && row.endDate >= from && row.endDate <= to)
  const averageHeadcount = (rows.length + active.length) / 2 || 1
  return {
    total: rows.length,
    active: active.length,
    joiners: joiners.length,
    leavers: leavers.length,
    turnover: oneDecimal((leavers.length / averageHeadcount) * 100),
    saudization: active.length ? oneDecimal((active.filter((row) => row.nationality === SAUDI).length / active.length) * 100) : 0,
    averageAge: oneDecimal(average(active.filter((row) => row.age !== null && row.age >= MINIMUM_AGE), 'age')),
    senior: active.filter((row) => row.senior).length,
    averageService: oneDecimal(average(active, 'years')),
    flagged: rows.filter((row) => row.flags.length).length,
  }
}

// [value, count], largest first (ties by value).
export function groupCount(rows, key) {
  const counts = new Map()
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}

export const inBand = (age, band) => age !== null && age >= band[1] && age <= band[2]
export const ageBandCounts = (activeRows) => AGE_BANDS.map((band) => [band[0], activeRows.filter((row) => inBand(row.age, band)).length])

// Joiners and leavers per year for the 6 years up to `year`.
export function yearlyFlow(rows, year) {
  return Array.from({ length: 6 }, (_, index) => {
    const label = String(year - 5 + index)
    return [label, rows.filter((row) => row.startDate.startsWith(label)).length, rows.filter((row) => row.endDate?.startsWith(label)).length]
  })
}

// Table filters: search, status (all, active, left), chart filters and "needs checking".
export function filterRows(rows, { search = '', status = 'all', nationality = '', department = '', band = '', flagged = false } = {}) {
  const term = search.trim().toLowerCase()
  const ageBand = AGE_BANDS.find((item) => item[0] === band)
  return rows.filter((row) => (status === 'all' || (status === 'active' ? row.active : !row.active))
    && (!nationality || row.nationality === nationality) && (!department || row.departmentCode === department)
    && (!ageBand || inBand(row.age, ageBand)) && (!flagged || row.flags.length > 0)
    && (!term || `${row.employeeNumber} ${row.name} ${row.nationalId ?? ''} ${row.job} ${row.departmentName}`.toLowerCase().includes(term)))
}

// Stable sort by a column; empty values sort first ascending.
export function sortRows(rows, { key, direction }) {
  const value = (row) => row[key] ?? ''
  return rows
    .map((row, index) => [row, index])
    .sort(([a, i], [b, j]) => {
      const x = value(a)
      const y = value(b)
      const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })
      return order * direction || i - j
    })
    .map(([row]) => row)
}

export function validateParams({ from, to }) {
  const text = REPORT_TEXT.errors
  const errors = {}
  if (!from) errors.from = text.from
  if (!to) errors.to = text.to
  if (from && to && to < from) errors.to = text.toBeforeFrom
  return errors
}

// Quick periods ending today: this year, the last 12 months, since 2000.
export function quickRanges(today) {
  const lastYear = utc(today)
  lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1)
  return {
    THIS_YEAR: [`${today.slice(0, 4)}-01-01`, today],
    LAST_12_MONTHS: [lastYear.toISOString().slice(0, 10), today],
    SINCE_2000: ['2000-01-01', today],
  }
}

// CSV: quoted when needed; a cell that would start a spreadsheet formula
// (=, +, -, @, tab, carriage return) is prefixed with an apostrophe.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// `columns`: [{ label, value(row, index) }]; CRLF line ends for spreadsheet tools.
export function toCsv(rows, columns) {
  return [columns.map((column) => csvCell(column.label)).join(','), ...rows.map((row, index) => columns.map((column) => csvCell(column.value(row, index))).join(','))].join('\r\n')
}

// UTF-8 byte order mark, so spreadsheet tools read Arabic and accented text correctly.
export const CSV_BOM = String.fromCharCode(0xfeff)
export const withBom = (csv) => `${CSV_BOM}${csv}`

export const csvFileName =({ department, from, to }) => `periodwise_employees_${String(department).replace(/\W+/g, '_')}_${from}_${to}.csv`
