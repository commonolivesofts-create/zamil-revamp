import { Fragment } from 'react'
import { BANDS, SCORE_MAX, bandLabel } from './interviewModel.js'
import { BandBar } from '../shared/components/InsightCards.jsx'
import { DECISION } from './interviewSuggestionsModel.js'

const BAND_TONE = Object.freeze({ POOR: 'bad', GOOD: 'mint', OUTSTANDING: 'primary' })
const decisionClass = (decision) => (decision.key === DECISION.READY.key ? 'zrv-ia-is-ready' : 'zrv-ia-is-review')
const initials = (name) => (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
const enDate = (value) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${value}T00:00:00Z`))
const meta = (candidate) => [
  candidate.assessmentNumber,
  candidate.interviewDate ? `interviewed ${enDate(candidate.interviewDate)}` : null,
  candidate.wait != null ? `${candidate.wait} ${candidate.wait === 1 ? 'day' : 'days'} waiting` : null,
].filter(Boolean).join(' · ')

// One compact card per candidate: who it is, both score bands as bars, the
// decision and — only when it needs reading — the reason. The interviewer's
// notes stay folded away so the panel stays short. It reads the rows the panel
// already loaded, so opening a requisition never refetches.
export function InterviewCandidateComparison({ candidates = [] }) {
  if (!candidates.length) return <p className="zrv-ia-compare__state">No approved, passed assessments were found for this requisition.</p>
  return (
    <div className="zrv-ia-cands">
      {candidates.map((candidate) => (
        <article key={candidate.assessmentId} className="zrv-ia-cand">
          <header className="zrv-ia-cand__head">
            <span className="zrv-ia-cand__avatar" aria-hidden="true">{initials(candidate.candidateName) || '—'}</span>
            <span className="zrv-ia-cand__who">
              <b>{candidate.candidateName || candidate.assessmentNumber || candidate.assessmentId}</b>
              <small>{meta(candidate)}</small>
            </span>
            <span className={`zrv-ia-cand__state ${decisionClass(candidate.decision)}`}>{candidate.decision.label}</span>
          </header>
          <div className="zrv-ia-cand__scores">
            <BandBar value={candidate.specTotal} max={SCORE_MAX.spec} bands={BANDS.spec} tone={BAND_TONE[candidate.specBand]}
              name="Specification" label={bandLabel(candidate.specTotal, BANDS.spec, candidate.specTotal != null)} />
            <BandBar value={candidate.compTotal} max={SCORE_MAX.comp} bands={BANDS.comp} tone={BAND_TONE[candidate.compBand]}
              name="Competency" label={bandLabel(candidate.compTotal, BANDS.comp, candidate.compTotal != null)} />
          </div>
          {candidate.decision.key === DECISION.REVIEW.key && <p className="zrv-ia-cand__reason">{candidate.reason}</p>}
          {(candidate.strengths || candidate.weakness) && <details className="zrv-ia-cand__notes">
            <summary>Interviewer notes</summary>
            <dl>
              {candidate.strengths && <Fragment><dt>Strengths</dt><dd>{candidate.strengths}</dd></Fragment>}
              {candidate.weakness && <Fragment><dt>Weaknesses</dt><dd>{candidate.weakness}</dd></Fragment>}
            </dl>
          </details>}
        </article>
      ))}
    </div>
  )
}
