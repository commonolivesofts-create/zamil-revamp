// Operator tool for the controlled Oracle TEST user-administration run (`npm run auth:users-test --
// --employee=<number> --expect-username=<USER_NAME> [--port=N]`). Drives the public API of a server
// already running on this machine (loopback only), signed in as the Super Administrator through
// the existing MFA flow (password and code from hidden prompts). Its only intended write is
// provisioning the named employee as PENDING (if absent); everything else is a read or a refusal
// that writes nothing but ACCESS_DENIED. It never activates, disables, assigns roles or sets
// passwords. Cookies and tokens stay in memory; only statuses, codes and counts are printed.
import { pathToFileURL } from 'node:url';
import { createClient, createCookieJar, logout, signInWithMfa } from './mfa-test-flow.js';

const HOST = '127.0.0.1';

export function parseArgs(argv) {
  let port = 3000;
  let employee;
  let expectUsername;
  for (const arg of argv) {
    let match;
    if ((match = /^--port=(\d{2,5})$/.exec(arg))) port = Number(match[1]);
    else if ((match = /^--employee=([A-Za-z0-9][A-Za-z0-9_-]{0,29})$/.exec(arg)))
      employee = match[1];
    else if ((match = /^--expect-username=([^\s=]{1,100})$/.exec(arg))) expectUsername = match[1];
    else {
      throw new Error(
        'Only --employee=, --expect-username= and --port= are accepted; no credentials are read from arguments.',
      );
    }
  }
  if (!employee || !expectUsername) {
    throw new Error('--employee=<number> and --expect-username=<USER_NAME> are required.');
  }
  return { root: `http://${HOST}:${port}/api/v1`, employee, expectUsername };
}

const code = (result) => result.payload?.error?.code ?? '';
const reasons = (result) => (result.payload?.error?.details ?? []).map((d) => d.message);

export async function runScenario({ say, api, auth, signedIn, employee, expectUsername }) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    return ok;
  };
  const expectStatus = (label, result, status, errorCode) =>
    check(
      label,
      result.status === status && (!errorCode || code(result) === errorCode),
      `HTTP ${result.status}${code(result) ? ` ${code(result)}` : ''}`,
    );
  const write = (method, path, body) => api(method, path, { body, csrf: signedIn.csrf });

  const me = await auth('GET', '/me');
  if (!expectStatus('GET /auth/me', me, 200)) return failures;
  const selfId = me.payload.data.user.id;
  check('session is MFA-verified', me.payload.data.session.mfaVerified === true);

  // --- Reads -------------------------------------------------------------------------------------
  const list = await api('GET', '/users?page=1&limit=10&sortBy=employeeNumber');
  expectStatus('GET /users (paginated)', list, 200);
  const before = list.payload?.pagination?.total;
  check('pagination envelope', Number.isInteger(before), `total=${before}`);
  expectStatus(
    'GET /users with filters',
    await api('GET', '/users?status=PENDING&mfaEnrolled=false&locked=false'),
    200,
  );

  const lookup = await api(
    'GET',
    `/users/candidates?search=${encodeURIComponent(employee)}&limit=100`,
  );
  expectStatus('GET /users/candidates (search)', lookup, 200);
  const candidate = (lookup.payload?.data ?? []).find((c) => c.employeeNumber === employee);
  if (!check('candidate found', Boolean(candidate))) return failures;
  check(
    'candidate username matches the approved employee',
    candidate.username?.trim().toUpperCase() === expectUsername.toUpperCase(),
  );
  expectStatus('GET /users/{self}', await api('GET', `/users/${selfId}`), 200);

  // --- Refusals that change nothing --------------------------------------------------------------
  expectStatus(
    'provision without CSRF token refused',
    await api('POST', '/users', { body: { employeeNumber: employee } }),
    403,
    'CSRF_REJECTED',
  );
  expectStatus(
    'invalid provisioning body rejected',
    await write('POST', '/users', { employeeNumber: employee, roles: [] }),
    400,
    'VALIDATION_ERROR',
  );
  expectStatus(
    'unknown employee -> 404',
    await write('POST', '/users', { employeeNumber: 'ZRVNOSUCHEMP' }),
    404,
    'RESOURCE_NOT_FOUND',
  );
  expectStatus(
    'disable own (Super Administrator) account refused',
    await write('POST', `/users/${selfId}/disable`, {}),
    403,
    'SELF_MODIFICATION_FORBIDDEN',
  );
  expectStatus(
    'revoke own sessions via user administration refused',
    await write('DELETE', `/users/${selfId}/sessions`),
    403,
    'SELF_MODIFICATION_FORBIDDEN',
  );
  const anonymous = createClient(api.root, createCookieJar());
  expectStatus(
    'unauthenticated list refused',
    await anonymous('GET', '/users'),
    401,
    'UNAUTHENTICATED',
  );

  // An ineligible employee (if TEST has one without an account) is refused with its reason.
  const others = await api('GET', '/users/candidates?hasAccount=false&limit=100');
  const ineligible = (others.payload?.data ?? []).find(
    (c) => !c.provisionable && c.ineligibilityReason,
  );
  if (ineligible) {
    const refused = await write('POST', '/users', { employeeNumber: ineligible.employeeNumber });
    check(
      'ineligible employee refused with its reason',
      refused.status === 409 &&
        code(refused) === 'EMPLOYEE_NOT_ELIGIBLE' &&
        reasons(refused)[0] === ineligible.ineligibilityReason,
      `HTTP ${refused.status} ${code(refused)} ${reasons(refused).join(',')}`,
    );
  } else {
    say('INFO  no ineligible employee without an account on this page; check skipped');
  }

  // --- Provisioning (the only intended write) ----------------------------------------------------
  let userId = candidate.userId;
  if (userId === null) {
    if (
      !check(
        'candidate provisionable',
        candidate.provisionable,
        candidate.ineligibilityReason ?? '',
      )
    )
      return failures;
    const created = await write('POST', '/users', { employeeNumber: employee });
    if (!expectStatus('POST /users (provision PENDING)', created, 201)) return failures;
    userId = created.payload.data.userId;
  } else if (candidate.accountStatus === 'PENDING') {
    say(`INFO  account already exists (USER_ID ${userId}, PENDING); not provisioning again`);
  } else {
    check(
      'existing account is PENDING',
      false,
      `status ${candidate.accountStatus}; stopping before any further change`,
    );
    return failures;
  }
  say(`Account USER_ID ${userId}`);

  expectStatus(
    'duplicate provisioning -> 409',
    await write('POST', '/users', { employeeNumber: employee }),
    409,
    'ACCOUNT_EXISTS',
  );
  const activation = await write('POST', `/users/${userId}/activate`, {});
  check(
    'activation without password -> 409 PASSWORD_NOT_SET',
    activation.status === 409 &&
      code(activation) === 'ACTIVATION_PREREQUISITES_NOT_MET' &&
      reasons(activation).includes('PASSWORD_NOT_SET'),
    `HTTP ${activation.status} ${code(activation)} ${reasons(activation).join(',')}`,
  );

  const detail = await api('GET', `/users/${userId}`);
  expectStatus('GET /users/{new}', detail, 200);
  const d = detail.payload?.data ?? {};
  check('account PENDING', d.account?.status === 'PENDING');
  check('no password set', d.password?.set === false && d.password?.changedAt === null);
  check('MFA not enrolled', d.mfa?.enrolled === false);
  check('no roles', Array.isArray(d.roles) && d.roles.length === 0);
  check('no active sessions', Array.isArray(d.activeSessions) && d.activeSessions.length === 0);
  check(
    'eligible employee, not privileged',
    d.eligibility?.eligible === true &&
      !d.classification?.privilegedRoleMember &&
      !d.classification?.securityAdministration &&
      !d.classification?.protectedSuperAdministrator,
  );
  check(
    'activation not ready: PASSWORD_NOT_SET',
    d.activation?.ready === false && d.activation?.unmetPrerequisites?.includes('PASSWORD_NOT_SET'),
  );
  const text = JSON.stringify(detail.payload);
  check(
    'no secret fields in the response',
    !/passwordHash|password_hash|totp|tokenHash|secret/i.test(text),
  );

  const pending = await api('GET', '/users?status=PENDING&limit=100');
  check(
    'listed under status=PENDING',
    (pending.payload?.data ?? []).some((u) => u.userId === userId),
  );
  const after = await api('GET', `/users/candidates?search=${encodeURIComponent(employee)}`);
  const now = (after.payload?.data ?? []).find((c) => c.employeeNumber === employee);
  check(
    'candidate now linked and no longer provisionable',
    now?.userId === userId && now?.provisionable === false,
  );
  return failures;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  try {
    const { root, employee, expectUsername } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    say(
      `Zamil Digitalization user-administration integration test against ${root} (loopback only)`,
    );
    const jar = createCookieJar();
    const auth = createClient(`${root}/auth`, jar);
    const api = Object.assign(createClient(root, jar), { root });
    const signedIn = await signInWithMfa(io, say, auth, { allowEnrollment: false });
    if (!signedIn) return 1;
    let failures;
    try {
      failures = await runScenario({ say, api, auth, signedIn, employee, expectUsername });
    } finally {
      await logout(say, auth, signedIn);
    }
    say(
      failures === 0
        ? '\nAll user-administration checks passed.'
        : `\n${failures} check(s) failed.`,
    );
    say('Clear this terminal afterwards (Clear-Host / cls).');
    return failures === 0 ? 0 : 1;
  } catch (error) {
    say(`Stopped: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    io: { input: process.stdin, output: process.stdout },
  });
}
