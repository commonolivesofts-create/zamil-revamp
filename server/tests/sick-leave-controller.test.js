import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../src/shared/errors/AppError.js';
import { createSickLeaveController } from '../src/modules/hr/sick-leave/sickLeave.controller.js';

function response() {
  return {
    req: { id: 'test-request-id' },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('Sick Leave creation returns 201 with the standard success envelope', async () => {
  const controller = createSickLeaveController({
    create: async () => ({ headerId: 12 }),
  });
  const res = response();

  await controller.create({ auth: { userId: 'test-user' }, body: {}, files: [] }, res, assert.fail);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    data: { headerId: 12 },
    meta: { requestId: 'test-request-id' },
  });
});

test('Sick Leave POST actions return 200 with the standard success envelope', async () => {
  const controller = createSickLeaveController({
    upload: async () => ({ attachments: [] }),
  });
  const res = response();

  await controller.upload(
    { auth: { userId: 'test-user' }, params: { headerId: '12' }, files: [] },
    res,
    assert.fail,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.meta, { requestId: 'test-request-id' });
});

test('Sick Leave controller forwards service errors to shared middleware', async () => {
  const expected = new AppError(409, 'STATE_CONFLICT', 'Request cannot be modified');
  const controller = createSickLeaveController({
    get: async () => {
      throw expected;
    },
  });
  let actual;

  await controller.get(
    { auth: { userId: 'test-user' }, params: { headerId: '12' } },
    response(),
    (error) => {
      actual = error;
    },
  );

  assert.equal(actual, expected);
});
