// Probation Evaluation (1064) against the legacy CI3 form (docs/testing/probation-legacy-comparison.md).
// Joi schemas, SQL text and the service with a fake repository: no Oracle. Every person is fictional.
// Known gaps against the legacy behaviour are `todo` tests: they report, they do not fail the run.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as probationRepository from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';
import {
  CRITERIA_COUNT,
  EDITABLE_STATUSES,
  evaluationResult,
  isEditable,
  submitProblems,
} from '../src/modules/hr/probation-evaluations/probationEvaluation.rules.js';
import { createProbationEvaluationService } from '../src/modules/hr/probation-evaluations/probationEvaluation.service.js';
import {
  FORM_TYPES,
  REQUEST_STATUSES,
  createBodySchema,
  criteriaQuerySchema,
  listQuerySchema,
  updateBodySchema,
} from '../src/modules/hr/probation-evaluations/probationEvaluation.validation.js';
import { testCriteria } from './helpers/probationEvaluationFakes.js';

// The legacy create form posts: dropSelect, employee_name / employee_number, prf_date, from_date,
// to_date and the ratings of the form type's criteria.
const BODY = Object.freeze({
  formType: 'Engineers_Staff',
  employeeNumber: 'E-0001',
  formDate: '2026-11-02',
  fromDate: '2026-08-05',
  toDate: '2026-11-04',
  lines: [{ rating: 5 }],
});
// The legacy edit form posts Comments, Suggestion and every rating.
const EDIT = Object.freeze({
  comment: 'Prepared comment',
  comments: 'Suggestion',
  lines: [
    { lineId: '11', rating: 4 },
    { lineId: '12', rating: 5 },
  ],
});
const errorsOf = (schema, body) =>
  (schema.validate(body, { abortEarly: false }).error?.details ?? []).map((item) =>
    item.path.join('.'),
  );
const valueOf = (schema, body) => schema.validate(body).value;
const without = (body, field) =>
  Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));

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

const STORED_LINES = [
  { lineId: '11', headerId: '7', rating: 0, param: 'Criterion 1', paramAr: '-' },
  { lineId: '12', headerId: '7', rating: 0, param: 'Criterion 2', paramAr: '-' },
];

function fakeService({
  requestStatus = 'DRAFT',
  header = {},
  listItems = [],
  lines = STORED_LINES,
  criteria = testCriteria(),
  inHierarchy = true,
} = {}) {
  const writes = { headers: [], lines: [], headerUpdates: [], lineUpdates: [] };
  const repository = {
    findRequestor: async () => ({
      fullName: 'Sample Preparer',
      emailAddress: 'preparer@example.invalid',
    }),
    findHierarchyEmployee: async (_connection, { subjectNumber, subjectName }) =>
      inHierarchy
        ? {
            employeeNumber: subjectNumber ?? 'E-0001',
            fullName: subjectName ?? 'Sample Employee 001',
          }
        : null,
    findCriteria: async () => criteria.map((item) => ({ ...item })),
    insertHeader: async (_connection, input) => (writes.headers.push(input), '7'),
    insertLine: async (_connection, line) => writes.lines.push(line),
    findAccessFacts: async () => ({ createdBy: '100', requestStatus, employeeNumber: 'E-0001' }),
    isHrUser: async () => false,
    updateHeader: async (_connection, input) => (writes.headerUpdates.push(input), true),
    updateLine: async (_connection, line) => (writes.lineUpdates.push(line), true),
    findHeader: async () => ({ headerId: '7', formDate: '2026-08-05', ...header }),
    listLines: async () => lines.map((line) => ({ ...line })),
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
const rejects = (promise, status, code) =>
  assert.rejects(promise, (error) => error.statusCode === status && (!code || error.code === code));

describe('probation parity: create form fields', () => {
  it('requires the form type, the employee and the evaluation period From / To', () => {
    for (const field of ['formType', 'employeeNumber', 'fromDate', 'toDate']) {
      assert.deepEqual(errorsOf(createBodySchema, without(BODY, field)), [field], field);
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

  it('keeps the joining date (prf_date) optional and a real date', () => {
    assert.deepEqual(errorsOf(createBodySchema, without(BODY, 'formDate')), []);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, formDate: '2026-02-30' }), ['formDate']);
  });

  it('ignores the fields the legacy create form does not save or takes from elsewhere', () => {
    const sent = {
      ...BODY,
      employeeName: 'Someone Else',
      jobTitle: 'X',
      department: 'Y',
      grade: 9,
      evaluationPeriod: 'Z',
      empId: '1',
      comment: 'early comment',
      comments: 'early suggestion',
      totalRating: 99,
      evaluationResult: 'ACCEPTABLE',
      lines: [{ rating: 5, param: 'Typed criterion', paramAr: 'x' }],
    };
    assert.deepEqual(errorsOf(createBodySchema, sent), [], 'accepted from older clients');
    const value = valueOf(createBodySchema, sent);
    for (const key of [
      'employeeName',
      'jobTitle',
      'department',
      'grade',
      'evaluationPeriod',
      'empId',
      'comment',
      'comments',
      'totalRating',
      'evaluationResult',
    ]) {
      assert.equal(key in value, false, key);
    }
    assert.deepEqual(value.lines, [{ rating: 5 }]);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, userName: 'Someone Else' }), [
      'userName',
    ]);
  });

  it('takes ratings 1–5 or blank, at most 20', () => {
    const ratings = (count) => Array.from({ length: count }, () => ({ rating: 5 }));
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: ratings(20) }), []);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: ratings(21) }), ['lines']);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: [{ rating: 6 }] }), [
      'lines.0.rating',
    ]);
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, lines: [{}] }), []);
    assert.deepEqual(valueOf(createBodySchema, without(BODY, 'lines')).lines, []);
  });

  it('rejects an end date before the start date (kept from the new form)', () => {
    assert.deepEqual(errorsOf(createBodySchema, { ...BODY, toDate: '2026-08-04' }), ['']);
  });
});

describe('probation parity: create (Probation_Model::add_form_data)', () => {
  it('saves the 20 criteria of the form type with the ratings by position (blank = 0)', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, { ...BODY, lines: [{ rating: 5 }, {}] }));
    assert.equal(writes.lines.length, CRITERIA_COUNT);
    assert.deepEqual(
      writes.lines.slice(0, 3).map((line) => [line.param, line.paramAr, line.rating]),
      [
        ['Criterion 1', 'معيار 1', 5],
        ['Criterion 2', 'معيار 2', 0],
        ['Criterion 3', 'معيار 3', 0],
      ],
    );
    assert.equal(writes.headers[0].totalRating, 5);
  });

  it('stores the legacy values of the fields the create form leaves empty', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    const [header] = writes.headers;
    assert.deepEqual(
      [header.evaluationPeriod, header.comment, header.comments, header.empId, header.grade],
      ['-', '-', '-', '-', 0],
    );
  });

  it('takes the employee from the master and "prepared by" from the session', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    const [header] = writes.headers;
    assert.deepEqual(
      [header.employeeNumber, header.employeeName, header.jobTitle, header.department],
      ['E-0001', 'Sample Employee 001', 'Sample Title', 'Sample Department'],
    );
    assert.deepEqual(
      [header.userName, header.userMail, header.createdBy],
      ['Sample Preparer', 'preparer@example.invalid', '100'],
    );
  });

  it('stores the joining date as entered, a blank one as NULL', async () => {
    const { service, writes } = fakeService();
    await service.create(ACTOR, valueOf(createBodySchema, without(BODY, 'formDate')));
    await service.create(ACTOR, valueOf(createBodySchema, BODY));
    assert.deepEqual(
      writes.headers.map((header) => header.formDate),
      [null, BODY.formDate],
    );
  });

  it('refuses an employee outside the legacy select (the reporting hierarchy)', async () => {
    const { service, writes } = fakeService({ inHierarchy: false });
    await rejects(service.create(ACTOR, valueOf(createBodySchema, BODY)), 403, 'FORBIDDEN');
    assert.equal(writes.headers.length, 0);
  });

  it('refuses a form type whose criteria are not available, and more ratings than criteria', async () => {
    const none = fakeService({ criteria: [] });
    await rejects(
      none.service.create(ACTOR, valueOf(createBodySchema, BODY)),
      422,
      'PROBATION_CRITERIA_UNAVAILABLE',
    );
    const short = fakeService({ criteria: testCriteria().slice(0, 2) });
    await rejects(
      short.service.create(
        ACTOR,
        valueOf(createBodySchema, { ...BODY, lines: [{}, {}, { rating: 1 }] }),
      ),
      400,
      'VALIDATION_ERROR',
    );
    assert.equal(none.writes.headers.length + short.writes.headers.length, 0);
  });
});

describe('probation parity: edit form (prf_uplines.php)', () => {
  it('requires Comments, Suggestion and a rating on every criterion; nothing else is taken', () => {
    assert.deepEqual(errorsOf(updateBodySchema, EDIT), []);
    assert.deepEqual(errorsOf(updateBodySchema, { ...EDIT, comment: ' ', comments: '' }), [
      'comment',
      'comments',
    ]);
    assert.deepEqual(
      errorsOf(updateBodySchema, {
        ...EDIT,
        lines: [{ lineId: '11' }, { lineId: '11', rating: 1 }],
      }),
      ['lines.0.rating', 'lines.1'],
    );
    const value = valueOf(updateBodySchema, {
      ...EDIT,
      ...BODY,
      lines: EDIT.lines,
      employeeName: 'X',
      totalRating: 99,
    });
    assert.deepEqual(Object.keys(value).sort(), ['comment', 'comments', 'lines']);
    assert.equal(errorsOf(updateBodySchema, { ...EDIT, comment: 'x'.repeat(501) })[0], 'comment');
  });

  it('saves the comments, the ratings and the computed total only, and keeps the status', async () => {
    const { service, writes } = fakeService({ requestStatus: 'REJECTED' });
    await service.update(ACTOR, '7', valueOf(updateBodySchema, EDIT));
    assert.deepEqual(writes.headerUpdates, [
      {
        headerId: '7',
        totalRating: 9,
        comment: 'Prepared comment',
        comments: 'Suggestion',
        updatedBy: '100',
      },
    ]);
    assert.deepEqual(writes.lineUpdates, [
      { headerId: '7', lineId: '11', rating: 4 },
      { headerId: '7', lineId: '12', rating: 5 },
    ]);
  });

  it('needs a rating for every stored criterion, and only those', async () => {
    const { service, writes } = fakeService();
    await rejects(
      service.update(ACTOR, '7', { ...EDIT, lines: EDIT.lines.slice(0, 1) }),
      400,
      'VALIDATION_ERROR',
    );
    await rejects(
      service.update(ACTOR, '7', {
        ...EDIT,
        lines: [...EDIT.lines.slice(0, 1), { lineId: '99', rating: 1 }],
      }),
      400,
    );
    // A service caller that bypasses the schema still meets the legacy required fields.
    await rejects(service.update(ACTOR, '7', { ...EDIT, comments: '-' }), 400);
    await rejects(
      service.update(ACTOR, '7', { ...EDIT, lines: [{ lineId: '11', rating: 0 }, EDIT.lines[1]] }),
      400,
    );
    assert.equal(writes.headerUpdates.length, 0);
  });

  it('keeps Inprocess and Approved evaluations read only; Draft and Rejected are editable', async () => {
    assert.deepEqual(EDITABLE_STATUSES, ['DRAFT', 'REJECTED']);
    assert.deepEqual(['DRAFT', 'Rejected', 'INPROCESS', 'APPROVED', null].map(isEditable), [
      true,
      true,
      false,
      false,
      false,
    ]);
    for (const requestStatus of ['INPROCESS', 'APPROVED']) {
      const { service, writes } = fakeService({ requestStatus });
      await rejects(service.update(ACTOR, '7', EDIT), 409, 'PROBATION_EVALUATION_NOT_DRAFT');
      assert.equal(writes.headerUpdates.length, 0);
    }
  });

  it(
    'lets approvers add the Suggestion (APPROVED_BY_CMNT) while the request is INPROCESS',
    { todo: 'The approval workflow is not built; legacy approvers edit the Suggestion in it' },
    async () => {
      const { service } = fakeService({ requestStatus: 'INPROCESS' });
      await service.update(ACTOR, '7', EDIT);
    },
  );
});

describe('probation parity: SQL', () => {
  it('never binds :comment (ORA-01745: COMMENT is a reserved word)', async () => {
    const connection = fakeConnection();
    await probationRepository.insertHeader(connection, { comment: 'a', comments: 'b' });
    await probationRepository.updateHeader(connection, { comment: 'a', comments: 'b' });
    for (const { sql, binds } of connection.statements) {
      assert.doesNotMatch(sql, /:comment\b/);
      assert.equal('comment' in binds || 'comments' in binds, false);
      assert.deepEqual([binds.preparedComment, binds.approvedComment], ['a', 'b']);
      assert.match(sql, /NVL\(:preparedComment, '-'\)/);
      assert.match(sql, /NVL\(:approvedComment, '-'\)/);
    }
  });

  it('updates only the legacy edit columns', async () => {
    const connection = fakeConnection();
    await probationRepository.updateHeader(connection, { headerId: '7' });
    await probationRepository.updateLine(connection, { headerId: '7', lineId: '1', rating: 4 });
    const [header, line] = connection.statements;
    const assigned = (sql) =>
      [...sql.slice(sql.indexOf(' SET '), sql.indexOf(' WHERE ')).matchAll(/\b([A-Z_]+) = /g)].map(
        (match) => match[1],
      );
    assert.deepEqual(assigned(header.sql), [
      'TOTAL_RATING',
      'PREPARED_BY_CMNT',
      'APPROVED_BY_CMNT',
      'UPDATED_AT',
      'UPDATED_BY',
    ]);
    assert.deepEqual(assigned(line.sql), ['RATING_LINE']);
  });

  it('binds and selects every probation date as YYYY-MM-DD', async () => {
    const connection = fakeConnection(() => [
      { HEADER_ID: '7', FORM_DATE: '2026-08-05', TOTAL: 0 },
    ]);
    await probationRepository.insertHeader(connection, { formDate: '2026-08-05' });
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
    const [insert, select, , list] = connection.statements;
    assert.match(insert.sql, /TO_DATE\(:formDate, 'YYYY-MM-DD'\)/);
    assert.match(select.sql, /TO_CHAR\(FORM_DATE, 'YYYY-MM-DD'\) AS FORM_DATE/);
    assert.match(list.sql, /TO_CHAR\(H\.CREATED_AT, 'YYYY-MM-DD'\) AS CREATED_AT/);
  });

  it('reads the criteria of a form type from its latest complete evaluation', async () => {
    const connection = fakeConnection(() => [
      { PARAM_NAME: 'Criterion 1', PARAMA_NAME_AR: 'معيار 1' },
      { PARAM_NAME: 'Criterion 2', PARAMA_NAME_AR: '-' },
    ]);
    const criteria = await probationRepository.findCriteria(connection, 'Trainee');
    assert.deepEqual(criteria, [
      { param: 'Criterion 1', paramAr: 'معيار 1' },
      { param: 'Criterion 2', paramAr: null },
    ]);
    const [{ sql, binds }] = connection.statements;
    assert.deepEqual(binds, { formType: 'Trainee', count: 20 });
    assert.match(sql, /SELECT MAX\(H\.HEADER_ID\)/);
    assert.match(sql, /H\.FORM_NAME = :formType/);
    assert.match(sql, /NVL\(TRIM\(X\.PARAM_NAME\), '-'\) <> '-'\) = :count/);
    assert.match(sql, /ORDER BY L\.LINE_ID/);
    assert.deepEqual(errorsOf(criteriaQuerySchema, { formType: 'Other' }), ['formType']);
  });

  it('lists Pending At from the open CI3 workflow step (XXPHP_WORKFLOW, EPRBF)', async () => {
    const connection = fakeConnection((sql) =>
      sql.includes('COUNT(*)') ? [{ TOTAL: 1 }] : [{ HEADER_ID: '7', PENDING_AT: 'Approver' }],
    );
    const { items } = await probationRepository.listEvaluations(connection, {
      limit: 20,
      offset: 0,
      sortBy: 'HEADER_ID',
      sortDir: 'desc',
    });
    assert.equal(items[0].pendingAt, 'Approver');
    const list = connection.statements[1].sql;
    assert.match(list, /FROM XXPHP_WORKFLOW W/);
    assert.match(list, /W\.MSG_TYPE = 'EPRBF'/);
    assert.match(list, /W\.USER_KEY = TO_CHAR\(H\.HEADER_ID\)/);
    assert.match(list, /W\.STATUS = 'Open'/);
    assert.match(list, /W\.TYPE_PARAM IS NULL/);
  });
});

describe('probation parity: total, result and list', () => {
  it('derives Acceptable from 71 and Not acceptable at 70 and below', () => {
    assert.deepEqual([0, 70, 71, 100, '71'].map(evaluationResult), [
      'NOT_ACCEPTABLE',
      'NOT_ACCEPTABLE',
      'ACCEPTABLE',
      'ACCEPTABLE',
      'ACCEPTABLE',
    ]);
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

  it('returns the legacy report values in list rows, Pending At from the repository', async () => {
    const row = (headerId, totalRating, pendingAt) => ({
      headerId,
      employeeName: 'Sample Employee 001',
      employeeNumber: 'E-0001',
      jobTitle: 'Sample Title',
      department: 'Sample Department',
      totalRating,
      requestStatus: 'INPROCESS',
      createdAt: '2026-11-02',
      pendingAt,
    });
    const { service } = fakeService({
      listItems: [row('7', 71, 'Approver'), row('8', 70, null)],
    });
    const { items } = await service.list(ACTOR, { page: 1, pageSize: 20 });
    assert.deepEqual(
      items.map((item) => [
        item.employeeNumber,
        item.jobTitle,
        item.evaluationResult,
        item.pendingAt,
      ]),
      [
        ['E-0001', 'Sample Title', 'ACCEPTABLE', 'Approver'],
        ['E-0001', 'Sample Title', 'NOT_ACCEPTABLE', null],
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
});

describe('probation parity: employee select and autofill', () => {
  it('excludes employees with a non-rejected annual appraisal this year in XXZPI_HR_PA_HEADER_TAB (pending HR confirmation)', async () => {
    const connection = fakeConnection(() => []);
    await probationRepository.listEmployees(connection, { employeeNumber: 'E-0100' });
    const [{ sql, binds }] = connection.statements;
    assert.match(sql, /CONNECT BY NOCYCLE PRIOR OT\.FULL_NAME = OT\.SUPERVISOR_NAME/);
    assert.match(sql, /NOT EXISTS \(\s*SELECT 1 FROM XXZP\.XXZPI_HR_PA_HEADER_TAB HD/);
    assert.doesNotMatch(
      sql,
      /XXZPI_HR_PAF_HEADER_TAB/,
      'not the legacy PAF table (no longer written)',
    );
    assert.match(sql, /HD\.YEAR = TO_CHAR\(SYSDATE, 'YYYY'\)/);
    assert.match(sql, /NVL\(UPPER\(HD\.STATUS\), '-'\) <> 'REJECTED'/);
    assert.deepEqual(binds, { employeeNumber: 'E-0100', search: null });
  });

  it('starts the hierarchy at the actor found by EMPLOYEE_NUMBER, never by USER_ID', async () => {
    const connection = fakeConnection(() => []);
    await probationRepository.listEmployees(connection, { employeeNumber: 'E-0100' });
    await probationRepository.findHierarchyEmployee(connection, {
      employeeNumber: 'E-0100',
      subjectNumber: 'E-0001',
    });
    for (const { sql } of connection.statements) {
      assert.match(
        sql,
        /START WITH OT\.FULL_NAME = \(\s*SELECT MAX\(FULL_NAME\) FROM XX_DIGI_EMP_MASTER\s+WHERE EMPLOYEE_NUMBER = :employeeNumber AND CURRENT_EMP_FLAG = 'Y'/,
      );
      assert.doesNotMatch(sql, /USER_ID = :userId/);
      assert.match(sql, /LEVEL != 1/, 'the actor is not listed');
    }
  });

  it('filters by name or employee number on the server and caps the list', async () => {
    const connection = fakeConnection(() => [
      {
        HIERARCHY_LEVEL: 2,
        USER_ID: null,
        EMPLOYEE_NUMBER: '1001',
        FULL_NAME: 'Sample Employee 001',
      },
    ]);
    const items = await probationRepository.listEmployees(connection, {
      employeeNumber: 'E-0100',
      search: 'sam',
    });
    const [{ sql, binds }] = connection.statements;
    assert.deepEqual(binds, { employeeNumber: 'E-0100', search: 'sam' });
    assert.match(sql, /INSTR\(UPPER\(FULL_NAME\), UPPER\(:search\)\) > 0/);
    assert.match(sql, /INSTR\(EMPLOYEE_NUMBER, :search\) > 0/);
    assert.match(
      sql,
      new RegExp(`FETCH FIRST ${probationRepository.EMPLOYEE_SEARCH_LIMIT} ROWS ONLY`),
    );
    assert.deepEqual(items, [
      { hierarchyLevel: 2, userId: null, employeeNumber: '1001', fullName: 'Sample Employee 001' },
    ]);
  });

  it('finds one hierarchy employee by number or by name', async () => {
    const connection = fakeConnection(() => []);
    assert.equal(
      await probationRepository.findHierarchyEmployee(connection, {
        employeeNumber: 'E-0100',
        subjectName: 'Sample Employee 001',
      }),
      null,
    );
    const [{ sql, binds }] = connection.statements;
    assert.deepEqual(binds, {
      employeeNumber: 'E-0100',
      subjectNumber: null,
      subjectName: 'Sample Employee 001',
    });
    assert.match(sql, /EMPLOYEE_NUMBER = :subjectNumber/);
    assert.match(sql, /FULL_NAME = :subjectName/);
  });

  it('fills employee details on selection and years in company from the joining date', async () => {
    const { service } = fakeService();
    const details = await service.employeeDetails(ACTOR, 'Sample Employee 001');
    assert.equal(details.ids.employeeNumber, 'E-0001');
    assert.equal(details.job.name, 'Sample Title');
    assert.equal(details.dept.name, 'Sample Department');
    assert.equal(details.hire.startDate, '2020-01-15', 'the joining date fills prf_date');
    assert.ok(
      details.yearsInCompanay >= 6,
      'whole years since joining, as legacy years_in_companay',
    );
    const outside = fakeService({ inHierarchy: false });
    await rejects(outside.service.employeeDetails(ACTOR, 'Sample Employee 001'), 403);
  });

  it('finds "prepared by" and the appraiser by EMPLOYEE_NUMBER', async () => {
    const connection = fakeConnection((sql) =>
      sql.includes('START_DATE')
        ? [{ START_DATE: '2026-01-15' }]
        : [{ PERSON_ID: '7', EMPLOYEE_NUMBER: 'E-1' }],
    );
    await probationRepository.findRequestor(connection, 'E-0100');
    await probationRepository.findEmployeeDetails(connection, {
      empName: 'Sample Employee 001',
      employeeNumber: 'E-0100',
    });
    const requestor = connection.statements[0];
    assert.match(
      requestor.sql,
      /WHERE EMPLOYEE_NUMBER = :employeeNumber AND CURRENT_EMP_FLAG = 'Y'/,
    );
    assert.deepEqual(requestor.binds, { employeeNumber: 'E-0100' });
    const appraiser = connection.statements.find(({ sql }) =>
      sql.includes('SELECT FULL_NAME, PERSON_ID'),
    );
    assert.deepEqual(appraiser.binds, { employeeNumber: 'E-0100' });
    for (const { sql } of connection.statements) assert.doesNotMatch(sql, /USER_ID = :userId/);
  });

  it('passes the actor employee number (not the application user ID) from the service', async () => {
    const calls = [];
    const repository = {
      listEmployees: async (_c, input) => (calls.push(['list', input]), []),
      findRequestor: async (_c, employeeNumber) => (
        calls.push(['requestor', employeeNumber]),
        null
      ),
      findHierarchyEmployee: async (_c, input) => (
        calls.push(['hierarchy', input]),
        { fullName: input.subjectName }
      ),
      findEmployeeDetails: async (_c, input) => (calls.push(['details', input]), null),
    };
    const run = async (_pool, work) => work({});
    const service = createProbationEvaluationService({
      repository,
      withConnection: run,
      withTransaction: run,
    });
    const actor = { userId: '9', employeeNumber: 'E-0100' };
    await service.employees(actor, { search: 'sam' });
    await service.requestor(actor);
    await service.employeeDetails(actor, 'Sample Employee 001').catch(() => {});
    assert.deepEqual(calls, [
      ['list', { employeeNumber: 'E-0100', search: 'sam' }],
      ['requestor', 'E-0100'],
      ['hierarchy', { employeeNumber: 'E-0100', subjectName: 'Sample Employee 001' }],
      ['details', { empName: 'Sample Employee 001', employeeNumber: 'E-0100' }],
    ]);
  });
});

describe('probation parity: submit rules (the legacy edit-form requirements)', () => {
  const complete = {
    comment: 'Prepared comment',
    comments: 'Suggestion',
    lines: [{ rating: 4 }, { rating: 5 }],
  };

  it('accepts a complete evaluation', () => {
    assert.deepEqual(submitProblems(complete), []);
  });

  it('requires Comments, Suggestion and a 1–5 rating on every criterion', () => {
    const fields = (input) => submitProblems(input).map((problem) => problem.field);
    assert.deepEqual(
      fields({ comment: ' ', comments: '-', lines: [{ rating: 0 }, { rating: 3 }, {}] }),
      ['comment', 'comments', 'lines.0.rating', 'lines.2.rating'],
    );
    // Legacy evaluations saved without a form type have no criteria; they still save.
    assert.deepEqual(fields({ ...complete, lines: [] }), []);
  });
});
