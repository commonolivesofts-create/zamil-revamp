// Report drawer · Items tab (UI-UX §5.3): lines with flags and receipt links; on a draft the
// claimant can open a line to edit it or remove it from the report.
import { POLICY_RULES, type ExpenseDto, type PolicyRule } from '@expensehub/shared';
import { Paperclip, Pencil, Receipt, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Tag } from '../../components/ui/Tag';
import { EXPENSE_ICONS } from '../../lib/expense-icons';
import { formatDate, formatSar } from '../../lib/format';

const isRule = (code: string): code is PolicyRule =>
  (POLICY_RULES as readonly string[]).includes(code);

export function ReportLines({
  lines,
  canEditLines,
  onRemove,
  removing,
}: {
  lines: ExpenseDto[];
  /** Own report: DRAFT = edit/remove; info requested = edit (limited) only. */
  canEditLines: { open: boolean; remove: boolean };
  onRemove: (expenseId: number) => void;
  removing: boolean;
}) {
  const { t } = useTranslation();
  if (lines.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t('reports.noLines')}</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-card border border-border">
      {lines.map((line) => {
        const Icon = EXPENSE_ICONS[line.typeIcon as keyof typeof EXPENSE_ICONS] ?? Receipt;
        const missingReceipt = line.receiptRequired && !line.receiptAttached;
        return (
          <li key={line.expenseId} className="flex gap-3 px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-input bg-brand/10 text-brand-solid dark:text-brand">
              <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{line.merchant ?? line.typeName}</p>
                  <p className="truncate text-xs text-muted">
                    {line.typeName} · {formatDate(line.expenseDate)}
                    {line.description ? ` · ${line.description}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p
                    className={
                      line.approvedAmountSar !== line.amountSar
                        ? 'text-sm text-muted line-through tabular'
                        : 'font-semibold tabular'
                    }
                  >
                    {formatSar(line.amountSar)}
                  </p>
                  {line.approvedAmountSar !== line.amountSar && (
                    <p
                      className="font-semibold text-warn tabular"
                      title={line.adjustmentReason ?? undefined}
                    >
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
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {line.violations.map((v) => (
                  <Tag
                    key={`${v.ruleCode}-${v.message}`}
                    tone={v.level === 'BLOCK' ? 'block' : 'warn'}
                  >
                    <span title={v.message}>
                      {isRule(v.ruleCode) ? t(`expenses.rules.${v.ruleCode}`) : v.ruleCode}
                    </span>
                  </Tag>
                ))}
                {missingReceipt && !line.violations.some((v) => v.ruleCode === 'RECEIPT') && (
                  <Tag tone="warn">{t('expenses.list.noReceipt')}</Tag>
                )}
                {line.receipt && (
                  <a
                    href={line.receipt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-pill px-1.5 text-xs font-medium text-brand-solid hover:underline dark:text-brand"
                  >
                    <Paperclip aria-hidden className="size-3.5" />
                    {t('reports.viewReceipt')}
                    {line.receipt.qrValid && <span className="text-muted">· ZATCA ✓</span>}
                  </a>
                )}
                <span className="ms-auto flex gap-1">
                  {canEditLines.open && (
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        to={`/expenses/${line.expenseId}`}
                        aria-label={t('reports.editLine', { name: line.merchant ?? line.typeName })}
                      >
                        <Pencil aria-hidden />
                      </Link>
                    </Button>
                  )}
                  {canEditLines.remove && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removing || lines.length === 1}
                      title={lines.length === 1 ? t('reports.lastLine') : undefined}
                      aria-label={t('reports.removeLine', { name: line.merchant ?? line.typeName })}
                      onClick={() => onRemove(line.expenseId)}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
