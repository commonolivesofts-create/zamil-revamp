import assert from 'node:assert/strict';
import test from 'node:test';
import { createTouristVisaService } from '../src/modules/hr/tourist-visa-letters/tourist-visa-letter.service.js';

test('create and update require an authenticated actor before opening a transaction', async () => {
  let transactionCalls = 0;
  const service = createTouristVisaService({
    repository: {},
    withTransaction: async () => {
      transactionCalls += 1;
    },
  });

  for (const operation of [
    () => service.create({}, null),
    () => service.update('record-uuid', {}, null),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    });
  }

  assert.equal(transactionCalls, 0);
});
