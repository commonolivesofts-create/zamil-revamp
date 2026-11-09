// UI-UX §5.3 Stepper: Submitted → Approved → Audited → Invoiced → Paid. The current step shows
// who holds the report and since when (FR-REP-07). `ProgressBar` is the compact list version.
import type { ReportStatus } from '@expensehub/shared';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { STAGES, stageOf } from '../../lib/report-status';

export function ProgressBar({ status, className }: { status: ReportStatus; className?: string }) {
  const { t } = useTranslation();
  const { done, failed } = stageOf(status);
  return (
    <div
      role="img"
      aria-label={t('reports.progress', { done, total: STAGES.length })}
      className={cn('flex gap-1', className)}
    >
      {STAGES.map((stage, i) => (
        <span
          key={stage}
          className={cn(
            'h-1.5 flex-1 rounded-pill',
            i < done
              ? 'bg-brand'
              : failed && i === done
                ? 'bg-block'
                : i === done && status !== 'DRAFT'
                  ? 'bg-brand/35'
                  : 'bg-border',
          )}
        />
      ))}
    </div>
  );
}

export function Stepper({
  status,
  holder,
}: {
  status: ReportStatus;
  /** Shown under the current step: "Majed Al-Anazi · Line Manager · since 2 days". */
  holder?: string | null;
}) {
  const { t } = useTranslation();
  const { done, current, failed } = stageOf(status);

  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t('reports.stepperLabel')}>
      {STAGES.map((stage, i) => {
        const complete = i < done && !(failed && i === current);
        const isCurrent = i === current;
        const isFailed = failed && isCurrent;
        return (
          <li key={stage} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute end-1/2 top-3.5 h-0.5 w-full -translate-y-1/2',
                  i <= done ? 'bg-brand' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-7 place-items-center rounded-full text-xs font-semibold ring-4 ring-surface',
                isFailed
                  ? 'bg-block text-white'
                  : complete
                    ? 'bg-brand-solid text-brand-fg'
                    : isCurrent
                      ? 'bg-surface text-brand-solid ring-brand/30 outline-2 outline-brand-solid outline dark:text-brand'
                      : 'bg-surface-2 text-muted',
              )}
            >
              {isFailed ? (
                <X aria-hidden className="size-3.5" strokeWidth={3} />
              ) : complete ? (
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                'mt-1.5 text-[11px] font-medium leading-tight sm:text-xs',
                isCurrent || complete ? 'text-ink' : 'text-muted',
              )}
            >
              {t(`reports.stages.${stage}`)}
              <span className="sr-only">
                {' — '}
                {isFailed
                  ? t('reports.stageRejected')
                  : complete
                    ? t('reports.stageDone')
                    : isCurrent
                      ? t('reports.stageCurrent')
                      : t('reports.stageTodo')}
              </span>
            </span>
          </li>
        );
      })}
      {holder && current !== null && (
        <li className="col-span-5 mt-3 rounded-input bg-surface-2/70 px-3 py-2 text-center text-xs text-muted">
          {holder}
        </li>
      )}
    </ol>
  );
}
