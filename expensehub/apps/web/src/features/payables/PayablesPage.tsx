// UI-UX §5.5 Finance — Payables (FR-PAY-01/03): Ready · Invoiced · Paid · Errors. Multi-select →
// Send to Payables (confirm with count and total); rows show the Fusion invoice and payment;
// error rows show Fusion's message and Retry. Payment itself happens in Fusion (D-05).
import {
  formatSar as formatHalalas,
  parseSar,
  sumSar,
  type PayablesItem,
  type PayablesQueue,
} from '@expensehub/shared';
import { ExternalLink, Landmark, RefreshCw, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime, formatSar } from '../../lib/format';
import { ReportDrawer } from '../reports/ReportDrawer';
import { usePayables, useRefreshStatus, useRetryInvoice, useSendInvoices } from './hooks';

const TABS: PayablesQueue[] = ['READY', 'INVOICED', 'PAID', 'ERROR'];
const total = (items: PayablesItem[]) =>
  formatHalalas(sumSar(items.map((i) => parseSar(i.netPayableSar))));

export function PayablesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as PayablesQueue | null) ?? 'READY';
  const openId = params.get('report');
  const payables = usePayables();
  const send = useSendInvoices();
  const retry = useRetryInvoice();
  const refresh = useRefreshStatus();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const all = useMemo(() => payables.data?.items ?? [], [payables.data]);
  const rows = all.filter((i) => i.queue === tab);
  const chosen = rows.filter((i) => selected.has(i.reportId) && i.payeeReady);
  const podUrl = payables.data?.fusionPodUrl ?? '';
  const setTab = (next: PayablesQueue) => {
    setSelected(new Set());
    setParams({ tab: next });
  };

  const doSend = async () => {
    const result = await send.mutateAsync(chosen.map((i) => i.reportId)).catch((err: Error) => {
      toast.error(err.message);
      return null;
    });
    setConfirming(false);
    if (!result) return;
    const ok = result.items.filter((r) => r.ok).length;
    const failed = result.items.length - ok;
    if (ok) toast.success(t('payables.sent', { count: ok }));
    if (failed) toast.error(t('payables.sendFailed', { count: failed }));
    setSelected(new Set());
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('payables.eyebrow')}
        title={t('nav.payables')}
        description={t('payables.description')}
        actions={
          <Button
            variant="secondary"
            loading={refresh.isPending}
            onClick={() =>
              refresh
                .mutateAsync()
                .then((run) =>
                  run.status === 'OK'
                    ? toast.success(t('payables.refreshed', { count: run.rowsChanged ?? 0 }))
                    : toast.error(run.errorText ?? t('payables.refreshFailed')),
                )
                .catch((err: Error) => toast.error(err.message))
            }
          >
            <RefreshCw aria-hidden />
            {t('payables.refresh')}
          </Button>
        }
      />

      <div
        role="tablist"
        aria-label={t('payables.tabsLabel')}
        className="mb-4 flex flex-wrap gap-1.5"
      >
        {TABS.map((id) => {
          const count = all.filter((i) => i.queue === id).length;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-pill border px-4 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-brand bg-brand/10 text-ink'
                  : 'border-border bg-surface text-muted hover:text-ink',
                id === 'ERROR' && count > 0 && tab !== id && 'border-block/40 text-block',
              )}
            >
              {t(`payables.tabs.${id}`)}
              <span className="tabular text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {tab === 'READY' && chosen.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card bg-brand/5 px-4 py-2.5">
          <p className="text-sm">
            {t('payables.selected', { count: chosen.length })} ·{' '}
            <span className="font-semibold tabular">{formatSar(total(chosen))}</span>
          </p>
          <Button onClick={() => setConfirming(true)}>
            <Send aria-hidden />
            {t('payables.send')}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {payables.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Landmark} title={t(`payables.empty.${tab}`)} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.reportId}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {tab === 'READY' && (
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[var(--color-brand-solid)] disabled:opacity-30"
                      disabled={!row.payeeReady}
                      title={row.payeeReady ? undefined : t('payables.noPayee')}
                      checked={selected.has(row.reportId)}
                      onChange={() =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (next.has(row.reportId)) next.delete(row.reportId);
                          else next.add(row.reportId);
                          return next;
                        })
                      }
                      aria-label={t('payables.select', { number: row.reportNumber })}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setParams({ tab, report: String(row.reportId) })}
                    className="min-w-0 flex-1 rounded-input text-start outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium hover:underline">{row.claimantName}</span>
                      <span className="text-xs text-muted">
                        {row.businessUnit} · <span className="font-mono">{row.reportNumber}</span>
                        {row.approvedAt && (
                          <>
                            {' '}
                            ·{' '}
                            {t('payables.approvedOn', {
                              date: formatDate(row.approvedAt.slice(0, 10)),
                            })}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="block truncate text-sm text-muted">{row.purpose}</span>
                    {!row.payeeReady && row.status === 'READY_FOR_PAYMENT' && (
                      <Tag tone="warn" className="mt-1.5">
                        {t('payables.noPayee')}
                      </Tag>
                    )}
                    {row.syncError && (
                      <span
                        role="note"
                        className="mt-1.5 block rounded-input bg-block/5 px-2.5 py-1.5 text-xs text-block"
                      >
                        {row.syncError}
                      </span>
                    )}
                  </button>
                </div>

                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-5 gap-y-2 sm:justify-end sm:ps-0',
                    tab === 'READY' && 'ps-7',
                  )}
                >
                  {row.fusionInvoiceNum && row.status !== 'READY_FOR_PAYMENT' && (
                    <div className="text-xs">
                      <p className="flex items-center gap-1.5">
                        <span className="font-mono">{row.fusionInvoiceNum}</span>
                        {row.fusionStatus && (
                          <Tag tone={row.status === 'PAID' ? 'pass' : 'info'}>
                            {row.fusionStatus}
                          </Tag>
                        )}
                      </p>
                      {row.paymentRef && (
                        <p className="mt-0.5 text-muted">
                          {t('payables.payment', {
                            ref: row.paymentRef,
                            date: row.paidAt ? formatDateTime(row.paidAt) : '',
                          })}
                        </p>
                      )}
                      <a
                        href={`${podUrl}/fscmUI/faces/FuseWelcome`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-brand-solid hover:underline dark:text-brand"
                      >
                        <ExternalLink aria-hidden className="size-3" />
                        {t('payables.openPod')}
                      </a>
                    </div>
                  )}
                  <p className="text-lg font-semibold tabular">{formatSar(row.netPayableSar)}</p>
                  {tab === 'ERROR' && row.status === 'READY_FOR_PAYMENT' && (
                    <Button
                      size="sm"
                      loading={retry.isPending && retry.variables === row.reportId}
                      disabled={!row.payeeReady}
                      onClick={() =>
                        retry
                          .mutateAsync(row.reportId)
                          .then((r) => {
                            const first = r.items[0];
                            if (first?.ok) toast.success(t('payables.sent', { count: 1 }));
                            else
                              toast.error(
                                first && !first.ok
                                  ? first.error
                                  : t('payables.sendFailed', { count: 1 }),
                              );
                          })
                          .catch((err: Error) => toast.error(err.message))
                      }
                    >
                      {t('payables.retry')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('payables.confirmTitle', { count: chosen.length })}
        body={t('payables.confirmBody', { amount: formatSar(total(chosen)) })}
        confirmLabel={t('payables.send')}
        tone="primary"
        pending={send.isPending}
        onConfirm={() => void doSend()}
      />
      <ReportDrawer
        reportId={openId ? Number(openId) : null}
        onClose={() => void navigate(`/finance/payables?tab=${tab}`)}
      />
    </div>
  );
}
