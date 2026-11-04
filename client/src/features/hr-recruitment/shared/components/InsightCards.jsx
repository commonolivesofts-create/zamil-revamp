import { useEffect, useId, useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { COMMON_TEXT, INSIGHT_TEXT as T } from '../../hrRecruitmentText.js'
import { percent } from '../insightFormat.js'

// Overview card building blocks of the recruitment reports. Every block takes
// its counts possibly undefined (still loading) and shows skeletons then; a
// block item with `onPick` is a filter toggle (aria-pressed). Tones: draft,
// progress, ok, bad, mint, amber, primary.


const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const tone = (name) => (name ? ` zrv-ir-tone--${name}` : '')

// A number that counts up to its value (straight to it with reduced motion).
export function CountUp({ value }) {
  const [shown, setShown] = useState(0)
  const current = useRef(0)
  useEffect(() => {
    const from = current.current
    const duration = reducedMotion() ? 0 : 900
    const start = performance.now()
    let frame = 0
    const tick = (now) => {
      const progress = duration ? Math.min(1, (now - start) / duration) : 1
      current.current = Math.round(from + (value - from) * (1 - (1 - progress) ** 3))
      setShown(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <><span className="zrv-hr-sr">{value}</span><span aria-hidden="true">{shown}</span></>
}

export const Skeleton = () => <i className="zrv-ir-skel" aria-hidden="true" />
const num = (value) => (value === undefined ? <Skeleton /> : value)

// A filter toggle when the item has onPick, plain text otherwise.
function Pick({ item, className = '', children }) {
  if (!item.onPick) return <div className={className}>{children}</div>
  return (
    <button type="button" className={className} aria-pressed={Boolean(item.active)} onClick={item.onPick}
      aria-label={T.show(item.label, item.count ?? COMMON_TEXT.dash)}>{children}</button>
  )
}

export function Card({ index = 0, icon, label, aside, theme = 'mint', wide = false, children }) {
  return (
    <article className={`zrv-ir-ov zrv-ir-ov--${theme}${wide ? ' zrv-ir-ov--wide' : ''}`} style={{ '--i': index }}>
      <div className="zrv-ir-ov__top">
        <span className="zrv-ir-ov__label"><OrvexaIcon name={icon} size={15} />{label}</span>
        {aside}
      </div>
      {children}
    </article>
  )
}

export function Hero({ value, unit, suffix }) {
  return (
    <div className="zrv-ir-ov__hero">
      <b>{value === undefined ? <Skeleton /> : <><CountUp value={value} />{suffix && <small>{suffix}</small>}</>}</b>
      {unit && <span>{unit}</span>}
    </div>
  )
}

export const Hint = ({ children }) => (children ? <span className="zrv-ir-ov__hint">{children}</span> : null)
export const Foot = ({ children }) => <p className="zrv-ir-ov__foot">{children}</p>

// Change of the latest value against the one before it.
export function Delta({ value, label }) {
  if (value === undefined) return null
  return (
    <span className={`zrv-ir-delta${value > 0 ? ' zrv-ir-is-up' : value < 0 ? ' zrv-ir-is-down' : ''}`}>
      <OrvexaIcon name={value > 0 ? 'trending-up' : value < 0 ? 'trending-down' : 'minus'} size={14} />{T.versus(value, label)}
    </span>
  )
}

// Proportional bar of the parts, with a legend of filter toggles ("All" first).
export function Distribution({ items, total, all }) {
  const anyActive = items.some((item) => item.active)
  return (
    <>
      <div className="zrv-ir-dist" aria-hidden="true">
        {items.map((item) => (
          <i key={item.key} className={`zrv-ir-dist__seg${tone(item.tone)}${anyActive && !item.active ? ' zrv-ir-is-dim' : ''}`} style={{ flexGrow: item.count ?? 0 }} />
        ))}
      </div>
      <div className="zrv-ir-legend" role="group">
        {all && <button type="button" className="zrv-ir-legend__all" aria-pressed={!anyActive} onClick={all}>{T.all}</button>}
        {items.map((item) => (
          <Pick key={item.key} item={item} className={`zrv-ir-legend__item${tone(item.tone)}`}>
            <span><i aria-hidden="true" />{item.label}</span>
            <b>{num(item.count)}</b>
            {item.count !== undefined && <small>{T.percentOf(percent(item.count, total))}</small>}
          </Pick>
        ))}
      </div>
    </>
  )
}

// Full ring: `value` of `of`, with the remainder in the `restTone` colour.
export function Ring({ value, of, restTone = 'bad' }) {
  const id = `${useId().replace(/:/g, '')}-ring`
  const ready = value !== undefined
  const circumference = 2 * Math.PI * 42
  return (
    <div className="zrv-ir-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" className="zrv-ir-stop-1" /><stop offset="100%" className="zrv-ir-stop-2" /></linearGradient></defs>
        <circle cx="50" cy="50" r="42" className="zrv-ir-ring__track" />
        {ready && of > 0 && <circle cx="50" cy="50" r="42" className={`zrv-ir-ring__rest${tone(restTone)}`} />}
        <circle key={ready ? 'ready' : 'wait'} cx="50" cy="50" r="42" className="zrv-ir-ring__value" stroke={`url(#${id})`} strokeDasharray={`${circumference} ${circumference}`}
          style={{ '--c': circumference, strokeDashoffset: circumference * (1 - (of ? value / of : 0)) }} />
      </svg>
      <div className="zrv-ir-gauge__n">{ready ? (of ? <span><CountUp value={percent(value, of)} /><small>%</small></span> : <span>{COMMON_TEXT.dash}</span>) : <Skeleton />}</div>
    </div>
  )
}

// Half ring (speedometer) with a needle.
export function HalfGauge({ value, of }) {
  const id = `${useId().replace(/:/g, '')}-half`
  const ready = value !== undefined
  const share = ready && of ? value / of : 0
  const length = Math.PI * 40
  return (
    <div className="zrv-ir-half">
      <svg viewBox="0 0 100 58" aria-hidden="true">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" className="zrv-ir-stop-3" /><stop offset="100%" className="zrv-ir-stop-1" /></linearGradient></defs>
        <path d="M10 52 A40 40 0 0 1 90 52" className="zrv-ir-half__track" />
        <path key={ready ? 'ready' : 'wait'} d="M10 52 A40 40 0 0 1 90 52" className="zrv-ir-half__value" stroke={`url(#${id})`}
          strokeDasharray={`${length} ${length}`} style={{ '--c': length, strokeDashoffset: length * (1 - share) }} />
        <g className="zrv-ir-half__needle" style={{ transform: `rotate(${share * 180 - 90}deg)` }}>
          <line x1="50" y1="52" x2="50" y2="22" /><circle cx="50" cy="52" r="4" />
        </g>
      </svg>
      <div className="zrv-ir-half__n">{ready ? (of ? <span><CountUp value={percent(value, of)} /><small>%</small></span> : <span>{COMMON_TEXT.dash}</span>) : <Skeleton />}</div>
    </div>
  )
}

// Vertical columns; the last one is highlighted. items: [{ key, label, count }].
export function Columns({ items, count: slots }) {
  const peak = Math.max(1, ...(items ?? []).map((item) => item.count))
  const shown = items ?? Array.from({ length: slots }, (_, index) => ({ key: index, label: '', count: 0 }))
  return (
    <ol className="zrv-ir-cols">
      {shown.map((item, index) => (
        <li key={item.key} style={{ '--i': index }} className={index === shown.length - 1 ? 'zrv-ir-is-now' : undefined} title={items ? T.bar(item.label, item.count) : undefined}>
          <span className="zrv-ir-cols__bar"><i style={{ height: `${items ? Math.max(4, (item.count / peak) * 100) : 0}%` }}><em>{items ? item.count : ''}</em></i></span>
          <small>{item.label}</small>
          {items && <span className="zrv-hr-sr">{T.bar(item.label, item.count)}</span>}
        </li>
      ))}
    </ol>
  )
}

// Funnel: centred bars narrowing with the count.
export function Funnel({ items }) {
  const peak = Math.max(1, ...items.map((item) => item.count ?? 0))
  return (
    <div className="zrv-ir-funnel" role="group">
      {items.map((item, index) => (
        <Pick key={item.key} item={item} className={`zrv-ir-funnel__row${tone(item.tone)}`}>
          <span className="zrv-ir-funnel__label">{item.label}</span>
          <span className="zrv-ir-funnel__track" aria-hidden="true">
            <i style={{ '--w': `${Math.max(6, ((item.count ?? 0) / peak) * 100)}%`, '--i': index }} />
          </span>
          <b>{num(item.count)}</b>
        </Pick>
      ))}
    </div>
  )
}

// Two-sided splits: rows of [left, right], each side a filter toggle.
export function Splits({ rows }) {
  return (
    <div className="zrv-ir-splits">
      {rows.map((row) => {
        const [left, right] = row.sides
        const total = (left.count ?? 0) + (right.count ?? 0)
        return (
          <div key={row.key} className="zrv-ir-split">
            <div className="zrv-ir-split__head">
              <span className="zrv-ir-split__title">{row.title}</span>
              <div className="zrv-ir-split__bar" aria-hidden="true">
                <i className={tone(left.tone).trim()} style={{ flexGrow: total ? left.count : 1 }} />
                <i className={tone(right.tone).trim()} style={{ flexGrow: total ? right.count : 1 }} />
              </div>
            </div>
            <div className="zrv-ir-split__sides" role="group" aria-label={row.title}>
              {row.sides.map((side) => (
                <Pick key={side.key} item={side} className={`zrv-ir-split__side${tone(side.tone)}`}>
                  <OrvexaIcon name={side.icon} size={14} /><span>{side.label}</span>
                  <b>{num(side.count)}</b>{side.count !== undefined && <small>{T.percentOf(percent(side.count, total))}</small>}
                </Pick>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Smooth area line over the points: [{ key, label, count }].
export function Sparkline({ points }) {
  const id = `${useId().replace(/:/g, '')}-area`
  if (!points) return <div className="zrv-ir-spark zrv-ir-spark--wait" aria-hidden="true" />
  const peak = Math.max(1, ...points.map((point) => point.count))
  const step = 100 / Math.max(1, points.length - 1)
  const xy = points.map((point, index) => [index * step, 36 - (point.count / peak) * 30])
  const line = xy.map(([x, y], index) => {
    if (!index) return `M${x} ${y}`
    const [px, py] = xy[index - 1]
    return `C${px + step / 2} ${py} ${x - step / 2} ${y} ${x} ${y}`
  }).join(' ')
  const [lastX, lastY] = xy.at(-1)
  return (
    <div className="zrv-ir-spark">
      <svg viewBox="-2 0 104 40" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" className="zrv-ir-stop-area" /><stop offset="100%" className="zrv-ir-stop-clear" /></linearGradient></defs>
        <path d={`${line} L100 40 L0 40 Z`} fill={`url(#${id})`} className="zrv-ir-spark__area" />
        <path d={line} className="zrv-ir-spark__line" pathLength="1" />
        <circle cx={lastX} cy={lastY} r="1.8" className="zrv-ir-spark__dot" />
      </svg>
      <ol className="zrv-ir-spark__axis">
        {points.map((point) => <li key={point.key} title={T.bar(point.label, point.count)}><span className="zrv-hr-sr">{T.bar(point.label, point.count)}</span><small aria-hidden="true">{point.label}</small></li>)}
      </ol>
    </div>
  )
}

// Horizontal comparison bars: [{ key, label, count, tone }].
export function Compare({ rows }) {
  const peak = Math.max(1, ...rows.map((row) => row.count ?? 0))
  return (
    <ul className="zrv-ir-compare">
      {rows.map((row, index) => (
        <li key={row.key} className={tone(row.tone).trim()}>
          <span>{row.label}</span>
          <span className="zrv-ir-compare__track" aria-hidden="true"><i style={{ '--w': `${((row.count ?? 0) / peak) * 100}%`, '--i': index }} /></span>
          <b>{num(row.count)}</b>
        </li>
      ))}
    </ul>
  )
}

// One tile per period, its tint the period's share of the busiest one.
export function HeatStrip({ items, slots }) {
  const peak = Math.max(1, ...(items ?? []).map((item) => item.count))
  const shown = items ?? Array.from({ length: slots }, (_, index) => ({ key: index, label: '', count: 0 }))
  return (
    <ol className="zrv-ir-heat">
      {shown.map((item, index) => (
        <li key={item.key} style={{ '--i': index, '--h': items ? item.count / peak : 0 }} title={items ? T.bar(`${item.label} ${item.year ?? ''}`.trim(), item.count) : undefined}>
          <span aria-hidden="true">{items ? item.count : ''}</span>
          <small aria-hidden="true">{item.label.slice(0, 1)}</small>
          {items && <span className="zrv-hr-sr">{T.bar(`${item.label} ${item.year ?? ''}`.trim(), item.count)}</span>}
        </li>
      ))}
    </ol>
  )
}

// Workflow steps joined by a track; `branch` hangs below the step before it.
export function Steps({ items, branch }) {
  return (
    <div className="zrv-ir-steps">
      <ol className="zrv-ir-steps__main" role="group">
        {items.map((item, index) => (
          <li key={item.key} style={{ '--i': index }}>
            <Pick item={item} className={`zrv-ir-step${tone(item.tone)}`}>
              <span className="zrv-ir-step__node"><OrvexaIcon name={item.icon} size={15} /></span>
              <b>{num(item.count)}</b>
              <small>{item.label}</small>
            </Pick>
          </li>
        ))}
      </ol>
      {branch && (
        <Pick item={branch} className={`zrv-ir-step zrv-ir-step--branch${tone(branch.tone)}`}>
          <span className="zrv-ir-step__node"><OrvexaIcon name={branch.icon} size={14} /></span>
          <small>{branch.label}</small><b>{num(branch.count)}</b>
        </Pick>
      )}
    </div>
  )
}

// Two large side-by-side tiles with their share between them.
export function Twin({ items }) {
  const total = items.reduce((sum, item) => sum + (item.count ?? 0), 0)
  return (
    <div className="zrv-ir-twin">
      <div className="zrv-ir-twin__tiles" role="group">
        {items.map((item) => (
          <Pick key={item.key} item={item} className={`zrv-ir-twin__tile${tone(item.tone)}`}>
            <OrvexaIcon name={item.icon} size={18} />
            <b>{num(item.count)}</b>
            <small>{item.label}</small>
          </Pick>
        ))}
      </div>
      <div className="zrv-ir-twin__bar" aria-hidden="true">
        {items.map((item) => <i key={item.key} className={tone(item.tone).trim()} style={{ flexGrow: total ? item.count : 1 }} />)}
      </div>
    </div>
  )
}

// Horizontal lanes: [{ key, label, count }] with the first lane emphasised.
export function Lanes({ items, slots }) {
  const peak = Math.max(1, ...(items ?? []).map((item) => item.count))
  const shown = items ?? Array.from({ length: slots }, (_, index) => ({ key: index, label: '', count: undefined }))
  return (
    <ul className="zrv-ir-lanes">
      {shown.map((item, index) => (
        <li key={item.key} style={{ '--i': index }}>
          <small>{item.label || <Skeleton />}</small>
          <span className="zrv-ir-lanes__track" aria-hidden="true"><i style={{ '--w': `${((item.count ?? 0) / peak) * 100}%` }} /></span>
          <b>{num(item.count)}</b>
        </li>
      ))}
    </ul>
  )
}

// Multi-part donut with the total inside and a legend of toggles.
export function Donut({ items, total, unit }) {
  const sum = items.reduce((value, item) => value + (item.count ?? 0), 0)
  const circumference = 2 * Math.PI * 38
  const arcs = items.reduce((list, item) => {
    const start = list.length ? list.at(-1).end : 0
    return [...list, { ...item, start, end: start + (sum ? ((item.count ?? 0) / sum) * circumference : 0) }]
  }, [])
  const anyActive = items.some((item) => item.active)
  return (
    <div className="zrv-ir-donut">
      <div className="zrv-ir-donut__chart">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="38" className="zrv-ir-donut__track" />
          {arcs.map((arc, index) => (
            <circle key={arc.key} cx="50" cy="50" r="38" style={{ '--i': index }}
              className={`zrv-ir-donut__seg${tone(arc.tone)}${anyActive && !arc.active ? ' zrv-ir-is-dim' : ''}`}
              strokeDasharray={`${Math.max(0, arc.end - arc.start - (sum ? 1.6 : 0))} ${circumference}`} strokeDashoffset={-arc.start} />
          ))}
        </svg>
        <div className="zrv-ir-donut__n"><b>{total === undefined ? <Skeleton /> : <CountUp value={total} />}</b><small>{unit}</small></div>
      </div>
      <div className="zrv-ir-donut__legend" role="group">
        {items.map((item) => (
          <Pick key={item.key} item={item} className={`zrv-ir-donut__item${tone(item.tone)}`}>
            <i aria-hidden="true" /><span>{item.label}</span><b>{num(item.count)}</b>
          </Pick>
        ))}
      </div>
    </div>
  )
}

// Ranked list (largest first) with proportional bars.
export function Rank({ items }) {
  const ready = items.every((item) => item.count !== undefined)
  const ordered = ready ? [...items].sort((a, b) => b.count - a.count) : items
  const peak = Math.max(1, ...items.map((item) => item.count ?? 0))
  return (
    <ol className="zrv-ir-rank" role="group">
      {ordered.map((item, index) => (
        <li key={item.key} style={{ '--i': index }}>
          <Pick item={item} className="zrv-ir-rank__row">
            <span className="zrv-ir-rank__n">{index + 1}</span>
            <span className="zrv-ir-rank__label">{item.label}</span>
            <b>{num(item.count)}</b>
            <span className="zrv-ir-rank__track" aria-hidden="true"><i style={{ '--w': `${((item.count ?? 0) / peak) * 100}%` }} /></span>
          </Pick>
        </li>
      ))}
    </ol>
  )
}

// A row of 20 ticks lit to the share `value` of `of`.
export function Ticks({ value, of }) {
  const lit = value !== undefined && of ? Math.round((value / of) * 20) : 0
  return (
    <div className="zrv-ir-ticks">
      <div className="zrv-ir-gauge__n zrv-ir-ticks__n">{value === undefined ? <Skeleton /> : of ? <span><CountUp value={percent(value, of)} /><small>%</small></span> : <span>{COMMON_TEXT.dash}</span>}</div>
      <div className="zrv-ir-ticks__row" aria-hidden="true">
        {Array.from({ length: 20 }, (_, index) => <i key={index} className={index < lit ? 'zrv-ir-is-on' : undefined} style={{ '--i': index }} />)}
      </div>
    </div>
  )
}
