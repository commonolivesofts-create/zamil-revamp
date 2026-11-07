/*
 * Workflow Manager M2-0 — security invariants and architecture boundaries: read-only dictionary
 * access, form-owned record access, source handler registry, M1 compatibility, and static checks
 * that the generic mapping engine writes nothing and names no business form.
 */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  createDictionaryService,
  DictionaryError,
} from '../src/modules/workflow-manager/mapping/dictionary.service.js';
import {
  authorizeRecordAccess,
  createRecordAccessRegistry,
  RecordAccessRegistryError,
} from '../src/modules/workflow-manager/mapping/recordAccess.js';
import {
  createSourceHandlerRegistry,
  SourceHandlerRegistryError,
} from '../src/modules/workflow-manager/mapping/sourceHandlers.js';
import { buildRecordKey } from '../src/modules/workflow-manager/mapping/recordKey.js';
import * as catalog from '../src/modules/workflow-manager/workflowManager.catalog.js';
import {
  recordAccessRegistry,
  sourceHandlerRegistry,
} from '../src/modules/workflow-manager/integrations/index.js';
import { registeredModules } from '../../client/src/config/registry/index.js';
import { headerColumns, OWNER } from './helpers/workflowMappingFixtures.js';

const MODULE_DIR = new URL('../src/modules/workflow-manager/', import.meta.url);
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function sources(subdir) {
  const dir = new URL(`${subdir}/`, MODULE_DIR);
  const names = (await readdir(dir)).filter((name) => name.endsWith('.js'));
  return Promise.all(
    names.map(async (name) => ({
      name: `${subdir}/${name}`,
      text: await readFile(new URL(name, dir), 'utf8'),
    })),
  );
}

// --- Dictionary service ------------------------------------------------------------------------

function fakeDictionary({
  objects = [{ objectType: 'TABLE', status: 'VALID' }],
  columns = headerColumns(),
  counts,
} = {}) {
  const calls = [];
  const connection = {
    callTimeout: 0,
    rolledBack: 0,
    async execute(sql) {
      calls.push(sql);
    },
    async rollback() {
      this.rolledBack += 1;
    },
  };
  const repository = {
    findObjects: async () => (calls.push('findObjects'), objects),
    listColumns: async () => (calls.push('listColumns'), columns),
    listKeyConstraints: async () => (calls.push('listKeyConstraints'), []),
    listUniqueIndexes: async () => (calls.push('listUniqueIndexes'), []),
    observeKeyUniqueness: async (_c, args) => {
      calls.push(`observe:${args.columns.join(',')}`);
      return counts ?? { rowCount: 5, nullKeyRows: 0, duplicateKeyGroups: 0 };
    },
  };
  const service = createDictionaryService({
    repository,
    withConnection: (_pool, work) => work(connection),
    allowedOwners: [OWNER],
    now: () => new Date('2026-11-07T10:00:00.000Z'),
    callTimeoutMs: 1234,
  });
  return { service, calls, connection };
}

const rejects = (promise, code) =>
  assert.rejects(promise, (error) => error instanceof DictionaryError && error.code === code, code);

describe('dictionary service (read-only)', () => {
  it('runs every call inside SET TRANSACTION READ ONLY with a timeout and always rolls back', async () => {
    const { service, calls, connection } = fakeDictionary();
    const snapshot = await service.snapshot({
      owner: OWNER,
      objectName: 'DEMO_REQUEST_H',
      objectType: 'TABLE',
    });
    assert.equal(calls[0], 'SET TRANSACTION READ ONLY');
    assert.equal(connection.rolledBack, 1);
    assert.equal(connection.callTimeout, 0, 'timeout restored');
    assert.equal(snapshot.columns.length, headerColumns().length);
    assert.match(snapshot.columnsSha256, /^[0-9a-f]{64}$/);
    assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.columns));

    const failing = fakeDictionary({ objects: [] });
    await rejects(
      failing.service.snapshot({ owner: OWNER, objectName: 'DEMO_REQUEST_H', objectType: 'TABLE' }),
      'OBJECT_NOT_FOUND',
    );
    assert.equal(failing.connection.rolledBack, 1, 'rolled back on failure too');
  });

  it('refuses unauthorized objects before touching the database', async () => {
    const { service, calls } = fakeDictionary();
    for (const [owner, objectName] of [
      ['OTHER_SCHEMA', 'DEMO_REQUEST_H'],
      [OWNER, 'XX_ZRV_USERS'],
      [OWNER, 'DEMO"; DROP TABLE X'],
      ['demo_app', 'DEMO_REQUEST_H'],
    ]) {
      await rejects(
        service.snapshot({ owner, objectName, objectType: 'TABLE' }),
        'OBJECT_NOT_ALLOWED',
      );
      await rejects(
        service.observeKeyUniqueness({
          owner,
          objectName,
          objectType: 'TABLE',
          columns: ['REQUEST_ID'],
        }),
        'OBJECT_NOT_ALLOWED',
      );
    }
    await rejects(
      service.snapshot({ owner: OWNER, objectName: 'DEMO_REQUEST_H', objectType: 'PACKAGE' }),
      'OBJECT_TYPE_MISMATCH',
    );
    assert.equal(calls.length, 0);
  });

  it('reports object type and validity problems', async () => {
    await rejects(
      fakeDictionary().service.snapshot({
        owner: OWNER,
        objectName: 'DEMO_REQUEST_H',
        objectType: 'VIEW',
      }),
      'OBJECT_TYPE_MISMATCH',
    );
    await rejects(
      fakeDictionary({ objects: [{ objectType: 'TABLE', status: 'INVALID' }] }).service.snapshot({
        owner: OWNER,
        objectName: 'DEMO_REQUEST_H',
        objectType: 'TABLE',
      }),
      'OBJECT_INVALID',
    );
  });

  it('observes uniqueness only for columns confirmed in the live dictionary', async () => {
    const { service, calls } = fakeDictionary();
    await rejects(
      service.observeKeyUniqueness({
        owner: OWNER,
        objectName: 'DEMO_REQUEST_H',
        objectType: 'TABLE',
        columns: ['NOPE'],
      }),
      'COLUMN_NOT_FOUND',
    );
    assert.ok(!calls.some((call) => call.startsWith('observe:')));
    await rejects(
      service.observeKeyUniqueness({
        owner: OWNER,
        objectName: 'DEMO_REQUEST_H',
        objectType: 'TABLE',
        columns: ['A B'],
      }),
      'KEY_COLUMNS_INVALID',
    );
    const observation = await service.observeKeyUniqueness({
      owner: OWNER,
      objectName: 'DEMO_REQUEST_H',
      objectType: 'TABLE',
      columns: ['REQUEST_ID'],
    });
    assert.deepEqual(observation, {
      rowCount: 5,
      nullKeyRows: 0,
      duplicateKeyGroups: 0,
      columns: ['REQUEST_ID'],
      observedAt: '2026-11-07T10:00:00.000Z',
    });
  });
});

// --- Record access ------------------------------------------------------------------------------

const KEY = buildRecordKey([{ name: 'REQUEST_ID', oracleType: 'NUMBER' }], { REQUEST_ID: '1' });
const ACTOR = { userId: '7', sessionId: '70' };
const answer = (extra = {}) => ({
  decision: 'ALLOW',
  basis: 'SAME_ORGANIZATION',
  crossOrganization: false,
  contractVersion: 1,
  ...extra,
});

function access({
  provider,
  holds = async () => true,
  requiredPermissions = ['WORKFLOW_MANAGER.FORM_MAPPING:RUN'],
  ...rest
} = {}) {
  const registry = createRecordAccessRegistry(
    provider ? [{ formCode: 'DEMO_REQUEST', contractVersion: 1, canView: provider }] : [],
  );
  return authorizeRecordAccess({
    registry,
    formCode: 'DEMO_REQUEST',
    actor: ACTOR,
    recordKey: KEY,
    purpose: 'MAPPING_PREVIEW',
    connection: {},
    requiredPermissions,
    holds,
    ...rest,
  });
}

describe('form-owned record access', () => {
  it('denies when no provider is registered — no fallback, whatever permissions are held', async () => {
    const result = await access({ holds: async () => true });
    assert.deepEqual(result, {
      decision: 'DENY',
      basis: 'NO_RECORD_ACCESS_PROVIDER',
      crossOrganization: false,
    });
    // The production composition registers no provider in M2-0.
    assert.equal(recordAccessRegistry.has('DEMO_REQUEST'), false);
  });

  it('allows only on a valid ALLOW from the provider after every permission is held', async () => {
    let received;
    const result = await access({ provider: async (ctx) => ((received = ctx), answer()) });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.basis, 'SAME_ORGANIZATION');
    assert.ok(
      Object.isFrozen(received) &&
        Object.isFrozen(received.actor) &&
        Object.isFrozen(received.recordKey),
    );
    assert.equal(received.recordKey.sha256, KEY.sha256);
    assert.equal(received.purpose, 'MAPPING_PREVIEW');
  });

  it('a Workflow Manager permission never substitutes for the provider decision', async () => {
    const denied = await access({
      provider: async () => answer({ decision: 'DENY', basis: 'OTHER_ORGANIZATION' }),
    });
    assert.deepEqual(denied, {
      decision: 'DENY',
      basis: 'OTHER_ORGANIZATION',
      crossOrganization: false,
    });
  });

  it('checks every required permission before asking the provider', async () => {
    let asked = false;
    const provider = async () => ((asked = true), answer());
    const missing = await access({
      provider,
      holds: async (_u, p) => p.actionCode !== 'VIEW',
      requiredPermissions: ['WORKFLOW_MANAGER.FORM_MAPPING:RUN', 'DEMO.REQUESTS:VIEW'],
    });
    assert.equal(missing.basis, 'PERMISSION_MISSING');
    assert.equal(asked, false);
    assert.equal(
      (
        await access({
          provider,
          holds: async () => {
            throw new Error('db');
          },
        })
      ).basis,
      'PERMISSION_CHECK_FAILED',
    );
    assert.equal(
      (await access({ provider, requiredPermissions: ['not a key'] })).basis,
      'PERMISSION_INVALID',
    );
    assert.equal((await access({ provider, holds: null })).basis, 'PERMISSION_CHECK_UNAVAILABLE');
    assert.equal(
      (await access({ provider, holds: async () => 'yes' })).basis,
      'PERMISSION_MISSING',
      'only true counts',
    );
  });

  it('treats provider errors, timeouts and malformed or mismatched answers as DENY', async () => {
    const cases = [
      [
        async () => {
          throw new Error('boom');
        },
        'PROVIDER_ERROR',
      ],
      [
        () => {
          throw new Error('sync');
        },
        'PROVIDER_ERROR',
      ],
      [() => new Promise(() => {}), 'PROVIDER_TIMEOUT'],
      [async () => null, 'PROVIDER_INVALID_RESPONSE'],
      [async () => 'ALLOW', 'PROVIDER_INVALID_RESPONSE'],
      [async () => answer({ decision: 'allow' }), 'PROVIDER_INVALID_RESPONSE'],
      [async () => answer({ contractVersion: 2 }), 'PROVIDER_INVALID_RESPONSE'],
      [async () => answer({ basis: 'x y' }), 'PROVIDER_INVALID_RESPONSE'],
      [async () => answer({ crossOrganization: 'no' }), 'PROVIDER_INVALID_RESPONSE'],
    ];
    for (const [provider, basis] of cases) {
      const result = await access({ provider, timeoutMs: 20 });
      assert.deepEqual(result, { decision: 'DENY', basis, crossOrganization: false }, basis);
    }
  });

  it('supports approved cross-organization access only when the provider grants it', async () => {
    const result = await access({
      provider: async () => answer({ basis: 'APPROVED_CROSS_ORG', crossOrganization: true }),
    });
    assert.equal(result.decision, 'ALLOW');
    assert.equal(result.crossOrganization, true);
    const denied = await access({
      provider: async () => answer({ decision: 'DENY', basis: 'X', crossOrganization: true }),
    });
    assert.equal(denied.crossOrganization, false, 'a DENY never reports cross-organization access');
  });

  it('refuses invalid requests and cannot be bypassed with a forged registry', async () => {
    const provider = async () => answer();
    assert.equal((await access({ provider, purpose: 'EXECUTION' })).basis, 'PURPOSE_NOT_ALLOWED');
    assert.equal((await access({ provider, actor: {} })).basis, 'ACTOR_REQUIRED');
    assert.equal(
      (await access({ provider, recordKey: { value: {} } })).basis,
      'RECORD_KEY_REQUIRED',
    );
    const forged = await authorizeRecordAccess({
      registry: { has: () => true },
      formCode: 'DEMO_REQUEST',
      actor: ACTOR,
      recordKey: KEY,
      purpose: 'MAPPING_PREVIEW',
      holds: async () => true,
    });
    assert.equal(forged.basis, 'NO_RECORD_ACCESS_PROVIDER');
  });

  it('validates the registry and exposes no provider', () => {
    const ok = { formCode: 'DEMO_REQUEST', contractVersion: 1, canView: async () => answer() };
    for (const bad of [
      [null],
      [{ ...ok, formCode: 'demo' }],
      [{ ...ok, contractVersion: 2 }],
      [{ ...ok, canView: 'x' }],
      [ok, ok],
    ]) {
      assert.throws(() => createRecordAccessRegistry(bad), RecordAccessRegistryError);
    }
    const registry = createRecordAccessRegistry([ok]);
    assert.deepEqual(Object.keys(registry), ['has']);
    assert.ok(Object.isFrozen(registry));
  });
});

// --- Source handlers and M1 compatibility -----------------------------------------------------------

describe('source handler registry and M1 compatibility', () => {
  const handler = {
    code: 'DEMO_HANDLER',
    name: 'Demo',
    contractVersion: 1,
    fields: [{ name: 'REC_ID', oracleType: 'NUMBER', nullable: false }],
  };

  it('validates handlers and fails at startup on invalid or duplicate entries', () => {
    for (const bad of [
      [{ ...handler, code: 'demo' }],
      [{ ...handler, name: '' }],
      [{ ...handler, contractVersion: 0 }],
      [{ ...handler, fields: [] }],
      [{ ...handler, fields: [{ name: 'X', oracleType: 'BLOB', nullable: true }] }],
      [{ ...handler, fields: [{ name: 'X', oracleType: 'NUMBER' }] }],
      [{ ...handler, fields: [handler.fields[0], handler.fields[0]] }],
      [handler, handler],
    ]) {
      assert.throws(
        () => createSourceHandlerRegistry(bad),
        SourceHandlerRegistryError,
        JSON.stringify(bad),
      );
    }
    const registry = createSourceHandlerRegistry([handler]);
    assert.deepEqual(registry.descriptors(), [
      { code: 'DEMO_HANDLER', name: 'Demo', description: null },
    ]);
    assert.equal(registry.contract('DEMO_HANDLER').fields[0].name, 'REC_ID');
    assert.equal(registry.contract('NOPE'), null);
  });

  it('keeps the M1 SOURCE_HANDLERS export: same name, shape, frozen and empty', () => {
    assert.ok(Array.isArray(catalog.SOURCE_HANDLERS));
    assert.ok(Object.isFrozen(catalog.SOURCE_HANDLERS));
    assert.deepEqual(catalog.SOURCE_HANDLERS, []);
    assert.equal(catalog.SOURCE_HANDLERS, sourceHandlerRegistry.descriptors());
    for (const name of [
      'WORKFLOW_MODULE_CODE',
      'PERMISSIONS',
      'SOURCE_KINDS',
      'ALLOWED_SOURCE_OWNERS',
      'PROTECTED_OBJECT_PREFIXES',
      'PROTECTED_MODULE_CODES',
      'isProtectedObjectName',
    ]) {
      assert.ok(name in catalog, `M1 export ${name} preserved`);
    }
  });
});

// --- Static architecture checks ------------------------------------------------------------------

describe('M2-0 architecture boundaries (static)', () => {
  it('mapping code imports only approved infrastructure and never a business module', async () => {
    const allowed = new Set([
      'joi',
      'oracledb',
      'node:crypto',
      '../../../database/oracle.js',
      '../../access-control/authorization.service.js',
      '../workflowManager.catalog.js',
    ]);
    for (const { name, text } of [
      ...(await sources('mapping')),
      ...(await sources('integrations')),
    ]) {
      for (const [, specifier] of text.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
        const local = specifier.startsWith('./') || specifier.startsWith('../mapping/');
        assert.ok(local || allowed.has(specifier), `${name} imports ${specifier}`);
        assert.doesNotMatch(specifier, /modules\/hr|client\//, name);
      }
    }
  });

  it('the generic engine names no business form, table, route or status', async () => {
    const forms = registeredModules.filter(
      (m) => !['COMMON', 'SECURITY_ADMINISTRATION', 'WORKFLOW_MANAGER'].includes(m.code),
    );
    const tokens = new Set();
    for (const module of forms) {
      tokens.add(module.code);
      for (const resource of module.resources ?? []) {
        tokens.add(resource.code);
        for (const entry of resource.navigation ?? [])
          if (entry.path) tokens.add(entry.path.split('/').filter(Boolean).slice(0, 3).join('/'));
      }
      for (const entry of module.navigation ?? [])
        if (entry.path) tokens.add(entry.path.split('/').filter(Boolean).slice(0, 3).join('/'));
    }
    tokens.delete('');
    assert.ok(tokens.size > 5, 'business form tokens were collected from the client registry');
    for (const { name, text } of [
      ...(await sources('mapping')),
      ...(await sources('integrations')),
    ]) {
      const code = stripComments(text);
      for (const token of tokens) {
        const pattern = new RegExp(`\\b${token.replace(/[/-]/g, '\\$&')}\\b`);
        assert.doesNotMatch(code, pattern, `${name} mentions ${token}`);
      }
      assert.doesNotMatch(text, /\bXXZP_[A-Z0-9_]+/, `${name} names a business table`);
      assert.doesNotMatch(text, /\bINPROCESS\b|\/hr\//, `${name} names a business status or route`);
    }
  });

  it('mapping SQL is read-only: no DML, DDL or grants', async () => {
    for (const { name, text } of await sources('mapping')) {
      const code = stripComments(text);
      assert.doesNotMatch(
        code,
        /\b(INSERT\s+INTO|UPDATE\s+[A-Za-z"]|DELETE\s+FROM|MERGE\s+INTO|CREATE\s+(TABLE|INDEX|VIEW|OR)|ALTER\s+|DROP\s+|TRUNCATE\s+|GRANT\s+|REVOKE\s+|EXECUTE\s+IMMEDIATE|DBMS_SQL)\b/,
        name,
      );
    }
    const repository = await readFile(
      new URL('mapping/dictionary.repository.js', MODULE_DIR),
      'utf8',
    );
    const statements = [...stripComments(repository).matchAll(/`\s*(SELECT|WITH)\b/g)].length;
    assert.ok(statements >= 5, 'dictionary repository statements are SELECTs');
  });

  it('the composition point registers nothing in M2-0', async () => {
    const [index] = await sources('integrations');
    assert.match(index.text, /createSourceHandlerRegistry\(\[\]\)/);
    assert.match(index.text, /createRecordAccessRegistry\(\[\]\)/);
    assert.deepEqual(sourceHandlerRegistry.descriptors(), []);
  });
});
