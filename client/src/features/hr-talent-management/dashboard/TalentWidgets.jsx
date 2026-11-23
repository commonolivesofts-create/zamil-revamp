import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { change } from '@/features/hr-recruitment/dashboard/dashboardModel.js'
import { TALENT_DASHBOARD_TEXT as T } from './talentDashboardText.js'

// The Talent Management dashboard's own widgets (styles/hr-talent-dashboard.css,
// `td-` classes). Values may be undefined while loading: they show a shimmer.
// Each area has one accent (--td-<area>), passed to a widget as --a.
//
// Motion follows the application: the Motion preference "reduced"
// (html[data-motion]) stops all of it; the system's reduced-motion setting
// keeps gentle effects (count-ups, fills, fades) and stops movement (tilt,
// drift, ticker). See motionLevel().

const U = T.ui
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const accent = (area) => ({ '--a': `var(--td-${area})` })

// 'full', 'gentle' (system reduced motion) or 'none' (the app's Motion: reduced).
function motionLevel() {
  if (typeof window === 'undefined') return 'none'
  if (document.documentElement.dataset.motion === 'reduced') return 'none'
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'gentle' : 'full'
}

// The number shown climbs to `value` (ease-out) whenever it changes; without
// motion it is `value` at once. State changes only in animation frames.
function useCountUp(value, duration = 1100) {
  const [still] = useState(() => motionLevel() === 'none')
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    if (still || typeof value !== 'number') return undefined
    const start = performance.now()
    const origin = from.current
    let frame
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      setShown(origin + (value - origin) * eased)
      if (progress < 1) frame = requestAnimationFrame(step)
      else from.current = value
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [still, value, duration])
  return still || typeof value !== 'number' ? (value ?? 0) : shown
}

export function Shimmer({ wide = false }) {
  return <span className={`td-shimmer${wide ? ' td-shimmer--wide' : ''}`} aria-hidden="true" />
}

// A counting number, percent or decimal; text as is; a dash when there is nothing to measure.
export function Value({ value, percent = false, decimals = 0, signed = false }) {
  const shown = useCountUp(typeof value === 'number' ? value : undefined)
  if (value === undefined) return <Shimmer />
  if (value === null) return <span className="td-value">–</span>
  if (typeof value === 'string') return <span className="td-value td-value--text">{value}</span>
  const rounded = decimals ? Number(shown.toFixed(decimals)) : Math.round(shown)
  return (
    <span className="td-value">
      <span className="td-sr">
        {signed && value > 0 ? '+' : ''}
        {fmt.format(value)}
        {percent ? '%' : ''}
      </span>
      <span aria-hidden="true">
        {signed && value > 0 ? '+' : ''}
        {fmt.format(rounded)}
        {percent && <small>%</small>}
      </span>
    </span>
  )
}

// Year-over-year change as a small pill.
export function Delta({ current, previous }) {
  const value = change(current, previous)
  if (value === null) return null
  const tone = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return (
    <span className={`td-delta td-delta--${tone}`} title={U.vsLastYear}>
      <OrvexaIcon
        name={tone === 'up' ? 'arrow-up-right' : tone === 'down' ? 'arrow-down-right' : 'minus'}
        size={12}
      />
      {value === Infinity ? U.newThisYear : `${Math.abs(value)}%`}
      <span className="td-sr"> {U.vsLastYear}</span>
    </span>
  )
}

// An internal route, or an external page (TrainingHub) in a new tab.
export function Go({ to, href, className, children, label }) {
  if (href)
    return (
      <a
        className={className}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
      >
        {children}
        <span className="td-sr"> {U.opensNewTab}</span>
      </a>
    )
  return (
    <Link className={className} to={to} aria-label={label}>
      {children}
    </Link>
  )
}

// Pointer-following light and a slight 3D tilt (full motion only), set as CSS
// variables on the element so moving the pointer never re-renders.
function usePointerGlow() {
  const ref = useRef(null)
  const onPointerMove = (event) => {
    const element = ref.current
    if (!element || event.pointerType === 'touch') return
    const box = element.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width
    const y = (event.clientY - box.top) / box.height
    element.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    element.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
    if (motionLevel() === 'full') {
      element.style.setProperty('--ry', `${((x - 0.5) * 4).toFixed(2)}deg`)
      element.style.setProperty('--rx', `${((0.5 - y) * 4).toFixed(2)}deg`)
    }
  }
  const onPointerLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  return { ref, onPointerMove, onPointerLeave }
}

// One area of the bento grid: icon, title, an optional badge, its link and body.
export function AreaCard({ area, icon, title, hint, to, href, className = '', badge, children }) {
  const id = useId()
  const { ref, onPointerMove, onPointerLeave } = usePointerGlow()
  return (
    <section
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`td-card td-card--area ${className}`}
      style={accent(area)}
      aria-labelledby={id}
    >
      <span className="td-card__light" aria-hidden="true" />
      <header className="td-card__head">
        <span className="td-card__icon" aria-hidden="true">
          <OrvexaIcon name={icon} size={18} />
        </span>
        <div className="td-card__title">
          <h2 id={id}>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        {(to || href) && (
          <Go to={to} href={href} className="td-card__open" label={`${U.open} ${title}`}>
            {U.open}
            <OrvexaIcon name={href ? 'arrow-up-right' : 'arrow-right'} size={14} />
          </Go>
        )}
      </header>
      {badge}
      {children}
    </section>
  )
}

// A small achievement badge on a card (e.g. policy aligned).
export function Badge({ tone = 'good', icon = 'sparkles', children }) {
  return (
    <span className={`td-badge td-badge--${tone}`}>
      <OrvexaIcon name={icon} size={12} />
      {children}
    </span>
  )
}

// A labelled figure inside a card, with an optional note.
export function Stat({ label, value, percent, decimals, note }) {
  return (
    <div className="td-stat">
      <span className="td-stat__label">{label}</span>
      <b className="td-stat__value">
        <Value value={value} percent={percent} decimals={decimals} />
      </b>
      {note && <small className="td-stat__note">{note}</small>}
    </div>
  )
}

// A progress ring that sweeps to its percent, the figure counting in the centre.
export function Ring({ value, caption, size = 132 }) {
  const radius = 52
  const length = 2 * Math.PI * radius
  const filled = typeof value === 'number' ? Math.min(100, value) : 0
  const gradient = useId()
  return (
    <div className="td-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="td-ring__stop-1" />
            <stop offset="100%" className="td-ring__stop-2" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={radius} className="td-ring__track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="td-ring__arc"
          stroke={`url(#${gradient})`}
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - filled / 100)}
        />
      </svg>
      <span className="td-ring__label">
        <b>
          <Value value={value} percent />
        </b>
        <small>{caption}</small>
      </span>
    </div>
  )
}

// The Talent Index: a gradient arc with ticks, its score, its band and its parts.
export function IndexGauge({ value, parts, labels }) {
  const length = Math.PI * 90
  const filled = typeof value === 'number' ? Math.min(100, value) : 0
  const gradient = useId()
  const band =
    typeof value !== 'number'
      ? null
      : value >= 85
        ? 'excellent'
        : value >= 70
          ? 'healthy'
          : value >= 50
            ? 'focus'
            : 'risk'
  return (
    <div className="td-index">
      <div className="td-index__dial">
        <svg viewBox="0 0 220 124" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" className="td-index__stop-1" />
              <stop offset="55%" className="td-index__stop-2" />
              <stop offset="100%" className="td-index__stop-3" />
            </linearGradient>
          </defs>
          {Array.from({ length: 21 }, (_, index) => {
            const angle = Math.PI - (index / 20) * Math.PI
            const inner = index % 5 ? 99 : 95
            return (
              <line
                key={index}
                x1={110 + Math.cos(angle) * inner}
                y1={112 - Math.sin(angle) * inner}
                x2={110 + Math.cos(angle) * 104}
                y2={112 - Math.sin(angle) * 104}
                className="td-index__tick"
              />
            )
          })}
          <path d="M20 112 A90 90 0 0 1 200 112" className="td-index__track" />
          <path
            d="M20 112 A90 90 0 0 1 200 112"
            className="td-index__arc"
            stroke={`url(#${gradient})`}
            strokeDasharray={`${length} ${length}`}
            strokeDashoffset={length * (1 - filled / 100)}
          />
        </svg>
        <div className="td-index__score">
          <b>
            <Value value={value} />
          </b>
          <span>{labels.title}</span>
          {band && (
            <em className={`td-index__band td-index__band--${band}`}>{labels.bands[band]}</em>
          )}
        </div>
      </div>
      <ul className="td-index__parts" aria-label={labels.parts}>
        {parts.map((part) => (
          <li key={part.key} style={accent(part.area)}>
            <i aria-hidden="true" />
            <span>{part.label}</span>
            <b>
              <Value value={part.value} percent />
            </b>
          </li>
        ))}
      </ul>
    </div>
  )
}

const tickerText = (item) =>
  item.value === null
    ? '–'
    : item.unit === 'text'
      ? item.value
      : `${item.signed && item.value > 0 ? '+' : ''}${fmt.format(item.value)}${item.unit === 'percent' ? '%' : ''}`

// A continuously scrolling strip of KPIs. It pauses on hover or focus, and is a
// plain scrollable row without motion. The second copy (for a seamless loop)
// is hidden from assistive technology.
export function Ticker({ items, label }) {
  if (!items.length) return null
  const row = (copy) =>
    items.map((item) => (
      <li
        key={`${copy}-${item.key}`}
        style={accent(item.area)}
        aria-hidden={copy === 'b' || undefined}
      >
        <OrvexaIcon name={item.icon} size={14} />
        <span>{item.label}</span>
        <b>{item.value === undefined ? <Shimmer /> : tickerText(item)}</b>
        {item.status && <i className={`td-dot td-dot--${item.status}`} aria-hidden="true" />}
      </li>
    ))
  return (
    <section className="td-ticker" aria-label={label}>
      <ul className="td-ticker__track">
        {row('a')}
        {row('b')}
      </ul>
    </section>
  )
}

// The target tracker: KPIs against their targets as bullet charts, one lane
// per area. A lane opens with its health (the share of its scored KPIs on
// target), lists its scored KPIs worst first, and closes with its context
// figures (KPIs without a percent target). "Needs attention" keeps only the
// KPIs to watch or act on.
const STATUS_ORDER = Object.freeze({ act: 0, watch: 1, good: 2 })
const WATCH_BAND = 10
const isScored = (item) => item.target !== undefined && item.unit === 'percent'
const byStatus = (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)

// The act, watch and good zones of a 0–100 scale, as [from, to] percents.
function zones(target, better) {
  const t = Math.min(100, Math.max(0, target))
  return better === 'down'
    ? [
        ['good', 0, t],
        ['watch', t, Math.min(100, t + WATCH_BAND)],
        ['act', Math.min(100, t + WATCH_BAND), 100],
      ]
    : [
        ['act', 0, Math.max(0, t - WATCH_BAND)],
        ['watch', Math.max(0, t - WATCH_BAND), t],
        ['good', t, 100],
      ]
}

function BulletRow({ item, labels, index }) {
  const measured = typeof item.value === 'number'
  const value = measured ? Math.min(100, Math.max(0, item.value)) : 0
  const gap = measured ? Math.round(item.value - item.target) : undefined
  return (
    <li className={`td-bullet td-bullet--${item.status ?? 'wait'}`} style={{ '--i': index }}>
      <span className="td-bullet__name">
        <OrvexaIcon name={item.icon} size={15} />
        <span>
          <b>{item.label}</b>
          <small>{labels.target(item.target, true, item.better)}</small>
        </span>
      </span>
      <span
        className="td-bullet__chart"
        role="img"
        aria-label={
          measured ? labels.measured(item.label, `${item.value}%`, `${item.target}%`) : item.label
        }
      >
        {zones(item.target, item.better).map(([zone, from, to]) =>
          to > from ? (
            <i
              key={zone}
              className={`td-bullet__zone td-bullet__zone--${zone}`}
              style={{ left: `${from}%`, width: `${to - from}%` }}
            />
          ) : null,
        )}
        <i className="td-bullet__bar" style={{ width: `${value}%` }} />
        <i className="td-bullet__target" style={{ left: `${Math.min(100, item.target)}%` }} />
      </span>
      <span className="td-bullet__value">
        <b>
          <Value value={item.value} percent />
        </b>
        {gap !== undefined && (
          <small className={`td-bullet__gap td-bullet__gap--${item.status}`}>
            {labels.gap(gap)}
          </small>
        )}
      </span>
      {item.status ? (
        <span className={`td-pill td-pill--${item.status}`}>{labels.status[item.status]}</span>
      ) : (
        <span className="td-pill td-pill--wait" aria-hidden="true">
          <Shimmer />
        </span>
      )}
    </li>
  )
}

// A small health ring: the share of a lane's scored KPIs on target.
function HealthRing({ value }) {
  const length = 2 * Math.PI * 16
  const filled = typeof value === 'number' ? value : 0
  return (
    <span className="td-health" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" className="td-health__track" />
        <circle
          cx="20"
          cy="20"
          r="16"
          className="td-health__arc"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - filled / 100)}
        />
      </svg>
      <b>{typeof value === 'number' ? `${value}` : ''}</b>
    </span>
  )
}

export function TargetTracker({ items, lanes, labels }) {
  const [view, setView] = useState('all')
  const scored = items.filter(isScored)
  const ready = scored.every((item) => item.status !== undefined || item.value === null)
  const count = (status) => scored.filter((item) => item.status === status).length
  const totals = { good: count('good'), watch: count('watch'), act: count('act') }
  const attention = view === 'attention'
  return (
    <div className="td-tracker">
      <div className="td-tracker__summary">
        <ul className="td-tracker__counts" aria-label={labels.summary}>
          {['act', 'watch', 'good'].map((status) => (
            <li key={status} className={`td-tracker__count td-tracker__count--${status}`}>
              <b>{ready ? <Value value={totals[status]} /> : <Shimmer />}</b>
              <span>{labels.status[status]}</span>
            </li>
          ))}
        </ul>
        <div className="td-tracker__mix" aria-hidden="true">
          {['act', 'watch', 'good'].map((status) =>
            ready && totals[status] ? (
              <i
                key={status}
                className={`td-tracker__mix-${status}`}
                style={{ flexGrow: totals[status] }}
              />
            ) : null,
          )}
        </div>
        <div className="td-switch td-switch--soft" role="radiogroup" aria-label={labels.view}>
          {[
            ['all', labels.all],
            ['attention', labels.attention],
          ].map(([key, text]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              onClick={() => setView(key)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="td-lanes">
        {lanes.map((lane, laneIndex) => {
          const laneScored = scored.filter((item) => item.area === lane.area)
          const context = items.filter((item) => item.area === lane.area && !isScored(item))
          if (!laneScored.length && !context.length) return null
          const good = laneScored.filter((item) => item.status === 'good').length
          const laneReady = laneScored.every(
            (item) => item.status !== undefined || item.value === null,
          )
          const health =
            laneReady && laneScored.length
              ? Math.round((good / laneScored.length) * 100)
              : undefined
          const rows = [...laneScored]
            .filter((item) => !attention || item.status === 'act' || item.status === 'watch')
            .sort(byStatus)
          return (
            <section
              key={lane.area}
              className="td-lane"
              style={{ '--a': `var(--td-${lane.area})`, '--i': laneIndex }}
              aria-label={lane.label}
            >
              <header className="td-lane__head">
                <span className="td-lane__icon" aria-hidden="true">
                  <OrvexaIcon name={lane.icon} size={17} />
                </span>
                <span className="td-lane__title">
                  <b>{lane.label}</b>
                  {laneScored.length > 0 && (
                    <small>
                      {laneReady ? labels.healthOf(good, laneScored.length) : <Shimmer />}
                    </small>
                  )}
                </span>
                {laneScored.length > 0 && <HealthRing value={health} />}
              </header>
              {laneScored.length > 0 &&
                (rows.length ? (
                  <ul className="td-bullets">
                    {rows.map((item, index) => (
                      <BulletRow key={item.key} item={item} labels={labels} index={index} />
                    ))}
                  </ul>
                ) : (
                  <p className="td-lane__clear">
                    <OrvexaIcon name="circle-check" size={16} />
                    {labels.allGood}
                  </p>
                ))}
              {!attention && context.length > 0 && (
                <div className="td-lane__context">
                  <span className="td-eyebrow">{labels.context}</span>
                  <ul>
                    {context.map((item) => (
                      <li key={item.key} title={item.hint}>
                        <OrvexaIcon name={item.icon} size={14} />
                        <span>{item.label}</span>
                        <b>
                          <Value
                            value={item.value}
                            decimals={item.unit === 'decimal' ? 1 : 0}
                            percent={item.unit === 'percent'}
                            signed={item.signed}
                          />
                        </b>
                        {item.status && (
                          <i className={`td-dot td-dot--${item.status}`} aria-hidden="true" />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// Parts of a whole as one rounded bar, with a legend of counts.
export function SegmentBar({ label, parts }) {
  const ready = parts.every((part) => part.count !== undefined)
  const total = ready ? parts.reduce((sum, part) => sum + part.count, 0) : 0
  return (
    <div className="td-segments">
      {label && <span className="td-eyebrow">{label}</span>}
      <div className="td-segments__bar" role="img" aria-label={label}>
        {ready && total > 0 ? (
          parts.map((part) =>
            part.count ? (
              <i
                key={part.key}
                style={{ flexGrow: part.count, '--s': `var(--td-${part.tone})` }}
                title={`${part.label}: ${part.count}`}
              />
            ) : null,
          )
        ) : (
          <i className="td-segments__empty" />
        )}
      </div>
      <ul className="td-legend">
        {parts.map((part) => (
          <li key={part.key} style={{ '--s': `var(--td-${part.tone})` }}>
            <i aria-hidden="true" />
            <span>{part.label}</span>
            <b>
              <Value value={part.count} />
            </b>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Grades given against the policy share: one stacked bar, then each grade's
// actual share with its gap to policy in points.
export function GradeMix({ grades, counts, policy, names, emptyText }) {
  const ready = counts && grades.every((grade) => counts[grade] !== undefined)
  const total = ready ? grades.reduce((sum, grade) => sum + counts[grade], 0) : undefined
  if (ready && total === 0) return <p className="td-empty">{emptyText}</p>
  return (
    <div className="td-grades">
      <span className="td-eyebrow">{U.gradeMix}</span>
      <div className="td-grades__stack" aria-hidden="true">
        {grades.map((grade) => (
          <i
            key={grade}
            style={{
              flexGrow: ready ? counts[grade] || 0.0001 : 1,
              '--s': `var(--td-grade-${grade.toLowerCase()})`,
            }}
          />
        ))}
      </div>
      <div className="td-grades__policy" aria-hidden="true">
        {grades.map((grade) => (
          <i key={grade} style={{ flexGrow: policy[grade] }} />
        ))}
      </div>
      <ul className="td-grades__rows">
        {grades.map((grade) => {
          const actual = ready ? Math.round((counts[grade] / total) * 100) : undefined
          const gap = actual === undefined ? undefined : actual - policy[grade]
          return (
            <li key={grade} style={{ '--s': `var(--td-grade-${grade.toLowerCase()})` }}>
              <span className="td-grades__letter">{grade}</span>
              <span className="td-grades__name">{names[grade]}</span>
              <b>
                <Value value={actual} percent />
              </b>
              <small
                className={
                  gap === undefined ? '' : gap > 0 ? 'td-is-over' : gap < 0 ? 'td-is-under' : ''
                }
              >
                {gap === undefined ? '' : gap === 0 ? U.onPolicy : U.pts(gap)}
              </small>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Points of a smooth curve through values (Catmull-Rom as cubic Béziers).
function curve(points) {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : ''
  let path = `M${points[0][0]},${points[0][1]}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index - 1] ?? points[index]
    const [x1, y1] = points[index]
    const [x2, y2] = points[index + 1]
    const [x3, y3] = points[index + 2] ?? points[index + 1]
    path += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`
  }
  return path
}

const scaleTop = (values) => {
  const max = Math.max(0, ...values)
  if (max <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / (power / 2)) * (power / 2)
}

// A small trend line for a card, drawn in, with a pulsing last point.
export function Sparkline({ values, label }) {
  if (!values) return <Shimmer wide />
  const width = 240
  const height = 60
  const top = scaleTop(values)
  const points = values.map((value, index) => [
    values.length > 1 ? (index / (values.length - 1)) * width : width / 2,
    height - 6 - (value / top) * (height - 14),
  ])
  const [lastX, lastY] = points.at(-1) ?? [0, height]
  return (
    <svg className="td-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={`${curve(points)} L${width},${height} L0,${height} Z`} className="td-spark__area" />
      <path d={curve(points)} className="td-spark__line" pathLength="1" />
      <circle cx={lastX} cy={lastY} r="7" className="td-spark__halo" />
      <circle cx={lastX} cy={lastY} r="3.5" className="td-spark__dot" />
    </svg>
  )
}

// The trend chart: a smooth line drawn over a soft area, a point per period
// (the peak marked) with its value on hover or focus, and an accessible table.
export function TrendChart({ labels, values, caption }) {
  const [active, setActive] = useState(null)
  const gradient = useId()
  const width = 640
  const height = 230
  const pad = { top: 22, right: 16, bottom: 30, left: 34 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const top = values ? scaleTop(values) : 4
  const x = (index) =>
    pad.left + (labels.length > 1 ? (index / (labels.length - 1)) * plotW : plotW / 2)
  const y = (value) => pad.top + plotH - (value / top) * plotH
  const points = values ? values.map((value, index) => [x(index), y(value)]) : []
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(top * step)))]
  const peak = values ? values.indexOf(Math.max(...values)) : -1
  return (
    <figure className="td-trend" onMouseLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="td-trend__stop-1" />
            <stop offset="100%" className="td-trend__stop-2" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              className="td-trend__grid"
            />
            <text x={pad.left - 8} y={y(tick) + 4} className="td-trend__tick" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {values && (
          <>
            <path
              className="td-trend__area"
              d={`${curve(points)} L${x(labels.length - 1)},${pad.top + plotH} L${x(0)},${pad.top + plotH} Z`}
              fill={`url(#${gradient})`}
            />
            <path d={curve(points)} className="td-trend__line" pathLength="1" />
          </>
        )}
        {labels.map((label, index) => (
          <text
            key={label}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            className={`td-trend__tick${index === active ? ' td-is-on' : ''}`}
          >
            {label}
          </text>
        ))}
        {values &&
          points.map(([px, py], index) => (
            <g
              key={labels[index]}
              className={`td-trend__point${index === active ? ' td-is-on' : ''}${index === peak && values[index] > 0 ? ' td-is-peak' : ''}`}
              style={{ '--i': index }}
            >
              <line
                x1={px}
                x2={px}
                y1={pad.top}
                y2={pad.top + plotH}
                className="td-trend__cursor"
              />
              <circle cx={px} cy={py} r="4.5" className="td-trend__dot" />
            </g>
          ))}
      </svg>
      {values && (
        <ol className="td-trend__hits">
          {labels.map((label, index) => (
            <li
              key={label}
              // Centred on its point, as wide as the gap between points.
              style={{
                left: `${(x(index) / width) * 100}%`,
                width: `${(plotW / Math.max(1, labels.length - 1) / width) * 100}%`,
                '--tip-y': `${((points[index][1] / height) * 100).toFixed(2)}%`,
              }}
            >
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${label}: ${values[index]}`}
              >
                {index === active && (
                  <span className="td-trend__tip" aria-hidden="true">
                    <b>{fmt.format(values[index])}</b>
                    {label}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
      {!values && <Shimmer wide />}
      <figcaption className="td-sr">{caption}</figcaption>
      {values && (
        <table className="td-sr">
          <caption>{caption}</caption>
          <tbody>
            {labels.map((label, index) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{values[index]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}

// The action centre: open items with a pulsing count and their area tag.
export function ActionList({ items }) {
  const ready = items.every((item) => item.count !== undefined)
  const open = ready ? items.filter((item) => item.count > 0) : items
  if (ready && !open.length)
    return (
      <p className="td-allclear">
        <OrvexaIcon name="party-popper" size={20} />
        {U.actions.clear}
      </p>
    )
  return (
    <ul className="td-actions">
      {open.map((item, index) => (
        <li key={item.key} style={{ ...accent(item.area), '--i': index }}>
          <Go to={item.to} href={item.href} className="td-action">
            <span className="td-action__count">
              {item.count === undefined ? <Shimmer /> : <Value value={item.count} />}
              <i className="td-action__ping" aria-hidden="true" />
            </span>
            <span className="td-action__text">
              <span>{item.label}</span>
              <small>{U.actions.tags[item.area]}</small>
            </span>
            <OrvexaIcon name={item.href ? 'arrow-up-right' : 'chevron-right'} size={16} />
          </Go>
        </li>
      ))}
    </ul>
  )
}
