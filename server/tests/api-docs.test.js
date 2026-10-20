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

  it('documents every authentication route with its security requirement', () => {
    const { paths, components } = loadOpenApiSpec();
    const expected = [
      ['get', '/api/v1/auth/password/policy', false],
      ['post', '/api/v1/auth/login', false],
      ['get', '/api/v1/auth/me', true],
      ['get', '/api/v1/auth/csrf', true],
      ['post', '/api/v1/auth/logout', true],
      ['post', '/api/v1/auth/mfa/enrollment', true],
      ['post', '/api/v1/auth/mfa/enrollment/confirm', true],
      ['post', '/api/v1/auth/mfa/verify', true],
      ['post', '/api/v1/auth/mfa/replacement', true],
      ['post', '/api/v1/auth/mfa/replacement/confirm', true],
    ];

    for (const [method, path, authenticated] of expected) {
      const operation = paths[path]?.[method];
      assert.ok(operation, `${method.toUpperCase()} ${path} is documented`);
      assert.equal(Boolean(operation.security?.length), authenticated, `${path} security`);
    }
    assert.equal(components.securitySchemes.sessionCookie.name, config.auth.cookie.name);
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
