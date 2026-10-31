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
    const { paths, components, tags } = loadOpenApiSpec();
    const expected = [
      ['get', '/api/v1/auth/password/policy', false],
      ['post', '/api/v1/auth/recovery/request', false],
      ['post', '/api/v1/auth/password/setup', false],
      ['post', '/api/v1/auth/password/reset', false],
      ['post', '/api/v1/auth/password/change', true],
      ['post', '/api/v1/auth/mfa/recovery/start', false],
      ['post', '/api/v1/auth/mfa/recovery/confirm', false],
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
    assert.equal(tags[0].name, 'Authentication', 'Authentication appears first in Swagger UI');
    assert.equal(components.securitySchemes.sessionCookie.name, config.auth.cookie.name);
  });

  it('documents every user-administration route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/users';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/candidates'],
      ['get', '/{userId}'],
      ['post', '/{userId}/activate'],
      ['post', '/{userId}/disable'],
      ['post', '/{userId}/password-setup'],
      ['post', '/{userId}/recovery'],
      ['delete', '/{userId}/sessions'],
      ['delete', '/{userId}/sessions/{sessionId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every access-control route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/access-control';
    const expected = [
      ['get', '/me/permissions'],
      ['get', '/roles'],
      ['post', '/roles'],
      ['patch', '/roles/{roleId}'],
      ['post', '/roles/{roleId}/activate'],
      ['post', '/roles/{roleId}/deactivate'],
      ['get', '/catalog'],
      ['post', '/modules'],
      ['patch', '/modules/{moduleId}'],
      ['post', '/modules/{moduleId}/resources'],
      ['patch', '/resources/{resourceId}'],
      ['post', '/resources/{resourceId}/permissions'],
      ['patch', '/permissions/{permissionId}'],
      ['get', '/roles/{roleId}/permissions'],
      ['put', '/roles/{roleId}/permissions/{permissionId}'],
      ['delete', '/roles/{roleId}/permissions/{permissionId}'],
      ['get', '/users/{userId}/roles'],
      ['put', '/users/{userId}/roles/{roleId}'],
      ['delete', '/users/{userId}/roles/{roleId}'],
      ['get', '/users/{userId}/effective-permissions'],
      ['get', '/users/{userId}/overrides'],
      ['put', '/users/{userId}/overrides/{permissionId}'],
      ['delete', '/users/{userId}/overrides/{permissionId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path.startsWith(base))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => [method, path.slice(base.length)]),
      );
    assert.deepEqual(
      documented.map((x) => x.join(' ')).sort(),
      expected.map((x) => x.join(' ')).sort(),
    );

    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every interview-assessment route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/interview-assessments';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/nationalities'],
      ['get', '/lookups/requisitions'],
      ['get', '/lookups/employees'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every probation-evaluation route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/probation-evaluations';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/form-types'],
      ['get', '/lookups/employees'],
      ['get', '/lookups/requestor'],
      ['get', '/lookups/employee-details'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every orientation-training route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/orientation-trainings';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/flag'],
      ['get', '/lookups/employees'],
      ['get', '/lookups/managers'],
      ['get', '/lookups/employee-details'],
      ['get', '/lookups/skills'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
      ['delete', '/{headerId}/lines/{lineId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every contractor-employee route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/contractor-employees';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/{name}'],
      ['get', '/{empId}'],
      ['put', '/{empId}'],
      ['delete', '/{empId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
    assert.ok(
      paths['/api/v1/hr/contractors/{conNumber}']?.get,
      'contractor detail lookup is documented',
    );
  });

  it('documents every employment-offer route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/employment-offers';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/candidates'],
      ['get', '/lookups/titles'],
      ['get', '/lookups/allowances'],
      ['get', '/lookups/business-units'],
      ['get', '/lookups/number-to-arabic'],
      ['get', '/lookups/hijri-date'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every requisition route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/requisitions';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/job-titles'],
      ['get', '/lookups/requestor'],
      ['get', '/lookups/departments'],
      ['get', '/lookups/replacement-for'],
      ['get', '/lookups/budget'],
      ['get', '/lookups/filter-options'],
      ['get', '/{requisitionId}'],
      ['put', '/{requisitionId}'],
      ['delete', '/{requisitionId}'],
      ['post', '/{requisitionId}/attachments'],
      ['delete', '/{requisitionId}/attachments/{attachmentId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((x) => x.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every transfer-request route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/transfer-requests';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/employees/{name}'],
      ['get', '/lookups/jobs'],
      ['get', '/lookups/sections'],
      ['get', '/lookups/departments'],
      ['get', '/lookups/directors'],
      ['get', '/lookups/blood-types'],
      ['get', '/lookups/requestor'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every performance-appraisal route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/performance-appraisals';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/employees/{name}'],
      ['get', '/lookups/grade-stats'],
      ['get', '/lookups/requestor'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
      ['put', '/{headerId}/employee-remarks'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every personal-status route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/personnel-record-changes';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/positions'],
      ['get', '/lookups/employees/{empNo}'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${path} security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every Employee of the Month route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/hr/employee-of-the-month';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/requestor'],
      ['get', '/lookups/criteria'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${method} ${path} session security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every Ideas route with session security and CSRF on changes', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/ideas';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/employees/{empNo}'],
      ['get', '/lookups/divisions'],
      ['get', '/lookups/categories'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
      ['post', '/{headerId}/feasibility'],
      ['post', '/{headerId}/attachments'],
      ['delete', '/{headerId}/attachments/{attachmentId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${method} ${path} session security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }
  });

  it('documents every Sick Leave route with session security and CSRF on changes', () => {
    const { paths, components } = loadOpenApiSpec();
    const base = '/api/v1/hr/sick-leave';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/employees/{empNumber}'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
      ['post', '/{headerId}/attachments'],
      ['delete', '/{headerId}/attachments/{attachmentId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method} ${path.slice(base.length)}`),
      );
    assert.deepEqual(documented.sort(), expected.map((entry) => entry.join(' ')).sort());
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`][method];
      assert.ok(operation.security?.length, `${method} ${path} session security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF parameter`);
    }

    assert.ok(components.schemas.SickLeaveCreateMultipart.properties.files);
    assert.equal(components.schemas.SickLeaveCreateMultipart.properties.files.minItems, 1);
    assert.ok(components.schemas.SickLeaveWrite.properties.fromDate);
    assert.ok(components.schemas.SickLeaveDetail.allOf[1].properties);
  });

  it('documents all Employee Clearance routes, permissions, schemas, and CSRF requirements', () => {
    const { paths, components, tags } = loadOpenApiSpec();
    const base = '/api/v1/hr/employee-clearance';
    const expected = [
      ['get', ''],
      ['post', ''],
      ['get', '/lookups/employees'],
      ['get', '/lookups/employees/{empNo}'],
      ['get', '/lookups/approvers'],
      ['get', '/lookups/computer-destinations'],
      ['get', '/{headerId}'],
      ['put', '/{headerId}'],
      ['delete', '/{headerId}'],
    ];
    const documented = Object.entries(paths)
      .filter(([path]) => path === base || path.startsWith(`${base}/`))
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method} ${path.slice(base.length)}`),
      );

    assert.deepEqual(
      documented.sort(),
      expected.map(([method, path]) => `${method} ${path}`).sort(),
    );

    for (const [method, suffix] of expected) {
      const operation = paths[`${base}${suffix}`][method];
      assert.ok(operation.security?.length, `${method.toUpperCase()} ${suffix} session security`);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => parameter.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method.toUpperCase()} ${suffix} CSRF`);
    }

    assert.match(tags.find(({ name }) => name === 'HR Employee Clearance').description, /VIEW_ALL/);
    assert.match(paths[base].get.description, /EMPLOYEE_CLEARANCE\.EMPLOYEE_CLEARANCE:VIEW/);
    assert.match(paths[base].post.description, /EMPLOYEE_CLEARANCE\.EMPLOYEE_CLEARANCE:CREATE/);
    assert.match(
      paths[`${base}/{headerId}`].put.description,
      /EMPLOYEE_CLEARANCE\.EMPLOYEE_CLEARANCE:UPDATE/,
    );
    assert.match(
      paths[`${base}/{headerId}`].delete.description,
      /EMPLOYEE_CLEARANCE\.EMPLOYEE_CLEARANCE:DELETE/,
    );

    assert.equal(
      paths[base].post.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/EmployeeClearanceWrite',
    );
    assert.equal(
      paths[`${base}/{headerId}`].put.requestBody.content['application/json'].schema.$ref,
      '#/components/schemas/EmployeeClearanceWrite',
    );
    assert.deepEqual(components.schemas.EmployeeClearanceWrite.properties.itMatrix.items, {
      $ref: '#/components/schemas/EmployeeClearanceITMatrixLineWrite',
    });
    assert.equal(components.schemas.EmployeeClearanceWrite.properties.itMatrix.minItems, 5);
    assert.equal(components.schemas.EmployeeClearanceWrite.properties.itMatrix.maxItems, 5);
    assert.ok(components.schemas.EmployeeClearanceDetail.properties.sections);
    assert.ok(components.schemas.EmployeeClearanceListResponse.properties.data);
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

  it('mounts the Employee Clearance, Survey Report, and Project Charter routers', async () => {
    const responses = await Promise.all([
      request(app).get('/api/v1/hr/employee-clearance'),
      request(app).get('/api/v1/survey/reports/questions'),
      request(app).get('/api/v1/projects/charters'),
    ]);

    for (const response of responses) {
      assert.equal(response.status, 401);
    }
  });
});
