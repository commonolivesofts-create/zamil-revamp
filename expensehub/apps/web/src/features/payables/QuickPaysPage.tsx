// UI-UX §5.6 Quick Pay queue (FR-QP-02/03/04): employee, element, effective date, amount,
// status. Create invoice (bulk) through INT-08; Exclude with a reason.
import {
  formatSar as formatHalalas,
  parseSar,
  sumSar,
  type QuickPayQueueItem,
  type QuickPayQueueStatus,
} from '@expensehub/shared';
import { FileOutput, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag, type Tone } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDate, formatSar } from '../../lib/format';
import { useExcludeQuickPay, useInvoiceQuickPays, useQuickPayQueue } from './hooks';

const TONE: Record<QuickPayQueueStatus, Tone> = {
  NEW: 'neutral',
  INVOICE_REQUESTED: 'info',
  INVOICED: 'info',
  PAID: 'pass',
  ERROR: 'block',
  EXCLUDED: 'neutral',
};
const FILTERS = ['ALL', 'NEW', 'INVOICED', 'PAID', 'ERROR', 'EXCLUDED'] as const;
type Filter = (typeof FILTERS)[number];
/** Rows that "Create invoice" can act on. */
const ACTIONABLE: QuickPayQueueStatus[] = ['NEW', 'INVOICE_REQUESTED', 'ERROR'];

const total = (items: QuickPayQueueItem[]) =>
  formatHalalas(sumSar(items.map((i) => parseSar(i.amountSar))));

export function QuickPaysPage() {
  const { t } = useTranslation();
  const queue = useQuickPayQueue();
  const invoice = useInvoiceQuickPays();
  const exclude = useExcludeQuickPay();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [excluding, setExcluding] = useState<QuickPayQueueItem | null>(null);

  const all = useMemo(() => queue.data?.items ?? [], [queue.data]);
  const matches = (i: QuickPayQueueItem, f: Filter) =>
    f === 'ALL' || i.status === f || (f === 'INVOICED' && i.status === 'INVOICE_REQUESTED');
  const rows = all.filter((i) => matches(i, filter));
  const chosen = all.filter(
    (i) => selected.has(i.quickPayId) && ACTIONABLE.includes(i.status) && i.payeeReady,
  );

  const create = async () => {
    const result = await invoice
      .mutateAsync(chosen.map((i) => i.quickPayId))
      .catch((err: Error) => {
        toast.error(err.message);
        return null;
      });
    setConfirming(false);
    if (!result) return;
    const ok = result.items.filter((r) => r.ok).length;
    if (ok) toast.success(t('quickPaysPage.invoiced', { count: ok }));
    if (result.items.length > ok)
      toast.error(t('quickPaysPage.failed', { count: result.items.length - ok }));
    setSelected(new Set());
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('payables.eyebrow')}
        title={t('nav.quickPays')}
        description={t('quickPaysPage.description')}
        actions={
          chosen.length > 0 && (
            <Button onClick={() => setConfirming(true)}>
              <FileOutput aria-hidden />
              {t('quickPaysPage.create', { count: chosen.length })}
            </Button>
          )
        }
      />

      <div
        role="radiogroup"
        aria-label={t('quickPaysPage.filterLabel')}
        className="mb-4 flex flex-wrap gap-1.5"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-sm font-medium transition-colors',
              filter === f
                ? 'border-brand bg-brand/10 text-ink'
                : 'border-border bg-surface text-muted hover:text-ink',
            )}
          >
            {t(`quickPaysPage.filters.${f}`)}
            <span className="text-xs tabular">{all.filter((i) => matches(i, f)).length}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {queue.isPending ? (
          <Skeleton className="m-5 h-24" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={t('quickPaysPage.empty')}
            body={t('quickPaysPage.emptyBody')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-xs font-medium uppercase tracking-wide text-muted">
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">{t('quickPaysPage.selectColumn')}</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-start">
                    {t('quickPaysPage.employee')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-start">
                    {t('quickPaysPage.element')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-start">
                    {t('quickPaysPage.date')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-end">
                    {t('quickPaysPage.amount')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-start">
                    {t('quickPaysPage.status')}
                  </th>
                  <th scope="col" className="px-4 py-3 text-end">
                    <span className="sr-only">{t('quickPaysPage.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const actionable = ACTIONABLE.includes(row.status);
                  return (
                    <tr
                      key={row.quickPayId}
                      className={cn(selected.has(row.quickPayId) && 'bg-brand/5')}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-brand-solid)] disabled:opacity-30"
                          disabled={!actionable || !row.payeeReady}
                          checked={selected.has(row.quickPayId)}
                          onChange={() =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (next.has(row.quickPayId)) next.delete(row.quickPayId);
                              else next.add(row.quickPayId);
                              return next;
                            })
                          }
                          aria-label={t('quickPaysPage.select', {
                            name: row.employeeName,
                            element: row.elementName,
                          })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-medium">{row.employeeName}</span>
                        <span className="text-xs text-muted">
                          {row.personNumber} · {row.businessUnit}
                        </span>
                      </td>
                      <td className="px-3 py-3">{row.elementName}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {formatDate(row.effectiveDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-end font-semibold tabular">
                        {formatSar(row.amountSar)}
                      </td>
                      <td className="px-3 py-3">
                        <Tag tone={TONE[row.status]}>
                          {t(`quickPaysPage.statuses.${row.status}`)}
                        </Tag>
                        {row.invoiceNumber && (
                          <span className="mt-1 block font-mono text-xs text-muted">
                            {row.invoiceNumber}
                          </span>
                        )}
                        {row.paymentRef && (
                          <span className="block text-xs text-muted">{row.paymentRef}</span>
                        )}
                        {!row.payeeReady && actionable && (
                          <span className="mt-1 block text-xs text-warn">
                            {t('payables.noPayee')}
                          </span>
                        )}
                        {(row.syncError || row.excludedReason) && (
                          <span className="mt-1 block max-w-64 text-xs text-muted">
                            {row.syncError ?? row.excludedReason}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {actionable && (
                          <Button size="sm" variant="ghost" onClick={() => setExcluding(row)}>
                            {t('quickPaysPage.exclude')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('quickPaysPage.confirmTitle', { count: chosen.length })}
        body={t('quickPaysPage.confirmBody', { amount: formatSar(total(chosen)) })}
        confirmLabel={t('quickPaysPage.create', { count: chosen.length })}
        tone="primary"
        pending={invoice.isPending}
        onConfirm={() => void create()}
      />
      <ReasonDialog
        open={excluding !== null}
        onOpenChange={(o) => !o && setExcluding(null)}
        title={t('quickPaysPage.excludeTitle', { name: excluding?.employeeName ?? '' })}
        body={t('quickPaysPage.excludeBody')}
        label={t('reports.reason')}
        confirmLabel={t('quickPaysPage.exclude')}
        pending={exclude.isPending}
        onConfirm={async (reason) => {
          try {
            await exclude.mutateAsync({ id: excluding!.quickPayId, reason });
            toast.success(t('quickPaysPage.excluded'));
            setExcluding(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
    </div>
  );
}
