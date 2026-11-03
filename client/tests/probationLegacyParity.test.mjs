// Probation Evaluation (1064) against the legacy CI3 form (docs/testing/probation-legacy-comparison.md).
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
  RESULT_TEXT,
  evaluationResult,
  formResult,
  totalRating,
  validateForSubmit,
} from "../src/features/hr-recruitment/probation/probationRules.js";

const PAGE = new URL(
  "../src/features/hr-recruitment/probation/ProbationPage.jsx",
  import.meta.url,
);
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

const draft = (overrides = {}) => ({
  formDate: "2026-08-05",
  evaluationPeriod: "",
  formType: "Engineers_Staff",
  fromDate: "2026-08-05",
  toDate: "2026-11-04",
  comment: "",
  comments: "",
  employee: EMPLOYEE,
  lines: [
    { lineId: null, param: "Quality of work", paramAr: "", rating: 5 },
    { lineId: null, param: "Attendance", paramAr: "", rating: "" },
  ],
  ...overrides,
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
  assert.equal(record.fromDate, "2026-08-05");
  assert.equal(record.toDate, "2026-11-04");
});

test("parity: header fields map to the legacy columns on save", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: STORED },
  });
  await probations(client).save(null, draft());
  const body = client.calls.find((call) => call.method === "POST").body;
  assert.deepEqual(
    {
      formType: body.formType, // FORM_NAME (dropSelect)
      employeeName: body.employeeName, // EMP_NAME
      employeeNumber: body.employeeNumber, // EMP_NUMBER
      jobTitle: body.jobTitle, // JOB_T
      department: body.department, // DEPARTMENT
      fromDate: body.fromDate, // FROM_DATE
      toDate: body.toDate, // TO_DATE
      grade: body.grade, // GRADE: legacy '' -> 0
    },
    {
      formType: "Engineers_Staff",
      employeeName: EMPLOYEE.name,
      employeeNumber: EMPLOYEE.employeeNumber,
      jobTitle: EMPLOYEE.position,
      department: EMPLOYEE.departmentName,
      fromDate: "2026-08-05",
      toDate: "2026-11-04",
      grade: 0,
    },
  );
  assert.equal(
    "userName" in body || "userMail" in body,
    false,
    "prepared by (USER_NAME/USER_MAIL) comes from the session, not the client",
  );
});

test("parity: lines carry criterion, Arabic criterion and a 1–5 rating; blank is omitted (stored 0)", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: STORED },
  });
  await probations(client).save(null, draft());
  const { lines } = client.calls.find((call) => call.method === "POST").body;
  assert.deepEqual(lines, [
    { param: "Quality of work", paramAr: "", rating: 5 },
    { param: "Attendance", paramAr: "" },
  ]);
});

test("parity: update sends each LINE_ID, as the legacy line_id<n> hidden fields", async () => {
  const client = fakeClient({
    [`GET ${BASE}/7`]: { data: STORED },
    [`PUT ${BASE}/7`]: { data: { headerId: "7" } },
  });
  const service = probations(client);
  const record = await service.getById("7");
  await service.save("7", { ...record, lines: record.lines });
  const { lines } = client.calls.find((call) => call.method === "PUT").body;
  assert.deepEqual(
    lines.map((line) => line.lineId),
    ["11", "12", "13"],
  );
});

// -------------------------------------------------------------- dependencies

test("parity: the page previews the total as the sum of the ratings (max 20 x 5 = 100)", () => {
  const lines = Array.from({ length: 20 }, () => ({ rating: 5 }));
  assert.equal(totalRating(lines), 100);
  assert.equal(
    totalRating([{ rating: 5 }, { rating: "" }]),
    5,
    "a blank rating counts as 0",
  );
});

test("parity: the client sends no total or result; the server computes them from the ratings", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`PUT ${BASE}/7`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: {
      data: { ...STORED, totalRating: 9, evaluationResult: "NOT_ACCEPTABLE" },
    },
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

test("parity: selecting an employee fills number, job title, department and joining date from HR records", async () => {
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
    {
      employeeNumber: details.employeeNumber,
      position: details.position,
      departmentName: details.departmentName,
      startDate: details.startDate,
      grade: details.grade,
    },
    {
      employeeNumber: "E-0001",
      position: "Sample Title",
      departmentName: "Sample Department",
      startDate: "2026-08-05",
      grade: "",
    },
    "legacy getEmpDetails fills the same fields; grade is never filled there either",
  );
  assert.equal(
    client.calls[0].options.params.empName,
    "Sample Employee 001",
    "looked up by full name, as legacy emp_name",
  );
});

test("parity: evaluation result threshold is 0–70 Not acceptable, 71–100 Acceptable", () => {
  assert.deepEqual([70, 71, 100, 0].map(resultFor), [
    "NOT_ACCEPTABLE",
    "ACCEPTABLE",
    "ACCEPTABLE",
    "NOT_ACCEPTABLE",
  ]);
  const criteria = [{ code: "A", points: 100 }];
  assert.equal(evaluationTotals(criteria, { A: 71 }).acceptable, true);
  assert.equal(evaluationTotals(criteria, { A: 70 }).acceptable, false);
});

test("parity: the result band is computed from the total: 71+ Acceptable, 70 and below Not acceptable", () => {
  assert.deepEqual([0, 70, 71, 100, "71"].map(evaluationResult), [
    "NOT_ACCEPTABLE",
    "NOT_ACCEPTABLE",
    "ACCEPTABLE",
    "ACCEPTABLE",
    "ACCEPTABLE",
  ]);
  const rated = (ratings) =>
    ratings.map((rating) => ({ param: "C", paramAr: "", rating }));
  assert.equal(totalRating(rated([5, 4, ""])), 9);
  assert.equal(
    formResult(rated(["", ""])),
    null,
    "no result before any rating",
  );
  assert.equal(formResult(rated(Array(15).fill(5))), "ACCEPTABLE", "75");
  assert.equal(formResult(rated(Array(14).fill(5))), "NOT_ACCEPTABLE", "70");
  assert.deepEqual(RESULT_TEXT, {
    ACCEPTABLE: "Acceptable",
    NOT_ACCEPTABLE: "Not acceptable",
  });
});

test("parity: the page shows the result on the form, the side card and the ticket", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(page, /const result = formResult\(form\.lines\)/);
  assert.equal(
    page.match(/\{resultPill\}/g).length,
    3,
    "ratings step, review step and side card",
  );
  assert.match(page, /\{ k: 'Evaluation', v: resultPill \}/);
  assert.match(
    page,
    /71 and above is Acceptable; 70 and below is Not acceptable/,
  );
});

test(
  "parity: choosing a form type loads that type's predefined criteria",
  {
    todo: "MISSING: legacy showDropInfo() (assets/prf-new.js, not in the repository) fills the criteria",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /formTypes[\s\S]*criteria/);
    assert.doesNotMatch(page, /does not provide predefined criteria/);
  },
);

test("parity: FORM_DATE is the joining date: read-only and filled from the selected employee", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(
    page,
    /readOnly\('pa-joining', 'Joining date', form\.formDate\)/,
  );
  assert.match(
    page,
    /patch\(\{ employee: details, formDate: details\.startDate \|\| '' \}\)/,
  );
  assert.match(
    page,
    /patch\(\{ employee: item, formDate: '' \}\)/,
    "cleared while loading",
  );
  assert.doesNotMatch(page, /businessToday|Form date/, "no longer a form date");
  assert.doesNotMatch(page, /next\.formDate/, "not required");
});

test("parity: the joining date is sent when known and omitted when blank", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: STORED },
  });
  const service = probations(client);
  await service.save(null, draft());
  await service.save(null, draft({ formDate: "" }));
  const [known, blank] = client.calls
    .filter((call) => call.method === "POST")
    .map((call) => call.body);
  assert.equal(known.formDate, "2026-08-05");
  assert.equal("formDate" in blank, false);
});

test("parity: a blank joining date (null from the API) reads back empty; the created date is kept", async () => {
  const client = fakeClient({
    [`GET ${BASE}/7`]: { data: { ...STORED, formDate: null } },
  });
  const record = await probations(client).getById("7");
  assert.equal(record.formDate, "");
  assert.equal(record.employee.startDate, "");
  assert.equal(record.createdAt, "2026-11-02");
  const page = await readFile(PAGE, "utf8");
  assert.match(
    page,
    /\{ k: 'Created', v: record\?\.createdAt \|\| 'Set on save' \}/,
  );
});

// ---------------------------------------------------------------- validation

test("parity: page requires employee, form type, evaluation from/to and criterion text; other fields optional", async () => {
  const page = await readFile(PAGE, "utf8");
  const requiredIds = [...page.matchAll(/id="(pa-[\w-]+)"[^>]*\brequired\b/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(requiredIds, ["pa-emp", "pa-from", "pa-to", "pa-type"]);
  assert.match(page, /label=\{`Criterion \$\{index \+ 1\}`\} required/);
  for (const optional of [
    "pa-period",
    "pa-grade",
    "pa-comment",
    "pa-comments",
  ]) {
    assert.doesNotMatch(
      page,
      new RegExp(`id="${optional}"[^>]*\\brequired\\b`),
      optional,
    );
  }
  assert.match(page, /toDate < form\.fromDate/, "end on or after start");
  assert.match(page, /form\.lines\.length > 20/, "at most 20 criteria");
  assert.match(page, /\[1, 2, 3, 4, 5\]/, "rating options 1–5");
});

test("parity: the five legacy form types come from the server lookup", async () => {
  const client = fakeClient({
    [`GET ${BASE}/lookups/form-types`]: {
      data: { formTypes: LEGACY_FORM_TYPES },
    },
    [`GET ${BASE}/lookups/employees`]: { data: [] },
    [`GET ${BASE}/lookups/requestor`]: { data: null },
  });
  const lookups = await probations(client).getLookups();
  assert.deepEqual(
    lookups.probation.formTypes.map((type) => type.code),
    LEGACY_FORM_TYPES,
  );
});

test("parity: Comments, Suggestion and every rating are required to submit, not to save a draft", async () => {
  const lines = [
    { param: "A", paramAr: "", rating: 4 },
    { param: "B", paramAr: "", rating: "" },
  ];
  const incomplete = validateForSubmit({ comment: " ", comments: "", lines });
  assert.deepEqual(Object.keys(incomplete.errors), [
    "comment",
    "comments",
    "rating:1",
  ]);
  assert.equal(incomplete.valid, false);
  assert.deepEqual(
    validateForSubmit({
      comment: "Prepared",
      comments: "Suggestion",
      lines: [{ ...lines[0] }, { ...lines[1], rating: "3" }],
    }),
    { errors: {}, valid: true },
  );
  assert.deepEqual(
    Object.keys(
      validateForSubmit({ comment: "a", comments: "b", lines: [] }).errors,
    ),
    ["lines"],
  );
  const page = await readFile(PAGE, "utf8");
  assert.doesNotMatch(page, /validateForSubmit/, "not wired: no Submit yet");
  assert.doesNotMatch(
    page,
    /next\.comment/,
    "draft save keeps comments optional",
  );
  assert.match(page, /label="Comments"/);
  assert.match(page, /label="Suggestion"/);
});

test("new-only fields stay optional: recommendation, extension, justification, signatures", () => {
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
  assert.deepEqual(
    validateProbation({ ...base, recommendation: "CONFIRM" }, context).errors,
    {},
    "contradicting the result without a justification",
  );
});

// --------------------------------------------------------------------- flow

test("parity: new records start as DRAFT and the list maps status and total", async () => {
  const client = fakeClient({
    [`GET ${BASE}`]: {
      data: [
        {
          headerId: "7",
          employeeName: "Sample Employee 001",
          employeeNumber: "E-0001",
          jobTitle: "Sample Title",
          department: "Sample Department",
          formType: "Trainee",
          totalRating: 72,
          evaluationResult: "ACCEPTABLE",
          requestStatus: "DRAFT",
          pendingAt: null,
          createdAt: "2026-11-02",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    },
  });
  const list = await probations(client).list();
  const [item] = list.items;
  assert.deepEqual(
    [item.status, item.totalRating, item.formType],
    ["DRAFT", 72, "Trainee"],
  );
  assert.deepEqual(
    [
      item.employeeNumber,
      item.jobTitle,
      item.department,
      item.evaluationResult,
      item.pendingAt,
      item.createdAt,
    ],
    [
      "E-0001",
      "Sample Title",
      "Sample Department",
      "ACCEPTABLE",
      "",
      "2026-11-02",
    ],
    "from the API only",
  );
});

test("parity: Save draft and Print are available; Print uses the browser print", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(page, /label: 'Save draft', onClick: save/);
  assert.match(page, /label: 'Print', onClick: \(\) => window\.print\(\)/);
  assert.match(page, /label: 'Records'/, "legacy Report link");
});

test(
  "parity: Submit sends the evaluation into the two-step approval workflow",
  {
    todo: "MISSING: legacy ProbationFlow/submit (DRAFT -> INPROCESS -> APPROVED/REJECTED); out of scope in the spec",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /service\.submit/);
  },
);

test("parity: the records list shows employee number, job title, department, evaluation result, pending-at and the created date", async () => {
  // The records list is the report page (ProbationReportPage.jsx).
  const page = await readFile(new URL("ProbationReportPage.jsx", PAGE), "utf8");
  for (const column of [
    "row\\.employeeNumber",
    "row\\.jobTitle",
    "key: 'department', label: 'Department', render: \\(row\\) => row\\.department",
    "RESULT_TEXT\\[row\\.evaluationResult\\]",
    "key: 'pendingAt', label: 'Pending at', render: \\(row\\) => row\\.pendingAt",
    "key: 'created', label: 'Created', sort: 'CREATED_AT', render: \\(row\\) => \\(row\\.createdAt",
  ]) {
    assert.match(page, new RegExp(column), column);
  }
  const client = fakeClient({
    [`GET ${BASE}`]: {
      data: [{ headerId: "8", totalRating: 10, evaluationResult: "UNKNOWN" }],
      pagination: { page: 1, limit: 20, total: 1 },
    },
  });
  const [item] = (await probations(client).list()).items;
  assert.equal(item.evaluationResult, "", "an unknown result is not shown");
});

test("new-only EMP_ID (person ID) is optional: a legacy record with EMP_ID '-' can be saved", async () => {
  const page = await readFile(PAGE, "utf8");
  const rule = page.match(
    /if \(!employee\?\.name[^\n]*complete employee details/,
  )[0];
  assert.doesNotMatch(rule, /employeeId/);
  const client = fakeClient({
    [`GET ${BASE}/7`]: { data: STORED },
    [`PUT ${BASE}/7`]: { data: { headerId: "7" } },
  });
  const service = probations(client);
  const record = await service.getById("7");
  assert.equal(record.employee.employeeId, "");
  await service.save("7", { ...record, lines: record.lines });
  assert.equal(
    client.calls.find((call) => call.method === "PUT").body.empId,
    "",
    "sent empty; the server stores the legacy '-'",
  );
});
