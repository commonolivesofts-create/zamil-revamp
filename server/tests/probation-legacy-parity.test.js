// Probation Evaluation (1064) against the legacy CI3 form (docs/testing/probation-legacy-comparison.md).
// Joi schemas and the service with a fake repository: no Oracle. Every person is fictional.
// Known gaps against the legacy behaviour are `todo` tests: they report, they do not fail the run.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as probationRepository from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';
import {
  evaluationResult,
  submitProblems,
} from '../src/modules/hr/probation-evaluations/probationEvaluation.rules.js';
import { createProbationEvaluationService } from '../src/modules/hr/probation-evaluations/probationEvaluation.service.js';
import {
  FORM_TYPES,
  REQUEST_STATUSES,
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

// Records SQL and binds; returns `rowsFor(sql)` as the result rows.
function fakeConnection(rowsFor = () => []) {
  const statements = [];
  return {
    statements,
    async execute(sql, binds) {
      statements.push({ sql, binds });
      return { rows: rowsFor(sql), rowsAffected: 1, outBinds: { headerId: ['7'] } };
    },
  };
}

function fakeService({ requestStatus = 'DRAFT', header = {}, listItems = [], lines = [] } = {}) {
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
    findHeader: async () => ({ headerId: '7', formDate: '2026-08-05', ...header }),
    listLines: async () => lines,
    listEvaluations: async () => ({ total: listItems.length, items: listItems }),
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
    assert.equal(header.fromDate, '2026-08-05', 'dates are bound as YYYY-MM-DD');
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

  it('keeps FORM_DATE optional, as the legacy joining-date field', () => {
    assert.deepEqual(errorsOf(createBodySchema, without('formDate')), []);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, formDate: '2026-02-30' }), ['formDate']);
  });

  it('stores a blank joining date as NULL (FORM_DATE is nullable) and stores a known one as is', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, without('formDate')));
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    await service.update(
      ACTOR,
      '7',
      valueOf(updateBodySchema, { ...without('formDate'), lines: [{ lineId: '11', param: 'A' }] }),
    );
    assert.deepEqual(
      [writes.headers[0].formDate, writes.headers[1].formDate, writes.headerUpdates[0].formDate],
      [null, BODY.formDate, null],
    );
  });

  it('reads both NULL and the legacy blank 2000-01-01 as a blank joining date', async () => {
    for (const [stored, expected] of [
      [null, null],
      ['2000-01-01', null],
      ['2026-08-05', '2026-08-05'],
    ]) {
      const { service } = fakeService({ header: { formDate: stored } });
      assert.equal((await service.get(ACTOR, '7')).formDate, expected, String(stored));
      const listed = fakeService({
        listItems: [{ headerId: '7', formDate: stored, totalRating: 0 }],
      });
      const { items } = await listed.service.list(ACTOR, { page: 1, pageSize: 20 });
      assert.equal(items[0].formDate, expected, `list ${stored}`);
    }
  });

  it('binds and selects every probation date as YYYY-MM-DD (no month names, no two-digit years)', async () => {
    const connection = fakeConnection(() => [
      { HEADER_ID: '7', FORM_DATE: '2026-08-05', TOTAL: 0 },
    ]);
    const header = {
      uuid: 'u',
      formDate: '2026-08-05',
      fromDate: '2026-08-05',
      toDate: '2026-11-04',
    };
    await probationRepository.insertHeader(connection, header);
    await probationRepository.updateHeader(connection, { ...header, headerId: '7' });
    await probationRepository.findHeader(connection, '7');
    await probationRepository.listEvaluations(connection, {
      limit: 20,
      offset: 0,
      sortBy: 'HEADER_ID',
      sortDir: 'desc',
    });
    for (const { sql } of connection.statements) {
      assert.doesNotMatch(sql, /DD-Mon|'DD-MON-YY'|, 'YY'\)/, sql);
    }
    const [insert, update, select, , list] = connection.statements;
    assert.match(insert.sql, /TO_DATE\(:formDate, 'YYYY-MM-DD'\)/);
    assert.match(update.sql, /FORM_DATE = TO_DATE\(:formDate, 'YYYY-MM-DD'\)/);
    assert.match(select.sql, /TO_CHAR\(FORM_DATE, 'YYYY-MM-DD'\) AS FORM_DATE/);
    assert.match(select.sql, /TO_CHAR\(CREATED_AT, 'YYYY-MM-DD'\) AS CREATED_AT/);
    assert.match(list.sql, /TO_CHAR\(H\.CREATED_AT, 'YYYY-MM-DD'\) AS CREATED_AT/);
  });
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

  it('caps TOTAL_RATING at 100 (20 criteria x 5)', async () => {
    const lines = Array.from({ length: 20 }, (_, index) => ({ param: `C${index}`, rating: 5 }));
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, { ...BODY, lines }));
    assert.equal(writes.headers[0].totalRating, 100);
  });

  it('derives TOTAL_RATING from the lines and ignores a total or result sent by the client', async () => {
    for (const [schema, body] of [
      [createBodySchema, { ...BODY, lines: [{ param: 'A', rating: 1 }] }],
      [updateBodySchema, { ...BODY, lines: [{ lineId: '11', param: 'A', rating: 1 }] }],
    ]) {
      const forged = { ...body, totalRating: 99, evaluationResult: 'ACCEPTABLE' };
      assert.deepEqual(errorsOf(schema, forged), [], 'accepted for compatibility');
      const value = valueOf(schema, forged);
      assert.equal('totalRating' in value || 'evaluationResult' in value, false, 'stripped');
      assert.deepEqual(errorsOf(schema, { ...body, totalRating: 'x' }), [], 'any value is ignored');
    }
    const { service, writes } = fakeService();
    const forged = { totalRating: 99, evaluationResult: 'ACCEPTABLE' };
    await service.create(
      ACTOR,
      valueOf(createBodySchema, { ...BODY, ...forged, lines: [{ param: 'A', rating: 1 }] }),
    );
    await service.update(
      ACTOR,
      '7',
      valueOf(updateBodySchema, {
        ...BODY,
        ...forged,
        lines: [{ lineId: '11', param: 'A', rating: 2 }],
      }),
    );
    assert.deepEqual([writes.headers[0].totalRating, writes.headerUpdates[0].totalRating], [1, 2]);
    // Even a service caller that bypasses the schema cannot set the total.
    await service.create(ACTOR, { ...BODY, totalRating: 99, lines: [{ param: 'A', rating: 3 }] });
    assert.equal(writes.headers[1].totalRating, 3);
  });

  it('returns the total and result computed from the stored ratings on read', async () => {
    const rated = (count) =>
      Array.from({ length: count }, (_, index) => ({ lineId: `${index + 1}`, rating: 5 }));
    for (const [lines, expected] of [
      [rated(14), [70, 'NOT_ACCEPTABLE']],
      [rated(15), [75, 'ACCEPTABLE']],
      [[{ lineId: '1', rating: 0 }], [0, 'NOT_ACCEPTABLE']],
    ]) {
      // A stored TOTAL_RATING that disagrees with the lines is not trusted.
      const { service } = fakeService({ header: { totalRating: 99 }, lines });
      const detail = await service.get(ACTOR, '7');
      assert.deepEqual([detail.totalRating, detail.evaluationResult], expected);
    }
  });

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

describe('probation parity: evaluation result and list', () => {
  it('derives Acceptable from 71 and Not acceptable at 70 and below', () => {
    assert.deepEqual([0, 70, 71, 100, '71'].map(evaluationResult), [
      'NOT_ACCEPTABLE',
      'NOT_ACCEPTABLE',
      'ACCEPTABLE',
      'ACCEPTABLE',
      'ACCEPTABLE',
    ]);
  });

  it('returns employee number, department, the evaluation result and pending-at in list rows', async () => {
    const row = (headerId, totalRating) => ({
      headerId,
      formDate: '2000-01-01',
      employeeName: 'Sample Employee 001',
      employeeNumber: 'E-0001',
      department: 'Sample Department',
      totalRating,
      requestStatus: 'DRAFT',
      createdAt: '2026-11-02',
    });
    const { service } = fakeService({ listItems: [row('7', 71), row('8', 70)] });
    const { items } = await service.list(ACTOR, { page: 1, pageSize: 20 });
    assert.deepEqual(
      items.map((item) => [
        item.employeeNumber,
        item.department,
        item.evaluationResult,
        item.pendingAt,
        item.formDate,
      ]),
      [
        ['E-0001', 'Sample Department', 'ACCEPTABLE', null, null],
        ['E-0001', 'Sample Department', 'NOT_ACCEPTABLE', null, null],
      ],
    );
  });

  it('filters the list by the four statuses the legacy form stores', () => {
    assert.deepEqual(REQUEST_STATUSES, ['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED']);
    for (const status of REQUEST_STATUSES) {
      assert.equal(listQuerySchema.validate({ requestStatus: status }).error, undefined, status);
    }
    for (const status of ['Rejected', 'Inprocess', 'Approved', 'SUBMITTED']) {
      assert.ok(listQuerySchema.validate({ requestStatus: status }).error, status);
    }
  });

  it('excludes employees with a non-rejected annual appraisal this year in XXZPI_HR_PA_HEADER_TAB (pending HR confirmation)', async () => {
    const connection = fakeConnection(() => []);
    await probationRepository.listEmployees(connection, '100');
    const [{ sql, binds }] = connection.statements;
    assert.match(sql, /CONNECT BY PRIOR FULL_NAME = SUPERVISOR_NAME/);
    assert.match(sql, /NOT EXISTS \(\s*SELECT 1 FROM XXZP\.XXZPI_HR_PA_HEADER_TAB HD/);
    assert.doesNotMatch(
      sql,
      /XXZPI_HR_PAF_HEADER_TAB/,
      'not the legacy PAF table (no longer written)',
    );
    assert.match(sql, /HD\.EMPLOYEE_NUMBER = OT\.EMPLOYEE_NUMBER/);
    assert.match(sql, /HD\.YEAR = TO_CHAR\(SYSDATE, 'YYYY'\)/);
    assert.match(sql, /NVL\(UPPER\(HD\.STATUS\), '-'\) <> 'REJECTED'/);
    assert.deepEqual(binds, { userId: '100' });
  });
});

describe('probation parity: submit rules (ready for the workflow)', () => {
  const complete = {
    comment: 'Prepared comment',
    comments: 'Suggestion',
    lines: [{ rating: 4 }, { rating: 5 }],
  };

  it('accepts a complete evaluation', () => {
    assert.deepEqual(submitProblems(complete), []);
  });

  it('requires Comments, Suggestion and a 1–5 rating on every criterion, as the legacy edit form', () => {
    const fields = (input) => submitProblems(input).map((problem) => problem.field);
    assert.deepEqual(
      fields({ comment: ' ', comments: '-', lines: [{ rating: 0 }, { rating: 3 }, {}] }),
      ['comment', 'comments', 'lines.0.rating', 'lines.2.rating'],
    );
    assert.deepEqual(fields({ ...complete, lines: [] }), ['lines']);
  });

  it('leaves draft saves lenient: comments and ratings stay optional on save', () => {
    assert.deepEqual(
      errorsOf(createBodySchema, { ...BODY, comment: '', comments: '', lines: [{ param: 'A' }] }),
      [],
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
});
