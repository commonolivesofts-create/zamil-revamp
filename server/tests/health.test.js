import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';

const app = createApp();

describe('GET /health/live', () => {
  it('returns the standard success envelope', async () => {
    const res = await request(app).get('/health/live').expect('Content-Type', /json/).expect(200);

    assert.deepEqual(res.body.data, { status: 'UP' });
    assert.equal(res.body.success, true);
    assert.equal(res.body.meta.requestId, res.headers['x-request-id']);
  });

  it('generates a UUID request ID when none is supplied', async () => {
    const res = await request(app).get('/health/live');

    assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });

  it('reuses a valid incoming request ID', async () => {
    const res = await request(app).get('/health/live').set('X-Request-Id', 'gateway-req-12345');

    assert.equal(res.headers['x-request-id'], 'gateway-req-12345');
    assert.equal(res.body.meta.requestId, 'gateway-req-12345');
  });

  it('replaces an unsafe incoming request ID', async () => {
    const res = await request(app).get('/health/live').set('X-Request-Id', 'bad id<script>');

    assert.notEqual(res.headers['x-request-id'], 'bad id<script>');
    assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  });

  it('applies security headers and hides the framework', async () => {
    const res = await request(app).get('/health/live');

    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });
});

describe('GET /health/ready', () => {
  const readyApp = (checkReadiness, cacheMs = 5000) =>
    createApp(
      { ...config, health: { ...config.health, readyCacheMs: cacheMs } },
      { checkReadiness },
    );

  it('returns 200 when both database pools are available', async () => {
    const app = readyApp(async () => ({ LOW: true, HIGH: true }));

    const res = await request(app).get('/health/ready').expect(200);

    assert.deepEqual(res.body.data, { status: 'READY', database: { LOW: 'UP', HIGH: 'UP' } });
    assert.equal(res.body.meta.requestId, res.headers['x-request-id']);
  });

  it('returns 503 naming only the unavailable pool', async () => {
    const app = readyApp(async () => ({ LOW: true, HIGH: false }));

    const res = await request(app).get('/health/ready').expect(503);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'SERVICE_UNAVAILABLE');
    assert.deepEqual(res.body.error.details, [
      { field: 'database.HIGH', message: 'Database pool is unavailable' },
    ]);
  });

  it('shares one in-flight check and reuses the result within the cache window', async () => {
    const checkReadiness = mock.fn(async () => ({ LOW: true, HIGH: true }));
    const app = readyApp(checkReadiness);

    await Promise.all(Array.from({ length: 5 }, () => request(app).get('/health/ready')));
    await request(app).get('/health/ready').expect(200);

    assert.equal(checkReadiness.mock.callCount(), 1);
  });

  it('re-checks once the cache window has passed', async () => {
    const checkReadiness = mock.fn(async () => ({ LOW: true, HIGH: true }));
    const app = readyApp(checkReadiness, 0);

    await request(app).get('/health/ready');
    await request(app).get('/health/ready');

    assert.equal(checkReadiness.mock.callCount(), 2);
  });

  it('keeps liveness independent of the database', async () => {
    const checkReadiness = mock.fn(async () => ({ LOW: false, HIGH: false }));

    await request(readyApp(checkReadiness)).get('/health/live').expect(200);
    assert.equal(checkReadiness.mock.callCount(), 0);
  });
});
