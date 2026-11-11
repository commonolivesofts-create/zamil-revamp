// UI-UX §4 /status — "Where is my claim?" (FR-REP-07, D-26): every open report with its stage,
// who holds it and since when.
import { ArrowUpRight, FileText, Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusPill } from '../../components/ui/StatusPill';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { Stepper } from '../../components/ui/Stepper';
import { formatDate, formatRelative, formatSar } from '../../lib/format';
import { useMyReports } from './hooks';

const OPEN = new Set([
  'PENDING_APPROVAL',
  'PENDING_AUDIT',
  'READY_FOR_PAYMENT',
  'INVOICED',
  'REJECTED',
]);

export function ClaimStatusPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reports = useMyReports();
  const open = (reports.data ?? []).filter((r) => OPEN.has(r.status));

  return (
    <div className="eh-claim-status" aria-busy={reports.isPending || undefined}>
      <PageHeader
        eyebrow={t('expenses.list.eyebrow')}
        title={t('claimStatus.title')}
        description={t('claimStatus.description')}
        actions={
          <Button asChild variant="secondary">
            <Link to="/reports">
              <FileText aria-hidden />
              {t('claimStatus.allReports')}
            </Link>
          </Button>
        }
      />
      {reports.isPending ? (
        <ul className="eh-claim-status__grid">
          {Array.from({ length: 2 }, (_, i) => (
            <li key={i}>
              <Card className="eh-claim-status__card eh-claim-status__loading">
                <Skeleton className="eh-claim-status__loading-icon size-10 rounded-input" />
                <div className="eh-claim-status__loading-copy">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-36 max-w-full" />
                </div>
                <Skeleton className="eh-claim-status__loading-amount h-5 w-24" />
                <div className="eh-claim-status__skeleton-steps">
                  {Array.from({ length: 5 }, (_, stage) => (
                    <div key={stage}>
                      <Skeleton className="size-7 rounded-full" />
                      <Skeleton className="h-3 w-12 max-w-full" />
                    </div>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : open.length === 0 ? (
        <Card className="eh-reports__list">
          <EmptyState
            icon={Route}
            title={t('claimStatus.empty')}
            body={t('claimStatus.emptyBody')}
            action={
              <Button asChild variant="secondary">
                <Link to="/reports">{t('claimStatus.allReports')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="eh-claim-status__grid">
          {open.map((r) => (
            <li key={r.reportId}>
              <Card
                className={cn(
                  'eh-claim-status__card',
                  `is-${r.status.toLowerCase().replaceAll('_', '-')}`,
                )}
              >
                <span className="eh-reports__icon" aria-hidden="true">
                  <FileText className="size-[18px]" strokeWidth={1.8} />
                </span>
                <span className="eh-reports__main">
                  <span className="eh-reports__meta">
                    <span className="eh-reports__number font-mono">
                      {r.reportNumber ?? t('reports.draftTitle')}
                    </span>
                    <StatusPill status={r.status} className="eh-reports__status" />
                    {r.infoRequested && (
                      <Tag tone="warn" className="eh-reports__info">
                        {t('reports.infoRequested')}
                      </Tag>
                    )}
                  </span>
                  <span className="eh-reports__purpose">{r.purpose}</span>
                  <span className="eh-reports__detail">
                    {t('reports.lines', {
                      count: r.lineCount,
                      date: formatDate(r.reportDate),
                    })}
                  </span>
                </span>
                <span className="eh-reports__amount">
                  <span>{formatSar(r.totalSar)}</span>
                  <span>{formatDate(r.reportDate)}</span>
                </span>
                <div className="eh-claim-status__stepper">
                  <Stepper
                    status={r.status}
                    holder={
                      r.currentStep
                        ? t('reports.holder', {
                            name: r.currentStep.assigneeName,
                            step: r.currentStep.stepName,
                            since: formatRelative(r.currentStep.since),
                          })
                        : null
                    }
                  />
                </div>
                <div className="eh-claim-status__footer">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void navigate(`/reports/${r.reportId}`)}
                  >
                    {t('claimStatus.open')}
                    <ArrowUpRight aria-hidden />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
