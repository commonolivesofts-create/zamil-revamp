import { useEffect, useId, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday } from '../shared/hrFormat.js'
import { Compare, CountUp, Donut, Quadrant } from '../shared/components/InsightCards.jsx'
import { BANDS, SCORE_MAX } from './interviewModel.js'
import { DECISION, bandMix, groupByRequisition, quadrantPoints, suggestionsSummary } from './interviewSuggestionsModel.js'
import { InterviewCandidateComparison } from './InterviewCandidateComparison.jsx'

const service = hrRecruitmentServices.interviews
const percentOf = (value, of) => (of ? Math.round((value / of) * 100) : 0)
const countIn = (groups) => groups.reduce((sum, group) => sum + group.candidates.length, 0)

const loadAll = async (signal) => {
  const query = { status: 'Approved', evaluationStatus: 'Passed', page: 1, limit: 100 }
  const first = await service.list(query, { signal })
  const items = [...first.items]
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const next = await service.list({ ...query, page }, { signal })
    items.push(...next.items)
  }
  return items
}

function Stat({ icon, label, value, unit, hint, tone = 'mint' }) {
  return (
    <div className={`zrv-ia-stat zrv-ir-tone--${tone}`}>
      <span className="zrv-ia-stat__label"><OrvexaIcon name={icon} size={13} />{label}</span>
      <b>{value == null ? '—' : <><CountUp value={value} />{unit && <small>{unit}</small>}</>}</b>
      {hint && <small className="zrv-ia-stat__hint">{hint}</small>}
    </div>
  )
}

// The panel's overview: the decision counts, then how ready the pool is and
// where the two score bands leave each candidate. Nothing else competes with
// the requisition cards below it.
function Overview({ groups }) {
  const candidates = groups.flatMap((group) => group.candidates)
  const summary = suggestionsSummary(groups)
  const points = quadrantPoints(candidates)
  return (
    <div className="zrv-ia-dash">
      <div className="zrv-ia-kpi" role="group" aria-label="Hiring decision summary">
        <Stat icon="layers" label="Requisitions" value={summary.requisitions} hint="with passed candidates" />
        <Stat icon="users" label="Candidates" value={summary.total} hint="approved and passed" />
        <Stat icon="badge-check" label="Offer-ready" value={summary.ready} tone="mint" hint={`${percentOf(summary.ready, summary.total)}% of candidates`} />
        <Stat icon="alert-triangle" label="Needs review" value={summary.review} tone="amber" hint={summary.review ? 'a rating group is Poor' : 'nothing flagged'} />
        <Stat icon="clock" label="Longest wait" value={summary.oldest} unit="days" tone="primary" hint="since the interview" />
      </div>
      <div className="zrv-ia-charts">
        <figure className="zrv-ia-chart">
          <figcaption><span>Decision readiness</span><small>{summary.ready} of {summary.total} candidates</small></figcaption>
          <Donut total={summary.total} unit="candidates" items={[
            { key: 'READY', label: DECISION.READY.label, count: summary.ready, tone: 'mint' },
            { key: 'REVIEW', label: DECISION.REVIEW.label, count: summary.review, tone: 'amber' },
          ]} />
        </figure>
        <figure className="zrv-ia-chart">
          <figcaption><span>Score map</span><small>specification × competency</small></figcaption>
          {points.length >= 5
            ? <Quadrant points={points} xMax={SCORE_MAX.spec} yMax={SCORE_MAX.comp}
              xCut={BANDS.spec[1][0]} yCut={BANDS.comp[1][0]}
              xLabel="Specification" yLabel="Competency" />
            : <Compare rows={bandMix(candidates)} />}
          <p className="zrv-ia-chart__foot">{points.length >= 5
            ? 'Each dot is one candidate; the crosshair marks the Good thresholds. Two separate scores, no combined result.'
            : 'Too few candidates for a scatter, so the pool is grouped by where its score bands fall.'}</p>
        </figure>
      </div>
    </div>
  )
}

// Nothing to review yet: one short sentence of what this panel waits for, and
// where the missing step actually happens.
function Empty() {
  return (
    <div className="zrv-ia-empty">
      <span className="zrv-ia-empty__icon"><OrvexaIcon name="inbox" size={17} /></span>
      <div>
        <b>No passed assessments to review yet</b>
        <p>An assessment appears here once it is approved and its outcome is recorded as Passed.</p>
        <small>Approve a passed assessment in the interview report below, then open this panel again.</small>
      </div>
    </div>
  )
}

// A quiet wait: one small spinner in the panel's own space, nothing else.
function Loading() {
  return (
    <div className="zrv-ia-loading" role="status" aria-live="polite">
      <span className="zrv-ia-loading__spinner" aria-hidden="true" />
      <span className="zrv-hr-sr">Loading hiring suggestions.</span>
    </div>
  )
}

// One card per requisition; opening one shows its candidates as cards in the
// same grid, so the panel stays a short overview until someone asks for detail.
export function InterviewSuggestions() {
  const id = useId()
  const [state, setState] = useState({ status: 'loading', groups: [], error: '' })
  const [selected, setSelected] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const load = async () => {
      try {
        const listed = await loadAll(controller.signal)
        const groups = groupByRequisition(listed, businessToday())
        if (!active) return
        setState({ status: 'ready', groups, error: '' })
        setSelected((current) => groups.some((group) => group.requisitionNo === current) ? current : '')
      } catch (error) {
        if (active && error?.name !== 'AbortError') setState({
          status: 'error', groups: [],
          error: error?.code === 'INVALID_RESPONSE'
            ? 'Some assessment data could not be read. Refresh the suggestions to try again.'
            : error?.message || 'Hiring suggestions could not be loaded.',
        })
      }
    }

    load()
    return () => { active = false; controller.abort() }
  }, [version])

  const retry = () => {
    setState({ status: 'loading', groups: [], error: '' })
    setVersion((value) => value + 1)
  }

  return (
    <section className="zrv-ia-suggestions" aria-labelledby="interview-suggestions-title">
      <header className="zrv-ia-suggestions__head">
        <span className="zrv-ia-suggestions__icon"><OrvexaIcon name="badge-check" size={20} /></span>
        <div><span className="zrv-ia-suggestions__eyebrow">Decision support</span><h2 id="interview-suggestions-title">Hiring suggestions</h2><p>Approved, passed assessments grouped by requisition for a clear offer review.</p></div>
        {state.status === 'ready' && <dl className="zrv-ia-suggestions__totals"><div><dt>Requisitions</dt><dd>{state.groups.length}</dd></div><div><dt>Candidates</dt><dd>{countIn(state.groups)}</dd></div></dl>}
      </header>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <div className="zrv-ia-suggestions__error" role="alert"><span><b>Suggestions are temporarily unavailable</b><small>{state.error}</small></span><button type="button" className="zrv-ir-btn" onClick={retry}>Try again</button></div>}
      {state.status === 'ready' && !state.groups.length && <Empty />}
      {state.status === 'ready' && state.groups.length > 0 && <>
        <Overview groups={state.groups} />
        <div className="zrv-ia-suggestions__grid">
          {state.groups.map((group, index) => {
            const { total: candidates, ready, review, oldest } = group.summary
            const expanded = selected === group.requisitionNo
            const detailId = `${id}-detail-${index}`
            return <article key={group.requisitionNo} className={`zrv-ia-card${expanded ? ' zrv-ia-is-selected' : ''}`}>
              <button type="button" className="zrv-ia-card__trigger"
                onClick={() => setSelected((value) => value === group.requisitionNo ? '' : group.requisitionNo)}
                aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}>
                <span className="zrv-ia-card__main">
                  <span className="zrv-ia-card__top">
                    <span className="zrv-ia-card__position">{group.position || 'Position unavailable'}</span>
                    <span className="zrv-ia-card__chevron"><OrvexaIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} /></span>
                  </span>
                  <span className="zrv-ia-card__req">{group.requisitionNo}</span>
                </span>
                <span className="zrv-ia-card__stats">
                  <span className="zrv-ia-card__meter" aria-hidden="true">
                    <i className="zrv-ia-is-ready" style={{ flexGrow: ready }} />
                    <i className="zrv-ia-is-review" style={{ flexGrow: review }} />
                  </span>
                  <span className="zrv-ia-card__foot">
                    <span><b>{candidates}</b> {candidates === 1 ? 'candidate' : 'candidates'}</span>
                    <span>{ready} ready{review > 0 ? ` · ${review} review` : ''}</span>
                  </span>
                </span>
              </button>
              {expanded && <section className="zrv-ia-detail" id={detailId} aria-live="polite">
                <header className="zrv-ia-detail__head">
                  <span className="zrv-ia-detail__eyebrow">Candidate evidence · {group.requisitionNo}{oldest != null ? ` · waiting up to ${oldest} ${oldest === 1 ? 'day' : 'days'}` : ''}</span>
                  <button type="button" className="zrv-ir-btn" onClick={() => setSelected('')}>Close</button>
                </header>
                <InterviewCandidateComparison candidates={group.candidates} />
              </section>}
            </article>
          })}
        </div>
      </>}
      <details className="zrv-ia-how">
        <summary>How this is calculated</summary>
        <ul>
          <li>Only approved assessments with a Passed outcome are listed.</li>
          <li>Personal specification is scored out of {SCORE_MAX.spec} (Good from {BANDS.spec[1][0]}, Outstanding from {BANDS.spec[2][0]}); competency out of {SCORE_MAX.comp} (Good from {BANDS.comp[1][0]}, Outstanding from {BANDS.comp[2][0]}).</li>
          <li>A candidate is offer-ready when neither score group is in the Poor band; otherwise HR reads the interviewer remarks before deciding.</li>
          <li>No combined score, weighting or ranking is used. Suggestions never approve an assessment or create an employment offer.</li>
        </ul>
      </details>
      <p className="zrv-ia-suggestions__note">Suggestions do not approve assessments or create employment offers. HR makes the final hiring decision.</p>
    </section>
  )
}
