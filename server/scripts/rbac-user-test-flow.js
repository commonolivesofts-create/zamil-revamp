// Operator tool for the controlled Oracle TEST RBAC evaluation of an ORDINARY employee
// (`npm run auth:rbac-user-test -- --employee=<number> --expect-username=<USER_NAME>`).
//
// The Super Administrator signs in (existing MFA flow, hidden prompts). Only after the operator
// types "yes" does the tool write, and only through the existing APIs:
//   - a temporary business catalogue (module ZRV_IT_M<ts>, resource ITEMS, actions VIEW/APPROVE)
//     and a temporary role ZRV_IT_R<ts> granted VIEW — never a security-administration permission,
//     so the employee never becomes privileged;
//   - role assignment (expiring in 1 hour), an ALLOW override on APPROVE and a DENY override on VIEW,
//     each checked through the same Oracle evaluation used by authorize();
//   - optionally the employee's own view (/me/permissions) after the employee signs in.
// Cleanup always runs: overrides revoked, role unassigned, grant revoked, role and catalogue
// deactivated. Rows stay in place inactive (no DELETE by design) and keep their audit trail.
// Secrets stay in memory; only statuses, codes and counts are printed.
import { pathToFileURL } from 'node:url';
import { promptLine } from './bootstrap-test-rbac.js';
import { logout, signInWithMfa } from './mfa-test-flow.js';
import { withLocalApi } from './operator-session.js';

export function parseArgs(argv) {
  let employee;
  let expectUsername;
  for (const arg of argv) {
    let match;
    if ((match = /^--employee=([A-Za-z0-9][A-Za-z0-9_-]{0,29})$/.exec(arg))) employee = match[1];
    else if ((match = /^--expect-username=([^\s=]{1,100})$/.exec(arg))) expectUsername = match[1];
    else
      throw new Error(
        'Only --employee= and --expect-username= are accepted; no credentials are read from arguments.',
      );
  }
  if (!employee || !expectUsername)
    throw new Error('--employee= and --expect-username= are required.');
  return { employee, expectUsername };
}

export const TEMP_PREFIX = 'ZRV_IT_';
export const tempSuffix = (now = new Date()) => now.toISOString().replace(/\D/g, '').slice(0, 14);
const code = (r) => r.payload?.error?.code ?? '';

export async function runScenario({
  say,
  ask,
  admin,
  signedIn,
  newClient,
  employee,
  expectUsername,
  now = new Date(),
}) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    return ok;
  };
  const ok = (label, r, status = 200) =>
    check(label, r.status === status, `HTTP ${r.status}${code(r) ? ` ${code(r)}` : ''}`);
  const write = (method, path, body) =>
    admin.api(method, `/access-control${path}`, { body, csrf: signedIn.csrf });
  const stop = (reason) => {
    say(`STOP  ${reason} — nothing was changed.`);
    return failures + 1;
  };

  // --- Read-only target checks -------------------------------------------------------------------
  const lookup = await admin.api(
    'GET',
    `/users/candidates?search=${encodeURIComponent(employee)}&limit=100`,
  );
  const candidate = (lookup.payload?.data ?? []).find((c) => c.employeeNumber === employee);
  if (!candidate?.userId) return stop('no account for the employee');
  const userId = candidate.userId;
  const detail = (await admin.api('GET', `/users/${userId}`)).payload?.data;
  const effective = async () =>
    (
      (await admin.api('GET', `/access-control/users/${userId}/effective-permissions`)).payload
        ?.data ?? []
    )
      .filter((p) => p.moduleCode.startsWith(TEMP_PREFIX))
      .map((p) => `${p.actionCode}${p.viaRole ? '+role' : ''}${p.viaOverride ? '+allow' : ''}`)
      .sort()
      .join(',');
  const pre = [
    [
      'username matches the approved employee',
      detail?.employee?.username?.trim().toUpperCase() === expectUsername.toUpperCase(),
    ],
    ['account ACTIVE', detail?.account?.status === 'ACTIVE'],
    [
      'ordinary account (not privileged, not the Super Administrator)',
      detail &&
        !detail.classification.protectedSuperAdministrator &&
        !detail.classification.privilegedRoleMember &&
        !detail.classification.securityAdministration,
    ],
    ['no roles before the test', detail?.roles?.length === 0],
  ];
  for (const [label, value] of pre) check(label, Boolean(value));
  const overridesBefore =
    (await admin.api('GET', `/access-control/users/${userId}/overrides`)).payload?.data ?? [];
  check('no overrides before the test', overridesBefore.length === 0);
  if (failures) return stop('a precondition failed');
  if (
    (
      await ask('Create the temporary role/catalogue and grant them to the employee? (yes/no): ')
    ).trim() !== 'yes'
  ) {
    return stop('operator declined');
  }

  // --- Writes (each one reversed in cleanup) --------------------------------------------------------
  const suffix = tempSuffix(now);
  const created = {};
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  try {
    const mod = await write('POST', '/modules', {
      moduleCode: `${TEMP_PREFIX}M${suffix}`,
      moduleName: 'Phase 06 integration test (temporary)',
      displayOrder: 999,
    });
    if (!ok('create temporary module', mod, 201)) return failures;
    created.moduleId = mod.payload.data.moduleId;
    const res = await write('POST', `/modules/${created.moduleId}/resources`, {
      resourceCode: 'ITEMS',
      resourceName: 'Test items',
    });
    if (!ok('create temporary resource', res, 201)) return failures;
    created.resourceId = res.payload.data.resourceId;
    for (const action of ['VIEW', 'APPROVE']) {
      const p = await write('POST', `/resources/${created.resourceId}/permissions`, {
        actionCode: action,
      });
      if (!ok(`create temporary permission ${action}`, p, 201)) return failures;
      created[action] = p.payload.data.permissionId;
    }
    const role = await write('POST', '/roles', {
      roleCode: `${TEMP_PREFIX}R${suffix}`,
      roleName: 'Phase 06 integration test (temporary)',
    });
    if (!ok('create temporary role', role, 201)) return failures;
    created.roleId = role.payload.data.roleId;
    ok(
      'grant VIEW to the role',
      await write('PUT', `/roles/${created.roleId}/permissions/${created.VIEW}`),
    );

    check('default deny: nothing effective yet', (await effective()) === '');
    created.assigned = ok(
      'assign the role (expires in 1 hour)',
      await write('PUT', `/users/${userId}/roles/${created.roleId}`, { expiresAt: inOneHour }),
    );
    check('role grant is effective', (await effective()) === 'VIEW+role', await effective());
    created.allow = ok(
      'ALLOW override on APPROVE',
      await write('PUT', `/users/${userId}/overrides/${created.APPROVE}`, {
        effect: 'ALLOW',
        justification: 'Phase 06 integration test',
        expiresAt: inOneHour,
      }),
    );
    check(
      'additive: role grant + ALLOW override',
      (await effective()) === 'APPROVE+allow,VIEW+role',
      await effective(),
    );
    created.deny = ok(
      'DENY override on VIEW',
      await write('PUT', `/users/${userId}/overrides/${created.VIEW}`, {
        effect: 'DENY',
        justification: 'Phase 06 integration test',
        expiresAt: inOneHour,
      }),
    );
    check(
      'explicit DENY wins over the role grant',
      (await effective()) === 'APPROVE+allow',
      await effective(),
    );

    const view = (await ask('Sign in as the employee to confirm their own view? (y/N): '))
      .trim()
      .toLowerCase();
    if (view === 'y') {
      const user = newClient();
      const password = await ask('Employee password (hidden): ', { hidden: true });
      const login = await user.auth('POST', '/login', {
        body: { username: expectUsername, password },
      });
      if (ok('employee login', login) && login.payload.data.authenticated) {
        const mine =
          (await user.api('GET', '/access-control/me/permissions')).payload?.data?.permissions ??
          [];
        check(
          'employee sees exactly APPROVE (temporary module)',
          mine
            .filter((p) => p.moduleCode.startsWith(TEMP_PREFIX))
            .map((p) => p.actionCode)
            .join(',') === 'APPROVE',
        );
        ok('employee still denied user administration', await user.api('GET', '/users'), 403);
        await logout(say, user.auth, { csrf: login.payload.data.csrf.token });
      }
    }

    ok(
      'deactivate permission APPROVE',
      await write('PATCH', `/permissions/${created.APPROVE}`, { isActive: false }),
    );
    check('inactive permission grants nothing', (await effective()) === '', await effective());
  } finally {
    // --- Cleanup: always, in reverse order; each step is idempotent -------------------------------
    say('Cleanup:');
    if (created.deny)
      ok(
        'revoke DENY override',
        await write('DELETE', `/users/${userId}/overrides/${created.VIEW}`),
      );
    if (created.allow)
      ok(
        'revoke ALLOW override',
        await write('DELETE', `/users/${userId}/overrides/${created.APPROVE}`),
      );
    if (created.assigned)
      ok('unassign role', await write('DELETE', `/users/${userId}/roles/${created.roleId}`));
    if (created.roleId && created.VIEW)
      ok(
        'revoke role grant',
        await write('DELETE', `/roles/${created.roleId}/permissions/${created.VIEW}`),
      );
    if (created.roleId)
      ok('deactivate role', await write('POST', `/roles/${created.roleId}/deactivate`, {}));
    for (const action of ['VIEW', 'APPROVE']) {
      if (created[action])
        ok(
          `deactivate permission ${action}`,
          await write('PATCH', `/permissions/${created[action]}`, { isActive: false }),
        );
    }
    if (created.resourceId)
      ok(
        'deactivate resource',
        await write('PATCH', `/resources/${created.resourceId}`, { isActive: false }),
      );
    if (created.moduleId)
      ok(
        'deactivate module',
        await write('PATCH', `/modules/${created.moduleId}`, { isActive: false }),
      );
    if (created.moduleId) {
      check(
        'after cleanup: nothing effective from the temporary catalogue',
        (await effective()) === '',
      );
      const roles =
        (await admin.api('GET', `/access-control/users/${userId}/roles`)).payload?.data ?? [];
      check(
        'after cleanup: no effective role membership',
        roles.every((r) => !r.effective),
      );
      const overrides =
        (await admin.api('GET', `/access-control/users/${userId}/overrides`)).payload?.data ?? [];
      check(
        'after cleanup: no active override',
        overrides.every((o) => !o.isActive),
      );
    }
  }
  return failures;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  const ask = (label, options) => promptLine(io, label, options);
  try {
    const { employee, expectUsername } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    return await withLocalApi(say, async ({ client }) => {
      const admin = client();
      say('Sign in as the Super Administrator:');
      const signedIn = await signInWithMfa(io, say, admin.auth, { allowEnrollment: false });
      if (!signedIn) return 1;
      let failures;
      try {
        failures = await runScenario({
          say,
          ask,
          admin,
          signedIn,
          newClient: client,
          employee,
          expectUsername,
        });
      } finally {
        await logout(say, admin.auth, signedIn);
      }
      say(failures === 0 ? '\nAll RBAC user checks passed.' : `\n${failures} check(s) failed.`);
      say('Clear this terminal afterwards (Clear-Host / cls).');
      return failures === 0 ? 0 : 1;
    });
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
