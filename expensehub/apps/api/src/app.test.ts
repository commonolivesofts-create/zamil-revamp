import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, healthResponseSchema } from '@expensehub/shared';
import { AppError } from './lib/errors';
import { createLogger } from './lib/logger';
import { errorHandler, notFound } from './middleware/errors';
import { requireAppHeader } from './middleware/csrf';
import { testApp, testConfig } from './test-utils';

describe('GET /api/v1/health', () => {
  it('returns the health contract without auth', async () => {
    const res = await request(testApp()).get('/api/v1/health').expect(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body).toMatchObject({ status: 'ok', db: 'ok', dataMode: 'memory', fusionMode: 'mock' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reports degraded with 503 when the data store is down', async () => {
    const app = testApp({ checkDataStore: () => Promise.reject(new Error('down')) });
    const res = await request(app).get('/api/v1/health').expect(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'error' });
  });

  it('leaks no secrets', async () => {
    const res = await request(testApp()).get('/api/v1/health');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(testApp()).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('error handling', () => {
  it('returns the error envelope for unknown routes', async () => {
    const res = await request(testApp()).get('/api/v1/nope').expect(404);
    expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  /** Minimal app with the real middleware chain around one probe route. */
  function probeApp(route: express.RequestHandler) {
    const logger = createLogger(testConfig());
    const probe = express();
    probe.use((req, _res, next) => {
      (req as unknown as { log: typeof logger }).log = logger;
      next();
    });
    probe.use(express.json());
    probe.use(requireAppHeader);
    probe.post('/probe', route);
    probe.get('/probe', route);
    probe.use(notFound);
    probe.use(errorHandler);
    return probe;
  }

  it('maps AppError codes to HTTP status', async () => {
    const probe = probeApp(() => {
      throw new AppError('SOD_VIOLATION', 'You cannot approve your own claim');
    });
    const res = await request(probe).get('/probe').expect(403);
    expect(res.body).toEqual({
      error: { code: 'SOD_VIOLATION', message: 'You cannot approve your own claim' },
    });
  });

  it('hides unexpected errors behind INTERNAL', async () => {
    const probe = probeApp(() => {
      throw new Error('ORA-00942 table or view does not exist');
    });
    const res = await request(probe).get('/probe').expect(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('ORA-');
  });

  it('turns malformed JSON into VALIDATION', async () => {
    const probe = probeApp((_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(probe)
      .post('/probe')
      .set('X-Requested-With', 'ExpenseHub')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('CSRF header (TRD §5)', () => {
  it('rejects a mutating request without X-Requested-With', async () => {
    const res = await request(testApp()).post('/api/v1/health').send({}).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets a mutating request with the header through to routing', async () => {
    const res = await request(testApp())
      .post('/api/v1/health')
      .set('X-Requested-With', 'ExpenseHub')
      .send({})
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
