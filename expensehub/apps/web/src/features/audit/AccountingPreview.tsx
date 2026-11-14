// FR-ACC-01: the journal Fusion is expected to create — labelled as a preview (D-06).
import { Info, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { formatSar } from '../../lib/format';
import { useAccountingPreview } from './hooks';

export function AccountingPreview({ reportId }: { reportId: number }) {
  const { t } = useTranslation();
  const preview = useAccountingPreview(reportId);
  const data = preview.data;

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-input bg-info/5 px-3 py-2 text-xs text-muted">
        <Info aria-hidden className="mt-px size-3.5 shrink-0 text-info" />
        {t('accounting.label')}
      </p>
      {!data ? (
        <Skeleton className="h-32" />
      ) : data.lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('accounting.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('accounting.caption')}</caption>
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-3 py-2 text-start">
                  {t('accounting.account')}
                </th>
                <th scope="col" className="px-3 py-2 text-end">
                  {t('accounting.debit')}
                </th>
                <th scope="col" className="px-3 py-2 text-end">
                  {t('accounting.credit')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.lines.map((l) => (
                <tr key={`${l.side}-${l.kind}-${l.account}`}>
                  <td className="px-3 py-2">
                    <span className={l.side === 'CR' ? 'block ps-4' : 'block'}>
                      <span className="block font-medium">{t(`accounting.kinds.${l.kind}`)}</span>
                      <span className="block font-mono text-[11px] text-muted">
                        {l.account}
                        {l.accountName ? ` · ${l.accountName}` : ''}
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-end tabular">
                    {l.side === 'DR' ? formatSar(l.amountSar) : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-end tabular">
                    {l.side === 'CR' ? formatSar(l.amountSar) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/40 font-semibold">
                <th scope="row" className="px-3 py-2 text-start">
                  <span className="flex items-center gap-2">
                    <Scale aria-hidden className="size-4 text-muted" />
                    {t('accounting.total')}
                    {data.balanced ? (
                      <Tag tone="pass">{t('accounting.balanced')}</Tag>
                    ) : (
                      <Tag tone="block">{t('accounting.unbalanced')}</Tag>
                    )}
                  </span>
                </th>
                <td
                  className="whitespace-nowrap px-3 py-2 text-end tabular"
                  data-testid="journal-dr"
                >
                  {formatSar(data.totalDr)}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2 text-end tabular"
                  data-testid="journal-cr"
                >
                  {formatSar(data.totalCr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
