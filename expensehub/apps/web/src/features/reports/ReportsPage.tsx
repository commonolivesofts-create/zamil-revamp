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
    <div>
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="radiogroup"
          aria-label={t('reports.filterLabel')}
          className="flex flex-wrap gap-1.5"
        >
          {(Object.keys(REPORT_FILTERS) as ReportFilter[]).map((f) => (
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
              {t(`reports.filters.${f}`)}
              <span className="text-xs text-muted tabular">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
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
            className="ps-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {reports.isPending ? (
          <ul className="divide-y divide-border">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="px-5 py-4">
                <Skeleton className="h-12" />
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
          <ul className="divide-y divide-border">
            {shown.map((r) => (
              <li key={r.reportId}>
                <button
                  type="button"
                  onClick={() => void navigate(`/reports/${r.reportId}`)}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 text-start transition-colors hover:bg-surface-2/40 focus-visible:bg-surface-2/60 focus-visible:outline-none sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">
                        {r.reportNumber ?? t('reports.draftTitle')}
                      </span>
                      <StatusPill status={r.status} />
                      {r.infoRequested && <Tag tone="warn">{t('reports.infoRequested')}</Tag>}
                    </span>
                    <span className="mt-1 block truncate font-medium group-hover:underline">
                      {r.purpose}
                    </span>
                    <span className="block truncate text-xs text-muted">
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
                  <span className="text-end">
                    <span className="block text-lg font-semibold tabular">
                      {formatSar(r.totalSar)}
                    </span>
                  </span>
                  <ProgressBar status={r.status} className="col-span-2 max-w-md" />
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
