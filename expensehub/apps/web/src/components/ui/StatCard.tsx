// UI-UX §6 StatCard — one figure, what it counts, and where to act on it.
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  to,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  to?: string;
  tone?: 'neutral' | 'warn' | 'block';
}) {
  const body = (
    <>
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-input',
          tone === 'block'
            ? 'bg-block/10 text-block'
            : tone === 'warn'
              ? 'bg-warn/10 text-warn'
              : 'bg-brand/10 text-brand-solid dark:text-brand',
        )}
      >
        <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted">{label}</span>
        <span className="block truncate text-lg font-semibold tabular">{value}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </>
  );
  const classes =
    'flex items-start gap-3 rounded-card border border-border bg-surface p-4 shadow-card';
  return to ? (
    <Link
      to={to}
      className={cn(
        classes,
        'transition-shadow hover:shadow-raised focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
