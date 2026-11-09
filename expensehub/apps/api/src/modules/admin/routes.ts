// Implements: API §10 admin — integration monitor (Adm, Fin), log view (Adm), on-demand sync
// (Adm), setup history (Adm). FR-SET-03 (log view phase 1; retry UI phase 2), FR-SET-05.
import {
  JOB_NAMES,
  integrationLogQuerySchema,
  setupHistoryQuerySchema,
  type InterfaceCode,
  type IntegrationLogItem,
  type IntegrationsResponse,
  type JobName,
  type JobRunDto,
  type SetupHistoryItem,
} from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, hasRole, requireCapability } from '../../auth/rbac';
import type { AppConfig } from '../../config';
import type { IntegrationLogRow, JobRunRow } from '../../data/entities';
import type { DataLayer } from '../../data/ports';
import { JOBS } from '../../jobs/registry';
import type { JobRunner } from '../../jobs/runner';
import { formatSchedule, nextRun } from '../../jobs/scheduler';
import type { Clock } from '../../lib/dates';

/** INTEGRATION §1. INT-02/03 share INT-01's report. */
const INTERFACES: {
  code: InterfaceCode;
  direction: 'IN' | 'OUT';
  jobName: JobName | null;
  logAs: InterfaceCode;
  milestone: string | null;
}[] = [
  { code: 'INT-01', direction: 'IN', jobName: 'sync-hcm', logAs: 'INT-01', milestone: null },
  { code: 'INT-02', direction: 'IN', jobName: 'sync-hcm', logAs: 'INT-01', milestone: null },
  { code: 'INT-03', direction: 'IN', jobName: 'sync-hcm', logAs: 'INT-01', milestone: null },
  { code: 'INT-04', direction: 'IN', jobName: 'sync-coa', logAs: 'INT-04', milestone: null },
  {
    code: 'INT-05a',
    direction: 'IN',
    jobName: 'sync-trips-quickpays',
    logAs: 'INT-05a',
    milestone: null,
  },
  {
    code: 'INT-05b',
    direction: 'IN',
    jobName: 'sync-trips-quickpays',
    logAs: 'INT-05b',
    milestone: null,
  },
  { code: 'INT-06', direction: 'IN', jobName: 'sync-rates', logAs: 'INT-06', milestone: null },
  { code: 'INT-07', direction: 'IN', jobName: 'sync-hcm', logAs: 'INT-07', milestone: null },
  { code: 'INT-08', direction: 'OUT', jobName: 'send-invoices', logAs: 'INT-08', milestone: null },
  {
    code: 'INT-09',
    direction: 'IN',
    jobName: 'poll-invoice-status',
    logAs: 'INT-09',
    milestone: null,
  },
];

export function jobRunDto(run: JobRunRow): JobRunDto {
  return {
    runId: run.runId,
    jobName: run.jobName,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    status: run.status,
    rowsRead: run.rowsRead,
    rowsChanged: run.rowsChanged,
    errorText: run.errorText,
    durationMs: run.endedAt ? Date.parse(run.endedAt) - Date.parse(run.startedAt) : null,
  };
}

function logDto(row: IntegrationLogRow): IntegrationLogItem {
  return {
    logId: row.logId,
    interface: row.interface,
    direction: row.direction,
    refType: row.refType,
    refId: row.refId,
    httpMethod: row.httpMethod,
    url: row.url,
    httpStatus: row.httpStatus,
    status: row.status,
    retries: row.retries,
    durationMs: row.durationMs,
    at: row.at,
    request: row.request,
    response: row.response,
  };
}

const jobParam = z.object({ jobName: z.enum(JOB_NAMES) });

export function adminRoutes(deps: {
  config: AppConfig;
  data: DataLayer;
  jobs: JobRunner;
  clock: Clock;
  scheduleEnabled: boolean;
}): Router {
  const { config, data, jobs, clock } = deps;
  const router = Router();
  const admin = requireCapability('SYS_ADMIN');

  router.get(
    '/admin/integrations',
    requireCapability('SYS_ADMIN', 'FINANCE_AP', 'ACCOUNTANT'),
    async (req, res) => {
      const now = clock();
      const body: IntegrationsResponse = await data.read(async (r) => ({
        fusionMode: config.fusion.mode,
        canRun: hasRole(authOf(req), 'SYS_ADMIN'),
        jobs: await Promise.all(
          JOBS.map(async (job) => {
            const last = await r.jobRuns.latest(job.name);
            const lastOk = await r.jobRuns.latestWithStatus(job.name, 'OK');
            return {
              jobName: job.name,
              interfaces: job.interfaces,
              dailyAt: formatSchedule(job),
              nextRunAt: deps.scheduleEnabled ? nextRun(job, now).toISOString() : null,
              lastRun: last ? jobRunDto(last) : null,
              lastSuccessAt: lastOk?.endedAt ?? null,
            };
          }),
        ),
        interfaces: await Promise.all(
          INTERFACES.map(async (i) => {
            const last = await r.integrationLog.latest(i.logAs);
            return {
              interface: i.code,
              direction: i.direction,
              jobName: i.jobName,
              milestone: i.milestone,
              lastAt: last?.at ?? null,
              lastStatus: last?.status ?? null,
              lastError: last?.status === 'ERROR' ? last.response : null,
            };
          }),
        ),
      }));
      res.set('Cache-Control', 'no-store').json(body);
    },
  );

  router.get('/admin/integrations/log', admin, async (req, res) => {
    const query = integrationLogQuerySchema.parse(req.query);
    const rows = await data.read((r) =>
      r.integrationLog.list({
        interface: query.interface,
        status: query.status,
        limit: query.limit ?? 100,
      }),
    );
    res.json({ items: rows.map(logDto) });
  });

  router.post('/admin/jobs/:jobName/run', admin, async (req, res) => {
    const { jobName } = jobParam.parse(req.params);
    req.log.info({ jobName, by: authOf(req).personId }, 'job run on demand');
    const run = await jobs.run(jobName);
    res.json({ run: jobRunDto(run) });
  });

  router.get('/admin/setup-history', admin, async (req, res) => {
    const query = setupHistoryQuerySchema.parse(req.query);
    const items = await data.read(async (r) => {
      const rows = await r.setupHistory.list({ tableName: query.table, limit: query.limit ?? 100 });
      const names = new Map<number, string>();
      const out: SetupHistoryItem[] = [];
      for (const row of rows) {
        if (row.actorId !== null && !names.has(row.actorId)) {
          names.set(
            row.actorId,
            (await r.employees.get(row.actorId))?.fullName ?? `Person ${row.actorId}`,
          );
        }
        out.push({
          id: row.id,
          tableName: row.tableName,
          rowKey: row.rowKey,
          at: row.at,
          actor:
            row.actorId === null
              ? null
              : { personId: row.actorId, fullName: names.get(row.actorId)! },
          oldJson: row.oldJson,
          newJson: row.newJson,
        });
      }
      return out;
    });
    res.json({ items });
  });

  return router;
}
