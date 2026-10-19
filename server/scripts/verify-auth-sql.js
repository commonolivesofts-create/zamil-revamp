// Read-only verification of the Phase 01 authentication SQL against the configured Oracle
// database (`npm run db:verify-auth`). Never writes:
//   - SELECT statements are executed with harmless inputs; only row counts and value types are
//     printed, never employee data.
//   - INSERT/UPDATE statements are captured from the repositories and only parsed with
//     DBMS_SQL.PARSE, which compiles DML against the schema without executing it. No rows are
//     changed and no identity values are consumed.
import { randomBytes } from 'node:crypto';
import { BOOTSTRAP_SQL } from './bootstrap-test-rbac.js';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import * as auditRepository from '../src/modules/audit/securityAudit.repository.js';
import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
} from '../src/modules/audit/securityAudit.service.js';
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

function classificationProbeSql({ userRoles = [], overrides = [], inactive = [] }) {
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
      ['resource_id', 'module_id', 'is_active'],
      [
        [100, 10, on('resource100')],
        [200, 20, 1],
      ],
    ),
    xx_zrv_permissions: rows(
      ['permission_id', 'resource_id', 'is_active'],
      [
        [1000, 100, on('permission1000')],
        [2000, 200, 1],
      ],
    ),
    xx_zrv_roles: rows(
      ['role_id', 'role_code', 'is_active'],
      [
        [1, "'SUPER_ADMINISTRATOR'", 1],
        [2, "'MAIN_ADMINISTRATOR'", 1],
        [3, "'ADMINISTRATOR'", on('role3')],
        [4, "'PRODUCTION_SUPERVISOR'", 1],
        [5, "'AUDIT_VIEWER'", 1],
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
  return `WITH ${withClause}\nSELECT ${authRepository.PRIVILEGE_COLUMNS.sql} FROM xx_zrv_users u`;
}

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
        if (!/^\s*(INSERT|UPDATE)\b/i.test(sql)) throw new Error('refusing to parse non-DML');
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
  });
} finally {
  await closeDatabase();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
