// Implements: TRD §7 — every run is recorded in EH_JOB_RUNS; a run is SKIPPED while the same job
// is still RUNNING and younger than 2 h; a failure notifies Admin + Finance AP (INTEGRATION §2.4).
import type { JobName } from '@expensehub/shared';
import type { Logger } from 'pino';
import type { JobRunRow } from '../data/entities';
import type { DataLayer } from '../data/ports';
import type { FusionGateway } from '../integrations/fusion/gateway';
import type { ReceiptFiles } from '../receipts/files';
import { riyadhDate, type Clock } from '../lib/dates';
import { AppError } from '../lib/errors';
import { enqueueEmail } from '../modules/notifications/outbox';
import { jobByName } from './registry';

export const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;

export class JobRunner {
  constructor(
    private readonly deps: {
      data: DataLayer;
      fusion: FusionGateway;
      clock: Clock;
      logger: Logger;
      files: ReceiptFiles;
      /** APP_BASE_URL, for links in notifications. */
      appBaseUrl: string;
    },
  ) {}

  async run(name: string): Promise<JobRunRow> {
    const job = jobByName(name);
    if (!job) throw new AppError('NOT_FOUND', `Unknown job ${name}`);
    const { data, clock, logger } = this.deps;
    const startedAt = clock();

    // Claim the run (or record a skip) atomically.
    const claim = await data.withTransaction(async (r) => {
      const last = await r.jobRuns.latest(job.name);
      const busy =
        last?.status === 'RUNNING' &&
        startedAt.getTime() - Date.parse(last.startedAt) < STALE_RUNNING_MS;
      return r.jobRuns.insert({
        jobName: job.name,
        startedAt: startedAt.toISOString(),
        endedAt: busy ? startedAt.toISOString() : null,
        status: busy ? 'SKIPPED' : 'RUNNING',
        rowsRead: null,
        rowsChanged: null,
        errorText: busy ? `Run ${last.runId} is still running` : null,
      });
    });
    if (claim.status === 'SKIPPED') {
      logger.warn({ job: job.name }, 'job skipped: previous run still running');
      return claim;
    }

    try {
      const { data: d, fusion, clock: c, logger: l, files, appBaseUrl } = this.deps;
      const result = await job.run({ data: d, fusion, clock: c, logger: l, files, appBaseUrl });
      const done = await data.withTransaction((r) =>
        r.jobRuns.update(claim.runId, {
          status: 'OK',
          endedAt: clock().toISOString(),
          rowsRead: result.rowsRead,
          rowsChanged: result.rowsChanged,
        }),
      );
      logger.info({ job: job.name, ...result }, 'job finished');
      return done;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ job: job.name, err }, 'job failed');
      return data.withTransaction(async (r) => {
        const failed = await r.jobRuns.update(claim.runId, {
          status: 'ERROR',
          endedAt: clock().toISOString(),
          errorText: message.slice(0, 4000),
        });
        await this.notifyFailure(r, job.name, job.interfaces, failed.runId, message);
        return failed;
      });
    }
  }

  /** INTEGRATION §2.4: Finance and Admin are told about a failed interface. */
  private async notifyFailure(
    r: Parameters<Parameters<DataLayer['withTransaction']>[0]>[0],
    jobName: JobName,
    interfaces: string[],
    runId: number,
    error: string,
  ) {
    const today = riyadhDate(this.deps.clock());
    const holders = [
      ...(await r.roleAssignments.listByRole('SYS_ADMIN')),
      ...(await r.roleAssignments.listByRole('FINANCE_AP')),
    ].filter((a) => a.startDate <= today && (a.endDate === null || a.endDate >= today));
    for (const personId of new Set(holders.map((a) => a.personId))) {
      await enqueueEmail(r, personId, 'SYNC_FAILED', {
        jobName,
        interfaces,
        runId,
        error: error.slice(0, 500),
        link: `${this.deps.appBaseUrl}/admin/integrations`,
      });
    }
  }
}
