// Oracle TEST bootstrap of the approved initial security catalogue and Zaid's Super Administrator
// account (docs/07 §10B). `npm run db:bootstrap-test` is READ-ONLY: it verifies the environment,
// the database identity, the locked constraints, conflicts and Zaid's eligibility, then prints the
// plan. Writes require `-- --apply`, an interactive terminal, a typed confirmation and a password
// typed by Zaid into a hidden prompt. Everything is written in one LOW transaction that re-checks
// all preconditions under table locks and verifies the result before committing.
//
// Never pass a password on the command line, in the environment or in a file: none is accepted.
// The script prints counts and the new USER_ID only, never the password or its hash. MFA is not
// bypassed: the Super Administrator still cannot sign in until Phase 02 MFA exists.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import oracledb from 'oracledb';
import {
  ADMINISTRATOR_ROLE_DEFINITIONS,
  ADMINISTRATOR_ROLES,
  SECURITY_MODULE,
  SECURITY_RESOURCES,
  SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER,
} from '../src/modules/access-control/securityCatalog.js';
import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
  buildAuditEvent,
} from '../src/modules/audit/securityAudit.service.js';
import { insertAuditEvent } from '../src/modules/audit/securityAudit.repository.js';
import { findLoginCandidates, terminationStatusSql } from '../src/modules/auth/auth.repository.js';
import { evaluateMfaRequirement } from '../src/modules/auth/auth.eligibility.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from '../src/modules/auth/password.js';

// The only database this script may write to: Oracle TEST (zpadwtest), LOW service.
export const APPROVED_TEST_DATABASE = Object.freeze({
  lowAlias: 'zpadwtest_low',
  serviceNamePattern: /_zpadwtest_low\./i,
});
const ALLOWED_ENVIRONMENTS = new Set(['development', 'test']);

export const EXPECTED_COUNTS = Object.freeze({
  modules: 1,
  resources: SECURITY_RESOURCES.length,
  permissions: SECURITY_RESOURCES.reduce((total, resource) => total + resource.actions.length, 0),
  roles: ADMINISTRATOR_ROLE_DEFINITIONS.length,
  rolePermissions: SECURITY_RESOURCES.reduce(
    (total, resource) => total + resource.actions.length,
    0,
  ),
  users: 1,
  userRoles: 1,
  auditEvents: 1,
});

// Constraints the bootstrap relies on; each must exist, be ENABLED and VALIDATED.
export const REQUIRED_CONSTRAINTS = Object.freeze([
  'PK_ZRV_MOD',
  'UQ_ZRV_MOD_CODE',
  'CK_ZRV_MOD_CODE',
  'CK_ZRV_MOD_NAME',
  'PK_ZRV_RES',
  'UQ_ZRV_RES_MOD_CODE',
  'CK_ZRV_RES_CODE',
  'CK_ZRV_RES_NAME',
  'FK_ZRV_RES_MOD',
  'PK_ZRV_PERM',
  'UQ_ZRV_PERM_RES_ACT',
  'CK_ZRV_PERM_ACTION',
  'FK_ZRV_PERM_RES',
  'PK_ZRV_ROLES',
  'UQ_ZRV_ROLES_CODE',
  'CK_ZRV_ROLES_CODE',
  'CK_ZRV_ROLES_NAME',
  'PK_ZRV_RP',
  'UQ_ZRV_RP_ROLE_PERM',
  'FK_ZRV_RP_ROLE',
  'FK_ZRV_RP_PERM',
  'PK_ZRV_USERS',
  'UQ_ZRV_USERS_EMP',
  'CK_ZRV_USERS_EMP',
  'CK_ZRV_USERS_STATUS',
  'CK_ZRV_USERS_PWD',
  'PK_ZRV_UR',
  'UQ_ZRV_UR_USER_ROLE',
  'FK_ZRV_UR_USER',
  'FK_ZRV_UR_ROLE',
  'PK_ZRV_AUD',
  'CK_ZRV_AUD_EVENT',
  'CK_ZRV_AUD_ACTOR_ID',
  'CK_ZRV_AUD_TARGET',
  'CK_ZRV_AUD_DETAILS',
  'CK_ZRV_AUD_IMMUT',
  'FK_ZRV_AUD_SUBJ',
]);

const confirmationPhrase = () => `BOOTSTRAP ${APPROVED_TEST_DATABASE.lowAlias}`;

// Each statement carries a label comment, so tests can recognise it without parsing SQL.
export const BOOTSTRAP_SQL = {
  identity: `/* zr-bootstrap:identity */ SELECT SYS_CONTEXT('USERENV', 'SERVICE_NAME') FROM dual`,
  constraints: `/* zr-bootstrap:constraints */
    SELECT constraint_name, status, validated FROM user_constraints
     WHERE table_name IN ('XX_ZRV_APP_MODULES', 'XX_ZRV_RESOURCES', 'XX_ZRV_PERMISSIONS',
                          'XX_ZRV_ROLES', 'XX_ZRV_ROLE_PERMISSIONS', 'XX_ZRV_USERS',
                          'XX_ZRV_USER_ROLES', 'XX_ZRV_RBAC_AUDIT_LOGS')`,
  auditEventCheck: `/* zr-bootstrap:audit-event-check */
    SELECT search_condition_vc FROM user_constraints
     WHERE table_name = 'XX_ZRV_RBAC_AUDIT_LOGS' AND constraint_name = 'CK_ZRV_AUD_EVENT'`,
  existingModule: `/* zr-bootstrap:existing-module */
    SELECT COUNT(*) FROM xx_zrv_app_modules WHERE UPPER(TRIM(module_code)) = :code`,
  existingRoles: `/* zr-bootstrap:existing-roles */
    SELECT COUNT(*) FROM xx_zrv_roles WHERE UPPER(TRIM(role_code)) IN (:r0, :r1, :r2)`,
  existingUser: `/* zr-bootstrap:existing-user */
    SELECT COUNT(*) FROM xx_zrv_users WHERE TRIM(employee_number) = :employeeNumber`,
  existingBootstrapAudit: `/* zr-bootstrap:existing-audit */
    SELECT COUNT(*) FROM xx_zrv_rbac_audit_logs WHERE event_code = :eventCode`,
  employee: `/* zr-bootstrap:employee */
    SELECT e.current_emp_flag,
           ${terminationStatusSql('e.termination_date')} AS termination_status,
           e.user_name,
           (SELECT COUNT(*) FROM xx_digi_emp_master d
             WHERE UPPER(TRIM(d.user_name)) = UPPER(TRIM(e.user_name))) AS username_matches
      FROM xx_digi_emp_master e
     WHERE e.employee_number = :employeeNumber`,
  lock: `/* zr-bootstrap:lock */
    LOCK TABLE xx_zrv_app_modules, xx_zrv_roles, xx_zrv_users IN EXCLUSIVE MODE NOWAIT`,
  insertModule: `/* zr-bootstrap:insert-module */
    INSERT INTO xx_zrv_app_modules (module_code, module_name, description, display_order, is_active)
    VALUES (:code, :name, :description, :displayOrder, 1)
    RETURNING module_id INTO :id`,
  insertResource: `/* zr-bootstrap:insert-resource */
    INSERT INTO xx_zrv_resources (module_id, resource_code, resource_name, description, is_active)
    VALUES (:moduleId, :code, :name, :description, 1)
    RETURNING resource_id INTO :id`,
  insertPermission: `/* zr-bootstrap:insert-permission */
    INSERT INTO xx_zrv_permissions (resource_id, action_code, description, is_active)
    VALUES (:resourceId, :actionCode, :description, 1)
    RETURNING permission_id INTO :id`,
  insertRole: `/* zr-bootstrap:insert-role */
    INSERT INTO xx_zrv_roles (role_code, role_name, description, is_active)
    VALUES (:code, :name, :description, 1)
    RETURNING role_id INTO :id`,
  insertRolePermission: `/* zr-bootstrap:insert-role-permission */
    INSERT INTO xx_zrv_role_permissions (role_id, permission_id, is_active)
    VALUES (:roleId, :permissionId, 1)`,
  insertUser: `/* zr-bootstrap:insert-user */
    INSERT INTO xx_zrv_users (employee_number, password_hash, password_changed_at, account_status)
    VALUES (:employeeNumber, :passwordHash, SYSTIMESTAMP AT TIME ZONE 'UTC', 'ACTIVE')
    RETURNING user_id INTO :id`,
  insertUserRole: `/* zr-bootstrap:insert-user-role */
    INSERT INTO xx_zrv_user_roles (user_id, role_id, is_active, expires_at)
    VALUES (:userId, :roleId, 1, NULL)`,
  verifyCounts: `/* zr-bootstrap:verify-counts */
    SELECT (SELECT COUNT(*) FROM xx_zrv_app_modules WHERE module_id = :moduleId),
           (SELECT COUNT(*) FROM xx_zrv_resources WHERE module_id = :moduleId),
           (SELECT COUNT(*) FROM xx_zrv_permissions p JOIN xx_zrv_resources r
              ON r.resource_id = p.resource_id WHERE r.module_id = :moduleId),
           (SELECT COUNT(*) FROM xx_zrv_roles WHERE role_code IN (:r0, :r1, :r2)),
           (SELECT COUNT(*) FROM xx_zrv_role_permissions WHERE role_id = :superRoleId),
           (SELECT COUNT(*) FROM xx_zrv_users WHERE user_id = :userId),
           (SELECT COUNT(*) FROM xx_zrv_user_roles WHERE user_id = :userId),
           (SELECT COUNT(*) FROM xx_zrv_rbac_audit_logs WHERE correlation_id = :correlationId)
      FROM dual`,
};

// NUMBER(19,0) identity values are returned as strings to preserve precision.
const ID_OUT = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });
const roleBinds = () =>
  Object.fromEntries(Object.values(ADMINISTRATOR_ROLES).map((code, index) => [`r${index}`, code]));
const titleCase = (code) =>
  code
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

export class BootstrapRefused extends Error {}

/** Parses `--apply`; anything else is refused so that no secret can be passed as an argument. */
export function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--apply');
  if (unknown.length > 0) {
    throw new BootstrapRefused(
      `Unknown argument(s): ${unknown.length} given. Only --apply is accepted; passwords are only read from the hidden prompt.`,
    );
  }
  return { apply: argv.includes('--apply') };
}

/** Refuses any environment other than development/test pointed at the approved TEST LOW alias. */
export function assertEnvironment(appConfig) {
  if (!ALLOWED_ENVIRONMENTS.has(appConfig.env)) {
    throw new BootstrapRefused(`NODE_ENV=${appConfig.env} is not permitted; TEST bootstrap only.`);
  }
  if (appConfig.database?.pools?.LOW?.alias !== APPROVED_TEST_DATABASE.lowAlias) {
    throw new BootstrapRefused(
      `ORACLE_LOW_ALIAS must be ${APPROVED_TEST_DATABASE.lowAlias}; refusing an unapproved database.`,
    );
  }
}

/** Confirms the connected service is the approved TEST database before any read or write. */
export async function assertDatabaseIdentity(connection) {
  const [[serviceName]] = (await connection.execute(BOOTSTRAP_SQL.identity)).rows;
  if (!APPROVED_TEST_DATABASE.serviceNamePattern.test(serviceName ?? '')) {
    throw new BootstrapRefused('Connected database is not the approved TEST service.');
  }
}

const count = async (connection, sql, binds) => (await connection.execute(sql, binds)).rows[0][0];

/**
 * Read-only preconditions. Returns `{ problems, employee }`; any problem means no write may occur.
 * Never prints or returns employee data other than what the caller needs internally.
 */
export async function runPrechecks(connection) {
  const problems = [];

  const constraints = new Map(
    (await connection.execute(BOOTSTRAP_SQL.constraints)).rows.map(([name, status, validated]) => [
      name,
      { status, validated },
    ]),
  );
  for (const name of REQUIRED_CONSTRAINTS) {
    const constraint = constraints.get(name);
    if (!constraint) problems.push(`Required constraint ${name} is missing`);
    else if (constraint.status !== 'ENABLED' || constraint.validated !== 'VALIDATED') {
      problems.push(`Required constraint ${name} is not ENABLED and VALIDATED`);
    }
  }

  const eventCheck = (await connection.execute(BOOTSTRAP_SQL.auditEventCheck)).rows[0]?.[0];
  if (!eventCheck) {
    problems.push('CK_ZRV_AUD_EVENT not found');
  } else {
    const predicate = eventCheck.replaceAll('EVENT_CODE', ':v');
    const ok = await count(
      connection,
      `/* zr-bootstrap:audit-event-eval */ SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END FROM dual`,
      { v: AUDIT_EVENTS.SECURITY_BOOTSTRAP },
    );
    if (ok !== 1) problems.push('SECURITY_BOOTSTRAP does not satisfy CK_ZRV_AUD_EVENT');
  }

  if (
    (await count(connection, BOOTSTRAP_SQL.existingModule, { code: SECURITY_MODULE.code })) !== 0
  ) {
    problems.push(`Module ${SECURITY_MODULE.code} already exists`);
  }
  if ((await count(connection, BOOTSTRAP_SQL.existingRoles, roleBinds())) !== 0) {
    problems.push('One or more administrator roles already exist');
  }
  const employeeNumber = SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER;
  if ((await count(connection, BOOTSTRAP_SQL.existingUser, { employeeNumber })) !== 0) {
    problems.push(`An application account for employee ${employeeNumber} already exists`);
  }
  const eventCode = AUDIT_EVENTS.SECURITY_BOOTSTRAP;
  if ((await count(connection, BOOTSTRAP_SQL.existingBootstrapAudit, { eventCode })) !== 0) {
    problems.push('A SECURITY_BOOTSTRAP audit event already exists (bootstrap already ran)');
  }

  const employees = (await connection.execute(BOOTSTRAP_SQL.employee, { employeeNumber })).rows;
  let employee = null;
  if (employees.length !== 1) {
    problems.push(`Employee ${employeeNumber} must have exactly one employee-master row`);
  } else {
    const [flag, terminationStatus, username, usernameMatches] = employees[0];
    if (flag !== 'Y') problems.push(`Employee ${employeeNumber} is not current (CURRENT_EMP_FLAG)`);
    if (!['NONE', 'FUTURE'].includes(terminationStatus)) {
      problems.push(`Employee ${employeeNumber} has a termination date of today or earlier`);
    }
    if (!username) problems.push(`Employee ${employeeNumber} has no USER_NAME`);
    else if (usernameMatches !== 1) problems.push(`USER_NAME of ${employeeNumber} is not unique`);
    employee = { username };
  }

  return { problems, employee };
}

/** Plan summary printed in dry runs; codes and counts only. */
export function describePlan() {
  return [
    `Module:            ${SECURITY_MODULE.code}`,
    `Resources:         ${SECURITY_RESOURCES.map((resource) => resource.code).join(', ')}`,
    `Permissions:       ${EXPECTED_COUNTS.permissions}`,
    `Roles:             ${Object.values(ADMINISTRATOR_ROLES).join(', ')}`,
    `Role permissions:  ${EXPECTED_COUNTS.rolePermissions} (all to ${ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR})`,
    `User:              employee ${SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER}, ACTIVE, password set now`,
    `User roles:        1 (${ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR})`,
    `Audit:             1 ${AUDIT_EVENTS.SECURITY_BOOTSTRAP} event`,
  ];
}

/**
 * Reads one line from a TTY. With `hidden`, nothing is echoed. Ctrl-C cancels.
 * Uses raw mode only; no dependency.
 */
export function promptLine(io, label, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const { input, output } = io;
    let value = '';
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new BootstrapRefused('Cancelled by operator.'));
        if (char === '\u007f' || char === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (char >= ' ') {
          value += char;
          if (!hidden) output.write(char);
        }
      }
    };
    output.write(label);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/**
 * Prompts for the new password twice (hidden), enforces the locked policy, hashes it with the
 * approved Argon2id function and confirms the hash verifies. Returns only the hash; the plaintext
 * stays local to this function (JavaScript strings cannot be wiped, so it is never stored or
 * passed anywhere else).
 */
export async function readPasswordHash(io, argon2Cost) {
  const label = `Password for employee ${SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER} (hidden): `;
  const password = await promptLine(io, label, { hidden: true });
  const repeat = await promptLine(io, 'Repeat password (hidden): ', { hidden: true });

  if (password !== repeat) throw new BootstrapRefused('Passwords do not match.');
  const failures = checkPasswordPolicy(password);
  if (failures.length > 0) {
    throw new BootstrapRefused(`Password does not meet the policy: ${failures.join(', ')}.`);
  }
  const passwordHash = await hashPassword(password, argon2Cost);
  if ((await verifyPassword(password, passwordHash)) !== 'MATCH') {
    throw new Error('Hash self-verification failed');
  }
  return passwordHash;
}

async function insertReturningId(connection, sql, binds) {
  const result = await connection.execute(sql, { ...binds, id: ID_OUT() });
  return result.outBinds.id[0];
}

/**
 * All writes, in dependency order, inside the caller's transaction. CREATED_BY is NULL on every
 * row (approved bootstrap exception); timestamps use the database UTC defaults.
 */
export async function applyBootstrap(connection, { passwordHash, correlationId }) {
  const moduleId = await insertReturningId(connection, BOOTSTRAP_SQL.insertModule, {
    code: SECURITY_MODULE.code,
    name: SECURITY_MODULE.name,
    description: SECURITY_MODULE.description,
    displayOrder: SECURITY_MODULE.displayOrder,
  });

  const permissionIds = [];
  for (const resource of SECURITY_RESOURCES) {
    const resourceId = await insertReturningId(connection, BOOTSTRAP_SQL.insertResource, {
      moduleId,
      code: resource.code,
      name: resource.name,
      description: `${resource.name} administration`,
    });
    for (const actionCode of resource.actions) {
      permissionIds.push(
        await insertReturningId(connection, BOOTSTRAP_SQL.insertPermission, {
          resourceId,
          actionCode,
          description: `${titleCase(actionCode)} ${resource.name.toLowerCase()}`,
        }),
      );
    }
  }

  const roleIds = {};
  for (const role of ADMINISTRATOR_ROLE_DEFINITIONS) {
    roleIds[role.code] = await insertReturningId(connection, BOOTSTRAP_SQL.insertRole, {
      code: role.code,
      name: role.name,
      description: role.description,
    });
  }
  const superRoleId = roleIds[ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR];

  for (const permissionId of permissionIds) {
    await connection.execute(BOOTSTRAP_SQL.insertRolePermission, {
      roleId: superRoleId,
      permissionId,
    });
  }

  const userId = await insertReturningId(connection, BOOTSTRAP_SQL.insertUser, {
    employeeNumber: SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER,
    passwordHash,
  });
  await connection.execute(BOOTSTRAP_SQL.insertUserRole, { userId, roleId: superRoleId });

  await insertAuditEvent(
    connection,
    buildAuditEvent({
      eventCode: AUDIT_EVENTS.SECURITY_BOOTSTRAP,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      actorType: ACTOR_TYPES.SYSTEM,
      subjectUserId: userId,
      target: { type: 'USER', id: userId },
      reasonCode: 'INITIAL_SUPER_ADMINISTRATOR',
      details: {
        ...EXPECTED_COUNTS,
        superAdministratorRole: ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR,
      },
      context: { requestId: correlationId, ipAddress: null, userAgent: 'zr-bootstrap-test-rbac' },
    }),
  );

  return { moduleId, superRoleId, userId };
}

/** Post-write checks inside the transaction; any mismatch throws so the transaction rolls back. */
export async function verifyBootstrap(connection, ids, { username, correlationId }) {
  const [row] = (
    await connection.execute(BOOTSTRAP_SQL.verifyCounts, {
      moduleId: ids.moduleId,
      superRoleId: ids.superRoleId,
      userId: ids.userId,
      correlationId,
      ...roleBinds(),
    })
  ).rows;
  const actual = {
    modules: row[0],
    resources: row[1],
    permissions: row[2],
    roles: row[3],
    rolePermissions: row[4],
    users: row[5],
    userRoles: row[6],
    auditEvents: row[7],
  };
  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (actual[key] !== expected) {
      throw new Error(`Verification failed: ${key} is ${actual[key]}, expected ${expected}`);
    }
  }

  // The real login lookup must resolve Zaid to this account and classify it as privileged.
  const candidates = await findLoginCandidates(connection, username);
  const account = candidates.length === 1 ? candidates[0].account : null;
  if (!account || account.userId !== ids.userId || account.accountStatus !== 'ACTIVE') {
    throw new Error('Verification failed: login lookup does not resolve the new account');
  }
  if (!account.isPrivilegedRoleMember || !account.hasSecurityAdministration) {
    throw new Error('Verification failed: account is not classified as privileged');
  }
  const mfa = evaluateMfaRequirement(account);
  if (!mfa.required || mfa.basis !== 'PROTECTED_ADMINISTRATOR') {
    throw new Error('Verification failed: mandatory MFA is not enforced for the account');
  }
  return actual;
}

/**
 * Entry point. Dependencies are injected so the guards can be tested without Oracle or a TTY.
 *
 * @returns {Promise<number>} process exit code
 */
export async function main({ argv, appConfig, db, io }) {
  const say = (line = '') => io.output.write(`${line}\n`);

  try {
    const { apply } = parseArgs(argv);
    assertEnvironment(appConfig);

    const precheck = await db.withConnection('LOW', async (connection) => {
      await assertDatabaseIdentity(connection);
      return runPrechecks(connection);
    });

    say('Zamil Revamp TEST security bootstrap');
    for (const line of describePlan()) say(`  ${line}`);
    if (precheck.problems.length > 0) {
      say('Preconditions failed; nothing will be written:');
      for (const problem of precheck.problems) say(`  - ${problem}`);
      return 1;
    }
    say('All preconditions passed.');

    if (!apply) {
      say('Dry run (read-only). No changes were made. Re-run with --apply to write.');
      return 0;
    }

    if (!io.input.isTTY || typeof io.input.setRawMode !== 'function') {
      throw new BootstrapRefused('--apply requires an interactive terminal (TTY).');
    }
    const phrase = confirmationPhrase();
    const typed = await promptLine(io, `Type "${phrase}" to write to Oracle TEST: `);
    if (typed !== phrase)
      throw new BootstrapRefused('Confirmation did not match; nothing written.');

    const passwordHash = await readPasswordHash(io, appConfig.auth.argon2);
    const correlationId = `bootstrap-${randomUUID()}`;

    const result = await db.withTransaction('LOW', async (connection) => {
      await connection.execute(BOOTSTRAP_SQL.lock);
      // Re-check everything under the locks: another session may have changed the data.
      await assertDatabaseIdentity(connection);
      const recheck = await runPrechecks(connection);
      if (recheck.problems.length > 0) {
        throw new BootstrapRefused(`Preconditions changed: ${recheck.problems.join('; ')}`);
      }
      const ids = await applyBootstrap(connection, { passwordHash, correlationId });
      const counts = await verifyBootstrap(connection, ids, {
        username: recheck.employee.username,
        correlationId,
      });
      return { ids, counts };
    });

    say('Bootstrap committed.');
    for (const [key, value] of Object.entries(result.counts)) say(`  ${key}: ${value}`);
    say(`  Super Administrator USER_ID: ${result.ids.userId}`);
    say('  Sign-in remains blocked until Phase 02 MFA verification exists (MFA_REQUIRED).');
    return 0;
  } catch (error) {
    // Messages never include the password or hash; Oracle errors are reduced to their code.
    if (error instanceof BootstrapRefused) say(`Refused: ${error.message}`);
    else say(`Bootstrap failed and was rolled back: ${error.code ?? error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [{ config }, oracle, { validateWallet }] = await Promise.all([
    import('../src/config/index.js'),
    import('../src/database/oracle.js'),
    import('../src/database/wallet.js'),
  ]);
  let exitCode = 1;
  try {
    assertEnvironment(config);
    validateWallet(
      config.database.walletDir,
      [config.database.pools.LOW.alias],
      config.database.walletPassword,
    );
    await oracle.createPool(oracle.POOLS.LOW);
    exitCode = await main({
      argv: process.argv.slice(2),
      appConfig: config,
      db: { withConnection: oracle.withConnection, withTransaction: oracle.withTransaction },
      io: { input: process.stdin, output: process.stdout },
    });
  } catch (error) {
    process.stdout.write(`Refused: ${error.message}\n`);
  } finally {
    await oracle.closeDatabase();
  }
  process.exitCode = exitCode;
}
