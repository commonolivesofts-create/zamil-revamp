import { useId, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { COMMON_TEXT, DASHBOARD_TEXT as T } from '../hrRecruitmentText.js'
import { CountUp, Skeleton } from '../shared/components/InsightCards.jsx'
import { change, niceMax, ratio } from './dashboardModel.js'

// The dashboard widgets. Each module has one colour (--rd-<key> in
// hr-recruitment-dashboard.css) passed as --c; values may be undefined while
// loading and show skeletons then.

const num = (value) => (value === undefined ? <Skeleton /> : <CountUp value={value} />)
const tint = (color) => ({ '--c': `var(--rd-${color})` })
const percentOf = (part, whole) => (part === undefined || whole === undefined ? undefined : ratio(part, whole))

export function Panel({ title, icon, hint, to, actions, className = '', children }) {
  const id = useId()
  return (
    <section className={`zrv-rd-card ${className}`} aria-labelledby={id}>
      <header className="zrv-rd-card__head">
        <div className="zrv-rd-card__title">
          {icon && <span className="zrv-rd-card__icon" aria-hidden="true"><OrvexaIcon name={icon} size={15} /></span>}
          <div><h2 id={id}>{title}</h2>{hint && <p>{hint}</p>}</div>
        </div>
        <div className="zrv-rd-card__actions">
          {actions}
          {to && <Link className="zrv-rd-more" to={to}>{T.viewAll}<OrvexaIcon name="arrow-right" size={14} /></Link>}
        </div>
      </header>
      {children}
    </section>
  )
}

export function Failure({ resource }) {
  return <p className="zrv-rd-error" role="alert">{T.unavailable} <button type="button" onClick={resource.reload}>{T.retry}</button></p>
}

function Change({ current, previous }) {
  const value = change(current, previous)
  if (value === null) return null
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return (
    <span className={`zrv-rd-change zrv-rd-is-${direction}`} title={T.kpi.changeLabel}>
      <OrvexaIcon name={direction === 'up' ? 'trending-up' : direction === 'down' ? 'trending-down' : 'minus'} size={12} />
      {value === Infinity ? T.kpi.newSince : value === 0 ? T.kpi.same : T.kpi.change(value)}
      <span className="zrv-hr-sr"> {T.kpi.changeLabel}</span>
    </span>
  )
}

// The banner: the headline number, three counters and the hiring-rate gauge.
export function Banner({ hero, counters, gauge }) {
  const share = percentOf(gauge?.part, gauge?.of)
  const length = Math.PI * 80
  return (
    <section className="zrv-rd-banner" aria-label={T.banner.label}>
      <div className="zrv-rd-banner__hero">
        {hero && <>
          <span className="zrv-rd-banner__kicker"><OrvexaIcon name={hero.icon} size={15} />{hero.label}</span>
          <b>{num(hero.value)}</b>
          <small>{hero.hint}</small>
          {hero.to && <Link to={hero.to} className="zrv-rd-banner__link">{T.viewAll}<OrvexaIcon name="arrow-right" size={14} /></Link>}
        </>}
      </div>
      <ul className="zrv-rd-banner__counters">
        {counters.map((item) => (
          <li key={item.key} style={tint(item.color)}>
            <span className="zrv-rd-banner__dot" aria-hidden="true"><OrvexaIcon name={item.icon} size={16} /></span>
            <span><b>{num(item.value)}</b><small>{item.label}</small></span>
          </li>
        ))}
      </ul>
      {gauge && (
        <div className="zrv-rd-banner__gauge">
          <svg viewBox="0 0 200 112" aria-hidden="true">
            <defs>
              <linearGradient id="zrv-rd-gauge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" className="zrv-rd-banner__stop-1" /><stop offset="100%" className="zrv-rd-banner__stop-2" />
              </linearGradient>
            </defs>
            <path d="M20 100 A80 80 0 0 1 180 100" className="zrv-rd-banner__track" />
            <path d="M20 100 A80 80 0 0 1 180 100" className="zrv-rd-banner__value" stroke="url(#zrv-rd-gauge)"
              strokeDasharray={`${length} ${length}`} style={{ '--len': length, strokeDashoffset: length * (1 - Math.min(1, (share ?? 0) / 100)) }} />
          </svg>
          <div className="zrv-rd-banner__gauge-n">
            <b>{share === undefined ? <Skeleton /> : share === null ? COMMON_TEXT.dash : <><CountUp value={share} /><small>%</small></>}</b>
            <span>{gauge.label}</span>
            <small>{gauge.part !== undefined && gauge.of !== undefined ? T.rates.of(gauge.part, gauge.of, gauge.unit) : ''}</small>
          </div>
        </div>
      )}
    </section>
  )
}

// The recruitment journey: numbered stages in hiring order, each in its
// module colour with its KPIs (counts, or rates with a meter), and the
// conversion from one stage's lead count to the next between them.
export function Journey({ stages }) {
  return (
    <section className="zrv-rd-journey" aria-label={T.journey.title}>
      <header className="zrv-rd-journey__head">
        <h2>{T.journey.title}</h2>
        <p>{T.journey.hint}</p>
      </header>
      <ol className="zrv-rd-journey__flow">
        {stages.map((stage, index) => {
          const next = stages[index + 1]
          const step = next ? percentOf(next.lead, stage.lead) : undefined
          return (
            <li key={stage.key} className="zrv-rd-stage" style={{ ...tint(stage.color), '--i': index }}>
              <div className="zrv-rd-stage__card">
                <header className="zrv-rd-stage__head">
                  <span className="zrv-rd-stage__icon" aria-hidden="true"><OrvexaIcon name={stage.icon} size={18} /></span>
                  <span className="zrv-rd-stage__title"><small>{T.journey.step(index + 1)}</small><b>{stage.title}</b></span>
                  <Link to={stage.to} className="zrv-rd-stage__go" aria-label={`${T.viewAll}: ${stage.title}`}><OrvexaIcon name="arrow-up-right" size={14} /></Link>
                </header>
                <ul className="zrv-rd-stage__kpis">
                  {stage.kpis.map((kpi) => {
                    const isRate = 'of' in kpi
                    const share = isRate ? percentOf(kpi.part, kpi.of) : undefined
                    return (
                      <li key={kpi.label} className={isRate ? 'zrv-rd-is-rate' : undefined}>
                        <span className="zrv-rd-stage__label">{kpi.label}</span>
                        <b className="zrv-rd-stage__value">
                          {isRate
                            ? (share === undefined ? <Skeleton /> : share === null ? COMMON_TEXT.dash : <><CountUp value={share} /><small>%</small></>)
                            : num(kpi.value)}
                        </b>
                        {isRate && <span className="zrv-rd-stage__meter" aria-hidden="true"><i style={{ width: `${Math.min(100, share ?? 0)}%` }} /></span>}
                        <small className="zrv-rd-stage__hint">
                          {isRate ? (kpi.part !== undefined && kpi.of !== undefined ? T.rates.of(kpi.part, kpi.of, kpi.unit) : '') : (kpi.hint ?? '')}
                        </small>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {next && (
                <span className="zrv-rd-stage__link" style={{ '--c2': `var(--rd-${next.color})` }}>
                  <i aria-hidden="true" />
                  <em>{step === undefined ? '' : step === null ? COMMON_TEXT.dash : `${step}%`}<span className="zrv-hr-sr"> {T.journey.conversion(stage.title, next.title)}</span></em>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Module tabs with each module's period count and change.
export function ModuleTabs({ items, value, onChoose, label }) {
  return (
    <div className="zrv-rd-modtabs" role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" style={tint(item.key)} aria-pressed={item.key === value} onClick={() => onChoose(item.key)}>
          <span className="zrv-rd-modtabs__name"><i aria-hidden="true" />{item.label}</span>
          <span className="zrv-rd-modtabs__n"><b>{num(item.value)}</b><Change current={item.value} previous={item.previous} /></span>
        </button>
      ))}
    </div>
  )
}

// One module over the months: rounded columns in its colour, the value on
// hover or focus; or the same numbers as a table.
export function ColumnChart({ months, values, label, color, table }) {
  const [active, setActive] = useState(null)
  if (table) {
    return (
      <div className="zrv-rd-table zrv-rd-table--scroll">
        <table>
          <caption className="zrv-hr-sr">{label}</caption>
          <thead><tr><th scope="col">{T.activity.month}</th><th scope="col">{label}</th></tr></thead>
          <tbody>{months.map((month, index) => <tr key={month.key}><th scope="row">{`${month.label} ${month.year}`}</th><td>{values ? values[index] : COMMON_TEXT.dash}</td></tr>)}</tbody>
        </table>
      </div>
    )
  }
  const max = niceMax(Math.max(0, ...(values ?? [])))
  const ticks = [0, 1, 2, 3, 4].map((step) => (max / 4) * step)
  return (
    <div className="zrv-rd-bars" style={tint(color)} onMouseLeave={() => setActive(null)}>
      <ol className="zrv-rd-bars__y" aria-hidden="true">{[...ticks].reverse().map((tick) => <li key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</li>)}</ol>
      <div className="zrv-rd-bars__plot">
        <div className="zrv-rd-bars__grid" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>
        <ol key={label} className="zrv-rd-bars__cols" style={{ '--n': months.length }}>
          {months.map((month, index) => (
            <li key={month.key} className={`${index === months.length - 1 ? 'zrv-rd-is-now' : ''}${index === active ? ' zrv-rd-is-on' : ''}`.trim() || undefined}>
              <button type="button" disabled={!values} aria-label={values ? `${month.label} ${month.year}: ${values[index]}` : month.label}
                onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
                <i style={{ '--h': `${values ? (values[index] / max) * 100 : 0}%`, '--i': index }}>{values && <em aria-hidden="true">{values[index]}</em>}</i>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <ol className="zrv-rd-bars__x" aria-hidden="true" style={{ '--n': months.length }}>
        {months.map((month, index) => <li key={month.key} className={index === active ? 'zrv-rd-is-on' : undefined}>{month.label}</li>)}
      </ol>
    </div>
  )
}

// Hiring stages, each in its module colour, with the step rate between them.
export function Funnel({ stages }) {
  const ready = stages.every((stage) => stage.count !== undefined)
  const peak = Math.max(1, ...stages.map((stage) => stage.count ?? 0))
  return (
    <ol className="zrv-rd-funnel">
      {stages.map((stage, index) => {
        const share = ready && index ? ratio(stage.count, stages[index - 1].count) : null
        return (
          <li key={stage.key} style={{ ...tint(stage.color), '--i': index }}>
            <span className="zrv-rd-funnel__icon" aria-hidden="true"><OrvexaIcon name={stage.icon} size={15} /></span>
            <div className="zrv-rd-funnel__body">
              <div className="zrv-rd-funnel__line">
                <span>{stage.label}</span>
                <b>{num(stage.count)}</b>
              </div>
              <span className="zrv-rd-funnel__track" aria-hidden="true"><i style={{ width: `${ready ? Math.max(3, ((stage.count ?? 0) / peak) * 100) : 0}%` }} /></span>
            </div>
            <small className="zrv-rd-funnel__rate">{share === null ? '' : `${share}%`}{share !== null && <span className="zrv-hr-sr"> {T.funnel.ofPrevious(share)}</span>}</small>
          </li>
        )
      })}
    </ol>
  )
}

// A donut of parts with the total inside and a legend.
export function MixDonut({ title, items, unit }) {
  const ready = items.every((item) => item.count !== undefined)
  const total = items.reduce((sum, item) => sum + (item.count ?? 0), 0)
  const length = 2 * Math.PI * 38
  let start = 0
  return (
    <div className="zrv-rd-donut">
      <div className="zrv-rd-donut__chart">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="38" className="zrv-rd-donut__track" />
          {ready && total > 0 && items.map((item) => {
            const size = (item.count / total) * length
            const arc = <circle key={item.key} cx="50" cy="50" r="38" className="zrv-rd-donut__seg" style={tint(item.color)}
              strokeDasharray={`${Math.max(0, size - (items.length > 1 ? 2 : 0))} ${length}`} strokeDashoffset={-start} />
            start += size
            return arc
          })}
        </svg>
        <span className="zrv-rd-donut__n"><b>{ready ? <CountUp value={total} /> : <Skeleton />}</b><small>{unit}</small></span>
      </div>
      <div className="zrv-rd-donut__side">
        <span className="zrv-rd-donut__title">{title}</span>
        <ul>
          {items.map((item) => (
            <li key={item.key} style={tint(item.color)}>
              <i aria-hidden="true" /><span>{item.label}</span><b>{num(item.count)}</b>
              <small>{ready && total ? `${ratio(item.count, total)}%` : ''}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Performance tiles: a ratio (part ÷ whole as "2.4×") or a share (a percent
// with a ring), each in its colour, with the counts behind it.
export function KpiTiles({ items }) {
  const length = 2 * Math.PI * 15
  return (
    <ul className="zrv-rd-tiles">
      {items.map((item, index) => {
        const ready = item.part !== undefined && item.of !== undefined
        const share = ready ? ratio(item.part, item.of) : undefined
        const times = ready && item.of ? (item.part / item.of).toFixed(1) : null
        return (
          <li key={item.key} className="zrv-rd-tile" style={{ ...tint(item.color), '--i': index }}>
            <div className="zrv-rd-tile__top">
              <span className="zrv-rd-tile__icon" aria-hidden="true"><OrvexaIcon name={item.icon} size={16} /></span>
              {item.kind === 'percent' && (
                <svg className="zrv-rd-tile__ring" viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15" className="zrv-rd-tile__track" />
                  <circle cx="18" cy="18" r="15" className="zrv-rd-tile__arc" strokeDasharray={`${length} ${length}`}
                    style={{ strokeDashoffset: length * (1 - Math.min(1, (share ?? 0) / 100)) }} />
                </svg>
              )}
            </div>
            <b className="zrv-rd-tile__value">
              {!ready ? <Skeleton /> : item.kind === 'percent'
                ? (share === null ? COMMON_TEXT.dash : <><CountUp value={share} /><small>%</small></>)
                : (times === null ? COMMON_TEXT.dash : <>{times}<small>{item.key.endsWith('ace') ? '' : '×'}</small></>)}
            </b>
            <span className="zrv-rd-tile__label">{item.label}</span>
            <small className="zrv-rd-tile__hint">{item.hint}</small>
          </li>
        )
      })}
    </ul>
  )
}

// Open items with their counts, each in its module colour.
export function AttentionList({ items }) {
  const ready = items.every((item) => item.count !== undefined)
  const open = ready ? items.filter((item) => item.count > 0) : items
  if (ready && !open.length) return <p className="zrv-rd-empty zrv-rd-empty--ok"><OrvexaIcon name="circle-check" size={16} />{T.attention.clear}</p>
  return (
    <ul className="zrv-rd-attention">
      {open.map((item) => (
        <li key={item.key} style={tint(item.color)}>
          <Link to={item.to}>
            <span className="zrv-rd-attention__icon" aria-hidden="true"><OrvexaIcon name={item.icon} size={15} /></span>
            <span>{item.label}</span>
            <b>{item.count === undefined ? <Skeleton /> : item.count}</b>
          </Link>
        </li>
      ))}
    </ul>
  )
}
