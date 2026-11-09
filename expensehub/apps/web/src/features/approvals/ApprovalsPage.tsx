// UI-UX §5.4 approval inbox (FR-DSH-02, FR-APR-04): claimant + BU, report, purpose, amount, age,
// flags; inline Approve / Reject (reason); row → drawer; bulk approve only for rows without flags.
import type { InboxItem } from '@expensehub/shared';
import { CheckCheck, Inbox } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatRelative, formatSar } from '../../lib/format';
import { useDecision, useInbox } from '../reports/hooks';
import { ReportDrawer } from '../reports/ReportDrawer';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openId = params.get('report');
  const inbox = useInbox();
  const decision = useDecision();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<InboxItem | null>(null);
  const [busy, setBusy] = useState(false);

  const items = inbox.data ?? [];
  const clean = items.filter((i) => i.flags.length === 0 && i.kind === 'APPROVAL');
  const chosen = clean.filter((i) => selected.has(i.stepId));

  const approve = async (rows: InboxItem[]) => {
    setBusy(true);
    let ok = 0;
    for (const row of rows) {
      try {
        await decision.mutateAsync({ stepId: row.stepId, decision: 'approve' });
        ok++;
      } catch (err) {
        toast.error(`${row.reportNumber}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (ok) toast.success(t('approvals.approved', { count: ok }));
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('approvals.eyebrow')}
        title={t('approvals.title')}
        description={t('approvals.description')}
        actions={
          chosen.length > 0 && (
            <Button loading={busy} onClick={() => void approve(chosen)}>
              <CheckCheck aria-hidden />
              {t('approvals.bulk', { count: chosen.length })}
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        {inbox.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title={t('approvals.empty')} body={t('approvals.emptyBody')} />
        ) : (
          <ul className="divide-y divide-border" aria-label={t('approvals.title')}>
            {items.map((row) => {
              const flagged = row.flags.length > 0 || row.kind === 'AUDIT';
              return (
                <li
                  key={row.stepId}
                  className={cn(
                    'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5',
                    selected.has(row.stepId) && 'bg-brand/5',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-3 size-4 shrink-0 accent-[var(--color-brand-solid)] disabled:opacity-30"
                      disabled={flagged}
                      title={flagged ? t('approvals.flaggedNoBulk') : undefined}
                      checked={selected.has(row.stepId)}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(row.stepId)) next.delete(row.stepId);
                          else next.add(row.stepId);
                          return next;
                        })
                      }
                      aria-label={t('approvals.select', { number: row.reportNumber })}
                    />
                    <Avatar name={row.claimantName} className="mt-1 hidden sm:grid" />
                    <button
                      type="button"
                      onClick={() => void navigate(`/approvals?report=${row.reportId}`)}
                      className="min-w-0 flex-1 rounded-input text-start outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium hover:underline">{row.claimantName}</span>
                        <span className="text-xs text-muted">
                          {row.businessUnit} · <span className="font-mono">{row.reportNumber}</span>{' '}
                          · {t('approvals.asStep', { step: row.stepName })}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-muted">{row.purpose}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {row.kind === 'AUDIT' && <Tag tone="info">{t('audit.tag')}</Tag>}
                        {row.flags.map((f) => (
                          <Tag key={f} tone={f === 'INFO_REQUESTED' ? 'info' : 'warn'}>
                            {t(`approvals.flags.${f}`)}
                          </Tag>
                        ))}
                      </span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 ps-7 sm:ps-0">
                    <div className="text-end">
                      <p className="text-lg font-semibold tabular">{formatSar(row.totalSar)}</p>
                      <p className="text-xs text-muted">
                        {t('approvals.waiting', { when: formatRelative(row.pendingSince) })}
                      </p>
                    </div>
                    {row.kind === 'AUDIT' ? (
                      <Button asChild size="sm">
                        <Link to={`/audit/${row.reportId}`}>{t('audit.open')}</Link>
                      </Button>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-block"
                          onClick={() => setRejecting(row)}
                          aria-label={t('approvals.rejectRow', { number: row.reportNumber })}
                        >
                          {t('reports.actions.reject')}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void approve([row])}
                          aria-label={t('approvals.approveRow', { number: row.reportNumber })}
                        >
                          {t('reports.actions.approve')}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={t('reports.rejectTitle', { number: rejecting?.reportNumber ?? '' })}
        body={t('reports.rejectBody')}
        label={t('reports.reason')}
        confirmLabel={t('reports.actions.reject')}
        tone="danger"
        pending={decision.isPending}
        onConfirm={async (comment) => {
          try {
            await decision.mutateAsync({ stepId: rejecting!.stepId, decision: 'reject', comment });
            toast.success(t('reports.decided.reject'));
            setRejecting(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />

      <ReportDrawer
        reportId={openId ? Number(openId) : null}
        onClose={() => void navigate('/approvals')}
      />
    </div>
  );
}
