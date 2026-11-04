import { useId, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { COMMON_TEXT, DASHBOARD_TEXT as T } from '../hrRecruitmentText.js'
import { CountUp, Skeleton } from '../shared/components/InsightCards.jsx'
import { change, niceMax, ratio } from './dashboardModel.js'

// The dashboard's building blocks. One accent colour (the theme's) for every
// chart; values may be undefined while loading and show skeletons then.

const num = (value) => (value === undefined ? <Skeleton /> : <CountUp value={value} />)

// A titled card; `to` adds a "View all" link to the full report.
export function Panel({ title, hint, to, actions, className = '', children }) {
  const id = useId()
  return (
    <section className={`zrv-rd-panel ${className}`} aria-labelledby={id}>
      <header className="zrv-rd-panel__head">
        <div>
          <h2 id={id}>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
        <div className="zrv-rd-panel__actions">
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

// Change against the previous period; hidden when there is nothing to compare.
function Change({ current, previous }) {
  const value = change(current, previous)
  if (value === null) return null
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  return (
    <span className={`zrv-rd-change zrv-rd-is-${direction}`} title={T.kpi.changeLabel}>
      <OrvexaIcon name={direction === 'up' ? 'arrow-up-right' : direction === 'down' ? 'arrow-down-right' : 'minus'} size={12} />
      {value === Infinity ? T.kpi.newSince : value === 0 ? T.kpi.same : T.kpi.change(value)}
      <span className="zrv-hr-sr"> {T.kpi.changeLabel}</span>
    </span>
  )
}

// Twelve rounded micro columns, oldest first; the current month in full accent.
function MicroBars({ values }) {
  if (!values) return <span className="zrv-rd-micro zrv-rd-micro--wait" aria-hidden="true" />
  const peak = Math.max(1, ...values)
  return (
    <span className="zrv-rd-micro" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} className={index === values.length - 1 ? 'zrv-rd-is-now' : undefined} style={{ '--h': `${Math.max(10, (value / peak) * 100)}%`, '--i': index }} />
      ))}
    </span>
  )
}

// The headline numbers: one card per module with its period count, the change
// and the last 12 months.
export function StatStrip({ label, items }) {
  return (
    <section className="zrv-rd-stats" aria-label={label}>
      {items.map((item, index) => (
        <Link key={item.key} to={item.to} className="zrv-rd-stat" style={{ '--i': index }}>
          <span className="zrv-rd-stat__top">
            <span className="zrv-rd-stat__icon" aria-hidden="true"><OrvexaIcon name={item.icon} size={16} /></span>
            <span className="zrv-rd-stat__label">{item.label}</span>
            <OrvexaIcon name="arrow-up-right" size={15} className="zrv-rd-stat__go" />
          </span>
          <span className="zrv-rd-stat__body">
            <span className="zrv-rd-stat__value"><b>{num(item.value)}</b><Change current={item.value} previous={item.previous} /></span>
            <MicroBars values={item.trend} />
          </span>
        </Link>
      ))}
    </section>
  )
}

// One module over the months: summary figures and rounded columns with the
// value on hover or focus, or the same numbers as a table.
export function ColumnChart({ months, values, label, table }) {
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
  const total = values?.reduce((sum, value) => sum + value, 0)
  const busiest = values ? values.indexOf(Math.max(...values)) : -1
  return (
    <div className="zrv-rd-columns">
      <dl className="zrv-rd-summary">
        <div><dt>{T.activity.total}</dt><dd>{num(total)}</dd></div>
        <div><dt>{T.activity.average}</dt><dd>{values ? (total / values.length).toFixed(1) : <Skeleton />}</dd></div>
        <div><dt>{T.activity.busiest}</dt><dd>{values ? (total ? `${months[busiest].label} · ${values[busiest]}` : COMMON_TEXT.dash) : <Skeleton />}</dd></div>
      </dl>
      <div className="zrv-rd-bars" onMouseLeave={() => setActive(null)}>
        <ol className="zrv-rd-bars__y" aria-hidden="true">{[...ticks].reverse().map((tick) => <li key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</li>)}</ol>
        <div className="zrv-rd-bars__plot">
          <div className="zrv-rd-bars__grid" aria-hidden="true">{ticks.map((tick) => <i key={tick} />)}</div>
          <ol key={label} className="zrv-rd-bars__cols" style={{ '--n': months.length }}>
            {months.map((month, index) => (
              <li key={month.key} className={`${index === months.length - 1 ? 'zrv-rd-is-now' : ''}${index === active ? ' zrv-rd-is-on' : ''}`.trim() || undefined}>
                <button type="button" disabled={!values} aria-label={values ? `${month.label} ${month.year}: ${values[index]}` : month.label}
                  onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}>
                  <i style={{ '--h': `${values ? (values[index] / max) * 100 : 0}%`, '--i': index }}>
                    {values && <em aria-hidden="true">{values[index]}</em>}
                  </i>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <ol className="zrv-rd-bars__x" aria-hidden="true" style={{ '--n': months.length }}>
          {months.map((month, index) => <li key={month.key} className={index === active ? 'zrv-rd-is-on' : undefined}>{month.label}</li>)}
        </ol>
      </div>
    </div>
  )
}

// Hiring stages top to bottom; each row is filled to its share of the largest
// stage, with the step rate from the stage before between the rows.
export function FunnelList({ stages }) {
  const ready = stages.every((stage) => stage.count !== undefined)
  const peak = Math.max(1, ...stages.map((stage) => stage.count ?? 0))
  return (
    <ol className="zrv-rd-flow">
      {stages.map((stage, index) => {
        const share = ready && index ? ratio(stage.count, stages[index - 1].count) : null
        return (
          <li key={stage.key} style={{ '--i': index }}>
            {index > 0 && (
              <span className="zrv-rd-flow__rate">
                {share !== null && <span title={T.funnel.ofPrevious(share)}><OrvexaIcon name="arrow-down-right" size={12} />{`${share}%`}<span className="zrv-hr-sr"> {T.funnel.ofPrevious(share)}</span></span>}
              </span>
            )}
            <div className="zrv-rd-flow__row">
              <i className="zrv-rd-flow__fill" aria-hidden="true" style={{ '--w': `${ready ? Math.max(3, ((stage.count ?? 0) / peak) * 100) : 0}%` }} />
              <span className="zrv-rd-flow__label"><OrvexaIcon name={stage.icon} size={15} />{stage.label}</span>
              <b>{num(stage.count)}</b>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// The latest records of one module: reference, details, date and status.
export function RecentTable({ rows }) {
  const C = T.recent.columns
  if (!rows) {
    return <ul className="zrv-rd-recent zrv-rd-recent--wait" aria-hidden="true">{[0, 1, 2, 3, 4].map((slot) => <li key={slot}><Skeleton /></li>)}</ul>
  }
  if (!rows.length) return <p className="zrv-rd-empty">{T.recent.empty}</p>
  return (
    <div className="zrv-rd-table">
      <table>
        <thead><tr><th scope="col">{C.reference}</th><th scope="col">{C.subject}</th><th scope="col">{C.date}</th><th scope="col">{C.status}</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td><Link to={row.path} className="zrv-rd-ref">{row.reference}</Link></td>
              <td><span className="zrv-rd-subject"><b>{row.title || COMMON_TEXT.dash}</b>{row.detail && <small>{row.detail}</small>}</span></td>
              <td className="zrv-rd-date">{row.date || COMMON_TEXT.dash}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Open items with their counts; each opens its report.
export function AttentionList({ items }) {
  const ready = items.every((item) => item.count !== undefined)
  const open = ready ? items.filter((item) => item.count > 0) : items
  if (ready && !open.length) return <p className="zrv-rd-empty zrv-rd-empty--ok"><OrvexaIcon name="circle-check" size={16} />{T.attention.clear}</p>
  return (
    <ul className="zrv-rd-attention">
      {open.map((item) => (
        <li key={item.key}>
          <Link to={item.to} className={`zrv-rd-attention__item zrv-rd-is-${item.tone}`}>
            <span className="zrv-rd-attention__icon" aria-hidden="true"><OrvexaIcon name={item.icon} size={15} /></span>
            <span>{item.label}</span>
            <b>{item.count === undefined ? <Skeleton /> : item.count}</b>
            <OrvexaIcon name="chevron-right" size={14} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
