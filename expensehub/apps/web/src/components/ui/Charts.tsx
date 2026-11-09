// UI-UX §5.1 dashboard charts: a donut (spend by category) and month bars (trend). Plain SVG —
// no chart library — with a screen-reader table carrying the same numbers (UI-UX §8).
import { formatSar as halalasToString, parseSar, type Halalas } from '@expensehub/shared';
import { cn } from '../../lib/cn';
import { formatSar } from '../../lib/format';

const SERIES = Array.from({ length: 7 }, (_, i) => `var(--color-chart-${i + 1})`);
const seriesColor = (i: number) => SERIES[Math.min(i, SERIES.length - 1)]!;
/** Exact: integer halalas → "1234.50". */
const sar = (halalas: number) => halalasToString(halalas as Halalas);

export function DonutChart({
  data,
  centerLabel,
  caption,
  otherLabel,
}: {
  data: { label: string; amountSar: string }[];
  centerLabel: string;
  caption: string;
  otherLabel: string;
}) {
  // At most 6 slices; the rest are "Other" (proportions from exact halalas).
  const sorted = [...data].sort((a, b) => parseSar(b.amountSar) - parseSar(a.amountSar));
  const top = sorted.slice(0, 6).map((d) => ({
    label: d.label,
    value: parseSar(d.amountSar) as number,
    amountSar: d.amountSar,
  }));
  const rest = sorted.slice(6);
  if (rest.length) {
    const value = rest.reduce((s, d) => s + parseSar(d.amountSar), 0);
    top.push({ label: otherLabel, value, amountSar: sar(value) });
  }
  const total = top.reduce((s, d) => s + d.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <figure className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-36 shrink-0">
        {/* Colours go in `style`: SVG presentation attributes do not resolve CSS variables. */}
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            style={{ stroke: 'var(--color-surface-2)' }}
            strokeWidth="12"
          />
          {total > 0 &&
            top.map((d, i) => {
              const length = (d.value / total) * c;
              const dash = (
                <circle
                  key={d.label}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  style={{ stroke: seriesColor(i) }}
                  strokeWidth="12"
                  strokeDasharray={`${Math.max(length - 0.6, 0)} ${c}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return dash;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <span>
            <span className="block text-[11px] text-muted">{centerLabel}</span>
            <span className="block text-sm font-semibold tabular">{formatSar(sar(total))}</span>
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {top.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: seriesColor(i) }}
            />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="tabular text-muted">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
            <span className="w-28 text-end font-medium tabular">{formatSar(d.amountSar)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

export function MonthBars({
  data,
  caption,
  formatMonth,
}: {
  data: { month: string; amountSar: string }[];
  caption: string;
  formatMonth: (month: string) => string;
}) {
  const values = data.map((d) => parseSar(d.amountSar));
  const max = Math.max(...values, 1);
  return (
    <figure>
      <div className="flex h-36 items-end gap-1.5" aria-hidden>
        {data.map((d, i) => {
          const value = values[i]!;
          const last = i === data.length - 1;
          return (
            <div
              key={d.month}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`${formatMonth(d.month)}: ${formatSar(d.amountSar)}`}
            >
              <div
                className={cn(
                  'w-full rounded-t-[4px] transition-colors',
                  value === 0
                    ? 'bg-surface-2'
                    : last
                      ? 'bg-brand'
                      : 'bg-brand/40 group-hover:bg-brand/70',
                )}
                style={{ height: `${Math.max((value / max) * 100, value === 0 ? 3 : 6)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-center text-[10px] text-muted" aria-hidden>
        {data.map((d, i) => (
          <span key={d.month} className={cn('flex-1 truncate', i % 2 === 1 && 'max-sm:invisible')}>
            {formatMonth(d.month)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{formatMonth(d.month)}</th>
              <td>{formatSar(d.amountSar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
