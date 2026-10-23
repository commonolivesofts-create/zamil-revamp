import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { EXIT, main } from '../scripts/rbac-register.js';
import {
  APPROVED_TARGETS,
  REQUIRED_CONSTRAINTS,
  RegistrationRefused,
  assertEnvironment,
  comparePlan,
  parseArgs,
  permissionDescription,
  planFingerprint,
  registryDefinitions,
} from '../scripts/lib/rbacRegistration.js';
import {
  SECURITY_MODULE,
  SECURITY_RESOURCES,
} from '../src/modules/access-control/securityCatalog.js';
import { registeredModules } from '../../client/src/config/registry/index.js';
import { defineModule } from '../../client/src/config/registry/defineModule.js';

// The registration CLI is exercised with a fake Oracle connection and a fake TTY. Nothing here
// touches a database. The fake keeps catalogue rows, enforces the unique keys and parent links,
// and restores its state on rollback like a real transaction.

const SERVICE = 'g1234_zpadwtest_low.adb.oraclecloud.com';
const TARGET = APPROVED_TARGETS.TEST;
const appConfig = { env: 'test', database: { pools: { LOW: { alias: TARGET.lowAlias } } } };

// Isolated fixture modules: never part of the active registry.
const fixtureModule = defineModule({
  code: 'TEST_FIXTURE_SALES',
  name: 'Fixture Sales',
  description: 'Registration test fixture.',
  displayOrder: 50,
  resources: [
    { code: 'FIXTURE_ORDERS', name: 'Fixture Orders', actions: ['VIEW', 'CREATE', 'APPROVE'] },
    {
      code: 'FIXTURE_REPORTS',
      name: 'Fixture Reports',
      description: 'Fixture reports.',
      actions: ['VIEW', 'EXPORT'],
    },
  ],
});
const withFixture = [...registeredModules, fixtureModule];
const FIXTURE_RECORDS = 1 + 2 + 5;

function seedSecurityCatalog() {
  const state = { modules: [], resources: [], permissions: [], nextId: 1000 };
  state.modules.push({
    id: '1',
    code: SECURITY_MODULE.code,
    name: SECURITY_MODULE.name,
    description: SECURITY_MODULE.description,
    displayOrder: 0,
    isActive: 1,
  });
  let resourceId = 10;
  let permissionId = 100;
  for (const resource of SECURITY_RESOURCES) {
    const id = String(resourceId++);
    state.resources.push({
      id,
      moduleId: '1',
      code: resource.code,
      name: resource.name,
      description: `${resource.name} administration`,
      isActive: 1,
    });
    for (const actionCode of resource.actions) {
      state.permissions.push({
        id: String(permissionId++),
        resourceId: id,
        actionCode,
        isActive: 1,
      });
    }
  }
  return state;
}

const oraError = (code, message = code) =>
  Object.assign(new Error(`${code}: ${message}`), { code });

function createFakeOracle(scenario = {}) {
  let data = scenario.data ?? seedSecurityCatalog();
  const log = { executed: [], audit: [], transactions: 0, commits: 0, rollbacks: 0 };

  const respond = (label, binds) => {
    switch (label) {
      case 'identity':
        return { rows: [[scenario.serviceName ?? SERVICE, 'ZPADWTEST']] };
      case 'constraints':
        return {
          rows: REQUIRED_CONSTRAINTS.filter(
            (name) => !(scenario.missingConstraints ?? []).includes(name),
          ).map((name) => [name, 'ENABLED', 'VALIDATED']),
        };
      case 'audit-event-check':
        return {
          rows: [
            ["EVENT_CODE = TRIM(EVENT_CODE) AND REGEXP_LIKE(EVENT_CODE, '^[A-Z][A-Z0-9_]*$', 'c')"],
          ],
        };
      case 'audit-event-eval':
        return { rows: [[scenario.rejectEvent ? 0 : 1]] };
      case 'modules':
        return {
          rows: data.modules.map((m) => [
            m.id,
            m.code,
            m.name,
            m.description,
            m.displayOrder,
            m.isActive,
          ]),
        };
      case 'resources':
        return {
          rows: data.resources.map((r) => [
            r.id,
            r.moduleId,
            r.code,
            r.name,
            r.description,
            r.isActive,
          ]),
        };
      case 'permissions':
        return {
          rows: data.permissions.map((p) => [p.id, p.resourceId, p.actionCode, p.isActive]),
        };
      case 'lock':
        scenario.onLock?.(data);
        if (scenario.lockBusy)
          throw oraError('ORA-00054', 'resource busy and acquire with NOWAIT specified');
        return {};
      case 'insert-module': {
        if (data.modules.some((m) => m.code === binds.code)) throw oraError('ORA-00001');
        const id = String(data.nextId++);
        data.modules.push({
          id,
          code: binds.code,
          name: binds.name,
          description: binds.description,
          displayOrder: binds.displayOrder,
          isActive: 1,
        });
        return { outBinds: { id: [id] } };
      }
      case 'insert-resource': {
        assert.ok(
          data.modules.some((m) => m.id === binds.moduleId),
          'resource parent exists',
        );
        if (data.resources.some((r) => r.moduleId === binds.moduleId && r.code === binds.code))
          throw oraError('ORA-00001');
        const id = String(data.nextId++);
        data.resources.push({
          id,
          moduleId: binds.moduleId,
          code: binds.code,
          name: binds.name,
          description: binds.description,
          isActive: 1,
        });
        return { outBinds: { id: [id] } };
      }
      case 'insert-permission': {
        assert.ok(
          data.resources.some((r) => r.id === binds.resourceId),
          'permission parent exists',
        );
        if (
          data.permissions.some(
            (p) => p.resourceId === binds.resourceId && p.actionCode === binds.actionCode,
          )
        )
          throw oraError('ORA-00001');
        const id = String(data.nextId++);
        data.permissions.push({
          id,
          resourceId: binds.resourceId,
          actionCode: binds.actionCode,
          description: binds.description,
          isActive: 1,
        });
        return { outBinds: { id: [id] } };
      }
      case 'insert-audit':
        log.audit.push(binds);
        return {};
      case 'audit-count':
        return {
          rows: [
            [
              log.audit.filter((a) => a.correlationId === binds.correlationId).length +
                (scenario.auditSkew ?? 0),
            ],
          ],
        };
      default:
        throw new Error(`Unexpected statement: ${label}`);
    }
  };

  const connection = {
    callTimeout: 0,
    async execute(sql, binds = {}) {
      const label =
        /zr-rbac-register:([a-z-]+)/.exec(sql)?.[1] ??
        (sql.includes('INSERT INTO xx_zrv_rbac_audit_logs') ? 'insert-audit' : 'unknown');
      log.executed.push({ label, sql });
      if (scenario.failOn === label) throw oraError(scenario.failCode ?? 'ORA-00001');
      return respond(label, binds);
    },
  };

  const db = {
    async withConnection(pool, work) {
      assert.equal(pool, 'LOW');
      if (scenario.connectionFails) {
        throw Object.assign(new Error('The service is temporarily unavailable'), {
          code: 'SERVICE_UNAVAILABLE',
          cause: oraError('ORA-12170', 'TNS:Connect timeout occurred'),
        });
      }
      return work(connection);
    },
    async withTransaction(pool, work) {
      assert.equal(pool, 'LOW');
      log.transactions += 1;
      const snapshot = structuredClone({ data, audit: log.audit });
      try {
        const result = await work(connection);
        if (scenario.commitFails)
          throw oraError('DPY-4011', 'the database or network closed the connection');
        log.commits += 1;
        return result;
      } catch (error) {
        data = snapshot.data;
        log.audit = snapshot.audit;
        log.rollbacks += 1;
        throw error;
      }
    },
  };
  return { db, log, data: () => data };
}

function fakeIo({ typed = null, tty = true } = {}) {
  const output = [];
  let listener = null;
  const input = {
    isTTY: tty,
    setRawMode: tty ? () => {} : undefined,
    setEncoding() {},
    on(_event, fn) {
      listener = fn;
    },
    removeListener() {
      listener = null;
    },
    pause() {},
    resume() {
      setImmediate(() => listener?.(`${typed ?? ''}\r`));
    },
  };
  return {
    io: { input, output: { write: (text) => output.push(text) } },
    text: () => output.join(''),
  };
}

async function run(argv, { scenario = {}, modules = withFixture, io = fakeIo() } = {}) {
  const fake = createFakeOracle(scenario);
  const code = await main({
    argv,
    appConfig,
    db: fake.db,
    io: io.io,
    registeredModules: modules,
    newCorrelationId: () => 'rbac-register-test-correlation',
  });
  return { code, fake, out: io.text() };
}

const fingerprintOf = (out) => /Plan fingerprint \(SHA-256\): ([0-9a-f]{64})/.exec(out)?.[1];
const writes = (log) => log.executed.filter((e) => /^insert|^lock$/.test(e.label));

describe('RBAC catalogue registration CLI', () => {
  describe('arguments, environment and definitions', () => {
    it('requires an approved target, refuses unknown or repeated arguments and pairs --apply with a fingerprint', () => {
      assert.deepEqual(parseArgs(['--target=TEST']), {
        target: 'TEST',
        apply: false,
        fingerprint: null,
      });
      const fp = 'a'.repeat(64);
      assert.deepEqual(parseArgs(['--target=TEST', '--apply', `--fingerprint=${fp}`]), {
        target: 'TEST',
        apply: true,
        fingerprint: fp,
      });
      for (const argv of [
        [],
        ['--target=UAT'],
        ['--target=PRODUCTION'],
        ['--target=test'],
        ['--target=TEST', '--force'],
        ['--target=TEST', '--target=TEST'],
        ['--target=TEST', '--apply'],
        ['--target=TEST', `--fingerprint=${fp}`],
        ['--target=TEST', '--apply', '--fingerprint=abc'],
        ['TEST'],
      ])
        assert.throws(() => parseArgs(argv), RegistrationRefused, argv.join(' '));
      assert.deepEqual(Object.keys(APPROVED_TARGETS), ['TEST'], 'only TEST is approved');
    });

    it('refuses an unapproved environment or LOW alias before connecting', async () => {
      assert.throws(
        () => assertEnvironment({ ...appConfig, env: 'production' }, TARGET),
        /NODE_ENV=production/,
      );
      assert.throws(
        () =>
          assertEnvironment(
            { env: 'test', database: { pools: { LOW: { alias: 'zpadwprod_low' } } } },
            TARGET,
          ),
        /ORACLE_LOW_ALIAS/,
      );
      const fake = createFakeOracle();
      const io = fakeIo();
      const code = await main({
        argv: ['--target=TEST'],
        appConfig: { ...appConfig, env: 'production' },
        db: fake.db,
        io: io.io,
        registeredModules: withFixture,
      });
      assert.equal(code, EXIT.REFUSED);
      assert.equal(fake.log.executed.length, 0);
    });

    it('uses only the RBAC modules of the active registry: COMMON skipped, never the example', () => {
      assert.deepEqual(
        registryDefinitions(registeredModules).map((m) => m.code),
        ['SECURITY_ADMINISTRATION'],
      );
      for (const file of ['scripts/rbac-register.js', 'scripts/lib/rbacRegistration.js']) {
        const source = readFileSync(join(import.meta.dirname, '..', file), 'utf8');
        assert.doesNotMatch(source, /module-registry\.example/, file);
      }
      const entry = readFileSync(
        join(import.meta.dirname, '..', 'scripts/rbac-register.js'),
        'utf8',
      );
      assert.match(
        entry,
        /import\('\.\.\/\.\.\/client\/src\/config\/registry\/index\.js'\)/,
        'the active registry',
      );
    });

    it('refuses a registry whose Security Administration differs from the backend catalogue', () => {
      const changed = defineModule({
        code: 'SECURITY_ADMINISTRATION',
        name: 'Security Administration',
        description: SECURITY_MODULE.description,
        displayOrder: 0,
        resources: SECURITY_RESOURCES.map(({ code, name, actions }) => ({
          code,
          name,
          actions: code === 'ROLES' ? [...actions, 'DELETE'] : [...actions],
        })),
      });
      assert.throws(
        () => registryDefinitions([changed]),
        /differs from the backend security catalogue/,
      );
      assert.throws(
        () => registryDefinitions([fixtureModule]),
        /differs from the backend security catalogue/,
        'missing entirely',
      );
      assert.throws(
        () => registryDefinitions([...registeredModules, fixtureModule, fixtureModule]),
        /Duplicate module code/,
      );
    });

    it('generates readable default descriptions for new permissions', () => {
      assert.equal(permissionDescription('VIEW', 'Sales Budget'), 'View sales budget');
      assert.equal(permissionDescription('APPROVE', 'Sales Budget'), 'Approve sales budget');
      assert.equal(
        permissionDescription('REVOKE_SESSIONS', 'User Accounts'),
        'Revoke sessions user accounts',
      );
    });
  });

  describe('preview (read-only)', () => {
    it('reports no changes for the current catalogue: Security Administration 1 + 8 + 23 MATCH', async () => {
      const { code, fake, out } = await run(['--target=TEST'], { modules: registeredModules });
      assert.equal(code, EXIT.OK);
      assert.match(out, /Counts: MATCH 32, MISSING 0, CONFLICT 0, UNREGISTERED 0/);
      assert.match(out, /No changes needed/);
      assert.match(out, /service g1234_zpadwtest_low/);
      assert.equal(writes(fake.log).length, 0);
      assert.equal(fake.log.transactions, 0);
    });

    it('lists missing module, resources and permissions with a deterministic fingerprint and writes nothing', async () => {
      const first = await run(['--target=TEST']);
      assert.equal(first.code, EXIT.OK);
      assert.match(first.out, new RegExp(`MISSING ${FIXTURE_RECORDS}, CONFLICT 0`));
      for (const key of [
        'MODULE TEST_FIXTURE_SALES',
        'RESOURCE TEST_FIXTURE_SALES.FIXTURE_ORDERS',
        'PERMISSION TEST_FIXTURE_SALES.FIXTURE_REPORTS:EXPORT',
      ]) {
        assert.match(first.out, new RegExp(`\\[MISSING\\] ${key.replace('.', '\\.')}`));
      }
      assert.match(first.out, /--apply --fingerprint=[0-9a-f]{64}/);
      assert.equal(writes(first.fake.log).length, 0);
      assert.equal(first.fake.log.transactions, 0);
      const second = await run(['--target=TEST']);
      assert.equal(fingerprintOf(second.out), fingerprintOf(first.out));
      // Independent of catalogue row order.
      const reversed = seedSecurityCatalog();
      reversed.permissions.reverse();
      reversed.resources.reverse();
      assert.equal(
        fingerprintOf((await run(['--target=TEST'], { scenario: { data: reversed } })).out),
        fingerprintOf(first.out),
      );
    });

    it('plans only the missing part of a partially registered module', () => {
      const data = seedSecurityCatalog();
      data.modules.push({
        id: '500',
        code: 'TEST_FIXTURE_SALES',
        name: 'Fixture Sales',
        description: 'Registration test fixture.',
        displayOrder: 50,
        isActive: 1,
      });
      data.resources.push({
        id: '501',
        moduleId: '500',
        code: 'FIXTURE_ORDERS',
        name: 'Fixture Orders',
        description: null,
        isActive: 1,
      });
      data.permissions.push({ id: '502', resourceId: '501', actionCode: 'VIEW', isActive: 1 });
      const plan = comparePlan(registryDefinitions(withFixture), {
        modules: data.modules,
        resources: data.resources,
        permissions: data.permissions.map((p) => ({ ...p, isActive: p.isActive === 1 })),
      });
      assert.deepEqual(
        plan.inserts.map((i) => i.kind + ':' + (i.actionCode ?? i.code)),
        [
          'PERMISSION:CREATE',
          'PERMISSION:APPROVE',
          'RESOURCE:FIXTURE_REPORTS',
          'PERMISSION:VIEW',
          'PERMISSION:EXPORT',
        ],
      );
      assert.equal(plan.counts.MISSING, 5);
      assert.equal(plan.items.find((i) => i.key === 'TEST_FIXTURE_SALES').status, 'MATCH');
    });

    it('treats inactive and different records as conflicts and refuses to apply', async () => {
      const variants = {
        'inactive module': (d) =>
          d.modules.push({
            id: '500',
            code: 'TEST_FIXTURE_SALES',
            name: 'Fixture Sales',
            description: 'Registration test fixture.',
            displayOrder: 50,
            isActive: 0,
          }),
        'name mismatch': (d) =>
          d.modules.push({
            id: '500',
            code: 'TEST_FIXTURE_SALES',
            name: 'Sales',
            description: 'Registration test fixture.',
            displayOrder: 50,
            isActive: 1,
          }),
        'display order': (d) =>
          d.modules.push({
            id: '500',
            code: 'TEST_FIXTURE_SALES',
            name: 'Fixture Sales',
            description: 'Registration test fixture.',
            displayOrder: 7,
            isActive: 1,
          }),
        'resource description': (d) => {
          d.modules.push({
            id: '500',
            code: 'TEST_FIXTURE_SALES',
            name: 'Fixture Sales',
            description: 'Registration test fixture.',
            displayOrder: 50,
            isActive: 1,
          });
          d.resources.push({
            id: '501',
            moduleId: '500',
            code: 'FIXTURE_REPORTS',
            name: 'Fixture Reports',
            description: 'Other',
            isActive: 1,
          });
        },
        'inactive permission': (d) => {
          d.modules.push({
            id: '500',
            code: 'TEST_FIXTURE_SALES',
            name: 'Fixture Sales',
            description: 'Registration test fixture.',
            displayOrder: 50,
            isActive: 1,
          });
          d.resources.push({
            id: '501',
            moduleId: '500',
            code: 'FIXTURE_ORDERS',
            name: 'Fixture Orders',
            description: null,
            isActive: 1,
          });
          d.permissions.push({ id: '502', resourceId: '501', actionCode: 'APPROVE', isActive: 0 });
        },
      };
      for (const [name, mutate] of Object.entries(variants)) {
        const data = seedSecurityCatalog();
        mutate(data);
        const preview = await run(['--target=TEST'], { scenario: { data } });
        assert.equal(preview.code, EXIT.NOT_READY, name);
        assert.match(preview.out, /\[CONFLICT\]/, name);
        assert.match(preview.out, /Nothing was written/, name);
        const fp = fingerprintOf(preview.out);
        const data2 = seedSecurityCatalog();
        mutate(data2);
        const apply = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
          scenario: { data: data2 },
          io: fakeIo({ typed: 'anything' }),
        });
        assert.equal(apply.code, EXIT.NOT_READY, name);
        assert.equal(apply.fake.log.transactions, 0, name);
        assert.equal(writes(apply.fake.log).length, 0, name);
      }
    });

    it('verifies the protected Security Administration catalogue and never creates or changes it', async () => {
      const mutations = {
        'missing permission': (d) => {
          d.permissions = d.permissions.filter(
            (p) => !(p.resourceId === '10' && p.actionCode === 'DISABLE'),
          );
        },
        'missing resource': (d) => {
          d.resources = d.resources.filter((r) => r.code !== 'SECURITY_AUDIT');
        },
        'renamed resource': (d) => {
          d.resources[1].name = 'Role List';
        },
        'inactive permission': (d) => {
          d.permissions[0].isActive = 0;
        },
        'module description': (d) => {
          d.modules[0].description = 'Changed';
        },
      };
      for (const [name, mutate] of Object.entries(mutations)) {
        const data = seedSecurityCatalog();
        mutate(data);
        const { code, fake, out } = await run(['--target=TEST'], {
          scenario: { data },
          modules: registeredModules,
        });
        assert.equal(code, EXIT.NOT_READY, name);
        assert.match(
          out,
          /\[CONFLICT\] (MODULE|RESOURCE|PERMISSION) SECURITY_ADMINISTRATION/,
          name,
        );
        assert.doesNotMatch(out, /\[MISSING\]/, `${name}: never planned for insertion`);
        assert.equal(writes(fake.log).length, 0, name);
      }
    });

    it('reports catalogue rows absent from the registry as UNREGISTERED without touching them', async () => {
      const data = seedSecurityCatalog();
      data.modules.push({
        id: '700',
        code: 'MANUAL_MODULE',
        name: 'Manual',
        description: null,
        displayOrder: 3,
        isActive: 1,
      });
      data.resources.push({
        id: '701',
        moduleId: '700',
        code: 'MANUAL_THINGS',
        name: 'Things',
        description: null,
        isActive: 1,
      });
      data.resources.push({
        id: '702',
        moduleId: '1',
        code: 'EXTRA_SECURITY',
        name: 'Extra',
        description: null,
        isActive: 0,
      });
      data.permissions.push({ id: '703', resourceId: '10', actionCode: 'EXPORT', isActive: 1 });
      const before = structuredClone(data);
      const { code, fake, out } = await run(['--target=TEST'], {
        scenario: { data },
        modules: registeredModules,
      });
      assert.equal(code, EXIT.OK);
      assert.match(out, /UNREGISTERED 3/);
      assert.match(
        out,
        /\[UNREGISTERED\] MODULE MANUAL_MODULE — 1 resource\(s\), 0 permission\(s\); active/,
      );
      assert.match(
        out,
        /\[UNREGISTERED\] RESOURCE SECURITY_ADMINISTRATION\.EXTRA_SECURITY — inactive/,
      );
      assert.match(
        out,
        /\[UNREGISTERED\] PERMISSION SECURITY_ADMINISTRATION\.USER_ACCOUNTS:EXPORT/,
      );
      assert.deepEqual(fake.data(), before);
    });

    it('refuses a wrong database identity, missing constraints, a rejected audit event and connection failures', async () => {
      const identity = await run(['--target=TEST'], {
        scenario: { serviceName: 'g1234_zpadwprod_low.adb.oraclecloud.com' },
      });
      assert.equal(identity.code, EXIT.REFUSED);
      assert.match(identity.out, /not the approved TEST service/);
      assert.deepEqual(
        identity.fake.log.executed.map((e) => e.label),
        ['identity'],
      );

      const constraint = await run(['--target=TEST'], {
        scenario: { missingConstraints: ['UQ_ZRV_PERM_RES_ACT'] },
      });
      assert.equal(constraint.code, EXIT.NOT_READY);
      assert.match(constraint.out, /Required constraint UQ_ZRV_PERM_RES_ACT is missing/);

      const event = await run(['--target=TEST'], { scenario: { rejectEvent: true } });
      assert.equal(event.code, EXIT.NOT_READY);
      assert.match(event.out, /does not accept RBAC_CATALOG_CHANGED/);

      const down = await run(['--target=TEST'], { scenario: { connectionFails: true } });
      assert.equal(down.code, EXIT.REFUSED);
      assert.match(down.out, /Registration failed \(ORA-12170\)\. Nothing was written\./);
    });
  });

  describe('apply', () => {
    async function reviewedFingerprint(scenario = {}) {
      return fingerprintOf((await run(['--target=TEST'], { scenario })).out);
    }
    const phraseFor = (fp, count = FIXTURE_RECORDS) => `REGISTER TEST ${count} ${fp.slice(0, 12)}`;

    it('inserts only missing records in module → resource → permission order with SYSTEM audit rows', async () => {
      const fp = await reviewedFingerprint();
      const { code, fake, out } = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(code, EXIT.OK, out);
      assert.match(out, new RegExp(`Committed ${FIXTURE_RECORDS} record\\(s\\)`));
      assert.match(out, /Correlation ID: rbac-register-test-correlation/);
      assert.match(out, /No permission was granted/);
      assert.equal(fake.log.commits, 1);

      const labels = fake.log.executed
        .filter((e) => e.label.startsWith('insert-') && e.label !== 'insert-audit')
        .map((e) => e.label);
      assert.deepEqual(labels, [
        'insert-module',
        'insert-resource',
        'insert-resource',
        'insert-permission',
        'insert-permission',
        'insert-permission',
        'insert-permission',
        'insert-permission',
      ]);
      // The only writes: the lock, catalogue inserts and audit rows. No UPDATE/DELETE/MERGE or role/user/override SQL.
      for (const { label, sql } of fake.log.executed) {
        assert.ok(
          [
            'identity',
            'constraints',
            'audit-event-check',
            'audit-event-eval',
            'modules',
            'resources',
            'permissions',
            'lock',
            'insert-module',
            'insert-resource',
            'insert-permission',
            'insert-audit',
            'audit-count',
          ].includes(label),
          label,
        );
        assert.doesNotMatch(
          sql,
          /\b(UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|GRANT)\b|xx_zrv_(role|user)/i,
          label,
        );
      }
      const lockIndex = fake.log.executed.findIndex((e) => e.label === 'lock');
      assert.ok(
        fake.log.executed.slice(lockIndex).some((e) => e.label === 'identity'),
        'identity re-verified under the lock',
      );

      assert.equal(fake.log.audit.length, FIXTURE_RECORDS);
      for (const event of fake.log.audit) {
        assert.equal(event.eventCode, 'RBAC_CATALOG_CHANGED');
        assert.equal(event.actorType, 'SYSTEM');
        assert.equal(event.createdBy, null);
        assert.equal(event.subjectUserId, null);
        assert.equal(event.correlationId, 'rbac-register-test-correlation');
        assert.equal(event.userAgent, 'zr-rbac-register');
        assert.ok(
          ['MODULE_CREATED', 'RESOURCE_CREATED', 'PERMISSION_CREATED'].includes(event.reasonCode),
        );
        const details = JSON.parse(event.eventDetails);
        assert.equal(details.source, 'REGISTRY_SYNC');
        assert.equal(details.planFingerprint, fp);
      }
      const created = fake.data();
      assert.ok(
        created.permissions.some(
          (p) => p.actionCode === 'APPROVE' && p.description === 'Approve fixture orders',
        ),
      );
      assert.equal(created.modules.find((m) => m.code === 'TEST_FIXTURE_SALES').displayOrder, 50);

      // Re-running against the result is a no-op (idempotent).
      const again = await run(['--target=TEST'], { scenario: { data: created } });
      assert.equal(again.code, EXIT.OK);
      assert.match(again.out, /MISSING 0, CONFLICT 0/);
      assert.match(again.out, /No changes needed/);
    });

    it('refuses without a TTY, with a wrong confirmation or a fingerprint that is not the current plan', async () => {
      const fp = await reviewedFingerprint();
      const noTty = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        io: fakeIo({ tty: false }),
      });
      assert.match(noTty.out, /requires an interactive terminal/);
      const wrong = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        io: fakeIo({ typed: 'REGISTER TEST' }),
      });
      assert.match(wrong.out, /Confirmation did not match/);
      const stale = await run(['--target=TEST', '--apply', `--fingerprint=${'0'.repeat(64)}`], {
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.match(stale.out, /differs from the reviewed fingerprint/);
      for (const result of [noTty, wrong, stale]) {
        assert.equal(result.code, EXIT.REFUSED);
        assert.equal(result.fake.log.transactions, 0);
        assert.equal(writes(result.fake.log).length, 0);
      }
    });

    it('rolls back when the catalogue changes between the preview and the lock', async () => {
      const fp = await reviewedFingerprint();
      const onLock = (data) =>
        data.modules.push({
          id: '900',
          code: 'TEST_FIXTURE_SALES',
          name: 'Fixture Sales',
          description: 'Registration test fixture.',
          displayOrder: 50,
          isActive: 1,
        });
      const { code, fake, out } = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        scenario: { onLock },
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(code, EXIT.REFUSED);
      assert.match(
        out,
        /no longer matches the reviewed fingerprint\. The transaction was rolled back/,
      );
      assert.equal(fake.log.rollbacks, 1);
      assert.equal(fake.log.executed.filter((e) => e.label.startsWith('insert-')).length, 0);
    });

    it('fails fast when another session holds the catalogue lock (concurrent registration)', async () => {
      const fp = await reviewedFingerprint();
      const { code, fake, out } = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        scenario: { lockBusy: true },
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(code, EXIT.REFUSED);
      assert.match(
        out,
        /locked by another session \(ORA-00054\)\. The transaction was rolled back; nothing was committed\./,
      );
      assert.equal(fake.log.commits, 0);
      assert.equal(fake.data().modules.length, 1);
    });

    it('rolls back everything on a unique-key violation or failed verification', async () => {
      const fp = await reviewedFingerprint();
      const unique = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        scenario: { failOn: 'insert-permission' },
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(unique.code, EXIT.REFUSED);
      assert.match(
        unique.out,
        /created concurrently \(ORA-00001\)\. The transaction was rolled back/,
      );
      assert.deepEqual(
        unique.fake.data(),
        seedSecurityCatalog(),
        'module and resource inserts were rolled back',
      );
      assert.equal(unique.fake.log.audit.length, 0);

      const verify = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        scenario: { auditSkew: 1 },
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(verify.code, EXIT.REFUSED);
      assert.match(verify.out, /Verification failed: expected 8 audit event\(s\), found 9/);
      assert.deepEqual(verify.fake.data(), seedSecurityCatalog());
    });

    it('reports an unknown outcome when the commit fails, and never retries', async () => {
      const fp = await reviewedFingerprint();
      const { code, fake, out } = await run(['--target=TEST', '--apply', `--fingerprint=${fp}`], {
        scenario: { commitFails: true },
        io: fakeIo({ typed: phraseFor(fp) }),
      });
      assert.equal(code, EXIT.UNKNOWN_OUTCOME);
      assert.match(out, /UNKNOWN OUTCOME \(DPY-4011\)/);
      assert.match(out, /Do NOT re-run --apply/);
      assert.equal(fake.log.transactions, 1, 'no retry');
    });

    it('never applies for the active registry alone (Security Administration is verify-only)', async () => {
      const preview = await run(['--target=TEST'], { modules: registeredModules });
      const apply = await run(
        ['--target=TEST', '--apply', `--fingerprint=${fingerprintOf(preview.out)}`],
        { modules: registeredModules, io: fakeIo({ typed: 'x' }) },
      );
      assert.equal(apply.code, EXIT.OK);
      assert.match(apply.out, /No changes needed/);
      assert.equal(apply.fake.log.transactions, 0);
    });
  });

  it('fingerprints depend on the target identity and the exact inserts', () => {
    const inserts = [{ kind: 'MODULE', code: 'A', name: 'A', description: null, displayOrder: 1 }];
    const base = planFingerprint({ target: 'TEST', serviceName: SERVICE }, inserts);
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.notEqual(planFingerprint({ target: 'TEST', serviceName: 'other' }, inserts), base);
    assert.notEqual(
      planFingerprint({ target: 'TEST', serviceName: SERVICE }, [
        { ...inserts[0], displayOrder: 2 },
      ]),
      base,
    );
    assert.equal(
      planFingerprint({ target: 'TEST', serviceName: SERVICE }, [
        { displayOrder: 1, description: null, name: 'A', code: 'A', kind: 'MODULE' },
      ]),
      base,
    );
  });
});
