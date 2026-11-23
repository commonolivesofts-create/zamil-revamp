// Dashboard widgets ("attendance pulse" design, zat-pulse-*): gradient hero with a day heat strip,
// count-up KPI cards with sparklines, a gradient area chart, a payroll checklist timeline, a
// stacked leave-mix bar and ranked leaderboards. Dependency-free SVG/CSS; colours are theme
// tokens in styles/dashboard.css, so light and dark mode both work. Motion respects
// prefers-reduced-motion.
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { phpNumberFormat, type Dashboard } from '@attendance/shared';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { dayRate, useCountUp } from './pulse';

export type Tone = 'teal' | 'indigo' | 'amber' | 'rose' | 'violet' | 'sky' | 'g3' | 'g4' | 'muted';

const n = (value: number, decimals = 0) => phpNumberFormat(value, decimals);

function CountUp({
  value,
  decimals = 0,
  suffix = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const shown = useCountUp(value);
  return (
    <>
      {n(shown, decimals)}
      {suffix}
    </>
  );
}

/* ------------------------------------------------------------------ hero */

export function Hero({ data, ready }: { data: Dashboard; ready: boolean }) {
  const p = data.process;
  const rates = data.trend.map(dayRate);
  const avg = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  return (
    <section className="zat-pulse-hero" aria-label="Payroll period overview">
      <div className="zat-pulse-hero__glow" aria-hidden="true" />
      <div className="zat-pulse-hero__main">
        <p className="zat-pulse-hero__kicker">
          <span className={`zat-pulse-dot ${ready ? 'is-ready' : ''}`} aria-hidden="true" />
          {p.statusText}
        </p>
        <h2>
          {data.period.fromLabel} <span aria-hidden="true">→</span>
          <span className="sr-only"> to </span> {data.period.toLabel}
        </h2>
        <p className="zat-pulse-hero__sub">Payroll period · updated {data.period.generatedAt}</p>
      </div>
      <dl className="zat-pulse-hero__stats">
        <div>
          <dt>Processed</dt>
          <dd>
            <CountUp value={p.coverage} suffix="%" />
          </dd>
          <span className="zat-pulse-meter" aria-hidden="true">
            <i style={{ '--w': `${Math.min(100, p.coverage)}%` } as CSSProperties} />
          </span>
          <small>
            {n(p.processedEmployees)} of {n(p.assignedEmployees)} employees
          </small>
        </div>
        <div>
          <dt>Avg. attendance rate</dt>
          <dd>
            <CountUp value={avg} decimals={1} suffix="%" />
          </dd>
          <span className="zat-pulse-meter" aria-hidden="true">
            <i style={{ '--w': `${Math.min(100, avg)}%` } as CSSProperties} />
          </span>
          <small>{n(data.trend.length)} processed days</small>
        </div>
      </dl>
      <HeatStrip rows={data.trend} />
    </section>
  );
}

/** One cell per processed day, shaded by its attendance rate. */
function HeatStrip({ rows }: { rows: Dashboard['trend'] }) {
  if (rows.length === 0) return null;
  return (
    <ol className="zat-pulse-heat" aria-label="Attendance rate per processed day">
      {rows.map((r, i) => {
        const rate = dayRate(r);
        const level = rate >= 95 ? 4 : rate >= 85 ? 3 : rate >= 70 ? 2 : rate > 0 ? 1 : 0;
        return (
          <li
            key={r.date}
            className={`zat-pulse-heat__cell is-l${level}`}
            style={{ '--i': i } as CSSProperties}
            title={`${r.label}: ${rate.toFixed(1)}% attendance (${r.present} present)`}
          >
            <span className="sr-only">{`${r.label}: ${rate.toFixed(1)}%`}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ KPI cards */

export interface Kpi {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  note: string;
  icon: string;
  tone: Tone;
  spark?: number[];
}

function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / span) * 24] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');
  return (
    <svg
      className="zat-pulse-spark"
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,30L0,30Z`} fill={`url(#${id})`} />
      <path d={line} className="zat-pulse-spark__line" />
    </svg>
  );
}

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <section className="zat-pulse-kpis" aria-label="Key figures">
      {items.map((k, i) => (
        <article
          key={k.label}
          className={`zat-pulse-kpi zat-t-${k.tone}`}
          style={{ '--i': i } as CSSProperties}
        >
          <header>
            <span className="zat-pulse-kpi__icon" aria-hidden="true">
              <OrvexaIcon name={k.icon} size={18} />
            </span>
            <h3>{k.label}</h3>
          </header>
          <p className="zat-pulse-kpi__value">
            <CountUp value={k.value} decimals={k.decimals} suffix={k.suffix} />
          </p>
          <p className="zat-pulse-kpi__note">{k.note}</p>
          {k.spark && <Sparkline values={k.spark} />}
        </article>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ panel */

export function Panel({
  id,
  title,
  note,
  icon,
  className = '',
  children,
}: {
  id: string;
  title: string;
  note?: string;
  icon: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`zat-pulse-panel ${className}`} aria-labelledby={id}>
      <header className="zat-pulse-panel__head">
        <span className="zat-pulse-panel__icon" aria-hidden="true">
          <OrvexaIcon name={icon} size={16} />
        </span>
        <div>
          <h3 id={id}>{title}</h3>
          {note && <p>{note}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <p className="zat-pulse-empty">
    <OrvexaIcon name="inbox" size={18} aria-hidden="true" />
    {children}
  </p>
);

/* ------------------------------------------------------------------ area chart */

/** Catmull-Rom to cubic Bézier: a smooth line through every point. */
function smooth(pts: readonly (readonly [number, number])[]) {
  if (pts.length === 0) return '';
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Smooth gradient area of the daily attendance rate, with late arrivals as a dashed line. */
export function RateChart({ rows }: { rows: Dashboard['trend'] }) {
  const gid = useId();
  if (rows.length === 0) return <Empty>No processed days in this payroll period yet.</Empty>;
  const W = 720;
  const H = 240;
  const pad = { t: 14, r: 26, b: 28, l: 40 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (pct: number) => pad.t + ih - (pct / 100) * ih;
  const rates = rows.map(dayRate);
  const line = smooth(rates.map((r, i) => [x(i), y(r)] as const));
  const area = `${line} L${x(rows.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const every = Math.ceil(rows.length / 7);
  const best = rates.indexOf(Math.max(...rates));
  const worst = rates.indexOf(Math.min(...rates));
  const short = (i: number) => rows[i]!.label.slice(0, 6);

  return (
    <figure className="zat-pulse-chart">
      <div className="zat-pulse-chart__scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Daily attendance rate for ${rows.length} processed days, between ${rates[worst]!.toFixed(1)}% and ${rates[best]!.toFixed(1)}%`}
        >
          <defs>
            <linearGradient id={`${gid}a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="zat-pulse-stop-a" stopOpacity="0.42" />
              <stop offset="100%" className="zat-pulse-stop-a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${gid}l`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" className="zat-pulse-stop-a" />
              <stop offset="100%" className="zat-pulse-stop-b" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t} className="zat-pulse-axis">
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                {t}%
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gid}a)`} className="zat-pulse-area" />
          <path d={line} stroke={`url(#${gid}l)`} className="zat-pulse-line" pathLength={1} />
          {rows.map((r, i) => (
            <g key={r.date} className="zat-pulse-point">
              <title>{`${r.label}: ${rates[i]!.toFixed(1)}% attendance · ${r.present} present, ${r.onLeave} on leave, ${r.absent} absent, ${r.late} late`}</title>
              <rect
                x={x(i) - iw / rows.length / 2}
                y={pad.t}
                width={iw / rows.length}
                height={ih}
              />
              <circle cx={x(i)} cy={y(rates[i]!)} r={i === best || i === worst ? 4 : 2.5} />
              {i % every === 0 && (
                <text x={x(i)} y={H - 8} textAnchor="middle" className="zat-pulse-axis__x">
                  {short(i)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="zat-pulse-keys">
        <span className="zat-pulse-key zat-pulse-key--rate">Attendance rate</span>
        <span className="zat-pulse-keys__range">
          Best <b>{short(best)}</b> {rates[best]!.toFixed(1)}% · Lowest <b>{short(worst)}</b>{' '}
          {rates[worst]!.toFixed(1)}%
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ checklist */

export interface CheckItem {
  label: string;
  detail: string;
  value: number;
  href: string;
  done: boolean;
  suffix?: string;
}

/** Payroll checklist as a vertical timeline; each step links to the page that resolves it. */
export function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <ol className="zat-pulse-steps">
      {items.map((item, i) => (
        <li
          key={item.label}
          className={item.done ? 'is-done' : 'is-open'}
          style={{ '--i': i } as CSSProperties}
        >
          <span className="zat-pulse-steps__mark" aria-hidden="true">
            <OrvexaIcon name={item.done ? 'check' : 'alert-triangle'} size={13} />
          </span>
          <Link to={item.href}>
            <span>
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </span>
            <strong>
              {n(item.value)}
              {item.suffix}
            </strong>
            <span className="sr-only">{item.done ? ' (done)' : ' (needs attention)'}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ leave mix */

/** Calm graded greens for leave types; unauthorised absence keeps the soft alert colour. */
const MIX_TONES: Tone[] = ['teal', 'violet', 'g3', 'g4', 'muted'];
const AWOP = 'Absence without permission';

/** Leave and absence days by type as one 100% stacked bar plus a ranked legend. */
export function LeaveMix({ rows }: { rows: Dashboard['absenceTypes'] }) {
  const total = rows.reduce((s, r) => s + r.days, 0);
  if (total === 0) return <Empty>No leave or absence in this period.</Empty>;
  const top = rows.slice(0, 4);
  const other = rows.slice(4).reduce((s, r) => s + r.days, 0);
  const parts = other > 0 ? [...top, { type: 'Other', days: other }] : top;
  const greens = parts.filter((p) => p.type !== AWOP);
  const toneOf = (type: string): Tone =>
    type === AWOP
      ? 'rose'
      : MIX_TONES[greens.findIndex((p) => p.type === type) % MIX_TONES.length]!;
  return (
    <div className="zat-pulse-mix">
      <p className="zat-pulse-mix__total">
        <b>
          <CountUp value={total} />
        </b>{' '}
        days of leave and absence
      </p>
      <div
        className="zat-pulse-mix__bar"
        role="img"
        aria-label={`${total} leave and absence days: ${parts.map((p) => `${p.type} ${p.days}`).join(', ')}`}
      >
        {parts.map((p, i) => (
          <i
            key={p.type}
            className={`zat-t-${toneOf(p.type)}`}
            style={{ '--w': `${(p.days / total) * 100}%`, '--i': i } as CSSProperties}
            title={`${p.type}: ${p.days} days`}
          />
        ))}
      </div>
      <ul className="zat-pulse-mix__list">
        {parts.map((p) => (
          <li key={p.type} className={`zat-t-${toneOf(p.type)}`}>
            <span className="zat-pulse-mix__swatch" aria-hidden="true" />
            <span className="zat-pulse-mix__name">{p.type}</span>
            <b>{n(p.days)}</b>
            <small>{Math.round((p.days / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ ranking */

export function Ranking({
  rows,
  unit,
  tone,
  empty,
  decimals = 2,
}: {
  rows: Dashboard['topOvertime'];
  unit: string;
  tone: Tone;
  empty: string;
  decimals?: number;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className={`zat-pulse-rank zat-t-${tone}`}>
      {rows.map((row, i) => {
        const initials = (row.empName || row.empNo)
          .split(/[\s,]+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase())
          .join('');
        return (
          <li key={row.empNo} style={{ '--i': i } as CSSProperties}>
            <span className="zat-pulse-rank__avatar" aria-hidden="true">
              {initials}
            </span>
            <div className="zat-pulse-rank__who">
              <div>
                <b title={row.empName}>{row.empName || row.empNo}</b>
                <span>
                  {n(row.value, decimals)} <small>{unit}</small>
                </span>
              </div>
              <span className="zat-pulse-rank__track" aria-hidden="true">
                <i style={{ '--w': `${(row.value / max) * 100}%` } as CSSProperties} />
              </span>
              <small>#{row.empNo}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ departments */

/** Headcount per department as tiles with a gradient fill proportional to size. */
const DEPARTMENTS_SHOWN = 10;

export function Departments({ rows }: { rows: Dashboard['departments'] }) {
  const [all, setAll] = useState(false);
  if (rows.length === 0) return <Empty>No department data available.</Empty>;
  const shown = all ? rows : rows.slice(0, DEPARTMENTS_SHOWN);
  const total = rows.reduce((s, r) => s + r.employeeCount, 0);
  const max = Math.max(1, ...rows.map((r) => r.employeeCount));
  return (
    <>
      <ul className="zat-pulse-depts" aria-label="Employee headcount by department">
        {shown.map((row, i) => (
          <li
            key={row.department}
            style={{ '--i': i, '--w': `${(row.employeeCount / max) * 100}%` } as CSSProperties}
            title={`${row.department}: ${row.employeeCount} employees`}
          >
            <span className="zat-pulse-depts__fill" aria-hidden="true" />
            <span className="zat-pulse-depts__name">{row.department}</span>
            <span className="zat-pulse-depts__count">
              <b>{n(row.employeeCount)}</b>
              <small>{Math.round((row.employeeCount / Math.max(1, total)) * 100)}%</small>
            </span>
          </li>
        ))}
      </ul>
      {rows.length > DEPARTMENTS_SHOWN && (
        <button
          type="button"
          className="zat-pulse-more"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show top 10' : `Show all ${rows.length} departments`}
          <OrvexaIcon name={all ? 'chevron-up' : 'chevron-down'} size={16} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
