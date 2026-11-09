// M3 Done-when: "Run now" fills the mirrors from fixtures; the 50 %-drop guard is tested.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MemoryDataLayer } from '../data/memory/store';
import { seedDatabase } from '../data/seed';
import { MockFusionClient } from '../integrations/fusion/mock/client';
import { createLogger } from '../lib/logger';
import { buildServices } from '../services';
import { testClock, testConfig } from '../test-utils';

const MOCK_DIR = path.resolve(import.meta.dirname, '../integrations/fusion/mock');
const fixture = (name: string) => readFileSync(path.join(MOCK_DIR, name), 'utf8');

function setup(data = new MemoryDataLayer(), clock = testClock().clock) {
  const config = testConfig();
  const fusion = new MockFusionClient();
  const services = buildServices({
    config,
    data,
    logger: createLogger(config),
    clock,
    fusionClient: fusion,
    sleep: async () => {},
  });
  return { data, fusion, jobs: services.jobs };
}

async function seeded() {
  const data = new MemoryDataLayer();
  await seedDatabase(data);
  return setup(data);
}

describe('Run now fills the mirror tables from fixtures', () => {
  it.each([
    ['sync-hcm', 17, (d: MemoryDataLayer) => d.read((r) => r.employees.count())],
    ['sync-coa', 33, (d: MemoryDataLayer) => d.read((r) => r.coaValues.count())],
    ['sync-rates', 9, (d: MemoryDataLayer) => d.read((r) => r.rates.count())],
    [
      'sync-trips-quickpays',
      8,
      async (d: MemoryDataLayer) =>
        (await d.read((r) => r.businessTrips.count())) + (await d.read((r) => r.quickPays.count())),
    ],
  ] as const)('%s on an empty store', async (jobName, expected, count) => {
    const { data, jobs } = setup();
    const run = await jobs.run(jobName);
    expect(run).toMatchObject({ status: 'OK', rowsRead: expected, rowsChanged: expected });
    expect(await count(data)).toBe(expected);
  });

  it('logs every Fusion call (INTEGRATION §2.3) and records the run (TRD §7)', async () => {
    const { data, jobs } = setup();
    await jobs.run('sync-hcm');
    const log = await data.read((r) => r.integrationLog.list());
    expect(log.map((l) => l.interface).sort()).toEqual(['INT-01', 'INT-07']);
    expect(log.every((l) => l.status === 'OK' && l.httpStatus === 200)).toBe(true);
    expect(log.find((l) => l.interface === 'INT-01')?.request).toMatchObject({
      reportAbsolutePath: '/Custom/ExpenseHub/EH_HCM_EMPLOYEES.xdo',
      params: { P_AS_OF_DATE: '2026-10-18' },
    });
    expect((await data.read((r) => r.jobRuns.latest('sync-hcm')))?.endedAt).not.toBeNull();
  });

  it('reports no changes when Fusion sends the same data again', async () => {
    const { jobs } = await seeded();
    expect(await jobs.run('sync-hcm')).toMatchObject({
      status: 'OK',
      rowsRead: 17,
      rowsChanged: 0,
    });
    expect(await jobs.run('sync-coa')).toMatchObject({ status: 'OK', rowsChanged: 0 });
  });
});

describe('sync-hcm (INT-01/02/03/07)', () => {
  it('updates changed employees and deactivates those missing from the extract', async () => {
    const { data, fusion, jobs } = await seeded();
    const csv = fixture('EH_HCM_EMPLOYEES.csv')
      .replace('Ahmed Al-Subaie', 'Ahmed S. Al-Subaie')
      .split('\n')
      .filter((line) => !line.startsWith('300000010012,'))
      .join('\n');
    fusion.override('EH_HCM_EMPLOYEES', csv);

    const run = await jobs.run('sync-hcm');
    expect(run).toMatchObject({ status: 'OK', rowsRead: 16, rowsChanged: 2 });
    expect((await data.read((r) => r.employees.getByPersonNumber('1011')))?.fullName).toBe(
      'Ahmed S. Al-Subaie',
    );
    expect((await data.read((r) => r.employees.getByPersonNumber('1012')))?.active).toBe('N');
  });
});

describe('50 %-drop guard (INTEGRATION §2.5)', () => {
  it('aborts without changes when an extract shrinks below half', async () => {
    const { data, fusion, jobs } = await seeded();
    const lines = fixture('EH_HCM_EMPLOYEES.csv').trim().split('\n');
    fusion.override('EH_HCM_EMPLOYEES', lines.slice(0, 5).join('\n')); // header + 4 of 17
    const before = await data.read((r) => r.employees.list());

    const run = await jobs.run('sync-hcm');
    expect(run.status).toBe('ERROR');
    expect(run.errorText).toMatch(/4 rows, under 50 % of the previous 17/);
    expect(await data.read((r) => r.employees.list())).toEqual(before);
  });

  it('aborts on 0 rows', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'EH_GL_SEGMENT_VALUES',
      'SEGMENT,VALUE,DESCRIPTION,ENABLED_FLAG,START_DATE,END_DATE\n',
    );
    const run = await jobs.run('sync-coa');
    expect(run).toMatchObject({ status: 'ERROR' });
    expect(run.errorText).toMatch(/0 rows/);
    expect(await data.read((r) => r.coaValues.count())).toBe(33);
  });

  it('compares with the rows read by the last successful run', async () => {
    const { fusion, jobs } = setup();
    expect((await jobs.run('sync-coa')).status).toBe('OK'); // 33 rows
    const lines = fixture('EH_GL_SEGMENT_VALUES.csv').trim().split('\n');
    fusion.override('EH_GL_SEGMENT_VALUES', lines.slice(0, 17).join('\n')); // 16 < 16.5
    expect((await jobs.run('sync-coa')).status).toBe('ERROR');
    fusion.override('EH_GL_SEGMENT_VALUES', lines.slice(0, 18).join('\n')); // 17 ≥ 16.5
    expect(await jobs.run('sync-coa')).toMatchObject({ status: 'OK', rowsRead: 17 });
  });

  it('tells Admin and Finance AP about the failure (INTEGRATION §2.4)', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'EH_GL_SEGMENT_VALUES',
      'SEGMENT,VALUE,DESCRIPTION,ENABLED_FLAG,START_DATE,END_DATE\n',
    );
    const run = await jobs.run('sync-coa');
    const mail = await data.read((r) => r.notifications.listRecent());
    expect(mail.map((m) => m.templateCode)).toEqual(['SYNC_FAILED', 'SYNC_FAILED']);
    const recipients = await data.read(async (r) =>
      Promise.all(mail.map(async (m) => (await r.employees.get(m.recipientId))?.personNumber)),
    );
    expect(recipients.sort()).toEqual(['1007', '1009']); // Finance AP + System admin
    expect(mail[0]?.payload).toMatchObject({ jobName: 'sync-coa', runId: run.runId });
  });
});

describe('contract and transport failures', () => {
  it('rejects a row that breaks the CSV contract, with its line number', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'EH_PAY_QUICK_PAYS',
      fixture('EH_PAY_QUICK_PAYS.csv').replace('1500.00', '1500.005'),
    );
    const run = await jobs.run('sync-trips-quickpays');
    expect(run.status).toBe('ERROR');
    expect(run.errorText).toMatch(/line 2 PAY_VALUE/);
    expect(await data.read((r) => r.quickPays.count())).toBe(4);
  });

  it('retries 5xx and succeeds, logging the retries', async () => {
    const { data, fusion, jobs } = setup();
    fusion.failNext('EH_GL_SEGMENT_VALUES', 503, 2);
    expect((await jobs.run('sync-coa')).status).toBe('OK');
    expect((await data.read((r) => r.integrationLog.latest('INT-04')))?.retries).toBe(2);
  });

  it('never retries a 400 and fails the job', async () => {
    const { data, fusion, jobs } = setup();
    fusion.failNext('EH_GL_SEGMENT_VALUES', 400, 5);
    const run = await jobs.run('sync-coa');
    expect(run.status).toBe('ERROR');
    expect(await data.read((r) => r.integrationLog.latest('INT-04'))).toMatchObject({
      status: 'ERROR',
      httpStatus: 400,
      retries: 0,
    });
    expect(fusion.calls.filter((c) => c.target === 'EH_GL_SEGMENT_VALUES')).toHaveLength(1);
  });

  it('gives up after 3 retries on network errors', async () => {
    const { data, fusion, jobs } = setup();
    fusion.failNext('currencyRates', null, 10);
    expect((await jobs.run('sync-rates')).status).toBe('ERROR');
    expect((await data.read((r) => r.integrationLog.latest('INT-06')))?.retries).toBe(3);
  });
});

describe('runner (TRD §7)', () => {
  it('skips a run while the previous one is still running', async () => {
    const t = testClock();
    const { data, jobs } = setup(new MemoryDataLayer(), t.clock);
    await data.withTransaction((r) =>
      r.jobRuns.insert({
        jobName: 'sync-coa',
        startedAt: t.clock().toISOString(),
        endedAt: null,
        status: 'RUNNING',
        rowsRead: null,
        rowsChanged: null,
        errorText: null,
      }),
    );
    expect((await jobs.run('sync-coa')).status).toBe('SKIPPED');
    t.advance(2 * 60 * 60 * 1000 + 1000); // stale after 2 h
    expect((await jobs.run('sync-coa')).status).toBe('OK');
  });

  it('refuses an unknown job', async () => {
    const { jobs } = setup();
    await expect(jobs.run('sync-everything')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('sync-trips-quickpays (INT-05a/05b)', () => {
  it('marks a trip withdrawn when it leaves the extract inside the window', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'EH_HCM_BUSINESS_TRIPS',
      fixture('EH_HCM_BUSINESS_TRIPS.csv')
        .split('\n')
        .filter((l) => !l.startsWith('300000030001,'))
        .join('\n'),
    );
    expect((await jobs.run('sync-trips-quickpays')).status).toBe('OK');
    expect((await data.read((r) => r.businessTrips.get(300000030001)))?.approvalStatus).toBe(
      'WITHDRAWN',
    );
    expect((await data.read((r) => r.businessTrips.get(300000030002)))?.approvalStatus).toBe(
      'APPROVED',
    );
  });

  it('never updates a Quick Pay already sent to Payables', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'EH_PAY_QUICK_PAYS',
      fixture('EH_PAY_QUICK_PAYS.csv').replace('2400.00', '9999.00').replace('1500.00', '1600.00'),
    );
    expect((await jobs.run('sync-trips-quickpays')).status).toBe('OK');
    const invoiced = await data.read((r) => r.quickPays.getByFusionKey(300000040003, 300000041003));
    const open = await data.read((r) => r.quickPays.getByFusionKey(300000040001, 300000041001));
    expect(invoiced?.amountSar).toBe(240000);
    expect(open?.amountSar).toBe(160000);
  });
});

describe('trip destination from the business leave request (D-46)', () => {
  const setField = (data: MemoryDataLayer, value: string) =>
    data.withTransaction((r) =>
      r.systemOptions.update(
        { optionKey: 'TRIP_DESTINATION_FIELD', businessUnit: '*' },
        { optionValue: value },
        { actorId: null },
      ),
    );

  it('builds "city, country" from the leave request fields (default ATTRIBUTE3,ATTRIBUTE2)', async () => {
    const { data, jobs } = await seeded();
    expect((await jobs.run('sync-trips-quickpays')).status).toBe('OK');
    const trip = (id: number) => data.read((r) => r.businessTrips.get(id));
    expect((await trip(300000030001))?.destination).toBe('Dubai, United Arab Emirates');
    expect((await trip(300000030003))?.destination).toBe('Saudi Arabia'); // no city
  });

  it('reads the destination from the field(s) named by TRIP_DESTINATION_FIELD', async () => {
    const { data, jobs } = await seeded();
    await setField(data, 'attribute1'); // case-insensitive
    expect((await jobs.run('sync-trips-quickpays')).status).toBe('OK');
    expect((await data.read((r) => r.businessTrips.get(300000030001)))?.destination).toBe('GCC');
  });

  it('fails loudly when the report has no such field', async () => {
    const { data, jobs } = await seeded();
    await setField(data, 'ATTRIBUTE29');
    const run = await jobs.run('sync-trips-quickpays');
    expect(run.status).toBe('ERROR');
    expect(run.errorText).toMatch(/TRIP_DESTINATION_FIELD is ATTRIBUTE29/);
    expect((await data.read((r) => r.businessTrips.get(300000030001)))?.destination).toBe(
      'Dubai, United Arab Emirates',
    );
  });
});

describe('sync-rates (INT-06)', () => {
  it('keeps only the configured rate type and never deletes rates', async () => {
    const { data, fusion, jobs } = await seeded();
    fusion.override(
      'currencyRates',
      JSON.stringify({
        items: [
          {
            FromCurrency: 'USD',
            ToCurrency: 'SAR',
            UserConversionType: 'Corporate',
            ConversionDate: '2026-10-18',
            ConversionRate: 3.7501,
          },
          {
            FromCurrency: 'USD',
            ToCurrency: 'SAR',
            UserConversionType: 'Spot',
            ConversionDate: '2026-10-18',
            ConversionRate: 3.76,
          },
        ],
      }),
    );
    expect(await jobs.run('sync-rates')).toMatchObject({
      status: 'OK',
      rowsRead: 1,
      rowsChanged: 1,
    });
    expect(await data.read((r) => r.rates.count())).toBe(10);
    expect(
      (await data.read((r) => r.rates.findLatest('USD', 'Corporate', '2026-10-18')))?.rate,
    ).toBe('3.75010000');
  });
});
