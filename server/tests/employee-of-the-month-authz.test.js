import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmployeeOfTheMonthController } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.controller.js';
import { createEmployeeOfTheMonthService } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.service.js';

function createService({ creatorId = 7 } = {}) {
  const repository = {
    get: async () => ({
      HEADER_ID: 42,
      DEPT_TYPE: 'Production',
      CREATED_BY: creatorId,
    }),
    getLines: async () => [],
  };

  return createEmployeeOfTheMonthService({
    repository,
    withConnection: async (_pool, callback) => callback({}),
  });
}

test('Employee of the Month GET allows a user with VIEW permission to read another creator nomination', async () => {
  const service = createService({ creatorId: 7 });
  const result = await service.get({ userId: 8 }, '42');
  assert.equal(result.headerId, 42);
});

test('Employee of the Month GET allows the nomination creator', async () => {
  const service = createService({ creatorId: 7 });

  const result = await service.get({ userId: 7 }, '42');

  assert.equal(result.headerId, 42);
});

test('Employee of the Month dashboard spotlight returns the latest approved nomination', async () => {
  const service = createEmployeeOfTheMonthService({
    repository: {
      latestApproved: async () => ({
        HEADER_ID: 42,
        DEPT_TYPE: 'Production',
        EMPLOYEE_NUMBER: '1001',
        EMPLOYEE_NAME: 'Recognized Employee',
        STATUS: 'APPROVED',
      }),
      getLines: async () => [],
    },
    withConnection: async (_pool, callback) => callback({}),
  });

  const result = await service.spotlight();

  assert.equal(result.headerId, 42);
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.employeeName, 'Recognized Employee');
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
