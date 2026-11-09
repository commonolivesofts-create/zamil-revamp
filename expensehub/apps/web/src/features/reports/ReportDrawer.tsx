// UI-UX §5.3 report detail drawer (FR-REP-01, FR-APR-04). Opens over a list; the actions shown
// are exactly the permissions the API returned — the API checks again on every call.
import type { ReportDetail } from '@expensehub/shared';
import { CircleAlert, MessageCircleQuestion, Pencil, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Drawer } from '../../components/ui/Drawer';
import { Input } from '../../components/ui/Input';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusPill } from '../../components/ui/StatusPill';
import { Stepper } from '../../components/ui/Stepper';
import { Tag } from '../../components/ui/Tag';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime, formatRelative, formatSar } from '../../lib/format';
import { Link } from 'react-router';
import { AccountingPreview } from '../audit/AccountingPreview';
import { AddExpensesDialog } from './AddExpensesDialog';
import {
  useClaimantAction,
  useDecision,
  useDeleteReport,
  useReplyInfo,
  useReport,
  useUpdateReport,
  type ClaimantAction,
  type Decision,
} from './hooks';
import { ReportLines } from './ReportLines';
import { ApprovalSteps, HistoryList } from './ReportTimeline';

type Tab = 'items' | 'approvals' | 'accounting' | 'history';
type Problem = { title: string; items: string[] };

/** Turns a refused submit into a list the claimant can act on (FR-POL-06). */
function problemOf(
  err: unknown,
  t: (k: 'reports.cannotSubmit' | 'reports.blockedLines') => string,
): Problem | null {
  if (!(err instanceof ApiError)) return null;
  const details = err.details as
    | {
        checks?: { message: string }[];
        lines?: { merchant: string | null; results: { message: string }[] }[];
      }
    | undefined;
  if (err.code === 'PREREQUISITE_MISSING' && details?.checks) {
    return { title: t('reports.cannotSubmit'), items: details.checks.map((c) => c.message) };
  }
  if (err.code === 'POLICY_BLOCK' && details?.lines) {
    return {
      title: t('reports.blockedLines'),
      items: details.lines.flatMap((l) =>
        l.results.map((r) => `${l.merchant ?? ''} — ${r.message}`),
      ),
    };
  }
  return null;
}

export function ReportDrawer({
  reportId,
  onClose,
}: {
  reportId: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const report = useReport(reportId);
  const data = report.data;

  return (
    <Drawer
      open={reportId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={data ? (data.reportNumber ?? t('reports.draftTitle')) : t('reports.loading')}
      description={data?.purpose}
      footer={data ? <Actions report={data} onClose={onClose} /> : undefined}
    >
      {report.isError ? (
        <p className="py-10 text-center text-sm text-muted">{t('reports.notFound')}</p>
      ) : !data ? (
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <Body report={data} />
      )}
    </Drawer>
  );
}

function Body({ report }: { report: ReportDetail }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('items');
  const [editingPurpose, setEditingPurpose] = useState(false);
  const [purpose, setPurpose] = useState(report.purpose);
  const [adding, setAdding] = useState(false);
  const update = useUpdateReport();
  const p = report.permissions;
  const lineIds = report.lines.map((l) => l.expenseId);

  const save = async (body: { purpose?: string; expenseIds?: number[] }) => {
    try {
      await update.mutateAsync({
        id: report.reportId,
        body: {
          purpose: body.purpose ?? report.purpose,
          expenseIds: body.expenseIds,
          version: report.version,
        },
      });
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    }
  };

  const infoQuestion = report.infoRequested
    ? report.history.find((h) => h.action === 'INFO_REQUESTED')
    : undefined;
  const rejection =
    report.status === 'REJECTED' ? report.history.find((h) => h.action === 'REJECTED') : undefined;
  const holder = report.currentStep
    ? t('reports.holder', {
        name: report.currentStep.assigneeName,
        step: report.currentStep.stepName,
        since: formatRelative(report.currentStep.since),
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Figures first (UI-UX §1). */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {t('reports.netPayable')}
            </p>
            <p className="text-display font-semibold tabular" data-testid="report-net">
              {formatSar(report.netPayableSar)}
            </p>
            <p className="text-xs text-muted tabular">
              {t('reports.totals', { lines: report.lineCount, vat: formatSar(report.vatSar) })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={report.status} />
            {report.infoRequested && <Tag tone="warn">{t('reports.infoRequested')}</Tag>}
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Avatar name={report.claimant.fullName} size="sm" />
          <span>
            <span className="font-medium text-ink">{report.claimant.fullName}</span> ·{' '}
            {report.businessUnit}
            {report.submittedAt && (
              <> · {t('reports.submittedOn', { when: formatDateTime(report.submittedAt) })}</>
            )}
          </span>
        </p>
      </section>

      {report.status !== 'DRAFT' && (
        <section className="rounded-card border border-border p-4">
          <Stepper status={report.status} holder={holder} />
          {report.fusion?.invoiceNumber && (
            <dl
              className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"
              data-testid="fusion-info"
            >
              <div>
                <dt className="text-xs text-muted">{t('reports.fusionInvoice')}</dt>
                <dd className="font-mono">
                  {report.fusion.invoiceNumber}
                  {report.fusion.status && (
                    <span className="ms-1.5 font-sans text-xs text-muted">
                      · {report.fusion.status}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('reports.payment')}</dt>
                <dd>
                  {report.fusion.paymentRef ? (
                    <>
                      <span className="font-mono">{report.fusion.paymentRef}</span>
                      {report.fusion.paidAt && (
                        <span className="ms-1.5 text-xs text-muted">
                          · {formatDateTime(report.fusion.paidAt)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">{t('reports.notPaidYet')}</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {editingPurpose ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await save({ purpose })) setEditingPurpose(false);
          }}
        >
          <Input
            aria-label={t('reports.purpose')}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={500}
          />
          <Button type="submit" loading={update.isPending}>
            {t('setup.save')}
          </Button>
        </form>
      ) : (
        p.canEditPurpose && (
          <Button
            variant="ghost"
            size="sm"
            className="-mt-3"
            onClick={() => {
              setPurpose(report.purpose);
              setEditingPurpose(true);
            }}
          >
            <Pencil aria-hidden />
            {t('reports.editPurpose')}
          </Button>
        )
      )}

      {infoQuestion && (
        <Banner
          tone="warn"
          icon={MessageCircleQuestion}
          title={t('reports.infoFrom', { name: infoQuestion.actorName ?? '' })}
        >
          “{infoQuestion.comment}”
          {p.canReplyInfo && <span className="mt-1 block text-xs">{t('reports.infoHint')}</span>}
        </Banner>
      )}
      {rejection && (
        <Banner
          tone="block"
          icon={CircleAlert}
          title={t('reports.rejectedBy', {
            name: rejection.actorName ?? '',
            step: rejection.stepName ?? '',
          })}
        >
          “{rejection.comment}”
        </Banner>
      )}

      <section>
        <div
          role="tablist"
          aria-label={t('reports.tabsLabel')}
          className="mb-4 flex gap-1 border-b border-border"
        >
          {(['items', 'approvals', 'accounting', 'history'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t(`reports.tabs.${id}`)}
              {id === 'items' && (
                <span className="ms-1.5 text-xs text-muted">{report.lineCount}</span>
              )}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'items' && (
            <div className="space-y-3">
              <ReportLines
                lines={report.lines}
                canEditLines={{ open: p.canEdit || p.canReplyInfo, remove: p.canEdit }}
                removing={update.isPending}
                onRemove={(id) => void save({ expenseIds: lineIds.filter((x) => x !== id) })}
              />
              {p.canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                  <Plus aria-hidden />
                  {t('reports.addExpenses')}
                </Button>
              )}
            </div>
          )}
          {tab === 'approvals' && <ApprovalSteps steps={report.steps} />}
          {tab === 'accounting' && <AccountingPreview reportId={report.reportId} />}
          {tab === 'history' && <HistoryList history={report.history} />}
        </div>
      </section>

      <AddExpensesDialog
        open={adding}
        onOpenChange={setAdding}
        pending={update.isPending}
        onAdd={async (ids) => {
          if (await save({ expenseIds: [...lineIds, ...ids] })) setAdding(false);
        }}
      />
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: 'warn' | 'block';
  icon: typeof CircleAlert;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-card border px-4 py-3 text-sm',
        tone === 'warn' ? 'border-warn/30 bg-warn/5' : 'border-block/30 bg-block/5',
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', tone === 'warn' ? 'text-warn' : 'text-block')}
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted">{children}</p>
      </div>
    </div>
  );
}

function Actions({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const p = report.permissions;
  const claimant = useClaimantAction();
  const decision = useDecision();
  const reply = useReplyInfo();
  const remove = useDeleteReport();
  const [confirm, setConfirm] = useState<'withdraw' | 'delete' | null>(null);
  const [reason, setReason] = useState<'reject' | 'request-info' | 'reply' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  const run = async (action: ClaimantAction) => {
    setProblem(null);
    try {
      await claimant.mutateAsync({ id: report.reportId, action, version: report.version });
      toast.success(t(`reports.done.${action}`));
      setConfirm(null);
    } catch (err) {
      const found = problemOf(err, t);
      if (found) setProblem(found);
      else toast.error((err as Error).message);
    }
  };

  const decide = async (d: Decision, comment?: string) => {
    try {
      await decision.mutateAsync({ stepId: p.actionableStepId!, decision: d, comment });
      toast.success(t(`reports.decided.${d}`));
      setReason(null);
      if (d !== 'request-info') onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const anything =
    p.canSubmit ||
    p.canWithdraw ||
    p.canCorrect ||
    p.canDelete ||
    p.canReplyInfo ||
    p.actionableStepId !== null ||
    p.canAudit;
  if (!anything) return null;

  return (
    <div className="flex w-full flex-col gap-3">
      {problem && (
        <div
          role="alert"
          className="rounded-input border border-block/30 bg-block/5 px-3 py-2 text-sm"
        >
          <p className="font-medium text-block">{problem.title}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted">
            {problem.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {p.canDelete && (
          <Button
            variant="ghost"
            className="me-auto text-block"
            onClick={() => setConfirm('delete')}
          >
            {t('reports.actions.delete')}
          </Button>
        )}
        {p.canWithdraw && (
          <Button variant="secondary" onClick={() => setConfirm('withdraw')}>
            {t('reports.actions.withdraw')}
          </Button>
        )}
        {p.canReplyInfo && (
          <Button onClick={() => setReason('reply')}>{t('reports.actions.reply')}</Button>
        )}
        {p.canCorrect && (
          <Button loading={claimant.isPending} onClick={() => void run('correct')}>
            {t('reports.actions.correct')}
          </Button>
        )}
        {p.canSubmit && (
          <Button loading={claimant.isPending} onClick={() => void run('submit')}>
            {t('reports.actions.submit')}
          </Button>
        )}
        {p.canAudit && (
          <Button asChild>
            <Link to={`/audit/${report.reportId}`}>{t('audit.open')}</Link>
          </Button>
        )}
        {p.actionableStepId !== null && (
          <>
            <Button variant="ghost" className="me-auto" onClick={() => setReason('request-info')}>
              {t('reports.actions.requestInfo')}
            </Button>
            <Button variant="secondary" className="text-block" onClick={() => setReason('reject')}>
              {t('reports.actions.reject')}
            </Button>
            <Button loading={decision.isPending && !reason} onClick={() => void decide('approve')}>
              {t('reports.actions.approve')}
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'withdraw'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('reports.withdrawTitle')}
        body={t('reports.withdrawBody')}
        confirmLabel={t('reports.actions.withdraw')}
        tone="primary"
        pending={claimant.isPending}
        onConfirm={() => void run('withdraw')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('reports.deleteTitle')}
        body={t('reports.deleteBody')}
        confirmLabel={t('reports.actions.delete')}
        pending={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(report.reportId);
            toast.success(t('reports.done.delete'));
            onClose();
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
      <ReasonDialog
        open={reason === 'reject'}
        onOpenChange={(o) => !o && setReason(null)}
        title={t('reports.rejectTitle', { number: report.reportNumber ?? '' })}
        body={t('reports.rejectBody')}
        label={t('reports.reason')}
        confirmLabel={t('reports.actions.reject')}
        tone="danger"
        pending={decision.isPending}
        onConfirm={(text) => void decide('reject', text)}
      />
      <ReasonDialog
        open={reason === 'request-info'}
        onOpenChange={(o) => !o && setReason(null)}
        title={t('reports.requestInfoTitle')}
        body={t('reports.requestInfoBody')}
        label={t('reports.question')}
        confirmLabel={t('reports.actions.requestInfo')}
        pending={decision.isPending}
        onConfirm={(text) => void decide('request-info', text)}
      />
      <ReasonDialog
        open={reason === 'reply'}
        onOpenChange={(o) => !o && setReason(null)}
        title={t('reports.replyTitle')}
        label={t('reports.answer')}
        confirmLabel={t('reports.actions.reply')}
        pending={reply.isPending}
        onConfirm={async (text) => {
          try {
            await reply.mutateAsync({ id: report.reportId, comment: text });
            toast.success(t('reports.done.reply'));
            setReason(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
