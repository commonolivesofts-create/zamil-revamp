'use strict';

/*
 * Interview Assessment Form CRUD API tests (README_interview_assessment_form.md).
 *
 * Contract under test: INSERT / READ / UPDATE / DELETE / LISTING WITH FILTERS plus the three
 * lookup endpoints, through the real Express app, guards, and Joi validation, with an in-memory
 * repository double injected through `interviewAssessmentRepository`. SQL itself is not
 * exercised here; a read-only verification script against TEST (pattern of scripts/
 * verify-auth-sql.js) is listed as a follow-up before merge.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installInterviewAssessments } from './helpers/interviewAssessmentFakes.js';
import { createApp } from '../src/app.js';

const BASE = '/api/v1/hr/interview-assessments';
const BU = '300000003618177'; // payroll BU allowed in ATTRIBUTE3 (README §1.1)

/** Full valid payload for POST/PUT (README §3.2); omitted fields exercise the '-' / 0 defaults. */
const BODY = {
  candidateName: 'Noura Al Harbi',
  requisitionNo: 'REQ-1024',
  positionName: 'Machine Operator',
  attribute3: BU,
  nationality: 'Saudi',
  materialStatus: 'Single',
  age: 29,
  interviewDate: '2026-10-25',
  interviewTime: '10:30',
  interviewType: 'Online',
  secondaryEducation: 'Degree',
  secondaryEducationChk: 'Yes',
  lastPositionHeld: 'Operator',
  companyName: 'Acme Foods',
  relevantYearsExperience: 4,
  location: 'Riyadh',
  currentEmployer: 'Acme Foods',
  joining: '2026-11-01',
  major: 'Industrial Engineering',
  division: 'Food',
  curSalBasic: 8000,
  expSalBasic: 11000,
  curSalTotal: 9500,
  expSalTotal: 13000,
  interviewedBy: 'Khalid Mansour',
  interviewedBy2: 'Omar Nasser',
  interviewedBy3: '',
  personalSpec: {
    rate1: '4',
    remark1: 'Good attitude',
    rate2: '3',
    rate9: 99, // client totals are accepted but recomputed server-side (README §9)
    remarks: 'Personal remarks',
  },
  jobCompetency: {
    cRating1: '2',
    cRemark1: 'Needs training',
    cRating7: 77,
    cRemarks: 'Competency remarks',
    sumStrength: 'Reliable',
    sumWeekness: '',
  },
  evaluation: {
    status: 'Passed',
    interviewedBy: 'Khalid Mansour',
    adminManager: 'Amina Qahtani',
    hrRep: 'Hala HR',
    deptRep: '',
    comment: 'Recommended',
    managningDirector: '',
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

  // Mirrors the owner-registered Oracle catalogue (module INTERVIEW_ASSESSMENTS, resource
  // INTERVIEW_ASSESSMENTS); seeded in memory only.
  const assessmentsModule = rbac.addModule('INTERVIEW_ASSESSMENTS');
  const assessments = rbac.addResource(assessmentsModule, 'INTERVIEW_ASSESSMENTS');
  const permissions = {
    VIEW: rbac.addPermission(assessments, 'VIEW'),
    CREATE: rbac.addPermission(assessments, 'CREATE'),
    UPDATE: rbac.addPermission(assessments, 'UPDATE'),
    DELETE: rbac.addPermission(assessments, 'DELETE'),
  };
  const hrRole = rbac.addRole('INTERVIEW_ASSESSMENT_HR');
  for (const permission of Object.values(permissions)) rbac.grant(hrRole, permission);
  rbac.assign(hrUser, hrRole);

  const staffRole = rbac.addRole('INTERVIEW_ASSESSMENT_STAFF');
  rbac.grant(staffRole, permissions.VIEW);
  rbac.grant(staffRole, permissions.CREATE);
  rbac.assign(staffUser, staffRole);

  installInterviewAssessments(store, {
    hrUserIds: [hrUser.userId],
    requisitions: [
      { requisitionNumber: 'REQ-1024', jobName: 'Machine Operator' },
      { requisitionNumber: 'REQ-2048', jobName: 'Warehouse Supervisor' },
    ],
    nationalities: ['Saudi', 'Egyptian'],
    employees: ['Khalid Mansour', 'Omar Nasser'],
    jobMaster: [{ name: 'Machine Operator', approvalAuthority: 'HR Manager' }],
  });

  // Same wiring as createTestApp, plus the interview-assessment repository double.
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      interviewAssessmentRepository: store.interviewAssessmentRepository,
    },
  });

  return { store, rbac, permissions, hrUser, staffUser, nobody, app };
}

describe('interview assessment API', () => {
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
      assert.equal((await request(f.app).get(`${BASE}/lookups/nationalities`)).status, 401);
      assert.equal((await request(f.app).put(`${BASE}/636`).send(BODY)).status, 401);
      assert.equal((await request(f.app).delete(`${BASE}/636`)).status, 401);
    });

    it('denies a user without the permission (default deny) with 403 and audits NO_GRANT', async () => {
      assertForbidden(await get('', anonymous), 'NO_GRANT');
      assertForbidden(await send('post', '', anonymous, BODY), 'NO_GRANT');
    });

    it('lets an explicit DENY override a role grant on CREATE', async () => {
      f.rbac.override(f.staffUser, f.permissions.CREATE, 'DENY');
      const res = await send('post', '', staff, BODY);
      assertForbidden(res, 'EXPLICIT_DENY');
      assert.equal(f.store.state.interviewAssessments.headers.length, 0);
    });

    it('checks each action separately (VIEW ok, UPDATE denied)', async () => {
      f.store.seedAssessment({ headerId: '900' });
      assert.equal((await get('', staff)).status, 200);
      assertForbidden(await send('put', '/900', staff, BODY), 'NO_GRANT');
    });

    it('gives a SUPER_ADMINISTRATOR member no access without a grant (no exemption)', async () => {
      // Owner decision (2026-10-27): the all-access exemption was withdrawn — every account,
      // the Super Administrator included, sees only the modules whose permissions are granted
      // to it. The catalogue is seeded here but nothing is granted to this role.
      f.store.addEmployee({
        employeeNumber: '1004',
        username: 'user.1004',
        fullName: 'Mona Super',
      });
      const superAccount = f.store.addUser('1004', { passwordHash: 'argon2-hash-placeholder' });
      f.rbac.assign(superAccount, f.rbac.addRole('SUPER_ADMINISTRATOR'));

      const superSession = await signIn(f.store, superAccount);
      assertForbidden(await get('', superSession), 'NO_GRANT');
      assertForbidden(await send('post', '', superSession, BODY), 'NO_GRANT');

      // /me/permissions agrees with authorize(): an ungranted catalogue is not listed.
      const mine = await request(f.app)
        .get('/api/v1/access-control/me/permissions')
        .set('Cookie', superSession.cookie);
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.body.data.permissions, []);
    });

    it('requires the CSRF token for POST, PUT and DELETE', async () => {
      f.store.seedAssessment({ headerId: '900' });
      const post = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
      assert.equal(post.status, 403);
      assert.equal(post.body.error.code, 'CSRF_REJECTED');
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'CSRF_TOKEN_MISSING');

      const put = await request(f.app).put(`${BASE}/900`).set('Cookie', hr.cookie).send(BODY);
      assert.equal(put.status, 403);

      const del = await request(f.app).delete(`${BASE}/900`).set('Cookie', hr.cookie);
      assert.equal(del.status, 403);
      const kept = await f.store.interviewAssessmentRepository.findHeader({}, '900');
      assert.equal(kept.headerId, '900');
    });
  });

  describe('POST / (INSERT)', () => {
    it('creates the header and three section rows in one transaction, returning 201', async () => {
      const res = await send('post', '', hr, BODY);
      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.headerId, '636'); // max+1 of the seeded XXZP_INTERVIEW_HEAD_T
      assert.equal(res.body.data.intNo, `${BU}-636`);
      assert.match(
        res.body.data.uuid,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      const repo = f.store.interviewAssessmentRepository;
      const stored = await repo.findHeader({}, '636');
      assert.equal(stored.candidateName, 'Noura Al Harbi');
      assert.equal(stored.status, 'Incomplete'); // STATUS is only ever written Incomplete
      assert.equal(stored.interviewDate, '25-Oct-2026'); // ISO -> legacy DD-Mon-YY
      assert.equal(stored.joining, '01-Nov-2026');
      assert.equal(stored.materialStatus, 'Single');
      assert.equal(stored.personalSpecTotal, 7); // 4 + 3, not the client's 99
      assert.equal(stored.jobCompetencyTotal, 2);
      assert.equal(stored.personalSpecResult, 'Personal remarks');
      assert.equal(stored.jobCompetencyResult, 'Competency remarks');
      // createdBy is a bind on insert but not part of the detail projection (README §4.1).
      assert.equal(f.store.state.interviewAssessments.headers.at(-1).createdBy, f.hrUser.userId);
      assert.equal(stored.interviewedBy, 'Khalid Mansour'); // mirrored from evaluation
      assert.equal(stored.interviewedBy3, '-'); // empty text stores '-'

      const personal = await repo.findPersonalSpec({}, '636');
      assert.equal(personal.rate1, '4');
      assert.equal(personal.remark2, '-'); // empty remark
      assert.equal(personal.rate7, '-'); // unset rating stores '-'
      const competency = await repo.findJobCompetency({}, '636');
      assert.equal(competency.cRating1, '2');
      assert.equal(competency.sumWeekness, '-');
      const evaluation = await repo.findEvaluation({}, '636');
      assert.equal(evaluation.status, 'Passed');
      assert.equal(evaluation.hrRep, 'Hala HR');
      assert.equal(evaluation.deptRep, '-');
    });

    it('rejects a payload that omits candidateName with 400 VALIDATION_ERROR', async () => {
      const rest = { ...BODY };
      delete rest.candidateName;
      const res = await send('post', '', hr, rest);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'candidateName');
      assert.equal(f.store.state.interviewAssessments.headers.length, 0);
    });

    it('rejects unknown body fields (strict payload)', async () => {
      const res = await send('post', '', hr, { ...BODY, workflowStatus: 'Approved' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'workflowStatus');
      assert.match(res.body.error.details[0].message, /is not allowed/);
    });

    it('rejects a rating outside 1..5 / N/A, a bad BU and a bad evaluation status', async () => {
      const badRating = await send('post', '', hr, {
        ...BODY,
        personalSpec: { rate1: '9' },
      });
      assert.equal(badRating.status, 400);
      assert.equal(badRating.body.error.details[0].field, 'personalSpec.rate1');

      const badBu = await send('post', '', hr, { ...BODY, attribute3: '999' });
      assert.equal(badBu.body.error.details[0].field, 'attribute3');

      const badStatus = await send('post', '', hr, {
        ...BODY,
        evaluation: { status: 'Approved' },
      });
      assert.equal(badStatus.body.error.details[0].field, 'evaluation.status');
    });

    it('rejects a date that is not YYYY-MM-DD with 400', async () => {
      const res = await send('post', '', hr, { ...BODY, interviewDate: '25/10/2026' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details[0].field, 'interviewDate');
    });

    it('rejects a requisition with no approved requisition row with 400', async () => {
      const res = await send('post', '', hr, { ...BODY, requisitionNo: 'REQ-9999' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details[0].field, 'requisitionNo');
      assert.match(res.body.error.details[0].message, /approved requisition/);
      assert.equal(f.store.state.interviewAssessments.headers.length, 0);
    });

    it('rolls back every insert when the transaction fails', async () => {
      f.store.failures.interviewInsert = true;
      const res = await send('post', '', hr, BODY);
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      const repo = f.store.interviewAssessmentRepository;
      assert.equal(await repo.findHeader({}, '636'), null);
      assert.equal(await repo.findPersonalSpec({}, '636'), null);
      assert.equal(await repo.findJobCompetency({}, '636'), null);
      assert.equal(await repo.findEvaluation({}, '636'), null);
    });
  });

  describe('GET /:headerId (READ)', () => {
    it('returns the header with its three sections and the approval authority', async () => {
      f.store.seedAssessment({
        headerId: '900',
        candidateName: 'Faisal Ahmed',
        status: 'Approved',
      });
      const res = await get('/900');
      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-store');
      const body = res.body.data;
      assert.equal(body.headerId, '900');
      assert.equal(body.candidateName, 'Faisal Ahmed');
      assert.equal(body.status, 'Approved');
      assert.equal(body.intNo, '300000003618177-900');
      assert.equal(body.positionName, 'Machine Operator');
      assert.equal(body.approvalAuthority, 'HR Manager'); // from XXZP_JOB_MASTER
      assert.equal(body.materialStatus, '-');
      assert.equal(body.interviewDate, '25-Oct-2026'); // stored legacy form, as documented
      assert.equal(body.personalSpec.rate1, '4');
      assert.equal(body.personalSpec.rate9, 8); // header total folded into the section
      assert.equal(body.personalSpec.remarks, '-');
      assert.equal(body.jobCompetency.cRating7, 6);
      assert.equal(body.evaluation.status, 'Passed');
      assert.equal(body.evaluation.interviewedBy, '-');
    });

    it('returns null sections when the child rows are missing', async () => {
      f.store.seedAssessment({ headerId: '901', children: false });
      const res = await get('/901');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.personalSpec, null);
      assert.equal(res.body.data.jobCompetency, null);
      assert.equal(res.body.data.evaluation, null);
    });

    it('rejects a non-numeric headerId with 400 and an unknown id with 404', async () => {
      assert.equal((await get('/abc')).status, 400);
      const missing = await get('/999999');
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal(missing.body.error.message, 'Interview assessment not found');
    });
  });

  describe('PUT /:headerId (UPDATE)', () => {
    const UPDATED = {
      ...BODY,
      candidateName: 'Noura Al Harbi (Updated)',
      division: 'Non-Food',
      personalSpec: { rate1: '5', rate2: '5', rate3: '5', remarks: 'Updated remarks' },
      jobCompetency: { cRating1: '4', cRating2: 'N/A', sumStrength: 'Strong' },
      evaluation: { status: 'Hold', interviewedBy: 'Omar Nasser' },
    };

    it('replaces the header and rewrites all sections; STATUS is untouched', async () => {
      f.store.seedAssessment({ headerId: '900' });
      const res = await send('put', '/900', hr, UPDATED);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { headerId: '900' });

      const repo = f.store.interviewAssessmentRepository;
      const stored = await repo.findHeader({}, '900');
      assert.equal(stored.candidateName, 'Noura Al Harbi (Updated)');
      assert.equal(stored.division, 'Non-Food');
      assert.equal(stored.status, 'Incomplete'); // never updated (README §6)
      assert.equal(stored.personalSpecTotal, 15); // 5 + 5 + 5
      assert.equal(stored.jobCompetencyTotal, 4); // 'N/A' does not count
      assert.equal(stored.personalSpecResult, 'Updated remarks');
      assert.equal(stored.interviewedBy, 'Omar Nasser'); // mirror follows evaluation
      assert.equal(stored.interviewedBy2, 'Omar Nasser');
      assert.ok(stored.updatedAt);
      assert.equal((await repo.findPersonalSpec({}, '900')).rate1, '5');
      const evaluation = await repo.findEvaluation({}, '900');
      assert.equal(evaluation.status, 'Hold');
      assert.equal(evaluation.adminManager, '-'); // omitted fields reset
    });

    it('creates missing section rows through the MERGE upserts', async () => {
      f.store.seedAssessment({ headerId: '902', children: false });
      const res = await send('put', '/902', hr, BODY);
      assert.equal(res.status, 200);
      const repo = f.store.interviewAssessmentRepository;
      assert.equal((await repo.findPersonalSpec({}, '902')).rate1, '4');
      assert.equal((await repo.findJobCompetency({}, '902')).cRating1, '2');
      assert.equal((await repo.findEvaluation({}, '902')).status, 'Passed');
    });

    it('returns 404 for an unknown header and 400 for invalid payloads', async () => {
      const missing = await send('put', '/999999', hr, BODY);
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');

      f.store.seedAssessment({ headerId: '900' });
      const unknownField = await send('put', '/900', hr, { ...BODY, status: 'Approved' });
      assert.equal(unknownField.status, 400);
      assert.equal(unknownField.body.error.details[0].field, 'status');
    });
  });

  describe('DELETE /:headerId (DELETE)', () => {
    it('deletes the header and all section rows', async () => {
      f.store.seedAssessment({ headerId: '910' });
      const res = await send('delete', '/910', hr);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, { headerId: '910', deleted: true });
      const repo = f.store.interviewAssessmentRepository;
      assert.equal(await repo.findHeader({}, '910'), null);
      assert.equal(await repo.findPersonalSpec({}, '910'), null);
      assert.equal(await repo.findJobCompetency({}, '910'), null);
      assert.equal(await repo.findEvaluation({}, '910'), null);
    });

    it('returns 409 CANNOT_DELETE_APPROVED for Approved + Passed, keeping the record', async () => {
      f.store.seedAssessment({ headerId: '911', status: 'Approved', evaluationStatus: 'Passed' });
      const res = await send('delete', '/911', hr);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'CANNOT_DELETE_APPROVED');
      const repo = f.store.interviewAssessmentRepository;
      assert.ok(await repo.findHeader({}, '911'));
      assert.ok(await repo.findEvaluation({}, '911'));
    });

    it('allows deleting an Approved record whose evaluation is not Passed', async () => {
      f.store.seedAssessment({ headerId: '912', status: 'Approved', evaluationStatus: 'Failed' });
      assert.equal((await send('delete', '/912', hr)).status, 200);
      assert.equal(await f.store.interviewAssessmentRepository.findHeader({}, '912'), null);
    });

    it('returns 404 for an unknown header', async () => {
      const res = await send('delete', '/999999', hr);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'RESOURCE_NOT_FOUND');
    });

    it('rolls the delete back when the transaction fails', async () => {
      f.store.seedAssessment({ headerId: '913' });
      f.store.failures.interviewDelete = true;
      const res = await send('delete', '/913', hr);
      assert.equal(res.status, 500);
      const repo = f.store.interviewAssessmentRepository;
      assert.ok(await repo.findHeader({}, '913'), 'the header must survive the failed transaction');
      assert.ok(await repo.findPersonalSpec({}, '913'), 'the section rows must survive as well');
    });
  });

  describe('GET / (LISTING WITH FILTERS)', () => {
    // Four records covering every status; the fourth belongs to another creator.
    function seedListings() {
      const repo = f.store.interviewAssessmentRepository;
      f.store.seedAssessment({
        headerId: '800',
        candidateName: 'Zahra Ali',
        positionName: 'Machine Operator',
        status: 'Approved',
        evaluationStatus: 'Passed',
        interviewDate: '10-Jan-2026',
        division: 'Food',
        interviewType: 'Personal',
        createdBy: f.hrUser.userId,
      });
      f.store.seedAssessment({
        headerId: '801',
        candidateName: 'Ahmed Saleh',
        positionName: 'Warehouse Supervisor',
        status: 'Inprocess',
        evaluationStatus: 'Hold',
        interviewDate: '20-Feb-2026',
        division: 'Non-Food',
        interviewType: 'Online',
        requisitionNo: 'REQ-2048',
        createdBy: f.hrUser.userId,
      });
      f.store.seedAssessment({
        headerId: '802',
        candidateName: 'Mariam Yusuf',
        positionName: 'Machine Operator',
        status: 'Rejected',
        evaluationStatus: 'Failed',
        interviewDate: '05-Mar-2026',
        division: 'Food',
        interviewType: 'Personal',
        createdBy: f.hrUser.userId,
      });
      f.store.seedAssessment({
        headerId: '803',
        candidateName: 'Hassan Idris',
        positionName: 'Forklift Driver',
        status: 'Incomplete',
        evaluationStatus: 'Passed',
        interviewDate: '15-Apr-2026',
        division: 'Non-Food',
        interviewType: 'Online',
        createdBy: f.staffUser.userId,
      });
      return repo;
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
      const approved = res.body.data.at(-1);
      assert.equal(approved.statusLabel, 'Approved');
      assert.equal(approved.evaluationStatus, 'Passed'); // only Approved rows expose it
      const inprocess = res.body.data.find((r) => r.headerId === '801');
      assert.equal(inprocess.statusLabel, 'InProcess'); // legacy display mapping (§7.3)
      assert.equal(inprocess.evaluationStatus, null);
      const rejected = res.body.data.find((r) => r.headerId === '802');
      assert.equal(rejected.statusLabel, 'Rejected');
      assert.equal(rejected.evaluationStatus, null);
      const incomplete = res.body.data.find((r) => r.headerId === '803');
      assert.equal(incomplete.statusLabel, 'Draft');
      assert.equal(incomplete.creationDate, f.store.now().toISOString().slice(0, 10));
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

      assert.deepEqual(await ids('search=zah'), ['800'], 'search matches candidate name');
      assert.deepEqual(await ids('search=forklift'), ['803'], 'search matches position');
      assert.deepEqual(await ids('search=177-801'), ['801'], 'search matches intNo');
      assert.deepEqual(await ids('status=Inprocess'), ['801']);
      assert.deepEqual(await ids('evaluationStatus=Failed'), ['802']);
      assert.deepEqual(await ids('requisitionNo=REQ-2048'), ['801']);
      assert.deepEqual(await ids('positionName=operator'), ['800', '802']);
      assert.deepEqual(await ids('division=Food'), ['800', '802']);
      assert.deepEqual(await ids('interviewType=Online'), ['801', '803']);
      assert.deepEqual(await ids('dateFrom=2026-02-01&dateTo=2026-03-31'), ['801', '802']);
      assert.deepEqual(await ids(`createdBy=${f.staffUser.userId}`), ['803']);
      assert.deepEqual(await ids('search=zahra&division=Food&interviewType=Personal'), ['800']);
      assert.deepEqual(await ids('search=no-such-candidate'), []);
    });

    it('sorts by each allowlisted column with a stable HEADER_ID tie-breaker', async () => {
      seedListings();
      f.store.seedAssessment({
        headerId: '805',
        candidateName: 'Twin Row',
        interviewDate: '20-Feb-2026',
        createdBy: f.hrUser.userId,
      });

      const byDate = await get('?sortBy=INTERVIEW_DATE&sortDir=asc');
      assert.deepEqual(
        byDate.body.data.map((r) => r.headerId),
        ['800', '801', '805', '802', '803'],
        'equal dates break by HEADER_ID ascending even under asc',
      );

      const byName = await get('?sortBy=CANDIDATE_NAME&sortDir=desc');
      assert.deepEqual(
        byName.body.data.map((r) => r.candidateName),
        ['Zahra Ali', 'Twin Row', 'Mariam Yusuf', 'Hassan Idris', 'Ahmed Saleh'],
      );

      const byCreation = await get('?sortBy=CREATION_DATE&sortDir=asc');
      assert.equal(byCreation.status, 200);
      assert.equal(byCreation.body.data.length, 5);
    });

    it('rejects an unsupported sortBy, sortDir, status or oversized pageSize with 400', async () => {
      assert.equal((await get('?sortBy=CANDIDATE_ID')).body.error.details[0].field, 'sortBy');
      assert.equal((await get('?sortDir=upwards')).body.error.details[0].field, 'sortDir');
      assert.equal((await get('?status=Cancelled')).body.error.details[0].field, 'status');
      assert.equal((await get('?pageSize=101')).body.error.details[0].field, 'pageSize');
      assert.equal((await get('?page=0')).body.error.details[0].field, 'page');
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
    it('lists the payroll business units with their labels, matching the accepted attribute3 values', async () => {
      const res = await get('/lookups/payroll-units');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, [
        { code: '300000003618177', name: 'IPP' },
        { code: '300000003618190', name: 'FPP' },
      ]);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal((await request(f.app).get(`${BASE}/lookups/payroll-units`)).status, 401);
    });

    it('lists nationalities from XXZP_NATIONALITY', async () => {
      const res = await get('/lookups/nationalities');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, ['Egyptian', 'Saudi']);
      assert.equal(res.headers['cache-control'], 'no-store');
    });

    it('lists approved requisitions from XXZPI_PER_REQUISITIONS_ALL', async () => {
      const res = await get('/lookups/requisitions');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, [
        { requisitionNumber: 'REQ-2048', jobName: 'Warehouse Supervisor' },
        { requisitionNumber: 'REQ-1024', jobName: 'Machine Operator' },
      ]);
    });

    it('lists interviewer employee names', async () => {
      const res = await get('/lookups/employees');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data, ['Khalid Mansour', 'Omar Nasser']);
    });

    it('requires the VIEW permission and refuses query parameters', async () => {
      assertForbidden(await get('/lookups/nationalities', anonymous), 'NO_GRANT');
      const withQuery = await get('/lookups/nationalities?page=2');
      assert.equal(withQuery.status, 400);
      assert.equal(withQuery.body.error.code, 'VALIDATION_ERROR');
    });
  });
});
