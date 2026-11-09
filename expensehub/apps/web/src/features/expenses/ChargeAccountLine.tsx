// UI-UX §5.2 charge account line (FR-CAP-08): IPP . 003 . 127 . 55210 . 000 . 000000, each
// segment's description on hover/focus, an invalid segment in the block colour (FR-POL-05).
import type { ExpenseEvaluation } from '@expensehub/shared';
import { Landmark } from 'lucide-react';
import { Fragment, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

export function ChargeAccountLine({ segments }: { segments: ExpenseEvaluation['segments'] }) {
  const { t } = useTranslation();
  const id = useId();
  if (!segments.length) return null;
  const invalid = segments.filter((s) => !s.ok);

  return (
    <div className="rounded-card border border-border bg-surface-2/40 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        <Landmark aria-hidden className="size-3.5" />
        {t('expenses.account.title')}
      </p>
      <p
        className="mt-1.5 flex flex-wrap items-center gap-x-1 font-mono text-sm"
        data-testid="charge-account"
      >
        {segments.map((s, i) => {
          const label = t(`expenses.account.segments.${s.segment}`);
          const tip = `${label}: ${s.description ?? t('expenses.account.unknown')}${
            s.ok ? '' : ` — ${t('expenses.account.invalid')}`
          }`;
          const tipId = `${id}-${s.segment}`;
          return (
            <Fragment key={s.segment}>
              {i > 0 && (
                <span aria-hidden className="text-muted">
                  .
                </span>
              )}
              {/* A button so keyboard users reach the description too (UI-UX §8). */}
              <button
                type="button"
                aria-describedby={tipId}
                className={cn(
                  'group relative cursor-help rounded px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  s.ok ? 'text-ink' : 'font-semibold text-block underline decoration-wavy',
                )}
              >
                <span>{s.value}</span>
                <span
                  id={tipId}
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full start-0 z-10 mb-1.5 hidden w-max max-w-56 rounded-input bg-ink px-2 py-1 font-sans text-xs text-canvas shadow-raised group-hover:block group-focus-visible:block"
                >
                  {tip}
                </span>
              </button>
            </Fragment>
          );
        })}
      </p>
      {invalid.length > 0 && (
        <p className="mt-1.5 text-xs font-medium text-block">
          {t('expenses.account.invalidHint', {
            segments: invalid.map((s) => t(`expenses.account.segments.${s.segment}`)).join(', '),
          })}
        </p>
      )}
    </div>
  );
}
