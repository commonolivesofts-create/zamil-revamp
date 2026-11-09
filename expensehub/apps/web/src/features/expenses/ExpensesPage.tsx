// UI-UX §4 /expenses — unreported expenses, multi-select (FR-CAP-09). "Create report" is M5.
import { formatSar as formatHalalas, parseSar, sumSar, type ExpenseDto } from '@expensehub/shared';
import { FilePlus2, Paperclip, Plus, Receipt, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { EXPENSE_ICONS } from '../../lib/expense-icons';
import { formatDate, formatSar } from '../../lib/format';
import { useCreateReport } from '../reports/hooks';
import { useDeleteExpenses, useUnreportedExpenses } from './hooks';

const LEVEL_TONE = { PASS: 'pass', WARN: 'warn', BLOCK: 'block' } as const;

/** Sum of 2-decimal SAR strings, in integer halalas (never floats). */
function total(items: ExpenseDto[]): string {
  return formatHalalas(sumSar(items.map((e) => parseSar(e.amountSar))));
}

export function ExpensesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const expenses = useUnreportedExpenses();
  const remove = useDeleteExpenses();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creating, setCreating] = useState(false);
  const createReport = useCreateReport();

  const items = expenses.data ?? [];
  const chosen = items.filter((e) => selected.has(e.expenseId));
  const allSelected = items.length > 0 && chosen.length === items.length;

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onDelete = async () => {
    const ids = chosen.map((e) => e.expenseId);
    try {
      await remove.mutateAsync(ids);
      toast.success(t('expenses.list.deleted', { count: ids.length }));
      setSelected(new Set());
      setConfirmDelete(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t('expenses.list.eyebrow')}
        title={t('expenses.list.title')}
        description={t('expenses.list.description')}
        actions={
          <Button asChild>
            <Link to="/expenses/new">
              <Plus aria-hidden />
              {t('nav.newExpense')}
            </Link>
          </Button>
        }
      />

      {items.length > 0 && (
        <div className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-card bg-surface-2/60 px-4 py-2">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-brand-solid)]"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = chosen.length > 0 && !allSelected;
              }}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(items.map((e) => e.expenseId)))
              }
            />
            {chosen.length > 0 ? (
              <span aria-live="polite">
                {t('expenses.list.selected', { count: chosen.length })} ·{' '}
                <span className="font-semibold tabular">{formatSar(total(chosen))}</span>
              </span>
            ) : (
              <span className="text-muted">
                {t('expenses.list.count', { count: items.length })} ·{' '}
                <span className="tabular">{formatSar(total(items))}</span>
              </span>
            )}
          </label>
          {chosen.length > 0 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-block"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden />
                {t('expenses.list.delete')}
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <FilePlus2 aria-hidden />
                {t('expenses.list.createReport')}
              </Button>
            </div>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        {expenses.isPending ? (
          <ul className="divide-y divide-border">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="px-5 py-4">
                <Skeleton className="h-10 w-full" />
              </li>
            ))}
          </ul>
        ) : expenses.isError ? (
          <EmptyState
            icon={Receipt}
            title={t('expenses.list.error')}
            body={expenses.error.message}
            action={
              <Button variant="secondary" onClick={() => void expenses.refetch()}>
                {t('expenses.list.retry')}
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t('expenses.list.empty')}
            body={t('expenses.list.emptyBody')}
            action={
              <Button asChild>
                <Link to="/expenses/new">
                  <Plus aria-hidden />
                  {t('nav.newExpense')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border" aria-label={t('expenses.list.title')}>
            {items.map((e) => {
              const Icon = EXPENSE_ICONS[e.typeIcon as keyof typeof EXPENSE_ICONS] ?? Receipt; // icon names are the shared enum
              const isSelected = selected.has(e.expenseId);
              return (
                <li
                  key={e.expenseId}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-5',
                    isSelected ? 'bg-brand/5' : 'hover:bg-surface-2/40',
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--color-brand-solid)]"
                    checked={isSelected}
                    onChange={() => toggle(e.expenseId)}
                    aria-label={t('expenses.list.select', {
                      name: e.merchant ?? e.typeName,
                      date: formatDate(e.expenseDate),
                    })}
                  />
                  <span className="hidden size-10 shrink-0 place-items-center rounded-input bg-brand/10 text-brand-solid sm:grid dark:text-brand">
                    <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <button
                    type="button"
                    onClick={() => void navigate(`/expenses/${e.expenseId}`)}
                    className="min-w-0 flex-1 rounded-input text-start outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="block truncate font-medium group-hover:underline">
                      {e.merchant ?? e.typeName}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {e.typeName} · {formatDate(e.expenseDate)}
                      {e.description ? ` · ${e.description}` : ''}
                    </span>
                  </button>
                  <div className="hidden shrink-0 items-center gap-1.5 md:flex">
                    {e.receiptAttached ? (
                      <Paperclip
                        aria-label={t('expenses.list.hasReceipt')}
                        className="size-4 text-muted"
                      />
                    ) : (
                      e.receiptRequired && <Tag tone="warn">{t('expenses.list.noReceipt')}</Tag>
                    )}
                    {e.policyLevel !== 'PASS' && (
                      <Tag tone={LEVEL_TONE[e.policyLevel]}>
                        {t(`expenses.policy.overall.${e.policyLevel}`)}
                      </Tag>
                    )}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-semibold tabular">{formatSar(e.amountSar)}</p>
                    {e.currency !== 'SAR' && (
                      <p className="text-xs text-muted tabular">
                        {e.currency} {e.amount}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ReasonDialog
        open={creating}
        onOpenChange={setCreating}
        title={t('expenses.list.createTitle', { count: chosen.length })}
        body={t('expenses.list.createBody', { amount: formatSar(total(chosen)) })}
        label={t('reports.purpose')}
        confirmLabel={t('expenses.list.createReport')}
        pending={createReport.isPending}
        onConfirm={async (purpose) => {
          try {
            const report = await createReport.mutateAsync({
              purpose,
              expenseIds: chosen.map((e) => e.expenseId),
            });
            toast.success(t('expenses.list.created'));
            setSelected(new Set());
            setCreating(false);
            void navigate(`/reports/${report.reportId}`);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('expenses.list.deleteTitle', { count: chosen.length })}
        body={t('expenses.list.deleteBody', { amount: formatSar(total(chosen)) })}
        confirmLabel={t('expenses.list.delete')}
        onConfirm={() => void onDelete()}
        pending={remove.isPending}
      />
    </div>
  );
}
