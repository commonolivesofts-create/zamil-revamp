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
} from '@expensehub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Play, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag, type Tone } from '../../components/ui/Tag';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDateTime, formatDuration, formatRelative } from '../../lib/format';

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

      <h2 className="mb-3 font-semibold">{t('integrations.jobsTitle')}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!data
          ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-44" />)
          : data.jobs.map((job) => (
              <JobCard
                key={job.jobName}
                job={job}
                canRun={data.canRun}
                running={run.isPending && run.variables === job.jobName}
                onRun={() => run.mutate(job.jobName)}
              />
            ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">{t('integrations.interfacesTitle')}</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 text-start">
                  {t('integrations.interface')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.direction')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('integrations.lastCall')}
                </th>
                <th scope="col" className="px-5 py-3 text-end">
                  {t('integrations.status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.interfaces.map((i) => (
                <tr key={i.interface}>
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
                  <td className="px-5 py-3 text-end">
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="mb-3 mt-8 font-semibold">{t('integrations.logTitle')}</h2>
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
  const [iface, setIface] = useState<InterfaceCode | ''>('');
  const [status, setStatus] = useState<(typeof INTEGRATION_LOG_STATUSES)[number] | ''>('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const log = useQuery({
    queryKey: ['integration-log', iface, status],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '100' });
      if (iface) params.set('interface', iface);
      if (status) params.set('status', status);
      return api(`/admin/integrations/log?${params}`, integrationLogListSchema, { signal });
    },
    placeholderData: (previous) => previous,
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-border p-3">
        <div className="w-52">
          <Select
            aria-label={t('integrations.interface')}
            value={iface}
            onChange={(e) => setIface(e.target.value as InterfaceCode | '')}
          >
            <option value="">{t('integrations.allInterfaces')}</option>
            {INTERFACE_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select
            aria-label={t('integrations.status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="">{t('integrations.allStatuses')}</option>
            {INTEGRATION_LOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`integrations.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {!log.data?.items.length ? (
        <p className="px-5 py-6 text-sm text-muted">{t('integrations.logEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {log.data.items.map((entry) => (
            <LogRow
              key={entry.logId}
              entry={entry}
              open={expanded === entry.logId}
              onToggle={() => setExpanded(expanded === entry.logId ? null : entry.logId)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LogRow({
  entry,
  open,
  onToggle,
}: {
  entry: IntegrationLogItem;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-start text-sm hover:bg-surface-2/40 sm:grid-cols-[10rem_5rem_1fr_auto_auto]"
      >
        <span className="text-xs text-muted">{formatDateTime(entry.at)}</span>
        <span className="hidden font-mono text-xs sm:inline">{entry.interface}</span>
        <span className="hidden truncate font-mono text-xs text-muted sm:inline">
          {entry.httpMethod} {entry.url}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular text-xs text-muted">
            {entry.httpStatus ?? '—'} · {entry.retries}× · {entry.durationMs ?? 0} ms
          </span>
          <Tag tone={statusTone[entry.status]}>{t(`integrations.statuses.${entry.status}`)}</Tag>
        </span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="grid gap-3 bg-surface-2/40 px-5 pb-4 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted">{t('integrations.request')}</p>
            <pre className="max-h-64 overflow-auto rounded-input bg-surface p-3 font-mono text-[11px] leading-5 ring-1 ring-border">
              {JSON.stringify(entry.request, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted">{t('integrations.response')}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-input bg-surface p-3 font-mono text-[11px] leading-5 ring-1 ring-border">
              {entry.response ?? '—'}
            </pre>
          </div>
        </div>
      )}
    </li>
  );
}
