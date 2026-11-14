// UI-UX §4 audit workspace (FR-AUD-03/04, FR-ACC-01): each line beside its receipt; verify,
// reduce or disallow with a reason (the claimed amount is kept); release or reject.
import {
  POLICY_RULES,
  type ExpenseDto,
  type PolicyRule,
  type ReportDetail,
} from '@expensehub/shared';
import { ArrowLeft, BadgeCheck, ExternalLink, FileText, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusPill } from '../../components/ui/StatusPill';
import { Tag } from '../../components/ui/Tag';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDate, formatSar } from '../../lib/format';
import { useReport } from '../reports/hooks';
import { AccountingPreview } from './AccountingPreview';
import { useAuditAction } from './hooks';

export function AuditWorkspacePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const reportId = Number(id);
  const report = useReport(reportId);

  if (report.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!report.data) {
    return <p className="py-16 text-center text-sm text-muted">{t('reports.notFound')}</p>;
  }
  return <Workspace report={report.data} />;
}

function Workspace({ report }: { report: ReportDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = useAuditAction(report.reportId);
  const [releasing, setReleasing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const editable = report.permissions.canAudit;

  const approvedTotal = report.cashSar;
  const verified = report.lines.filter((l) => l.receipt?.verified).length;
  const withReceipt = report.lines.filter((l) => l.receipt).length;

  const finish = async (kind: 'release' | 'reject', comment?: string) => {
    try {
      await action.mutateAsync(
        kind === 'release' ? { kind, comment } : { kind, comment: comment! },
      );
      toast.success(t(`audit.done.${kind}`));
      void navigate('/audit');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link to="/audit" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft aria-hidden className="size-3.5 rtl:rotate-180" />
            {t('audit.title')}
          </Link>
        }
        title={report.reportNumber ?? t('reports.draftTitle')}
        description={`${report.claimant.fullName} · ${report.businessUnit} · ${report.purpose}`}
        actions={<StatusPill status={report.status} />}
      />

      {!editable && (
        <Card className="mb-6 flex items-center gap-3 border-info/30 p-4 text-sm">
          <Lock aria-hidden className="size-4 shrink-0 text-info" />
          {t('audit.readOnly')}
        </Card>
      )}

      {report.audit && (
        <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck aria-hidden className="size-4 text-info" />
            {t('audit.why')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {report.audit.reasons.map((reason) => (
              <Tag key={reason} tone="info">
                {t(`audit.reasons.${reason}`)}
              </Tag>
            ))}
          </div>
          {report.audit.outcome && (
            <p className="text-sm text-muted">
              {t(`audit.outcome.${report.audit.outcome}`, { name: report.audit.auditorName ?? '' })}
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ul className="min-w-0 space-y-4" aria-label={t('reports.tabs.items')}>
          {report.lines.map((line) => (
            <li key={line.expenseId}>
              <LineCard line={line} reportId={report.reportId} editable={editable} />
            </li>
          ))}
          <li>
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">{t('reports.tabs.accounting')}</h2>
              <AccountingPreview reportId={report.reportId} />
            </Card>
          </li>
        </ul>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t('audit.claimed')}
                </dt>
                <dd className="text-lg font-semibold tabular">{formatSar(report.totalSar)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t('audit.approved')}
                </dt>
                <dd className="text-lg font-semibold tabular" data-testid="approved-total">
                  {formatSar(approvedTotal)}
                </dd>
              </div>
              <div className="col-span-2 border-t border-border pt-4">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t('reports.netPayable')}
                </dt>
                <dd className="whitespace-nowrap text-display font-semibold tabular">
                  {formatSar(report.netPayableSar)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {t('audit.receipts')}
                </dt>
                <dd className="text-sm font-medium">
                  {t('audit.receiptsVerified', { done: verified, total: withReceipt })}
                </dd>
              </div>
            </dl>
          </Card>

          {editable && (
            <Card className="flex flex-wrap justify-end gap-2 p-4">
              <Button variant="secondary" className="text-block" onClick={() => setRejecting(true)}>
                {t('reports.actions.reject')}
              </Button>
              <Button onClick={() => setReleasing(true)}>
                <BadgeCheck aria-hidden />
                {t('audit.release')}
              </Button>
            </Card>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={releasing}
        onOpenChange={setReleasing}
        title={t('audit.releaseTitle')}
        body={t('audit.releaseBody', { amount: formatSar(report.netPayableSar) })}
        confirmLabel={t('audit.release')}
        tone="primary"
        pending={action.isPending}
        onConfirm={() => void finish('release')}
      />
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={t('reports.rejectTitle', { number: report.reportNumber ?? '' })}
        body={t('reports.rejectBody')}
        label={t('reports.reason')}
        confirmLabel={t('reports.actions.reject')}
        tone="danger"
        pending={action.isPending}
        onConfirm={(text) => void finish('reject', text)}
      />
    </div>
  );
}

function LineCard({
  line,
  reportId,
  editable,
}: {
  line: ExpenseDto;
  reportId: number;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const action = useAuditAction(reportId);
  const [amount, setAmount] = useState(line.approvedAmountSar);
  const [reason, setReason] = useState(line.adjustmentReason ?? '');
  const [error, setError] = useState<{ amount?: string; reason?: string }>({});
  const adjusted = line.approvedAmountSar !== line.amountSar;
  const receipt = line.receipt;

  const save = async (approvedAmount: string) => {
    if (!reason.trim()) {
      setError({ reason: t('reports.reasonRequired') });
      return;
    }
    setError({});
    try {
      await action.mutateAsync({
        kind: 'adjust',
        expenseId: line.expenseId,
        body: { approvedAmount, reason },
      });
      setAmount(approvedAmount);
      toast.success(
        /^0+(\.0+)?$/.test(approvedAmount) ? t('audit.done.disallow') : t('audit.done.adjust'),
      );
    } catch (err) {
      const issue =
        err instanceof ApiError
          ? (err.details as { issues?: { path: string; message: string }[] })?.issues?.[0]
          : undefined;
      if (issue?.path === 'approvedAmount') setError({ amount: issue.message });
      else toast.error((err as Error).message);
    }
  };

  return (
    <Card className={cn('overflow-hidden', adjusted && 'border-warn/40')}>
      <div className="grid gap-0 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center gap-2 border-b border-border bg-surface-2/50 p-3 sm:border-b-0 sm:border-e">
          {receipt ? (
            <>
              <a href={receipt.url} target="_blank" rel="noreferrer" className="group block w-full">
                {receipt.mime === 'application/pdf' ? (
                  <span className="grid h-32 place-items-center rounded-input bg-surface text-muted">
                    <FileText aria-hidden className="size-8" />
                  </span>
                ) : (
                  <img
                    src={receipt.url}
                    alt={t('expenses.receipt.alt', { name: receipt.originalName })}
                    className="h-32 w-full rounded-input bg-white object-contain"
                  />
                )}
                <span className="mt-1 flex items-center justify-center gap-1 text-xs text-brand-solid group-hover:underline dark:text-brand">
                  <ExternalLink aria-hidden className="size-3" />
                  {t('audit.openReceipt')}
                </span>
              </a>
              {receipt.qrValid && <Tag tone="pass">ZATCA ✓</Tag>}
              {receipt.verified ? (
                <Tag tone="pass">{t('audit.verified')}</Tag>
              ) : (
                editable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={action.isPending}
                    onClick={() =>
                      action
                        .mutateAsync({ kind: 'verify', receiptId: receipt.receiptId })
                        .then(() => toast.success(t('audit.done.verify')))
                        .catch((err: Error) => toast.error(err.message))
                    }
                  >
                    {t('audit.verify')}
                  </Button>
                )
              )}
            </>
          ) : (
            <p className="py-8 text-center text-xs text-muted">{t('audit.noReceipt')}</p>
          )}
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{line.merchant ?? line.typeName}</p>
              <p className="text-xs text-muted">
                {line.typeName} · {formatDate(line.expenseDate)} ·{' '}
                <span className="font-mono">{line.chargeAccount}</span>
              </p>
            </div>
            <div className="text-end">
              <p
                className={cn(
                  'whitespace-nowrap font-semibold tabular',
                  adjusted && 'text-sm font-normal text-muted line-through',
                )}
              >
                {formatSar(line.amountSar)}
              </p>
              {adjusted && (
                <p className="whitespace-nowrap font-semibold text-warn tabular">
                  {formatSar(line.approvedAmountSar)}
                </p>
              )}
              {line.currency !== 'SAR' && (
                <p className="text-xs text-muted tabular">
                  {line.currency} {line.amount}
                </p>
              )}
            </div>
          </div>
          {(line.description || line.justification || line.attendees) && (
            <dl className="space-y-0.5 text-sm">
              {line.description && (
                <Detail label={t('expenses.form.purpose')} value={line.description} />
              )}
              {line.justification && (
                <Detail label={t('expenses.form.justification')} value={line.justification} />
              )}
              {line.attendees && (
                <Detail label={t('expenses.form.attendees')} value={line.attendees} />
              )}
            </dl>
          )}
          {line.violations.length > 0 && (
            <ul className="space-y-1">
              {line.violations.map((v) => (
                <li key={`${v.ruleCode}-${v.message}`} className="flex gap-2 text-xs">
                  <Tag
                    tone={v.level === 'BLOCK' ? 'block' : 'warn'}
                    className="shrink-0 self-start"
                  >
                    {isRule(v.ruleCode) ? t(`expenses.rules.${v.ruleCode}`) : v.ruleCode}
                  </Tag>
                  <span className="text-muted">{v.message}</span>
                </li>
              ))}
            </ul>
          )}

          {editable ? (
            <form
              className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[150px_minmax(0,1fr)]"
              onSubmit={(e) => {
                e.preventDefault();
                void save(amount.trim());
              }}
            >
              <Field label={t('audit.approvedAmount')} error={error.amount}>
                <Input
                  inputMode="decimal"
                  className="tabular"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label={t('reports.reason')} error={error.reason}>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('audit.reasonPlaceholder')}
                  maxLength={500}
                />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="submit" variant="secondary" loading={action.isPending}>
                  {t('audit.adjust')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-block"
                  onClick={() => void save('0')}
                >
                  {t('audit.disallow')}
                </Button>
              </div>
            </form>
          ) : (
            line.adjustmentReason && (
              <p className="rounded-input bg-warn/5 px-3 py-2 text-sm">
                {t('audit.adjustedBecause', { reason: line.adjustmentReason })}
              </p>
            )
          )}
        </div>
      </div>
    </Card>
  );
}

const isRule = (code: string): code is PolicyRule =>
  (POLICY_RULES as readonly string[]).includes(code);

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}
