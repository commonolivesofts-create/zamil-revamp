import { Fragment } from 'react'
import { BANDS, SCORE_MAX, bandLabel } from './interviewModel.js'
import { BandBar } from '../shared/components/InsightCards.jsx'
import { DECISION } from './interviewSuggestionsModel.js'
import { MAX_COMPARE } from './interviewComparisonModel.js'

const BAND_TONE = Object.freeze({ POOR: 'bad', GOOD: 'mint', OUTSTANDING: 'primary' })
const decisionClass = (decision) =>
  decision.key === DECISION.READY.key ? 'zrv-ia-is-ready' : 'zrv-ia-is-review'
const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
const enDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
const meta = (candidate) =>
  [
    candidate.assessmentNumber,
    candidate.interviewDate ? `interviewed ${enDate(candidate.interviewDate)}` : null,
    candidate.wait != null
      ? `${candidate.wait} ${candidate.wait === 1 ? 'day' : 'days'} waiting`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

// One compact card per candidate: who it is, both score bands as bars, the
// decision and — only when it needs reading — the reason. The interviewer's
// notes stay folded away so the page stays short. It reads the rows the page
// already loaded, so opening a requisition never refetches.
// When `selectable`, each card carries a checkbox so HR can put two or more
// candidates side by side; the comparison itself opens on its own page.
export function InterviewCandidateComparison({
  candidates = [],
  selectable = false,
  selectedIds = [],
  onToggle,
}) {
  if (!candidates.length)
    return (
      <p className="zrv-ia-compare__state">
        No approved, passed assessments were found for this requisition.
      </p>
    )
  return (
    <div className="zrv-ia-cands">
      {candidates.map((candidate) => {
        const picked = selectedIds.includes(candidate.assessmentId)
        const atLimit = !picked && selectedIds.length >= MAX_COMPARE
        const name = candidate.candidateName || candidate.assessmentNumber || candidate.assessmentId
        // The whole card is the target: clicking its plain surface toggles the
        // same choice as the checkbox, while links, controls and the folded
        // notes keep their own behaviour.
        const pickFromCard = selectable
          ? (event) => {
              if (event.target.closest('a, button, input, label, summary, details')) return
              if (!atLimit) onToggle?.(candidate.assessmentId)
            }
          : undefined
        return (
          <article
            key={candidate.assessmentId}
            className={`zrv-ia-cand${picked ? ' zrv-ia-cand--picked' : ''}${selectable ? ' zrv-ia-cand--selectable' : ''}${atLimit ? ' zrv-ia-cand--locked' : ''}`}
            onClick={pickFromCard}
            title={
              selectable && atLimit
                ? `Compare up to ${MAX_COMPARE} candidates at a time`
                : undefined
            }
          >
            <header className="zrv-ia-cand__head">
              {selectable && (
                <label
                  className="zrv-ia-cand__pick"
                  title={atLimit ? `Compare up to ${MAX_COMPARE} candidates at a time` : undefined}
                >
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={atLimit}
                    onChange={() => onToggle?.(candidate.assessmentId)}
                  />
                  <span className="zrv-hr-sr">Select {name} for comparison</span>
                </label>
              )}
              <span className="zrv-ia-cand__avatar" aria-hidden="true">
                {initials(candidate.candidateName) || '—'}
              </span>
              <span className="zrv-ia-cand__who">
                <b>{name}</b>
                <small>{meta(candidate)}</small>
              </span>
              <span className={`zrv-ia-cand__state ${decisionClass(candidate.decision)}`}>
                {candidate.decision.label}
              </span>
            </header>
            <div className="zrv-ia-cand__scores">
              <BandBar
                value={candidate.specTotal}
                max={SCORE_MAX.spec}
                bands={BANDS.spec}
                tone={BAND_TONE[candidate.specBand]}
                name="Specification"
                label={bandLabel(candidate.specTotal, BANDS.spec, candidate.specTotal != null)}
              />
              <BandBar
                value={candidate.compTotal}
                max={SCORE_MAX.comp}
                bands={BANDS.comp}
                tone={BAND_TONE[candidate.compBand]}
                name="Competency"
                label={bandLabel(candidate.compTotal, BANDS.comp, candidate.compTotal != null)}
              />
            </div>
            {candidate.decision.key === DECISION.REVIEW.key && (
              <p className="zrv-ia-cand__reason">{candidate.reason}</p>
            )}
            {(candidate.strengths || candidate.weakness) && (
              <details className="zrv-ia-cand__notes">
                <summary>Interviewer notes</summary>
                <dl>
                  {candidate.strengths && (
                    <Fragment>
                      <dt>Strengths</dt>
                      <dd>{candidate.strengths}</dd>
                    </Fragment>
                  )}
                  {candidate.weakness && (
                    <Fragment>
                      <dt>Weaknesses</dt>
                      <dd>{candidate.weakness}</dd>
                    </Fragment>
                  )}
                </dl>
              </details>
            )}
          </article>
        )
      })}
    </div>
  )
}
