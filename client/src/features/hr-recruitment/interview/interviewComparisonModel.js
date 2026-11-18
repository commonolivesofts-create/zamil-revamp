// Side-by-side comparison of interview assessments. Pure functions over the
// full assessment records the comparison page loads: each candidate's own two
// score groups, every rated criterion, the profile facts HR reads before an
// offer, and the interviewer notes. Nothing here combines the two score groups
// or orders the candidates — a comparison shows recorded evidence, and the
// decision stays with HR.
import { INTERVIEW_TEXT } from '../hrRecruitmentText.js'
import { enDate, formatAmount } from '../shared/hrFormat.js'
import {
  BANDS,
  COMP_KEYS,
  SCORE_MAX,
  SPEC_KEYS,
  bandOf,
  ratedCount,
  salaryDelta,
  sumRatings,
} from './interviewModel.js'
import { candidateDecision, waitingDays } from './interviewSuggestionsModel.js'

// Six columns stay readable on a laptop; more belongs in the assessment report.
export const MAX_COMPARE = 6

// The requisition a record belongs to. Report rows carry `requisitionNo`, full
// assessments carry `requisitionNumber`.
export const requisitionOf = (record) =>
  String(record?.requisitionNumber ?? record?.requisitionNo ?? '').trim()

// Candidates are only comparable when they applied for the same position, so a
// comparison carries one requisition. A record with no requisition cannot be
// shown to share a position with another and counts as a group of its own.
export function comparisonScope(records) {
  const keys = [...new Set(records.map((record) => requisitionOf(record).toLowerCase()))]
  const labels = [...new Set(records.map(requisitionOf).filter(Boolean))]
  const unknown = records.some((record) => !requisitionOf(record))
  return {
    labels: unknown ? [...labels, 'No requisition recorded'] : labels,
    mixed: keys.length > 1,
  }
}

// The two score groups, in the order the form records them.
export const COMPARISON_GROUPS = Object.freeze([
  Object.freeze({
    key: 'spec',
    source: 'personalSpecification',
    title: 'Personal specification',
    keys: SPEC_KEYS,
    bands: BANDS.spec,
    max: SCORE_MAX.spec,
  }),
  Object.freeze({
    key: 'comp',
    source: 'competency',
    title: 'Competency',
    keys: COMP_KEYS,
    bands: BANDS.comp,
    max: SCORE_MAX.comp,
  }),
])

const groupOf = (record, group) => record?.[group.source] ?? {}

// A rating is 1–5, 'N/A', or not recorded. Only 1–5 counts towards a total.
export function ratingOf(record, group, key) {
  const value = groupOf(record, group)?.[key]?.rating
  return Number.isInteger(value) ? value : null
}

const naOf = (record, group, key) => groupOf(record, group)?.[key]?.rating === 'N/A'
const remarkOf = (record, group, key) => groupOf(record, group)?.[key]?.remark ?? ''

const ratingAt = (record, group, key) => groupOf(record, group)?.[key]?.rating ?? null

// Each group's total, whether anything was rated, whether it is complete, and
// its band (only once every criterion has an answer).
export function totalsOf(record) {
  return Object.fromEntries(
    COMPARISON_GROUPS.map((group) => {
      const ratings = groupOf(record, group)
      const answered = ratedCount(ratings, group.keys)
      const total = sumRatings(ratings)
      return [
        group.key,
        {
          total,
          rated: answered > 0,
          // How much of the group is actually filled in, so a summary can show
          // completeness instead of guessing it from the band alone.
          answered,
          count: group.keys.length,
          complete: answered === group.keys.length,
          band: bandOf(total, group.bands, answered > 0)[1],
          max: group.max,
        },
      ]
    }),
  )
}

// The same decision rule the suggestions panel uses, read from the record's
// own ratings instead of the list's pre-computed totals.
export function comparisonDecision(record) {
  const totals = totalsOf(record)
  return candidateDecision({
    status: record.status,
    outcome: record.outcome,
    specTotal: totals.spec.rated ? totals.spec.total : null,
    compTotal: totals.comp.rated ? totals.comp.total : null,
  })
}

// Which columns hold the highest rating in one criterion. Ties share the mark,
// and a column with no rating never leads. This compares that one criterion
// only; it is not an overall ranking.
export function leadIndexes(values) {
  const numbers = values.filter(Number.isInteger)
  if (numbers.length < 2 || new Set(numbers).size < 2) return []
  const top = Math.max(...numbers)
  return values.reduce((list, value, index) => (value === top ? [...list, index] : list), [])
}

// Criteria rows, grouped by score group. `values` is one entry per candidate.
export function comparisonCriteria(records) {
  return COMPARISON_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    max: group.max,
    rows: group.keys.map((key) => {
      const ratings = records.map((record) => ratingAt(record, group, key))
      return {
        key: `${group.key}.${key}`,
        label: INTERVIEW_TEXT.criteria[key][0],
        short: INTERVIEW_TEXT.criteria[key][1],
        values: records.map((record) => ({
          rating: ratingOf(record, group, key),
          na: naOf(record, group, key),
          remark: remarkOf(record, group, key),
        })),
        lead: leadIndexes(ratings),
      }
    }),
  }))
}

const DASH = '—'
const text = (value) => {
  const written = value == null ? '' : String(value).trim()
  return written === '' ? DASH : written
}
const number = (value, unit = '') =>
  value == null || value === '' ? DASH : `${formatAmount(value)}${unit ? ` ${unit}` : ''}`
const money = (value) => (value == null ? DASH : formatAmount(value))
const date = (value) => (value ? enDate(value) || DASH : DASH)
const change = (record) => {
  const delta = salaryDelta(record.expectedTotal, record.currentTotal)
  return delta == null ? DASH : `${delta > 0 ? '+' : ''}${delta}%`
}

// The facts HR reads before deciding, in the order they are asked. Each row is
// one label and one formatted value per candidate.
export function profileSections(records) {
  const row = (key, label, read) => ({ key, label, values: records.map(read) })
  return [
    {
      key: 'identity',
      title: 'Candidate',
      rows: [
        row('number', 'Assessment', (record) =>
          text(record.assessmentNumber || record.assessmentId),
        ),
        row('status', 'Status', (record) => text(INTERVIEW_TEXT.status[record.status])),
        row('outcome', 'Recorded result', (record) =>
          text(INTERVIEW_TEXT.outcomes[record.outcome]),
        ),
        row('education', 'Education', (record) => text(record.certificateCode)),
        row('checked', 'Certificate checked', (record) => text(record.certificateCheckedCode)),
        row('major', 'Major', (record) => text(record.major)),
        row('location', 'Location', (record) => text(record.location)),
        row('nationality', 'Nationality', (record) => text(record.nationality)),
      ],
    },
    {
      key: 'experience',
      title: 'Experience',
      rows: [
        row('employer', 'Current employer', (record) => text(record.currentEmployer)),
        row('last', 'Last position', (record) => text(record.lastPosition)),
        row('years', 'Relevant experience', (record) =>
          number(record.relevantExperienceYears, 'yrs'),
        ),
      ],
    },
    {
      key: 'salary',
      title: 'Salary expectation',
      rows: [
        row('currentBasic', 'Current basic', (record) => money(record.currentBasic)),
        row('currentTotal', 'Current total', (record) => money(record.currentTotal)),
        row('expectedBasic', 'Expected basic', (record) => money(record.expectedBasic)),
        row('expectedTotal', 'Expected total', (record) => money(record.expectedTotal)),
        row('change', 'Change on current total', change),
        row('joining', 'Expected joining', (record) => date(record.expectedJoiningDate)),
      ],
    },
    {
      key: 'interview',
      title: 'Interview',
      rows: [
        row('date', 'Interview date', (record) => date(record.interviewDate)),
        row('time', 'Time', (record) => text(record.interviewTime)),
        row('type', 'Type', (record) => text(record.interviewTypeCode)),
        row('division', 'Division', (record) => text(record.divisionCode)),
        row('payroll', 'Payroll unit', (record) => text(record.payroll)),
        row('panel', 'Panel', (record) =>
          text((record.interviewers ?? []).filter(Boolean).join(' · ')),
        ),
        row('hrComment', 'HR comment', (record) => text(record.hrComment)),
      ],
    },
  ]
}

// The written evidence, one block per candidate: what the panel noted and what
// the interviewer recorded in each score group.
export function noteSections(records) {
  return [
    {
      key: 'strengths',
      label: 'Strengths',
      values: records.map((record) => text(record.strengths)),
    },
    {
      key: 'weakness',
      label: 'Weaknesses',
      values: records.map((record) => text(record.weakness)),
    },
    {
      key: 'specRemarks',
      label: 'Personal specification remarks',
      values: records.map((record) => text(record.personalSpecificationRemarks)),
    },
    {
      key: 'compRemarks',
      label: 'Competency remarks',
      values: records.map((record) => text(record.competencyRemarks)),
    },
  ]
}

// What each comparison column shows in its header: identity, the decision and
// how long the assessment has waited.
export function comparisonRoster(records, today) {
  return records.map((record, index) => {
    const totals = totalsOf(record)
    const decision = comparisonDecision(record)
    return {
      id: record.assessmentId,
      // A stable accent per candidate, so the same person keeps the same light
      // in the pinned header and in every table column.
      tone: index % 6,
      requisition: requisitionOf(record),
      name: record.candidateName || record.assessmentNumber || record.assessmentId,
      number: record.assessmentNumber,
      interviewDate: record.interviewDate,
      wait: waitingDays(record.interviewDate, today),
      outcome: record.outcome,
      decision: decision.decision,
      reason: decision.reason,
      spec: totals.spec,
      comp: totals.comp,
    }
  })
}

// `ids=101,102` in the page's query: positive decimal IDs, no duplicates, at
// most MAX_COMPARE columns.
export function comparisonIds(value) {
  const list = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^[1-9][0-9]{0,18}$/.test(item))
  return [...new Set(list)].slice(0, MAX_COMPARE)
}
