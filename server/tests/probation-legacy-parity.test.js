// Probation Evaluation (1064) against the legacy CI3 form (docs/testing/probation-legacy-comparison.md).
// Joi schemas and the service with a fake repository: no Oracle. Every person is fictional.
// Known gaps against the legacy behaviour are `todo` tests: they report, they do not fail the run.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProbationEvaluationService,
  toLegacyDate,
} from '../src/modules/hr/probation-evaluations/probationEvaluation.service.js';
import {
  FORM_TYPES,
  createBodySchema,
  listQuerySchema,
  updateBodySchema,
} from '../src/modules/hr/probation-evaluations/probationEvaluation.validation.js';

const BODY = Object.freeze({
  formDate: '2026-11-02',
  formType: 'Engineers_Staff',
  employeeName: 'Sample Employee 001',
  employeeNumber: 'E-0001',
  fromDate: '2026-08-05',
  toDate: '2026-11-04',
  lines: [{ param: 'Quality of work' }],
});
const errorsOf = (schema, body) =>
  (schema.validate(body, { abortEarly: false }).error?.details ?? []).map((item) =>
    item.path.join('.'),
  );
const valueOf = (schema, body) => schema.validate(body).value;
const without = (field) =>
  Object.fromEntries(Object.entries(BODY).filter(([key]) => key !== field));

function fakeService({ requestStatus = 'DRAFT' } = {}) {
  const writes = { headers: [], lines: [], headerUpdates: [], lineUpdates: [] };
  const repository = {
    findRequestor: async () => ({
      fullName: 'Sample Preparer',
      emailAddress: 'preparer@example.invalid',
    }),
    insertHeader: async (_connection, header) => (writes.headers.push(header), '7'),
    insertLine: async (_connection, line) => writes.lines.push(line),
    findAccessFacts: async () => ({ createdBy: '100', requestStatus, employeeNumber: 'E-0001' }),
    isHrUser: async () => false,
    updateHeader: async (_connection, header) => (writes.headerUpdates.push(header), true),
    updateLine: async (_connection, line) => (writes.lineUpdates.push(line), true),
    findEmployeeDetails: async () => ({
      ids: { personId: '5001', employeeNumber: 'E-0001' },
      hire: { startDate: '2020-01-15' },
      job: { name: 'Sample Title' },
      dept: { name: 'Sample Department' },
    }),
  };
  const run = async (_pool, work) => work({});
  const service = createProbationEvaluationService({
    repository,
    withConnection: run,
    withTransaction: run,
  });
  return { service, writes };
}
const ACTOR = Object.freeze({ userId: '100', employeeNumber: 'E-0100' });

describe('probation parity: fields', () => {
  it('requires the legacy mandatory fields: employee, employee number, form type, from and to dates', () => {
    for (const field of ['employeeName', 'employeeNumber', 'formType', 'fromDate', 'toDate']) {
      const body = without(field);
      assert.deepEqual(errorsOf(createBodySchema, body), [field], field);
    }
  });

  it('accepts exactly the five legacy form types (dropSelect)', () => {
    assert.deepEqual(FORM_TYPES, [
      'Workers_Technicians',
      'Trainee',
      'Engineers_Staff',
      'Department_Managers',
      'Supervisors_and_Foremens',
    ]);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, formType: 'Trainees' }), ['formType']);
  });

  it('keeps every other header field optional, as in the legacy form', () => {
    const value = valueOf(createBodySchema, BODY);
    assert.equal(value.grade, 0, 'GRADE defaults to 0 (legacy empty grade -> 0)');
    for (const optional of [
      'evaluationPeriod',
      'empId',
      'jobTitle',
      'department',
      'comment',
      'comments',
    ]) {
      assert.deepEqual(errorsOf(createBodySchema, { ...BODY, [optional]: '' }), [], optional);
    }
  });

  it('stores the legacy placeholders for empty text and dates', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    const [header] = writes.headers;
    assert.deepEqual(
      [
        header.evaluationPeriod,
        header.comment,
        header.comments,
        header.empId,
        header.jobTitle,
        header.department,
      ],
      ['-', '-', '-', '-', '-', '-'],
    );
    assert.equal(toLegacyDate(''), '01-JAN-00', 'legacy blank date');
    assert.equal(header.fromDate, '05-Aug-2026', 'DD-Mon-YYYY, as legacy date(d-M-Y)');
    assert.equal(writes.lines[0].paramAr, '-', 'PARAMA_NAME_AR placeholder');
  });

  it('takes "prepared by" (USER_NAME, USER_MAIL) from the session, never from the body', async () => {
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, userName: 'Someone Else' }), [
      'userName',
    ]);
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    assert.equal(writes.headers[0].userName, 'Sample Preparer');
    assert.equal(writes.headers[0].createdBy, '100');
  });

  it('limits a form to 20 lines with ratings 1–5; a missing rating is stored as 0', async () => {
    const lines = (count) =>
      Array.from({ length: count }, (_, index) => ({ param: `C${index}`, rating: 5 }));
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: lines(20) }), []);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: lines(21) }), ['lines']);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: [{ param: 'C', rating: 6 }] }), [
      'lines.0.rating',
    ]);
    assert.equal(valueOf(createBodySchema, BODY).lines[0].rating, 0);
  });

  it('requires the criterion text and LINE_ID on update', () => {
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: [{ param: ' ' }] }), [
      'lines.0.param',
    ]);
    assert.deepEqual(errorsOf(updateBodySchema, BODY), ['lines.0.lineId']);
  });

  it(
    'keeps FORM_DATE optional, as the legacy joining-date field',
    {
      todo: 'DIFFERENT: new formDate is required (form date); legacy prf_date was optional (joining date)',
    },
    () => {
      const body = without('formDate');
      assert.deepEqual(errorsOf(createBodySchema, body), []);
    },
  );
});

describe('probation parity: dependencies', () => {
  it('computes TOTAL_RATING as the sum of the line ratings when the client sends none', async () => {
    const { service, writes } = fakeService();
    const body = valueOf(createBodySchema, {
      ...BODY,
      lines: [{ param: 'A', rating: 5 }, { param: 'B', rating: 3 }, { param: 'C' }],
    });
    await service.create(ACTOR, body);
    assert.equal(writes.headers[0].totalRating, 8);
  });

  it('caps TOTAL_RATING at 100 (20 criteria x 5)', () => {
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, totalRating: 101 }), ['totalRating']);
  });

  it(
    'derives TOTAL_RATING from the lines even when the client sends a total',
    { todo: 'DIFFERENT (as legacy): the server trusts a client-sent totalRating' },
    async () => {
      const { service, writes } = fakeService();
      await service.create(
        ACTOR,
        valueOf(createBodySchema, { ...BODY, totalRating: 99, lines: [{ param: 'A', rating: 1 }] }),
      );
      assert.equal(writes.headers[0].totalRating, 1);
    },
  );

  it('rejects an end date before the start date (new cross-field rule)', () => {
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, toDate: '2026-08-04' }), ['']);
  });

  it('fills employee details on selection and years in company from the joining date', async () => {
    const { service } = fakeService();
    const details = await service.employeeDetails(ACTOR, 'Sample Employee 001');
    assert.equal(details.ids.employeeNumber, 'E-0001');
    assert.equal(details.job.name, 'Sample Title');
    assert.equal(details.dept.name, 'Sample Department');
    assert.ok(
      details.yearsInCompanay >= 6,
      'whole years since joining, as legacy years_in_companay',
    );
  });
});

describe('probation parity: flow', () => {
  it('updates header and line ratings of a DRAFT', async () => {
    const { service, writes } = fakeService();
    await service.update(
      ACTOR,
      '7',
      valueOf(updateBodySchema, {
        ...BODY,
        comment: 'Prepared comment',
        lines: [{ lineId: '11', param: 'A', rating: 4 }],
      }),
    );
    assert.equal(writes.headerUpdates[0].comment, 'Prepared comment');
    assert.deepEqual(
      writes.lineUpdates.map((line) => [line.lineId, line.rating]),
      [['11', 4]],
    );
  });

  it(
    'lets approvers add the Suggestion (APPROVED_BY_CMNT) while the request is INPROCESS',
    {
      todo: 'DIFFERENT: legacy saves comments and ratings at any status; new allows DRAFT only and has no workflow',
    },
    async () => {
      const { service } = fakeService({ requestStatus: 'INPROCESS' });
      await service.update(
        ACTOR,
        '7',
        valueOf(updateBodySchema, {
          ...BODY,
          comments: 'Suggestion',
          lines: [{ lineId: '11', param: 'A' }],
        }),
      );
    },
  );

  it(
    'filters the list by the stored legacy status REJECTED',
    { todo: 'BUG: listQuerySchema allows "Rejected" but the legacy workflow stores "REJECTED"' },
    () => {
      assert.equal(listQuerySchema.validate({ requestStatus: 'REJECTED' }).error, undefined);
    },
  );
});
