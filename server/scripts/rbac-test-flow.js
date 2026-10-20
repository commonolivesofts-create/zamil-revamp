// Operator tool for the controlled Oracle TEST RBAC integration run (`npm run auth:rbac-test`).
// Drives the public API of a server already running on this machine (loopback only), signed in as
// the Super Administrator with the existing MFA flow (password and code from hidden prompts):
//   - authorized reads: /me/permissions, roles, catalogue, grants, memberships, overrides;
//   - refusals that write nothing but ACCESS_DENIED: protected roles, protected catalogue,
//     self-modification, missing CSRF token, invalid input, unauthenticated access;
//   - one temporary, clearly named, member-less role: create, duplicate (409), update, one
//     read-only permission grant/re-grant/revoke with read-back, then deactivation.
// It never assigns roles or overrides to anyone and never changes Zaid's account or the
// administrator roles. Cookies and tokens stay in memory; only statuses, codes and counts print.
import { pathToFileURL } from 'node:url';
import { createClient, createCookieJar, logout, signInWithMfa } from './mfa-test-flow.js';

const HOST = '127.0.0.1';
const SEC = 'SECURITY_ADMINISTRATION';
// The single permission exercised on the temporary role: read-only and member-less, so it gives
// nobody any access.
const TEST_PERMISSION = { resourceCode: 'SECURITY_AUDIT', actionCode: 'VIEW' };
export const TEMP_ROLE_PREFIX = 'ZRV_IT_TEMP_';

export function parseArgs(argv) {
  let port = 3000;
  for (const arg of argv) {
    const match = /^--port=(\d{2,5})$/.exec(arg);
    if (match) port = Number(match[1]);
    else
      throw new Error('Only --port=<number> is accepted; no credentials are read from arguments.');
  }
  return { root: `http://${HOST}:${port}/api/v1` };
}

export const tempRoleCode = (now = new Date()) =>
  `${TEMP_ROLE_PREFIX}${now.toISOString().replace(/\D/g, '').slice(0, 14)}`;

const code = (result) => result.payload?.error?.code ?? '';

export async function runScenario({ say, rbac, auth, signedIn, now = new Date() }) {
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
  const write = (method, path, body) => rbac(method, path, { body, csrf: signedIn.csrf });

  // --- Identity and authorized reads --------------------------------------------------------------
  const me = await auth('GET', '/me');
  if (!expectStatus('GET /auth/me', me, 200)) return failures;
  const userId = me.payload.data.user.id;
  check('session is MFA-verified', me.payload.data.session.mfaVerified === true);

  const mine = await rbac('GET', '/access-control/me/permissions');
  expectStatus('GET /me/permissions', mine, 200);
  const security = (mine.payload?.data?.permissions ?? []).filter((p) => p.moduleCode === SEC);
  check(
    'effective security permissions resolved via role',
    security.length > 0 && security.every((p) => p.viaRole),
    `${security.length} permission(s)`,
  );

  const roles = await rbac('GET', '/access-control/roles?page=1&limit=100');
  expectStatus('GET /roles (paginated)', roles, 200);
  const byCode = new Map((roles.payload?.data ?? []).map((r) => [r.roleCode, r]));
  const superRole = byCode.get('SUPER_ADMINISTRATOR');
  const adminRole = byCode.get('ADMINISTRATOR');
  if (
    !check(
      'administrator roles present',
      Boolean(superRole && adminRole && byCode.get('MAIN_ADMINISTRATOR')),
      `total=${roles.payload?.pagination?.total}`,
    )
  ) {
    return failures;
  }

  const catalog = await rbac('GET', '/access-control/catalog');
  expectStatus('GET /catalog', catalog, 200);
  const securityModule = (catalog.payload?.data ?? []).find((m) => m.moduleCode === SEC);
  const permissionId = (resourceCode, actionCode) =>
    securityModule?.resources
      .find((r) => r.resourceCode === resourceCode)
      ?.permissions.find((p) => p.actionCode === actionCode)?.permissionId;
  const testPermissionId = permissionId(TEST_PERMISSION.resourceCode, TEST_PERMISSION.actionCode);
  const rolesView = permissionId('ROLES', 'VIEW');
  if (!check('security catalogue present', Boolean(testPermissionId && rolesView))) return failures;

  const superGrants = await rbac('GET', `/access-control/roles/${superRole.roleId}/permissions`);
  expectStatus('GET /roles/{SUPER}/permissions', superGrants, 200);
  const activeSuperGrants = (superGrants.payload?.data ?? []).filter((g) => g.isActive).length;
  check(
    'SUPER_ADMINISTRATOR active grants = effective security permissions',
    activeSuperGrants === security.length,
    `${activeSuperGrants}`,
  );

  const memberships = await rbac('GET', `/access-control/users/${userId}/roles`);
  expectStatus('GET /users/{self}/roles', memberships, 200);
  check(
    'own SUPER_ADMINISTRATOR membership effective',
    (memberships.payload?.data ?? []).some(
      (m) => m.roleCode === 'SUPER_ADMINISTRATOR' && m.effective,
    ),
  );

  const effective = await rbac('GET', `/access-control/users/${userId}/effective-permissions`);
  expectStatus('GET /users/{self}/effective-permissions', effective, 200);
  check(
    'effective permissions match /me/permissions',
    (effective.payload?.data ?? []).length === (mine.payload?.data?.permissions ?? []).length,
  );
  expectStatus(
    'GET /users/{self}/overrides',
    await rbac('GET', `/access-control/users/${userId}/overrides`),
    200,
  );

  // --- Refusals (no RBAC change; each is audited as ACCESS_DENIED) -------------------------------
  expectStatus(
    'PATCH protected SUPER_ADMINISTRATOR refused',
    await write('PATCH', `/access-control/roles/${superRole.roleId}`, { roleName: 'X' }),
    403,
    'PROTECTED_ROLE',
  );
  expectStatus(
    'deactivate protected ADMINISTRATOR refused',
    await write('POST', `/access-control/roles/${adminRole.roleId}/deactivate`, {}),
    403,
    'PROTECTED_ROLE',
  );
  expectStatus(
    'revoke security grant from SUPER_ADMINISTRATOR refused',
    await write('DELETE', `/access-control/roles/${superRole.roleId}/permissions/${rolesView}`),
    403,
    'PROTECTED_ROLE',
  );
  expectStatus(
    'assign SUPER_ADMINISTRATOR refused',
    await write('PUT', `/access-control/users/${userId}/roles/${superRole.roleId}`, {}),
    403,
    'PROTECTED_ROLE',
  );
  expectStatus(
    'self override refused',
    await write('PUT', `/access-control/users/${userId}/overrides/${rolesView}`, {
      effect: 'DENY',
      justification: 'integration test',
    }),
    403,
    'SELF_MODIFICATION_FORBIDDEN',
  );
  expectStatus(
    'deactivate security module refused',
    await write('PATCH', `/access-control/modules/${securityModule.moduleId}`, { isActive: false }),
    403,
    'PROTECTED_CATALOG',
  );
  expectStatus(
    'change without CSRF token refused',
    await rbac('POST', '/access-control/roles', {
      body: { roleCode: 'ZRV_IT_NO_CSRF', roleName: 'x' },
    }),
    403,
    'CSRF_REJECTED',
  );
  expectStatus(
    'invalid role code rejected',
    await write('POST', '/access-control/roles', { roleCode: 'bad code', roleName: 'x' }),
    400,
    'VALIDATION_ERROR',
  );
  const anonymous = createClient(rbac.root, createCookieJar());
  expectStatus(
    'unauthenticated read refused',
    await anonymous('GET', '/access-control/roles'),
    401,
    'UNAUTHENTICATED',
  );

  // --- Temporary role lifecycle ------------------------------------------------------------------
  const roleCode = tempRoleCode(now);
  say(`Temporary role: ${roleCode}`);
  const created = await write('POST', '/access-control/roles', {
    roleCode,
    roleName: 'Phase 03 integration test (temporary)',
    description:
      'Temporary Phase 03 RBAC integration-test role; no members; deactivated by the test.',
  });
  if (!expectStatus('POST /roles (create temporary role)', created, 201)) return failures;
  const tempId = created.payload.data.roleId;
  expectStatus(
    'duplicate role code -> 409 (ORA-00001)',
    await write('POST', '/access-control/roles', { roleCode, roleName: 'dup' }),
    409,
    'CONFLICT',
  );
  const updated = await write('PATCH', `/access-control/roles/${tempId}`, {
    roleName: 'Phase 03 integration test (temporary, updated)',
  });
  check(
    'PATCH /roles/{temp}',
    updated.status === 200 && updated.payload.data.roleName.endsWith('updated)'),
    `HTTP ${updated.status}`,
  );

  const grantPath = `/access-control/roles/${tempId}/permissions/${testPermissionId}`;
  const granted = await write('PUT', grantPath);
  check(
    'grant SECURITY_AUDIT:VIEW to temp role',
    granted.status === 200 && granted.payload.data.changed === true,
    `HTTP ${granted.status}`,
  );
  const regrant = await write('PUT', grantPath);
  check('re-grant is a no-op', regrant.status === 200 && regrant.payload.data.changed === false);
  const afterGrant = await rbac('GET', `/access-control/roles/${tempId}/permissions`);
  check(
    'read-back: grant active',
    (afterGrant.payload?.data ?? []).some((g) => g.permissionId === testPermissionId && g.isActive),
  );

  const revoked = await write('DELETE', grantPath);
  check(
    'revoke grant',
    revoked.status === 200 && revoked.payload.data.changed === true,
    `HTTP ${revoked.status}`,
  );
  const rerevoke = await write('DELETE', grantPath);
  check('re-revoke is a no-op', rerevoke.status === 200 && rerevoke.payload.data.changed === false);
  const afterRevoke = await rbac('GET', `/access-control/roles/${tempId}/permissions`);
  check(
    'read-back: grant inactive',
    (afterRevoke.payload?.data ?? []).every((g) => !g.isActive),
  );

  const deactivated = await write('POST', `/access-control/roles/${tempId}/deactivate`, {});
  check(
    'deactivate temp role',
    deactivated.status === 200 && deactivated.payload.data.isActive === false,
    `HTTP ${deactivated.status}`,
  );
  const again = await write('POST', `/access-control/roles/${tempId}/deactivate`, {});
  check('re-deactivate is a no-op', again.status === 200 && again.payload.data.isActive === false);
  const grantInactiveRole = await write('PUT', grantPath);
  expectStatus('grant on inactive role refused', grantInactiveRole, 409, 'INACTIVE_TARGET');

  // Zaid's own access is unchanged by the run.
  const mineAfter = await rbac('GET', '/access-control/me/permissions');
  check(
    'own effective permissions unchanged',
    (mineAfter.payload?.data?.permissions ?? []).length ===
      (mine.payload?.data?.permissions ?? []).length,
  );
  return failures;
}

export async function main({ argv, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  try {
    const { root } = parseArgs(argv);
    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new Error('Run this in an interactive terminal (PowerShell, cmd or Windows Terminal).');
    }
    say(`Zamil Revamp RBAC integration test against ${root} (loopback only)`);
    const jar = createCookieJar();
    const auth = createClient(`${root}/auth`, jar);
    const rbac = Object.assign(createClient(root, jar), { root });
    const signedIn = await signInWithMfa(io, say, auth, { allowEnrollment: false });
    if (!signedIn) return 1;
    let failures;
    try {
      failures = await runScenario({ say, rbac, auth, signedIn });
    } finally {
      await logout(say, auth, signedIn);
    }
    say(
      failures === 0 ? '\nAll RBAC integration checks passed.' : `\n${failures} check(s) failed.`,
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
