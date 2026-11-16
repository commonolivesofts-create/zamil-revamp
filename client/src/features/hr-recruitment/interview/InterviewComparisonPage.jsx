import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { INTERVIEW_TEXT } from '../hrRecruitmentText.js'
import { businessToday, initials } from '../shared/hrFormat.js'
import { CreateEmploymentOffer } from './CreateEmploymentOffer.jsx'
import {
  comparisonCriteria,
  comparisonIds,
  comparisonRoster,
  comparisonScope,
  noteSections,
  profileSections,
  totalsOf,
} from './interviewComparisonModel.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/hr-interview-comparison.css'

const service = hrRecruitmentServices.interviews
const SUGGESTIONS_PATH = '/hr/recruitment/interview/suggestions'
const DECISION_TONE = Object.freeze({ READY: 'ok', REVIEW: 'warn' })
const BAND_TONE = Object.freeze({ POOR: 'bad', GOOD: 'good', OUTSTANDING: 'great' })
// With one column left there is nothing to compare, so two always stay shown.
const MIN_COLUMNS = 2
const DASH = '—'

const statusText = (record) =>
  INTERVIEW_TEXT.status[record.status] || record.status || 'Status unavailable'
const outcomeText = (record) => INTERVIEW_TEXT.outcomes[record.outcome] || 'No outcome recorded'
const signatureOf = (value) =>
  value.na ? 'na' : Number.isInteger(value.rating) ? value.rating : 'none'
const ratingRowDiffers = (row) => new Set(row.values.map(signatureOf)).size > 1
const detailRowDiffers = (row) => new Set(row.values.map((value) => String(value).trim())).size > 1
// Wide enough that every fixed candidate column gets its own readable column.
// The label width must match `.zrv-ix-col--label` in the stylesheet, otherwise
// the pinned candidate strip drifts a few pixels left of the table columns.
const LABEL_COLUMN_WIDTH = 232
const CANDIDATE_COLUMN_WIDTH = 184
const tableMinWidth = (columns) => `${LABEL_COLUMN_WIDTH + columns * CANDIDATE_COLUMN_WIDTH}px`

// The header: who is being compared. It mirrors the assessment report header —
// breadcrumb, title and the page action, with no enclosing card.
function Headline({ records }) {
  const position = records.find((record) => record.positionTitle)?.positionTitle
  const title =
    position || `Comparing ${records.length} ${records.length === 1 ? 'candidate' : 'candidates'}`
  return (
    <header className="zrv-ir-head">
      <div className="zrv-ir-head__title">
        <nav aria-label="Breadcrumb">
          <ol className="zrv-ir-crumb">
            <li>
              <Link to={SUGGESTIONS_PATH}>Hiring suggestions</Link>
            </li>
            <li aria-current="page">Candidate comparison</li>
          </ol>
        </nav>
        <h1 className="zrv-hr-title">{title}</h1>
      </div>
      <div className="zrv-ir-head__actions">
        <button type="button" className="zrv-ir-btn" onClick={() => window.print()}>
          <OrvexaIcon name="printer" size={15} />
          Print
        </button>
      </div>
    </header>
  )
}

// Quick links for the long page, so a reviewer can move between the scores,
// the recorded facts and the written notes.
function SectionJump() {
  const links = [
    ['#ix-scores', 'Scores'],
    ['#ix-profile', 'Profile'],
    ['#ix-notes', 'Notes'],
  ]
  return (
    <nav className="zrv-ix-jump" aria-label="On this page">
      <span>
        <OrvexaIcon name="arrow-down" size={12} />
        Jump to
      </span>
      {links.map(([href, label]) => (
        <a key={href} href={href}>
          {label}
        </a>
      ))}
    </nav>
  )
}

// A page-wide candidate header. The column panels stay below the app header,
// and the horizontal scroll position is shared with every comparison table.
function StickyCandidateRail({
  roster,
  hidden,
  onToggle,
  onShowAll,
  activeColumn,
  focus,
  onToggleFocus,
  onClearFocus,
}) {
  const railRef = useRef(null)
  const visibleCount = roster.length
  const locked = visibleCount <= MIN_COLUMNS
  const focusActive = focus.length === 2
  const focusSet = new Set(focus)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return undefined
    // The rail now sits inside the score block, but every table on the page
    // still shares one horizontal scroll position.
    const root = rail.closest('.zrv-ix') || rail.parentElement
    if (!root) return undefined
    let syncing = false
    let wraps = []
    const onScroll = (event) => {
      if (syncing) return
      syncing = true
      const left = event.currentTarget.scrollLeft
      rail.scrollLeft = left
      wraps.forEach((other) => {
        if (other !== event.currentTarget) other.scrollLeft = left
      })
      syncing = false
    }
    const bind = () => {
      wraps.forEach((wrap) => wrap.removeEventListener('scroll', onScroll))
      wraps = Array.from(root.querySelectorAll('[data-ix-tablewrap]'))
      wraps.forEach((wrap) => wrap.addEventListener('scroll', onScroll, { passive: true }))
    }
    bind()
    // Differences-only can replace or remove tables, so rebind as the DOM changes.
    const observer = new MutationObserver(bind)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      wraps.forEach((wrap) => wrap.removeEventListener('scroll', onScroll))
    }
  }, [roster.length])

  return (
    <div
      className="zrv-ix-sticky"
      role="region"
      aria-label="The visible candidate columns stay below the navigation while scrolling"
    >
      <div ref={railRef} className="zrv-ix-sticky__rail">
        <div
          className="zrv-ix-sticky__grid"
          style={{
            minWidth: tableMinWidth(roster.length),
            gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px repeat(${roster.length}, minmax(0, 1fr))`,
          }}
        >
          <span className="zrv-ix-sticky__label">
            <OrvexaIcon name={focus.length ? 'focus' : 'columns-2'} size={12} />
            {focus.length ? (
              <span>
                <b>{focus.length}</b> of 2 focused
              </span>
            ) : (
              <span>
                <b>{visibleCount}</b> shown
              </span>
            )}
            {focus.length ? (
              <button
                type="button"
                className="zrv-ix-sticky__show"
                onClick={onClearFocus}
                aria-label="Clear the focused candidates"
                title="Clear the focused candidates"
              >
                <OrvexaIcon name="x" size={12} />
                Clear
              </button>
            ) : (
              hidden.size > 0 && (
                <button
                  type="button"
                  className="zrv-ix-sticky__show"
                  onClick={onShowAll}
                  aria-label={`Show all ${hidden.size} hidden ${hidden.size === 1 ? 'candidate' : 'candidates'}`}
                  title={`Show all ${hidden.size} hidden ${hidden.size === 1 ? 'candidate' : 'candidates'}`}
                >
                  <OrvexaIcon name="eye-off" size={12} />
                  {hidden.size}
                </button>
              )
            )}
          </span>
          {roster.map((candidate, index) => (
            <span
              key={candidate.id}
              className={`zrv-ix-sticky__cand zrv-ix-tone-${candidate.tone}${activeColumn === index ? ' is-active' : ''}${focusSet.has(candidate.id) ? ' is-focused' : ''}`}
            >
              <span className="zrv-ix-sticky__top">
                <span className="zrv-ix-sticky__head">
                  <ColumnHead candidate={candidate} />
                </span>
                <span className="zrv-ix-sticky__buttons">
                  {!focusActive && visibleCount > 2 && (
                    <button
                      type="button"
                      className="zrv-ix-sticky__focus"
                      aria-pressed={focusSet.has(candidate.id)}
                      aria-label={
                        focusSet.has(candidate.id)
                          ? `Remove ${candidate.name} from the focused pair`
                          : `Focus ${candidate.name} beside one other candidate`
                      }
                      title={
                        focusSet.has(candidate.id)
                          ? 'Remove from focus'
                          : 'Focus two candidates side by side'
                      }
                      onClick={() => onToggleFocus(candidate.id)}
                    >
                      <OrvexaIcon name="focus" size={13} />
                    </button>
                  )}
                  {!focusActive && (
                    <button
                      type="button"
                      className="zrv-ix-sticky__toggle"
                      aria-label={
                        locked
                          ? `At least ${MIN_COLUMNS} candidates stay in the comparison`
                          : `Hide ${candidate.name}`
                      }
                      title={
                        locked
                          ? `At least ${MIN_COLUMNS} candidates stay in the comparison`
                          : `Hide ${candidate.name}`
                      }
                      disabled={locked}
                      onClick={() => onToggle(candidate.id)}
                    >
                      <OrvexaIcon name="eye" size={14} />
                    </button>
                  )}
                </span>
              </span>
              <CandidateSummary candidate={candidate} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// A candidate's identity as a table column heading, so every column is
// attributable while scrolling through the fact tables.
function ColumnHead({ candidate }) {
  return (
    <span className="zrv-ix-colhead">
      <span className="zrv-ix-colhead__avatar" aria-hidden="true">
        {initials(candidate.name)}
      </span>
      <span className="zrv-ix-colhead__who">
        <b>{candidate.name}</b>
        {candidate.number && <small>{candidate.number}</small>}
      </span>
    </span>
  )
}

// The same headline facts for each candidate, kept in the pinned strip so the
// columns can be read before any criterion is scrolled to: both totals, how
// much of the assessment is filled in, and the decision.
function CandidateSummary({ candidate }) {
  const spec = candidate.spec
  const comp = candidate.comp
  const answered = spec.answered + comp.answered
  const count = spec.count + comp.count
  const percent = count ? Math.round((answered / count) * 100) : 0
  const complete = count > 0 && answered === count
  const tone = DECISION_TONE[candidate.decision.key] ?? 'warn'
  return (
    <span className="zrv-ix-summary">
      <span
        className={`zrv-ix-summary__ring${complete ? ' is-complete' : ''}`}
        style={{ '--ix-fill': `${percent}%` }}
        role="img"
        aria-label={`${answered} of ${count} criteria scored`}
        title={`${answered} of ${count} criteria scored`}
      />
      <span className="zrv-ix-summary__scores">
        <span
          className="zrv-ix-summary__score"
          title={`Personal specification ${spec.rated ? spec.total : 0} of ${spec.max}`}
        >
          <small>Spec</small>
          <b>{spec.rated ? spec.total : DASH}</b>
          <i>/{spec.max}</i>
        </span>
        <span
          className="zrv-ix-summary__score"
          title={`Competency ${comp.rated ? comp.total : 0} of ${comp.max}`}
        >
          <small>Comp</small>
          <b>{comp.rated ? comp.total : DASH}</b>
          <i>/{comp.max}</i>
        </span>
      </span>
      <span className={`zrv-ix-summary__scored${complete ? ' is-complete' : ''}`}>
        {answered}/{count}
      </span>
      <span className={`zrv-ix-pill zrv-ix-pill--${tone}`} title={candidate.decision.reason}>
        {candidate.decision.label}
      </span>
    </span>
  )
}

// A rating as a large value and a simple progress scale, so the row can be
// scanned at a glance. `lead` marks the highest value in that one criterion —
// never an overall ranking.
function Rating({ rating, na, lead }) {
  if (!Number.isInteger(rating)) {
    return (
      <span
        className={`zrv-ix-rating zrv-ix-rating--none${na ? ' is-na' : ''}`}
        title={na ? 'Not applicable' : 'Not rated'}
      >
        <span className="zrv-ix-rating__none">{na ? 'N/A' : 'Not rated'}</span>
      </span>
    )
  }
  const tone = rating <= 2 ? 'bad' : rating === 3 ? 'warn' : 'good'
  return (
    <span className={`zrv-ix-rating zrv-ix-rating--${tone}`} title={`${rating} of 5`}>
      <span className="zrv-ix-rating__score">
        <b>{rating}</b>
        <small>of 5</small>
      </span>
      <span className="zrv-ix-rating__track" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <i key={step} className={step <= rating ? 'is-on' : ''} />
        ))}
      </span>
      {lead && <span className="zrv-ix-rating__lead">Best</span>}
    </span>
  )
}

// A score group's total against its maximum, with a scale and its band.
function GroupTotal({ group }) {
  if (!group.rated) return <span className="zrv-ix-muted">Not scored</span>
  const label = group.complete ? (INTERVIEW_TEXT.bands[group.band] ?? '') : 'Incomplete'
  const tone = group.complete ? (BAND_TONE[group.band] ?? 'muted') : 'muted'
  const percent = Math.max(0, Math.min(100, Math.round((group.total / group.max) * 100)))
  return (
    <span className="zrv-ix-group-score" title={`${group.total} out of ${group.max}, ${label}`}>
      <span className="zrv-ix-group-score__head">
        <span className={`zrv-ix-band zrv-ix-band--${tone}`}>{label}</span>
        <span className="zrv-ix-group-score__value">
          <b>{group.total}</b>
          <small>/{group.max}</small>
        </span>
      </span>
      <span className="zrv-ix-group-score__track" aria-hidden="true">
        <i
          className={`zrv-ix-group-score__fill zrv-ix-group-score__fill--${tone}`}
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  )
}

function Block({ id, icon, title, note, tools, children, bodyClass = '' }) {
  return (
    <section id={id} className="zrv-ix-block" aria-labelledby={`${id}-title`}>
      <header className="zrv-ix-block__head">
        <div className="zrv-ix-block__title">
          <h2 id={`${id}-title`}>
            <OrvexaIcon name={icon} size={16} />
            {title}
          </h2>
          {note && <p>{note}</p>}
        </div>
        {tools && <div className="zrv-ix-block__tools">{tools}</div>}
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

function Toggle({ pressed, onClick, icon, children }) {
  return (
    <button type="button" className="zrv-ix-toggle" aria-pressed={pressed} onClick={onClick}>
      <OrvexaIcon name={icon} size={13} />
      {children}
    </button>
  )
}

// The score detail: one row per criterion, one column per candidate, with the
// group total shown in each score group's own band. "Differences only" removes
// rows where every visible candidate has the same rating, and the remarks
// toggle keeps the interviewer's remarks on hand without making every row tall.
function ScoreComparison({
  records,
  roster,
  activeColumn,
  onColumnHover,
  hidden,
  onToggleColumn,
  onShowAll,
  focus,
  onToggleFocus,
  onClearFocus,
}) {
  const [diffOnly, setDiffOnly] = useState(false)
  const [showRemarks, setShowRemarks] = useState(false)
  const groups = comparisonCriteria(records)
  const totals = records.map(totalsOf)
  const hasRemarks = groups.some((group) =>
    group.rows.some((row) => row.values.some((value) => value.remark)),
  )
  const remarksCount = groups.reduce(
    (count, group) =>
      count + group.rows.filter((row) => row.values.some((value) => value.remark)).length,
    0,
  )
  const differing = groups.reduce(
    (count, group) => count + group.rows.filter(ratingRowDiffers).length,
    0,
  )
  const columnProps = (index, baseClass = '') => ({
    className: [
      baseClass,
      'zrv-ix-cand-cell',
      `zrv-ix-tone-${roster[index]?.tone ?? 0}`,
      activeColumn === index ? 'zrv-ix-col-active' : '',
    ]
      .filter(Boolean)
      .join(' '),
    onMouseEnter: () => onColumnHover(index),
    onMouseLeave: () => onColumnHover(null),
  })

  return (
    <>
      <header className="zrv-ix-block__head zrv-ix-scorehead" id="ix-scores">
        <div className="zrv-ix-block__title">
          <h2 id="ix-scores-title">
            <OrvexaIcon name="chart-column" size={16} />
            Score comparison
          </h2>
          <p>
            Each criterion is scored 1–5. “Best” marks the highest value for that one criterion — it
            is not an overall ranking.
          </p>
        </div>
        <div className="zrv-ix-block__tools">
          <Toggle
            pressed={diffOnly}
            onClick={() => setDiffOnly((value) => !value)}
            icon="list-filter"
          >
            Differences only{differing ? ` · ${differing}` : ''}
          </Toggle>
          {hasRemarks && (
            <Toggle
              pressed={showRemarks}
              onClick={() => setShowRemarks((value) => !value)}
              icon="message-square"
            >
              Remarks{remarksCount ? ` · ${remarksCount}` : ''}
            </Toggle>
          )}
        </div>
      </header>
      <StickyCandidateRail
        roster={roster}
        hidden={hidden}
        onToggle={onToggleColumn}
        onShowAll={onShowAll}
        activeColumn={activeColumn}
        focus={focus}
        onToggleFocus={onToggleFocus}
        onClearFocus={onClearFocus}
      />
      <section className="zrv-ix-block zrv-ix-scorecard" aria-labelledby="ix-scores-title">
        {diffOnly && !differing ? (
          <p className="zrv-ix-empty">
            Every visible candidate has the same rating for all criteria. Turn off “Differences
            only” to see the full scorecard.
          </p>
        ) : (
          <div className="zrv-ix-tablescroll" data-ix-frame>
            <div className="zrv-ix-tablewrap" data-ix-tablewrap>
              <table
                className="zrv-ix-table zrv-ix-table--scores"
                style={{ minWidth: tableMinWidth(roster.length) }}
              >
                <caption className="zrv-hr-sr">
                  Every interview criterion for each selected candidate; the candidate columns stay
                  pinned below the navigation while scrolling
                </caption>
                <colgroup>
                  <col className="zrv-ix-col--label" />
                  {roster.map((column) => (
                    <col key={column.id} className="zrv-ix-col--candidate" />
                  ))}
                </colgroup>
                <thead className="zrv-hr-sr">
                  <tr>
                    <th scope="col">Criterion</th>
                    {roster.map((column) => (
                      <th key={column.id} scope="col">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const rows = diffOnly ? group.rows.filter(ratingRowDiffers) : group.rows
                    return (
                      <Fragment key={group.key}>
                        <tr className="zrv-ix-group">
                          <th scope="row">
                            <span>{group.title}</span>
                            <small>
                              {group.rows.length} criteria · total {group.max}
                            </small>
                          </th>
                          {totals.map((total, index) => (
                            <td key={roster[index].id} {...columnProps(index)}>
                              <GroupTotal group={total[group.key]} />
                            </td>
                          ))}
                        </tr>
                        {rows.length ? (
                          rows.map((row) => (
                            <tr key={row.key}>
                              <th scope="row">{row.label}</th>
                              {row.values.map((value, index) => (
                                <td key={roster[index].id} {...columnProps(index)}>
                                  <span className="zrv-ix-rating-wrap">
                                    <Rating
                                      rating={value.rating}
                                      na={value.na}
                                      lead={row.lead?.includes(index)}
                                    />
                                    {showRemarks && value.remark && (
                                      <small className="zrv-ix-remark">{value.remark}</small>
                                    )}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr className="zrv-ix-row--empty">
                            <th scope="row">
                              No differences<small>Ratings match across candidates.</small>
                            </th>
                            {roster.map((column, index) => (
                              <td key={column.id} {...columnProps(index)}>
                                <span className="zrv-ix-muted">Same</span>
                              </td>
                            ))}
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  <tr className="zrv-ix-row--action">
                    <th scope="row">
                      Decision & action<small>Ready when approved pass</small>
                    </th>
                    {roster.map((candidate, index) => {
                      const record = records[index]
                      const tone = DECISION_TONE[candidate.decision.key]
                      return (
                        <td key={candidate.id} {...columnProps(index)}>
                          <span className="zrv-ix-action">
                            <span
                              className={`zrv-ix-pill zrv-ix-pill--${tone}`}
                              title={candidate.decision.reason}
                            >
                              {candidate.decision.label}
                            </span>
                            <small>
                              {statusText(record)} · {outcomeText(record)}
                            </small>
                            {candidate.wait != null && (
                              <small>
                                {candidate.wait} {candidate.wait === 1 ? 'day' : 'days'} waiting
                              </small>
                            )}
                            <CreateEmploymentOffer row={record} compact />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

// Detail sections get their own card and icon, so the block is a clear sequence
// rather than one long undifferentiated table.
const PROFILE_META = Object.freeze({
  identity: { icon: 'user-round', description: 'Recorded status, result and background.' },
  experience: { icon: 'briefcase', description: 'Employer, position and relevant experience.' },
  salary: {
    icon: 'banknote',
    description: 'Current and expected compensation, including the joining date.',
  },
  interview: { icon: 'calendar-days', description: 'Interview setup, division and panel.' },
})

function ProfileValue({ field, value }) {
  if (value === DASH) {
    return (
      <span className="zrv-ix-detail zrv-ix-detail--empty" title="Not recorded">
        —
      </span>
    )
  }
  if (field === 'change') {
    const amount = Number.parseFloat(String(value).replace('%', ''))
    const tone = Number.isFinite(amount)
      ? amount > 0
        ? 'up'
        : amount < 0
          ? 'down'
          : 'same'
      : 'same'
    return (
      <span
        className={`zrv-ix-delta zrv-ix-delta--${tone}`}
        title="Change from current to expected total compensation"
      >
        {value}
      </span>
    )
  }
  return <span className="zrv-ix-detail">{value}</span>
}

// Recorded facts as four focused cards. Each card keeps the same candidate
// column widths, and every card scrolls in sync with the rest of the page.
function DetailComparison({ records, roster, activeColumn, onColumnHover }) {
  const [diffOnly, setDiffOnly] = useState(false)
  const sections = profileSections(records)
  const differing = sections.reduce(
    (count, section) => count + section.rows.filter(detailRowDiffers).length,
    0,
  )
  const shown = sections
    .map((section) => ({
      ...section,
      rows: diffOnly ? section.rows.filter(detailRowDiffers) : section.rows,
    }))
    .filter((section) => section.rows.length)
  const columnProps = (index, baseClass = '') => ({
    className: [
      baseClass,
      'zrv-ix-cand-cell',
      `zrv-ix-tone-${roster[index]?.tone ?? 0}`,
      activeColumn === index ? 'zrv-ix-col-active' : '',
    ]
      .filter(Boolean)
      .join(' '),
    onMouseEnter: () => onColumnHover(index),
    onMouseLeave: () => onColumnHover(null),
  })

  return (
    <Block
      id="ix-profile"
      icon="clipboard-list"
      title="Profile and expectations"
      note="Recorded details only; a dash means the value was not recorded. A small dot beside a detail means candidates differ."
      tools={
        <Toggle
          pressed={diffOnly}
          onClick={() => setDiffOnly((value) => !value)}
          icon="list-filter"
        >
          Differences only{differing ? ` · ${differing}` : ''}
        </Toggle>
      }
      bodyClass="zrv-ix-profile"
    >
      {!shown.length ? (
        <p className="zrv-ix-empty">Every visible candidate shares the same recorded details.</p>
      ) : (
        shown.map((section) => {
          const meta = PROFILE_META[section.key] ?? {
            icon: 'clipboard-list',
            description: 'Recorded details.',
          }
          const different = section.rows.filter(detailRowDiffers).length
          return (
            <section
              key={section.key}
              className="zrv-ix-profile-card"
              aria-labelledby={`ix-profile-${section.key}`}
            >
              <header className="zrv-ix-profile-card__head">
                <span className="zrv-ix-profile-card__icon">
                  <OrvexaIcon name={meta.icon} size={15} />
                </span>
                <span className="zrv-ix-profile-card__who">
                  <h3 id={`ix-profile-${section.key}`}>{section.title}</h3>
                  <p>{meta.description}</p>
                </span>
                <span
                  className={`zrv-ix-profile-card__count${different ? ' zrv-ix-profile-card__count--diff' : ''}`}
                >
                  {different
                    ? `${different} differ`
                    : `${section.rows.length} ${section.rows.length === 1 ? 'detail' : 'details'}`}
                </span>
              </header>
              <div className="zrv-ix-tablescroll" data-ix-frame>
                <div className="zrv-ix-tablewrap" data-ix-tablewrap>
                  <table
                    className="zrv-ix-table zrv-ix-table--details"
                    style={{ minWidth: tableMinWidth(roster.length) }}
                  >
                    <caption className="zrv-hr-sr">
                      {section.title} details for each selected candidate; the candidate columns
                      stay pinned below the navigation while scrolling
                    </caption>
                    <colgroup>
                      <col className="zrv-ix-col--label" />
                      {roster.map((column) => (
                        <col key={column.id} className="zrv-ix-col--candidate" />
                      ))}
                    </colgroup>
                    <thead className="zrv-hr-sr">
                      <tr>
                        <th scope="col">Detail</th>
                        {roster.map((column) => (
                          <th key={column.id} scope="col">
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row) => {
                        const differs = detailRowDiffers(row)
                        return (
                          <tr key={row.key} className={differs ? 'zrv-ix-row--diff' : undefined}>
                            <th scope="row">
                              {row.label}
                              {differs && (
                                <span className="zrv-ix-diff" title="Candidates differ here">
                                  <span className="zrv-hr-sr">Candidates differ here</span>
                                </span>
                              )}
                            </th>
                            {row.values.map((value, index) => (
                              <td key={roster[index].id} {...columnProps(index)}>
                                <ProfileValue field={row.key} value={value} />
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )
        })
      )}
    </Block>
  )
}

// The written evidence as one card per candidate. Long notes are easier to read
// in a card than squeezed into table cells, and empty sections stay out.
function NotesComparison({ records, roster }) {
  const notes = noteSections(records)
  return (
    <Block
      id="ix-notes"
      icon="message-square"
      title="Interviewer notes"
      note="The panel's written comments, exactly as recorded."
      bodyClass="zrv-ix-notes"
    >
      {roster.map((candidate, index) => {
        const written = notes
          .map((note) => ({ key: note.key, label: note.label, value: note.values[index] }))
          .filter((note) => note.value !== DASH)
        return (
          <article key={candidate.id} className="zrv-ix-note-card">
            <header className="zrv-ix-note-card__head">
              <span className="zrv-ix-colhead__avatar" aria-hidden="true">
                {initials(candidate.name)}
              </span>
              <span className="zrv-ix-colhead__who">
                <b>{candidate.name}</b>
                {candidate.number && <small>{candidate.number}</small>}
              </span>
            </header>
            {written.length ? (
              <dl>
                {written.map((note) => (
                  <Fragment key={note.key}>
                    <dt>{note.label}</dt>
                    <dd>{note.value}</dd>
                  </Fragment>
                ))}
              </dl>
            ) : (
              <p className="zrv-ix-note-card__empty">
                No written notes were recorded for this candidate.
              </p>
            )}
          </article>
        )
      })}
    </Block>
  )
}

// A content-shaped wait: the pinned candidate strip and the comparison blocks
// drawn as shimmer placeholders, so the page keeps its shape while it loads.
function Loading() {
  return (
    <div className="zrv-ix-skeleton" role="status" aria-live="polite">
      <span className="zrv-hr-sr">Loading the selected assessments.</span>
      <div className="zrv-ix-skeleton__head" aria-hidden="true">
        <span className="zrv-ix-skel zrv-ix-skel--crumb" />
        <span className="zrv-ix-skel zrv-ix-skel--title" />
      </div>
      <div className="zrv-ix-skeleton__rail" aria-hidden="true">
        <span className="zrv-ix-skel zrv-ix-skel--rail-label" />
        {[0, 1, 2].map((index) => (
          <span className="zrv-ix-skel zrv-ix-skel--rail-cand" key={index} />
        ))}
      </div>
      {[0, 1].map((block) => (
        <div className="zrv-ix-skeleton__block" key={block} aria-hidden="true">
          <div className="zrv-ix-skeleton__block-head">
            <span className="zrv-ix-skel zrv-ix-skel--heading" />
            <span className="zrv-ix-skel zrv-ix-skel--note" />
          </div>
          <div className="zrv-ix-skeleton__rows">
            {Array.from({ length: block === 0 ? 6 : 4 }, (_, row) => (
              <div className="zrv-ix-skeleton__row" key={row}>
                <span className="zrv-ix-skel zrv-ix-skel--row-label" />
                {[0, 1, 2].map((index) => (
                  <span className="zrv-ix-skel zrv-ix-skel--cell" key={index} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// The compare page: opened from the hiring suggestions panel with the chosen
// assessment IDs. It loads those assessments in full, so the comparison can use
// every criterion, the profile facts and the interviewer notes.
export default function InterviewComparisonPage() {
  const [params] = useSearchParams()
  const key = params.get('ids') ?? ''
  const ids = useMemo(() => comparisonIds(key), [key])
  const [state, setState] = useState({ status: 'loading', records: [], error: '' })
  const [version, setVersion] = useState(0)
  const [hidden, setHidden] = useState(() => new Set())
  const [activeColumn, setActiveColumn] = useState(null)
  const [focus, setFocus] = useState([])
  const pageRef = useRef(null)

  useEffect(() => {
    if (ids.length < 2) return undefined
    const controller = new AbortController()
    let active = true
    Promise.allSettled(ids.map((id) => service.getById(id, { signal: controller.signal }))).then(
      (results) => {
        if (!active) return
        const records = results
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value)
        if (!records.length) {
          const reason = results.find((result) => result.status === 'rejected')?.reason
          setState({
            status: 'error',
            records: [],
            error:
              reason?.code === 'INVALID_RESPONSE'
                ? 'Some assessment data could not be read. Try opening the comparison again from the report.'
                : reason?.message || 'The selected assessments could not be loaded.',
          })
          return
        }
        const missing = results.length - records.length
        setState({
          status: 'ready',
          records,
          error: missing
            ? `${missing} selected ${missing === 1 ? 'assessment' : 'assessments'} could not be loaded and ${missing === 1 ? 'is' : 'are'} not shown.`
            : '',
        })
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [ids, version])

  const retry = () => {
    setState({ status: 'loading', records: [], error: '' })
    setVersion((value) => value + 1)
  }

  // Edge fades on every horizontally scrollable table: they only appear on the
  // side that still has columns to reveal, so a clipped column is never a
  // surprise. The score and profile tables all share one scroll position.
  useEffect(() => {
    const root = pageRef.current
    if (!root) return undefined
    const resolve = (wrap) => {
      const frame = wrap.closest('[data-ix-frame]')
      if (!frame) return
      const max = wrap.scrollWidth - wrap.clientWidth
      if (max <= 1) frame.dataset.scroll = 'none'
      else if (wrap.scrollLeft <= 1) frame.dataset.scroll = 'start'
      else if (wrap.scrollLeft >= max - 1) frame.dataset.scroll = 'end'
      else frame.dataset.scroll = 'middle'
    }
    const update = () => root.querySelectorAll('[data-ix-tablewrap]').forEach(resolve)
    const seen = new WeakSet()
    const observer = new ResizeObserver(update)
    const attach = () => {
      root.querySelectorAll('[data-ix-tablewrap]').forEach((wrap) => {
        if (seen.has(wrap)) return
        seen.add(wrap)
        observer.observe(wrap)
      })
      update()
    }
    attach()
    const mutations = new MutationObserver(attach)
    mutations.observe(root, { childList: true, subtree: true })
    root.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      mutations.disconnect()
      root.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [state.status, state.records, hidden, focus])

  if (ids.length < 2) {
    return (
      <div className="zrv-hr zrv-ix">
        <div className="zrv-ix-state">
          <span className="zrv-ix-state__icon">
            <OrvexaIcon name="users" size={18} />
          </span>
          <div>
            <b>Choose at least two candidates to compare</b>
            <p>
              On the assessment report, tick candidates for the same position — from the table
              itself or from Hiring suggestions — then choose Compare.
            </p>
            <Link className="zrv-ix-link" to={SUGGESTIONS_PATH}>
              Back to hiring suggestions
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="zrv-hr zrv-ix">
        <Loading />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="zrv-hr zrv-ix">
        <div className="zrv-ix-state" role="alert">
          <span className="zrv-ix-state__icon">
            <OrvexaIcon name="alert-triangle" size={18} />
          </span>
          <div>
            <b>Comparison unavailable</b>
            <p>{state.error}</p>
            <div className="zrv-ix-state__actions">
              <button type="button" className="zrv-ir-btn" onClick={retry}>
                Try again
              </button>
              <Link className="zrv-ix-link" to={SUGGESTIONS_PATH}>
                Back to hiring suggestions
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // A comparison is only meaningful within one position. A hand-edited or
  // stale link that mixes requisitions is refused rather than shown.
  const scope = comparisonScope(state.records)
  if (scope.mixed) {
    return (
      <div className="zrv-hr zrv-ix">
        <div className="zrv-ix-state" role="alert">
          <span className="zrv-ix-state__icon">
            <OrvexaIcon name="alert-triangle" size={18} />
          </span>
          <div>
            <b>Different positions cannot be compared</b>
            <p>
              These assessments belong to {scope.labels.join(' · ')}. Compare candidates for one
              position at a time — open Hiring suggestions and tick candidates from the same
              requisition.
            </p>
            <div className="zrv-ix-state__actions">
              <Link className="zrv-ix-link" to={SUGGESTIONS_PATH}>
                Back to hiring suggestions
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const focusActive = focus.length === 2
  const focusSet = new Set(focus)
  const visible = state.records.filter((record) =>
    focusActive ? focusSet.has(record.assessmentId) : !hidden.has(record.assessmentId),
  )
  const rosterAll = comparisonRoster(state.records, businessToday())
  const roster = rosterAll.filter((column) =>
    focusActive ? focusSet.has(column.id) : !hidden.has(column.id),
  )

  const toggleColumn = (id) => {
    setActiveColumn(null)
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (visible.length > MIN_COLUMNS) next.add(id)
      return next
    })
  }

  const showAllCandidates = () => {
    setActiveColumn(null)
    setHidden(new Set())
  }

  // Focus keeps two candidates side by side and lets their columns take the
  // full width. A third pick is refused rather than silently replacing a pick.
  const toggleFocus = (id) => {
    setActiveColumn(null)
    setFocus((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= 2) return current
      return [...current, id]
    })
  }

  const clearFocus = () => {
    setActiveColumn(null)
    setFocus([])
  }

  return (
    <div className="zrv-hr zrv-ix" ref={pageRef}>
      <Headline records={state.records} />
      {state.error && (
        <p className="zrv-ix-warning" role="status">
          {state.error}
        </p>
      )}
      <SectionJump />
      <ScoreComparison
        records={visible}
        roster={roster}
        activeColumn={activeColumn}
        onColumnHover={setActiveColumn}
        hidden={hidden}
        onToggleColumn={toggleColumn}
        onShowAll={showAllCandidates}
        focus={focus}
        onToggleFocus={toggleFocus}
        onClearFocus={clearFocus}
      />
      <DetailComparison
        records={visible}
        roster={roster}
        activeColumn={activeColumn}
        onColumnHover={setActiveColumn}
      />
      <NotesComparison records={visible} roster={roster} />
    </div>
  )
}
