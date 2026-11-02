// Business rules of Sick Leave (form 1076). Legacy and backend rules: employee
// (self or a direct report), From and To required, To not before From, number
// of days = calendar days inclusive (a half first or last day counts 0.5; on a
// single date both day types must match), comments required (≤ 2000), at
// least one attachment on a new request (the backend's file types, ≤ 10 MB,
// ≤ 10 files). Kept from the prototype as new rules: requests up to 30 days
// back, no overlap with the employee's other requests, the working days
// (Friday and Saturday off) and the back-to-work date (display only).
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const COMMENTS_MAX = 2000
export const BACK_DAYS = 30
export const MAX_FILES = 10
export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const FILE_EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'gif', 'txt', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'csv', 'html', 'ppt', 'pptx', 'odt', 'xml'])
export const WEEKEND = Object.freeze([5, 6]) // Friday, Saturday (UTC day of a YYYY-MM-DD date)

const DAY = 86400000
const time = (iso) => Date.parse(`${iso}T00:00:00Z`)
export const addDays = (iso, days) => new Date(time(iso) + days * DAY).toISOString().slice(0, 10)
export const isWeekend = (iso) => WEEKEND.includes(new Date(time(iso)).getUTCDay())

// The backend's calculation (sickLeave.service.js calculateDays).
export function leaveDays({ fromDate, toDate, fromDayType, toDayType }) {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate) || toDate < fromDate) return 0
  if (fromDate === toDate) return fromDayType === 'HALF' ? 0.5 : 1
  return Math.round((time(toDate) - time(fromDate)) / DAY) + 1 - (fromDayType === 'HALF' ? 0.5 : 0) - (toDayType === 'HALF' ? 0.5 : 0)
}

export function workingDays(fromDate, toDate) {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate) || toDate < fromDate) return 0
  let count = 0
  for (let day = fromDate; day <= toDate; day = addDays(day, 1)) if (!isWeekend(day)) count += 1
  return count
}

// Next working day after the last day of leave.
export function backToWork(toDate) {
  if (!isIsoDate(toDate)) return ''
  let day = addDays(toDate, 1)
  while (isWeekend(day)) day = addDays(day, 1)
  return day
}

// Another request of the same employee whose dates overlap (rejected ones do not count).
export function overlapOf(existing, { leaveId, fromDate, toDate }) {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) return null
  return existing.find((item) => item.leaveId !== leaveId && item.status !== 'REJECTED' && item.fromDate <= toDate && fromDate <= item.toDate) ?? null
}

export const extensionOf = (name) => String(name ?? '').split('.').pop().toLowerCase()
export const badFile = (file) => !FILE_EXTENSIONS.includes(extensionOf(file.fileName)) || file.sizeBytes > MAX_FILE_BYTES || file.sizeBytes === 0

export function validateSickLeave(form, { isNew, today, overlap }) {
  const errors = {}
  if (!form.employee) errors.employee = 'Choose the employee.'
  if (!form.fromDate) errors.fromDate = 'From date is required.'
  else if (!isIsoDate(form.fromDate)) errors.fromDate = 'Enter a valid date.'
  else if (isNew && today && form.fromDate < addDays(today, -BACK_DAYS)) errors.fromDate = `Sick leave can be requested up to ${BACK_DAYS} days back.`
  if (!form.toDate) errors.toDate = 'To date is required.'
  else if (!isIsoDate(form.toDate)) errors.toDate = 'Enter a valid date.'
  else if (form.fromDate && form.toDate < form.fromDate) errors.toDate = 'To date cannot be before From date.'
  else if (overlap) errors.toDate = `These dates overlap request ${overlap.leaveId} (${overlap.fromDate} – ${overlap.toDate}).`
  if (form.fromDate && form.fromDate === form.toDate && form.fromDayType !== form.toDayType) {
    errors.toDayType = 'On a single date the first and last day types must match.'
  }
  if (!form.comments.trim()) errors.comments = 'Comments are required.'
  else if (form.comments.length > COMMENTS_MAX) errors.comments = `Keep the comments within ${COMMENTS_MAX} characters.`
  const bad = form.files.find(badFile)
  if (isNew && !form.files.length) errors.files = 'Attach the medical certificate (at least one file).'
  else if (bad) errors.files = `Remove ${bad.fileName}: only ${FILE_EXTENSIONS.join(', ')} files up to 10 MB are accepted.`
  else if (form.files.length > MAX_FILES) errors.files = `Attach at most ${MAX_FILES} files at a time.`
  return errors
}

export const stepOfErrors = (errors) =>
  (['employee', 'fromDate', 'toDate', 'toDayType'].some((key) => errors[key]) ? 0 : errors.files ? 1 : 2)
