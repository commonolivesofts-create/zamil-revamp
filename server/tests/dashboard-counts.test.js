/*
 * Dashboard counts: the conditional-count statement builder, the TTL/LRU cache, the per-user
 * counts cache, every module repository's count SQL (scope and predicates match its list), and
 * one module's `POST /counts` through the real app (permission, CSRF, validation, scope,
 * caching and `fresh`). Oracle is replaced by connection and repository doubles.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installEmploymentOffers } from './helpers/employmentOfferFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { createApp } from '../src/app.js';
import {
  buildCountStatement,
  MAX_COUNT_QUERIES,
  prefixBinds,
} from '../src/database/conditionalCounts.js';
import { cachedCounts } from '../src/shared/cache/cachedCounts.js';
import { createTtlCache } from '../src/shared/cache/ttlCache.js';
import { countOffers } from '../src/modules/hr/employment-offers/employmentOffer.repository.js';
import { countAssessments } from '../src/modules/hr/interview-assessments/interviewAssessment.repository.js';
import { countEvaluations } from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';
import {
  countTrainings,
  TABLES,
} from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import { countRequisitions } from '../src/modules/hr/requisitions/requisition.repository.js';
import { countAppraisals } from '../src/modules/hr/performance-appraisals/performanceAppraisal.repository.js';
import { count as countNominations } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.repository.js';

// A connection double: records each statement and answers one row of counts.
const capture = (row = {}) => {
  const calls = [];
  return {
    calls,
    connection: {
      execute: async (sql, binds) => {
        calls.push({ sql, binds });
        return { rows: [row] };
      },
    },
  };
};

describe('conditional count statement', () => {
  it('renames each set’s binds without touching longer names', () => {
    const { sql, binds } = prefixBinds(
      'A = :date AND B = :dateFrom AND C = :date',
      { date: 'x', dateFrom: 'y' },
      'q3_',
    );
    assert.equal(sql, 'A = :q3_date AND B = :q3_dateFrom AND C = :q3_date');
    assert.deepEqual(binds, { q3_date: 'x', q3_dateFrom: 'y' });
    assert.throws(() => prefixBinds('A = :x', { 'x;--': 1 }, 'q0_'), /Unsupported bind name/);
  });

  it('builds one column per set over the shared scope, with distinct counting on request', () => {
    const { sql, binds } = buildCountStatement({
      with: 'WITH emp AS (SELECT 1 FROM DUAL)',
      from: 'FROM T H',
      where: ['H.CREATED_BY = :createdBy'],
      binds: { createdBy: 7 },
      distinct: 'H.ID',
      sets: [
        { conditions: [], binds: {} },
        {
          conditions: ['H.STATUS = :status', 'H.D >= :dateFrom'],
          binds: { status: 'A', dateFrom: 'd1' },
        },
        { conditions: ['H.STATUS = :status'], binds: { status: 'B' } },
      ],
    });
    assert.match(sql, /^WITH emp AS/);
    assert.match(sql, /COUNT\(DISTINCT CASE WHEN 1 = 1 THEN H\.ID END\) AS C0/);
    assert.match(
      sql,
      /COUNT\(DISTINCT CASE WHEN H\.STATUS = :q1_status AND H\.D >= :q1_dateFrom THEN H\.ID END\) AS C1/,
    );
    assert.match(sql, /CASE WHEN H\.STATUS = :q2_status THEN H\.ID END\) AS C2/);
    assert.match(sql, /WHERE H\.CREATED_BY = :createdBy/);
    assert.deepEqual(binds, {
      createdBy: 7,
      q1_status: 'A',
      q1_dateFrom: 'd1',
      q2_status: 'B',
    });
  });

  it('refuses an empty or oversized batch', () => {
    const set = { conditions: [], binds: {} };
    assert.throws(() => buildCountStatement({ from: 'FROM T', sets: [] }), /Between 1 and 60/);
    assert.throws(
      () => buildCountStatement({ from: 'FROM T', sets: Array(MAX_COUNT_QUERIES + 1).fill(set) }),
      /Between 1 and 60/,
    );
  });
});

describe('TTL cache', () => {
  it('expires entries and evicts the least recently used one at capacity', () => {
    let time = 0;
    const cache = createTtlCache({ ttlMs: 100, maxEntries: 2, now: () => time });
    cache.set('a', 1);
    cache.set('b', 2);
    assert.equal(cache.get('a'), 1, 'reading a makes b the least recently used');
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined, 'b evicted');
    assert.deepEqual([cache.get('a'), cache.get('c')], [1, 3]);
    time = 100;
    assert.equal(cache.get('a'), undefined, 'expired at its TTL');
    assert.equal(cache.size, 1);
  });

  it('stores nothing with a zero TTL and validates its options', () => {
    const cache = createTtlCache({ ttlMs: 0, maxEntries: 5 });
    cache.set('a', 1);
    assert.equal(cache.get('a'), undefined);
    assert.throws(() => createTtlCache({ ttlMs: -1, maxEntries: 1 }), /ttlMs/);
    assert.throws(() => createTtlCache({ ttlMs: 1, maxEntries: 0 }), /maxEntries/);
  });
});

describe('cached counts', () => {
  const cache = () => createTtlCache({ ttlMs: 60000, maxEntries: 100 });

  it('loads only missing sets, once each, and keys every value by module and user', async () => {
    const counts = cache();
    const loads = [];
    const load = async (queries) => {
      loads.push(queries);
      return queries.map((query) => Number(query.n));
    };
    const ask = (userId, queries, fresh) =>
      cachedCounts(counts, { module: 'offers', userId, queries, fresh }, load);

    assert.deepEqual(await ask(1, [{ n: '1' }, { n: '2' }, { n: '1' }]), [1, 2, 1]);
    assert.deepEqual(loads, [[{ n: '1' }, { n: '2' }]], 'a repeated set is loaded once');
    assert.deepEqual(await ask(1, [{ n: '2' }, { n: '3' }]), [2, 3]);
    assert.deepEqual(loads.at(-1), [{ n: '3' }], 'cached sets are not loaded again');
    await ask(2, [{ n: '2' }]);
    assert.deepEqual(loads.at(-1), [{ n: '2' }], 'another user never gets this user’s values');
    await ask(1, [{ n: '1' }], true);
    assert.deepEqual(loads.at(-1), [{ n: '1' }], 'fresh reads again');
    assert.equal(loads.length, 4);
  });

  it('treats key order as the same set and loads everything without a cache', async () => {
    const counts = cache();
    let calls = 0;
    const load = async (queries) => {
      calls += 1;
      return queries.map(() => 5);
    };
    await cachedCounts(counts, { module: 'm', userId: 1, queries: [{ a: 1, b: 2 }] }, load);
    await cachedCounts(counts, { module: 'm', userId: 1, queries: [{ b: 2, a: 1 }] }, load);
    assert.equal(calls, 1);
    assert.deepEqual(
      await cachedCounts(undefined, { module: 'm', userId: 1, queries: [{}, {}] }, load),
      [5, 5],
    );
  });
});

describe('repository count statements (same predicates and scope as each list)', () => {
  it('requisitions: the supervised-employee scope for non-HR users only', async () => {
    const scoped = capture({ C0: 4, C1: 1 });
    const result = await countRequisitions(scoped.connection, {
      queries: [{}, { requisitionStatus: 'Approved', ticketStatus: 'Open' }],
      scopeUserId: 42,
    });
    assert.deepEqual(result, [4, 1]);
    const [{ sql, binds }] = scoped.calls;
    assert.match(sql, /WITH emp \(FULL_NAME, USER_ID, SUPERVISOR_NAME\)/);
    assert.match(sql, /WHERE CREATED_BY IN \(SELECT USER_ID FROM emp\)/);
    assert.match(sql, /REQUISITION_STATUS = :q1_requisitionStatus/);
    assert.match(sql, /NVL\(ATTRIBUTE1, 'Open'\) = :q1_ticketStatus/);
    assert.deepEqual(binds, {
      scopeUserId: 42,
      q1_requisitionStatus: 'Approved',
      q1_ticketStatus: 'Open',
    });

    const hr = capture({ C0: 9 });
    await countRequisitions(hr.connection, { queries: [{}], scopeUserId: null });
    assert.doesNotMatch(hr.calls[0].sql, /WITH emp|CREATED_BY/);
    await assert.rejects(
      countRequisitions(hr.connection, { queries: [{ unknown: 'x' }], scopeUserId: null }),
      /Unsupported filter/,
    );
  });

  it('interviews: distinct headers over the evaluation join', async () => {
    const { connection, calls } = capture({ C0: 2 });
    await countAssessments(connection, {
      queries: [{ evaluationStatus: 'Passed' }],
      createdBy: 7,
    });
    assert.match(calls[0].sql, /COUNT\(DISTINCT CASE WHEN .*UPPER\(EVAL\.STATUS\)/s);
    assert.match(calls[0].sql, /THEN INV\.HEADER_ID END/);
    assert.match(calls[0].sql, /WHERE INV\.CREATED_BY = :createdBy/);
  });

  it('offers and probations: own rows for non-HR, everything for HR', async () => {
    const offers = capture({ C0: 1 });
    await countOffers(offers.connection, { queries: [{ status: 'Complete' }], createdBy: 3 });
    assert.match(offers.calls[0].sql, /FROM XXZP\.XXZP_EMPLOYMENT_OFFER_HEADER_T H/);
    assert.match(offers.calls[0].sql, /WHERE H\.CREATED_BY = :createdBy/);

    const probations = capture({ C0: 1 });
    await countEvaluations(probations.connection, {
      queries: [{ requestStatus: 'APPROVED' }],
      createdBy: null,
    });
    assert.match(probations.calls[0].sql, /FROM XXZP\.XXZP_PAF_PROBATION_HEADER H/);
    assert.doesNotMatch(probations.calls[0].sql, /CREATED_BY/);
  });

  it('orientations: the variant table and the legacy status mapping', async () => {
    const { connection, calls } = capture({ C0: 1 });
    await countTrainings(connection, TABLES.N, {
      queries: [{ status: 'Approved', dateFrom: '2026-01-01' }],
      createdBy: null,
    });
    assert.match(calls[0].sql, new RegExp(`FROM ${TABLES.N.header.replace('.', '\\.')} H`));
    assert.match(calls[0].sql, /ELSE 'DRAFT' END = UPPER\(:q0_status\)/);
  });

  it('appraisals: the year per set, own rows for non-HR, zero without an employee', async () => {
    const { connection, calls } = capture({ C0: 6, C1: 2 });
    const result = await countAppraisals(connection, {
      queries: [{ year: 2026 }, { year: 2026, grade: 'A' }],
      userId: 11,
      isHr: false,
    });
    assert.deepEqual(result, [6, 2]);
    assert.match(calls[0].sql, /HR\.YEAR = :q1_year AND HR\.ATTRIBUTE10 = :q1_grade/);
    assert.match(calls[0].sql, /WHERE HR\.CREATED_BY = :userId/);
    const none = capture();
    assert.deepEqual(
      await countAppraisals(none.connection, {
        queries: [{ year: 2026 }],
        userId: 11,
        isHr: false,
        noEmployee: true,
      }),
      [0],
    );
    assert.equal(none.calls.length, 0, 'no statement without an employee record');
  });

  it('nominations: the list’s department mapping, no per-user scope', async () => {
    const { connection, calls } = capture({ C0: 3 });
    await countNominations(connection, [{ department: 'production', date_from: '2026-01-01' }]);
    assert.deepEqual(calls[0].binds, { q0_department: 'Production', q0_date_from: '2026-01-01' });
    assert.doesNotMatch(calls[0].sql, /WHERE/);
  });
});

describe('POST /api/v1/hr/employment-offers/counts', () => {
  const BASE = '/api/v1/hr/employment-offers/counts';
  let f;

  const setup = () => {
    const store = createAuthStore();
    const rbac = installRbac(store, { syncPrivilegeFlags: true });
    const person = (employeeNumber, fullName) => {
      store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, fullName });
      return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
    };
    const hrUser = person('1001', 'Hala HR');
    const staffUser = person('1002', 'Sam Staff');
    const nobody = person('1003', 'Nada None');
    const offers = rbac.addResource(rbac.addModule('HR'), 'EMPLOYMENT_OFFERS');
    const view = rbac.addPermission(offers, 'VIEW');
    const role = rbac.addRole('OFFER_VIEW');
    rbac.grant(role, view);
    rbac.assign(hrUser, role);
    rbac.assign(staffUser, role);
    installEmploymentOffers(store, { hrUserIds: [hrUser.userId] });
    const calls = [];
    store.employmentOfferRepository.countOffers = async (_c, { queries, createdBy }) => {
      calls.push({ queries, createdBy });
      return queries.map((_, index) => index + 10);
    };
    const app = createApp(testAuthConfig(), {
      checkReadiness: async () => ({ LOW: true, HIGH: true }),
      api: {
        db: store.db,
        authRepository: store.authRepository,
        sessionRepository: store.sessionRepository,
        auditRepository: store.auditRepository,
        authorizationRepository: store.authorizationRepository,
        rbacRepository: store.rbacRepository,
        employmentOfferRepository: store.employmentOfferRepository,
        countsCache: createTtlCache({ ttlMs: 60000, maxEntries: 100 }),
      },
    });
    return { store, app, calls, hrUser, staffUser, nobody };
  };

  const post = (session, body, { csrf = true } = {}) => {
    const req = request(f.app).post(BASE).set('Cookie', session.cookie);
    return (csrf ? req.set('X-CSRF-Token', session.csrf) : req).send(body);
  };

  beforeEach(() => {
    f = setup();
  });

  it('returns the counts in order, scoped like the list, and caches them per user', async () => {
    const hr = await signIn(f.store, f.hrUser);
    const staff = await signIn(f.store, f.staffUser);
    const body = { queries: [{}, { status: 'Complete', dateFrom: '2026-01-01' }] };

    const first = await post(hr, body).expect(200);
    assert.deepEqual(first.body.data, { counts: [10, 11] });
    assert.equal(first.headers['cache-control'], 'no-store');
    assert.equal(f.calls[0].createdBy, null, 'HR counts every offer');

    await post(hr, body).expect(200);
    assert.equal(f.calls.length, 1, 'answered from the cache');

    await post(staff, body).expect(200);
    assert.equal(f.calls.length, 2, 'another user is never served from the HR user’s entry');
    assert.equal(f.calls[1].createdBy, f.staffUser.userId, 'non-HR users count their own');

    await post(hr, { ...body, fresh: true }).expect(200);
    assert.equal(f.calls.length, 3, 'fresh reads Oracle again');
  });

  it('requires VIEW, the CSRF token and valid list filters', async () => {
    const hr = await signIn(f.store, f.hrUser);
    const nobody = await signIn(f.store, f.nobody);
    await post(nobody, { queries: [{}] }).expect(403);
    await post(hr, { queries: [{}] }, { csrf: false }).expect(403);
    await post(hr, { queries: [] }).expect(400);
    await post(hr, { queries: [{ search: 'x' }] }).expect(400);
    await post(hr, { queries: [{ division: 'Unknown' }] }).expect(400);
    await post(hr, { queries: Array(MAX_COUNT_QUERIES + 1).fill({}) }).expect(400);
    assert.equal(f.calls.length, 0, 'nothing reaches the repository');
  });
});
