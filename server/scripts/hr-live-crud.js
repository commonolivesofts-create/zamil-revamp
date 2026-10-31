// Live CRUD check of the HR recruitment forms against the TEST backend (`npm run hr:live-crud`).
//
// Owner-authorized for TEST only (docs/testing/hrms-recruitment-audit.md §9.4). Runs once, by hand.
// It WRITES test records through the API and deletes every record it created, even when a step
// fails. It never touches records it did not create.
//
// Inputs (server/.env.local, gitignored; never printed, logged or committed):
//   LIVE_TEST_COOKIE   the session cookie from an MFA-verified browser login (`name=value` or value)
//   LIVE_TEST_CSRF     the matching X-CSRF-Token (GET /api/v1/auth/csrf)
//   LIVE_TEST_BASE_URL optional, default http://127.0.0.1:<PORT>/api/v1 (must be loopback)
// Guards, before any request: both secrets set, loopback base URL, NODE_ENV not production, and
// the backend configuration (server/.env) connects to the TEST database (read-only DB_NAME check).
// Output: per-step PASS/FAIL, the created IDs and the cleanup result. No personal data is printed;
// the orientation test needs one real shared-services employee and prints only its ID number.
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';

const TEST_DB_NAME = 'G480281AE328134_ZPADWTEST';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const PREFIX = 'ZZTEST';

const results = [];
const ledger = [];
let me = null;

function fail(message) {
  console.error(`Refusing to run: ${message}`);
  process.exit(2);
}

function guardInputs() {
  const cookie = process.env.LIVE_TEST_COOKIE?.trim();
  const csrf = process.env.LIVE_TEST_CSRF?.trim();
  if (!cookie || !csrf)
    fail('LIVE_TEST_COOKIE and LIVE_TEST_CSRF must be set in server/.env.local.');
  if (config.env === 'production') fail('NODE_ENV is production.');
  const base = process.env.LIVE_TEST_BASE_URL?.trim() || `http://127.0.0.1:${config.port}/api/v1`;
  let url;
  try {
    url = new URL(base);
  } catch {
    fail('LIVE_TEST_BASE_URL is not a URL.');
  }
  if (!LOOPBACK.has(url.hostname)) fail('the base URL must be the local (loopback) TEST backend.');
  const cookieHeader = cookie.includes('=') ? cookie : `${config.auth.cookie.name}=${cookie}`;
  return { base: base.replace(/\/$/, ''), cookieHeader, csrf };
}

async function guardDatabase() {
  await createPool(POOLS.LOW);
  const dbName = await withConnection(POOLS.LOW, async (connection) => {
    const { rows } = await connection.execute(`SELECT SYS_CONTEXT('USERENV', 'DB_NAME') FROM DUAL`);
    return rows[0][0];
  });
  if (dbName !== TEST_DB_NAME) fail(`the backend database is not TEST (DB_NAME ${dbName}).`);
  return dbName;
}

// Read-only check of audit columns on a record this script created.
async function auditColumns(table, idColumn, id, columns) {
  return withConnection(POOLS.LOW, async (connection) => {
    const { rows } = await connection.execute(
      `SELECT ${columns.map((column) => `TO_CHAR(${column})`).join(', ')}
         FROM ${table} WHERE ${idColumn} = :id`,
      { id },
    );
    return rows[0]
      ? Object.fromEntries(columns.map((column, index) => [column, rows[0][index]]))
      : null;
  });
}

function client({ base, cookieHeader, csrf }) {
  return async function api(method, path, { query, body, auth = true, csrfHeader = true } = {}) {
    const url = new URL(`${base}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '')
        url.searchParams.set(key, String(value));
    }
    const headers = { Accept: 'application/json' };
    if (auth) headers.Cookie = cookieHeader;
    if (method !== 'GET' && csrfHeader) headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json };
  };
}

function record(form, step, expected, actual, note = '') {
  const ok = Array.isArray(expected) ? expected.includes(actual) : expected === actual;
  results.push({ form, step, expected, actual, ok, note });
  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] ${form} | ${step} | expected ${expected} | got ${actual}${note ? ` | ${note}` : ''}`,
  );
  return ok;
}

const errorCode = (response) => response.body?.error?.code ?? '';
const errorFields = (response) =>
  (response.body?.error?.details ?? []).map((detail) => detail.field).join(',');
const addDays = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'DD-Mon-YY' / 'DD-Mon-YYYY' / ISO → YYYY-MM-DD, for round-trip comparisons.
const isoOf = (value) => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(value);
  if (!match) return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) + 1;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
};
const TODAY = new Date().toISOString().slice(0, 10);

function track(form, id, path) {
  const entry = { form, id: String(id), path, deleted: false, verified: false, note: '' };
  ledger.push(entry);
  return entry;
}

async function deleteRecord(api, entry, form) {
  const removed = await api('DELETE', entry.path);
  entry.deleted = removed.status === 200;
  record(form, `delete ${entry.id}`, 200, removed.status, errorCode(removed));
  const after = await api('GET', entry.path);
  entry.verified = after.status === 404;
  record(form, `read after delete ${entry.id}`, 404, after.status);
}

// ------------------------------------------------------------------ orientation (1101)

async function orientation(api) {
  const F = 'Orientation';
  const base = '/hr/orientation-trainings';
  const employees = await api('GET', `${base}/lookups/employees`);
  record(F, 'lookup employees', 200, employees.status);
  const managers = await api('GET', `${base}/lookups/managers`);
  record(F, 'lookup managers', 200, managers.status);
  if (employees.status !== 200 || managers.status !== 200 || !managers.body.data.length) return;

  // A shared-service employee (flag Y) with the header fields Joi requires.
  let employee = null;
  for (const candidate of employees.body.data.slice(0, 80)) {
    if (!candidate.section || !candidate.division || !candidate.position) continue;
    const flag = await api('GET', `${base}/lookups/flag`, { query: { empNo: candidate.empNo } });
    if (flag.status === 200 && flag.body.data.flag === 'Y') {
      employee = candidate;
      break;
    }
  }
  if (!employee) {
    record(F, 'find a shared-service employee', 'found', 'none', 'cannot run the 409 check');
    return;
  }
  const details = await api('GET', `${base}/lookups/employee-details`, {
    query: { empNo: employee.empNo },
  });
  const skills = await api('GET', `${base}/lookups/skills`, {
    query: { empType: details.body?.data?.empType ?? 'Employee' },
  });
  record(F, 'lookup employee details', 200, details.status, `employee ${employee.empNo}`);
  record(F, 'lookup skills', 200, skills.status);
  if (details.status !== 200 || skills.status !== 200) return;
  const d = details.body.data;
  const head = managers.body.data[0].fullName;
  const start = addDays(TODAY, 14);
  const line = (department, timeTo) => ({
    department,
    departmentHead: head,
    fromDate: start,
    toDate: start,
    orientationDays: 1,
    timeFrom: '09:00',
    timeTo,
    remarks: `${PREFIX} orientation line`,
  });
  const body = {
    empNo: d.empNo,
    fromOrient: start,
    toOrient: start,
    ...(d.startDate ? { startDate: d.startDate } : {}),
    orientationBy: '',
    flag: 'Y',
    section: d.section,
    empname: d.empname,
    personId: d.personId,
    division: d.division,
    type: d.empType,
    position: d.position,
    lines: [
      line(skills.body.data.skills[0] ?? `${PREFIX} session`, '10:00'),
      line(skills.body.data.skills[1] ?? `${PREFIX} session 2`, '10:30'),
    ],
  };

  // 1. Shared-service create first: the old MAX+1 prediction returned 409 here.
  const created = await api('POST', base, { body });
  record(F, 'create shared-service (was 409)', 201, created.status, errorCode(created));
  if (created.status !== 201) return;
  const id = created.body.data.headerId;
  const entry = track(F, id, `${base}/${id}`);
  record(F, 'created in the shared-service table', 'Y', created.body.data.flag);

  try {
    const read = await api('GET', entry.path);
    record(F, 'read', 200, read.status);
    const r = read.body?.data ?? {};
    record(F, 'lines round-trip', 2, r.lines?.length ?? 0);
    record(F, 'from/to dates round-trip', `${start}/${start}`, `${r.fromOrient}/${r.toOrient}`);
    if (d.startDate) {
      record(F, 'joining date round-trip (no day shift)', d.startDate, r.startDate);
    }

    const updated = await api('PUT', entry.path, {
      body: { ...body, lines: [line(body.lines[0].department, '11:00'), body.lines[1]] },
    });
    record(F, 'update', 200, updated.status, errorCode(updated));
    const reread = await api('GET', entry.path);
    record(
      F,
      'period recomputed from edited times',
      '2.00 Hrs',
      reread.body?.data?.lines?.[0]?.orientationPeriod,
    );
    const audit = await auditColumns('XXZP.XXZP_NEW_HIRETRAINING_SS_HDR_T', 'HEADER_ID', id, [
      'LAST_UPDATED_BY',
      'LAST_UPDATE_DATE',
    ]);
    record(F, 'LAST_UPDATED_BY set to the session user', String(me.userId), audit?.LAST_UPDATED_BY);
    record(F, 'LAST_UPDATE_DATE set', true, Boolean(audit?.LAST_UPDATE_DATE));

    const lineId = reread.body?.data?.lines?.[1]?.lineId;
    const lineDelete = await api('DELETE', `${entry.path}/lines/${lineId}`);
    record(
      F,
      'delete one line (needs MANAGE_LINES)',
      [200, 403],
      lineDelete.status,
      lineDelete.status === 403 ? 'MANAGE_LINES not granted yet' : '',
    );

    const noLines = await api('POST', base, { body: { ...body, lines: [] } });
    record(F, 'negative: no lines', 400, noLines.status, errorFields(noLines));
    const reversed = await api('PUT', entry.path, {
      body: { ...body, lines: [{ ...body.lines[0], timeFrom: '12:00', timeTo: '09:00' }] },
    });
    record(F, 'negative: end time before start', 400, reversed.status, errorFields(reversed));
    const unknown = await api('GET', `${base}/999999999`);
    record(F, 'negative: unknown ID', 404, unknown.status);
    const noCsrf = await api('PUT', entry.path, { body, csrfHeader: false });
    record(F, 'negative: write without CSRF token', 403, noCsrf.status, errorCode(noCsrf));
  } finally {
    await deleteRecord(api, entry, F);
  }
}

// ------------------------------------------------------------------ probation (1064)

async function probation(api) {
  const F = 'Probation';
  const base = '/hr/probation-evaluations';
  const types = await api('GET', `${base}/lookups/form-types`);
  record(F, 'lookup form types', 200, types.status);
  if (types.status !== 200) return;
  // A fictional employee: the API stores the evaluated employee's details as given.
  const body = {
    formDate: TODAY,
    evaluationPeriod: `${PREFIX} period`,
    formType: types.body.data.formTypes[0],
    employeeName: `${PREFIX} Employee P1`,
    employeeNumber: `${PREFIX}-001`,
    empId: `${PREFIX}-P1`,
    grade: 1,
    jobTitle: `${PREFIX} Job`,
    department: `${PREFIX} Department`,
    fromDate: addDays(TODAY, -90),
    toDate: TODAY,
    comment: `${PREFIX} comment`,
    comments: '',
    lines: [
      { param: `${PREFIX} criterion 1`, paramAr: '', rating: 4 },
      { param: `${PREFIX} criterion 2`, paramAr: '' },
    ],
  };
  const created = await api('POST', base, { body });
  record(F, 'create (identity IDs; unrated line omitted)', 201, created.status, errorCode(created));
  if (created.status !== 201) return;
  const id = created.body.data.headerId;
  const entry = track(F, id, `${base}/${id}`);
  try {
    const read = await api('GET', entry.path);
    record(F, 'read', 200, read.status);
    const r = read.body?.data ?? {};
    record(
      F,
      'ratings round-trip (unrated = 0)',
      '4,0',
      (r.lines ?? []).map((line) => line.rating).join(','),
    );
    record(
      F,
      'dates round-trip',
      `${body.fromDate}/${body.toDate}`,
      `${isoOf(r.fromDate)}/${isoOf(r.toDate)}`,
    );
    const lines = (r.lines ?? []).map((line, index) => ({
      lineId: line.lineId,
      param: line.param,
      paramAr: '',
      ...(index === 0 ? { rating: 5 } : {}),
    }));
    const updated = await api('PUT', entry.path, {
      body: { ...body, comment: `${PREFIX} updated`, lines },
    });
    record(F, 'update', 200, updated.status, errorCode(updated));
    const reread = await api('GET', entry.path);
    record(
      F,
      'update round-trip',
      `5/${PREFIX} updated`,
      `${reread.body?.data?.lines?.[0]?.rating}/${reread.body?.data?.comment}`,
    );
    const audit = await auditColumns('XXZP.XXZP_PAF_PROBATION_HEADER', 'HEADER_ID', id, [
      'UPDATED_BY',
      'UPDATED_AT',
    ]);
    record(F, 'UPDATED_BY set to the session user', String(me.userId), audit?.UPDATED_BY);
    record(F, 'UPDATED_AT set', true, Boolean(audit?.UPDATED_AT));

    const zero = await api('POST', base, { body: { ...body, lines: [{ param: 'x', rating: 0 }] } });
    record(F, 'negative: rating 0', 400, zero.status, errorFields(zero));
    const reversed = await api('POST', base, {
      body: { ...body, toDate: addDays(body.fromDate, -1) },
    });
    record(F, 'negative: to date before from date', 400, reversed.status, errorFields(reversed));
  } finally {
    await deleteRecord(api, entry, F);
  }
}

// ------------------------------------------------------------------ requisition (1060)

async function requisition(api) {
  const F = 'Requisition';
  const base = '/hr/requisitions';
  const departments = await api('GET', `${base}/lookups/departments`);
  const capabilities = await api('GET', `${base}/lookups/capabilities`);
  record(F, 'lookup departments', 200, departments.status);
  record(
    F,
    'lookup capabilities',
    200,
    capabilities.status,
    `canManageTicket=${capabilities.body?.data?.canManageTicket}`,
  );
  if (departments.status !== 200 || !departments.body.data.length) return;
  const dept = departments.body.data[0];
  const body = {
    requestDate: TODAY,
    jobId: null,
    jobName: `${PREFIX} Job Title`,
    deptId: dept.deptId ? String(dept.deptId) : null,
    deptName: dept.name,
    dateNeeded: addDays(TODAY, 30),
    reasonOfReq: 'Addition',
    replacementFor: '',
    reason: `${PREFIX} addition reason`,
    budgeted: 'N',
    budgetedSal: 0,
    highSchool: 'N',
    diploma: 'Y',
    higherDiploma: 'N',
    degree: 'N',
    masterDegree: 'N',
    gccExp: '0 - 2',
    workExp: '2 - 5',
    skills: `${PREFIX} skills`,
    other: '',
    remark: `${PREFIX} remark`,
    totalPackage: null,
  };
  const created = await api('POST', base, { body });
  record(F, 'create', [200, 201], created.status, errorCode(created));
  if (![200, 201].includes(created.status)) return;
  const id = created.body.data.requisitionId;
  const entry = track(F, id, `${base}/${id}`);
  try {
    const read = await api('GET', entry.path);
    record(F, 'read', 200, read.status);
    const r = read.body?.data ?? {};
    record(F, 'status is Draft', 'Draft', r.requisitionStatus);
    record(
      F,
      'fields round-trip',
      `${body.jobName}/${body.dateNeeded}/${body.workExp}`,
      `${r.jobName}/${isoOf(r.dateNeeded)}/${r.workExp}`,
    );
    // requestDate is accepted on create only.
    const update = Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== 'requestDate'),
    );
    const updated = await api('PUT', entry.path, {
      body: { ...update, remark: `${PREFIX} updated` },
    });
    record(F, 'update', 200, updated.status, errorCode(updated));
    const reread = await api('GET', entry.path);
    record(F, 'update round-trip', `${PREFIX} updated`, reread.body?.data?.remark);
    const audit = await auditColumns('XXZP.XXZPI_PER_REQUISITIONS_ALL', 'REQUISITION_ID', id, [
      'LAST_UPDATED_BY',
      'LAST_UPDATE_DATE',
    ]);
    record(F, 'LAST_UPDATED_BY set to the session user', String(me.userId), audit?.LAST_UPDATED_BY);

    const missing = await api('POST', base, { body: { ...body, jobName: '' } });
    record(F, 'negative: missing job title', 400, missing.status, errorFields(missing));
    if (capabilities.body?.data?.canManageTicket === false) {
      const ticket = await api('PUT', entry.path, { body: { ...update, ticketStatus: 'Open' } });
      record(F, 'negative: non-HR ticket status change', 400, ticket.status, errorFields(ticket));
    }
  } finally {
    await deleteRecord(api, entry, F);
  }
}

// ------------------------------------------------------------------ interview (1061)

async function interview(api) {
  const F = 'Interview';
  const base = '/hr/interview-assessments';
  const requisitions = await api('GET', `${base}/lookups/requisitions`);
  const units = await api('GET', `${base}/lookups/payroll-units`);
  record(F, 'lookup approved requisitions', 200, requisitions.status);
  record(
    F,
    'lookup payroll units (named)',
    200,
    units.status,
    (units.body?.data ?? []).map((unit) => unit.name).join('/'),
  );
  if (requisitions.status !== 200 || units.status !== 200) return;
  const approved = requisitions.body.data[0];
  if (!approved) {
    record(F, 'find an approved requisition', 'found', 'none', 'create skipped');
    return;
  }
  const body = {
    candidateName: `${PREFIX} Applicant A`,
    requisitionNo: String(approved.requisitionNumber),
    positionName: approved.jobName,
    attribute3: units.body.data[0].code,
    nationality: '',
    age: 30,
    interviewDate: TODAY,
    interviewType: 'Personal',
    division: 'Food',
    location: `${PREFIX} City`,
    personalSpec: { rate1: '4', remark1: `${PREFIX}` },
    jobCompetency: { cRating1: '3' },
    evaluation: { status: 'Hold', comment: `${PREFIX} comment` },
  };
  const created = await api('POST', base, { body });
  record(F, 'create', 201, created.status, errorCode(created));
  if (created.status !== 201) return;
  const id = created.body.data.headerId;
  const entry = track(F, id, `${base}/${id}`);
  try {
    const read = await api('GET', entry.path);
    record(F, 'read', 200, read.status);
    const r = read.body?.data ?? {};
    record(
      F,
      'fields round-trip',
      `${body.candidateName}/${body.age}/${TODAY}`,
      `${r.candidateName}/${r.age}/${isoOf(r.interviewDate)}`,
    );
    const updated = await api('PUT', entry.path, { body: { ...body, age: 31 } });
    record(F, 'update', 200, updated.status, errorCode(updated));
    const reread = await api('GET', entry.path);
    record(F, 'update round-trip', 31, Number(reread.body?.data?.age));
    const audit = await auditColumns('XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T', 'HEADER_ID', id, [
      'LAST_UPDATED_BY',
      'LAST_UPDATE_DATE',
    ]);
    record(F, 'LAST_UPDATED_BY set to the session user', String(me.userId), audit?.LAST_UPDATED_BY);

    const noPosition = await api('POST', base, { body: { ...body, positionName: '' } });
    record(F, 'negative: missing position name', 400, noPosition.status, errorFields(noPosition));
    const badUnit = await api('POST', base, { body: { ...body, attribute3: '1' } });
    record(F, 'negative: unknown payroll unit', 400, badUnit.status, errorFields(badUnit));
  } finally {
    await deleteRecord(api, entry, F);
  }
}

// ------------------------------------------------------------------ employment offer (1062)

async function offer(api) {
  const F = 'Offer';
  const base = '/hr/employment-offers';
  const units = await api('GET', `${base}/lookups/business-units`);
  record(F, 'lookup business units', 200, units.status);
  if (units.status !== 200 || !units.body.data.businessUnits?.length) return;
  const body = {
    offerDate: TODAY,
    employeeName: `${PREFIX} Applicant A`,
    position: `${PREFIX} Position`,
    division: String(units.body.data.businessUnits[0]),
    intNo: `${PREFIX}-INT-001`,
    line: {
      basicSalary: 1000,
      approximateStartingDate: addDays(TODAY, 30),
      comment: `${PREFIX} comment`,
    },
  };
  const created = await api('POST', base, { body });
  record(F, 'create', 201, created.status, errorCode(created));
  if (created.status !== 201) return;
  const id = created.body.data.headerId;
  const entry = track(F, id, `${base}/${id}`);
  try {
    const read = await api('GET', entry.path);
    record(F, 'read', 200, read.status);
    const r = read.body?.data ?? {};
    record(
      F,
      'fields round-trip',
      `${body.employeeName}/1000/${body.line.approximateStartingDate}`,
      `${r.employeeName}/${Number(r.line?.basicSalary)}/${isoOf(r.line?.approximateStartingDate)}`,
    );
    const updated = await api('PUT', entry.path, {
      body: { ...body, line: { ...body.line, comment: `${PREFIX} updated` } },
    });
    record(F, 'update', 200, updated.status, errorCode(updated));
    const reread = await api('GET', entry.path);
    record(F, 'update round-trip', `${PREFIX} updated`, reread.body?.data?.line?.comment);

    const noIntNo = await api('POST', base, { body: { ...body, intNo: '' } });
    record(F, 'negative: missing interview number', 400, noIntNo.status, errorFields(noIntNo));
    const badUnit = await api('POST', base, { body: { ...body, division: '1' } });
    record(F, 'negative: unknown business unit', 400, badUnit.status, errorFields(badUnit));
  } finally {
    await deleteRecord(api, entry, F);
  }
}

// ------------------------------------------------------------------ periodwise report (read only)

async function periodwise(api) {
  const F = 'Periodwise';
  const base = '/hr/reports/periodwise-employees';
  const departments = await api('GET', `${base}/lookups/departments`);
  record(
    F,
    'lookup departments',
    [200, 403],
    departments.status,
    departments.status === 403 ? 'HR.PERIODWISE_EMPLOYEES:VIEW not registered/granted yet' : '',
  );
  if (departments.status !== 200) return;
  const query = { dateFrom: `${TODAY.slice(0, 4)}-01-01`, dateTo: TODAY, pageSize: 10 };
  const report = await api('GET', base, { query });
  record(F, 'read report', 200, report.status);
  const data = report.body?.data;
  record(F, 'summary covers the full scope', report.body?.pagination?.total, data?.summary?.total);
  record(
    F,
    'no national ID number returned',
    false,
    (data?.rows ?? []).some((row) => 'nationalId' in row || 'nationalIdentifier' in row),
  );
  record(F, 'page size honoured', true, (data?.rows?.length ?? 0) <= 10);
  const reversed = await api('GET', base, {
    query: { dateFrom: TODAY, dateTo: `${TODAY.slice(0, 4)}-01-01` },
  });
  record(F, 'negative: to date before from date', 400, reversed.status, errorFields(reversed));
}

// ------------------------------------------------------------------ run

async function main() {
  const inputs = guardInputs();
  const dbName = await guardDatabase();
  const api = client(inputs);
  console.log(`Target: ${inputs.base} (DB_NAME ${dbName}). Test prefix: ${PREFIX}.`);
  const session = await api('GET', '/auth/me');
  if (session.status !== 200)
    fail(
      `the session is not accepted (HTTP ${session.status}); log in again and refresh .env.local.`,
    );
  me = { userId: session.body.data.user.id };
  const anonymous = await api('GET', '/hr/requisitions', { auth: false });
  record('All', 'negative: no session', 401, anonymous.status);

  for (const run of [orientation, probation, requisition, interview, offer, periodwise]) {
    try {
      await run(api);
    } catch (error) {
      record(run.name, 'unexpected error', 'none', error.name, error.message.split('\n')[0]);
    }
  }

  // Safety net: anything created and not confirmed deleted is retried once.
  for (const entry of ledger.filter((item) => !item.verified)) {
    try {
      await deleteRecord(api, entry, `${entry.form} (retry)`);
    } catch (error) {
      entry.note = error.message.split('\n')[0];
    }
  }

  console.log('\nCreated records and cleanup:');
  for (const entry of ledger) {
    console.log(
      `  ${entry.form} ${entry.id}: deleted=${entry.deleted} gone=${entry.verified}${entry.note ? ` (${entry.note})` : ''}`,
    );
  }
  const failed = results.filter((item) => !item.ok);
  console.log(
    `\nSteps: ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}.`,
  );
  if (ledger.some((entry) => !entry.verified)) {
    console.log('WARNING: some test records may remain; delete them by the IDs above.');
    process.exitCode = 1;
  } else if (failed.length) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await closeDatabase();
}
