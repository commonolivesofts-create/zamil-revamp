// TRD §7 job table. approval-sla joins in phase 2, notification-dispatch in M9.
import type { JobName } from '@expensehub/shared';
import { pollInvoiceStatusJob, sendInvoicesJob } from './payables';
import { syncCoa } from './sync/sync-coa';
import { syncHcm } from './sync/sync-hcm';
import { syncRates } from './sync/sync-rates';
import { syncTripsQuickPays } from './sync/sync-trips-quickpays';
import type { JobDefinition } from './types';

export const JOBS: readonly JobDefinition[] = [
  syncHcm,
  syncCoa,
  syncTripsQuickPays,
  syncRates,
  sendInvoicesJob,
  pollInvoiceStatusJob,
];

export function jobByName(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === (name as JobName));
}
