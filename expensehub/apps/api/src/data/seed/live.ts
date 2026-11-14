// D-50: first start with FUSION_MODE=live — real people and accounts from Oracle Fusion instead
// of the demo seed. Setup data (options, approval and audit rules) comes from setup-data.ts;
// employees, COA, trips, Quick Pays and rates come from the sync jobs; expense types are built
// from Finance's account list (OQ-32); every employee gets a user; BOOTSTRAP_ADMINS are admins.
import type { BusinessUnit, EXPENSE_TYPE_ICONS } from '@expensehub/shared';
import type { Logger } from 'pino';
import type { JobRunner } from '../../jobs/runner';
import type { DataLayer, Repos, WriteOptions } from '../ports';
import {
  APPROVAL_RULES,
  AUDIT_RULES,
  expenseType,
  ROLE_START_DATE,
  SYSTEM_OPTIONS,
} from './setup-data';

const SYSTEM: WriteOptions = { actorId: null };
type ExpenseTypeIcon = (typeof EXPENSE_TYPE_ICONS)[number];

/** OQ-32 (23 Oct 2026): Finance's expense accounts. Limits stay open (none) for now. */
export const LIVE_EXPENSE_ACCOUNTS = [
  '55101',
  '55102',
  '55103',
  '55104',
  '55105',
  '55106',
  '55107',
  '55108',
  '55109',
  '55110',
  '55111',
  '55112',
  '55113',
  '55114',
  '55116',
  '55201',
  '55202',
  '55203',
  '55204',
  '55205',
  '55206',
  '55207',
] as const;

const ICONS: [RegExp, ExpenseTypeIcon][] = [
  [/air|ticket|flight|travel/i, 'plane'],
  [/hotel|accommodation|lodging/i, 'bed-double'],
  [/meal|food|entertain|hospitality/i, 'utensils'],
  [/fuel|petrol/i, 'fuel'],
  [/car|vehicle|transport|taxi/i, 'car'],
  [/phone|mobile|telecom|communication/i, 'smartphone'],
  [/internet|wifi/i, 'wifi'],
  [/training|course|education|seminar/i, 'graduation-cap'],
  [/gift|donation/i, 'gift'],
];
const iconFor = (name: string): ExpenseTypeIcon =>
  ICONS.find(([re]) => re.test(name))?.[1] ?? 'briefcase';

/** Options, approval rules and audit rules only — no demo people, no demo master data. */
export async function seedLiveSetup(data: DataLayer): Promise<void> {
  await data.withTransaction(async (r) => {
    if ((await r.systemOptions.list()).length > 0) return;
    for (const row of SYSTEM_OPTIONS) await r.systemOptions.insert(row, SYSTEM);
    for (const row of APPROVAL_RULES) await r.approvalRules.insert(row, SYSTEM);
    for (const row of AUDIT_RULES) await r.auditRules.insert(row, SYSTEM);
  });
}

async function createExpenseTypes(r: Repos): Promise<number> {
  if ((await r.expenseTypes.list()).length > 0) return 0;
  const accounts = new Map(
    (await r.coaValues.listBySegment('ACCOUNT')).map((v) => [v.value, v.description]),
  );
  let sortOrder = 10;
  for (const account of LIVE_EXPENSE_ACCOUNTS) {
    const name = (accounts.get(account) || `Account ${account}`).slice(0, 80);
    await r.expenseTypes.insert(
      expenseType({
        typeCode: `ACC_${account}`,
        name,
        naturalAccount: account,
        icon: iconFor(name),
        sortOrder,
        isPlaceholder: 'N',
      }),
      SYSTEM,
    );
    sortOrder += 10;
  }
  return LIVE_EXPENSE_ACCOUNTS.length;
}

export interface LiveBootstrapDeps {
  data: DataLayer;
  jobs: JobRunner;
  logger: Logger;
  /** bcrypt hash given to every user (dev only); null = set via the reset link. */
  passwordHash: string | null;
  /** Person numbers that get SYS_ADMIN (env BOOTSTRAP_ADMINS). */
  adminPersonNumbers: readonly string[];
}

/** Idempotent: does nothing once users exist. */
export async function bootstrapLive(deps: LiveBootstrapDeps): Promise<void> {
  const { data, jobs, logger } = deps;
  if ((await data.read((r) => r.users.list())).length > 0) return;

  await seedLiveSetup(data);
  for (const job of ['sync-hcm', 'sync-coa', 'sync-trips-quickpays', 'sync-rates']) {
    const run = await jobs.run(job);
    logger.info(
      { job, status: run.status, rowsRead: run.rowsRead, error: run.errorText ?? undefined },
      'live bootstrap sync',
    );
  }

  await data.withTransaction(async (r) => {
    const types = await createExpenseTypes(r);
    const employees = (await r.employees.list()).filter((e) => e.active === 'Y');
    for (const e of employees) {
      if (await r.users.getByPersonId(e.personId)) continue;
      await r.users.insert(
        {
          personId: e.personId,
          passwordHash: deps.passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          resetTokenHash: null,
          resetExpiresAt: null,
          active: 'Y',
        },
        SYSTEM,
      );
    }
    const admins: string[] = [];
    for (const number of deps.adminPersonNumbers) {
      const e = await r.employees.getByPersonNumber(number);
      if (!e) {
        logger.warn({ personNumber: number }, 'BOOTSTRAP_ADMINS: no such employee in Fusion');
        continue;
      }
      await r.roleAssignments.insert(
        {
          personId: e.personId,
          roleCode: 'SYS_ADMIN',
          businessUnit: null as BusinessUnit | null,
          isBackup: 'N',
          startDate: ROLE_START_DATE,
          endDate: null,
        },
        SYSTEM,
      );
      admins.push(number);
    }
    logger.info(
      { users: employees.length, expenseTypes: types, admins },
      'live bootstrap done — assign Finance Manager / Accountant / Finance AP in Setup → Roles',
    );
  });
}
