import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';
import { AppError } from '../src/shared/errors/AppError.js';

function assertErrorEnvelope(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
  assert.equal(res.body.meta.requestId, res.headers['x-request-id']);
}

describe('HTTP foundation', () => {
  const app = createApp();

  it('returns RESOURCE_NOT_FOUND for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    assertErrorEnvelope(res, 404, 'RESOURCE_NOT_FOUND');
  });

  it('returns MALFORMED_REQUEST for invalid JSON bodies', async () => {
    const res = await request(app)
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    assertErrorEnvelope(res, 400, 'MALFORMED_REQUEST');
  });

  it('returns PAYLOAD_TOO_LARGE when the body exceeds the configured limit', async () => {
    const limitedApp = createApp({ ...config, http: { ...config.http, bodyLimit: '1kb' } });

    const res = await request(limitedApp)
      .post('/health/live')
      .send({ value: 'x'.repeat(2048) });

    assertErrorEnvelope(res, 413, 'PAYLOAD_TOO_LARGE');
  });
});

describe('centralized error handler', () => {
  const app = express();
  app.use(requestId);
  app.get('/app-error', () => {
    throw new AppError(409, 'CONFLICT', 'Record was modified', [
      { field: 'version', message: 'Stale version' },
    ]);
  });
  app.get('/unexpected', async () => {
    throw new Error('ORA-01017: invalid username/password');
  });
  app.get('/items/:id', (req, res) => res.json({ id: req.params.id }));
  app.use(errorHandler);

  it('returns a safe 400 for client errors raised by Express', async () => {
    const res = await request(app).get('/items/%E0%A4%A');

    assertErrorEnvelope(res, 400, 'BAD_REQUEST');
    assert.doesNotMatch(JSON.stringify(res.body), /decode|%E0/i);
  });

  it('translates an AppError into its status, code and details', async () => {
    const res = await request(app).get('/app-error');

    assertErrorEnvelope(res, 409, 'CONFLICT');
    assert.deepEqual(res.body.error.details, [{ field: 'version', message: 'Stale version' }]);
  });

  it('hides internal details of unexpected (async) errors', async () => {
    const res = await request(app).get('/unexpected');

    assertErrorEnvelope(res, 500, 'INTERNAL_ERROR');
    assert.equal(res.body.error.message, 'An unexpected error occurred');
    assert.doesNotMatch(JSON.stringify(res.body), /ORA-|stack/);
  });
});
