import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmployeeOfTheMonthController } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.controller.js';
import { createEmployeeOfTheMonthService } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.service.js';

function createService({ creatorId = 7, isHrUser = false } = {}) {
  const repository = {
    get: async () => ({
      HEADER_ID: 42,
      DEPT_TYPE: 'Production',
      CREATED_BY: creatorId,
    }),
    getLines: async () => [],
    isHrUser: async () => isHrUser,
  };

  return createEmployeeOfTheMonthService({
    repository,
    withConnection: async (_pool, callback) => callback({}),
  });
}

test('Employee of the Month GET denies a non-HR user access to another creator’s nomination', async () => {
  const service = createService({ creatorId: 7 });

  await assert.rejects(
    service.get({ userId: 8 }, '42'),
    (error) => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND',
  );
});

test('Employee of the Month GET allows the nomination creator', async () => {
  const service = createService({ creatorId: 7 });

  const result = await service.get({ userId: 7 }, '42');

  assert.equal(result.headerId, 42);
});

test('Employee of the Month GET allows HR to read another creator’s nomination', async () => {
  const service = createService({ creatorId: 7, isHrUser: true });

  const result = await service.get({ userId: 8 }, '42');

  assert.equal(result.headerId, 42);
});

test('Employee of the Month UPDATE denies a non-HR user access to another creator’s nomination', async () => {
  let updated = false;
  const service = createEmployeeOfTheMonthService({
    repository: {
      get: async () => ({
        HEADER_ID: 42,
        CREATED_BY: 7,
        STATUS: 'DRAFT',
      }),
      isHrUser: async () => false,
      update: async () => {
        updated = true;
      },
    },
    withTransaction: async (_pool, callback) => callback({}),
  });

  await assert.rejects(
    service.update({ userId: 8 }, '42', {}),
    (error) => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND',
  );
  assert.equal(updated, false);
});

test('Employee of the Month DELETE denies a non-HR user access to another creator’s nomination', async () => {
  let deleted = false;
  const service = createEmployeeOfTheMonthService({
    repository: {
      get: async () => ({
        HEADER_ID: 42,
        CREATED_BY: 7,
        STATUS: 'DRAFT',
      }),
      isHrUser: async () => false,
      remove: async () => {
        deleted = true;
      },
    },
    withTransaction: async (_pool, callback) => callback({}),
  });

  await assert.rejects(
    service.remove({ userId: 8 }, '42'),
    (error) => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND',
  );
  assert.equal(deleted, false);
});

test('Employee of the Month controller passes the authenticated actor to GET and DELETE', async () => {
  const actor = { userId: 8 };
  const received = {};
  const controller = createEmployeeOfTheMonthController({
    service: {
      get: async (...args) => {
        received.get = args;
        return { headerId: 42 };
      },
      remove: async (...args) => {
        received.remove = args;
        return { headerId: 42 };
      },
    },
  });
  const res = {
    req: { id: 'test-request-id' },
    status() {
      return this;
    },
    json() {},
  };

  await controller.get({ auth: actor, params: { headerId: '42' } }, res);
  await controller.remove({ auth: actor, params: { headerId: '42' } }, res);

  assert.deepEqual(received, {
    get: [actor, '42'],
    remove: [actor, '42'],
  });
});
