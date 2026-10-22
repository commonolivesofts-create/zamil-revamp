// Operator tool for controlled Oracle TEST password scenarios of an ORDINARY employee
// (`npm run auth:recovery-test -- --mode=change|reset --employee=<number> --expect-username=<USER_NAME>`).
//
//   change: the employee signs in and changes the password through POST /auth/password/change
//           (no e-mail); every session ends; the new password signs in, the old one is refused.
//   reset:  one self-service reset e-mail (POST /auth/recovery/request), delivered only to the
//           approved TEST mailbox; the operator pastes the link at a hidden prompt; the reset is
//           completed through POST /auth/password/reset; replay is refused; the new password signs in.
// MFA recovery is not offered: the ordinary account has no authenticator (no voluntary enrollment
// endpoint exists) and the Super Administrator's MFA must not be touched.
// The API runs in this process after the TEST preflight (see operator-session.js); passwords,
// tokens and links are read only at hidden prompts and never printed or stored.
import { pathToFileURL } from 'node:url';
import { checkPasswordPolicy } from '../src/modules/auth/password.js';
import { createRecipientResolver } from '../src/modules/notifications/delivery.js';
import { promptLine } from './bootstrap-test-rbac.js';
import { logout } from './mfa-test-flow.js';
import { withLocalApi } from './operator-session.js';
import { extractToken, preflightProblems } from './setup-test-flow.js';

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    let match;
    if ((match = /^--mode=(change|reset)$/.exec(arg))) args.mode = match[1];
    else if ((match = /^--employee=([A-Za-z0-9][A-Za-z0-9_-]{0,29})$/.exec(arg)))
      args.employee = match[1];
    else if ((match = /^--expect-username=([^\s=]{1,100})$/.exec(arg)))
      args.expectUsername = match[1];
    else
      throw new Error(
        'Only --mode=, --employee= and --expect-username= are accepted; no credentials are read from arguments.',
      );
  }
  if (!args.mode || !args.employee || !args.expectUsername) {
    throw new Error('--mode=change|reset, --employee= and --expect-username= are required.');
  }
  return args;
}

const code = (r) => r.payload?.error?.code ?? '';

async function askNewPassword(ask, say) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const first = await ask('New password (hidden): ', { hidden: true });
    const second = await ask('Repeat the new password (hidden): ', { hidden: true });
    const unmet = checkPasswordPolicy(first);
    if (first !== second) say('  The entries differ; try again.');
    else if (unmet.length) say(`  Password policy not met: ${unmet.join(', ')}`);
    else return first;
  }
  return null;
}

export async function runScenario({
  say,
  ask,
  newClient,
  mode,
  expectUsername,
  smtp,
  settle = async () => {},
}) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    return ok;
  };
  const status = (label, r, expected, errorCode) =>
    check(
      label,
      r.status === expected && (!errorCode || code(r) === errorCode),
      `HTTP ${r.status}${code(r) ? ` ${code(r)}` : ''}`,
    );
  const stop = (reason) => {
    say(`STOP  ${reason}`);
    return failures + 1;
  };

  // The employee signs in first (both modes), which also proves the current state.
  const user = newClient();
  const current = await ask('Employee CURRENT password (hidden): ', { hidden: true });
  const login = await user.auth('POST', '/login', {
    body: { username: expectUsername, password: current },
  });
  if (
    !status('employee login (current password)', login, 200) ||
    !login.payload.data.authenticated
  ) {
    return stop('the employee could not sign in; nothing was changed.');
  }
  const me = (await user.auth('GET', '/me')).payload?.data;
  const perms =
    (await user.api('GET', '/access-control/me/permissions')).payload?.data?.permissions ?? [];
  check(
    'ordinary account without security permissions',
    !perms.some((p) => p.moduleCode === 'SECURITY_ADMINISTRATION'),
  );
  if (failures) {
    await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
    return stop('precondition failed; nothing was changed.');
  }

  if (mode === 'change') {
    const second = newClient(); // a second session, which the change must also end
    const secondLogin = await second.auth('POST', '/login', {
      body: { username: expectUsername, password: current },
    });
    if ((await ask('Change this employee password now? (yes/no): ')).trim() !== 'yes') {
      await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
      await logout(say, second.auth, { csrf: secondLogin.payload?.data?.csrf?.token });
      return stop('operator declined; nothing was changed.');
    }
    const next = await askNewPassword(ask, say);
    if (!next) return stop('no acceptable password entered; nothing was changed.');
    const changed = await user.auth('POST', '/password/change', {
      body: { currentPassword: current, newPassword: next },
      csrf: login.payload.data.csrf.token,
    });
    status('POST /auth/password/change', changed, 200);
    check(
      'every session ended (incl. a second one)',
      changed.payload?.data?.sessionsRevoked >= 2,
      `${changed.payload?.data?.sessionsRevoked}`,
    );
    status('old session refused', await user.auth('GET', '/me'), 401, 'UNAUTHENTICATED');
    status('second session refused', await second.auth('GET', '/me'), 401, 'UNAUTHENTICATED');
    const old = newClient();
    status(
      'old password refused',
      await old.auth('POST', '/login', { body: { username: expectUsername, password: current } }),
      401,
      'AUTHENTICATION_FAILED',
    );
    const fresh = newClient();
    const relogin = await fresh.auth('POST', '/login', {
      body: { username: expectUsername, password: next },
    });
    if (status('new password signs in', relogin, 200))
      await logout(say, fresh.auth, { csrf: relogin.payload.data.csrf.token });
    return failures;
  }

  // mode === 'reset': the recipient must be the approved TEST mailbox only.
  const recipient = createRecipientResolver(smtp)({
    employeeNumber: me?.user?.employeeNumber,
    employee: { email: me?.user?.email },
  });
  if (
    !check(
      'effective recipient is only the approved test mailbox',
      recipient?.source === 'TEST_OVERRIDE' && recipient.address === smtp.testRecipientOverride,
    )
  ) {
    await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
    return stop('unexpected recipient; nothing was sent.');
  }
  if ((await ask('Send ONE reset e-mail to the TEST mailbox? (yes/no): ')).trim() !== 'yes') {
    await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
    return stop('operator declined; nothing was sent.');
  }
  const anon = newClient();
  status(
    'POST /auth/recovery/request (uniform 202)',
    await anon.auth('POST', '/recovery/request', {
      body: { username: expectUsername, purpose: 'PASSWORD_RESET' },
    }),
    202,
  );
  await settle();
  say(
    'Open the TEST mailbox, open the "[TEST] Reset your Zamil Digitalization password" message and copy the link.',
  );
  let token = null;
  for (let attempt = 0; attempt < 3 && !token; attempt += 1) {
    token = extractToken(await ask('Paste the link or token (hidden): ', { hidden: true }));
    if (!token) say('  That is not a valid link or token; try again.');
  }
  if (!token) {
    await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
    return stop('no valid token entered; the unused link expires in 30 minutes.');
  }
  const next = await askNewPassword(ask, say);
  if (!next) return stop('no acceptable password entered; the unused link expires in 30 minutes.');
  const done = await anon.auth('POST', '/password/reset', { body: { token, newPassword: next } });
  status('POST /auth/password/reset', done, 200);
  check(
    'the open session was ended',
    done.payload?.data?.sessionsRevoked >= 1,
    `${done.payload?.data?.sessionsRevoked}`,
  );
  status(
    'token is single use (replay refused)',
    await anon.auth('POST', '/password/reset', { body: { token, newPassword: next } }),
    400,
    'TOKEN_INVALID',
  );
  status('old session refused', await user.auth('GET', '/me'), 401, 'UNAUTHENTICATED');
  const fresh = newClient();
  const relogin = await fresh.auth('POST', '/login', {
    body: { username: expectUsername, password: next },
  });
  if (status('new password signs in', relogin, 200))
    await logout(say, fresh.auth, { csrf: relogin.payload.data.csrf.token });
  return failures;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  const ask = (label, options) => promptLine(io, label, options);
  try {
    const { mode, expectUsername } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    const extra = mode === 'reset' ? (cfg, db) => preflightProblems(cfg, db) : () => [];
    return await withLocalApi(
      say,
      async ({ client, appConfig }) => {
        const failures = await runScenario({
          say,
          ask,
          newClient: client,
          mode,
          expectUsername,
          smtp: appConfig.smtp,
        });
        say(failures === 0 ? `\nAll ${mode} checks passed.` : `\n${failures} check(s) failed.`);
        say('Delete any test e-mail and clear this terminal (Clear-Host / cls).');
        return failures === 0 ? 0 : 1;
      },
      extra,
    );
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
