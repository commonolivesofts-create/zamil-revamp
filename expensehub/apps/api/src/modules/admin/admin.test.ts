// API §10 admin: integration monitor (Adm, Fin), log (Adm), run now (Adm).
import {
  integrationLogListSchema,
  integrationsResponseSchema,
  jobRunResponseSchema,
} from '@expensehub/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { H, seededApp, signedIn } from '../../test-utils';

describe('integration monitor', () => {
  it('shows jobs and interfaces to Finance, read-only', async () => {
    const { app } = await seededApp();
    await request(app).get('/api/v1/admin/integrations').expect(401);
    await (await signedIn(app, '1011')).get('/api/v1/admin/integrations').expect(403);

    const accountant = await signedIn(app, '1005');
    const body = integrationsResponseSchema.parse(
      (await accountant.get('/api/v1/admin/integrations').expect(200)).body,
    );
    expect(body).toMatchObject({ fusionMode: 'mock', canRun: false });
    expect(body.jobs.map((j) => [j.jobName, j.dailyAt])).toEqual([
      ['sync-hcm', '01:00'],
      ['sync-coa', '01:30'],
      ['sync-trips-quickpays', '02:00'],
      ['sync-rates', '06:00'],
      ['send-invoices', 'hourly 07:00–20:00'],
      ['poll-invoice-status', 'hourly 07:00–20:00'],
    ]);
    expect(body.interfaces).toHaveLength(10); // D-45: no INT-05c
    expect(body.interfaces.find((i) => i.interface === 'INT-08')).toMatchObject({
      direction: 'OUT',
      jobName: 'send-invoices',
      milestone: null,
    });

    await accountant.post('/api/v1/admin/jobs/sync-coa/run').set(H).expect(403);
    await accountant.get('/api/v1/admin/integrations/log').expect(403);
  });

  it('lets the admin run a sync now and read its log', async () => {
    const { app, fusion } = await seededApp();
    const admin = await signedIn(app, '1009');
    const run = jobRunResponseSchema.parse(
      (await admin.post('/api/v1/admin/jobs/sync-hcm/run').set(H).expect(200)).body,
    ).run;
    expect(run).toMatchObject({ jobName: 'sync-hcm', status: 'OK', rowsRead: 17 });

    fusion.failNext('EH_GL_SEGMENT_VALUES', 500, 9);
    const failed = jobRunResponseSchema.parse(
      (await admin.post('/api/v1/admin/jobs/sync-coa/run').set(H).expect(200)).body,
    ).run;
    expect(failed.status).toBe('ERROR');

    const monitor = integrationsResponseSchema.parse(
      (await admin.get('/api/v1/admin/integrations')).body,
    );
    expect(monitor.canRun).toBe(true);
    expect(monitor.jobs.find((j) => j.jobName === 'sync-hcm')?.lastRun?.status).toBe('OK');
    expect(monitor.interfaces.find((i) => i.interface === 'INT-03')?.lastStatus).toBe('OK'); // same report as INT-01
    expect(monitor.interfaces.find((i) => i.interface === 'INT-04')).toMatchObject({
      lastStatus: 'ERROR',
      lastError: 'Mock HTTP 500 from Fusion',
    });

    const log = integrationLogListSchema.parse(
      (await admin.get('/api/v1/admin/integrations/log?status=ERROR')).body,
    );
    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ interface: 'INT-04', retries: 3, httpStatus: 500 });

    await admin.post('/api/v1/admin/jobs/sync-everything/run').set(H).expect(400);
  });
});
