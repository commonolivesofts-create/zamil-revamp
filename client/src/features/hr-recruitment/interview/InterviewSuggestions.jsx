import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, initials } from '../shared/hrFormat.js'
import { CountUp } from '../shared/components/InsightCards.jsx'
import { BANDS, SCORE_MAX } from './interviewModel.js'
import { MAX_COMPARE } from './interviewComparisonModel.js'
import { groupByRequisition, suggestionsSummary } from './interviewSuggestionsModel.js'
import { InterviewCandidateComparison } from './InterviewCandidateComparison.jsx'
import { getApiUnavailableError, subscribeApiRetry } from '@/services/api/apiEvents.js'

const service = hrRecruitmentServices.interviews
const REPORT_PATH = '/hr/recruitment/interview/report'
const COMPARE_PATH = '/hr/recruitment/interview/compare'
const percentOf = (value, of) => (of ? Math.round((value / of) * 100) : 0)

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
      <span className="zrv-ia-stat__label">
        <OrvexaIcon name={icon} size={13} />
        {label}
      </span>
      <b>
        {value == null ? (
          '—'
        ) : (
          <>
            <CountUp value={value} />
            {unit && <small>{unit}</small>}
          </>
        )}
      </b>
      {hint && <small className="zrv-ia-stat__hint">{hint}</small>}
    </div>
  )
}

// The page's overview: the decision counts only. The requisition cards carry
// the evidence, so nothing else competes with them.
function Overview({ groups }) {
  const summary = suggestionsSummary(groups)
  return (
    <div className="zrv-ia-dash">
      <div className="zrv-ia-kpi" role="group" aria-label="Hiring decision summary">
        <Stat
          icon="layers"
          label="Requisitions"
          value={summary.requisitions}
          hint="with passed candidates"
        />
        <Stat icon="users" label="Candidates" value={summary.total} hint="approved and passed" />
        <Stat
          icon="badge-check"
          label="Offer-ready"
          value={summary.ready}
          tone="mint"
          hint={`${percentOf(summary.ready, summary.total)}% of candidates`}
        />
        <Stat
          icon="alert-triangle"
          label="Needs review"
          value={summary.review}
          tone="amber"
          hint={summary.review ? 'a rating group is Poor' : 'nothing flagged'}
        />
        <Stat
          icon="clock"
          label="Longest wait"
          value={summary.oldest}
          unit="days"
          tone="primary"
          hint="since the interview"
        />
      </div>
    </div>
  )
}

// Nothing to review yet: one short sentence of what this page waits for, and
// where the missing step actually happens.
function Empty() {
  return (
    <div className="zrv-ia-empty">
      <span className="zrv-ia-empty__icon">
        <OrvexaIcon name="inbox" size={17} />
      </span>
      <div>
        <b>No passed assessments to review yet</b>
        <p>An assessment appears here once it is approved and its outcome is recorded as Passed.</p>
        <small>
          Approve a passed assessment in the assessment report, then open this page again.
        </small>
      </div>
    </div>
  )
}

// A content-shaped wait: the same KPI strip and requisition cards the page will
// show, drawn as quiet shimmer placeholders so nothing jumps when data lands.
function Loading() {
  return (
    <div className="zrv-ia-skeleton" role="status" aria-live="polite">
      <span className="zrv-hr-sr">Loading hiring suggestions.</span>
      <div className="zrv-ia-skeleton__kpis" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="zrv-ia-skeleton__stat" key={index}>
            <span className="zrv-hs-skel zrv-hs-skel--label" />
            <span className="zrv-hs-skel zrv-hs-skel--value" />
            <span className="zrv-hs-skel zrv-hs-skel--hint" />
          </div>
        ))}
      </div>
      <div className="zrv-ia-skeleton__cards" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="zrv-ia-skeleton__card" key={index}>
            <div className="zrv-ia-skeleton__card-top">
              <span className="zrv-hs-skel zrv-hs-skel--title" />
              <span className="zrv-hs-skel zrv-hs-skel--chevron" />
            </div>
            <span className="zrv-hs-skel zrv-hs-skel--req" />
            <span className="zrv-hs-skel zrv-hs-skel--meter" />
            <div className="zrv-ia-skeleton__card-foot">
              <span className="zrv-hs-skel zrv-hs-skel--foot" />
              <span className="zrv-hs-skel zrv-hs-skel--foot-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// The standalone Hiring suggestions page content. Approved, passed assessments
// are grouped by requisition; opening one shows its candidates, and two or more
// candidates for one requisition can be compared side by side.
export function InterviewSuggestions() {
  const id = useId()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', groups: [], error: '' })
  const [selected, setSelected] = useState('')
  const [pick, setPick] = useState({ requisitionNo: '', ids: [] })
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeApiRetry(() => setVersion((value) => value + 1)), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const load = async () => {
      try {
        const listed = await loadAll(controller.signal)
        const groups = groupByRequisition(listed, businessToday())
        if (!active) return
        setState({ status: 'ready', groups, error: '' })
        setSelected((current) =>
          groups.some((group) => group.requisitionNo === current) ? current : '',
        )
        setPick((current) =>
          groups.some((group) => group.requisitionNo === current.requisitionNo)
            ? current
            : { requisitionNo: '', ids: [] },
        )
      } catch (error) {
        if (active && error?.name !== 'AbortError')
          setState({
            status: 'error',
            groups: [],
            error:
              error?.code === 'INVALID_RESPONSE'
                ? 'Some assessment data could not be read. Refresh the suggestions to try again.'
                : error?.message || 'Hiring suggestions could not be loaded.',
          })
      }
    }

    load()
    return () => {
      active = false
      controller.abort()
    }
  }, [version])

  const peopleRef = useRef(null)
  // Six picked people cannot fit the fixed tray, so the strip between the
  // count and the actions scrolls sideways. The wheel over it moves the
  // strip, never the page — but only while the strip can still move that
  // way; at either end the page keeps its normal scroll.
  useEffect(() => {
    const list = peopleRef.current
    if (!list) return undefined
    const onWheel = (event) => {
      if (event.deltaY === 0) return
      const maxScroll = list.scrollWidth - list.clientWidth
      if (maxScroll <= 0) return
      const canMove = event.deltaY > 0 ? list.scrollLeft < maxScroll - 1 : list.scrollLeft > 1
      if (!canMove) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1
      list.scrollLeft += event.deltaY * unit
      event.preventDefault()
    }
    list.addEventListener('wheel', onWheel, { passive: false })
    return () => list.removeEventListener('wheel', onWheel)
  }, [state.status, pick.ids.length])

  const retry = () => {
    setState({ status: 'loading', groups: [], error: '' })
    setVersion((value) => value + 1)
  }

  const activePickGroup = state.groups.find((group) => group.requisitionNo === pick.requisitionNo)
  const pickedPeople =
    activePickGroup && pick.ids.length
      ? pick.ids
          .map((assessmentId) =>
            activePickGroup.candidates.find((candidate) => candidate.assessmentId === assessmentId),
          )
          .filter(Boolean)
      : []
  const removePick = (assessmentId) =>
    setPick((current) => ({
      ...current,
      ids: current.ids.filter((id) => id !== assessmentId),
    }))
  const clearPick = () => setPick({ requisitionNo: '', ids: [] })
  const comparePicked = () => {
    if (!activePickGroup || pick.ids.length < 2) return
    navigate(
      `${COMPARE_PATH}?ids=${pick.ids.join(',')}&requisition=${encodeURIComponent(activePickGroup.requisitionNo)}`,
    )
  }

  return (
    <section
      className={`zrv-ia-suggestions zrv-ia-suggestions--page${pickedPeople.length ? ' zrv-ia-has-tray' : ''}`}
      aria-labelledby="interview-suggestions-title"
    >
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>
                <Link to={REPORT_PATH}>Assessment report</Link>
              </li>
              <li aria-current="page">Hiring suggestions</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title" id="interview-suggestions-title">
            Hiring suggestions
          </h1>
        </div>
        <div className="zrv-ir-head__actions">
          <button
            type="button"
            className="zrv-ir-btn"
            onClick={retry}
            disabled={state.status === 'loading'}
          >
            <OrvexaIcon name="refresh-cw" size={15} />
            Refresh
          </button>
          <button type="button" className="zrv-ir-btn" onClick={() => window.print()}>
            <OrvexaIcon name="printer" size={15} />
            Print
          </button>
        </div>
      </header>

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && !getApiUnavailableError() && (
        <div className="zrv-ia-suggestions__error" role="alert">
          <span>
            <b>Suggestions are temporarily unavailable</b>
            <small>{state.error}</small>
          </span>
          <button type="button" className="zrv-ir-btn" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && !state.groups.length && <Empty />}
      {state.status === 'ready' && state.groups.length > 0 && (
        <>
          <Overview groups={state.groups} />
          <div className="zrv-ia-suggestions__grid">
            {state.groups.map((group, index) => {
              const { total: candidates, ready, review, oldest } = group.summary
              const expanded = selected === group.requisitionNo
              const detailId = `${id}-detail-${index}`
              const comparable = group.candidates.length > 1
              const picked = pick.requisitionNo === group.requisitionNo ? pick.ids : []
              const togglePick = (assessmentId) =>
                setPick((current) => {
                  const currentIds =
                    current.requisitionNo === group.requisitionNo ? current.ids : []
                  if (!currentIds.includes(assessmentId) && currentIds.length >= MAX_COMPARE)
                    return current
                  return {
                    requisitionNo: group.requisitionNo,
                    ids: currentIds.includes(assessmentId)
                      ? currentIds.filter((item) => item !== assessmentId)
                      : [...currentIds, assessmentId],
                  }
                })
              return (
                <article
                  key={group.requisitionNo}
                  className={`zrv-ia-card${expanded ? ' zrv-ia-is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="zrv-ia-card__trigger"
                    onClick={() =>
                      setSelected((value) =>
                        value === group.requisitionNo ? '' : group.requisitionNo,
                      )
                    }
                    aria-expanded={expanded}
                    aria-controls={expanded ? detailId : undefined}
                  >
                    <span className="zrv-ia-card__main">
                      <span className="zrv-ia-card__top">
                        <span className="zrv-ia-card__position">
                          {group.position || 'Position unavailable'}
                        </span>
                        <span className="zrv-ia-card__chevron">
                          <OrvexaIcon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
                        </span>
                      </span>
                      <span className="zrv-ia-card__req">{group.requisitionNo}</span>
                    </span>
                    <span className="zrv-ia-card__stats">
                      <span className="zrv-ia-card__meter" aria-hidden="true">
                        <i className="zrv-ia-is-ready" style={{ flexGrow: ready }} />
                        <i className="zrv-ia-is-review" style={{ flexGrow: review }} />
                      </span>
                      <span className="zrv-ia-card__foot">
                        <span>
                          <b>{candidates}</b> {candidates === 1 ? 'candidate' : 'candidates'}
                        </span>
                        <span>
                          {ready} ready{review > 0 ? ` · ${review} review` : ''}
                        </span>
                      </span>
                    </span>
                  </button>
                  {expanded && (
                    <section className="zrv-ia-detail" id={detailId} aria-live="polite">
                      <header className="zrv-ia-detail__head">
                        <span className="zrv-ia-detail__eyebrow">
                          Candidate evidence · {group.requisitionNo}
                          {oldest != null
                            ? ` · waiting up to ${oldest} ${oldest === 1 ? 'day' : 'days'}`
                            : ''}
                        </span>
                        <div className="zrv-ia-detail__actions">
                          {comparable && (
                            <span className="zrv-ia-detail__pick" aria-live="polite">
                              {picked.length ? (
                                <>
                                  {picked.length} of {candidates} selected
                                  <em className="zrv-ia-detail__hint">
                                    Compare bar below
                                    <OrvexaIcon name="arrow-down" size={11} />
                                  </em>
                                </>
                              ) : (
                                'Click candidates to compare'
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            className="zrv-ir-btn"
                            onClick={() => setSelected('')}
                          >
                            Close
                          </button>
                        </div>
                      </header>
                      <InterviewCandidateComparison
                        candidates={group.candidates}
                        selectable={comparable}
                        selectedIds={picked}
                        onToggle={togglePick}
                      />
                    </section>
                  )}
                </article>
              )
            })}
          </div>
          {pickedPeople.length > 0 && (
            <aside className="zrv-ia-tray" aria-label="Candidates selected for comparison">
              <div className="zrv-ia-tray__inner">
                <span className="zrv-ia-tray__count" aria-live="polite">
                  <b>{pickedPeople.length}</b> of {MAX_COMPARE} selected
                </span>
                <ul
                  className="zrv-ia-tray__people"
                  ref={peopleRef}
                  tabIndex={0}
                  aria-label="Selected candidates; scrolls sideways"
                >
                  {pickedPeople.map((person) => {
                    const name =
                      person.candidateName || person.assessmentNumber || person.assessmentId
                    return (
                      <li key={person.assessmentId}>
                        <span className="zrv-ia-tray__avatar" aria-hidden="true">
                          {initials(person.candidateName) || '—'}
                        </span>
                        <span className="zrv-ia-tray__who">
                          <b>{name}</b>
                          {person.assessmentNumber && <small>{person.assessmentNumber}</small>}
                        </span>
                        <button
                          type="button"
                          className="zrv-ia-tray__remove"
                          aria-label={`Remove ${name} from the comparison`}
                          title={`Remove ${name}`}
                          onClick={() => removePick(person.assessmentId)}
                        >
                          <OrvexaIcon name="x" size={13} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <div className="zrv-ia-tray__actions">
                  <button type="button" className="zrv-ia-tray__clear" onClick={clearPick}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="zrv-ir-btn zrv-ia-tray__compare"
                    onClick={comparePicked}
                    disabled={pickedPeople.length < 2}
                  >
                    <OrvexaIcon name="columns-2" size={17} />
                    {pickedPeople.length < 2
                      ? `Select ${2 - pickedPeople.length} more to compare`
                      : `Compare ${pickedPeople.length} candidates`}
                    <OrvexaIcon name="arrow-right" size={17} />
                  </button>
                </div>
              </div>
            </aside>
          )}
        </>
      )}
      <details className="zrv-ia-how">
        <summary>How this is calculated</summary>
        <ul>
          <li>Only approved assessments with a Passed outcome are listed.</li>
          <li>
            Personal specification is scored out of {SCORE_MAX.spec} (Good from {BANDS.spec[1][0]},
            Outstanding from {BANDS.spec[2][0]}); competency out of {SCORE_MAX.comp} (Good from{' '}
            {BANDS.comp[1][0]}, Outstanding from {BANDS.comp[2][0]}).
          </li>
          <li>
            A candidate is offer-ready when neither score group is in the Poor band; otherwise HR
            reads the interviewer remarks before deciding.
          </li>
          <li>
            No combined score, weighting or ranking is used. Suggestions never approve an assessment
            or create an employment offer.
          </li>
        </ul>
      </details>
    </section>
  )
}
