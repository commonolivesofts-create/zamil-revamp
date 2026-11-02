import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import request from 'supertest';
import { createTouristVisaRoutes } from '../src/modules/hr/tourist-visa-letters/tourist-visa-letter.routes.js';

test('Tourist Visa routes require the matching resource action and CSRF on writes', async () => {
  const authorizationChecks = [];
  let auditRecords = 0;
  const authenticate = (req, _res, next) => {
    req.auth = {
      userId: 'test-user',
      sessionId: 'test-session',
      csrfToken: 'test-csrf-token',
    };
    next();
  };
  const authorize = (resource, action) => (req, res) => {
    authorizationChecks.push({ method: req.method, resource, action });
    res.status(req.auth ? 403 : 401).json({ resource, action });
  };
  const app = express();

  app.use(
    createTouristVisaRoutes({
      service: {},
      authenticate,
      authorize,
      auditService: {
        recordIndependently: async () => {
          auditRecords += 1;
        },
      },
    }),
  );
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({ code: error.code });
  });

  const uuid = 'a8098c1a-f86e-41da-bd1a-00112444be1e';
  const routes = [
    ['get', '/'],
    ['get', '/lookups/countries'],
    ['get', '/lookups/countries/Saudi%20Arabia/arabic'],
    ['get', '/lookups/employees?q=employee'],
    ['get', '/lookups/employees/1001'],
    ['get', '/lookups/approvers'],
    ['post', '/'],
    ['get', `/${uuid}/print`],
    ['get', `/${uuid}`],
    ['put', `/${uuid}`],
    ['delete', `/${uuid}`],
  ];

  for (const [method, path] of routes) {
    const call = request(app)[method](path);
    if (method !== 'get') {
      call.set('X-CSRF-Token', 'test-csrf-token');
    }

    await call.expect(403);
  }

  assert.deepEqual(
    authorizationChecks.map(({ resource, action }) => [resource, action]),
    routes.map(([method]) => [
      'HR.TOURIST_VISA_LETTERS',
      method === 'post'
        ? 'CREATE'
        : method === 'put'
          ? 'UPDATE'
          : method === 'delete'
            ? 'DELETE'
            : 'VIEW',
    ]),
  );

  authorizationChecks.length = 0;
  await request(app).post('/').expect(403);
  assert.equal(authorizationChecks.length, 0, 'authorization is not reached without valid CSRF');
  assert.equal(
    auditRecords,
    1,
    'rejected authenticated writes are audited by the shared CSRF middleware',
  );
});
