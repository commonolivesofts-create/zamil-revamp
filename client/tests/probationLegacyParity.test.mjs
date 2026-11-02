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
  formDate: "05-Aug-2026",
  evaluationPeriod: "-",
  formType: "Engineers_Staff",
  empId: "-",
  employeeNumber: "E-0001",
  employeeName: "Sample Employee 001",
  jobTitle: "Sample Title",
  grade: 0,
  department: "Sample Department",
  fromDate: "05-Aug-2026",
  toDate: "04-Nov-2026",
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
  formDate: "2026-11-02",
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

test("parity: legacy DD-Mon-YYYY and DD-Mon-YY dates convert to ISO", async () => {
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

test("parity: total rating is the sum of the line ratings (legacy TOTAL_RATING, max 20 x 5 = 100)", async () => {
  const client = fakeClient({
    [`POST ${BASE}`]: { data: { headerId: "7" } },
    [`GET ${BASE}/7`]: { data: STORED },
  });
  const lines = Array.from({ length: 20 }, (_, index) => ({
    lineId: null,
    param: `Criterion ${index + 1}`,
    paramAr: "",
    rating: 5,
  }));
  await probations(client).save(null, draft({ lines }));
  const body = client.calls.find((call) => call.method === "POST").body;
  assert.equal(body.totalRating, 100);
  await probations(client).save(null, draft());
  assert.equal(
    client.calls.filter((call) => call.method === "POST")[1].body.totalRating,
    5,
    "a blank rating counts as 0",
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

test(
  "parity: the live page shows the Acceptable / Not acceptable result next to the total",
  {
    todo: "MISSING in new page: legacy shows the result band (error-con/success-con)",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /resultFor|Acceptable/);
  },
);

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

test(
  "parity: the joining date fills from the selected employee (legacy prf_date -> FORM_DATE)",
  {
    todo: "DIFFERENT: the new page uses FORM_DATE as a form date defaulting to today",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /startDate/);
  },
);

// ---------------------------------------------------------------- validation

test("parity: page requires employee, form type, evaluation from/to and criterion text; other fields optional", async () => {
  const page = await readFile(PAGE, "utf8");
  const requiredIds = [...page.matchAll(/id="(pa-[\w-]+)"[^>]*\brequired\b/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(requiredIds, [
    "pa-emp",
    "pa-form-date",
    "pa-from",
    "pa-to",
    "pa-type",
  ]);
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

test(
  "parity: Comments and Suggestion are required when editing a saved evaluation",
  {
    todo: "DIFFERENT: legacy prf_uplines marks both textareas required; new keeps them optional",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /id="pa-comment"[^>]*\brequired\b/);
  },
);

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
          formType: "Trainee",
          totalRating: 72,
          requestStatus: "DRAFT",
          createdAt: "02-Nov-26",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1 },
    },
  });
  const list = await probations(client).list();
  assert.deepEqual(
    [list.items[0].status, list.items[0].totalRating, list.items[0].formType],
    ["DRAFT", 72, "Trainee"],
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

test(
  "parity: the records list shows employee number, department, evaluation result and pending-at",
  {
    todo: "MISSING: legacy report columns Emp. #, Job Title, Department, Evaluation, Date, Pending At",
  },
  async () => {
    const page = await readFile(PAGE, "utf8");
    assert.match(page, /\["Department"/);
    assert.match(page, /Pending at/i);
  },
);

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
