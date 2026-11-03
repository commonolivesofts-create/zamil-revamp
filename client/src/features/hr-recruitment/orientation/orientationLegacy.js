// Orientation Training (New Hire Training) rules of the legacy CI3 form views/ZPIL/nht-new.php.
// Pure functions on YYYY-MM-DD dates and HH:MM[:SS] times; the server applies the same rules.

// Legacy list labels of the stored statuses (Draft, INPROCESS, Approved, REJECTED, Rejected).
export const ORIENTATION_LEGACY_STATUSES = Object.freeze(['Draft', 'Inprocess', 'Approved', 'Rejected'])
export function orientationStatus(value) {
  const status = String(value ?? '').trim().toUpperCase()
  if (status === 'INPROCESS') return 'Inprocess'
  if (status === 'APPROVED') return 'Approved'
  if (status === 'REJECTED') return 'Rejected'
  return 'Draft'
}
// Saving sets Draft again, so a rejected request can be corrected and re-submitted; a request in
// the workflow or approved is read only.
export const isOrientationEditable = (status) => ['Draft', 'Rejected'].includes(orientationStatus(status))
export const statusTone = (status) => {
  const label = orientationStatus(status)
  return label === 'Rejected' ? 'bad' : label === 'Draft' ? 'warn' : 'ok'
}

// The report variants of the legacy "Select type to view report" list: Shared (Y) and Plant (N).
export const ORIENTATION_FLAGS = Object.freeze(['Y', 'N'])

// Orientation Days: Math.ceil((to - from) / 1 day); the same day is 0. '' while incomplete or
// reversed (legacy wrote "Select To Date").
export function orientationDays(fromDate, toDate) {
  if (!fromDate || !toDate || toDate < fromDate) return ''
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 864e5)
}

const minutesOf = (time) => {
  if (!/^\d{2}:\d{2}/.test(time ?? '')) return null
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}
export const lineMinutes = (line) => {
  const from = minutesOf(line.timeFrom)
  const to = minutesOf(line.timeTo)
  return from === null || to === null || to < from ? 0 : to - from
}
// Orientation Time: `${hours}.${minutes padded} Hrs` (1 h 30 min → "1.30 Hrs").
export function orientationPeriod(timeFrom, timeTo) {
  const from = minutesOf(timeFrom)
  const to = minutesOf(timeTo)
  if (from === null || to === null || to < from) return ''
  const total = to - from
  return `${Math.floor(total / 60)}.${String(total % 60).padStart(2, '0')} Hrs`
}

// Lines whose dates or times run backwards (legacy saved "Select To Date" / "-2.-30 Hrs").
export const reversedLines = (lines) => lines.filter((line) =>
  (line.fromDate && line.toDate && line.toDate < line.fromDate)
  || (minutesOf(line.timeFrom) !== null && minutesOf(line.timeTo) !== null && minutesOf(line.timeTo) < minutesOf(line.timeFrom)))

// Save rules: Name and From are required (legacy `required` and the empty-employee failure);
// every row field is optional.
export function orientationSaveProblems({ employee, fromOrient, lines }) {
  const problems = []
  if (!employee) problems.push('employee')
  if (!fromOrient) problems.push('fromOrient')
  if (!lines.length) problems.push('noLines')
  if (reversedLines(lines).length) problems.push('reversed')
  return problems
}

// Legacy submitWorkflow refuses these statuses ("Cannot Re-initialize Workflow"); Draft and
// Rejected requests may be submitted (again). Not wired: the shared workflow is not built yet.
const NOT_SUBMITTABLE = Object.freeze(['APPROVED', 'ACCEPTED', 'INPROCESS'])
export function validateOrientationForSubmit(record) {
  if (!record?.scheduleId) return ['notSaved']
  return NOT_SUBMITTABLE.includes(String(record.rawStatus ?? record.status ?? '').toUpperCase()) ? ['notSubmittable'] : []
}
