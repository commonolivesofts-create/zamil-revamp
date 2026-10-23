// Read-only verification of the Phase 01 authentication SQL against the configured Oracle
// database (`npm run db:verify-auth`). Never writes:
//   - SELECT statements are executed with harmless inputs; only row counts and value types are
//     printed, never employee data.
//   - INSERT/UPDATE statements are captured from the repositories and only parsed with
//     DBMS_SQL.PARSE, which compiles DML against the schema without executing it. No rows are
//     changed and no identity values are consumed.
import { randomBytes } from 'node:crypto';
import { BOOTSTRAP_SQL } from './bootstrap-test-rbac.js';
import { REGISTER_SQL } from './lib/rbacRegistration.js';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import * as auditRepository from '../src/modules/audit/securityAudit.repository.js';
import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
} from '../src/modules/audit/securityAudit.service.js';
import * as authorizationRepository from '../src/modules/access-control/authorization.repository.js';
import * as rbacRepository from '../src/modules/access-control/rbac.repository.js';
import * as usersRepository from '../src/modules/users/users.repository.js';
import * as recoveryRepository from '../src/modules/auth/recovery.repository.js';
import { PASSWORD_POLICY } from '../src/modules/auth/auth.policy.js';
import * as authRepository from '../src/modules/auth/auth.repository.js';
import * as sessionRepository from '../src/modules/auth/session.repository.js';

const PARSE_ONLY = `
  DECLARE
    c INTEGER := DBMS_SQL.OPEN_CURSOR;
  BEGIN
    DBMS_SQL.PARSE(c, :statement, DBMS_SQL.NATIVE);
    DBMS_SQL.CLOSE_CURSOR(c);
  EXCEPTION
    WHEN OTHERS THEN
      IF DBMS_SQL.IS_OPEN(c) THEN DBMS_SQL.CLOSE_CURSOR(c); END IF;
      RAISE;
  END;`;

/** Captures the statement a repository function would run, without touching the database. */
async function captureSql(call) {
  let captured;
  const connection = {
    async execute(sql) {
      captured = sql;
      return { rows: [], rowsAffected: 0, outBinds: {} };
    },
  };
  try {
    await call(connection);
  } catch {
    // Result mapping of the stub response may fail; only the captured SQL matters.
  }
  return captured;
}

const dummyHash = Buffer.alloc(32);
const DML = {
  'auth.recordFailedAttempt': (c) =>
    authRepository.recordFailedAttempt(c, { userId: '0', maxFailures: 5, lockSeconds: 900 }),
  'auth.resetFailedAttempts': (c) => authRepository.resetFailedAttempts(c, '0'),
  'auth.recordLoginSuccess': (c) => authRepository.recordLoginSuccess(c, '0'),
  'session.insertSession': (c) =>
    sessionRepository.insertSession(c, {
      userId: '0',
      tokenHash: dummyHash,
      absoluteSeconds: 1,
      ipAddress: null,
      userAgent: null,
    }),
  'session.touchSession': (c) => sessionRepository.touchSession(c, { sessionId: '0', userId: '0' }),
  'session.revokeSession': (c) =>
    sessionRepository.revokeSession(c, { sessionId: '0', actorUserId: null }),
  'session.revokeSessionByTokenHash': (c) =>
    sessionRepository.revokeSessionByTokenHash(c, { tokenHash: dummyHash, actorUserId: null }),
  'audit.insertAuditEvent': (c) => auditRepository.insertAuditEvent(c, {}),
  'session.revokeUserSessions': (c) =>
    sessionRepository.revokeUserSessions(c, { userId: '0', actorUserId: null }),
  'auth.recordMfaStep': (c) => authRepository.recordMfaStep(c, { userId: '0', step: 1 }),
  'auth.enrollMfa': (c) =>
    authRepository.enrollMfa(c, { userId: '0', encryptedSecret: 'x', step: 1 }),
  'auth.replaceMfa': (c) =>
    authRepository.replaceMfa(c, {
      userId: '0',
      currentEncryptedSecret: 'x',
      encryptedSecret: 'y',
      step: 1,
    }),
  // Phase 03 RBAC administration (INSERT/UPDATE/MERGE).
  'rbac.insertRole': (c) =>
    rbacRepository.insertRole(c, {
      roleCode: 'X',
      roleName: 'x',
      description: null,
      actorUserId: '0',
    }),
  'rbac.updateRole': (c) =>
    rbacRepository.updateRole(c, {
      roleId: '0',
      roleName: 'x',
      description: null,
      actorUserId: '0',
    }),
  'rbac.insertModule': (c) =>
    rbacRepository.insertModule(c, {
      moduleCode: 'X',
      moduleName: 'x',
      description: null,
      displayOrder: 0,
      actorUserId: '0',
    }),
  'rbac.insertResource': (c) =>
    rbacRepository.insertResource(c, {
      moduleId: '0',
      resourceCode: 'X',
      resourceName: 'x',
      description: null,
      actorUserId: '0',
    }),
  'rbac.insertPermission': (c) =>
    rbacRepository.insertPermission(c, {
      resourceId: '0',
      actionCode: 'X',
      description: null,
      actorUserId: '0',
    }),
  ...Object.fromEntries(
    ['ROLE', 'MODULE', 'RESOURCE', 'PERMISSION'].map((entity) => [
      `rbac.setActive(${entity})`,
      (c) => rbacRepository.setActive(c, { entity, id: '0', isActive: true, actorUserId: '0' }),
    ]),
  ),
  'rbac.grantRolePermission': (c) =>
    rbacRepository.grantRolePermission(c, { roleId: '0', permissionId: '0', actorUserId: '0' }),
  'rbac.revokeRolePermission': (c) =>
    rbacRepository.revokeRolePermission(c, { roleId: '0', permissionId: '0', actorUserId: '0' }),
  'rbac.assignUserRole': (c) =>
    rbacRepository.assignUserRole(c, {
      userId: '0',
      roleId: '0',
      expiresAt: null,
      actorUserId: '0',
    }),
  'rbac.unassignUserRole': (c) =>
    rbacRepository.unassignUserRole(c, { userId: '0', roleId: '0', actorUserId: '0' }),
  'rbac.setOverride': (c) =>
    rbacRepository.setOverride(c, {
      userId: '0',
      permissionId: '0',
      effect: 'DENY',
      justification: 'x',
      expiresAt: null,
      actorUserId: '0',
    }),
  'rbac.revokeOverride': (c) =>
    rbacRepository.revokeOverride(c, { userId: '0', permissionId: '0', actorUserId: '0' }),
  // Phase 04 user administration.
  'users.insertUser': (c) =>
    usersRepository.insertUser(c, { employeeNumber: 'X', actorUserId: '0' }),
  'users.activateUser': (c) => usersRepository.activateUser(c, { userId: '0', actorUserId: '0' }),
  'users.disableUser': (c) => usersRepository.disableUser(c, { userId: '0', actorUserId: '0' }),
  'users.revokeUserSession': (c) =>
    usersRepository.revokeUserSession(c, { userId: '0', sessionId: '0', actorUserId: '0' }),
  'users.revokeActionTokens': (c) =>
    usersRepository.revokeActionTokens(c, { userId: '0', actorUserId: '0' }),
  // Phase 05 recovery (the row lock is parsed only, never executed).
  'recovery.lockUser': (c) => recoveryRepository.lockUser(c, '0'),
  'recovery.revokeOutstandingTokens': (c) =>
    recoveryRepository.revokeOutstandingTokens(c, {
      userId: '0',
      actionType: 'PASSWORD_RESET',
      actorUserId: '0',
    }),
  'recovery.insertToken': (c) =>
    recoveryRepository.insertToken(c, {
      userId: '0',
      actionType: 'PASSWORD_RESET',
      tokenHash: dummyHash,
      lifetimeSeconds: 60,
      actorUserId: '0',
    }),
  'recovery.consumeToken': (c) =>
    recoveryRepository.consumeToken(c, { tokenId: '0', actorUserId: '0' }),
  'recovery.setPassword': (c) =>
    recoveryRepository.setPassword(c, {
      userId: '0',
      passwordHash: 'x',
      expectedStatus: 'PENDING',
      activate: true,
      actorUserId: '0',
    }),
};

// --- Synthetic classification vectors (user 1 is the subject) -------------------------------
// Catalogue: module 10 SECURITY_ADMINISTRATION (permission 1000 = SECURITY_AUDIT VIEW) and an
// ordinary module 20 (permission 2000). Role 5 AUDIT_VIEWER is an ordinary-named role holding the
// security VIEW permission; role 4 is an ordinary business role.
const PAST = "SYSTIMESTAMP - INTERVAL '1' DAY";
const FUTURE = "SYSTIMESTAMP + INTERVAL '1' DAY";
const NO_EXPIRY = 'CAST(NULL AS TIMESTAMP WITH TIME ZONE)';
const ACTIVE = { active: 1, expires: NO_EXPIRY };

const CLASSIFICATION_VECTORS = [
  { label: 'no grants', expect: [0, 0] },
  { label: 'ADMINISTRATOR member', userRoles: [[3, ACTIVE]], expect: [1, 0] },
  { label: 'SUPER_ADMINISTRATOR member', userRoles: [[1, ACTIVE]], expect: [1, 0] },
  {
    label: 'MAIN_ADMINISTRATOR, future expiry',
    userRoles: [[2, { active: 1, expires: FUTURE }]],
    expect: [1, 0],
  },
  {
    label: 'admin membership inactive',
    userRoles: [[2, { active: 0, expires: NO_EXPIRY }]],
    expect: [0, 0],
  },
  {
    label: 'admin membership expired',
    userRoles: [[3, { active: 1, expires: PAST }]],
    expect: [0, 0],
  },
  { label: 'admin role inactive', userRoles: [[3, ACTIVE]], inactive: ['role3'], expect: [0, 0] },
  { label: 'ordinary business role only', userRoles: [[4, ACTIVE]], expect: [0, 0] },
  {
    label: 'ALLOW on an ordinary permission',
    overrides: [[2000, 'ALLOW', ACTIVE]],
    expect: [0, 0],
  },
  { label: 'role with security VIEW', userRoles: [[5, ACTIVE]], expect: [0, 1] },
  {
    label: 'role with security VIEW + DENY',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', ACTIVE]],
    expect: [0, 0],
  },
  {
    label: 'role with security VIEW + expired DENY',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', { active: 1, expires: PAST }]],
    expect: [0, 1],
  },
  {
    label: 'role with security VIEW + inactive DENY',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', { active: 0, expires: NO_EXPIRY }]],
    expect: [0, 1],
  },
  { label: 'ALLOW on security VIEW', overrides: [[1000, 'ALLOW', ACTIVE]], expect: [0, 1] },
  {
    label: 'expired ALLOW on security VIEW',
    overrides: [[1000, 'ALLOW', { active: 1, expires: PAST }]],
    expect: [0, 0],
  },
  {
    label: 'ALLOW + DENY on security VIEW',
    overrides: [
      [1000, 'ALLOW', ACTIVE],
      [1000, 'DENY', ACTIVE],
    ],
    expect: [0, 0],
  },
  {
    label: 'security role grant inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['rolePermission'],
    expect: [0, 0],
  },
  {
    label: 'security permission inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['permission1000'],
    expect: [0, 0],
  },
  {
    label: 'security resource inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['resource100'],
    expect: [0, 0],
  },
  {
    label: 'security module inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['module10'],
    expect: [0, 0],
  },
  {
    label: 'DENY does not remove admin role membership',
    userRoles: [[3, ACTIVE]],
    overrides: [[1000, 'DENY', ACTIVE]],
    expect: [1, 0],
  },
];

// Phase 03 request-time decision [catalogActive, denied, allowedByOverride, allowedByRole] for
// permission 1000 (SECURITY_ADMINISTRATION.SECURITY_AUDIT:VIEW); role 5 holds it.
const DECISION_VECTORS = [
  { label: 'no grants (default deny)', expect: [1, 0, 0, 0] },
  { label: 'role grant', userRoles: [[5, ACTIVE]], expect: [1, 0, 0, 1] },
  {
    label: 'role grant, future expiry',
    userRoles: [[5, { active: 1, expires: FUTURE }]],
    expect: [1, 0, 0, 1],
  },
  {
    label: 'membership expired',
    userRoles: [[5, { active: 1, expires: PAST }]],
    expect: [1, 0, 0, 0],
  },
  {
    label: 'membership inactive',
    userRoles: [[5, { active: 0, expires: NO_EXPIRY }]],
    expect: [1, 0, 0, 0],
  },
  { label: 'role inactive', userRoles: [[5, ACTIVE]], inactive: ['role5'], expect: [1, 0, 0, 0] },
  {
    label: 'role grant inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['rolePermission'],
    expect: [1, 0, 0, 0],
  },
  { label: 'ALLOW override', overrides: [[1000, 'ALLOW', ACTIVE]], expect: [1, 0, 1, 0] },
  {
    label: 'expired ALLOW',
    overrides: [[1000, 'ALLOW', { active: 1, expires: PAST }]],
    expect: [1, 0, 0, 0],
  },
  {
    label: 'DENY + role grant',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', ACTIVE]],
    expect: [1, 1, 0, 1],
  },
  {
    label: 'expired DENY',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', { active: 1, expires: PAST }]],
    expect: [1, 0, 0, 1],
  },
  {
    label: 'inactive DENY',
    userRoles: [[5, ACTIVE]],
    overrides: [[1000, 'DENY', { active: 0, expires: NO_EXPIRY }]],
    expect: [1, 0, 0, 1],
  },
  {
    label: 'ALLOW + DENY',
    overrides: [
      [1000, 'ALLOW', ACTIVE],
      [1000, 'DENY', ACTIVE],
    ],
    expect: [1, 1, 1, 0],
  },
  {
    label: 'permission inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['permission1000'],
    expect: [0, 0, 0, 1],
  },
  {
    label: 'resource inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['resource100'],
    expect: [0, 0, 0, 1],
  },
  {
    label: 'module inactive',
    userRoles: [[5, ACTIVE]],
    inactive: ['module10'],
    expect: [0, 0, 0, 1],
  },
  { label: 'ordinary role does not grant it', userRoles: [[4, ACTIVE]], expect: [1, 0, 0, 0] },
];

function rows(columns, data) {
  if (data.length === 0) {
    return `SELECT ${columns.map((column) => `CAST(NULL AS NUMBER) ${column}`).join(', ')} FROM dual WHERE 1 = 0`;
  }
  return data
    .map(
      (values) =>
        `SELECT ${values.map((value, i) => `${value} ${columns[i]}`).join(', ')} FROM dual`,
    )
    .join(' UNION ALL ');
}

function syntheticTables({ userRoles = [], overrides = [], inactive = [] }) {
  const on = (key) => (inactive.includes(key) ? 0 : 1);
  const tables = {
    xx_zrv_users: rows(['user_id'], [[1]]),
    xx_zrv_app_modules: rows(
      ['module_id', 'module_code', 'is_active'],
      [
        [10, "'SECURITY_ADMINISTRATION'", on('module10')],
        [20, "'PRODUCTION'", 1],
      ],
    ),
    xx_zrv_resources: rows(
      ['resource_id', 'module_id', 'resource_code', 'is_active'],
      [
        [100, 10, "'SECURITY_AUDIT'", on('resource100')],
        [200, 20, "'WORK_ORDERS'", 1],
      ],
    ),
    xx_zrv_permissions: rows(
      ['permission_id', 'resource_id', 'action_code', 'is_active'],
      [
        [1000, 100, "'VIEW'", on('permission1000')],
        [2000, 200, "'VIEW'", 1],
      ],
    ),
    xx_zrv_roles: rows(
      ['role_id', 'role_code', 'is_active'],
      [
        [1, "'SUPER_ADMINISTRATOR'", 1],
        [2, "'MAIN_ADMINISTRATOR'", 1],
        [3, "'ADMINISTRATOR'", on('role3')],
        [4, "'PRODUCTION_SUPERVISOR'", 1],
        [5, "'AUDIT_VIEWER'", on('role5')],
      ],
    ),
    xx_zrv_role_permissions: rows(
      ['role_id', 'permission_id', 'is_active'],
      [
        [4, 2000, 1],
        [5, 1000, on('rolePermission')],
      ],
    ),
    xx_zrv_user_roles: rows(
      ['user_id', 'role_id', 'is_active', 'expires_at'],
      userRoles.map(([roleId, { active, expires }]) => [1, roleId, active, expires]),
    ),
    xx_zrv_user_permission_overrides: rows(
      ['user_id', 'permission_id', 'override_effect', 'is_active', 'expires_at'],
      overrides.map(([permissionId, effect, { active, expires }]) => [
        1,
        permissionId,
        `'${effect}'`,
        active,
        expires,
      ]),
    ),
  };
  // Empty user_roles/overrides need typed columns for the comparisons.
  if (userRoles.length === 0) {
    tables.xx_zrv_user_roles = `SELECT 0 user_id, 0 role_id, 0 is_active, CAST(NULL AS TIMESTAMP WITH TIME ZONE) expires_at FROM dual WHERE 1 = 0`;
  }
  if (overrides.length === 0) {
    tables.xx_zrv_user_permission_overrides = `SELECT 0 user_id, 0 permission_id, CAST(NULL AS VARCHAR2(5)) override_effect, 0 is_active, CAST(NULL AS TIMESTAMP WITH TIME ZONE) expires_at FROM dual WHERE 1 = 0`;
  }
  const withClause = Object.entries(tables)
    .map(([name, query]) => `${name} AS (${query})`)
    .join(',\n');
  return `WITH ${withClause}\n`;
}

const classificationProbeSql = (vector) =>
  `${syntheticTables(vector)}SELECT ${authRepository.PRIVILEGE_COLUMNS.sql} FROM xx_zrv_users u`;
const decisionProbeSql = (vector) =>
  `${syntheticTables(vector)}${authorizationRepository.PERMISSION_DECISION_SQL}`;

const describeType = (value) =>
  value === null ? 'null' : value instanceof Date ? 'Date' : typeof value;

let failures = 0;
async function check(label, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${label}${detail ? `  (${detail})` : ''}`);
  } catch (error) {
    failures += 1;
    console.log(
      `FAIL  ${label}  ${[error.code, error.message.split('\n')[0]].filter(Boolean).join(' ')}`,
    );
  }
}

const { database } = config;
validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
await createPool(POOLS.LOW);

try {
  await withConnection(POOLS.LOW, async (connection) => {
    await check('auth.findLoginCandidates (unknown username)', async () => {
      const rows = await authRepository.findLoginCandidates(
        connection,
        `zr-verify-${randomBytes(8).toString('hex')}`,
      );
      if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
      return '0 rows';
    });

    await check('auth.findLoginCandidates (one existing employee username)', async () => {
      // A username is read into memory only to exercise the join; it is never printed.
      const sample = await connection.execute(
        `SELECT user_name FROM xx_digi_emp_master WHERE user_name IS NOT NULL FETCH FIRST 1 ROWS ONLY`,
      );
      if (sample.rows.length === 0) return 'skipped: no employee usernames';

      const rows = await authRepository.findLoginCandidates(connection, sample.rows[0][0]);
      const [row] = rows;
      return [
        `${rows.length} row(s)`,
        `account=${row.account === null ? 'none' : 'linked'}`,
        `dbNow=${describeType(row.dbNow)}`,
        `employeeRowCount=${describeType(row.employee.employeeRowCount)}`,
        `terminationStatus=${row.employee.terminationStatus}`,
      ].join(', ');
    });

    await check('auth.findMfaCredential (nonexistent user)', async () => {
      const credential = await authRepository.findMfaCredential(connection, '0');
      if (credential !== null) throw new Error('expected no credential');
      return 'no row';
    });

    await check('session.findSessionByTokenHash (random digest)', async () => {
      const rows = await sessionRepository.findSessionByTokenHash(connection, randomBytes(32));
      if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
      return '0 rows';
    });

    // Decision 01: termination status against Oracle's own DATE and time-zone semantics.
    const at = (instant) => `TO_TIMESTAMP_TZ('${instant}', 'YYYY-MM-DD"T"HH24:MI:SS TZH:TZM')`;
    const vectors = [
      ['NULL', 'CAST(NULL AS DATE)', '2026-10-19T08:00:00 +00:00', 'NONE'],
      ['past', "DATE '2026-01-01'", '2026-10-19T08:00:00 +00:00', 'ENDED'],
      ['today (KSA)', "DATE '2026-10-19'", '2026-10-19T08:00:00 +00:00', 'ENDED'],
      ['tomorrow (KSA)', "DATE '2026-10-20'", '2026-10-19T08:00:00 +00:00', 'FUTURE'],
      ['UTC D, KSA D+1: D+1', "DATE '2026-10-20'", '2026-10-19T22:30:00 +00:00', 'ENDED'],
      ['UTC D, KSA D+1: D+2', "DATE '2026-10-21'", '2026-10-19T22:30:00 +00:00', 'FUTURE'],
      [
        'date with time part',
        "TO_DATE('2026-10-20 23:59', 'YYYY-MM-DD HH24:MI')",
        '2026-10-20T08:00:00 +00:00',
        'ENDED',
      ],
    ];
    for (const [label, date, instant, expected] of vectors) {
      await check(`termination status: ${label}`, async () => {
        const sql = `SELECT ${authRepository.terminationStatusSql(date, at(instant))} FROM dual`;
        const actual = (await connection.execute(sql)).rows[0][0];
        if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
        return actual;
      });
    }

    // Decision 02: the deployed classification SQL (approved catalogue) against the real tables.
    await check('privilege classification SQL against the real tables', async () => {
      const result = await connection.execute(
        `SELECT ${authRepository.PRIVILEGE_COLUMNS.sql} FROM dual LEFT JOIN xx_zrv_users u ON 1 = 0`,
        authRepository.PRIVILEGE_COLUMNS.binds,
      );
      return `evaluated: ${JSON.stringify(result.rows[0])}`;
    });

    // Decision 02 semantics, executed by Oracle on synthetic rows. WITH clauses shadow the RBAC
    // table names inside the query only, so the real classification SQL runs without any write.
    for (const vector of CLASSIFICATION_VECTORS) {
      await check(`classification: ${vector.label}`, async () => {
        const result = await connection.execute(
          classificationProbeSql(vector),
          authRepository.PRIVILEGE_COLUMNS.binds,
        );
        const actual = result.rows[0];
        if (actual[0] !== vector.expect[0] || actual[1] !== vector.expect[1]) {
          throw new Error(
            `expected ${JSON.stringify(vector.expect)}, got ${JSON.stringify(actual)}`,
          );
        }
        return `role=${actual[0]} securityAdmin=${actual[1]}`;
      });
    }

    // Phase 03: the request-time decision SQL on the same synthetic rows (no writes).
    for (const vector of DECISION_VECTORS) {
      await check(`decision: ${vector.label}`, async () => {
        const result = await connection.execute(decisionProbeSql(vector), {
          userId: 1,
          moduleCode: 'SECURITY_ADMINISTRATION',
          resourceCode: 'SECURITY_AUDIT',
          actionCode: 'VIEW',
        });
        if (result.rows.length !== 1) throw new Error(`expected 1 row, got ${result.rows.length}`);
        const actual = result.rows[0].slice(1);
        if (JSON.stringify(actual) !== JSON.stringify(vector.expect)) {
          throw new Error(
            `expected ${JSON.stringify(vector.expect)}, got ${JSON.stringify(actual)}`,
          );
        }
        return JSON.stringify(actual);
      });
    }

    // Phase 03 read-only RBAC SELECTs against the real tables (counts and booleans only).
    const count = async (promise) => `${(await promise).length} rows`;
    const reads = {
      'authorization.findPermissionDecision (user 0)': async () => {
        const facts = await authorizationRepository.findPermissionDecision(connection, {
          userId: '0',
          moduleCode: 'SECURITY_ADMINISTRATION',
          resourceCode: 'ROLES',
          actionCode: 'VIEW',
        });
        if (!facts) return 'permission not in catalogue';
        if (facts.denied || facts.allowedByOverride || facts.allowedByRole) {
          throw new Error('a nonexistent user must hold nothing');
        }
        return `catalogActive=${facts.catalogActive}`;
      },
      'authorization.listEffectivePermissions (user 0)': async () => {
        const list = await authorizationRepository.listEffectivePermissions(connection, '0');
        if (list.length !== 0) throw new Error(`expected 0, got ${list.length}`);
        return '0 rows';
      },
      'rbac.findUser (0)': async () => String(await rbacRepository.findUser(connection, '0')),
      // The Super Administrator must be classified as privileged by the shared classification.
      'rbac.findUser (USER_ID 1) classification': async () => {
        const user = await rbacRepository.findUser(connection, '1');
        if (!user) return 'no USER_ID 1';
        if (!user.isPrivilegedRoleMember || !user.hasSecurityAdministration) {
          throw new Error('Super Administrator not classified as privileged');
        }
        return 'privilegedRole=true, securityAdministration=true';
      },
      'rbac.listRoles': async () => {
        const page = await rbacRepository.listRoles(connection, { limit: 5, offset: 0 });
        return `total=${page.total} (${typeof page.total}), page=${page.items.length}`;
      },
      'rbac.findRole (0)': async () => String(await rbacRepository.findRole(connection, '0')),
      'rbac.listCatalog': async () => {
        const modules = await rbacRepository.listCatalog(connection);
        const resources = modules.reduce((n, m) => n + m.resources.length, 0);
        return `${modules.length} module(s), ${resources} resource(s)`;
      },
      'rbac.findModule (0)': async () => String(await rbacRepository.findModule(connection, '0')),
      'rbac.findResource (0)': async () =>
        String(await rbacRepository.findResource(connection, '0')),
      'rbac.findPermission (0)': async () =>
        String(await rbacRepository.findPermission(connection, '0')),
      'rbac.listRolePermissions (0)': () =>
        count(rbacRepository.listRolePermissions(connection, '0')),
      'rbac.listActiveRoleGrantKeys (0)': () =>
        count(rbacRepository.listActiveRoleGrantKeys(connection, '0')),
      'rbac.listUserRoles (0)': () => count(rbacRepository.listUserRoles(connection, '0')),
      'rbac.listUserOverrides (0)': () => count(rbacRepository.listUserOverrides(connection, '0')),
    };
    for (const [label, fn] of Object.entries(reads)) await check(label, fn);

    // Phase 04 user administration SELECTs (counts, types and booleans only; no employee data).
    const page = { limit: 5, offset: 0 };
    const userReads = {
      'users.listUsers (no filter)': async () => {
        const r = await usersRepository.listUsers(connection, {
          ...page,
          sortBy: 'employeeNumber',
        });
        return `total=${r.total} (${typeof r.total}), page=${r.items.length}`;
      },
      'users.listUsers (all filters, escaped search, desc)': async () => {
        const r = await usersRepository.listUsers(connection, {
          ...page,
          filters: { search: '%\\%\\_%', status: 'ACTIVE', mfaEnrolled: true, locked: false },
          sortBy: 'lastLoginAt',
          sortOrder: 'desc',
        });
        if (r.total !== 0) throw new Error('escaped wildcard search must match nothing');
        return 'total=0';
      },
      ...Object.fromEntries(
        ['username', 'createdAt'].map((sortBy) => [
          `users.listUsers (sort ${sortBy})`,
          async () =>
            `page=${(await usersRepository.listUsers(connection, { ...page, sortBy })).items.length}`,
        ]),
      ),
      'users.findUserDetail (0)': async () =>
        String(await usersRepository.findUserDetail(connection, '0')),
      'users.findUserDetail (USER_ID 1)': async () => {
        const u = await usersRepository.findUserDetail(connection, '1');
        if (!u) return 'no USER_ID 1';
        return [
          `status=${u.accountStatus}`,
          `passwordSet=${u.passwordSet}`,
          `employee=${u.employee ? 'linked' : 'none'}`,
          `privilegedRole=${u.isPrivilegedRoleMember}`,
          `dbNow=${describeType(u.dbNow)}`,
        ].join(', ');
      },
      'users.listActiveSessions (0)': async () =>
        `${(await usersRepository.listActiveSessions(connection, '0')).length} rows`,
      'users.findSession (0)': async () =>
        String(await usersRepository.findSession(connection, { userId: '0', sessionId: '0' })),
      'users.listEmployeeCandidates': async () => {
        const r = await usersRepository.listEmployeeCandidates(connection, {
          ...page,
          hasAccount: false,
        });
        const types = r.items.map((c) => typeof c.usernameCount);
        return `total=${r.total}, page=${r.items.length}, usernameCount=${types[0] ?? 'n/a'}`;
      },
      'users.listEmployeeCandidates (search, with account)': async () => {
        const r = await usersRepository.listEmployeeCandidates(connection, {
          ...page,
          search: '%A%',
          hasAccount: true,
        });
        return `total=${r.total}`;
      },
      'users.findEmployeeCandidate (unknown)': async () => {
        const r = await usersRepository.findEmployeeCandidate(connection, 'ZR-VERIFY-NONE');
        if (r.length !== 0) throw new Error(`expected 0, got ${r.length}`);
        return '0 rows';
      },
    };
    for (const [label, fn] of Object.entries(userReads)) await check(label, fn);

    // Phase 05 recovery SELECTs (counts and booleans only).
    const recoveryReads = {
      'recovery.hasRecentToken (user 0)': async () =>
        String(
          await recoveryRepository.hasRecentToken(connection, {
            userId: '0',
            actionType: 'PASSWORD_RESET',
            seconds: 300,
          }),
        ),
      'recovery.findToken (random digest)': async () => {
        const found = await recoveryRepository.findToken(connection, randomBytes(32));
        if (found !== null) throw new Error('a random digest must not match');
        return 'null';
      },
      'recovery.findPasswordHash (user 0)': async () =>
        String(await recoveryRepository.findPasswordHash(connection, '0')),
      ...Object.fromEntries(
        PASSWORD_POLICY.expiryReminderDays.map((daysBefore) => [
          `recovery.listPasswordExpiryReminders (${daysBefore} days)`,
          async () =>
            `${(await recoveryRepository.listPasswordExpiryReminders(connection, { daysBefore, expiryDays: PASSWORD_POLICY.expiryDays })).length} due`,
        ]),
      ),
    };
    for (const [label, fn] of Object.entries(recoveryReads)) await check(label, fn);

    // Decision 07: evaluate the deployed CHECK conditions for every catalogue value.
    const checks = await connection.execute(
      `SELECT constraint_name, search_condition_vc FROM user_constraints
        WHERE table_name = 'XX_ZRV_RBAC_AUDIT_LOGS'
          AND constraint_name IN ('CK_ZRV_AUD_EVENT', 'CK_ZRV_AUD_OUTCOME', 'CK_ZRV_AUD_ACTOR')`,
    );
    const condition = Object.fromEntries(checks.rows);
    const catalogue = [
      ['CK_ZRV_AUD_EVENT', 'EVENT_CODE', Object.values(AUDIT_EVENTS)],
      ['CK_ZRV_AUD_OUTCOME', 'EVENT_OUTCOME', Object.values(AUDIT_OUTCOMES)],
      ['CK_ZRV_AUD_ACTOR', 'ACTOR_TYPE', Object.values(ACTOR_TYPES)],
    ];
    for (const [name, column, values] of catalogue) {
      await check(`audit catalogue satisfies deployed ${name}`, async () => {
        if (!condition[name]) throw new Error(`${name} not found`);
        const predicate = condition[name].replaceAll(column, ':v');
        for (const value of values) {
          const ok = await connection.execute(
            `SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END FROM dual`,
            { v: value },
          );
          if (ok.rows[0][0] !== 1) throw new Error(`${value} violates ${name}`);
        }
        return values.join(', ');
      });
    }

    await check('control: deployed CK_ZRV_AUD_EVENT rejects malformed codes', async () => {
      const predicate = condition.CK_ZRV_AUD_EVENT.replaceAll('EVENT_CODE', ':v');
      for (const value of ['login_success', 'LOGIN SUCCESS', ' LOGIN_SUCCESS', '1LOGIN']) {
        const ok = await connection.execute(
          `SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END FROM dual`,
          { v: value },
        );
        if (ok.rows[0][0] !== 0) throw new Error(`'${value}' was accepted`);
      }
      return '4 malformed codes rejected';
    });

    // Control: the parse check must reject a statement that references a nonexistent column.
    await check('control: parse rejects an unknown column', async () => {
      try {
        await connection.execute(PARSE_ONLY, {
          statement: 'UPDATE xx_zrv_users SET zr_no_such_column = 1 WHERE user_id = :userId',
        });
      } catch (error) {
        if (error.code === 'ORA-00904') return 'ORA-00904 as expected';
        throw error;
      }
      throw new Error('invalid statement was accepted');
    });

    for (const [label, call] of Object.entries(DML)) {
      await check(`${label} (parse only)`, async () => {
        const sql = await captureSql(call);
        const rowLock = /^\s*SELECT\b[\s\S]*\bFOR UPDATE\s*$/i.test(sql);
        if (!rowLock && !/^\s*(INSERT|UPDATE|MERGE)\b/i.test(sql)) {
          throw new Error('refusing to parse non-DML');
        }
        await connection.execute(PARSE_ONLY, { statement: sql.trim() });
      });
    }

    // Bootstrap script statements: compiled only, never executed. LOCK TABLE is excluded because
    // it is not a SELECT/INSERT statement and the bootstrap itself has not been authorized.
    for (const [label, sql] of Object.entries(BOOTSTRAP_SQL)) {
      if (label === 'lock') continue;
      await check(`bootstrap.${label} (parse only)`, async () => {
        const body = sql.replace(/^\s*\/\*[^*]*\*\/\s*/, '');
        if (!/^(SELECT|INSERT)\b/i.test(body)) throw new Error('refusing to parse this statement');
        await connection.execute(PARSE_ONLY, { statement: sql.trim() });
      });
    }

    // RBAC registration statements (db:rbac-register): compiled only, never executed; LOCK TABLE
    // is excluded for the same reason.
    for (const [label, sql] of Object.entries(REGISTER_SQL)) {
      if (label === 'lock') continue;
      await check(`rbac-register.${label} (parse only)`, async () => {
        const body = sql.replace(/^\s*\/\*[^*]*\*\/\s*/, '');
        if (!/^(SELECT|INSERT)\b/i.test(body)) throw new Error('refusing to parse this statement');
        await connection.execute(PARSE_ONLY, { statement: sql.trim() });
      });
    }
  });
} finally {
  await closeDatabase();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
