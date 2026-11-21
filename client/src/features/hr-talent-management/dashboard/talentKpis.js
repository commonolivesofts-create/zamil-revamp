// The Talent Management scorecard: every KPI of the five areas, computed from
// the figures the dashboard already loads (no extra requests). Pure functions.
//
// A KPI is { key, area, icon, label, hint, value, unit, target?, better?,
// status?, detail? }: `value` is undefined while loading and null when there
// is nothing to measure; `unit` is 'percent', 'count', 'decimal' or 'text';
// `better` is 'up' or 'down' (which side of `target` is good). Targets are the
// organisation's working goals (TARGETS) and can be tuned there.
import { GRADES, GRADE_POLICY, percentOf } from './talentDashboardModel.js'

export const TARGETS = Object.freeze({
  appraisalApproval: 90,
  pendingShare: 20,
  calibration: 85,
  teamCoverage: 100,
  nominationApproval: 70,
  profileApproval: 80,
  skillsDefined: 90,
  seatFill: 75,
  waitlistPressure: 10,
  digitalDelivery: 30,
  readiness: 75,
  readyShare: 60,
  neverAssessed: 10,
})

// Within this many points of the target counts as "watch" rather than "act".
const WATCH_MARGIN = 10

export const AREAS = Object.freeze(['appraisals', 'rewards', 'matrix', 'catalog', 'team'])

const sum = (...values) =>
  values.some((value) => value === undefined) ? undefined : values.reduce((a, b) => a + b, 0)
const ratio = (part, whole, digits = 1) =>
  part === undefined || whole === undefined
    ? undefined
    : whole
      ? Math.round((part / whole) * 10 ** digits) / 10 ** digits
      : null

// 'good', 'watch' or 'act' for a value against its target; undefined without one.
export function statusOf(value, target, better = 'up') {
  if (value === undefined || value === null || target === undefined) return undefined
  const gap = better === 'up' ? value - target : target - value
  if (gap >= 0) return 'good'
  return gap >= -WATCH_MARGIN ? 'watch' : 'act'
}

// How closely the grades given follow the policy distribution: 100 minus half
// the summed absolute gaps (the overlap of the two distributions), in percent.
export function calibration(counts) {
  if (!counts || GRADES.some((grade) => counts[grade] === undefined)) return undefined
  const total = GRADES.reduce((acc, grade) => acc + counts[grade], 0)
  if (!total) return null
  const gaps = GRADES.reduce(
    (acc, grade) => acc + Math.abs((counts[grade] / total) * 100 - GRADE_POLICY[grade]),
    0,
  )
  return Math.round(100 - gaps / 2)
}

// The month with most nominations: { label, value } (null without any).
export function bestMonth(months, values) {
  if (!values) return undefined
  const top = Math.max(0, ...values)
  if (!top) return null
  const index = values.indexOf(top)
  return { label: `${months[index].label} ${months[index].year}`, value: top }
}

// Whole-percent change of the last month against the one before (current year).
export function momentum(values) {
  if (!values) return undefined
  if (values.length < 2) return null
  const [before, last] = values.slice(-2)
  if (!before) return last ? null : 0
  return Math.round(((last - before) / before) * 100)
}

const kpi = (fields) => {
  const status =
    fields.target === undefined ? undefined : statusOf(fields.value, fields.target, fields.better)
  return Object.freeze({ unit: 'count', better: 'up', ...fields, status })
}

/**
 * Every KPI the user may see. `data` holds the dashboard's loaded figures:
 * { appraisals, teamStats, rewards, rewardMonths, months, matrix, catalog, team,
 *   isCurrent } (undefined while loading; an area is left out when `can` is false).
 */
export function buildScorecard(can, data) {
  const a = data.appraisals ?? {}
  const g = a.grades
  const ts = data.teamStats
  const r = data.rewards ?? {}
  const rs = r.status ?? {}
  const mx = data.matrix
  const ct = data.catalog
  const tm = data.team
  const graded = g ? sum(...GRADES.map((grade) => g[grade])) : undefined
  const decided = sum(a.approved, a.rejected)
  const appraised = ts ? GRADES.reduce((acc, grade) => acc + ts.allocated[grade], 0) : undefined
  const months = data.rewardMonths
  const best = bestMonth(data.months ?? [], months)
  const list = []

  if (can.appraisals) {
    list.push(
      kpi({
        key: 'appraisals',
        area: 'appraisals',
        icon: 'star',
        label: 'Appraisals recorded',
        value: a.total,
        hint: 'This year',
      }),
      kpi({
        key: 'appraisalApproval',
        area: 'appraisals',
        icon: 'circle-check',
        label: 'Approval rate',
        unit: 'percent',
        value: percentOf(a.approved, decided),
        target: TARGETS.appraisalApproval,
        hint: 'Approved of decided',
      }),
      kpi({
        key: 'pendingShare',
        area: 'appraisals',
        icon: 'hourglass',
        label: 'Waiting for approval',
        unit: 'percent',
        value: percentOf(a.inApproval, a.total),
        target: TARGETS.pendingShare,
        better: 'down',
        hint: 'Share still in approval',
      }),
      kpi({
        key: 'highPerformers',
        area: 'appraisals',
        icon: 'trophy',
        label: 'High performers',
        unit: 'percent',
        value: percentOf(sum(g?.A, g?.B), graded),
        detail: `Policy ${GRADE_POLICY.A + GRADE_POLICY.B}%`,
        hint: 'Grades A and B',
      }),
      kpi({
        key: 'developmentFocus',
        area: 'appraisals',
        icon: 'life-buoy',
        label: 'Development focus',
        unit: 'percent',
        value: percentOf(sum(g?.D, g?.E), graded),
        detail: `Policy ${GRADE_POLICY.D + GRADE_POLICY.E}%`,
        hint: 'Grades D and E',
      }),
      kpi({
        key: 'calibration',
        area: 'appraisals',
        icon: 'scale',
        label: 'Calibration accuracy',
        unit: 'percent',
        value: calibration(g),
        target: TARGETS.calibration,
        hint: 'Grade mix matching the policy',
      }),
    )
    if (data.isCurrent && ts?.totalEmployees > 0)
      list.push(
        kpi({
          key: 'teamCoverage',
          area: 'appraisals',
          icon: 'user-round-check',
          label: 'Team appraised',
          unit: 'percent',
          value: percentOf(appraised, ts.totalEmployees),
          target: TARGETS.teamCoverage,
          detail: `${appraised} of ${ts.totalEmployees}`,
          hint: 'Your team this year',
        }),
      )
  }
  if (can.rewards) {
    list.push(
      kpi({
        key: 'nominations',
        area: 'rewards',
        icon: 'award',
        label: 'Nominations',
        value: r.total,
        hint: 'This year',
      }),
      kpi({
        key: 'nominationApproval',
        area: 'rewards',
        icon: 'badge-check',
        label: 'Nomination approval',
        unit: 'percent',
        value: percentOf(rs.APPROVED, sum(rs.APPROVED, rs.REJECTED)),
        target: TARGETS.nominationApproval,
        hint: 'Approved of decided',
      }),
      kpi({
        key: 'monthlyPace',
        area: 'rewards',
        icon: 'activity',
        label: 'Monthly pace',
        unit: 'decimal',
        value: months
          ? ratio(
              months.reduce((x, y) => x + y, 0),
              months.length,
            )
          : undefined,
        hint: 'Nominations per month',
      }),
      kpi({
        key: 'bestMonth',
        area: 'rewards',
        icon: 'flame',
        label: 'Best month',
        unit: 'text',
        value: best === undefined ? undefined : best === null ? null : best.label,
        detail: best ? `${best.value} nominations` : undefined,
        hint: 'Most nominations',
      }),
      kpi({
        key: 'productionShare',
        area: 'rewards',
        icon: 'factory',
        label: 'From production',
        unit: 'percent',
        value: percentOf(r.production, r.total),
        hint: 'Share of nominations',
      }),
      kpi({
        key: 'nominationDrafts',
        area: 'rewards',
        icon: 'file-pen-line',
        label: 'Drafts not submitted',
        value: rs.DRAFT,
        target: 0,
        better: 'down',
        hint: 'Waiting on the nominator',
      }),
    )
    if (data.isCurrent)
      list.push(
        kpi({
          key: 'momentum',
          area: 'rewards',
          icon: 'trending-up',
          label: 'Monthly momentum',
          unit: 'percent',
          value: momentum(months),
          signed: true,
          hint: 'This month vs last month',
        }),
      )
  }
  if (can.matrix) {
    list.push(
      kpi({
        key: 'positions',
        area: 'matrix',
        icon: 'grid-3x3',
        label: 'Positions mapped',
        value: mx?.positions,
        hint: 'In the skills matrix',
      }),
      kpi({
        key: 'profileApproval',
        area: 'matrix',
        icon: 'badge-check',
        label: 'Profiles approved',
        unit: 'percent',
        value: percentOf(mx?.approved, mx?.positions),
        target: TARGETS.profileApproval,
        hint: 'Approved skill profiles',
      }),
      kpi({
        key: 'skillsDefined',
        area: 'matrix',
        icon: 'list-checks',
        label: 'Skills defined',
        unit: 'percent',
        value: percentOf(mx?.profiled, mx?.positions),
        target: TARGETS.skillsDefined,
        hint: 'Positions with skills',
      }),
      kpi({
        key: 'skillsPerProfile',
        area: 'matrix',
        icon: 'layers',
        label: 'Skills per profile',
        unit: 'decimal',
        value: ratio(mx?.skills, mx?.profiled),
        hint: 'Average depth',
      }),
      kpi({
        key: 'criticalShare',
        area: 'matrix',
        icon: 'shield-alert',
        label: 'Critical skills',
        unit: 'percent',
        value: percentOf(mx?.critical, mx?.skills),
        hint: 'Of all required skills',
      }),
      kpi({
        key: 'profilesPending',
        area: 'matrix',
        icon: 'clipboard-check',
        label: 'Awaiting HR approval',
        value: mx?.pending,
        hint: 'Skill profiles',
      }),
    )
  }
  if (can.catalog) {
    list.push(
      kpi({
        key: 'sessions',
        area: 'catalog',
        icon: 'calendar-days',
        label: 'Upcoming sessions',
        value: ct?.sessions,
        detail: ct ? `${ct.soon} within 30 days` : undefined,
        hint: 'In the catalog',
      }),
      kpi({
        key: 'seatFill',
        area: 'catalog',
        icon: 'armchair',
        label: 'Seat fill rate',
        unit: 'percent',
        value: percentOf(ct?.taken, ct?.capacity),
        target: TARGETS.seatFill,
        hint: 'Seats taken',
      }),
      kpi({
        key: 'waitlistPressure',
        area: 'catalog',
        icon: 'users-round',
        label: 'Waitlist pressure',
        unit: 'percent',
        value: percentOf(ct?.waitlist, ct?.capacity),
        target: TARGETS.waitlistPressure,
        better: 'down',
        hint: 'Waitlisted per seat',
      }),
      kpi({
        key: 'fullSessions',
        area: 'catalog',
        icon: 'ticket-check',
        label: 'Fully booked',
        value: ct?.full,
        hint: 'Sessions with no seat left',
      }),
      kpi({
        key: 'trainingHours',
        area: 'catalog',
        icon: 'clock-3',
        label: 'Training hours',
        value: ct?.hours,
        hint: 'Scheduled ahead',
      }),
      kpi({
        key: 'classSize',
        area: 'catalog',
        icon: 'users',
        label: 'Average class size',
        unit: 'decimal',
        value: ratio(ct?.capacity, ct?.sessions),
        hint: 'Seats per session',
      }),
      kpi({
        key: 'digitalDelivery',
        area: 'catalog',
        icon: 'monitor-play',
        label: 'Digital delivery',
        unit: 'percent',
        value: percentOf(sum(ct?.online, ct?.blended), ct?.sessions),
        target: TARGETS.digitalDelivery,
        hint: 'Online or blended',
      }),
      kpi({
        key: 'eligible',
        area: 'catalog',
        icon: 'sparkles',
        label: 'Open to you',
        value: ct?.eligible,
        hint: 'Sessions you can join',
      }),
    )
  }
  if (can.team) {
    list.push(
      kpi({
        key: 'teamMembers',
        area: 'team',
        icon: 'users',
        label: 'Team members',
        value: tm?.people,
        hint: 'With a skill profile',
      }),
      kpi({
        key: 'readiness',
        area: 'team',
        icon: 'gauge',
        label: 'Average readiness',
        unit: 'percent',
        value: percentOf(tm?.readinessPoints, tm?.readinessMax),
        target: TARGETS.readiness,
        hint: 'Against role targets',
      }),
      kpi({
        key: 'readyShare',
        area: 'team',
        icon: 'target',
        label: 'Ready for role',
        unit: 'percent',
        value: percentOf(tm?.ready, tm?.people),
        target: TARGETS.readyShare,
        hint: '80% readiness or more',
      }),
      kpi({
        key: 'criticalPeople',
        area: 'team',
        icon: 'triangle-alert',
        label: 'Critical gaps',
        value: tm?.atRisk,
        target: 0,
        better: 'down',
        hint: 'People missing a critical skill',
      }),
      kpi({
        key: 'gapsPerPerson',
        area: 'team',
        icon: 'chart-no-axes-column',
        label: 'Gaps per person',
        unit: 'decimal',
        value: ratio(tm?.gaps, tm?.people),
        hint: 'Skills below target',
      }),
      kpi({
        key: 'neverAssessed',
        area: 'team',
        icon: 'clipboard-x',
        label: 'Not yet assessed',
        unit: 'percent',
        value: percentOf(tm?.neverAssessed, tm?.people),
        target: TARGETS.neverAssessed,
        better: 'down',
        hint: 'Without a skill assessment',
      }),
    )
  }
  return list
}

// The Talent Index: the average of the headline quality rates the user can see,
// each 0–100. Returns { value, parts } (value undefined while any part loads).
export function talentIndex(scorecard) {
  const PARTS = [
    'appraisalApproval',
    'calibration',
    'nominationApproval',
    'profileApproval',
    'seatFill',
    'readiness',
  ]
  const parts = scorecard.filter((item) => PARTS.includes(item.key))
  if (!parts.length) return { value: null, parts }
  if (parts.some((item) => item.value === undefined)) return { value: undefined, parts }
  const measured = parts.filter((item) => item.value !== null)
  return {
    value: measured.length
      ? Math.round(
          measured.reduce((acc, item) => acc + Math.min(100, item.value), 0) / measured.length,
        )
      : null,
    parts,
  }
}
