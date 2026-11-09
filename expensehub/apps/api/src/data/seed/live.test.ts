// D-50: first live start — people from the Fusion syncs, account-based expense types, admins.
import { describe, expect, it } from 'vitest';
import { MockFusionClient } from '../../integrations/fusion/mock/client';
import { createLogger } from '../../lib/logger';
import { buildServices } from '../../services';
import { testClock, testConfig } from '../../test-utils';
import { MemoryDataLayer } from '../memory/store';
import { bootstrapLive, LIVE_EXPENSE_ACCOUNTS } from './live';

function setup() {
  const config = testConfig();
  const data = new MemoryDataLayer();
  const logger = createLogger(config);
  const services = buildServices({
    config,
    data,
    logger,
    clock: testClock().clock,
    fusionClient: new MockFusionClient(),
    sleep: async () => {},
  });
  const run = () =>
    bootstrapLive({
      data,
      jobs: services.jobs,
      logger,
      passwordHash: null,
      adminPersonNumbers: ['1011', '9999'],
    });
  return { data, run };
}

describe('live bootstrap (D-50)', () => {
  it('syncs people, builds expense types from the accounts, creates users and admins', async () => {
    const { data, run } = setup();
    await run();
    const [employees, users, types, admins, rules] = await data.read(async (r) => [
      await r.employees.list(),
      await r.users.list(),
      await r.expenseTypes.list(),
      await r.roleAssignments.listByRole('SYS_ADMIN'),
      await r.approvalRules.listActive('STANDARD'),
    ]);
    expect(users).toHaveLength(employees.filter((e) => e.active === 'Y').length);
    expect(types.map((t) => t.naturalAccount)).toEqual([...LIVE_EXPENSE_ACCOUNTS]);
    expect(types.every((t) => t.defaultLimitSar === null && t.isPlaceholder === 'N')).toBe(true);
    expect(types[0]).toMatchObject({ typeCode: 'ACC_55101', category: 'STANDARD' });
    // 9999 is not in Fusion: skipped, not fatal.
    expect(admins.map((a) => a.personId)).toEqual([
      employees.find((e) => e.personNumber === '1011')!.personId,
    ]);
    expect(rules[0]).toMatchObject({ approverSource: 'SUPERVISOR_HIERARCHY' });
  });

  it('does nothing on the next start', async () => {
    const { data, run } = setup();
    await run();
    const users = () => data.read(async (r) => (await r.users.list()).length);
    const before = await users();
    await run();
    expect(await users()).toBe(before);
    expect(await data.read((r) => r.roleAssignments.listByRole('SYS_ADMIN'))).toHaveLength(1);
  });
});
