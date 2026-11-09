// Draft report: pick more unreported expenses to add (FR-REP-01).
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDate, formatSar } from '../../lib/format';
import { useUnreportedExpenses } from '../expenses/hooks';

export function AddExpensesDialog({
  open,
  onOpenChange,
  onAdd,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (expenseIds: number[]) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const expenses = useUnreportedExpenses();
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (open) setChosen(new Set());
  }, [open]);

  const items = expenses.data ?? [];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
        <Dialog.Content className="fixed inset-x-4 top-[12vh] z-[60] mx-auto flex max-h-[76vh] max-w-lg flex-col rounded-card border border-border bg-surface text-ink shadow-raised motion-safe:animate-pop">
          <div className="border-b border-border px-6 py-4">
            <Dialog.Title className="text-lg font-semibold">{t('reports.addTitle')}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              {t('reports.addBody')}
            </Dialog.Description>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {expenses.isPending ? (
              <Skeleton className="m-4 h-24" />
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">{t('reports.addEmpty')}</p>
            ) : (
              <ul>
                {items.map((e) => (
                  <li key={e.expenseId}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-input px-4 py-2.5 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-brand-solid)]"
                        checked={chosen.has(e.expenseId)}
                        onChange={() =>
                          setChosen((s) => {
                            const next = new Set(s);
                            if (next.has(e.expenseId)) next.delete(e.expenseId);
                            else next.add(e.expenseId);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {e.merchant ?? e.typeName}
                        </span>
                        <span className="block text-xs text-muted">
                          {e.typeName} · {formatDate(e.expenseDate)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular">
                        {formatSar(e.amountSar)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-3">
            <Dialog.Close asChild>
              <Button variant="ghost">{t('setup.cancel')}</Button>
            </Dialog.Close>
            <Button
              disabled={chosen.size === 0}
              loading={pending}
              onClick={() => onAdd([...chosen])}
            >
              {t('reports.addConfirm', { count: chosen.size })}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
