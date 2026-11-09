// UI-UX §4 /status — "Where is my claim?" (FR-REP-07, D-26): every open report with its stage,
// who holds it and since when.
import { Route } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusPill } from '../../components/ui/StatusPill';
import { Stepper } from '../../components/ui/Stepper';
import { formatRelative, formatSar } from '../../lib/format';
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
    <div>
      <PageHeader
        eyebrow={t('expenses.list.eyebrow')}
        title={t('claimStatus.title')}
        description={t('claimStatus.description')}
      />
      {reports.isPending ? (
        <Skeleton className="h-48" />
      ) : open.length === 0 ? (
        <Card>
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
        <ul className="grid gap-4 lg:grid-cols-2">
          {open.map((r) => (
            <li key={r.reportId}>
              <Card className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted">{r.reportNumber}</p>
                    <p className="truncate font-semibold">{r.purpose}</p>
                  </div>
                  <p className="text-lg font-semibold tabular">{formatSar(r.totalSar)}</p>
                </div>
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
                <div className="mt-auto flex items-center justify-between gap-2">
                  <StatusPill status={r.status} />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void navigate(`/reports/${r.reportId}`)}
                  >
                    {t('claimStatus.open')}
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
