import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { loadOpenApiSpec } from '../src/routes/docs.routes.js';

describe('API documentation', () => {
  const app = createApp();

  it('is a valid OpenAPI 3.1 specification', async () => {
    const spec = loadOpenApiSpec();

    assert.match(spec.openapi, /^3\.1\./);
    await SwaggerParser.validate(structuredClone(spec));
  });

  it('serves the specification at /api/openapi.json', async () => {
    const res = await request(app).get('/api/openapi.json').expect(200);

    assert.deepEqual(res.body, loadOpenApiSpec());
  });

  it('serves Swagger UI at /api/docs', async () => {
    const res = await request(app).get('/api/docs/').expect(200);

    assert.match(res.text, /swagger-ui/i);
  });

  it('is not mounted when disabled', async () => {
    const disabledApp = createApp({ ...config, apiDocs: { enabled: false } });

    await request(disabledApp).get('/api/docs/').expect(404);
    await request(disabledApp).get('/api/openapi.json').expect(404);
  });
});
