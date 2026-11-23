// The Talent Management dashboard's data rules. Pure functions: appraisal and
// nomination figures are counts of their list APIs for the signed-in user;
// the TrainingHub figures summarise what TrainingHub returns for the same
// person (catalog, Job Skills Matrix and team), never more.
import { monthRanges } from '../../hr-recruitment/shared/insightDates.js'

export const YEAR_COUNT = 5
export const GRADES = Object.freeze(['A', 'B', 'C', 'D', 'E'])
// The appraisal policy's forced distribution (performanceAppraisal.service.js).
export const GRADE_POLICY = Object.freeze({ A: 15, B: 30, C: 40, D: 10, E: 5 })
// A team member is "ready" at this readiness (percent of the position's target levels).
export const READY_AT = 80
// Upcoming sessions starting within this many days count as "starting soon".
export const SOON_DAYS = 30

// The selectable appraisal years, newest first, ending with the current year.
export function yearsUpTo(today, count = YEAR_COUNT) {
  const current = Number(today.slice(0, 4))
  return Array.from({ length: count }, (_, index) => current - index)
}

// The inclusive window of a calendar year; the current year ends today.
export function yearRange(year, today) {
  const isCurrent = String(year) === today.slice(0, 4)
  return { from: `${year}-01-01`, to: isCurrent ? today : `${year}-12-31` }
}

// The months of a year for the activity chart: January to the current month,
// or the whole year for a past one.
export function yearMonths(year, today) {
  const isCurrent = String(year) === today.slice(0, 4)
  return isCurrent
    ? monthRanges(today, Number(today.slice(5, 7)))
    : monthRanges(`${year}-12-01`, 12)
}

// Whole percent of `part` in `whole`: undefined while loading, null without a whole.
export const percentOf = (part, whole) =>
  part === undefined || whole === undefined
    ? undefined
    : whole
      ? Math.round((part / whole) * 100)
      : null

const sum = (values) => values.reduce((total, value) => total + value, 0)

// Grades given above their target in the appraiser's quota (calibration).
export function overQuota(stats) {
  if (!stats) return undefined
  return GRADES.filter((grade) => stats.allocated[grade] > stats.target[grade])
}

// Job Skills Matrix: profile status and depth of every position.
export function summarizeMatrix(matrix) {
  const positions = Array.isArray(matrix?.positions) ? matrix.positions : []
  const cells = matrix?.cells && typeof matrix.cells === 'object' ? matrix.cells : {}
  const status = (code) => positions.filter((position) => position.status === code).length
  const skillsOf = (position) => Object.values(cells[position.id] ?? {})
  const profiled = positions.filter((position) => skillsOf(position).length > 0)
  const all = positions.flatMap(skillsOf)
  return Object.freeze({
    positions: positions.length,
    approved: status('APPROVED'),
    pending: status('PENDING'),
    draft: status('DRAFT'),
    returned: status('RETURNED'),
    profiled: profiled.length,
    skills: all.length,
    critical: all.filter((cell) => cell.critical === true).length,
    required: all.filter((cell) => cell.requirement === 'R').length,
  })
}

// Training catalog: upcoming scheduled sessions from today.
export function summarizeCatalog(sessions, today, soonDays = SOON_DAYS) {
  const list = (Array.isArray(sessions) ? sessions : []).filter(
    (session) => session.status === 'SCHEDULED' && session.startDate >= today,
  )
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + soonDays)
  const soonTo = limit.toISOString().slice(0, 10)
  const count = (test) => list.filter(test).length
  const total = (key) => sum(list.map((session) => Number(session[key]) || 0))
  return Object.freeze({
    sessions: list.length,
    soon: count((session) => session.startDate <= soonTo),
    capacity: total('capacity'),
    taken: total('seatsTaken'),
    left: total('seatsLeft'),
    waitlist: total('waitlist'),
    hours: total('hours'),
    full: count((session) => Number(session.seatsLeft) <= 0),
    internal: count((session) => session.sessionType === 'INTERNAL'),
    external: count((session) => session.sessionType === 'EXTERNAL'),
    inPerson: count((session) => session.deliveryMode === 'IN_PERSON'),
    online: count((session) => session.deliveryMode === 'ONLINE'),
    blended: count((session) => session.deliveryMode === 'BLENDED'),
    // Eligibility is checked for the signed-in person only when TrainingHub can.
    eligible: count((session) => session.eligibility?.ok === true),
  })
}

// Team skills: readiness and gaps of the people TrainingHub lists for the user.
export function summarizeTeam(people, readyAt = READY_AT) {
  const list = Array.isArray(people) ? people : []
  const gapsOf = (person) => (Array.isArray(person.gaps) ? person.gaps : [])
  const readiness = list.map((person) => Number(person.readiness) || 0)
  return Object.freeze({
    people: list.length,
    // Readiness points (percent per person) and the most possible, for a share.
    readinessPoints: sum(readiness),
    readinessMax: list.length * 100,
    ready: readiness.filter((value) => value >= readyAt).length,
    withGaps: list.filter((person) => gapsOf(person).length > 0).length,
    atRisk: list.filter((person) => gapsOf(person).some((gap) => gap.critical === true)).length,
    gaps: sum(list.map((person) => gapsOf(person).length)),
    criticalGaps: sum(
      list.map((person) => gapsOf(person).filter((gap) => gap.critical === true).length),
    ),
    neverAssessed: list.filter((person) => !person.lastAssessed).length,
  })
}
