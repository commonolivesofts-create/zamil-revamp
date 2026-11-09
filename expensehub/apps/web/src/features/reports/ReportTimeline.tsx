// Report drawer · Approvals and History tabs (UI-UX §5.3). Every step shows who, what, when and
// the comment; re-routed and skipped steps say why (D-34, FR-APR-02).
import type { ApprovalStepDto, ReportHistoryDto, StepStatus } from '@expensehub/shared';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  CornerDownRight,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { cn } from '../../lib/cn';
import { formatDateTime, formatRelative } from '../../lib/format';

const STEP_ICON: Record<StepStatus, { icon: LucideIcon; className: string }> = {
  APPROVED: { icon: CircleCheck, className: 'text-pass-text' },
  REJECTED: { icon: CircleX, className: 'text-block' },
  PENDING: { icon: Clock3, className: 'text-info' },
  WAITING: { icon: CircleDashed, className: 'text-muted' },
  SKIPPED: { icon: CornerDownRight, className: 'text-muted' },
  CANCELLED: { icon: Ban, className: 'text-muted' },
};

export function ApprovalSteps({ steps }: { steps: ApprovalStepDto[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t('reports.notSubmitted')}</p>;
  }
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const { icon: Icon, className } = STEP_ICON[step.status];
        const last = i === steps.length - 1;
        return (
          <li key={step.stepId} className="relative flex gap-3 pb-5">
            {!last && (
              <span
                aria-hidden
                className="absolute start-[11px] top-7 h-[calc(100%-1.5rem)] w-px bg-border"
              />
            )}
            <Icon
              aria-hidden
              className={cn('relative mt-0.5 size-6 shrink-0 bg-surface', className)}
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-medium">
                  {step.stepName}
                  {step.isAuditStep && (
                    <span className="ms-1.5 text-xs font-normal text-muted">
                      {t('reports.auditStep')}
                    </span>
                  )}
                </p>
                <p className={cn('text-xs font-medium', className)}>
                  {t(`reports.stepStatus.${step.status}`)}
                </p>
              </div>
              {step.status === 'SKIPPED' ? (
                <p className="text-sm text-muted">{t('reports.note.BELOW_THRESHOLD')}</p>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Avatar
                    name={step.actedByName ?? step.assigneeName}
                    size="sm"
                    className="size-5 text-[9px]"
                  />
                  {step.actedByName ?? step.assigneeName}
                  {step.actedAt && <span>· {formatDateTime(step.actedAt)}</span>}
                  {step.status === 'PENDING' && step.pendingSince && (
                    <span>· {t('reports.since', { when: formatRelative(step.pendingSince) })}</span>
                  )}
                </p>
              )}
              {step.note === 'SELF_APPROVAL' && (
                <p className="mt-1 text-xs text-muted">{t('reports.note.SELF_APPROVAL')}</p>
              )}
              {step.comment && (
                <p className="mt-1.5 rounded-input bg-surface-2 px-3 py-2 text-sm">
                  “{step.comment}”
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const HISTORY_ACTIONS = [
  'CREATED',
  'SUBMITTED',
  'STEP_APPROVED',
  'STEP_REJECTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'CORRECTED',
  'INFO_REQUESTED',
  'INFO_REPLIED',
  'PURPOSE_CHANGED',
  'AUDIT_SELECTED',
  'AUDIT_RELEASED',
  'LINE_ADJUSTED',
  'LINE_DISALLOWED',
  'RECEIPT_VERIFIED',
  'SENT_TO_PAYABLES',
  'SEND_FAILED',
  'PAID',
  'FUSION_CANCELLED',
  'PAYMENT_VOIDED',
  'SETTLED',
] as const;
type HistoryAction = (typeof HISTORY_ACTIONS)[number];
const isKnown = (a: string): a is HistoryAction =>
  (HISTORY_ACTIONS as readonly string[]).includes(a);

export function HistoryList({ history }: { history: ReportHistoryDto[] }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-3">
      {history.map((h) => (
        <li key={h.historyId} className="flex gap-3 text-sm">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-border" />
          <div className="min-w-0 flex-1">
            <p>
              <span className="font-medium">
                {isKnown(h.action) ? t(`reports.history.${h.action}`) : h.action}
              </span>
              {h.stepName && <span className="text-muted"> · {h.stepName}</span>}
            </p>
            <p className="text-xs text-muted">
              {h.actorName ?? t('reports.system')} ·{' '}
              <time dateTime={h.at}>{formatDateTime(h.at)}</time>
            </p>
            {h.comment && (
              <p className="mt-1 rounded-input bg-surface-2 px-3 py-1.5">“{h.comment}”</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
