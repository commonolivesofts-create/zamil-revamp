import { REPORT_TEXT as T } from '../hrRecruitmentText.js'

// Horizontal bars; with `onPick` each bar toggles a table filter (aria-pressed).
// `data`: [key, label, count].
export function Bars({ data, active, onPick, label }) {
  const max = Math.max(1, ...data.map(([, , count]) => count))
  return (
    <ul className="zrv-hr-rp-bars" aria-label={label}>
      {data.map(([key, text, count], index) => (
        <li key={key}>
          <button type="button" className={active === key ? 'zrv-hr-is-on' : undefined} aria-pressed={onPick ? active === key : undefined}
            disabled={!onPick} onClick={() => onPick?.(active === key ? '' : key)}>
            <span className="zrv-hr-rp-bars__l">{text}</span>
            <span className="zrv-hr-rp-bars__t" aria-hidden="true"><i style={{ transform: `scaleX(${count / max})`, transitionDelay: `${index * 40}ms` }} /></span>
            <b>{count}</b>
          </button>
        </li>
      ))}
    </ul>
  )
}

const TONES = Object.freeze(['zrv-hr-tone-1', 'zrv-hr-tone-2', 'zrv-hr-tone-3', 'zrv-hr-tone-4', 'zrv-hr-tone-5', 'zrv-hr-tone-6'])

// Nationality donut: the five largest groups and "Other"; legend entries filter the table.
export function Donut({ data, active, onPick }) {
  const total = data.reduce((sum, [, count]) => sum + count, 0) || 1
  const circumference = 2 * Math.PI * 42
  const top = data.slice(0, 5)
  const rest = data.slice(5).reduce((sum, [, count]) => sum + count, 0)
  const segments = rest ? [...top, [T.charts.other, rest]] : top
  const saudi = data.find(([name]) => name === T.charts.saudi)?.[1] ?? 0
  const arcs = segments.reduce((list, [name, count]) => {
    const start = list.length ? list[list.length - 1].end : 0
    return [...list, { name, count, start, end: start + (count / total) * circumference }]
  }, [])
  return (
    <div className="zrv-hr-rp-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={segments.map(([name, count]) => `${name} ${count}`).join(', ')}>
        <circle cx="60" cy="60" r="42" fill="none" className="zrv-hr-rp-donut__track" strokeWidth="16" />
        {arcs.map((arc, index) => (
          <circle key={arc.name} cx="60" cy="60" r="42" fill="none" className={`zrv-hr-rp-donut__seg ${TONES[index]}`} strokeWidth={active === arc.name ? 20 : 16}
            strokeDasharray={`${Math.max(0, arc.end - arc.start - 1.5)} ${circumference}`} strokeDashoffset={-arc.start} transform="rotate(-90 60 60)" />
        ))}
        <text x="60" y="58" textAnchor="middle" className="zrv-hr-rp-donut__n">{Math.round((saudi / total) * 100)}%</text>
        <text x="60" y="74" textAnchor="middle" className="zrv-hr-rp-donut__l">{T.charts.saudi}</text>
      </svg>
      <ul>
        {segments.map(([name, count], index) => (
          <li key={name}>
            <button type="button" className={active === name ? 'zrv-hr-is-on' : undefined} aria-pressed={name === T.charts.other ? undefined : active === name}
              disabled={name === T.charts.other} onClick={() => onPick(active === name ? '' : name)}>
              <i className={TONES[index]} aria-hidden="true" />{name}<b>{count}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Joiners and leavers per year (6 years).
export function Flow({ data }) {
  const max = Math.max(1, ...data.flatMap(([, joined, left]) => [joined, left]))
  return (
    <>
      <div className="zrv-hr-rp-flow" role="img" aria-label={data.map(([year, joined, left]) => T.charts.flowLabel(year, joined, left)).join('; ')}>
        {data.map(([year, joined, left]) => (
          <div key={year}>
            <span className="zrv-hr-rp-flow__c">
              <i className="zrv-hr-rp-joined" style={{ height: `${(joined / max) * 100}%` }} />
              <i className="zrv-hr-rp-left" style={{ height: `${(left / max) * 100}%` }} />
            </span>
            <small>{year.slice(2)}</small>
          </div>
        ))}
      </div>
      <div className="zrv-hr-rp-legend"><span><i className="zrv-hr-rp-joined" />{T.charts.joined}</span><span><i className="zrv-hr-rp-left" />{T.charts.left}</span></div>
    </>
  )
}
