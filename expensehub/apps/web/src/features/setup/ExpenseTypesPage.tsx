// FR-POL-01 expense types (OQ-32: placeholders until Finance confirms).
import type { ExpenseTypeDto } from '@expensehub/shared';
import { Info, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { EXPENSE_ICONS } from '../../lib/expense-icons';
import { formatSar } from '../../lib/format';
import { ExpenseTypeDrawer } from './ExpenseTypeDrawer';
import { useExpenseTypes } from './hooks';

export function ExpenseTypesPage() {
  const { t } = useTranslation();
  const types = useExpenseTypes();
  const [editing, setEditing] = useState<ExpenseTypeDto | null>(null);
  const [open, setOpen] = useState(false);

  const openDrawer = (type: ExpenseTypeDto | null) => {
    setEditing(type);
    setOpen(true);
  };

  const receipt = (type: ExpenseTypeDto) =>
    type.receiptOverSar === null
      ? t('expenseTypes.receiptNever')
      : Number(type.receiptOverSar) === 0
        ? t('expenseTypes.receiptAlways')
        : t('expenseTypes.receiptAboveLabel', { amount: formatSar(type.receiptOverSar) });

  const anyPlaceholder = types.data?.items.some((type) => type.isPlaceholder);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {anyPlaceholder ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Info aria-hidden className="size-4 text-info" />
            {t('setup.placeholderHint')}
          </p>
        ) : (
          <span />
        )}
        <Button onClick={() => openDrawer(null)}>
          <Plus aria-hidden />
          {t('expenseTypes.new')}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 text-start">
                  {t('expenseTypes.type')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.category')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.account')}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-end">
                  {t('expenseTypes.limit')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.receipt')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.rules')}
                </th>
                <th scope="col" className="px-5 py-3 text-end">
                  {t('expenseTypes.status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.isPending &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))}
              {types.data?.items.map((type) => {
                const Icon = EXPENSE_ICONS[type.icon];
                return (
                  <tr
                    key={type.typeId}
                    className={cn(
                      'transition-colors hover:bg-surface-2/40',
                      !type.active && 'opacity-60',
                    )}
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        className="group flex items-center gap-3 rounded-input text-start"
                        onClick={() => openDrawer(type)}
                        aria-label={`${t('setup.edit')} ${type.name}`}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-input bg-brand/10 text-brand-solid dark:text-brand">
                          <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        <span>
                          <span className="block font-medium group-hover:underline">
                            {type.name}
                          </span>
                          <span className="block font-mono text-xs text-muted">
                            {type.typeCode}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      {t(`expenseTypes.categories.${type.category}`)}
                      {type.unitRateSar && (
                        <span className="block text-xs text-muted tabular">
                          SAR {Number(type.unitRateSar).toFixed(2)}/km
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{type.naturalAccount}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-end tabular">
                      {type.defaultLimitSar ? (
                        <>
                          {formatSar(type.defaultLimitSar)}
                          <span
                            className={cn(
                              'block text-xs',
                              type.limitAction === 'BLOCK' ? 'text-block' : 'text-warn',
                            )}
                          >
                            {t(`expenseTypes.actions.${type.limitAction}`)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">{t('expenseTypes.noLimit')}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{receipt(type)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {type.justificationReq && (
                          <Tag>{t('expenseTypes.flags.justification')}</Tag>
                        )}
                        {type.attendeesReq && <Tag>{t('expenseTypes.flags.attendees')}</Tag>}
                        {type.vatEligible && <Tag tone="info">{t('expenseTypes.flags.vat')}</Tag>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-end">
                      <div className="flex flex-wrap justify-end gap-1">
                        {type.isPlaceholder && <Tag tone="warn">{t('setup.placeholder')}</Tag>}
                        {type.active ? (
                          <Tag tone="pass">{t('setup.active')}</Tag>
                        ) : (
                          <Tag>{t('setup.inactive')}</Tag>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ExpenseTypeDrawer open={open} onOpenChange={setOpen} type={editing} />
    </>
  );
}
