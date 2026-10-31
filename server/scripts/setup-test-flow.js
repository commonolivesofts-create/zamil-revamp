// Operator tool for the controlled Oracle TEST first-password setup (`npm run auth:setup-test --
// --employee=<number> --expect-username=<USER_NAME>`). No frontend is needed.
//
// It runs the API in this process (loopback, ephemeral port) from the same validated configuration
// it checks, so the effective SMTP settings cannot differ from what was verified:
//   1. Safety preflight (before any network or e-mail): non-production, SMTP enabled, new-account
//      test override enabled, privileged delivery off, and the connected database's DB_NAME equals
//      SMTP_TEST_DATABASE_NAME (read-only).
//   2. Super Administrator sign-in through the existing MFA flow (hidden prompts) and checks that
//      the target is eligible, PENDING, without password, not privileged, and that the effective
//      recipient is ONLY the configured new-account test mailbox.
//   3. Issues the setup e-mail through POST /users/{id}/password-setup, then signs Zaid out.
//   4. The operator pastes the link (or token) from the TEST inbox and chooses the new password, all
//      at hidden prompts; setup is completed through POST /auth/password/setup.
//   5. Verifies single use, the ordinary user's login, permitted and denied API access (no grant is
//      changed) and logout.
// Secrets (passwords, codes, token, link, cookies) stay in memory and are never printed or stored.
import { pathToFileURL } from 'node:url';
import { createApp } from '../src/app.js';
import {
  APPROVED_TEST_RECIPIENT,
  USER_CREATION_TEST_RECIPIENT,
  config,
} from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { checkPasswordPolicy } from '../src/modules/auth/password.js';
import { findDatabaseName } from '../src/modules/notifications/databaseIdentity.repository.js';
import { createRecipientResolver } from '../src/modules/notifications/delivery.js';
import { promptLine } from './bootstrap-test-rbac.js';
import { createClient, createCookieJar, logout, signInWithMfa } from './mfa-test-flow.js';

export function parseArgs(argv) {
  let employee;
  let expectUsername;
  for (const arg of argv) {
    let match;
    if ((match = /^--employee=([A-Za-z0-9][A-Za-z0-9_-]{0,29})$/.exec(arg))) employee = match[1];
    else if ((match = /^--expect-username=([^\s=]{1,100})$/.exec(arg))) expectUsername = match[1];
    else {
      throw new Error(
        'Only --employee= and --expect-username= are accepted; no credentials are read from arguments.',
      );
    }
  }
  if (!employee || !expectUsername) {
    throw new Error('--employee=<number> and --expect-username=<USER_NAME> are required.');
  }
  return { employee, expectUsername };
}

/** Configuration and database-identity gate; returns a list of problems (empty = safe). */
export function preflightProblems(appConfig, databaseName) {
  const { smtp } = appConfig;
  const problems = [];
  if (appConfig.env === 'production') problems.push('NODE_ENV is production');
  if (!smtp.enabled) problems.push('SMTP_ENABLED is not true');
  if (smtp.testRecipientOverride !== APPROVED_TEST_RECIPIENT) {
    problems.push('test recipient override is not the approved mailbox');
  }
  if (smtp.userCreationTestRecipientOverride !== USER_CREATION_TEST_RECIPIENT) {
    problems.push('new-account test recipient override is not enabled');
  }
  if (smtp.privilegedDeliveryEnabled) problems.push('privileged delivery is enabled');
  if (!smtp.testDatabaseName || databaseName !== smtp.testDatabaseName) {
    problems.push('connected database is not the configured TEST database');
  }
  if (!appConfig.links.baseUrl) problems.push('AUTH_FRONTEND_BASE_URL is not set');
  return problems;
}

/** Accepts the full e-mailed link or the bare token; returns the token or null. */
export function extractToken(input) {
  const value = String(input).trim();
  const match = /(?:#|[?&])token=([A-Za-z0-9_-]{43})(?:$|[&#])/.exec(value);
  const token = match ? match[1] : value;
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

const code = (result) => result.payload?.error?.code ?? '';

/**
 * The approved workflow after sign-in. `ask(label, { hidden })` reads operator input; `auth`/`api`
 * are clients sharing the Super Administrator's cookie jar; `newClient()` returns an independent
 * client for the ordinary user.
 */
export async function runScenario({
  say,
  ask,
  auth,
  api,
  newClient,
  signedIn,
  employee,
  expectUsername,
  smtp,
}) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    return ok;
  };
  const status = (label, result, expected, errorCode) =>
    check(
      label,
      result.status === expected && (!errorCode || code(result) === errorCode),
      `HTTP ${result.status}${code(result) ? ` ${code(result)}` : ''}`,
    );
  const stop = (reason) => {
    say(`STOP  ${reason} — nothing further was changed.`);
    return failures + 1;
  };

  // --- Target checks (before any e-mail) ---------------------------------------------------------
  const lookup = await api(
    'GET',
    `/users/candidates?search=${encodeURIComponent(employee)}&limit=100`,
  );
  const candidate = (lookup.payload?.data ?? []).find((c) => c.employeeNumber === employee);
  if (!candidate?.userId) return stop('no account for the employee');
  const userId = candidate.userId;
  const detailRes = await api('GET', `/users/${userId}`);
  if (!status('GET /users/{target}', detailRes, 200)) return stop('target details unavailable');
  const d = detailRes.payload.data;
  const preconditions = [
    ['employee number matches', d.employeeNumber === employee],
    [
      'username matches the approved employee',
      d.employee?.username?.trim().toUpperCase() === expectUsername.toUpperCase(),
    ],
    [
      'account PENDING without password',
      d.account?.status === 'PENDING' && d.password?.set === false,
    ],
    ['employee eligible', d.eligibility?.eligible === true],
    ['employee-master e-mail present', Boolean(d.employee?.email?.trim())],
    [
      'not privileged',
      !d.classification?.protectedSuperAdministrator &&
        !d.classification?.privilegedRoleMember &&
        !d.classification?.securityAdministration,
    ],
    ['no roles, no active sessions', d.roles?.length === 0 && d.activeSessions?.length === 0],
  ];
  for (const [label, ok] of preconditions) check(label, ok);
  // Effective recipient under the running configuration: only the fixed setup-test mailbox.
  const recipient = createRecipientResolver({
    testRecipientOverride: smtp.testRecipientOverride,
    userCreationTestRecipientOverride: smtp.userCreationTestRecipientOverride,
    privilegedDeliveryEnabled: smtp.privilegedDeliveryEnabled,
  })(
    {
      employeeNumber: d.employeeNumber,
      employee: d.employee,
      isPrivilegedRoleMember: d.classification?.privilegedRoleMember,
      hasSecurityAdministration: d.classification?.securityAdministration,
    },
    'PASSWORD_SETUP',
  );
  check(
    'effective recipient is only the new-account test mailbox',
    recipient?.address === USER_CREATION_TEST_RECIPIENT &&
      recipient?.source === 'USER_CREATION_TEST_OVERRIDE',
  );
  if (failures > 0) return stop('a precondition failed');

  const go = (
    await ask(`Send ONE setup e-mail for employee ${employee} to the TEST mailbox? (yes/no): `)
  ).trim();
  if (go !== 'yes') return stop('operator declined');
  const issued = await api('POST', `/users/${userId}/password-setup`, {
    body: { confirmEmployeeNumber: employee },
    csrf: signedIn.csrf,
  });
  if (!status('setup e-mail issued and accepted by SMTP', issued, 202))
    return stop('issuance failed');
  check('response carries no token', !JSON.stringify(issued.payload).includes('token'));
  say(`INFO  link expires at ${issued.payload.data.expiresAt}`);
  await logout(say, auth, signedIn);

  // --- Operator completes setup from the TEST inbox ---------------------------------------------------
  say(
    'Open the TEST mailbox, open the "[TEST] Set up your Zamil Digitalization password" message and copy the link.',
  );
  let token = null;
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    token = extractToken(await ask('Paste the link or token (hidden): ', { hidden: true }));
    if (!token) say('  That is not a valid link or token; try again.');
  }
  if (!token) return stop('no valid token entered');
  let password = null;
  for (let attempt = 0; attempt < 3 && !password; attempt += 1) {
    const first = await ask('New password for the account (hidden): ', { hidden: true });
    const second = await ask('Repeat the new password (hidden): ', { hidden: true });
    const unmet = checkPasswordPolicy(first);
    if (first !== second) say('  The entries differ; try again.');
    else if (unmet.length) say(`  Password policy not met: ${unmet.join(', ')}`);
    else password = first;
  }
  if (!password) return stop('no acceptable password entered');

  const user = newClient();
  const done = await user.auth('POST', '/password/setup', {
    body: { token, newPassword: password },
  });
  status('POST /auth/password/setup', done, 200);
  check(
    'account ACTIVE, sign-in required',
    done.payload?.data?.accountStatus === 'ACTIVE' && done.payload?.data?.signInRequired === true,
  );
  status(
    'token is single use (replay refused)',
    await user.auth('POST', '/password/setup', { body: { token, newPassword: password } }),
    400,
    'TOKEN_INVALID',
  );

  // --- Ordinary user sign-in and access ---------------------------------------------------------------
  const login = await user.auth('POST', '/login', { body: { username: expectUsername, password } });
  status('ordinary user login', login, 200);
  const session = login.payload?.data;
  if (
    !check('session issued without MFA (ordinary, not enrolled)', session?.authenticated === true)
  ) {
    return stop('login did not produce a session');
  }
  const me = await user.auth('GET', '/me');
  check(
    'GET /auth/me',
    me.status === 200 && me.payload?.data?.user?.id === userId,
    `HTTP ${me.status}`,
  );
  const perms = await user.api('GET', '/access-control/me/permissions');
  check(
    'permitted: own effective permissions (none granted)',
    perms.status === 200 && perms.payload?.data?.permissions?.length === 0,
    `HTTP ${perms.status}`,
  );
  status('denied: user administration list', await user.api('GET', '/users'), 403, 'FORBIDDEN');
  status('denied: role list', await user.api('GET', '/access-control/roles'), 403, 'FORBIDDEN');
  status(
    'denied: Super Administrator account details',
    await user.api('GET', '/users/1'),
    403,
    'FORBIDDEN',
  );
  await logout(say, user.auth, { csrf: session.csrf.token });
  return failures;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  const ask = (label, options) => promptLine(io, label, options);
  let server;
  try {
    const { employee, expectUsername } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    const { database } = config;
    validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
    await createPool(POOLS.LOW);
    const databaseName = await withConnection(POOLS.LOW, findDatabaseName);
    const problems = preflightProblems(config, databaseName);
    if (problems.length) {
      for (const problem of problems) say(`FAIL  preflight: ${problem}`);
      say('STOP  safety preflight failed; nothing was sent or changed.');
      return 1;
    }
    say(
      'PASS  preflight: non-production, TEST database identity, new-account test mailbox only, privileged delivery off',
    );

    server = createApp(config).listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    const root = `http://127.0.0.1:${server.address().port}/api/v1`;
    const client = () => {
      const jar = createCookieJar();
      return { auth: createClient(`${root}/auth`, jar), api: createClient(root, jar) };
    };
    const admin = client();
    say('Sign in as the Super Administrator:');
    const signedIn = await signInWithMfa(io, say, admin.auth, { allowEnrollment: false });
    if (!signedIn) return 1;
    const failures = await runScenario({
      say,
      ask,
      auth: admin.auth,
      api: admin.api,
      newClient: client,
      signedIn,
      employee,
      expectUsername,
      smtp: config.smtp,
    });
    // Closes the Super Administrator session if the scenario stopped before its own logout.
    await admin.auth('POST', '/logout', { csrf: signedIn.csrf });
    say(
      failures === 0 ? '\nAll setup integration checks passed.' : `\n${failures} check(s) failed.`,
    );
    say(
      'Delete the setup e-mail from the TEST mailbox and clear this terminal (Clear-Host / cls).',
    );
    return failures === 0 ? 0 : 1;
  } catch (error) {
    say(`Stopped: ${error.message}`);
    return 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase().catch(() => {});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main({
    argv: process.argv.slice(2),
    io: { input: process.stdin, output: process.stdout },
  });
}
