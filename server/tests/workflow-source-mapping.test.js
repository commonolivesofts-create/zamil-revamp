/*
 * Workflow Manager M2-A API tests — source version mapping — through the real Express app,
 * authentication, CSRF, RBAC guards (including the DATA_SOURCE_REGISTRY:VIEW prerequisite), Joi
 * validation, the M2-0 contract and the real dictionary service over a seeded in-memory
 * dictionary. Repositories are in-memory doubles (helpers/sourceMappingFakes.js): the Oracle SQL is
 * checked statically below and is not executed here. All object, form and source names are
 * fictional.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { canonicalize, sha256Hex } from '../src/modules/workflow-manager/mapping/canonicalJson.js';
import { createSourceMappingService } from '../src/modules/workflow-manager/sourceMapping.service.js';
import { loadOpenApiSpec } from '../src/routes/docs.routes.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { createFakeDictionary } from './helpers/sourceMappingFakes.js';
import { installWorkflowManager } from './helpers/workflowManagerFakes.js';

const BASE = '/api/v1/workflow-manager';
const OBJECT = 'XXZP_DEMO_REQUEST_T';

const REGISTRY_DICTIONARY = [
  { ownerName: 'XXZP', objectName: OBJECT, objectType: 'TABLE', status: 'VALID' },
  { ownerName: 'XXZP', objectName: 'XXZP_DEMO_OTHER_T', objectType: 'TABLE', status: 'VALID' },
];

const SOURCE = {
  sourceCode: 'DEMO_REQUEST_HEADER',
  sourceName: 'Demo request header',
  sourceKind: 'TABLE',
  ownerName: 'XXZP',
  objectName: OBJECT,
};

const ATTESTED = {
  basis: 'OWNER_ATTESTED',
  evidenceRef: 'Design note DEMO-7',
  rationale: 'Organization and line number identify a demo request line; owner reviewed.',
};

const draft = (overrides = {}) => ({
  columns: [
    { name: 'REQUEST_ID', exposed: true, dataClass: 'INTERNAL' },
    { name: 'REQUEST_NO', exposed: true, dataClass: 'INTERNAL' },
    { name: 'REQUESTER_NO', exposed: true, dataClass: 'PERSONAL' },
    { name: 'ORG_ID', exposed: true, dataClass: 'INTERNAL' },
    { name: 'LINE_NO', exposed: true, dataClass: 'PUBLIC' },
    { name: 'NOTES', exposed: false, dataClass: 'SENSITIVE' },
  ],
  keyCandidates: [{ code: 'REQUEST_PK', columns: ['REQUEST_ID'], assurance: null }],
  ...overrides,
});

const composite = (assurance = ATTESTED) => ({
  code: 'ORG_LINE',
  columns: ['ORG_ID', 'LINE_NO'],
  assurance,
});

const MAPPING_ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];
const REGISTRY_ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE'];

function setup({ registerMapping = true } = {}) {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const person = (employeeNumber, fullName) => {
    store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, fullName });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const users = {
    admin: person('3001', 'Ada Mapper'),
    viewer: person('3002', 'Val Viewer'),
    updater: person('3003', 'Uma Updater'),
    noRegistry: person('3004', 'Ned Noregistry'),
    nobody: person('3005', 'Nora None'),
    other: person('3006', 'Oli Other'),
  };

  // Mirrors client/src/config/registry/modules/workflowManager.module.js; in memory only.
  const module = rbac.addModule('WORKFLOW_MANAGER', { moduleName: 'Workflow Manager' });
  const permissions = {};
  const registry = rbac.addResource(module, 'DATA_SOURCE_REGISTRY');
  for (const action of REGISTRY_ACTIONS) {
    permissions[`REGISTRY_${action}`] = rbac.addPermission(registry, action);
  }
  if (registerMapping) {
    const mapping = rbac.addResource(module, 'SOURCE_MAPPING');
    for (const action of MAPPING_ACTIONS) {
      permissions[`MAPPING_${action}`] = rbac.addPermission(mapping, action);
    }
  }
  const role = (code, keys, user) => {
    const r = rbac.addRole(code);
    for (const key of keys) if (permissions[key]) rbac.grant(r, permissions[key]);
    rbac.assign(user, r);
  };
  role('WF_MAPPING_ADMIN', Object.keys(permissions), users.admin);
  role('WF_MAPPING_VIEWER', ['REGISTRY_VIEW', 'MAPPING_VIEW'], users.viewer);
  role('WF_MAPPING_UPDATER', ['REGISTRY_VIEW', 'MAPPING_VIEW', 'MAPPING_UPDATE'], users.updater);
  role(
    'WF_MAPPING_NO_REGISTRY',
    MAPPING_ACTIONS.map((a) => `MAPPING_${a}`),
    users.noRegistry,
  );
  role('WF_OTHER', Object.keys(permissions), users.other);

  const wm = installWorkflowManager(store, { dictionary: REGISTRY_DICTIONARY });
  const dictionary = createFakeDictionary({
    'XXZP.XXZP_DEMO_OTHER_T': {
      objectType: 'TABLE',
      status: 'VALID',
      columns: [
        {
          name: 'OTHER_ID',
          oracleType: 'NUMBER',
          dataLength: 22,
          charLength: 0,
          precision: 19,
          scale: 0,
          nullable: false,
          identity: null,
        },
      ],
      constraints: [
        {
          name: 'OTHER_PK',
          type: 'P',
          status: 'ENABLED',
          validated: 'VALIDATED',
          columns: ['OTHER_ID'],
        },
      ],
      uniqueIndexes: [],
    },
  });
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      workflowManagerRepository: store.workflowManagerRepository,
      sourceMappingRepository: store.sourceMappingRepository,
      workflowDictionaryService: dictionary.service,
    },
  });
  return { store, rbac, wm, app, users, permissions, dictionary };
}

describe('workflow manager M2-A source mapping API', () => {
  let f;
  let s;
  let source;

  const get = (path, session = s.admin) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, body, session = s.admin) =>
    request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .send(body);
  const versions = (id = source.sourceId) => `/data-sources/${id}/mapping-versions`;
  const version = (versionId, id = source.sourceId) => `${versions(id)}/${versionId}`;
  const stored = () => f.wm.tables().sourceVersions;
  const audits = (code) => f.store.auditEvents(code);
  const assertForbidden = (res, reasonCode) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'FORBIDDEN');
    if (reasonCode) assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, reasonCode);
  };
  const create = async (body = { draft: draft() }, session = s.admin) => {
    const res = await send('post', versions(), body, session);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  };
  const codes = (findings) => findings.map((finding) => finding.code);

  async function boot(options) {
    f = setup(options);
    s = {};
    for (const [name, user] of Object.entries(f.users)) s[name] = await signIn(f.store, user);
    const res = await send('post', '/data-sources', SOURCE);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    source = res.body.data;
  }

  beforeEach(() => boot());

  describe('authentication, CSRF and authorization', () => {
    const ENDPOINTS = [
      ['get', '/data-sources/1/dictionary'],
      ['get', '/data-sources/1/mapping-versions'],
      ['get', '/data-sources/1/mapping-versions/2'],
      ['post', '/data-sources/1/mapping-versions'],
      ['put', '/data-sources/1/mapping-versions/2'],
      ['post', '/data-sources/1/mapping-versions/2/revalidate'],
      ['get', '/data-sources/1/mapping-versions/2/drift'],
      ['post', '/data-sources/1/mapping-versions/2/clone'],
      ['delete', '/data-sources/1/mapping-versions/2'],
    ];

    it('rejects unauthenticated callers with 401 on all nine endpoints', async () => {
      for (const [method, path] of ENDPOINTS) {
        const res = await request(f.app)[method](`${BASE}${path}`).send({});
        assert.equal(res.status, 401, `${method} ${path}`);
      }
    });

    it('requires the session CSRF token on every change', async () => {
      const { version: v } = await create();
      for (const [method, path] of [
        ['post', versions()],
        ['put', version(v.sourceVersionId)],
        ['post', `${version(v.sourceVersionId)}/revalidate`],
        ['post', `${version(v.sourceVersionId)}/clone`],
        ['delete', version(v.sourceVersionId)],
      ]) {
        const res = await request(f.app)
          [method](`${BASE}${path}`)
          .set('Cookie', s.admin.cookie)
          .send({ rowVersion: 1, draft: draft() });
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.equal(res.body.error.code, 'CSRF_REJECTED');
      }
      assert.equal(stored().length, 1);
    });

    it('denies users without a grant (default deny) on every endpoint', async () => {
      for (const [method, path] of ENDPOINTS) {
        const res =
          method === 'get'
            ? await get(path.replace('/1/', `/${source.sourceId}/`), s.nobody)
            : await send(method, path, { rowVersion: 1, draft: draft() }, s.nobody);
        assertForbidden(res, 'NO_GRANT');
      }
    });

    it('denies everyone while SOURCE_MAPPING is not registered (PERMISSION_UNKNOWN)', async () => {
      await boot({ registerMapping: false });
      assertForbidden(await get(versions()), 'PERMISSION_UNKNOWN');
      assertForbidden(await send('post', versions(), { draft: draft() }), 'PERMISSION_UNKNOWN');
      // M1 is unaffected.
      assert.equal((await get(`/data-sources/${source.sourceId}`)).status, 200);
    });

    it('enforces each action separately', async () => {
      const { version: v } = await create();
      const id = v.sourceVersionId;
      // Viewer: reads only.
      assert.equal((await get(versions(), s.viewer)).status, 200);
      assert.equal((await get(version(id), s.viewer)).status, 200);
      assert.equal((await get(`${version(id)}/drift`, s.viewer)).status, 200);
      assert.equal(
        (await get(`/data-sources/${source.sourceId}/dictionary`, s.viewer)).status,
        200,
      );
      assertForbidden(await send('post', versions(), { draft: draft() }, s.viewer), 'NO_GRANT');
      assertForbidden(await send('post', `${version(id)}/clone`, {}, s.viewer), 'NO_GRANT');
      // Updater: UPDATE (edit and revalidate) but neither CREATE nor DELETE.
      const edit = await send('put', version(id), { rowVersion: 1, draft: draft() }, s.updater);
      assert.equal(edit.status, 200, JSON.stringify(edit.body));
      const again = await send('post', `${version(id)}/revalidate`, { rowVersion: 2 }, s.updater);
      assert.equal(again.status, 200, JSON.stringify(again.body));
      assertForbidden(await send('post', versions(), { draft: draft() }, s.updater), 'NO_GRANT');
      assertForbidden(await send('delete', version(id), { rowVersion: 3 }, s.updater), 'NO_GRANT');
    });

    it('also requires DATA_SOURCE_REGISTRY:VIEW (backend prerequisite)', async () => {
      assertForbidden(await get(versions(), s.noRegistry), 'NO_GRANT');
      assertForbidden(await send('post', versions(), { draft: draft() }, s.noRegistry), 'NO_GRANT');
      assert.equal(stored().length, 0);
    });

    it('lets an explicit DENY override win over the role grant', async () => {
      f.rbac.override(f.users.admin, f.permissions.MAPPING_CREATE, 'DENY');
      assertForbidden(await send('post', versions(), { draft: draft() }), 'EXPLICIT_DENY');
    });
  });

  describe('request validation (strict allowlist)', () => {
    it('rejects server-owned, lifecycle and unknown fields with 400', async () => {
      const cases = [
        { draft: draft(), lifecycleState: 'PUBLISHED' },
        { draft: draft(), isDefault: true },
        { draft: draft(), publishedAt: '2026-11-09T00:00:00Z' },
        { draft: draft(), configSha256: 'f'.repeat(64) },
        { draft: { ...draft(), source: { owner: 'SYS' } } },
        { draft: { ...draft(), sql: 'SELECT * FROM DUAL' } },
        { draft: draft({ columns: [{ name: 'REQUEST_ID', exposed: true, dataClass: 'SECRET' }] }) },
        {
          draft: draft({
            columns: [
              { name: 'REQUEST_ID', exposed: true, dataClass: 'PUBLIC', oracleType: 'CLOB' },
            ],
          }),
        },
        {
          draft: draft({
            keyCandidates: [
              {
                code: 'REQUEST_PK',
                columns: ['REQUEST_ID'],
                assurance: { ...ATTESTED, attestedBy: '1' },
              },
            ],
          }),
        },
        {
          draft: draft({
            columns: [{ name: 'request_id; drop', exposed: true, dataClass: 'PUBLIC' }],
          }),
        },
        {},
      ];
      for (const body of cases) {
        const res = await send('post', versions(), body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
      assert.equal(stored().length, 0);
    });

    it('validates path IDs, pagination and row versions', async () => {
      assert.equal((await get('/data-sources/0/mapping-versions')).status, 400);
      assert.equal((await get(`${versions()}/abc`)).status, 400);
      assert.equal((await get(`${versions()}?pageSize=101`)).status, 400);
      assert.equal((await get(`${versions()}?sortBy=CONFIG_JSON`)).status, 400);
      const { version: v } = await create();
      assert.equal((await send('delete', version(v.sourceVersionId), {})).status, 400);
      assert.equal((await send('put', version(v.sourceVersionId), { draft: draft() })).status, 400);
      assert.equal(
        (await send('post', `${version(v.sourceVersionId)}/revalidate`, { rowVersion: 0 })).status,
        400,
      );
      assert.equal(
        (await send('post', `${version(v.sourceVersionId)}/clone`, { x: 1 })).status,
        400,
      );
    });
  });

  describe('dictionary', () => {
    it('returns live dictionary facts only, read inside a rolled-back READ ONLY transaction', async () => {
      const res = await get(`/data-sources/${source.sourceId}/dictionary`);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const data = res.body.data;
      assert.equal(data.available, true);
      assert.equal(data.source.objectName, OBJECT);
      const byName = Object.fromEntries(data.snapshot.columns.map((c) => [c.name, c]));
      assert.equal(byName.REQUEST_ID.identity, 'ALWAYS');
      assert.equal(byName.PAYLOAD.supported, false, 'BLOB cannot be exposed');
      assert.equal(byName.NOTES.keyEligible, false, 'CLOB cannot be a key');
      assert.equal(byName.ORG_ID.keyEligible, true);
      assert.deepEqual(data.snapshot.constraints[0].columns, ['REQUEST_ID']);
      assert.match(data.snapshot.columnsSha256, /^[0-9a-f]{64}$/);
      assert.ok(f.dictionary.statements.every((sql) => sql === 'SET TRANSACTION READ ONLY'));
      assert.equal(f.dictionary.stats.rollbacks, f.dictionary.stats.connections);
    });

    it('reports an unavailable object or handler as findings, never as data', async () => {
      f.dictionary.object().status = 'INVALID';
      const invalid = await get(`/data-sources/${source.sourceId}/dictionary`);
      assert.equal(invalid.status, 200);
      assert.equal(invalid.body.data.available, false);
      assert.deepEqual(codes(invalid.body.data.findings), ['OBJECT_INVALID']);

      f.wm.tables().sources.push({
        ...f.wm.tables().sources[0],
        sourceId: '901',
        sourceCode: 'DEMO_HANDLER',
        sourceKind: 'HANDLER',
        ownerName: null,
        objectName: null,
        handlerCode: 'DEMO_UNREGISTERED_HANDLER',
      });
      const handler = await get('/data-sources/901/dictionary');
      assert.equal(handler.body.data.available, false);
      assert.deepEqual(codes(handler.body.data.findings), ['SOURCE_HANDLER_NOT_REGISTERED']);
      const refused = await send('post', versions('901'), { draft: draft() });
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error.code, 'SOURCE_MAPPING_INVALID');
      assert.ok(refused.body.error.details.some((d) => d.code === 'SOURCE_HANDLER_NOT_REGISTERED'));
      assert.equal((await get('/data-sources/999/dictionary')).status, 404);
    });
  });

  describe('create (validated DRAFT)', () => {
    it('stores a canonical, fingerprinted DRAFT with server-owned facts', async () => {
      const data = await create();
      const v = data.version;
      assert.equal(v.lifecycleState, 'DRAFT');
      assert.equal(v.isDefault, false);
      assert.equal(v.publishedAt, null);
      assert.equal(v.versionNo, 1);
      assert.equal(v.rowVersion, 1);
      assert.equal(v.editable, true);
      assert.equal(v.configIntegrity, 'VERIFIED');
      assert.match(v.sourceVersionId, /^[1-9][0-9]*$/);
      assert.equal(v.validatedBy, f.users.admin.userId);

      const row = stored()[0];
      assert.equal(row.configJson, canonicalize(JSON.parse(row.configJson)), 'canonical CLOB');
      assert.equal(row.configSha256, sha256Hex(row.configJson), 'consistent SHA-256');
      assert.equal(v.configSha256, row.configSha256);
      assert.equal(row.lifecycleState, 'DRAFT');
      assert.equal(row.isDefault, false);

      const config = v.config;
      assert.equal(config.schema, 'zrv.wf.source/1');
      assert.deepEqual(config.source, {
        sourceCode: SOURCE.sourceCode,
        kind: 'TABLE',
        owner: 'XXZP',
        object: OBJECT,
        handlerCode: null,
      });
      assert.deepEqual(
        config.columns.map((c) => c.name),
        ['LINE_NO', 'NOTES', 'ORG_ID', 'REQUESTER_NO', 'REQUEST_ID', 'REQUEST_NO'],
        'only the chosen columns, sorted',
      );
      const requester = config.columns.find((c) => c.name === 'REQUESTER_NO');
      assert.equal(requester.dataClass, 'PERSONAL');
      assert.equal(requester.oracleType, 'VARCHAR2', 'type comes from the dictionary');
      assert.equal(config.keyCandidates[0].enforcement, 'DATABASE_ENFORCED');
      assert.deepEqual(config.keyCandidates[0].enforcedBy, {
        kind: 'PRIMARY_KEY',
        name: 'XXZP_DEMO_REQUEST_PK',
      });
      assert.deepEqual(data.validation.publicationBlockers, []);
      assert.equal(data.validation.valid, true);
      assert.equal(f.dictionary.stats.observations, 0, 'enforced keys need no observation');
      assert.equal(audits('ACCESS_DENIED').length, 0);
    });

    it('records a DECLARED composite key as provisional with aggregate evidence only', async () => {
      const data = await create({ draft: draft({ keyCandidates: [composite()] }) });
      const key = data.version.config.keyCandidates[0];
      assert.equal(key.enforcement, 'DECLARED');
      assert.deepEqual(key.columns, ['ORG_ID', 'LINE_NO']);
      assert.deepEqual(key.observation, {
        rowCount: 12,
        nullKeyRows: 0,
        duplicateKeyGroups: 0,
        observedAt: '2026-11-09T08:00:00.000Z',
      });
      assert.equal(key.assurance.attestedBy, f.users.admin.userId, 'server-sourced attestation');
      assert.deepEqual(data.validation.publicationBlockers, [
        { code: 'PROVISIONAL_KEY', path: 'keyCandidates[0]' },
      ]);
      assert.deepEqual(data.version.publicationBlockers, data.validation.publicationBlockers);
      assert.ok(codes(data.validation.findings).includes('KEY_NOT_DATABASE_ENFORCED'));
      assert.equal(f.dictionary.stats.observations, 1);
    });

    it('accepts single and multiple candidates and identity-based assurance', async () => {
      f.dictionary.object().constraints = [];
      const data = await create({
        draft: draft({
          keyCandidates: [
            {
              code: 'REQUEST_ID_KEY',
              columns: ['REQUEST_ID'],
              assurance: { ...ATTESTED, basis: 'GENERATED_ALWAYS_IDENTITY' },
            },
            composite(),
          ],
        }),
      });
      assert.deepEqual(
        data.version.config.keyCandidates.map((k) => [k.code, k.enforcement]),
        [
          ['ORG_LINE', 'DECLARED'],
          ['REQUEST_ID_KEY', 'DECLARED'],
        ],
      );
      assert.equal(data.validation.publicationBlockers.length, 2);
    });

    it('refuses invalid drafts with actionable findings and stores nothing', async () => {
      const cases = [
        [
          draft({ columns: [{ name: 'MISSING_COL', exposed: true, dataClass: 'PUBLIC' }] }),
          'COLUMN_NOT_IN_SOURCE',
        ],
        [
          draft({
            columns: [
              ...draft().columns,
              { name: 'PAYLOAD', exposed: true, dataClass: 'SENSITIVE' },
            ],
          }),
          'COLUMN_TYPE_UNSUPPORTED',
        ],
        [
          draft({
            columns: draft().columns.map((c) =>
              c.name === 'REQUEST_ID' ? { ...c, exposed: false } : c,
            ),
          }),
          'KEY_COLUMN_NOT_EXPOSED',
        ],
        [draft({ keyCandidates: [composite(null)] }), 'KEY_ASSURANCE_REQUIRED'],
        [
          draft({
            keyCandidates: [{ code: 'NOTES_KEY', columns: ['NOTES'], assurance: ATTESTED }],
          }),
          'KEY_TYPE_LOB',
        ],
        [
          draft({
            keyCandidates: [
              { ...composite(), assurance: { ...ATTESTED, basis: 'GENERATED_ALWAYS_IDENTITY' } },
            ],
          }),
          'KEY_ASSURANCE_INCONSISTENT',
        ],
      ];
      for (const [body, code] of cases) {
        const res = await send('post', versions(), { draft: body });
        assert.equal(res.status, 400, code);
        assert.equal(res.body.error.code, 'SOURCE_MAPPING_INVALID');
        const detail = res.body.error.details.find((d) => d.code === code);
        assert.ok(detail, `${code} in ${JSON.stringify(res.body.error.details)}`);
        assert.equal(detail.severity, 'ERROR');
        assert.equal(typeof detail.field, 'string');
      }
      assert.equal(stored().length, 0);
    });

    it('refuses a declared key with observed duplicates or null keys', async () => {
      f.dictionary.object().observations['ORG_ID,LINE_NO'] = {
        rowCount: 12,
        nullKeyRows: 0,
        duplicateKeyGroups: 2,
      };
      const dup = await send('post', versions(), {
        draft: draft({ keyCandidates: [composite()] }),
      });
      assert.equal(dup.status, 400);
      assert.ok(dup.body.error.details.some((d) => d.code === 'KEY_DUPLICATES_OBSERVED'));
      f.dictionary.object().observations['ORG_ID,LINE_NO'] = {
        rowCount: 12,
        nullKeyRows: 3,
        duplicateKeyGroups: 0,
      };
      const nulls = await send('post', versions(), {
        draft: draft({ keyCandidates: [composite()] }),
      });
      assert.ok(nulls.body.error.details.some((d) => d.code === 'KEY_NULLS_OBSERVED'));
      assert.ok(!JSON.stringify(nulls.body).includes('rowCount'), 'no counts beyond findings');
      assert.equal(stored().length, 0);
    });

    it('enforces the 256 KiB configuration limit (service) behind the HTTP body limit', async () => {
      const name = (i) => `C${String(i).padStart(4, '0')}_${'X'.repeat(120)}`;
      const columns = Array.from({ length: 1000 }, (_, i) => ({
        name: name(i),
        oracleType: 'VARCHAR2',
        dataLength: 4000,
        charLength: 4000,
        precision: null,
        scale: null,
        nullable: true,
        identity: null,
      }));
      f.dictionary.object().columns = columns;
      f.dictionary.object().constraints = [];
      const body = {
        draft: {
          columns: columns.map((c) => ({ name: c.name, exposed: true, dataClass: 'INTERNAL' })),
          keyCandidates: [],
        },
      };
      // Over HTTP the request body limit (REQUEST_BODY_LIMIT, 100kb) refuses it first.
      assert.equal((await send('post', versions(), body)).status, 413);
      // The configuration limit itself, directly on the service.
      const service = createSourceMappingService({
        repository: f.store.sourceMappingRepository,
        registryRepository: f.store.workflowManagerRepository,
        dictionaryService: f.dictionary.service,
        withConnection: f.store.db.withConnection,
        withTransaction: f.store.db.withTransaction,
        logger: { info() {} },
      });
      await assert.rejects(
        service.createVersion({ userId: f.users.admin.userId }, source.sourceId, body),
        (error) =>
          error.code === 'SOURCE_MAPPING_INVALID' &&
          error.details.some((d) => d.code === 'CONFIG_TOO_LARGE'),
      );
      assert.equal(stored().length, 0);
    });

    it('maps an unavailable object to 409 and a dictionary timeout to 503', async () => {
      f.dictionary.object().status = 'INVALID';
      const gone = await send('post', versions(), { draft: draft() });
      assert.equal(gone.status, 409);
      assert.equal(gone.body.error.code, 'SOURCE_OBJECT_UNAVAILABLE');
      assert.equal(gone.body.error.details[0].code, 'OBJECT_INVALID');
      f.dictionary.object().status = 'VALID';
      f.dictionary.failNext('observe');
      const slow = await send('post', versions(), {
        draft: draft({ keyCandidates: [composite()] }),
      });
      assert.equal(slow.status, 503);
      assert.equal(slow.body.error.code, 'DICTIONARY_TIMEOUT');
      assert.equal(stored().length, 0);
    });

    it('rolls back and leaks nothing on an Oracle failure', async () => {
      f.wm.failNext('insertVersion');
      const res = await send('post', versions(), { draft: draft() });
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.ok(!/ORA-|SELECT|INSERT/i.test(JSON.stringify(res.body)));
      assert.equal(stored().length, 0);
    });

    it('locks the M1 source identity once the first version exists', async () => {
      await create();
      const res = await send('put', `/data-sources/${source.sourceId}`, {
        sourceName: SOURCE.sourceName,
        sourceKind: 'TABLE',
        ownerName: 'XXZP',
        objectName: 'XXZP_DEMO_OTHER_T',
        rowVersion: source.rowVersion,
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SOURCE_IDENTITY_LOCKED');
    });
  });

  describe('list and detail', () => {
    it('pages metadata only, newest first, with stable decimal-string IDs', async () => {
      for (let i = 0; i < 5; i += 1) await create();
      const first = await get(`${versions()}?page=1&pageSize=2`);
      assert.equal(first.status, 200);
      assert.deepEqual(
        first.body.data.map((v) => v.versionNo),
        [5, 4],
      );
      assert.equal(first.body.pagination.total, 5);
      const second = await get(`${versions()}?page=2&pageSize=2`);
      assert.deepEqual(
        second.body.data.map((v) => v.versionNo),
        [3, 2],
      );
      for (const item of [...first.body.data, ...second.body.data]) {
        assert.equal(typeof item.sourceVersionId, 'string');
        assert.ok(!('config' in item) && !('configJson' in item), 'list is metadata only');
      }
      assert.equal((await get(versions('999'))).status, 404);
    });

    it('returns the canonical config, and flags a fingerprint mismatch', async () => {
      const { version: v } = await create();
      const res = await get(version(v.sourceVersionId));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.version.configIntegrity, 'VERIFIED');
      assert.equal(res.body.data.source.sourceCode, SOURCE.sourceCode);
      stored()[0].configSha256 = '0'.repeat(64);
      const tampered = await get(version(v.sourceVersionId));
      assert.equal(tampered.body.data.version.configIntegrity, 'MISMATCH');
    });

    it('keeps versions owned by their source (cross-source access is 404)', async () => {
      const { version: v } = await create();
      const other = await send('post', '/data-sources', {
        ...SOURCE,
        sourceCode: 'DEMO_OTHER',
        objectName: 'XXZP_DEMO_OTHER_T',
      });
      const otherId = other.body.data.sourceId;
      const id = v.sourceVersionId;
      assert.equal((await get(version(id, otherId))).status, 404);
      assert.equal((await get(`${version(id, otherId)}/drift`)).status, 404);
      assert.equal(
        (await send('put', version(id, otherId), { rowVersion: 1, draft: draft() })).status,
        404,
      );
      assert.equal((await send('post', `${version(id, otherId)}/clone`, {})).status, 404);
      assert.equal((await send('delete', version(id, otherId), { rowVersion: 1 })).status, 404);
      assert.equal(stored().length, 1);
    });

    it('leaves the M1 metadata-only versions endpoint unchanged', async () => {
      await create();
      const res = await get(`/data-sources/${source.sourceId}/versions`);
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.body.data[0]).sort(), [
        'configSha256',
        'createdAt',
        'isDefault',
        'lifecycleState',
        'publishedAt',
        'schemaVersion',
        'sourceVersionId',
        'updatedAt',
        'validatedAt',
        'versionNo',
      ]);
    });
  });

  describe('update and revalidate', () => {
    it('updates a DRAFT with optimistic locking and keeps unchanged attestations', async () => {
      const { version: v } = await create({ draft: draft({ keyCandidates: [composite()] }) });
      const attestation = v.config.keyCandidates[0].assurance;
      f.store.advance?.(60_000);
      const res = await send(
        'put',
        version(v.sourceVersionId),
        {
          rowVersion: 1,
          draft: draft({
            columns: draft().columns.map((c) => (c.name === 'NOTES' ? { ...c, exposed: true } : c)),
            keyCandidates: [composite()],
          }),
        },
        s.other,
      );
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const updated = res.body.data.version;
      assert.equal(updated.rowVersion, 2);
      assert.equal(updated.config.columns.find((c) => c.name === 'NOTES').exposed, true);
      assert.notEqual(updated.configSha256, v.configSha256);
      assert.deepEqual(updated.config.keyCandidates[0].assurance, attestation, 'kept as attested');

      const changed = await send(
        'put',
        version(v.sourceVersionId),
        {
          rowVersion: 2,
          draft: draft({
            keyCandidates: [composite({ ...ATTESTED, evidenceRef: 'Design note DEMO-8' })],
          }),
        },
        s.other,
      );
      assert.equal(changed.status, 200);
      assert.equal(
        changed.body.data.version.config.keyCandidates[0].assurance.attestedBy,
        f.users.other.userId,
        'changed assurance is re-attested by the current user',
      );

      const stale = await send('put', version(v.sourceVersionId), {
        rowVersion: 1,
        draft: draft(),
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, 'STALE_RECORD');

      const invalid = await send('put', version(v.sourceVersionId), {
        rowVersion: 3,
        draft: draft({ keyCandidates: [composite(null)] }),
      });
      assert.equal(invalid.status, 400);
      assert.equal(stored()[0].rowVersion, 3, 'an invalid edit changes nothing');
    });

    it('keeps non-DRAFT versions read-only', async () => {
      const { version: v } = await create();
      for (const state of ['REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED']) {
        Object.assign(stored()[0], { lifecycleState: state });
        const before = JSON.stringify(stored()[0]);
        const put = await send('put', version(v.sourceVersionId), {
          rowVersion: 1,
          draft: draft(),
        });
        assert.equal(put.status, 409, state);
        assert.equal(put.body.error.code, 'SOURCE_VERSION_NOT_DRAFT');
        const again = await send('post', `${version(v.sourceVersionId)}/revalidate`, {
          rowVersion: 1,
        });
        assert.equal(again.body.error.code, 'SOURCE_VERSION_NOT_DRAFT');
        const del = await send('delete', version(v.sourceVersionId), { rowVersion: 1 });
        assert.equal(del.body.error.code, 'SOURCE_VERSION_NOT_DRAFT');
        assert.equal(JSON.stringify(stored()[0]), before, `${state} unchanged`);
        const read = await get(version(v.sourceVersionId));
        assert.equal(read.body.data.version.editable, false);
      }
    });

    it('revalidates with fresh evidence, and never corrupts the draft on failure', async () => {
      const { version: v } = await create({ draft: draft({ keyCandidates: [composite()] }) });
      const ok = await send('post', `${version(v.sourceVersionId)}/revalidate`, { rowVersion: 1 });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.data.version.rowVersion, 2);
      assert.equal(ok.body.data.validation.valid, true);
      assert.equal(f.dictionary.stats.observations, 2, 'uniqueness observed again');

      const before = JSON.stringify(stored()[0]);
      f.dictionary.object().columns.find((c) => c.name === 'ORG_ID').precision = 18;
      f.dictionary.object().observations['ORG_ID,LINE_NO'] = {
        rowCount: 12,
        nullKeyRows: 0,
        duplicateKeyGroups: 1,
      };
      const failed = await send('post', `${version(v.sourceVersionId)}/revalidate`, {
        rowVersion: 2,
      });
      assert.equal(failed.status, 409);
      assert.equal(failed.body.error.code, 'SOURCE_VERSION_REVALIDATION_FAILED');
      assert.ok(failed.body.error.details.some((d) => d.code === 'KEY_DUPLICATES_OBSERVED'));
      assert.equal(JSON.stringify(stored()[0]), before, 'stored version untouched');
    });
  });

  describe('drift', () => {
    it('reports no drift for an unchanged source and changes nothing', async () => {
      const { version: v } = await create();
      const res = await get(`${version(v.sourceVersionId)}/drift`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.drifted, false);
      assert.deepEqual(res.body.data.findings, []);
      assert.equal(res.body.data.current.status, 'VALID');
      assert.equal(stored()[0].rowVersion, 1);
    });

    it('detects column, type, identity and key-enforcement drift on any lifecycle state', async () => {
      const { version: v } = await create();
      stored()[0].lifecycleState = 'PUBLISHED';
      const object = f.dictionary.object();
      object.columns.find((c) => c.name === 'REQUEST_NO').charLength = 60;
      object.columns.find((c) => c.name === 'REQUEST_ID').identity = 'BY DEFAULT';
      object.columns = object.columns.filter((c) => c.name !== 'REQUESTER_NO');
      object.constraints = [{ ...object.constraints[0], status: 'DISABLED' }];
      const res = await get(`${version(v.sourceVersionId)}/drift`);
      assert.equal(res.body.data.drifted, true);
      const found = codes(res.body.data.findings);
      for (const code of ['COLUMN_CHANGED', 'COLUMN_MISSING', 'KEY_ENFORCEMENT_LOST']) {
        assert.ok(found.includes(code), `${code} in ${found}`);
      }
      assert.ok(
        res.body.data.findings.some(
          (x) => x.code === 'COLUMN_CHANGED' && /identity/.test(x.message),
        ),
      );
      assert.equal(stored()[0].lifecycleState, 'PUBLISHED');
    });

    it('reports an invalid or missing object as drift', async () => {
      const { version: v } = await create();
      f.dictionary.object().status = 'INVALID';
      const invalid = await get(`${version(v.sourceVersionId)}/drift`);
      assert.deepEqual(codes(invalid.body.data.findings), ['OBJECT_INVALID']);
      f.dictionary.objects.delete('XXZP.XXZP_DEMO_REQUEST_T');
      const missing = await get(`${version(v.sourceVersionId)}/drift`);
      assert.equal(missing.body.data.drifted, true);
      assert.deepEqual(codes(missing.body.data.findings), ['OBJECT_NOT_FOUND']);
      assert.equal(missing.body.data.current, null);
    });
  });

  describe('clone', () => {
    it('clones any version into a new validated DRAFT with fresh evidence', async () => {
      const { version: origin } = await create({ draft: draft({ keyCandidates: [composite()] }) });
      Object.assign(stored()[0], { lifecycleState: 'PUBLISHED' });
      const originRow = JSON.stringify(stored()[0]);
      const res = await send('post', `${version(origin.sourceVersionId)}/clone`, {}, s.other);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const copy = res.body.data.version;
      assert.equal(copy.lifecycleState, 'DRAFT');
      assert.equal(copy.versionNo, 2);
      assert.notEqual(copy.sourceVersionId, origin.sourceVersionId);
      assert.equal(copy.config.keyCandidates[0].assurance.attestedBy, f.users.other.userId);
      assert.deepEqual(
        copy.config.columns.map((c) => [c.name, c.exposed, c.dataClass]),
        origin.config.columns.map((c) => [c.name, c.exposed, c.dataClass]),
      );
      assert.equal(JSON.stringify(stored()[0]), originRow, 'origin unchanged');
      assert.equal(f.dictionary.stats.observations, 2, 'evidence re-observed');
    });

    it('refuses to clone a version that no longer validates or is unverifiable', async () => {
      const { version: v } = await create();
      f.dictionary.object().columns = f.dictionary
        .object()
        .columns.filter((c) => c.name !== 'ORG_ID');
      const drifted = await send('post', `${version(v.sourceVersionId)}/clone`, {});
      assert.equal(drifted.status, 400);
      assert.ok(drifted.body.error.details.some((d) => d.code === 'COLUMN_NOT_IN_SOURCE'));
      stored()[0].configSha256 = '0'.repeat(64);
      const tampered = await send('post', `${version(v.sourceVersionId)}/clone`, {});
      assert.equal(tampered.status, 409);
      assert.equal(tampered.body.error.code, 'SOURCE_VERSION_UNREADABLE');
      assert.equal(stored().length, 1);
    });
  });

  describe('restricted delete', () => {
    it('deletes an unreferenced DRAFT with optimistic locking', async () => {
      const { version: v } = await create();
      const stale = await send('delete', version(v.sourceVersionId), { rowVersion: 2 });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, 'STALE_RECORD');
      const res = await send('delete', version(v.sourceVersionId), { rowVersion: 1 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.data, {
        sourceId: source.sourceId,
        sourceVersionId: v.sourceVersionId,
        deleted: true,
      });
      assert.equal(stored().length, 0);
      assert.equal(
        (await send('delete', version(v.sourceVersionId), { rowVersion: 1 })).status,
        404,
      );
    });

    it('refuses a DRAFT referenced as a header or line source, or with unreadable dependants', async () => {
      const { version: v } = await create();
      const id = v.sourceVersionId;
      // Re-read each time: a rolled-back transaction replaces the tables object.
      const forms = () => f.wm.tables().formVersions;
      const formConfig = (extra) =>
        JSON.stringify({ schema: 'zrv.wf.form/1', lines: [], ...extra });

      forms().push({
        formVersionId: '801',
        formId: '1',
        headerSourceVersionId: id,
        configJson: formConfig(),
      });
      let res = await send('delete', version(id), { rowVersion: 1 });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SOURCE_VERSION_REFERENCED');

      forms().length = 0;
      forms().push({
        formVersionId: '802',
        formId: '1',
        headerSourceVersionId: '777',
        configJson: formConfig({ lines: [{ code: 'DOCS', sourceVersionId: id }] }),
      });
      res = await send('delete', version(id), { rowVersion: 1 });
      assert.equal(res.body.error.code, 'SOURCE_VERSION_REFERENCED');

      forms().length = 0;
      forms().push({
        formVersionId: '803',
        formId: '1',
        headerSourceVersionId: '777',
        configJson: '{"schema":"zrv.wf.form/9"}',
      });
      res = await send('delete', version(id), { rowVersion: 1 });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SOURCE_VERSION_DEPENDENCY_UNVERIFIED');
      assert.equal(stored().length, 1);
    });
  });
});

describe('workflow manager M2-A SQL boundaries (static)', () => {
  const code = async (file) => {
    const source = await readFile(
      new URL(`../src/modules/workflow-manager/${file}`, import.meta.url),
      'utf8',
    );
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  };

  it('writes only XX_ZRV_WF_SOURCE_VERSIONS, as DRAFT, and never touches runtime tables', async () => {
    const sql = await code('sourceMapping.repository.js');
    const writes = [
      ...sql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+([a-z_$.]+)/gi),
    ]
      .map((m) => m[2].toLowerCase())
      .filter((name) => name.startsWith('xx_'));
    assert.deepEqual([...new Set(writes)], ['xx_zrv_wf_source_versions']);
    assert.doesNotMatch(
      sql,
      /\bMERGE\b|\bTRUNCATE\b|\bDROP\b|\bALTER\b|\bGRANT\b|\bCOMMIT\b|\bROLLBACK\b/i,
    );
    for (const state of ['REVIEW', 'APPROVED', 'PUBLISHED', 'RETIRED']) {
      assert.doesNotMatch(sql, new RegExp(`'${state}'`), `${state} is never written`);
    }
    assert.match(sql, /VALUES[\s\S]*'DRAFT', 'N'/, 'inserts are DRAFT and not default');
    assert.match(sql, /lifecycle_state = 'DRAFT'/, 'updates and deletes are DRAFT-guarded');
    assert.doesNotMatch(sql, /config_json\s+(NOT\s+)?LIKE/i, 'no text scan over JSON');
    for (const runtime of [
      'INSTANCES',
      'STAGE_INSTANCES',
      'TASKS',
      'ACTIONS',
      'EVENTS',
      'OUTBOX',
      'RFI',
      'FYI',
    ]) {
      assert.doesNotMatch(sql, new RegExp(`xx_zrv_wf_${runtime}\\b`, 'i'), runtime);
    }
    assert.doesNotMatch(
      sql,
      /\$\{(?!UTC_NOW\}|VERSION_COLUMNS\}|LOCK_WAIT_SECONDS\}|userName\('v\.[a-z_]+'\)\}|column\})/,
      'only fixed fragments are interpolated',
    );
  });

  it('takes the parent source lock in both the M1 identity update and M2-A writes', async () => {
    const m1 = await code('workflowManager.service.js');
    const m2 = await code('sourceMapping.service.js');
    assert.match(
      m1,
      /updateSource[\s\S]*?repository\.lockSource\(c, sourceId\)[\s\S]*?repository\.findSource/,
    );
    assert.match(m2, /registryRepository\.lockSource\(c, sourceId\)/);
    const registry = await code('workflowManager.repository.js');
    assert.match(
      registry,
      /FROM xx_zrv_wf_data_sources s\s+WHERE s\.source_id = :sourceId\s+FOR UPDATE WAIT 10/,
    );
  });
});

describe('workflow manager M2-A OpenAPI contract', () => {
  it('documents all nine operations with session security, permission and CSRF', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/workflow-manager/data-sources/{sourceId}';
    const expected = [
      ['get', '/dictionary', 'VIEW'],
      ['get', '/mapping-versions', 'VIEW'],
      ['post', '/mapping-versions', 'CREATE'],
      ['get', '/mapping-versions/{versionId}', 'VIEW'],
      ['put', '/mapping-versions/{versionId}', 'UPDATE'],
      ['delete', '/mapping-versions/{versionId}', 'DELETE'],
      ['post', '/mapping-versions/{versionId}/revalidate', 'UPDATE'],
      ['get', '/mapping-versions/{versionId}/drift', 'VIEW'],
      ['post', '/mapping-versions/{versionId}/clone', 'CREATE'],
    ];
    for (const [method, path, action] of expected) {
      const operation = paths[`${base}${path}`]?.[method];
      assert.ok(operation, `${method.toUpperCase()} ${path} is documented`);
      assert.deepEqual(operation.security, [{ sessionCookie: [] }], `${path} security`);
      assert.match(
        operation.description,
        new RegExp(`WORKFLOW_MANAGER\\.SOURCE_MAPPING:${action}`),
      );
      assert.match(operation.description, /DATA_SOURCE_REGISTRY:VIEW/);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF header`);
      for (const status of ['401', '403', '404']) {
        assert.ok(operation.responses[status], `${method} ${path} documents ${status}`);
      }
    }
  });
});
