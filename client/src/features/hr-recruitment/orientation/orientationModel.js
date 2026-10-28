// Orientation Schedule (form 1101): the five fixed sessions, days and hours,
// clash and weekend checks, the "Plan it for me" draft and the request body.
// Pure functions on YYYY-MM-DD dates (computed in UTC, so the browser time
// zone never shifts a day). The backend assigns the Ref # and Scheduled by.
import { ORIENTATION_TEXT } from '../hrRecruitmentText.js'
import { isIsoDate } from '../shared/hrFormat.js'

export const ORIENTATION_STATUSES = Object.freeze(['SCHEDULED'])
export const SESSION_KEYS = Object.freeze(['hr', 'safety', 'it', 'tour', 'meet'])
// Friday and Saturday (UTC day numbers of the calendar date).
export const WEEKEND_DAYS = Object.freeze([5, 6])
// "Plan it for me": working-day offset from the first working day, length and times.
export const PLAN = Object.freeze({
  hr: Object.freeze({ day: 0, length: 1, from: '08:00', to: '12:00' }),
  safety: Object.freeze({ day: 1, length: 1, from: '08:00', to: '13:00' }),
  it: Object.freeze({ day: 2, length: 1, from: '09:00', to: '12:00' }),
  tour: Object.freeze({ day: 2, length: 1, from: '13:00', to: '15:00' }),
  meet: Object.freeze({ day: 3, length: 1, from: '10:00', to: '11:00' }),
})
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const utc = (iso) => new Date(`${iso}T00:00:00Z`)
const toIso = (date) => date.toISOString().slice(0, 10)

export function addDays(iso, days) {
  const date = utc(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIso(date)
}
export const isWeekend = (iso) => isIsoDate(iso) && WEEKEND_DAYS.includes(utc(iso).getUTCDay())
export function nextWorkday(iso) {
  if (!isIsoDate(iso)) return ''
  let day = iso
  while (isWeekend(day)) day = addDays(day, 1)
  return day
}
export function addWorkdays(iso, count) {
  let day = nextWorkday(iso)
  for (let index = 0; index < count; index += 1) day = nextWorkday(addDays(day, 1))
  return day
}
export function toMinutes(time) {
  if (!TIME.test(time ?? '')) return null
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Calendar days of a date range: (to − from) + 1; 0 when incomplete or reversed.
export function calendarDays(fromDate, toDate) {
  if (!isIsoDate(fromDate) || !isIsoDate(toDate) || toDate < fromDate) return 0
  return Math.round((utc(toDate) - utc(fromDate)) / 864e5) + 1
}
export const sessionDays = (session) => calendarDays(session.fromDate, session.toDate)
// Orientation time of a session: hours per day × days.
export function sessionHours(session) {
  const start = toMinutes(session.timeFrom)
  const end = toMinutes(session.timeTo)
  if (start === null || end === null || end <= start) return 0
  return ((end - start) / 60) * sessionDays(session)
}
export const totalHours = (sessions) => SESSION_KEYS.reduce((total, key) => total + sessionHours(sessions[key]), 0)
export const formatHours = (hours) => (hours ? `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h` : '—')

export const blankSession = () => ({ headCode: '', fromDate: '', toDate: '', timeFrom: '', timeTo: '', remark: '' })
export const blankOrientation = () => ({ employeeId: '', fromDate: '', sessions: Object.fromEntries(SESSION_KEYS.map((key) => [key, blankSession()])) })
export const isSessionComplete = (session) => Boolean(session.headCode && session.fromDate && session.toDate && session.timeFrom && session.timeTo)
export const plannedCount = (sessions) => SESSION_KEYS.filter((key) => isSessionComplete(sessions[key])).length

// "To" is read-only: the latest session end date.
export function scheduleToDate(sessions) {
  return SESSION_KEYS.map((key) => sessions[key].toDate).filter(isIsoDate).sort().pop() || ''
}

// The draft plan from the first working day, skipping Friday and Saturday;
// an empty department head gets the first suggested head of that session.
export function draftPlan(start, sessions, heads = {}) {
  const first = nextWorkday(start)
  if (!first) return sessions
  return Object.fromEntries(SESSION_KEYS.map((key) => {
    const plan = PLAN[key]
    const fromDate = addWorkdays(first, plan.day)
    return [key, {
      ...sessions[key], fromDate, toDate: addWorkdays(fromDate, plan.length - 1), timeFrom: plan.from, timeTo: plan.to,
      headCode: sessions[key].headCode || heads[key]?.[0]?.code || '',
    }]
  }))
}

const weekdayLabel = (iso) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso))

// Blocking problems ('bad': end before start, end time not after start time,
// two sessions overlapping in date and time) and warnings ('warn': a session
// on Friday/Saturday, before the joining date or before the From date).
export function scheduleIssues(sessions, { joiningDate = '', fromDate = '' } = {}) {
  const text = ORIENTATION_TEXT.issues
  const name = (key) => ORIENTATION_TEXT.sessions[key].short
  const list = []
  for (const key of SESSION_KEYS) {
    const session = sessions[key]
    if (session.fromDate && session.toDate && session.toDate < session.fromDate) list.push({ key, level: 'bad', code: 'END_BEFORE_START', text: text.endBeforeStart(name(key)) })
    const start = toMinutes(session.timeFrom)
    const end = toMinutes(session.timeTo)
    if (start !== null && end !== null && end <= start) list.push({ key, level: 'bad', code: 'TIME_ORDER', text: text.timeOrder(name(key)) })
    if (session.fromDate && joiningDate && session.fromDate < joiningDate) list.push({ key, level: 'warn', code: 'BEFORE_JOINING', text: text.beforeJoining(name(key)) })
    if (session.fromDate && fromDate && session.fromDate < fromDate) list.push({ key, level: 'warn', code: 'BEFORE_WINDOW', text: text.beforeWindow(name(key)) })
    if (isIsoDate(session.fromDate) && isIsoDate(session.toDate) && session.toDate >= session.fromDate) {
      for (let day = session.fromDate; day <= session.toDate; day = addDays(day, 1)) {
        if (isWeekend(day)) {
          list.push({ key, level: 'warn', code: 'WEEKEND', text: text.weekend(name(key), weekdayLabel(day)) })
          break
        }
      }
    }
  }
  for (let i = 0; i < SESSION_KEYS.length; i += 1) {
    for (let j = i + 1; j < SESSION_KEYS.length; j += 1) {
      const a = sessions[SESSION_KEYS[i]]
      const b = sessions[SESSION_KEYS[j]]
      const times = [a.timeFrom, a.timeTo, b.timeFrom, b.timeTo].map(toMinutes)
      if (!(a.fromDate && a.toDate && b.fromDate && b.toDate) || times.includes(null)) continue
      const datesOverlap = a.fromDate <= b.toDate && b.fromDate <= a.toDate
      const timesOverlap = times[0] < times[3] && times[2] < times[1]
      if (datesOverlap && timesOverlap) {
        list.push({ key: SESSION_KEYS[j], level: 'bad', code: 'CLASH', text: text.clash(name(SESSION_KEYS[i]), name(SESSION_KEYS[j])) })
      }
    }
  }
  return list
}

// Save needs Name, From and at least one dated session (so To exists), and no
// blocking problem. Returns the errors and the step to open first.
export function validateOrientation(form, issues = []) {
  const text = ORIENTATION_TEXT.errors
  const errors = {}
  if (!form.employeeId) errors.employeeId = text.employee
  if (!form.fromDate) errors.fromDate = text.from
  if (!scheduleToDate(form.sessions)) errors.toDate = text.to
  const blocking = issues.find((issue) => issue.level === 'bad')
  if (blocking) errors.sessions = blocking.text
  const firstStep = errors.employeeId || errors.fromDate ? 0 : errors.toDate ? 1 : errors.sessions ? 2 : -1
  return { errors, firstStep, valid: firstStep === -1 }
}

export function orientationPayload(form) {
  return {
    employeeId: form.employeeId || null,
    fromDate: form.fromDate || null,
    sessions: Object.fromEntries(SESSION_KEYS.map((key) => {
      const session = form.sessions[key]
      return [key, {
        headCode: session.headCode || null, fromDate: session.fromDate || null, toDate: session.toDate || null,
        timeFrom: session.timeFrom || null, timeTo: session.timeTo || null, remark: session.remark.trim(),
      }]
    })),
  }
}

export function orientationFormFromRecord(record) {
  return {
    employeeId: record.employee.employeeId,
    fromDate: record.fromDate ?? '',
    sessions: Object.fromEntries(SESSION_KEYS.map((key) => {
      const session = record.sessions[key]
      return [key, {
        headCode: session.headCode ?? '', fromDate: session.fromDate ?? '', toDate: session.toDate ?? '',
        timeFrom: session.timeFrom ?? '', timeTo: session.timeTo ?? '', remark: session.remark,
      }]
    })),
  }
}

export const isOrientationLocked = (status) => status === 'SCHEDULED'
