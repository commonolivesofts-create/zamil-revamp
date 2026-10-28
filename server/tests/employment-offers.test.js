'use strict';

/*
 * Employment Offer Form CRUD API tests (README_employment_offer_form.md).
 *
 * Contract under test: INSERT / READ / UPDATE / DELETE / LISTING WITH FILTERS plus the six
 * lookup/helper endpoints, through the real Express app, guards and Joi validation, with an
 * in-memory repository double injected through `employmentOfferRepository`. SQL itself is not
 * exercised here; the SQL follows the README verbatim (§3–§8).
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import {
  installEmploymentOffers,
  PROBATION_PERIOD,
  PROBATION_PERIOD_AR,
} from './helpers/employmentOfferFakes.js';
import { createApp } from '../src/app.js';

const BASE = '/api/v1/hr/employment-offers';
const BU = '300000002689294'; // business units (README §8.9; raw ids only, labels swapped)
const BU2 = '300000002689307';

/** Full valid payload for POST/PUT (README §3.2); omitted fields exercise the defaults. */
const BODY = {
  offerDate: '2026-10-25',
  employeeName: 'John Doe',
  employeeNameAr: 'جون دو',
  position: 'Machine Operator',
  division: BU,
  to: 'Mr',
  toArabic: 'السيد',
  // applicant / reqNo omitted: legacy defaults '-' and 0 (README §3.3).
  intNo: '300000003618177-636',
  line: {
    basicSalary: 8500,
    basicSalaryAr: 'ثمانية آلاف وخمسمائة',
    housingAllowance: '25% of basic',
    housingAllowanceAr: 'بدل سكن',
    transportation: 'Transportation',
    transportationAr: 'بدل نقل',
    annualVacation: '21 days',
    annualVacationAr: 'إجازة سنوية',
    ticket: '1 ticket every 2 years',
    ticketAr: 'تذكرة',
    medical: 'Company medical policy',
    medicalAr: 'تأمين طبى',
    contractPeriod: '3 years',
    contractPeriodAr: 'مدة العقد',
    approximateStartingDate: '2026-11-01',
    approximateStartingDateAr: '1448/03/10',
    // probationaryPeriod(_Ar) omitted: hardcoded SQL defaults (README §1.2).
    comment: 'Offer per grade X',
  },
};

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });

  const person = (employeeNumber, fullName) => {
    store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, fullName });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const hrUser = person('1001', 'Hala HR');
  const staffUser = person('1002', 'Sam Staff');
  const nobody = person('1003', 'Nada None');

  // Mirrors the owner-registered Oracle catalogue (module EMPLOYMENT_OFFERS, resource
  // EMPLOYMENT_OFFERS, actions VIEW/CREATE/UPDATE/DELETE); seeded in memory only.
  const offersModule = rbac.addModule('EMPLOYMENT_OFFERS');
  const offers = rbac.addResource(offersModule, 'EMPLOYMENT_OFFERS');
  const permissions = {
    VIEW: rbac.addPermission(offers, 'VIEW'),
    CREATE: rbac.addPermission(offers, 'CREATE'),
    UPDATE: rbac.addPermission(offers, 'UPDATE'),
    DELETE: rbac.addPermission(offers, 'DELETE'),
  };
  const hrRole = rbac.addRole('EMPLOYMENT_OFFER_HR');
  for (const permission of Object.values(permissions)) rbac.grant(hrRole, permission);
  rbac.assign(hrUser, hrRole);

  const staffRole = rbac.addRole('EMPLOYMENT_OFFER_STAFF');
  rbac.grant(staffRole, permissions.VIEW);
  rbac.grant(staffRole, permissions.CREATE);
  rbac.assign(staffUser, staffRole);

  installEmploymentOffers(store, {
    hrUserIds: [hrUser.userId],
    candidates: [
      {
        headerId: '501',
        intNo: '300000003618177-501',
        candidateName: 'Zahra Ali',
        positionName: 'Machine Operator',
        requisitionNo: 'REQ-1024',
      },
      {
        headerId: '502',
        intNo: '300000003618177-502',
        candidateName: 'Ahmed Saleh',
        positionName: 'Warehouse Supervisor',
        requisitionNo: 'REQ-2048',
      },
      {
        headerId: '503',
        intNo: '300000003618177-503',
        candidateName: 'Mariam Yusuf',
        positionName: 'Forklift Driver',
        requisitionNo: 'REQ-3072',
      },
    ],
    titles: [
      { meaning: 'Mr', description: 'السيد' },
      { meaning: 'Mrs', description: 'السيدة' },
    ],
    allowances: {
      housing: [{ meaning: '25% of basic', description: '25% من الأساسى' }],
      transportation: [{ meaning: 'Transportation', description: 'بدل نقل' }],
      'contract-period': [{ meaning: '3 years', description: '3 سنوات' }],
      'annual-vacation': [{ meaning: '21 days', description: '21 يوم' }],
      medical: [
        { meaning: 'Employee qualified dependents (as per Company policy)', description: 'الموظف' },
        { meaning: 'Employee only', description: 'الموظف فقط' },
      ],
      ticket: [
        { meaning: 'Economy class to point of origin.', description: 'اقتصادى' },
        { meaning: 'Business class to point of origin.', description: 'أعمال' },
      ],
    },
    arabicNumbers: { 8500: 'ثمانية آلاف' },
    hijriDates: { '2026-11-01': '1448/03/10' },
  });

  // Same wiring as createTestApp, plus the employment-offer repository double.
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
    },
  });

  return { store, rbac, permissions, hrUser, staffUser, nobody, app };
}

describe('employment offer API', () => {
  let f;
  let hr; // session of the HR user (VIEW/CREATE/UPDATE/DELETE)
  let staff; // non-HR user (VIEW/CREATE only)
  let anonymous; // authenticated user with no grants

  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
    staff = await signIn(f.store, f.staffUser);
    anonymous = await signIn(f.store, f.nobody);
  });

  const get = (path, session = hr) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, session = hr, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const audits = (code) => f.store.auditEvents(code);
  const assertForbidden = (res, reasonCode) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, reasonCode);
  };

  describe('authorization and CSRF', () => {
    it('rejects unauthenticated callers with 401 on every verb', async () => {
      assert.equal((await request(f.app).get(BASE)).status, 401);
      assert.equal((await request(f.app).post(BASE).send(BODY)).status, 401);
      assert.equal((await request(f.app).get(`${BASE}/lookups/titles`)).status, 401);
      assert.equal((await request(f.app).get(`${BASE}/lookups/business-units`)).status, 401);
      assert.equal((await request(f.app).put(`${BASE}/900`).send(BODY)).status, 401);
      assert.equal((await request(f.app).delete(`${BASE}/900`)).status, 401);
    });

    it('denies a user without the permission (default deny) with 403 and audits NO_GRANT', async () => {
      assertForbidden(await get('', anonymous), 'NO_GRANT');
      assertForbidden(await send('post', '', anonymous, BODY), 'NO_GRANT');
    });

    it('lets an explicit DENY override a role grant on CREATE', async () => {
      f.rbac.override(f.staffUser, f.permissions.CREATE, 'DENY');
      const res = await send('post', '', staff, BODY);
      assertForbidden(res, 'EXPLICIT_DENY');
      assert.equal(f.store.state.employmentOffers.headers.length, 0);
    });

    it('checks each action separately (VIEW ok, UPDATE denied)', async () => {
      f.store.seedOffer({ headerId: '900' });
      assert.equal((await get('', staff)).status, 200);
      assertForbidden(await send('put', '/900', staff, BODY), 'NO_GRANT');
    });

    it('requires the CSRF token for POST, PUT and DELETE', async () => {
      f.store.seedOffer({ headerId: '900' });
      const post = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
      assert.equal(post.status, 403);
      assert.equal(post.body.error.code, 'CSRF_REJECTED');
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'CSRF_TOKEN_MISSING');
      assert.equal(f.store.state.employmentOffers.headers.length, 1);

      const put = await request(f.app).put(`${BASE}/900`).set('Cookie', hr.cookie).send(BODY);
      assert.equal(put.status, 403);

      const del = await request(f.app).delete(`${BASE}/900`).set('Cookie', hr.cookie);
      assert.equal(del.status, 403);
      const kept = await f.store.employmentOfferRepository.findHeader({}, '900');
      assert.equal(kept.headerId, '900');
    });
  });

  describe('POST / (INSERT)', () => {
    it('creates the header and its single line in one transaction, returning 201', async () => {
      const res = await send('post', '', hr, BODY);
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.headerId, '1'); // trigger/identity key read back by UUID (§3.1)
      assert.match(
        res.body.data.uuid,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      const repo = f.store.employmentOfferRepository;
      const stored = await repo.findHeader({}, '1');
      assert.equal(stored.status, 'Incomplete'); // write-once: only ever 'Incomplete'
      assert.equal(stored.offerDate, '2026-10-25'); // ISO read of the stored legacy date
      assert.equal(stored.employeeName, 'John Doe');
      assert.equal(stored.employeeNameAr, 'جون دو');
      assert.equal(stored.position, 'Machine Operator');
      assert.equal(stored.division, BU);
      assert.equal(stored.intNo, '300000003618177-636');
      assert.equal(stored.to, 'Mr');
      assert.equal(stored.toArabic, 'السيد');
      assert.equal(stored.applicant, '-'); // legacy insert default
      assert.equal(stored.reqNo, 0); // legacy insert default
      const raw = f.store.state.employmentOffers.headers.at(-1);
      assert.equal(raw.offerDate, '25-Oct-2026'); // ISO -> legacy DD-Mon-YYYY storage
      assert.equal(raw.createdBy, f.hrUser.userId); // from the session, never the body

      const line = await repo.findLine({}, '1');
      assert.equal(line.basicSalary, 8500);
      assert.equal(line.basicSalaryAr, 'ثمانية آلاف وخمسمائة');
      assert.equal(line.approximateStartingDate, '2026-11-01'); // ISO read
      assert.equal(line.approximateStartingDateAr, '1448/03/10');
      assert.equal(line.probationaryPeriod, PROBATION_PERIOD); // hardcoded default (§1.2)
      assert.equal(line.probationaryPeriodAr, PROBATION_PERIOD_AR);
      assert.equal(line.comment, 'Offer per grade X');
      const rawLine = f.store.state.employmentOffers.lines.at(-1);
      assert.equal(rawLine.approxStartingDate, '01-Nov-2026'); // stored legacy form
      assert.equal(rawLine.attribute2, 'ثمانية آلاف وخمسمائة'); // legacy duplicate, insert-only
      assert.equal(rawLine.createdBy, f.hrUser.userId);
    });

    it('strips salary commas server-side', async () => {
      const res = await send('post', '', hr, {
        ...BODY,
        line: { ...BODY.line, basicSalary: '8,500' },
      });
      assert.equal(res.status, 201);
      const line = await f.store.employmentOfferRepository.findLine({}, res.body.data.headerId);
      assert.equal(line.basicSalary, 8500);
    });

    it('rejects a payload that omits employeeName with 400 VALIDATION_ERROR', async () => {
      const rest = { ...BODY };
      delete rest.employeeName;
      const res = await send('post', '', hr, rest);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'employeeName');
      assert.equal(f.store.state.employmentOffers.headers.length, 0);
    });

    it('rejects unknown body fields (strict payload)', async () => {
      const res = await send('post', '', hr, { ...BODY, workflowStatus: 'Approved' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'workflowStatus');
      assert.match(res.body.error.details[0].message, /is not allowed/);
    });

    it('rejects a bad BU, a bad salary, a bad date and a missing required line date', async () => {
      const badBu = await send('post', '', hr, { ...BODY, division: '999' });
      assert.equal(badBu.status, 400);
      assert.equal(badBu.body.error.details[0].field, 'division');

      const badSalary = await send('post', '', hr, {
        ...BODY,
        line: { ...BODY.line, basicSalary: -5 },
      });
      assert.equal(badSalary.body.error.details[0].field, 'line.basicSalary');

      const badDate = await send('post', '', hr, { ...BODY, offerDate: '25/10/2026' });
      assert.equal(badDate.body.error.details[0].field, 'offerDate');

      const missingLineDate = await send('post', '', hr, {
        ...BODY,
        line: { ...BODY.line, approximateStartingDate: undefined },
      });
      assert.equal(missingLineDate.status, 400);
      assert.equal(missingLineDate.body.error.details[0].field, 'line.approximateStartingDate');
      assert.equal(f.store.state.employmentOffers.headers.length, 0);
    });

    it('rejects a missing line object with 400', async () => {
      const header = { ...BODY };
      delete header.line;
      const res = await send('post', '', hr, header);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details[0].field, 'line');
      assert.equal(f.store.state.employmentOffers.lines.length, 0);
    });

    it('rolls back the header when the line insert fails', async () => {
      f.store.failures.offerInsert = true;
      const res = await send('post', '', hr, BODY);
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal(f.store.state.employmentOffers.headers.length, 0);
      assert.equal(f.store.state.employmentOffers.lines.length, 0);
    });
  });

  describe('GET /:headerId (READ)', () => {
    it('returns the header with its single line and ISO dates', async () => {
      f.store.seedOffer({
        headerId: '900',
        employeeName: 'Faisal Ahmed',
        createdBy: f.hrUser.userId,
      });
      const res = await get('/900');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      const body = res.body.data;
      assert.equal(body.headerId, '900');
      assert.equal(body.employeeName, 'Faisal Ahmed');
      assert.equal(body.offerDate, '2026-10-25'); // ISO everywhere in responses
      assert.equal(body.division, BU);
      assert.equal(body.applicant, '-');
      assert.equal(body.intNo, '300000003618177-900');
      assert.equal(body.reqNo, 'REQ-1024');
      assert.equal(body.status, 'Incomplete');
      assert.equal(body.createdBy, f.hrUser.userId);
      assert.ok(body.createdAt);
      assert.equal(body.updatedAt, null);
      assert.equal(body.updatedBy, null);
      assert.ok(body.line.offerLineId);
      assert.equal(body.line.headerId, '900');
      assert.equal(body.line.basicSalary, 8500);
      assert.equal(body.line.approximateStartingDate, '2026-11-01');
      assert.equal(body.line.probationaryPeriod, PROBATION_PERIOD);
      assert.equal(body.line.comment, 'Offer per grade X');
      assert.equal('attribute2' in body.line, false); // never exposed (README §1.2)
    });

    it('returns line: null when the header exists without a line', async () => {
      f.store.seedOffer({ headerId: '901', line: false });
      const res = await get('/901');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.line, null);
    });

    it('rejects a non-numeric headerId with 400 and an unknown id with 404', async () => {
      assert.equal((await get('/abc')).status, 400);
      const missing = await get('/999999');
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(missing.body.error.message, 'Employment offer not found');
    });
  });

  describe('PUT /:headerId (UPDATE)', () => {
    const UPDATED = {
      ...BODY,
      employeeName: 'John Doe (Updated)',
      division: BU2,
      applicant: 'Jane Approver',
      reqNo: 'REQ-2048',
      line: {
        ...BODY.line,
        basicSalary: 9200,
        basicSalaryAr: 'ثمانية آلاف ومئتان',
        probationaryPeriod: '1 month',
        probationaryPeriodAr: 'شهر واحد',
        comment: 'Updated comment',
      },
    };

    it('updates the header and the line; STATUS and insert-only columns are untouched', async () => {
      f.store.seedOffer({ headerId: '900', createdBy: f.hrUser.userId });
      const res = await send('put', '/900', hr, UPDATED);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { headerId: '900' });

      const repo = f.store.employmentOfferRepository;
      const stored = await repo.findHeader({}, '900');
      assert.equal(stored.employeeName, 'John Doe (Updated)');
      assert.equal(stored.division, BU2);
      assert.equal(stored.applicant, 'Jane Approver');
      assert.equal(stored.reqNo, 'REQ-2048');
      assert.equal(stored.status, 'Incomplete'); // never updated (README §5)
      assert.equal(stored.createdBy, f.hrUser.userId); // audit columns immutable
      assert.equal(stored.updatedBy, f.hrUser.userId);
      assert.ok(stored.updatedAt);

      const rawLine = f.store.state.employmentOffers.lines.find((l) => l.headerId === '900');
      assert.equal(rawLine.basicSalary, 9200); // §5.2 updates the salary
      assert.equal(rawLine.basicSalaryAr, 'ثمانية آلاف ومئتان');
      assert.equal(rawLine.comment, 'Updated comment');
      assert.equal(rawLine.probationaryPeriod, PROBATION_PERIOD); // insert-only, NOT updated
      assert.equal(rawLine.probationaryPeriodAr, PROBATION_PERIOD_AR); // insert-only, NOT updated
      assert.equal(rawLine.attribute2, 'ثمانية آلاف'); // insert-only duplicate, NOT updated
      const line = await repo.findLine({}, '900');
      assert.equal(line.probationaryPeriod, PROBATION_PERIOD);
      assert.equal(line.comment, 'Updated comment');
    });

    it('creates a missing line through the §5.2 MERGE with the hardcoded defaults', async () => {
      f.store.seedOffer({ headerId: '902', line: false });
      const res = await send('put', '/902', hr, BODY);
      assert.equal(res.status, 200);
      const line = await f.store.employmentOfferRepository.findLine({}, '902');
      assert.ok(line, 'the MERGE must insert the missing line row');
      assert.equal(line.basicSalary, 8500);
      assert.equal(line.probationaryPeriod, PROBATION_PERIOD);
      assert.equal(line.probationaryPeriodAr, PROBATION_PERIOD_AR);
      assert.equal(
        f.store.state.employmentOffers.lines.find((l) => l.headerId === '902').attribute2,
        BODY.line.basicSalaryAr,
      );
    });

    it('returns 404 for an unknown header and 400 for invalid payloads', async () => {
      const missing = await send('put', '/999999', hr, BODY);
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(missing.body.error.message, 'Employment offer not found');

      f.store.seedOffer({ headerId: '900' });
      // STATUS is not part of the write contract at all (README §5).
      const unknownField = await send('put', '/900', hr, { ...BODY, status: 'Approved' });
      assert.equal(unknownField.status, 400);
      assert.equal(unknownField.body.error.details[0].field, 'status');
      const stored = await f.store.employmentOfferRepository.findHeader({}, '900');
      assert.equal(stored.status, 'Incomplete');
    });
  });

  describe('DELETE /:headerId (DELETE)', () => {
    it('deletes the line and then the header', async () => {
      f.store.seedOffer({ headerId: '910' });
      const res = await send('delete', '/910', hr);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { headerId: '910', deleted: true });
      const repo = f.store.employmentOfferRepository;
      assert.equal(await repo.findHeader({}, '910'), null);
      assert.equal(await repo.findLine({}, '910'), null);
      assert.equal(f.store.state.employmentOffers.lines.length, 0);
    });

    it('returns 404 for an unknown header', async () => {
      const res = await send('delete', '/999999', hr);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(res.body.error.message, 'Employment offer not found');
    });

    it('rolls the delete back when the transaction fails', async () => {
      f.store.seedOffer({ headerId: '913' });
      f.store.failures.offerDelete = true;
      const res = await send('delete', '/913', hr);
      assert.equal(res.status, 500);
      const repo = f.store.employmentOfferRepository;
      assert.ok(await repo.findHeader({}, '913'), 'the header must survive the failed transaction');
      assert.ok(await repo.findLine({}, '913'), 'the line must survive as well');
    });
  });

  describe('GET / (LISTING WITH FILTERS)', () => {
    // Four records; the fourth belongs to the non-HR creator. All STATUS 'Incomplete' (write-once).
    function seedListings() {
      f.store.seedOffer({
        headerId: '800',
        employeeName: 'Zahra Ali',
        employeeNameAr: 'زهرة علي',
        position: 'Machine Operator',
        offerDate: '10-Jan-2026',
        division: BU,
        intNo: '300000003618177-800',
        reqNo: 'REQ-1024',
        createdBy: f.hrUser.userId,
      });
      f.store.seedOffer({
        headerId: '801',
        employeeName: 'Ahmed Saleh',
        position: 'Warehouse Supervisor',
        offerDate: '20-Feb-2026',
        division: BU2,
        intNo: '300000003618177-801',
        reqNo: 'REQ-2048',
        createdBy: f.hrUser.userId,
      });
      f.store.seedOffer({
        headerId: '802',
        employeeName: 'Mariam Yusuf',
        position: 'Machine Operator',
        offerDate: '05-Mar-2026',
        division: BU,
        intNo: '300000003618177-802',
        reqNo: 'REQ-1024',
        createdBy: f.hrUser.userId,
      });
      f.store.seedOffer({
        headerId: '803',
        employeeName: 'Hassan Idris',
        position: 'Forklift Driver',
        offerDate: '15-Apr-2026',
        division: BU2,
        intNo: '300000003618177-803',
        reqNo: 'REQ-3072',
        createdBy: f.staffUser.userId,
      });
    }

    it('defaults to page 1, pageSize 20, HEADER_ID desc with the standard envelope', async () => {
      seedListings();
      const res = await get('');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.deepEqual(Object.keys(res.body).sort(), ['data', 'meta', 'pagination', 'success']);
      const p = res.body.pagination;
      assert.equal(p.page, 1);
      assert.equal(p.limit, 20);
      assert.equal(p.total, 4);
      assert.equal(p.totalPages, 1);
      assert.equal(p.hasNextPage, false);
      assert.equal(p.hasPreviousPage, false);
      assert.deepEqual(
        res.body.data.map((r) => r.headerId),
        ['803', '802', '801', '800'],
      );
      const first = res.body.data[0];
      assert.equal(first.offerDate, '2026-04-15'); // ISO date-only, not the stored legacy form
      assert.equal(first.employeeName, 'Hassan Idris');
      assert.equal(first.requisitionNo, 'REQ-3072'); // ATTRIBUTE11 under the listing name
      assert.equal(first.status, 'Incomplete');
      assert.equal(first.createdBy, f.staffUser.userId);
      assert.equal(first.creationDate, f.store.now().toISOString().slice(0, 10));
      assert.equal(first.lastUpdateDate, null);
      const rawHeader = f.store.state.employmentOffers.headers.find((h) => h.headerId === '803');
      assert.equal(rawHeader.offerDate, '15-Apr-2026'); // stored legacy form
    });

    it('paginates with page/pageSize and reports an empty slice past the last page', async () => {
      seedListings();
      const page2 = await get('?page=2&pageSize=3&sortBy=HEADER_ID&sortDir=asc');
      assert.equal(page2.status, 200);
      assert.equal(page2.body.pagination.page, 2);
      assert.equal(page2.body.pagination.limit, 3);
      assert.equal(page2.body.pagination.total, 4);
      assert.equal(page2.body.pagination.totalPages, 2);
      assert.equal(page2.body.pagination.hasNextPage, false);
      assert.equal(page2.body.pagination.hasPreviousPage, true);
      assert.deepEqual(
        page2.body.data.map((r) => r.headerId),
        ['803'],
      );

      // Past the last page the OFFSET slice is empty (Oracle semantics); the totals stay exact.
      const beyond = await get('?page=99&pageSize=3&sortBy=HEADER_ID&sortDir=asc');
      assert.equal(beyond.status, 200);
      assert.deepEqual(beyond.body.data, []);
      assert.equal(beyond.body.pagination.total, 4);
    });

    it('applies every supported filter and combines them', async () => {
      seedListings();
      const ids = async (query) => {
        const res = await get(`?${query}`);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        return res.body.data.map((r) => r.headerId).sort();
      };

      assert.deepEqual(await ids('search=zah'), ['800'], 'search matches employee name');
      assert.deepEqual(await ids('search=forklift'), ['803'], 'search matches position');
      assert.deepEqual(await ids('search=177-801'), ['801'], 'search matches ATTRIBUTE10');
      assert.deepEqual(await ids('search=REQ-1024'), ['800', '802'], 'search matches ATTRIBUTE11');
      assert.deepEqual(
        await ids(`search=${encodeURIComponent('زهرة')}`),
        ['800'],
        'search matches the Arabic employee name',
      );
      assert.deepEqual(await ids('intNo=300000003618177-801'), ['801']);
      assert.deepEqual(await ids('requisitionNo=REQ-2048'), ['801']);
      assert.deepEqual(await ids(`division=${BU}`), ['800', '802']);
      assert.deepEqual(await ids('status=Incomplete'), ['800', '801', '802', '803']);
      assert.deepEqual(await ids('status=Approved'), [], 'only a filter, never a transition');
      assert.deepEqual(await ids('dateFrom=2026-02-01&dateTo=2026-03-31'), ['801', '802']);
      assert.deepEqual(await ids(`createdBy=${f.staffUser.userId}`), ['803']);
      assert.deepEqual(await ids(`search=zahra&division=${BU}`), ['800']);
      assert.deepEqual(await ids('search=no-such-candidate'), []);
    });

    it('sorts by each allowlisted column with a stable HEADER_ID tie-breaker', async () => {
      seedListings();
      f.store.seedOffer({
        headerId: '805',
        employeeName: 'Twin Row',
        offerDate: '20-Feb-2026',
        createdBy: f.hrUser.userId,
      });

      const byDate = await get('?sortBy=OFFER_DATE&sortDir=asc');
      assert.deepEqual(
        byDate.body.data.map((r) => r.headerId),
        ['800', '801', '805', '802', '803'],
        'equal dates break by HEADER_ID ascending even under asc',
      );

      const byName = await get('?sortBy=EMPLOYEE_NAME&sortDir=desc');
      assert.deepEqual(
        byName.body.data.map((r) => r.employeeName),
        ['Zahra Ali', 'Twin Row', 'Mariam Yusuf', 'Hassan Idris', 'Ahmed Saleh'],
      );

      const byCreation = await get('?sortBy=CREATION_DATE&sortDir=asc');
      assert.equal(byCreation.status, 200);
      assert.equal(byCreation.body.data.length, 5);
    });

    it('rejects an unsupported sortBy, sortDir, division or oversized pageSize with 400', async () => {
      assert.equal((await get('?sortBy=CANDIDATE_ID')).body.error.details[0].field, 'sortBy');
      assert.equal((await get('?sortDir=upwards')).body.error.details[0].field, 'sortDir');
      assert.equal((await get('?division=999')).body.error.details[0].field, 'division');
      assert.equal((await get('?pageSize=101')).body.error.details[0].field, 'pageSize');
      assert.equal((await get('?page=0')).body.error.details[0].field, 'page');
      assert.equal((await get('?statusX=Incomplete')).body.error.details[0].field, 'statusX');
    });

    it('scopes rows: HR sees every creator, non-HR only their own (never from the query)', async () => {
      seedListings();

      const asHr = await get('', hr);
      assert.deepEqual(asHr.body.data.map((r) => r.headerId).sort(), ['800', '801', '802', '803']);

      const asStaff = await get('', staff);
      assert.deepEqual(
        asStaff.body.data.map((r) => r.headerId),
        ['803'],
        'the non-HR user sees only CREATED_BY = own userId',
      );

      // A non-HR user cannot widen the scope by asking for someone else's rows.
      const spoofed = await get(`?createdBy=${f.hrUser.userId}`, staff);
      assert.equal(spoofed.body.data.length, 1);
      assert.equal(spoofed.body.data[0].headerId, '803');

      // An HR user may narrow by creator.
      const narrowed = await get(`?createdBy=${f.staffUser.userId}`, hr);
      assert.deepEqual(
        narrowed.body.data.map((r) => r.headerId),
        ['803'],
      );
    });
  });

  describe('lookups', () => {
    it('lists approved+passed candidates ordered by requisition number', async () => {
      const res = await get('/lookups/candidates');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.deepEqual(
        res.body.data.map((r) => r.intNo),
        ['300000003618177-503', '300000003618177-502', '300000003618177-501'],
      );
      assert.deepEqual(res.body.data[0], {
        headerId: '503',
        intNo: '300000003618177-503',
        candidateName: 'Mariam Yusuf',
        positionName: 'Forklift Driver',
        requisitionNo: 'REQ-3072',
      });
    });

    it('honours excludeOffered without changing the default', async () => {
      f.store.seedOffer({ headerId: '810', intNo: '300000003618177-502' });

      const excluded = await get('/lookups/candidates?excludeOffered=true');
      assert.deepEqual(
        excluded.body.data.map((r) => r.intNo),
        ['300000003618177-503', '300000003618177-501'],
        'already-offered candidates are excluded (legacy dedupe clause)',
      );

      const legacy = await get('/lookups/candidates');
      assert.equal(legacy.body.data.length, 3, 'default false preserves legacy behaviour');
    });

    it('lists the Mr/Mrs titles with EN meaning and AR description', async () => {
      const res = await get('/lookups/titles');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, [
        { meaning: 'Mr', description: 'السيد' },
        { meaning: 'Mrs', description: 'السيدة' },
      ]);
    });

    it('lists every allowance type from its lookup', async () => {
      const housing = await get('/lookups/allowances?type=housing');
      assert.equal(housing.status, 200);
      assert.deepEqual(housing.body.data, [
        { meaning: '25% of basic', description: '25% من الأساسى' },
      ]);
      assert.equal((await get('/lookups/allowances?type=transportation')).body.data.length, 1);
      assert.equal((await get('/lookups/allowances?type=contract-period')).body.data.length, 1);
      assert.equal((await get('/lookups/allowances?type=annual-vacation')).body.data.length, 1);

      const medical = await get('/lookups/allowances?type=medical');
      assert.equal(medical.body.data.length, 2);
      assert.match(medical.body.data[0].meaning, /qualified dependents \(as per Company policy\)/);

      const ticket = await get('/lookups/allowances?type=ticket');
      assert.equal(ticket.body.data.length, 2);
      assert.match(ticket.body.data[0].meaning, /to point of origin\./);
    });

    it('rejects a missing or unknown allowance type with 400', async () => {
      const missing = await get('/lookups/allowances');
      assert.equal(missing.status, 400);
      assert.equal(missing.body.error.details[0].field, 'type');
      const unknown = await get('/lookups/allowances?type=bonus');
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error.details[0].field, 'type');
    });

    it('returns the raw business-unit ids only (README §8.9 labels are contradictory)', async () => {
      const res = await get('/lookups/business-units');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { businessUnits: [BU, BU2] });
    });

    it('converts a number to Arabic words and validates the input', async () => {
      const res = await get('/lookups/number-to-arabic?number=8500');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { output: 'ثمانية آلاف' });

      const bad = await get('/lookups/number-to-arabic?number=abc');
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.details[0].field, 'number');
      const missing = await get('/lookups/number-to-arabic');
      assert.equal(missing.status, 400);
      assert.equal(missing.body.error.details[0].field, 'number');
    });

    it('converts a Gregorian date to Hijri and validates the input', async () => {
      const res = await get('/lookups/hijri-date?date=2026-11-01');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { hijri: '1448/03/10' });

      const bad = await get('/lookups/hijri-date?date=2026-02-30');
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.details[0].field, 'date');
      const missing = await get('/lookups/hijri-date');
      assert.equal(missing.status, 400);
      assert.equal(missing.body.error.details[0].field, 'date');
    });

    it('requires the VIEW permission and refuses query parameters', async () => {
      assertForbidden(await get('/lookups/titles', anonymous), 'NO_GRANT');
      const withQuery = await get('/lookups/titles?page=2');
      assert.equal(withQuery.status, 400);
      assert.equal(withQuery.body.error.code, 'VALIDATION_ERROR');
    });
  });
});
