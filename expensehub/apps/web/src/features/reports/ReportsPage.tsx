// UI-UX §4 /reports — my reports with status chips, search and a progress tracker (FR-REP-06);
// /reports/:id opens the detail drawer over the list (UI-UX §5.3).
import type { ReportSummary } from '@expensehub/shared';
import { FileText, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusPill } from '../../components/ui/StatusPill';
import { ProgressBar } from '../../components/ui/Stepper';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDate, formatRelative, formatSar } from '../../lib/format';
import { REPORT_FILTERS, type ReportFilter } from '../../lib/report-status';
import { useMyReports } from './hooks';
import { ReportDrawer } from './ReportDrawer';

function matches(report: ReportSummary, filter: ReportFilter, q: string): boolean {
  const statuses = REPORT_FILTERS[filter] as readonly string[] | null;
  if (statuses && !statuses.includes(report.status)) return false;
  const needle = q.trim().toLowerCase();
  return (
    !needle ||
    report.purpose.toLowerCase().includes(needle) ||
    (report.reportNumber ?? '').toLowerCase().includes(needle)
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const reports = useMyReports();
  const [filter, setFilter] = useState<ReportFilter>('all');
  const [q, setQ] = useState('');

  const items = useMemo(() => reports.data ?? [], [reports.data]);
  const shown = useMemo(() => items.filter((r) => matches(r, filter, q)), [items, filter, q]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(REPORT_FILTERS) as ReportFilter[]).map((f) => [
          f,
          items.filter((r) => matches(r, f, '')).length,
        ]),
      ) as Record<ReportFilter, number>,
    [items],
  );

  return (
    <div className="eh-reports">
      <PageHeader
        eyebrow={t('expenses.list.eyebrow')}
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          <Button asChild variant="secondary">
            <Link to="/expenses">
              <Plus aria-hidden />
              {t('reports.newFromExpenses')}
            </Link>
          </Button>
        }
      />

      <div className="eh-reports__toolbar">
        <div
          role="radiogroup"
          aria-label={t('reports.filterLabel')}
          className="eh-reports__filters"
        >
          {(Object.keys(REPORT_FILTERS) as ReportFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn('eh-reports__filter', filter === f && 'is-active')}
            >
              {t(`reports.filters.${f}`)}
              <span className="eh-reports__filter-count tabular">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="eh-reports__search">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('reports.search')}
            aria-label={t('reports.search')}
            className="eh-reports__search-input ps-9"
          />
        </div>
      </div>

      <Card className="eh-reports__list overflow-hidden">
        {reports.isPending ? (
          <ul className="eh-reports__rows divide-y divide-border">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="eh-reports__loading-row">
                <Skeleton className="size-10 rounded-input" />
                <span className="eh-reports__loading-copy">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-36 max-w-full" />
                </span>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="eh-reports__loading-progress h-1.5 w-full" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('reports.empty')}
            body={t('reports.emptyBody')}
            action={
              <Button asChild>
                <Link to="/expenses">{t('reports.newFromExpenses')}</Link>
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t('reports.noMatch')}</p>
        ) : (
          <ul className="eh-reports__rows divide-y divide-border">
            {shown.map((r) => (
              <li key={r.reportId}>
                <button
                  type="button"
                  onClick={() => void navigate(`/reports/${r.reportId}`)}
                  className={cn(
                    'eh-reports__row group w-full text-start focus-visible:outline-none',
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
                    <span className="eh-reports__purpose group-hover:underline">{r.purpose}</span>
                    <span className="eh-reports__detail">
                      {r.currentStep
                        ? t('reports.holder', {
                            name: r.currentStep.assigneeName,
                            step: r.currentStep.stepName,
                            since: formatRelative(r.currentStep.since),
                          })
                        : t('reports.lines', {
                            count: r.lineCount,
                            date: formatDate(r.reportDate),
                          })}
                    </span>
                  </span>
                  <span className="eh-reports__amount">
                    <span>{formatSar(r.totalSar)}</span>
                    <span>{formatDate(r.reportDate)}</span>
                  </span>
                  <ProgressBar status={r.status} className="eh-reports__progress" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ReportDrawer reportId={id ? Number(id) : null} onClose={() => void navigate('/reports')} />
    </div>
  );
}
