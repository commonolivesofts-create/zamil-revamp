// Probation Evaluation (1064) against the legacy CI3 form (docs/testing/probation-legacy-comparison.md):
// views/probation/probation.php (create) and prf_uplines.php (edit a saved evaluation).
// Mocked client and page source only: no Oracle, no browser. Every person is fictional.
// Known gaps against the legacy behaviour are `todo` tests: they report, they do not fail the run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHrRecruitmentServices } from "../src/features/hr-recruitment/hrRecruitmentService.js";
import {
  blankProbation,
  evaluationTotals,
  resultFor,
  validateProbation,
  withEmployee,
} from "../src/features/hr-recruitment/probation/probationModel.js";
import {
  ALLOCATED_POINTS,
  FORM_TYPE_LABELS,
  RESULT_TEXT,
  approvedBy,
  evaluationResult,
  formResult,
  formTypeLabel,
  isEditable,
  totalRating,
  validateForCreate,
  validateForSubmit,
} from "../src/features/hr-recruitment/probation/probationRules.js";

const PAGE = new URL(
  "../src/features/hr-recruitment/probation/ProbationPage.jsx",
  import.meta.url,
);
const page = () => readFile(PAGE, "utf8");
const BASE = "/hr/probation-evaluations";
const LEGACY_FORM_TYPES = [
  "Workers_Technicians",
  "Trainee",
  "Engineers_Staff",
  "Department_Managers",
  "Supervisors_and_Foremens",
];

function fakeClient(routes) {
  const calls = [];
  const handle =
    (method) =>
    async (path, ...rest) => {
      const call = {
        method,
        path,
        body: method === "POST" || method === "PUT" ? rest[0] : undefined,
        options: method === "GET" ? (rest[0] ?? {}) : (rest[1] ?? {}),
      };
      calls.push(call);
      const route = routes[`${method} ${path}`];
      if (route === undefined) throw new Error(`Unexpected ${method} ${path}`);
      return typeof route === "function" ? route(call) : route;
    };
  return {
    calls,
    get: handle("GET"),
    post: handle("POST"),
    put: handle("PUT"),
    delete: handle("DELETE"),
  };
}
const probations = (client) =>
  createHrRecruitmentServices({ client }).probations;

// A stored row as the legacy table holds it: '-' for empty text, 0 for "not rated".
const STORED = Object.freeze({
  headerId: "7",
  requestStatus: "DRAFT",
  formDate: "2026-08-05",
  evaluationPeriod: "-",
  formType: "Engineers_Staff",
  empId: "-",
  employeeNumber: "E-0001",
  employeeName: "Sample Employee 001",
  jobTitle: "Sample Title",
  grade: 0,
  department: "Sample Department",
  fromDate: "2026-08-05",
  toDate: "2026-11-04",
  createdAt: "2026-11-02",
  preparedBy: "Sample Preparer",
  comment: "-",
  comments: "-",
  totalRating: 9,
  lines: [
    { lineId: "11", param: "Quality of work", paramAr: "-", rating: 5 },
    { lineId: "12", param: "Attendance", paramAr: "-", rating: 4 },
    { lineId: "13", param: "Teamwork", paramAr: "-", rating: 0 },
  ],
});

const EMPLOYEE = Object.freeze({
  employeeId: "5001",
  employeeNumber: "E-0001",
  name: "Sample Employee 001",
  position: "Sample Title",
  grade: "",
  departmentName: "Sample Department",
  startDate: "2026-08-05",
});

// A new evaluation as the page holds it: the criteria of the form type, with ratings.
const draft = (overrides = {}) => ({
  formDate: "2026-08-05",
  formType: "Engineers_Staff",
  fromDate: "2026-08-05",
  toDate: "2026-11-04",
  comment: "",
  comments: "",
  employee: EMPLOYEE,
  lines: [
    { lineId: null, param: "Criterion 1", paramAr: "معيار 1", rating: 5 },
    { lineId: null, param: "Criterion 2", paramAr: "معيار 2", rating: "" },
  ],
  ...overrides,
});
const created = () =>
  fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: STORED },
  });

// ------------------------------------------------------------------ fields

test("parity: legacy '-' and 0 placeholders read back as empty values", async () => {
  const client = fakeClient({ [`GET ${BASE}/7`]: { data: STORED } });
  const record = await probations(client).getById("7");
  assert.equal(record.evaluationPeriod, "", "EVALUATION_PERIOD '-'");
  assert.equal(record.comment, "", "PREPARED_BY_CMNT '-'");
  assert.equal(record.comments, "", "APPROVED_BY_CMNT '-'");
  assert.equal(record.employee.employeeId, "", "EMP_ID '-'");
  assert.equal(record.lines[0].paramAr, "", "PARAMA_NAME_AR '-'");
  assert.equal(record.employee.grade, "0", "GRADE: legacy stores 0");
  assert.equal(record.preparedBy, "Sample Preparer", "USER_NAME");
  assert.deepEqual(
    record.lines.map((line) => line.rating),
    [5, 4, ""],
    "RATING_LINE 0 is 'not rated', as the legacy empty select",
  );
});

test("parity: dates arrive as YYYY-MM-DD; older DD-Mon-YYYY / DD-Mon-YY values still convert", async () => {
  const iso = await probations(
    fakeClient({ [`GET ${BASE}/7`]: { data: STORED } }),
  ).getById("7");
  assert.deepEqual(
    [iso.formDate, iso.fromDate, iso.toDate, iso.createdAt],
    ["2026-08-05", "2026-08-05", "2026-11-04", "2026-11-02"],
  );
  const client = fakeClient({
    [`GET ${BASE}/7`]: {
      data: { ...STORED, formDate: "05-AUG-26", toDate: "04-Nov-2026" },
    },
  });
  const record = await probations(client).getById("7");
  assert.equal(record.formDate, "2026-08-05");
  assert.equal(record.toDate, "2026-11-04");
});

test("parity: the five legacy form types with the legacy labels", async () => {
  const client = fakeClient({
    [`GET ${BASE}/lookups/form-types`]: {
      data: { formTypes: LEGACY_FORM_TYPES },
    },
    [`GET ${BASE}/lookups/requestor`]: { data: null },
  });
  const lookups = await probations(client).getLookups();
  assert.deepEqual(
    lookups.probation.formTypes.map((type) => type.code),
    LEGACY_FORM_TYPES,
  );
  assert.deepEqual(LEGACY_FORM_TYPES.map(formTypeLabel), [
    "Workers_Technicians",
    "Trainee",
    "Engineers & Staff",
    "Department Managers",
    "Supervisors and Foremens",
  ]);
  assert.deepEqual(Object.keys(FORM_TYPE_LABELS), LEGACY_FORM_TYPES);
  assert.match(await page(), /formTypeLabel\(item\.code\)/);
});

test("parity: the create form sends only what legacy saves; the server fills the rest", async () => {
  const client = created();
  await probations(client).save(null, draft());
  const body = client.calls.find((call) => call.method === "POST").body;
  assert.deepEqual(body, {
    formType: "Engineers_Staff", // FORM_NAME (dropSelect)
    employeeNumber: "E-0001", // EMP_NUMBER; name, job title and department from the master
    formDate: "2026-08-05", // FORM_DATE (prf_date, the joining date)
    fromDate: "2026-08-05",
    toDate: "2026-11-04",
    // Ratings by criterion position; blank omitted (stored 0). The texts come from the form type.
    lines: [{ rating: 5 }, {}],
  });
});

test("parity: the joining date is sent when known and omitted when blank", async () => {
  const client = created();
  const service = probations(client);
  await service.save(null, draft());
  await service.save(null, draft({ formDate: "" }));
  const [known, blank] = client.calls
    .filter((call) => call.method === "POST")
    .map((call) => call.body);
  assert.equal(known.formDate, "2026-08-05");
  assert.equal("formDate" in blank, false);
});

test("parity: the edit form sends Comments, Suggestion and every line's rating only", async () => {
  const client = fakeClient({
    [`GET ${BASE}/7`]: { data: STORED },
    [`PUT ${BASE}/7`]: { data: { headerId: "7" } },
  });
  const service = probations(client);
  const record = await service.getById("7");
  await service.save("7", {
    ...record,
    comment: "Prepared",
    comments: "Suggestion",
    lines: record.lines.map((line) => ({ ...line, rating: "3" })),
  });
  assert.deepEqual(client.calls.find((call) => call.method === "PUT").body, {
    comment: "Prepared",
    comments: "Suggestion",
    lines: [
      { lineId: "11", rating: 3 },
      { lineId: "12", rating: 3 },
      { lineId: "13", rating: 3 },
    ],
  });
});

test("parity: the client sends no total or result; the server computes them", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`PUT ${BASE}/7`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: { ...STORED, totalRating: 9 } },
  });
  const service = probations(client);
  await service.save(null, draft());
  const record = await service.getById("7");
  await service.save("7", { ...record, lines: record.lines });
  for (const { body } of client.calls.filter((call) => call.body)) {
    assert.equal("totalRating" in body, false);
    assert.equal("evaluationResult" in body, false);
  }
  assert.equal(
    record.totalRating,
    9,
    "the total shown after save comes from the API",
  );
});

// -------------------------------------------------------------- dependencies

test("parity: choosing a form type loads its criteria (legacy showDropInfo) and replaces the rows", async () => {
  const client = fakeClient({
    [`GET ${BASE}/lookups/criteria`]: {
      data: {
        formType: "Trainee",
        criteria: [
          { param: "Criterion 1", paramAr: "معيار 1" },
          { param: "Criterion 2", paramAr: null },
        ],
      },
    },
  });
  const criteria = await probations(client).criteria("Trainee");
  assert.deepEqual(criteria, [
    { param: "Criterion 1", paramAr: "معيار 1" },
    { param: "Criterion 2", paramAr: "" },
  ]);
  assert.deepEqual(client.calls[0].options.params, { formType: "Trainee" });
  const source = await page();
  assert.match(source, /const items = await service\.criteria\(formType\)/);
  assert.match(source, /patch\(\{ lines: criteriaLines\(items\) \}\)/);
  assert.match(
    source,
    /patch\(\{ formType, lines: \[\] \}\)/,
    "rows cleared while loading",
  );
  assert.match(source, /'Select Form name'/, "the legacy empty-table text");
  assert.doesNotMatch(
    source,
    /Add criterion|Remove criterion|pa-param/,
    "no typed criteria",
  );
});

test("parity: each criterion shows English and Arabic text, Allocated 5 and Points 1–5", async () => {
  assert.equal(ALLOCATED_POINTS, 5);
  const source = await page();
  assert.match(source, /<b>\{line\.param\}<\/b>/);
  assert.match(source, /<small lang="ar" dir="rtl">\{line\.paramAr\}<\/small>/);
  assert.match(source, /zrv-hr-criterion__alloc">\{ALLOCATED_POINTS\}/);
  assert.match(source, /\{\[1, 2, 3, 4, 5\]\.map/);
  assert.match(source, /type="radio"/);
  assert.match(source, /معايير التقييم/);
});

test("parity: the page previews the total as the sum of the points (max 20 x 5 = 100)", () => {
  const lines = Array.from({ length: 20 }, () => ({ rating: 5 }));
  assert.equal(totalRating(lines), 100);
  assert.equal(
    totalRating([{ rating: 5 }, { rating: "" }]),
    5,
    "blank counts as 0",
  );
});

test("parity: selecting an employee fills number, job title, department and joining date", async () => {
  const client = fakeClient({
    [`GET ${BASE}/lookups/employee-details`]: {
      data: {
        ids: { personId: "5001", employeeNumber: "E-0001" },
        hire: { startDate: "2026-08-05" },
        job: { name: "Sample Title", jobId: "1" },
        dept: { organizationId: "2", name: "Sample Department" },
      },
    },
  });
  const details = await probations(client).employeeDetails(
    "Sample Employee 001",
  );
  assert.deepEqual(
    [
      details.employeeNumber,
      details.position,
      details.departmentName,
      details.startDate,
      details.grade,
    ],
    ["E-0001", "Sample Title", "Sample Department", "2026-08-05", ""],
    "legacy getEmpDetails fills the same fields; the grade is never filled",
  );
  assert.equal(client.calls[0].options.params.empName, "Sample Employee 001");
  const source = await page();
  assert.match(source, /patch\(\{ employee: details, formDate: details\.startDate \|\| '' \}\)/);
  assert.match(source, /patch\(\{ employee: item, formDate: '' \}\)/, "cleared while loading");
});

test("parity: the joining date is an editable date on the create form (legacy prf_date), shown on a saved one", async () => {
  const source = await page();
  assert.match(
    source,
    /field\('pa-joining', 'formDate', 'Joining Date'\)/,
  );
  assert.match(
    source,
    /readOnly\('pa-joining', 'Joining Date', form\.formDate\)/,
  );
  assert.match(
    source,
    /readOnly\('pa-grade', 'Job Grade', employee\?\.grade\)/,
    "never filled",
  );
});

test("parity: evaluation result 0–70 Not Acceptable, 71–100 Acceptable", () => {
  assert.deepEqual([70, 71, 100, 0].map(resultFor), [
    "NOT_ACCEPTABLE",
    "ACCEPTABLE",
    "ACCEPTABLE",
    "NOT_ACCEPTABLE",
  ]);
  const criteria = [{ code: "A", points: 100 }];
  assert.equal(evaluationTotals(criteria, { A: 71 }).acceptable, true);
  assert.equal(evaluationTotals(criteria, { A: 70 }).acceptable, false);
  assert.deepEqual([0, 70, 71, "71"].map(evaluationResult), [
    "NOT_ACCEPTABLE",
    "NOT_ACCEPTABLE",
    "ACCEPTABLE",
    "ACCEPTABLE",
  ]);
  const rated = (ratings) => ratings.map((rating) => ({ rating }));
  assert.equal(
    formResult(rated(["", ""])),
    null,
    "no result before any rating",
  );
  assert.equal(formResult(rated(Array(15).fill(5))), "ACCEPTABLE", "75");
  assert.equal(formResult(rated(Array(14).fill(5))), "NOT_ACCEPTABLE", "70");
  assert.deepEqual(RESULT_TEXT, {
    ACCEPTABLE: "Acceptable",
    NOT_ACCEPTABLE: "Not Acceptable",
  });
});

test("parity: the page shows the result and the legacy bands", async () => {
  const source = await page();
  assert.match(source, /const result = formResult\(form\.lines\)/);
  assert.match(source, /\{ k: 'Evaluation Result', v: resultPill \}/);
  assert.match(
    source,
    /Not Acceptable from 0% to 70%, Acceptable from 71% to 100%/,
  );
});

test("parity: Approved by shows HR SUPERVISOR once approved; Prepared & Agreed by is the preparer", async () => {
  assert.deepEqual(["APPROVED", "DRAFT", "INPROCESS", null].map(approvedBy), [
    "HR SUPERVISOR",
    "",
    "",
    "",
  ]);
  const source = await page();
  assert.match(
    source,
    /readOnly\('pa-approved', 'Approved by', approvedBy\(record\?\.status\)\)/,
  );
  assert.match(
    source,
    /readOnly\('pa-prepared', 'Prepared & Agreed by', saved \? record\.preparedBy : lookups\.requestor\?\.fullName\)/,
  );
});

// ---------------------------------------------------------------- validation

test("parity: a new evaluation needs the form type with criteria, the employee and From / To", () => {
  const criteria = draft().lines;
  assert.deepEqual(
    validateForCreate(draft(), { employee: EMPLOYEE, criteria }),
    {
      errors: {},
      valid: true,
    },
  );
  const empty = validateForCreate(
    { ...draft(), formType: "", fromDate: "", toDate: "" },
    { employee: null, criteria: [] },
  );
  assert.deepEqual(Object.keys(empty.errors), [
    "formType",
    "employee",
    "fromDate",
    "toDate",
  ]);
  assert.equal(
    validateForCreate(draft(), { employee: EMPLOYEE, criteria: [] }).errors
      .formType,
    "The criteria of this form type are not available.",
  );
  assert.ok(
    validateForCreate(draft({ toDate: "2026-08-04" }), {
      employee: EMPLOYEE,
      criteria,
    }).errors.toDate,
  );
  // Points are optional on the create form; Comments and Suggestion are read only there.
  assert.equal(
    validateForCreate(
      draft({ lines: criteria.map((line) => ({ ...line, rating: "" })) }),
      { employee: EMPLOYEE, criteria },
    ).valid,
    true,
  );
});

test("parity: a saved evaluation needs Comments, Suggestion and every rating (legacy edit form)", () => {
  const lines = [{ rating: 4 }, { rating: "" }];
  const incomplete = validateForSubmit({ comment: " ", comments: "", lines });
  assert.deepEqual(Object.keys(incomplete.errors), [
    "comment",
    "comments",
    "rating:1",
  ]);
  assert.deepEqual(
    validateForSubmit({
      comment: "Prepared",
      comments: "Suggestion",
      lines: [{ rating: 4 }, { rating: "3" }],
    }),
    { errors: {}, valid: true },
  );
});

test("parity: the page validates by stage, as the two legacy views", async () => {
  const source = await page();
  const rules = await readFile(new URL('probationForm.js', PAGE), 'utf8');
  assert.match(
    rules,
    /saved \? validateForSubmit\(form\) : validateForCreate\(form, \{ employee: form\.employee, criteria: form\.lines \}\)/,
  );
  // Comments and Suggestion are read only until the first save (legacy textarea readonly).
  assert.match(source, /fieldProps\('pa-comment',[^>]*readOnly=\{!saved\}/);
  assert.match(source, /fieldProps\('pa-comments',[^>]*readOnly=\{!saved\}/);
  assert.match(source, /label="Comments" required=\{saved\}/);
  assert.match(source, /label="Suggestion" required=\{saved\}/);
  assert.match(source, /maxLength=\{500\}/, "VARCHAR2(500)");
});

test("new-only fields of the demo model stay optional: recommendation, extension, justification", () => {
  const criteria = [{ code: "A", points: 100 }];
  const base = {
    ...withEmployee(blankProbation(), {
      employeeId: "5001",
      startDate: "2026-08-05",
      evaluationFormCode: "STAFF",
    }),
    scores: { A: 40 },
  };
  const context = { employee: { startDate: "2026-08-05" }, criteria };
  assert.deepEqual(validateProbation(base, context).errors, {});
  assert.deepEqual(
    validateProbation(
      { ...base, recommendation: "EXTEND", extendBy: "" },
      context,
    ).errors,
    {},
  );
});

// --------------------------------------------------------------------- flow

test("parity: a saved evaluation keeps its header (legacy edit saves only comments and points)", async () => {
  const source = await page();
  assert.match(source, /disabled=\{saved\}/, "form type");
  assert.match(
    source,
    /saved \? readOnly\('pa-emp', 'Employee Name', employee\?\.name\)/,
  );
  assert.match(
    source,
    /readOnly\('pa-from', 'Evaluation Period From', form\.fromDate\)/,
  );
  assert.match(
    source,
    /readOnly\('pa-to', 'Evaluation Period To', form\.toDate\)/,
  );
});

test("parity: Draft and Rejected are editable; Inprocess and Approved are read only", async () => {
  assert.deepEqual(
    ["DRAFT", "REJECTED", "Rejected", "INPROCESS", "APPROVED"].map(isEditable),
    [true, true, true, false, false],
  );
  const source = await page();
  assert.match(source, /const locked = !canSave \|\| \(saved && !isEditable\(record\.status\)\)/);
  assert.match(source, /locked=\{locked\}/);
  assert.match(source, /if \(locked \|\| saving \|\| editor\.pending \|\| !navigation\.validateAll\(\)\) return/);
});

test("parity: legacy toolbar actions with explicit Save draft, Save changes and New evaluation labels", async () => {
  const source = await page();
  assert.match(source, /saved \? 'Save changes' : 'Save draft'/);
  assert.match(source, /label: 'Report'/);
  assert.match(source, /label: 'New evaluation'/);
  assert.match(source, /label: 'Print', onClick: \(\) => window\.print\(\)/);
});

test("parity: probation makes it clear that approval submission is still pending setup", async () => {
  const source = await page();
  assert.match(source, /approval workflow is pending setup/);
  assert.doesNotMatch(source, /service\.submit/);
});

test("parity: the report has the legacy columns, Pending At from the API", async () => {
  // The report is its own page (ProbationReportPage.jsx), opened by the form's Report tool.
  assert.match(await page(), /label: 'Report', onClick: \(\) => leave\(`\$\{BASE\}\/report`\)/);
  const source = await readFile(new URL("ProbationReportPage.jsx", PAGE), "utf8");
  const labels = [...source.matchAll(/\{ key: '\w+', label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(
    labels.slice(labels.indexOf("#")),
    ["#", "Emp. #", "Name", "Job Title", "Department", "Total Rating", "Evaluation", "Status", "Date", "Pending At"],
    "the legacy report columns, in order",
  );
  assert.match(source, /RESULT_TEXT\[row\.evaluationResult\]/);
  assert.match(source, /render: \(row\) => row\.pendingAt \|\|/);
  const client = fakeClient({
    [`GET ${BASE}`]: {
      data: [
        {
          headerId: "7",
          employeeName: "Sample Employee 001",
          employeeNumber: "E-0001",
          jobTitle: "Sample Title",
          department: "Sample Department",
          totalRating: 72,
          evaluationResult: "ACCEPTABLE",
          requestStatus: "INPROCESS",
          pendingAt: "Sample Approver",
          createdAt: "2026-11-02",
        },
        { headerId: "8", totalRating: 10, evaluationResult: "UNKNOWN" },
      ],
      pagination: { page: 1, limit: 20, total: 2 },
    },
  });
  const [item, unknown] = (await probations(client).list()).items;
  assert.deepEqual(
    [
      item.status,
      item.totalRating,
      item.evaluationResult,
      item.pendingAt,
      item.createdAt,
    ],
    ["INPROCESS", 72, "ACCEPTABLE", "Sample Approver", "2026-11-02"],
  );
  assert.equal(unknown.evaluationResult, "", "an unknown result is not shown");
});
