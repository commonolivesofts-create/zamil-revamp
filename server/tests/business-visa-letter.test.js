// Business Visa Letter (legacy Business_visa_letter): the option lists, the
// employee search and the list filters. Mocked: no Oracle.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createVisitingVisaService } from '../src/modules/hr/business-visa-letters/visitingVisa.service.js';
import { listQuery } from '../src/modules/hr/business-visa-letters/visitingVisa.validation.js';

const run = (_pool, work) => work({});

function service(repository = {}) {
  return createVisitingVisaService({
    repository: {
      employees: async (_c, term) => [{ value: term ?? null }],
      ...repository,
    },
    withConnection: run,
    withTransaction: run,
  });
}

describe('Business visa letter options', () => {
  it('serves the full legacy embassy list and the request-for labels', () => {
    const { embassies, request_for, divisions } = service().options();

    assert.ok(embassies.length > 70);
    assert.deepEqual(
      embassies.find((item) => item.value === 'Indian'),
      { value: 'Indian', label: 'Indian', ar: 'سفارة الهند' },
    );
    assert.deepEqual(
      request_for.map((item) => item.value),
      ['Business Single', 'Business Multiple'],
    );
    assert.equal(divisions.length, 2);
  });
});

describe('Business visa letter employee search', () => {
  it('passes the typed term to the repository', async () => {
    const seen = [];
    const letters = service({
      employees: async (_c, term) => {
        seen.push(term);
        return [];
      },
    });

    await letters.employees({ q: '100' });
    await letters.employees({});

    assert.deepEqual(seen, ['100', undefined]);
  });
});

describe('Business visa letter list filters', () => {
  it('accepts an empty or null status', () => {
    assert.equal(listQuery.validate({ status: '' }).error, undefined);
    assert.equal(listQuery.validate({ status: null }).error, undefined);
    assert.equal(listQuery.validate({ status: 'DRAFT' }).error, undefined);
    assert.ok(listQuery.validate({ status: 'UNKNOWN' }).error);
  });
});
