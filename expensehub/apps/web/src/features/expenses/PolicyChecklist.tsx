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
    <Card className="eh-policy-check" aria-labelledby="policy-title">
      <div className="eh-policy-check__header">
        <div className="eh-policy-check__title">
          <span className="eh-policy-check__title-icon">
            <ListChecks aria-hidden className="size-[17px]" strokeWidth={1.8} />
          </span>
          <h2 id="policy-title">{t('expenses.policy.title')}</h2>
        </div>
        <div className="eh-policy-check__live" aria-live="polite">
          {checking && <Spinner className="size-3.5 text-muted" />}
          {ev && <Tag tone={LEVEL_TONE[ev.level]}>{t(`expenses.policy.overall.${ev.level}`)}</Tag>}
        </div>
      </div>

      {/* UI-UX §1: figures first. */}
      <div className="eh-policy-check__amount">
        <p className="eh-policy-check__amount-label">{t('expenses.policy.totalSar')}</p>
        <p className="eh-policy-check__amount-value" data-testid="amount-sar" aria-live="polite">
          {ev?.amountSar ? formatSar(ev.amountSar) : 'SAR —'}
        </p>
        {ev?.amountSar && ev.vatRecovery && (
          <dl className="eh-policy-check__taxes">
            <div>
              <dt>{t('expenses.policy.vat')}</dt>
              <dd>{formatSar(ev.vatSar)}</dd>
            </div>
            <div>
              <dt>{t('expenses.policy.net')}</dt>
              <dd>{formatSar(ev.netSar)}</dd>
            </div>
          </dl>
        )}
        {ev?.fxRateDate && currency !== 'SAR' && (
          <p className="eh-policy-check__fx">
            {t('expenses.policy.fx', {
              amount: `${currency} ${amount}`,
              rate: Number(ev.fxRate).toString(),
              date: formatDate(ev.fxRateDate),
            })}
          </p>
        )}
      </div>

      {waitingForType ? (
        <p className="eh-policy-check__empty">{t('expenses.policy.chooseType')}</p>
      ) : !ev ? (
        <div className="eh-policy-check__loading">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className={cn('eh-policy-check__rows', checking && 'is-checking')}>
          {rows.map((r) => {
            const Icon = LEVEL_ICON[r.level];
            return (
              <li
                key={`${r.rule}-${r.message}`}
                className={`eh-policy-check__row is-${r.level.toLowerCase()}`}
              >
                <span className="eh-policy-check__row-icon">
                  <Icon aria-hidden className="size-4" strokeWidth={2} />
                </span>
                <div className="eh-policy-check__row-copy">
                  <p className="eh-policy-check__row-title">
                    {t(`expenses.rules.${r.rule}`)}
                    <span className="sr-only"> — {t(`expenses.policy.level.${r.level}`)}</span>
                  </p>
                  <p className="eh-policy-check__message">{r.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
