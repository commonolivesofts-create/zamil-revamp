/*
 * Workflow Manager M2-A concurrency: deterministic interleavings through the REAL services
 * (sourceMapping.service.js and the M1 workflowManager.service.js identity update) over a
 * transaction simulator with row locks, READ COMMITTED visibility after a lock wait, commit-time
 * unique/FK checks and rollback (helpers/sourceMappingFakes.js createLockingDb). Gates pause a
 * named repository call so each ordering is forced, not left to timing. This proves lock ordering
 * and service rules; Oracle's own locking is relied on for the SQL (SELECT ... FOR UPDATE WAIT).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSourceMappingService } from '../src/modules/workflow-manager/sourceMapping.service.js';
import { createWorkflowManagerService } from '../src/modules/workflow-manager/workflowManager.service.js';
import {
  createFakeDictionary,
  createLockingDb,
  createRegistryFakeRepository,
  createSourceMappingFakeRepository,
  emptyTables,
  instrument,
} from './helpers/sourceMappingFakes.js';

const ACTOR = { userId: '7' };
const OTHER = { userId: '8' };
const silent = { info() {}, warn() {}, error() {} };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(condition, label) {
  for (let i = 0; i < 500; i += 1) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const SOURCE = {
  sourceId: '1',
  sourceCode: 'DEMO_REQUEST_HEADER',
  sourceName: 'Demo request header',
  sourceKind: 'TABLE',
  ownerName: 'XXZP',
  objectName: 'XXZP_DEMO_REQUEST_T',
  handlerCode: null,
  isActive: true,
  rowVersion: 1,
};

const DRAFT = {
  columns: [
    { name: 'REQUEST_ID', exposed: true, dataClass: 'INTERNAL' },
    { name: 'ORG_ID', exposed: true, dataClass: 'INTERNAL' },
    { name: 'LINE_NO', exposed: true, dataClass: 'PUBLIC' },
  ],
  keyCandidates: [{ code: 'REQUEST_PK', columns: ['REQUEST_ID'], assurance: null }],
};

function setup({ lockless = false, foreignKeys } = {}) {
  const tables = emptyTables();
  tables.sources.push({ ...SOURCE });
  const db = createLockingDb(tables);
  let id = 100;
  const nextId = () => String(id++);
  const calls = [];
  const registryBase = createRegistryFakeRepository(db.tablesOf, {
    dictionary: [
      {
        ownerName: 'XXZP',
        objectName: 'XXZP_DEMO_REQUEST_T',
        objectType: 'TABLE',
        status: 'VALID',
      },
      { ownerName: 'XXZP', objectName: 'XXZP_DEMO_OTHER_T', objectType: 'TABLE', status: 'VALID' },
    ],
  });
  if (lockless) registryBase.lockSource = async (c, sourceId) => sourceId; // control only
  const registry = instrument(registryBase, { calls, gates: db.gates });
  const repository = instrument(
    createSourceMappingFakeRepository(db.tablesOf, { nextId, foreignKeys }),
    { calls, gates: db.gates },
  );
  const dictionary = createFakeDictionary();
  // Expensive evidence must be gathered while NO source lock is held.
  const lockedDuringEvidence = [];
  const snapshot = dictionary.service.snapshot;
  const observe = dictionary.service.observeKeyUniqueness;
  const dictionaryService = {
    snapshot: async (args) => {
      lockedDuringEvidence.push(db.locks.isHeld('SRC:1'));
      return snapshot(args);
    },
    observeKeyUniqueness: async (args) => {
      lockedDuringEvidence.push(db.locks.isHeld('SRC:1'));
      return observe(args);
    },
  };
  const deps = {
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    logger: silent,
  };
  const mapping = createSourceMappingService({
    ...deps,
    repository,
    registryRepository: registry,
    dictionaryService,
  });
  const registryService = createWorkflowManagerService({ ...deps, repository: registry });
  return { db, calls, mapping, registryService, repository, dictionary, lockedDuringEvidence };
}

const versionsOf = (db) => db.committed.sourceVersions;
const settle = (promise) =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );

describe('M2-A concurrency: version creation and numbering', () => {
  it('simultaneous first versions get distinct, consecutive numbers', async () => {
    const t = setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        t.mapping.createVersion(i % 2 ? OTHER : ACTOR, '1', { draft: DRAFT }),
      ),
    );
    const numbers = results.map((r) => r.version.versionNo).sort((a, b) => a - b);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(
      versionsOf(t.db)
        .map((v) => v.versionNo)
        .sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6],
    );
    assert.equal(new Set(results.map((r) => r.version.sourceVersionId)).size, 6);
    assert.ok(t.lockedDuringEvidence.length >= 6);
    assert.ok(
      t.lockedDuringEvidence.every((held) => held === false),
      'dictionary evidence is read before the parent-row lock',
    );
  });

  it('control: without the parent lock the unique key rejects the clash (409, no duplicate)', async () => {
    const t = setup({ lockless: true });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        settle(t.mapping.createVersion(ACTOR, '1', { draft: DRAFT })),
      ),
    );
    const failed = results.filter((r) => !r.ok);
    assert.ok(failed.length > 0, 'the simulator exposes the MAX+1 race');
    for (const r of failed) assert.equal(r.error.code, 'SOURCE_VERSION_CONFLICT');
    const numbers = versionsOf(t.db).map((v) => v.versionNo);
    assert.equal(new Set(numbers).size, numbers.length, 'never two equal VERSION_NO values');
  });

  it('a failure inside the write transaction rolls everything back', async () => {
    const t = setup();
    const insert = t.repository.insertVersion;
    t.repository.insertVersion = async (...args) => {
      await insert(...args);
      throw Object.assign(new Error('ORA-03113: end-of-file'), { errorNum: 3113 });
    };
    await assert.rejects(t.mapping.createVersion(ACTOR, '1', { draft: DRAFT }), /ORA-03113/);
    assert.equal(versionsOf(t.db).length, 0);
    assert.equal(t.db.stats.rollbacks, 1);
  });
});

describe('M2-A concurrency: first version vs M1 source identity change', () => {
  const identityChange = {
    sourceName: SOURCE.sourceName,
    sourceKind: 'TABLE',
    ownerName: 'XXZP',
    objectName: 'XXZP_DEMO_OTHER_T',
    rowVersion: 1,
  };

  it('version first: the identity change waits, then sees the version (SOURCE_IDENTITY_LOCKED)', async () => {
    const t = setup();
    const insertGate = t.db.gate('insertVersion');
    const create = settle(t.mapping.createVersion(ACTOR, '1', { draft: DRAFT }));
    await insertGate.reached; // create holds the source lock
    let updateDone = false;
    const update = settle(t.registryService.updateSource(OTHER, '1', identityChange)).then((r) => {
      updateDone = true;
      return r;
    });
    await until(() => t.calls.filter((n) => n === 'lockSource').length === 2, 'update lock wait');
    for (let i = 0; i < 20; i += 1) await tick();
    assert.equal(updateDone, false, 'the identity change is blocked by the row lock');
    insertGate.release();
    const [created, updated] = await Promise.all([create, update]);
    assert.equal(created.ok, true);
    assert.equal(updated.ok, false);
    assert.equal(updated.error.code, 'SOURCE_IDENTITY_LOCKED');
    assert.equal(t.db.committed.sources[0].objectName, SOURCE.objectName);
  });

  it('identity first: version creation re-checks after the lock and refuses (SOURCE_IDENTITY_CHANGED)', async () => {
    const t = setup();
    const updateGate = t.db.gate('updateSource');
    const update = settle(t.registryService.updateSource(OTHER, '1', identityChange));
    await updateGate.reached; // the identity change holds the source lock
    const create = settle(t.mapping.createVersion(ACTOR, '1', { draft: DRAFT }));
    await until(() => t.calls.filter((n) => n === 'lockSource').length === 2, 'create lock wait');
    updateGate.release();
    const [updated, created] = await Promise.all([update, create]);
    assert.equal(updated.ok, true, updated.error?.message);
    assert.equal(created.ok, false);
    assert.equal(created.error.code, 'SOURCE_IDENTITY_CHANGED');
    assert.equal(versionsOf(t.db).length, 0, 'no version pairs the new identity with old evidence');
    assert.equal(t.db.committed.sources[0].objectName, 'XXZP_DEMO_OTHER_T');
  });
});

describe('M2-A concurrency: concurrent edits and deletes', () => {
  async function withDraft() {
    const t = setup();
    const { version } = await t.mapping.createVersion(ACTOR, '1', { draft: DRAFT });
    return { t, id: version.sourceVersionId };
  }
  const edited = {
    ...DRAFT,
    columns: DRAFT.columns.map((c) => (c.name === 'LINE_NO' ? { ...c, dataClass: 'INTERNAL' } : c)),
  };

  it('two updates from the same row version: one wins, the other is STALE_RECORD', async () => {
    const { t, id } = await withDraft();
    const gate = t.db.gate('updateVersionConfig');
    const first = settle(t.mapping.updateVersion(ACTOR, '1', id, { rowVersion: 1, draft: edited }));
    await gate.reached;
    const second = settle(t.mapping.updateVersion(OTHER, '1', id, { rowVersion: 1, draft: DRAFT }));
    await until(() => t.calls.filter((n) => n === 'lockSource').length === 3, 'second lock wait');
    gate.release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    assert.equal(b.error.code, 'STALE_RECORD');
    assert.equal(versionsOf(t.db)[0].rowVersion, 2);
    assert.equal(
      JSON.parse(versionsOf(t.db)[0].configJson).columns.find((c) => c.name === 'LINE_NO')
        .dataClass,
      'INTERNAL',
    );
  });

  it('delete then update: the update finds the version gone (404)', async () => {
    const { t, id } = await withDraft();
    const gate = t.db.gate('deleteDraftVersion');
    const del = settle(t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }));
    await gate.reached;
    const upd = settle(t.mapping.updateVersion(OTHER, '1', id, { rowVersion: 1, draft: edited }));
    await until(() => t.calls.filter((n) => n === 'lockSource').length === 3, 'update lock wait');
    gate.release();
    const [d, u] = await Promise.all([del, upd]);
    assert.equal(d.ok, true);
    assert.equal(u.ok, false);
    assert.equal(u.error.code, 'RESOURCE_NOT_FOUND');
    assert.equal(versionsOf(t.db).length, 0);
  });

  it('update then delete with the old row version: the delete is STALE_RECORD', async () => {
    const { t, id } = await withDraft();
    const gate = t.db.gate('updateVersionConfig');
    const upd = settle(t.mapping.updateVersion(ACTOR, '1', id, { rowVersion: 1, draft: edited }));
    await gate.reached;
    const del = settle(t.mapping.deleteVersion(OTHER, '1', id, { rowVersion: 1 }));
    await until(() => t.calls.filter((n) => n === 'lockSource').length === 3, 'delete lock wait');
    gate.release();
    const [u, d] = await Promise.all([upd, del]);
    assert.equal(u.ok, true);
    assert.equal(d.ok, false);
    assert.equal(d.error.code, 'STALE_RECORD');
    assert.equal(versionsOf(t.db).length, 1);
  });
});

describe('M2-A concurrency: delete vs concurrent dependency introduction', () => {
  /**
   * A future form-mapping writer (M2-B) following the documented protocol: lock the referenced
   * source version row, then insert the form version (FK HEADER_SOURCE_VERSION_ID).
   */
  const introduceDependency = (t, sourceVersionId, { afterLock, onLocked } = {}) =>
    t.db.withTransaction('LOW', async (c) => {
      const locked = await t.repository.lockVersion(c, { sourceId: '1', sourceVersionId });
      onLocked?.();
      if (!locked) throw Object.assign(new Error('source version gone'), { code: 'GONE' });
      await afterLock;
      t.db.tablesOf(c).formVersions.push({
        formVersionId: '900',
        formId: '1',
        headerSourceVersionId: sourceVersionId,
        configJson: JSON.stringify({ schema: 'zrv.wf.form/1', lines: [] }),
      });
    });

  async function withDraft(options) {
    const t = setup(options);
    const { version } = await t.mapping.createVersion(ACTOR, '1', { draft: DRAFT });
    return { t, id: version.sourceVersionId };
  }

  it('dependency first: the delete waits on the version row and is refused (REFERENCED)', async () => {
    const { t, id } = await withDraft();
    // The dependency writer holds the version-row lock, paused before its insert.
    let release;
    const afterLock = new Promise((resolve) => {
      release = resolve;
    });
    let locked = false;
    const writer = settle(
      introduceDependency(t, id, { afterLock, onLocked: () => (locked = true) }),
    );
    await until(() => locked, 'writer lock');
    const del = settle(t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }));
    await until(() => t.calls.filter((n) => n === 'lockVersion').length === 2, 'delete lock wait');
    release();
    const [w, d] = await Promise.all([writer, del]);
    assert.equal(w.ok, true);
    assert.equal(d.ok, false);
    assert.equal(d.error.code, 'SOURCE_VERSION_REFERENCED');
    assert.equal(versionsOf(t.db).length, 1);
  });

  it('delete first: the dependency writer finds the version gone', async () => {
    const { t, id } = await withDraft();
    const gate = t.db.gate('deleteDraftVersion');
    const del = settle(t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }));
    await gate.reached;
    const writer = settle(introduceDependency(t, id));
    await until(() => t.calls.filter((n) => n === 'lockVersion').length === 2, 'writer lock wait');
    gate.release();
    const [d, w] = await Promise.all([del, writer]);
    assert.equal(d.ok, true);
    assert.equal(w.ok, false);
    assert.equal(w.error.code, 'GONE');
    assert.equal(t.db.committed.formVersions.length, 0);
  });

  it('an enforced FK (ORA-02292) is the final guard and rolls back', async () => {
    const { t, id } = await withDraft();
    t.db.committed.formVersions.push({
      formVersionId: '901',
      formId: '1',
      headerSourceVersionId: id,
      configJson: JSON.stringify({ schema: 'zrv.wf.form/1', lines: [] }),
    });
    // Simulate a reference the structural check could not see.
    const refs = t.repository.findVersionReferences;
    t.repository.findVersionReferences = async (...args) => ({
      ...(await refs(...args)),
      headerRefs: 0,
    });
    await assert.rejects(
      t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }),
      (error) => error.code === 'SOURCE_VERSION_REFERENCED',
    );
    assert.equal(versionsOf(t.db).length, 1);
  });

  it('fails closed on cascading, disabled or invisible foreign keys', async () => {
    const headerKey = {
      tableName: 'XX_ZRV_WF_FORM_VERSIONS',
      constraintName: 'ZWF_FK_FV_SV',
      deleteRule: 'NO ACTION',
      status: 'ENABLED',
    };
    // The dictionary shows no FK at all (for example another schema's synonym): not trusted.
    {
      const { t, id } = await withDraft({ foreignKeys: () => [] });
      await assert.rejects(
        t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }),
        (error) => error.code === 'SOURCE_VERSION_DEPENDENCY_UNVERIFIED',
      );
      assert.equal(versionsOf(t.db).length, 1);
    }
    for (const key of [
      {
        tableName: 'XX_ZRV_WF_FORM_VERSIONS',
        constraintName: 'FK1',
        deleteRule: 'CASCADE',
        status: 'ENABLED',
      },
      {
        tableName: 'XX_ZRV_WF_FUTURE_T',
        constraintName: 'FK2',
        deleteRule: 'SET NULL',
        status: 'ENABLED',
      },
      {
        tableName: 'XX_ZRV_WF_FUTURE_T',
        constraintName: 'FK3',
        deleteRule: 'NO ACTION',
        status: 'DISABLED',
      },
    ]) {
      const { t, id } = await withDraft({
        foreignKeys: () => (key.constraintName === 'FK1' ? [key] : [headerKey, key]),
      });
      await assert.rejects(
        t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 }),
        (error) => error.code === 'SOURCE_VERSION_DEPENDENCY_UNVERIFIED',
        JSON.stringify(key),
      );
      assert.equal(versionsOf(t.db).length, 1);
    }
    // An enabled, restricting FK of another table is safe: Oracle refuses the delete if needed.
    const { t, id } = await withDraft({
      foreignKeys: () => [
        headerKey,
        {
          tableName: 'XX_ZRV_WF_FUTURE_T',
          constraintName: 'FK4',
          deleteRule: 'NO ACTION',
          status: 'ENABLED',
        },
      ],
    });
    await t.mapping.deleteVersion(ACTOR, '1', id, { rowVersion: 1 });
    assert.equal(versionsOf(t.db).length, 0);
  });
});
