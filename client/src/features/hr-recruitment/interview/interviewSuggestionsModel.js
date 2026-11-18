// Decision support for the Hiring suggestions panel. Pure functions over the
// approved, passed assessments the panel lists: each candidate's decision
// state, the requisition groups, and the totals the summary cards and charts
// read. A state comes from that candidate's own two score bands and recorded
// outcome — never from a position against other candidates — so no combined
// score, weighting or ranking is introduced.
import { BANDS, bandOf } from './interviewModel.js'
import { businessToday } from '../shared/hrFormat.js'

export const DECISION = Object.freeze({
  READY: Object.freeze({ key: 'READY', label: 'Offer-ready', short: 'offer-ready', tone: 'mint' }),
  REVIEW: Object.freeze({
    key: 'REVIEW',
    label: 'Needs review',
    short: 'needs review',
    tone: 'amber',
  }),
})

const DAY = 86400000

// Whole days from an ISO business date to today; null without a usable date.
export function waitingDays(interviewDate, today = businessToday()) {
  if (!interviewDate) return null
  const from = Date.parse(`${interviewDate}T00:00:00Z`)
  const to = Date.parse(`${today}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.max(0, Math.round((to - from) / DAY))
}

// A missing total is unrated, not a score of zero.
const bandOfTotal = (total, bands) => bandOf(total ?? 0, bands, total != null)

export function candidateDecision({ status, outcome, specTotal, compTotal }) {
  const [, specBand] = bandOfTotal(specTotal, BANDS.spec)
  const [, compBand] = bandOfTotal(compTotal, BANDS.comp)

  if (specTotal == null || compTotal == null) {
    const missing = [
      specTotal == null && 'personal specification',
      compTotal == null && 'competency',
    ]
      .filter(Boolean)
      .join(' and ')
    return {
      decision: DECISION.REVIEW,
      specBand,
      compBand,
      reason: `${missing} totals are not recorded.`,
    }
  }
  if (specBand === 'POOR' || compBand === 'POOR') {
    const groups = [
      specBand === 'POOR' && 'Personal specification',
      compBand === 'POOR' && 'Competency',
    ].filter(Boolean)
    return {
      decision: DECISION.REVIEW,
      specBand,
      compBand,
      reason: `${groups.join(' and ')} ${groups.length > 1 ? 'are' : 'is'} in the Poor band — read the interviewer remarks.`,
    }
  }
  if (outcome !== 'PASSED' || status !== 'APPROVED') {
    return {
      decision: DECISION.REVIEW,
      specBand,
      compBand,
      reason: 'The assessment is not an approved pass.',
    }
  }
  return {
    decision: DECISION.READY,
    specBand,
    compBand,
    reason: 'Approved, passed, and neither score group is in the Poor band.',
  }
}

export function candidateInsight(item, today = businessToday()) {
  const { decision, specBand, compBand, reason } = candidateDecision({
    status: item.status,
    outcome: item.outcome,
    specTotal: item.personalSpecTotal,
    compTotal: item.jobCompetencyTotal,
  })
  return Object.freeze({
    ...item,
    specTotal: item.personalSpecTotal,
    compTotal: item.jobCompetencyTotal,
    specBand,
    compBand,
    decision,
    reason,
    wait: waitingDays(item.interviewDate, today),
  })
}

export function summarise(candidates) {
  const ready = candidates.filter(
    (candidate) => candidate.decision.key === DECISION.READY.key,
  ).length
  const waits = candidates.map((candidate) => candidate.wait).filter((value) => value != null)
  return {
    total: candidates.length,
    ready,
    review: candidates.length - ready,
    oldest: waits.length ? Math.max(...waits) : null,
  }
}

// Requisition rows, each with its own counts. Sorted by requisition number so
// the panel does not order people or jobs by score.
export function groupByRequisition(items, today = businessToday()) {
  const groups = new Map()
  for (const item of items) {
    const requisitionNo = String(item.requisitionNo ?? '').trim()
    if (!requisitionNo) continue
    const current = groups.get(requisitionNo) ?? {
      requisitionNo,
      position: item.positionTitle,
      candidates: [],
    }
    current.candidates.push(candidateInsight(item, today))
    groups.set(requisitionNo, current)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, summary: summarise(group.candidates) }))
    .sort((a, b) => a.requisitionNo.localeCompare(b.requisitionNo))
}

export function suggestionsSummary(groups) {
  const candidates = groups.flatMap((group) => group.candidates)
  return { requisitions: groups.length, ...summarise(candidates) }
}

const BUCKETS = Object.freeze([
  Object.freeze([0, 7, '0–7 days']),
  Object.freeze([8, 14, '8–14 days']),
  Object.freeze([15, 30, '15–30 days']),
  Object.freeze([31, null, '31+ days']),
])

// How long the interview has been waiting for a decision.
export function waitingBuckets(candidates) {
  const items = BUCKETS.map(([from, to, label]) => ({
    key: `d${from}`,
    label,
    count: candidates.filter(
      (candidate) =>
        candidate.wait != null && candidate.wait >= from && (to == null || candidate.wait <= to),
    ).length,
    tone: from >= 31 ? 'bad' : from >= 15 ? 'amber' : 'mint',
  }))
  const unknown = candidates.filter((candidate) => candidate.wait == null).length
  return unknown
    ? [...items, { key: 'dx', label: 'No interview date', count: unknown, tone: 'progress' }]
    : items
}

// Fallback for the score map while there are too few candidates to read a
// scatter: where the two score bands leave each candidate.
export function bandMix(candidates) {
  const count = (test) => candidates.filter(test).length
  const atLeastGood = (band) => band === 'GOOD' || band === 'OUTSTANDING'
  return [
    {
      key: 'strong',
      label: 'Both groups Good+',
      count: count(
        (candidate) => atLeastGood(candidate.specBand) && atLeastGood(candidate.compBand),
      ),
      tone: 'mint',
    },
    {
      key: 'poor',
      label: 'A group is Poor',
      count: count((candidate) => candidate.specBand === 'POOR' || candidate.compBand === 'POOR'),
      tone: 'amber',
    },
    {
      key: 'unknown',
      label: 'Totals missing',
      count: count((candidate) => candidate.specBand == null || candidate.compBand == null),
      tone: 'progress',
    },
  ]
}

// One point per candidate with both totals; the chart shows two independent
// scores, not a combined one.
export function quadrantPoints(candidates) {
  return candidates
    .filter((candidate) => candidate.specTotal != null && candidate.compTotal != null)
    .map((candidate) => ({
      key: candidate.assessmentId,
      label: candidate.candidateName || candidate.assessmentNumber || candidate.assessmentId,
      x: candidate.specTotal,
      y: candidate.compTotal,
      tone: candidate.decision.key === DECISION.READY.key ? 'mint' : 'amber',
    }))
}
