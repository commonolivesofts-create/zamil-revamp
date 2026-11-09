// UI-UX §5.2 live policy checklist (FR-POL-02): one row per rule, ✓ pass / ! warn / ✕ block.
// The figures come from the server engine — the client never computes money.
import type { ExpenseEvaluation, PolicyLevel } from '@expensehub/shared';
import { CircleCheck, CircleX, ListChecks, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDate, formatSar } from '../../lib/format';

const LEVEL_ICON: Record<PolicyLevel, LucideIcon> = {
  PASS: CircleCheck,
  WARN: TriangleAlert,
  BLOCK: CircleX,
};
const LEVEL_COLOR: Record<PolicyLevel, string> = {
  PASS: 'text-pass-text',
  WARN: 'text-warn',
  BLOCK: 'text-block',
};
const LEVEL_TONE = { PASS: 'pass', WARN: 'warn', BLOCK: 'block' } as const;

export function PolicyChecklist({
  evaluation,
  checking,
  waitingForType,
  currency,
  amount,
}: {
  evaluation: ExpenseEvaluation | undefined;
  checking: boolean;
  waitingForType: boolean;
  currency: string;
  amount: string;
}) {
  const { t } = useTranslation();
  const ev = waitingForType ? undefined : evaluation;
  const order = { BLOCK: 0, WARN: 1, PASS: 2 };
  const rows = ev ? [...ev.results].sort((a, b) => order[a.level] - order[b.level]) : [];

  return (
    <Card className="overflow-hidden" aria-labelledby="policy-title">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 id="policy-title" className="flex items-center gap-2 font-semibold">
          <ListChecks aria-hidden className="size-[18px] text-muted" strokeWidth={1.75} />
          {t('expenses.policy.title')}
        </h2>
        <div className="flex items-center gap-2" aria-live="polite">
          {checking && <Spinner className="size-3.5 text-muted" />}
          {ev && <Tag tone={LEVEL_TONE[ev.level]}>{t(`expenses.policy.overall.${ev.level}`)}</Tag>}
        </div>
      </div>

      {/* UI-UX §1: figures first. */}
      <div className="border-b border-border bg-surface-2/40 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {t('expenses.policy.totalSar')}
        </p>
        <p
          className="mt-1 text-display font-semibold tabular"
          data-testid="amount-sar"
          aria-live="polite"
        >
          {ev?.amountSar ? formatSar(ev.amountSar) : 'SAR —'}
        </p>
        {ev?.amountSar && ev.vatRecovery && (
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <div className="flex gap-1.5">
              <dt>{t('expenses.policy.vat')}</dt>
              <dd className="tabular text-ink">{formatSar(ev.vatSar)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{t('expenses.policy.net')}</dt>
              <dd className="tabular text-ink">{formatSar(ev.netSar)}</dd>
            </div>
          </dl>
        )}
        {ev?.fxRateDate && currency !== 'SAR' && (
          <p className="mt-1 text-xs text-muted tabular">
            {t('expenses.policy.fx', {
              amount: `${currency} ${amount}`,
              rate: Number(ev.fxRate).toString(),
              date: formatDate(ev.fxRateDate),
            })}
          </p>
        )}
      </div>

      {waitingForType ? (
        <p className="px-5 py-6 text-sm text-muted">{t('expenses.policy.chooseType')}</p>
      ) : !ev ? (
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        <ul className={cn('divide-y divide-border', checking && 'opacity-70')}>
          {rows.map((r) => {
            const Icon = LEVEL_ICON[r.level];
            return (
              <li key={`${r.rule}-${r.message}`} className="flex gap-3 px-5 py-3">
                <Icon
                  aria-hidden
                  className={cn('mt-0.5 size-4 shrink-0', LEVEL_COLOR[r.level])}
                  strokeWidth={2}
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {t(`expenses.rules.${r.rule}`)}
                    <span className="sr-only"> — {t(`expenses.policy.level.${r.level}`)}</span>
                  </p>
                  <p className="text-muted">{r.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
