import { INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { bandOf } from './interviewModel.js'

// One row per criterion: a 1–5 radio group (arrow keys move between ratings)
// and a remark. Missing ratings are marked invalid after a failed save.
export function RatingRows({ group, keys, values, onRate, onRemark, missing }) {
  return (
    <div className="zrv-hr-rows">
      {keys.map((key, index) => {
        const value = values[key]
        const bad = missing.includes(key)
        const [label] = T.criteria[key]
        const labelId = `ia-${group}-${key}-label`
        return (
          <div key={key} className={`zrv-hr-row${value.rating ? ' zrv-hr-is-rated' : ''}${bad ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
            <span className="zrv-hr-row__n" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="zrv-hr-row__l" id={labelId}>{label}</span>
            <div className="zrv-hr-pips" role="radiogroup" aria-labelledby={labelId} aria-required="true" aria-invalid={bad || undefined} data-val={value.rating || 0}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n}>
                  <input type="radio" name={`ia-${group}-${key}`} value={n} checked={value.rating === n} onChange={() => onRate(key, n)} aria-label={T.rating.of(n)} />
                  <span aria-hidden="true">{n}</span>
                </label>
              ))}
            </div>
            <input className="zrv-hr-row__rem" value={value.remark} onChange={(event) => onRemark(key, event.target.value)}
              placeholder={bad ? T.rating.choose : T.rating.remark} aria-label={T.rating.remarkFor(label)} maxLength={500} />
          </div>
        )
      })}
    </div>
  )
}

// Half-circle score gauge with the band ticks and legend. `labels` maps band
// codes (and notRated, soFar) to text; the interview bands by default.
export function Gauge({ total, max, bands, rated, count, labels = T.bands }) {
  const [index, code] = bandOf(total, bands, rated > 0)
  const label = code ? labels[code] : labels.notRated
  return (
    <div className="zrv-hr-gauge-box">
      <div className="zrv-hr-gauge">
        <svg viewBox="0 0 200 112" aria-hidden="true">
          <defs>
            <linearGradient id={`zrv-hr-gauge-${max}`} x1="0" x2="1">
              <stop offset="0" className="zrv-hr-gauge__stop-low" />
              <stop offset=".5" className="zrv-hr-gauge__stop-mid" />
              <stop offset="1" className="zrv-hr-gauge__stop-high" />
            </linearGradient>
          </defs>
          <path d="M18 100 A82 82 0 0 1 182 100" className="zrv-hr-gauge__bg" pathLength="100" />
          <path d="M18 100 A82 82 0 0 1 182 100" className="zrv-hr-gauge__fg" pathLength="100" stroke={`url(#zrv-hr-gauge-${max})`}
            style={{ strokeDasharray: `${((total / max) * 100).toFixed(2)} 100` }} />
          {bands.slice(1).map(([minimum]) => {
            const angle = Math.PI * (1 - minimum / max)
            return <circle key={minimum} cx={(100 + 82 * Math.cos(angle)).toFixed(1)} cy={(100 - 82 * Math.sin(angle)).toFixed(1)} r="3" className="zrv-hr-gauge__tick" />
          })}
        </svg>
        <div className="zrv-hr-gauge__c"><b aria-live="polite">{total}</b><small>{T.gauge.of(max)}</small></div>
      </div>
      <span className={`zrv-hr-band zrv-hr-is-b${index}`}>{label}{rated > 0 && rated < count ? labels.soFar : ''}</span>
      <div className="zrv-hr-bands">
        {bands.map(([minimum, band], position) => (
          <span key={band} className={position === index ? 'zrv-hr-is-on' : undefined}><i />{labels[band]}<small>{position === 0 ? `0–${bands[1][0] - 1}` : `${minimum}+`}</small></span>
        ))}
      </div>
    </div>
  )
}

// Radar of the ratings of one group.
export function Radar({ keys, values }) {
  const count = keys.length
  const cx = 120
  const cy = 94
  const radius = 62
  const point = (index, value) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
    return [cx + (radius * value / 5) * Math.cos(angle), cy + (radius * value / 5) * Math.sin(angle)]
  }
  const ring = (value) => keys.map((_, index) => point(index, value).map((n) => n.toFixed(1)).join(',')).join(' ')
  const ratings = keys.map((key) => values[key]?.rating || 0)
  const description = keys.map((key, index) => `${T.criteria[key][0]} ${ratings[index] || T.rating.notRated}`).join(', ')
  return (
    <svg className="zrv-hr-radar" viewBox="-34 0 308 190" role="img" aria-label={description}>
      {[1, 2, 3, 4, 5].map((value) => <polygon key={value} points={ring(value)} className={`zrv-hr-radar__grid${value === 5 ? ' zrv-hr-is-outer' : ''}`} />)}
      {keys.map((key, index) => {
        const [x, y] = point(index, 5)
        return <line key={key} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} className="zrv-hr-radar__grid" />
      })}
      <polygon points={ratings.map((value, index) => point(index, value).map((n) => n.toFixed(1)).join(',')).join(' ')} className="zrv-hr-radar__value" />
      {ratings.map((value, index) => (value ? <circle key={keys[index]} cx={point(index, value)[0].toFixed(1)} cy={point(index, value)[1].toFixed(1)} r="2.6" className="zrv-hr-radar__dot" /> : null))}
      {keys.map((key, index) => {
        const [x, y] = point(index, 6.3)
        const cos = Math.cos(-Math.PI / 2 + (index * 2 * Math.PI) / count)
        return <text key={key} x={x.toFixed(1)} y={(y + 3).toFixed(1)} textAnchor={Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end'} className="zrv-hr-radar__label">{T.criteria[key][1]}</text>
      })}
    </svg>
  )
}
