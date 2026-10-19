import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { config } from '../src/config/index.js';
import {
  APPROVED_TEST_DATABASE,
  assertEnvironment,
  BootstrapRefused,
  EXPECTED_COUNTS,
  main,
  parseArgs,
  promptLine,
  REQUIRED_CONSTRAINTS,
} from '../scripts/bootstrap-test-rbac.js';

// The bootstrap script is exercised with a fake Oracle connection and a fake TTY. Nothing here
// touches a database. The script's SQL is compiled against TEST (parse only) by db:verify-auth.

const PASSWORD = 'Bootstrap-Test-Pass1!';
const testConfig = (overrides = {}) => ({
  ...config,
  env: 'development',
  database: { ...config.database, pools: { LOW: { alias: APPROVED_TEST_DATABASE.lowAlias } } },
  ...overrides,
});

function createFakeOracle(scenario = {}) {
  const state = { executed: [], commits: 0, rollbacks: 0, transactions: 0, inTransaction: false };
  const existing = { module: 0, roles: 0, user: 0, audit: 0, ...scenario.existing };
  let nextId = 100;
  let userId;

  const respond = (label, binds) => {
    switch (label) {
      case 'identity':
        return { rows: [[scenario.serviceName ?? 'abc_zpadwtest_low.adb.oraclecloud.com']] };
      case 'constraints':
        return {
          rows: REQUIRED_CONSTRAINTS.filter((name) => name !== scenario.missingConstraint).map(
            (name) => [
              name,
              name === scenario.disabledConstraint ? 'DISABLED' : 'ENABLED',
              'VALIDATED',
            ],
          ),
        };
      case 'audit-event-check':
        return {
          rows: [
            ["EVENT_CODE = TRIM(EVENT_CODE) AND REGEXP_LIKE(EVENT_CODE, '^[A-Z][A-Z0-9_]*$', 'c')"],
          ],
        };
      case 'audit-event-eval':
        return { rows: [[1]] };
      case 'existing-module':
      case 'existing-roles':
      case 'existing-user':
      case 'existing-audit': {
        const key = label.replace('existing-', '');
        const inTransactionConflict = state.inTransaction && scenario.conflictInTransaction === key;
        return { rows: [[inTransactionConflict ? 1 : existing[key]]] };
      }
      case 'employee':
        return { rows: scenario.employeeRows ?? [['Y', 'NONE', 'zaid.user', 1]] };
      case 'lock':
        return {};
      case 'insert-user':
        userId = String(nextId++);
        return { outBinds: { id: [userId] } };
      case 'insert-module':
      case 'insert-resource':
      case 'insert-permission':
      case 'insert-role':
        return { outBinds: { id: [String(nextId++)] } };
      case 'insert-role-permission':
      case 'insert-user-role':
      case 'insert-audit':
        return { rowsAffected: 1 };
      case 'verify-counts':
        return { rows: [scenario.verifyCounts ?? Object.values(EXPECTED_COUNTS)] };
      case 'login-lookup':
        return {
          rows: [
            {
              EMPLOYEE_NUMBER: '2172',
              USER_NAME: 'zaid.user',
              CURRENT_EMP_FLAG: 'Y',
              TERMINATION_STATUS: 'NONE',
              EMPLOYEE_ROW_COUNT: 1,
              USER_ID: scenario.lookupUserId ?? userId,
              ACCOUNT_STATUS: 'ACTIVE',
              MFA_ENROLLED: 0,
              IS_PRIVILEGED_ROLE_MEMBER: scenario.notPrivileged ? 0 : 1,
              HAS_SECURITY_ADMINISTRATION: scenario.notPrivileged ? 0 : 1,
              DB_NOW: new Date(),
            },
          ],
        };
      default:
        throw new Error(
          `Unexpected statement: ${label} ${JSON.stringify(Object.keys(binds ?? {}))}`,
        );
    }
  };

  const connection = {
    async execute(sql, binds = {}) {
      const label =
        /zr-bootstrap:([a-z-]+)/.exec(sql)?.[1] ??
        (sql.includes('INSERT INTO xx_zrv_rbac_audit_logs')
          ? 'insert-audit'
          : sql.includes('FROM xx_digi_emp_master e')
            ? 'login-lookup'
            : 'unknown');
      const call = { label, binds, inTransaction: state.inTransaction };
      state.executed.push(call);
      if (scenario.failOn === label) {
        throw Object.assign(new Error('ORA-00001: unique constraint violated'), {
          code: 'ORA-00001',
        });
      }
      call.result = respond(label, binds);
      return call.result;
    },
  };

  const db = {
    async withConnection(_pool, work) {
      return work(connection);
    },
    async withTransaction(pool, work) {
      assert.equal(pool, 'LOW');
      state.transactions += 1;
      state.inTransaction = true;
      try {
        const result = await work(connection);
        state.commits += 1;
        return result;
      } catch (error) {
        state.rollbacks += 1;
        throw error;
      } finally {
        state.inTransaction = false;
      }
    },
  };

  const labels = () => state.executed.map((call) => call.label);
  const writes = () => labels().filter((label) => label.startsWith('insert') || label === 'lock');
  return { db, state, labels, writes };
}

/** A fake terminal that answers each prompt in turn when the script starts reading. */
function createFakeTerminal(answers = [], { isTTY = true } = {}) {
  const input = new EventEmitter();
  const queue = [...answers];
  const rawModes = [];
  let output = '';
  Object.assign(input, {
    isTTY,
    setRawMode: isTTY ? (mode) => rawModes.push(mode) : undefined,
    setEncoding() {},
    pause() {},
    resume() {
      const answer = queue.shift();
      if (answer !== undefined) setImmediate(() => input.emit('data', `${answer}\r`));
    },
  });
  return {
    io: { input, output: { write: (text) => (output += text) } },
    output: () => output,
    rawModes,
    remaining: () => queue.length,
  };
}

const CONFIRMATION = `BOOTSTRAP ${APPROVED_TEST_DATABASE.lowAlias}`;
const run = (oracle, terminal, argv = [], appConfig = testConfig()) =>
  main({ argv, appConfig, db: oracle.db, io: terminal.io });

describe('bootstrap script guards', () => {
  it('accepts only --apply and never echoes other arguments', () => {
    assert.deepEqual(parseArgs([]), { apply: false });
    assert.deepEqual(parseArgs(['--apply']), { apply: true });
    assert.throws(
      () => parseArgs([`--password=${PASSWORD}`]),
      (error) => {
        assert.ok(error instanceof BootstrapRefused);
        assert.ok(!error.message.includes(PASSWORD));
        return true;
      },
    );
  });

  it('refuses any environment except development/test on the approved TEST alias', () => {
    for (const env of ['production', 'uat']) {
      assert.throws(() => assertEnvironment(testConfig({ env })), /not permitted/);
    }
    const otherAlias = testConfig({
      database: { pools: { LOW: { alias: 'zpadwprod_low' } } },
    });
    assert.throws(() => assertEnvironment(otherAlias), /ORACLE_LOW_ALIAS/);
    assert.doesNotThrow(() => assertEnvironment(testConfig()));
  });

  it('refuses production before touching the database', async () => {
    const oracle = createFakeOracle();
    const terminal = createFakeTerminal();

    assert.equal(await run(oracle, terminal, ['--apply'], testConfig({ env: 'production' })), 1);
    assert.deepEqual(oracle.labels(), []);
    assert.match(terminal.output(), /Refused: NODE_ENV=production/);
  });

  it('refuses a database whose service is not the approved TEST service', async () => {
    const oracle = createFakeOracle({ serviceName: 'abc_zpadwprod_low.adb.oraclecloud.com' });
    const terminal = createFakeTerminal();

    assert.equal(await run(oracle, terminal), 1);
    assert.deepEqual(oracle.labels(), ['identity']);
    assert.match(terminal.output(), /not the approved TEST service/);
  });

  it('is read-only by default: checks, prints the plan, writes nothing', async () => {
    const oracle = createFakeOracle();
    const terminal = createFakeTerminal();

    assert.equal(await run(oracle, terminal), 0);
    assert.deepEqual(oracle.writes(), []);
    assert.equal(oracle.state.transactions, 0);
    assert.match(terminal.output(), /Dry run \(read-only\)\. No changes were made/);
    assert.match(terminal.output(), /Permissions:\s+23/);
    assert.equal(terminal.rawModes.length, 0, 'no prompt in a dry run');
  });

  it('refuses --apply without an interactive terminal', async () => {
    const oracle = createFakeOracle();
    const terminal = createFakeTerminal([], { isTTY: false });

    assert.equal(await run(oracle, terminal, ['--apply']), 1);
    assert.equal(oracle.state.transactions, 0);
    assert.match(terminal.output(), /requires an interactive terminal/);
  });

  it('refuses when the typed confirmation does not match, before asking for a password', async () => {
    const oracle = createFakeOracle();
    const terminal = createFakeTerminal(['bootstrap', PASSWORD, PASSWORD]);

    assert.equal(await run(oracle, terminal, ['--apply']), 1);
    assert.equal(oracle.state.transactions, 0);
    assert.equal(terminal.remaining(), 2, 'password prompts were never shown');
  });

  it('refuses mismatched or non-compliant passwords without writing', async () => {
    for (const [first, second, message] of [
      [PASSWORD, `${PASSWORD}x`, /do not match/],
      ['short', 'short', /does not meet the policy/],
    ]) {
      const oracle = createFakeOracle();
      const terminal = createFakeTerminal([CONFIRMATION, first, second]);

      assert.equal(await run(oracle, terminal, ['--apply']), 1);
      assert.equal(oracle.state.transactions, 0);
      assert.match(terminal.output(), message);
      assert.ok(!terminal.output().includes(first));
    }
  });
});

describe('bootstrap preconditions and duplicate prevention', () => {
  const conflicts = [
    [
      'the security module exists',
      { existing: { module: 1 } },
      /Module SECURITY_ADMINISTRATION already exists/,
    ],
    [
      'an administrator role exists',
      { existing: { roles: 1 } },
      /administrator roles already exist/,
    ],
    [
      'Zaid already has an account',
      { existing: { user: 1 } },
      /account for employee 2172 already exists/,
    ],
    [
      'a bootstrap audit event exists',
      { existing: { audit: 1 } },
      /SECURITY_BOOTSTRAP audit event already exists/,
    ],
    [
      'a required constraint is missing',
      { missingConstraint: 'CK_ZRV_USERS_PWD' },
      /CK_ZRV_USERS_PWD is missing/,
    ],
    [
      'a required constraint is disabled',
      { disabledConstraint: 'UQ_ZRV_USERS_EMP' },
      /UQ_ZRV_USERS_EMP is not ENABLED/,
    ],
    ['Zaid is not current', { employeeRows: [['N', 'NONE', 'zaid.user', 1]] }, /not current/],
    ['Zaid is terminated', { employeeRows: [['Y', 'ENDED', 'zaid.user', 1]] }, /termination date/],
    [
      'Zaid has duplicate master rows',
      {
        employeeRows: [
          ['Y', 'NONE', 'a', 1],
          ['Y', 'NONE', 'b', 1],
        ],
      },
      /exactly one/,
    ],
    ['Zaid has no username', { employeeRows: [['Y', 'NONE', null, 0]] }, /no USER_NAME/],
    [
      'Zaid’s username is not unique',
      { employeeRows: [['Y', 'NONE', 'zaid.user', 2]] },
      /not unique/,
    ],
  ];

  for (const [label, scenario, message] of conflicts) {
    it(`aborts without writing when ${label}, even with --apply`, async () => {
      const oracle = createFakeOracle(scenario);
      const terminal = createFakeTerminal([CONFIRMATION, PASSWORD, PASSWORD]);

      assert.equal(await run(oracle, terminal, ['--apply']), 1);
      assert.deepEqual(oracle.writes(), []);
      assert.equal(oracle.state.transactions, 0);
      assert.match(terminal.output(), message);
      assert.equal(terminal.rawModes.length, 0, 'no prompt when preconditions fail');
    });
  }
});

describe('bootstrap apply', () => {
  async function applyWith(scenario) {
    const oracle = createFakeOracle(scenario);
    const terminal = createFakeTerminal([CONFIRMATION, PASSWORD, PASSWORD]);
    const exitCode = await run(oracle, terminal, ['--apply']);
    return { oracle, terminal, exitCode };
  }

  it('writes exactly the approved rows in one locked, re-checked, verified transaction', async () => {
    const { oracle, terminal, exitCode } = await applyWith();

    assert.equal(exitCode, 0);
    assert.equal(oracle.state.transactions, 1);
    assert.equal(oracle.state.commits, 1);

    const inTransaction = oracle.state.executed.filter((call) => call.inTransaction);
    const labels = inTransaction.map((call) => call.label);
    assert.equal(labels[0], 'lock', 'tables are locked first');
    assert.ok(
      labels.indexOf('existing-user') < labels.indexOf('insert-module'),
      're-checked under lock',
    );
    const countOf = (label) => labels.filter((item) => item === label).length;
    assert.deepEqual(
      {
        modules: countOf('insert-module'),
        resources: countOf('insert-resource'),
        permissions: countOf('insert-permission'),
        roles: countOf('insert-role'),
        rolePermissions: countOf('insert-role-permission'),
        users: countOf('insert-user'),
        userRoles: countOf('insert-user-role'),
        auditEvents: countOf('insert-audit'),
      },
      {
        modules: 1,
        resources: 8,
        permissions: 23,
        roles: 3,
        rolePermissions: 23,
        users: 1,
        userRoles: 1,
        auditEvents: 1,
      },
    );
    assert.ok(labels.indexOf('verify-counts') > labels.lastIndexOf('insert-audit'));
    assert.ok(labels.includes('login-lookup'), 'classification verified before commit');

    const roles = inTransaction
      .filter((call) => call.label === 'insert-role')
      .map((call) => call.binds.code);
    assert.deepEqual(roles, ['SUPER_ADMINISTRATOR', 'MAIN_ADMINISTRATOR', 'ADMINISTRATOR']);
    const idOf = (call) => call.result.outBinds.id[0];
    const superRoleId = idOf(inTransaction.find((call) => call.label === 'insert-role'));
    const grants = inTransaction.filter((call) => call.label === 'insert-role-permission');
    assert.ok(
      grants.every((call) => call.binds.roleId === superRoleId),
      'only SUPER_ADMINISTRATOR is granted',
    );
    const permissionIds = inTransaction
      .filter((call) => call.label === 'insert-permission')
      .map(idOf);
    assert.deepEqual(
      grants.map((call) => call.binds.permissionId),
      permissionIds,
      'all 23 granted once',
    );
    const userRole = inTransaction.find((call) => call.label === 'insert-user-role').binds;
    assert.equal(userRole.roleId, superRoleId);
    assert.equal(userRole.userId, idOf(inTransaction.find((call) => call.label === 'insert-user')));
    const actions = inTransaction
      .filter((call) => call.label === 'insert-permission')
      .map((call) => call.binds.actionCode);
    assert.ok(actions.includes('VIEW') && actions.includes('REVOKE_SESSIONS'));

    const user = inTransaction.find((call) => call.label === 'insert-user').binds;
    assert.equal(user.employeeNumber, '2172');
    assert.match(user.passwordHash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);

    const audit = inTransaction.find((call) => call.label === 'insert-audit').binds;
    assert.equal(audit.eventCode, 'SECURITY_BOOTSTRAP');
    assert.equal(audit.eventOutcome, 'SUCCESS');
    assert.equal(audit.actorType, 'SYSTEM');
    assert.equal(audit.createdBy, null);
    assert.equal(audit.targetType, 'USER');
    assert.ok(!audit.eventDetails.includes('argon2'));

    assert.match(terminal.output(), /Bootstrap committed/);
    assert.match(terminal.output(), /blocked until Phase 02 MFA/);
  });

  it('never echoes, prints or binds the password, and never prints the hash', async () => {
    const { oracle, terminal } = await applyWith();
    const output = terminal.output();

    assert.ok(!output.includes(PASSWORD), 'password not echoed or printed');
    assert.ok(!output.includes('$argon2id'), 'hash not printed');
    assert.ok(output.includes(CONFIRMATION), 'the visible confirmation is echoed');
    const binds = JSON.stringify(oracle.state.executed.map((call) => call.binds));
    assert.ok(!binds.includes(PASSWORD), 'plaintext never sent to Oracle');
    assert.deepEqual(terminal.rawModes, [true, false, true, false, true, false]);
  });

  it('creates the CREATED_BY-less rows only (approved bootstrap exception)', async () => {
    const { oracle } = await applyWith();
    for (const call of oracle.state.executed.filter((item) => item.label.startsWith('insert-'))) {
      if (call.label === 'insert-audit') continue;
      assert.ok(!('createdBy' in call.binds), `${call.label} binds no CREATED_BY`);
    }
  });

  const rollbacks = [
    ['an insert fails', { failOn: 'insert-user-role' }, /rolled back: ORA-00001/],
    [
      'a conflict appears under the lock',
      { conflictInTransaction: 'user' },
      /Preconditions changed/,
    ],
    [
      'post-write counts do not match',
      { verifyCounts: [1, 8, 22, 3, 23, 1, 1, 1] },
      /permissions is 22/,
    ],
    [
      'the account is not classified as privileged',
      { notPrivileged: true },
      /not classified as privileged/,
    ],
    ['the login lookup resolves another account', { lookupUserId: '999' }, /does not resolve/],
  ];
  for (const [label, scenario, message] of rollbacks) {
    it(`rolls back everything when ${label}`, async () => {
      const { oracle, terminal, exitCode } = await applyWith(scenario);

      assert.equal(exitCode, 1);
      assert.equal(oracle.state.commits, 0);
      assert.equal(oracle.state.rollbacks, 1);
      assert.match(terminal.output(), message);
      assert.ok(!terminal.output().includes('$argon2id'));
      assert.doesNotMatch(terminal.output(), /Bootstrap committed/);
    });
  }
});

describe('bootstrap prompt and source safety', () => {
  it('hidden prompts do not echo, support backspace and cancel on Ctrl-C', async () => {
    const terminal = createFakeTerminal();
    const typed = promptLine(terminal.io, 'Secret: ', { hidden: true });
    terminal.io.input.emit('data', 'abX\u007fc\r');
    assert.equal(await typed, 'abc');
    assert.equal(terminal.output(), 'Secret: \n');

    const cancelled = promptLine(terminal.io, 'Secret: ', { hidden: true });
    terminal.io.input.emit('data', 'ab\u0003');
    await assert.rejects(cancelled, /Cancelled/);
  });

  it('reads no secret from the environment, arguments or files', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'scripts', 'bootstrap-test-rbac.js'),
      'utf8',
    );

    assert.ok(!/process\.env/.test(source), 'no environment access');
    assert.ok(!/readFileSync|createReadStream/.test(source), 'no file input');
    assert.ok(!/console\./.test(source), 'all output goes through the injected writer');
    assert.match(source, /process\.argv\.slice\(2\)/);
  });
});
