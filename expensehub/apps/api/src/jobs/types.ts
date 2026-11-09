// Scheduled / on-demand jobs (TRD §7). Each run is recorded in EH_JOB_RUNS by the runner.
import type { InterfaceCode, JobName } from '@expensehub/shared';
import type { Logger } from 'pino';
import type { DataLayer } from '../data/ports';
import type { FusionGateway } from '../integrations/fusion/gateway';
import type { Clock } from '../lib/dates';
import type { ReceiptFiles } from '../receipts/files';

export interface JobContext {
  data: DataLayer;
  fusion: FusionGateway;
  clock: Clock;
  logger: Logger;
  /** INT-08 attaches receipt files (OQ-17). */
  files: ReceiptFiles;
  /** APP_BASE_URL, for links in notifications. */
  appBaseUrl: string;
}

export interface JobResult {
  rowsRead: number;
  rowsChanged: number;
}

export interface JobDefinition {
  name: JobName;
  interfaces: InterfaceCode[];
  /** Daily run time in Riyadh (TRD §7); with `hourly`, the first run of the day. */
  dailyAt: { hour: number; minute: number };
  /** TRD §7 hourly jobs: every hour on the hour, fromHour…toHour Riyadh (INT-08/09). */
  hourly?: { fromHour: number; toHour: number };
  run(ctx: JobContext): Promise<JobResult>;
}

/** INTEGRATION §2.5: a broken extract must never wipe master data. */
export class SyncGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncGuardError';
  }
}
