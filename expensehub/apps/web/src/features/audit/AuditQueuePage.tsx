// UI-UX §4 /audit — reports selected for audit and waiting for me (FR-AUD-01/03).
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { formatRelative, formatSar } from '../../lib/format';
import { useAuditQueue } from './hooks';

export function AuditQueuePage() {
  const { t } = useTranslation();
  const queue = useAuditQueue();
  const items = queue.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={t('approvals.eyebrow')}
        title={t('audit.title')}
        description={t('audit.description')}
      />
      <Card className="overflow-hidden">
        {queue.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t('audit.empty')} body={t('audit.emptyBody')} />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.reportId}>
                <Link
                  to={`/audit/${item.reportId}`}
                  className="flex flex-col gap-3 px-4 py-4 hover:bg-surface-2/40 sm:flex-row sm:items-center sm:px-5"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={item.claimantName} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{item.claimantName}</span>
                        <span className="text-xs text-muted">
                          {item.businessUnit} ·{' '}
                          <span className="font-mono">{item.reportNumber}</span>
                        </span>
                      </p>
                      <p className="truncate text-sm text-muted">{item.purpose}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {item.reasons.map((reason) => (
                          <Tag key={reason} tone="info">
                            {t(`audit.reasons.${reason}`)}
                          </Tag>
                        ))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-6 ps-12 sm:ps-0">
                    <p className="text-xs text-muted">
                      {t('audit.receiptsVerified', {
                        done: item.receiptsVerified,
                        total: item.receipts,
                      })}
                    </p>
                    <div className="text-end">
                      <p className="text-lg font-semibold tabular">{formatSar(item.totalSar)}</p>
                      <p className="text-xs text-muted">
                        {t('approvals.waiting', { when: formatRelative(item.pendingSince) })}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
