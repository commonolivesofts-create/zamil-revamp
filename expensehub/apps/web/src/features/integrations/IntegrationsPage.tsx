// FR-SET-03 integration monitor: last run per interface, errors, payloads (Adm, Fin read-only).
import {
  INTEGRATION_LOG_STATUSES,
  INTERFACE_CODES,
  integrationLogListSchema,
  integrationsResponseSchema,
  jobRunResponseSchema,
  type InterfaceCode,
  type IntegrationLogItem,
  type JobDto,
  type JobRunDto,
  type IntegrationLogStatus,
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  FileText,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { Fragment, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReportPager } from '../../components/ui/ReportPager';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag, type Tone } from '../../components/ui/Tag';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime, formatDuration, formatRelative } from '../../lib/format';
import { downloadCsv, printPdf } from '../../lib/report-export';

const LOG_PAGE_SIZE = 10;
const LOG_LIMIT = 500;
type LogFilters = {
  query: string;
  interface: InterfaceCode | '';
  status: IntegrationLogStatus | '';
};
const EMPTY_LOG_FILTERS: LogFilters = { query: '', interface: '', status: '' };

const statusTone: Record<string, Tone> = {
  OK: 'pass',
  ERROR: 'block',
  RETRYING: 'warn',
  RUNNING: 'info',
  SKIPPED: 'neutral',
};

export function IntegrationsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const monitor = useQuery({
    queryKey: ['integrations'],
    queryFn: ({ signal }) => api('/admin/integrations', integrationsResponseSchema, { signal }),
    refetchInterval: 15_000,
  });
  const run = useMutation({
    mutationFn: (jobName: string) =>
      api(`/admin/jobs/${jobName}/run`, jobRunResponseSchema, { method: 'POST' }),
    onSuccess: async ({ run: result }) => {
      const job = t(`integrations.jobs.${result.jobName as JobDto['jobName']}`);
      if (result.status === 'OK') {
        toast.success(
          t('integrations.runOk', {
            job,
            read: result.rowsRead ?? 0,
            changed: result.rowsChanged ?? 0,
          }),
        );
      } else if (result.status === 'SKIPPED') {
        toast.info(t('integrations.runSkipped', { job }));
      } else {
        toast.error(t('integrations.runFailed', { job }), {
          description: result.errorText ?? undefined,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      await queryClient.invalidateQueries({ queryKey: ['integration-log'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const data = monitor.data;
  return (
    <>
      <PageHeader
        title={t('integrations.title')}
        description={t('integrations.description')}
        actions={
          data && (
            <Tag tone={data.fusionMode === 'mock' ? 'warn' : 'pass'}>
              {t('integrations.mode', {
                mode:
                  data.fusionMode === 'mock'
                    ? t('integrations.modeMock')
                    : t('integrations.modeLive'),
              })}
            </Tag>
          )
        }
      />

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">{t('integrations.jobsTitle')}</h2>
            <p className="mt-1 text-xs text-muted">{t('integrations.jobsDescription')}</p>
          </div>
          {data && (
            <span className="text-xs text-muted">
              {t('integrations.jobCount', { count: data.jobs.length })}
            </span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {monitor.isError && !data ? (
            <Card className="flex min-h-36 flex-col items-start justify-center p-5">
              <p className="text-sm text-block">{monitor.error.message}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => void monitor.refetch()}
              >
                {t('app.retry')}
              </Button>
            </Card>
          ) : !data ? (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-44" />)
          ) : (
            data.jobs.map((job) => (
              <JobCard
                key={job.jobName}
                job={job}
                canRun={data.canRun}
                running={run.isPending && run.variables === job.jobName}
                onRun={() => run.mutate(job.jobName)}
              />
            ))
          )}
        </div>
      </section>

      <Card className="eh-setup__list-card mb-8 overflow-hidden">
        <div className="eh-setup__table-head">
          <div>
            <h2>{t('integrations.interfacesTitle')}</h2>
            <p>{t('integrations.interfacesDescription')}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="eh-setup__data-table w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 text-start">
                  {t('integrations.interface')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.direction')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.lastCall')}
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  {t('integrations.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data
                ? data.interfaces.map((i, rowIndex) => (
                    <tr
                      key={i.interface}
                      className="eh-setup__data-row"
                      style={{ '--eh-setup-row-index': rowIndex } as CSSProperties}
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-muted">{i.interface}</span>
                        <span className="ms-2 font-medium">
                          {t(`integrations.interfaces.${i.interface}`)}
                        </span>
                        {i.lastError && (
                          <p className="mt-0.5 truncate text-xs text-block">{i.lastError}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          {i.direction === 'IN' ? (
                            <ArrowDownToLine aria-hidden className="size-4" />
                          ) : (
                            <ArrowUpFromLine aria-hidden className="size-4" />
                          )}
                          {i.direction === 'IN'
                            ? t('integrations.inbound')
                            : t('integrations.outbound')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {i.lastAt ? formatRelative(i.lastAt) : t('integrations.notYet')}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {i.milestone ? (
                          <Tag>{t('common.comingIn', { id: i.milestone })}</Tag>
                        ) : i.lastStatus ? (
                          <Tag tone={statusTone[i.lastStatus]}>
                            {t(`integrations.statuses.${i.lastStatus}`)}
                          </Tag>
                        ) : (
                          <Tag>{t('integrations.notYet')}</Tag>
                        )}
                      </td>
                    </tr>
                  ))
                : Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={4} className="px-5 py-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data?.canRun ? (
        <CallLog />
      ) : (
        <p className="text-sm text-muted">{t('integrations.logAdminOnly')}</p>
      )}
    </>
  );
}

function JobCard({
  job,
  canRun,
  running,
  onRun,
}: {
  job: JobDto;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const { t } = useTranslation();
  const last: JobRunDto | null = job.lastRun;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t(`integrations.jobs.${job.jobName}`)}</p>
          <p className="mt-0.5 flex flex-wrap gap-1">
            {job.interfaces.map((code) => (
              <span
                key={code}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted"
              >
                {code}
              </span>
            ))}
          </p>
        </div>
        {last ? (
          <Tag tone={statusTone[last.status]}>{t(`integrations.statuses.${last.status}`)}</Tag>
        ) : (
          <Tag>{t('integrations.never')}</Tag>
        )}
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{t('integrations.daily', { time: job.dailyAt })}</dt>
          {job.nextRunAt && (
            <dd className="text-muted">
              {t('integrations.nextRun', { when: formatRelative(job.nextRunAt) })}
            </dd>
          )}
        </div>
        {last && (
          <div className="flex justify-between gap-2">
            <dt>{t('integrations.lastRun', { when: formatRelative(last.startedAt) })}</dt>
            <dd className="tabular text-muted">
              {last.durationMs !== null ? formatDuration(Math.round(last.durationMs / 1000)) : ''}
            </dd>
          </div>
        )}
        {last?.rowsRead !== null && last?.rowsRead !== undefined && (
          <p className="tabular text-muted">
            {t('integrations.rows', { read: last.rowsRead, changed: last.rowsChanged ?? 0 })}
          </p>
        )}
        {last?.status === 'ERROR' && job.lastSuccessAt && (
          <p className="text-muted">
            {t('integrations.lastSuccess', { when: formatRelative(job.lastSuccessAt) })}
          </p>
        )}
      </dl>

      {last?.status === 'ERROR' && last.errorText && (
        <p className="mt-3 flex items-start gap-2 rounded-input bg-block/10 px-3 py-2 text-xs text-block">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {last.errorText}
        </p>
      )}

      {canRun && (
        <div className="mt-auto pt-4">
          <Button
            variant="secondary"
            size="sm"
            loading={running}
            onClick={onRun}
            className="w-full"
            aria-label={`${t('integrations.runNow')}: ${t(`integrations.jobs.${job.jobName}`)}`}
          >
            {!running && <Play aria-hidden />}
            {running ? t('integrations.running') : t('integrations.runNow')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CallLog() {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<LogFilters>(EMPTY_LOG_FILTERS);
  const [draft, setDraft] = useState<LogFilters>(EMPTY_LOG_FILTERS);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const log = useQuery({
    queryKey: ['integration-log', filters.interface, filters.status],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(LOG_LIMIT) });
      if (filters.interface) params.set('interface', filters.interface);
      if (filters.status) params.set('status', filters.status);
      return api(`/admin/integrations/log?${params}`, integrationLogListSchema, { signal });
    },
    placeholderData: (previous) => previous,
  });
  const filtered = useMemo(() => {
    const search = filters.query.trim().toLowerCase();
    return (log.data?.items ?? []).filter((entry) => {
      const searchable = [
        entry.interface,
        entry.httpMethod,
        entry.url,
        entry.refType,
        entry.refId,
        entry.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return !search || searchable.includes(search);
    });
  }, [filters.query, log.data]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  const visible = filtered.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE);
  const activeFilters =
    Number(Boolean(filters.query.trim())) +
    Number(Boolean(filters.interface)) +
    Number(Boolean(filters.status));
  const exportColumns = useMemo(
    () => [
      {
        label: t('integrations.time'),
        value: (entry: IntegrationLogItem) => formatDateTime(entry.at),
      },
      { label: t('integrations.interface'), value: (entry: IntegrationLogItem) => entry.interface },
      {
        label: t('integrations.direction'),
        value: (entry: IntegrationLogItem) =>
          t(entry.direction === 'IN' ? 'integrations.inbound' : 'integrations.outbound'),
      },
      {
        label: t('integrations.call'),
        value: (entry: IntegrationLogItem) => `${entry.httpMethod ?? ''} ${entry.url ?? ''}`.trim(),
      },
      {
        label: t('integrations.http'),
        value: (entry: IntegrationLogItem) => entry.httpStatus ?? '',
      },
      { label: t('integrations.retries'), value: (entry: IntegrationLogItem) => entry.retries },
      {
        label: t('integrations.duration'),
        value: (entry: IntegrationLogItem) =>
          entry.durationMs === null ? '' : `${entry.durationMs} ms`,
      },
      {
        label: t('integrations.status'),
        value: (entry: IntegrationLogItem) => t(`integrations.statuses.${entry.status}`),
      },
    ],
    [t],
  );
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
    setExpanded(null);
    setFiltersOpen(false);
  };
  const resetFilters = () => {
    setDraft(EMPTY_LOG_FILTERS);
    setFilters(EMPTY_LOG_FILTERS);
    setPage(1);
    setExpanded(null);
  };
  const exportCsv = () => downloadCsv(filtered, exportColumns, 'integration_call_log');
  const exportPdf = () => {
    const opened = printPdf(
      filtered,
      exportColumns,
      t('integrations.logTitle'),
      t('integrations.exportMeta', {
        count: filtered.length,
        date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()),
      }),
    );
    if (!opened) toast.error(t('setup.listing.popupBlocked'));
  };

  return (
    <Card className="eh-setup__list-card overflow-hidden">
      <div className="eh-setup__table-head eh-integration__table-head">
        <div>
          <h2>{t('integrations.logTitle')}</h2>
          <p>{t('integrations.logDescription')}</p>
        </div>
        <div className="eh-integration__table-actions">
          <Button
            className="eh-setup__header-action"
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <ArrowDownToLine aria-hidden />
            {t('setup.listing.csv')}
          </Button>
          <Button
            className="eh-setup__header-action"
            variant="secondary"
            size="sm"
            onClick={exportPdf}
            disabled={!filtered.length}
          >
            <FileText aria-hidden />
            {t('setup.listing.pdf')}
          </Button>
          <Button
            className={cn(
              'eh-setup__header-action eh-setup__filter-button',
              (filtersOpen || activeFilters > 0) && 'is-active',
            )}
            variant="secondary"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls="integration-log-filters"
            onClick={() => {
              setDraft(filters);
              setFiltersOpen((isOpen) => !isOpen);
            }}
          >
            <SlidersHorizontal aria-hidden />
            {t('setup.listing.filter')}
            {activeFilters > 0 && <span className="eh-setup__filter-count">{activeFilters}</span>}
          </Button>
        </div>
      </div>
      <div
        id="integration-log-filters"
        className={`eh-setup__filter-panel${filtersOpen ? ' is-open' : ''}`}
        aria-hidden={!filtersOpen}
      >
        {filtersOpen && (
          <form
            className="eh-setup__filter-form"
            onSubmit={applyFilters}
            aria-label={t('integrations.filterLabel')}
          >
            <label className="eh-setup__filter-field eh-setup__filter-search">
              <span>{t('setup.listing.search')}</span>
              <span className="eh-setup__search-input">
                <Search aria-hidden />
                <Input
                  value={draft.query}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder={t('integrations.searchPlaceholder')}
                />
              </span>
            </label>
            <label className="eh-setup__filter-field">
              <span>{t('integrations.interface')}</span>
              <Select
                value={draft.interface}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    interface: event.target.value as InterfaceCode | '',
                  }))
                }
              >
                <option value="">{t('integrations.allInterfaces')}</option>
                {INTERFACE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </label>
            <label className="eh-setup__filter-field">
              <span>{t('integrations.status')}</span>
              <Select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as IntegrationLogStatus | '',
                  }))
                }
              >
                <option value="">{t('integrations.allStatuses')}</option>
                {INTEGRATION_LOG_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`integrations.statuses.${status}`)}
                  </option>
                ))}
              </Select>
            </label>
            <div className="eh-setup__filter-actions">
              <Button type="submit">
                <Check aria-hidden />
                {t('setup.listing.applyFilters')}
              </Button>
              <Button type="button" variant="secondary" onClick={resetFilters}>
                <RotateCcw aria-hidden />
                {t('setup.listing.resetFilters')}
              </Button>
            </div>
          </form>
        )}
      </div>
      {log.isPending ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : log.isError ? (
        <div className="p-8 text-center">
          <p className="text-sm text-block">{log.error.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void log.refetch()}>
            {t('app.retry')}
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t('integrations.logEmpty')}
          body={t('integrations.logEmptyBody')}
        />
      ) : (
        <div className="min-w-0">
          <table className="eh-setup__data-table eh-integration__log-table w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 text-start">
                  {t('integrations.time')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.interface')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.direction')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.call')}
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  {t('integrations.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, rowIndex) => (
                <Fragment key={entry.logId}>
                  <tr
                    className="eh-setup__data-row"
                    style={{ '--eh-setup-row-index': rowIndex } as CSSProperties}
                  >
                    <td data-label={t('integrations.time')} className="px-5 py-3">
                      <button
                        type="button"
                        aria-expanded={expanded === entry.logId}
                        aria-label={t('integrations.toggleDetails')}
                        onClick={() => setExpanded(expanded === entry.logId ? null : entry.logId)}
                        className="inline-flex max-w-full flex-wrap items-center gap-2 text-start font-medium"
                      >
                        <span>{formatDateTime(entry.at)}</span>
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'size-3.5 text-muted transition-transform',
                            expanded === entry.logId && 'rotate-180',
                          )}
                        />
                      </button>
                    </td>
                    <td data-label={t('integrations.interface')} className="px-3 py-3">
                      <span className="block font-mono text-[10px] text-muted">
                        {entry.interface}
                      </span>
                      <span className="font-medium">
                        {t(`integrations.interfaces.${entry.interface}`)}
                      </span>
                    </td>
                    <td data-label={t('integrations.direction')} className="px-3 py-3 text-muted">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {entry.direction === 'IN' ? (
                          <ArrowDownToLine aria-hidden className="size-4" />
                        ) : (
                          <ArrowUpFromLine aria-hidden className="size-4" />
                        )}
                        {t(
                          entry.direction === 'IN'
                            ? 'integrations.inbound'
                            : 'integrations.outbound',
                        )}
                      </span>
                    </td>
                    <td data-label={t('integrations.call')} className="px-3 py-3">
                      <span className="eh-integration__log-call block font-mono text-xs">
                        {entry.httpMethod && <span>{entry.httpMethod} </span>}
                        {entry.url && <span className="eh-integration__log-url">{entry.url}</span>}
                      </span>
                      <span className="text-[10px] text-muted">
                        {t('integrations.http')} {entry.httpStatus ?? '—'} · {entry.retries}× ·{' '}
                        {entry.durationMs ?? 0} ms
                      </span>
                    </td>
                    <td data-label={t('integrations.status')} className="px-5 py-3 text-center">
                      <Tag className="eh-integration__log-tag" tone={statusTone[entry.status]}>
                        {t(`integrations.statuses.${entry.status}`)}
                      </Tag>
                    </td>
                  </tr>
                  {expanded === entry.logId && (
                    <tr className="eh-integration__detail-row">
                      <td colSpan={5}>
                        <div className="grid gap-3 rounded-input bg-surface-2/50 p-4 lg:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted">
                              {t('integrations.request')}
                            </p>
                            <pre className="max-h-64 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-input bg-surface p-3 font-mono text-[11px] leading-5 ring-1 ring-border">
                              {JSON.stringify(entry.request, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted">
                              {t('integrations.response')}
                            </p>
                            <pre className="max-h-64 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-input bg-surface p-3 font-mono text-[11px] leading-5 ring-1 ring-border">
                              {entry.response ?? '—'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 && (
        <ReportPager
          page={page}
          pages={pageCount}
          total={filtered.length}
          pageSize={LOG_PAGE_SIZE}
          onPage={setPage}
          label={t('integrations.logPages')}
        />
      )}
    </Card>
  );
}
