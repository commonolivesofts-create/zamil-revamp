/*
 * Test doubles for Workflow Manager M2-A (source version mapping). They prove routes, guards,
 * validation, service rules, transaction boundaries and lock ordering — NOT the Oracle SQL, which
 * is checked statically and must be verified read-only on TEST separately.
 *
 *   createSourceMappingFakeRepository(tablesOf)  in-memory sourceMapping.repository.js over the
 *       tables of a connection (`tablesOf(c)`), with the semantics the service relies on: version
 *       IDs, ROW_VERSION matching/increment, DRAFT-only guards, MAX+1 numbering, structural
 *       references and the foreign keys reported by the dictionary.
 *   createFakeDictionary()                        the REAL dictionary.service.js over a seeded
 *       in-memory dictionary repository and a recording READ ONLY connection.
 *   createLockingDb()                             a transaction simulator with READ COMMITTED
 *       visibility, row locks (SELECT ... FOR UPDATE), commit-time unique (SOURCE_ID, VERSION_NO)
 *       and FK checks, rollback, and gates that pause a named repository call so interleavings
 *       are deterministic.
 */
import { createDictionaryService } from '../../src/modules/workflow-manager/mapping/dictionary.service.js';

const clone = (value) => structuredClone(value);
const oracleError = (errorNum, message) =>
  Object.assign(new Error(`ORA-${String(errorNum).padStart(5, '0')}: ${message}`), { errorNum });

export const emptyTables = () => ({ sources: [], sourceVersions: [], formVersions: [] });

// ------------------------------------------------------------------------------- repository

export function createSourceMappingFakeRepository(
  tablesOf,
  { now = () => new Date(), nextId, foreignKeys } = {},
) {
  let counter = 1000;
  const newId = nextId ?? (() => String(counter++));
  const versionsOf = (c) => tablesOf(c).sourceVersions;
  const view = (v) => ({
    sourceVersionId: v.sourceVersionId,
    sourceId: v.sourceId,
    versionNo: v.versionNo,
    lifecycleState: v.lifecycleState,
    isDefault: v.isDefault,
    configSha256: v.configSha256,
    schemaVersion: v.schemaVersion ?? 1,
    validatedAt: v.validatedAt ?? null,
    validatedBy: v.validatedBy ?? null,
    publishedAt: v.publishedAt ?? null,
    createdAt: v.createdAt ?? '2026-11-01T00:00:00.000Z',
    createdBy: v.createdBy ?? '1',
    updatedAt: v.updatedAt ?? '2026-11-01T00:00:00.000Z',
    updatedBy: v.updatedBy ?? null,
    rowVersion: v.rowVersion ?? 1,
  });
  const lineRefs = (fv, id) => {
    try {
      const config = JSON.parse(fv.configJson ?? 'null');
      return (config?.lines ?? []).some((line) => line.sourceVersionId === id);
    } catch {
      return false;
    }
  };
  const schemaOf = (fv) => {
    try {
      return JSON.parse(fv.configJson ?? 'null')?.schema ?? null;
    } catch {
      return null;
    }
  };

  return {
    async listVersions(c, { sourceId, limit, offset }) {
      const rows = versionsOf(c)
        .filter((v) => v.sourceId === sourceId)
        .sort(
          (a, b) =>
            b.versionNo - a.versionNo || Number(b.sourceVersionId) - Number(a.sourceVersionId),
        );
      return { total: rows.length, items: rows.slice(offset, offset + limit).map(view) };
    },
    async findVersion(c, { sourceId, sourceVersionId }) {
      const v = versionsOf(c).find(
        (row) => row.sourceVersionId === sourceVersionId && row.sourceId === sourceId,
      );
      return v
        ? {
            ...view(v),
            configJson: v.configJson ?? null,
            createdByName: null,
            updatedByName: null,
            validatedByName: null,
          }
        : null;
    },
    async lockVersion(c, { sourceId, sourceVersionId }) {
      await c?.lockRow?.(`SV:${sourceVersionId}`);
      const v = versionsOf(c).find(
        (row) => row.sourceVersionId === sourceVersionId && row.sourceId === sourceId,
      );
      return v
        ? {
            sourceVersionId: v.sourceVersionId,
            versionNo: v.versionNo,
            lifecycleState: v.lifecycleState,
            isDefault: v.isDefault,
            rowVersion: v.rowVersion ?? 1,
          }
        : null;
    },
    async nextVersionNo(c, sourceId) {
      const numbers = versionsOf(c)
        .filter((v) => v.sourceId === sourceId)
        .map((v) => v.versionNo);
      return (numbers.length ? Math.max(...numbers) : 0) + 1;
    },
    async insertVersion(c, row) {
      const id = newId();
      const at = now().toISOString();
      versionsOf(c).push({
        sourceVersionId: id,
        sourceId: row.sourceId,
        versionNo: row.versionNo,
        lifecycleState: 'DRAFT',
        isDefault: false,
        configJson: row.configJson,
        configSha256: row.configSha256,
        schemaVersion: row.schemaVersion,
        validatedAt: at,
        validatedBy: row.actorUserId,
        publishedAt: null,
        publishedBy: null,
        createdAt: at,
        createdBy: row.actorUserId,
        updatedAt: at,
        updatedBy: row.actorUserId,
        rowVersion: 1,
      });
      return id;
    },
    async updateVersionConfig(c, row) {
      const v = versionsOf(c).find(
        (item) =>
          item.sourceVersionId === row.sourceVersionId &&
          item.sourceId === row.sourceId &&
          (item.rowVersion ?? 1) === row.rowVersion &&
          item.lifecycleState === 'DRAFT',
      );
      if (!v) return 0;
      const at = now().toISOString();
      Object.assign(v, {
        configJson: row.configJson,
        configSha256: row.configSha256,
        schemaVersion: row.schemaVersion,
        validatedAt: at,
        validatedBy: row.actorUserId,
        updatedAt: at,
        updatedBy: row.actorUserId,
        rowVersion: (v.rowVersion ?? 1) + 1,
      });
      return 1;
    },
    async findVersionReferences(c, sourceVersionId) {
      const forms = tablesOf(c).formVersions;
      return {
        headerRefs: forms.filter((fv) => fv.headerSourceVersionId === sourceVersionId).length,
        lineRefs: forms.filter((fv) => lineRefs(fv, sourceVersionId)).length,
        unverifiable: forms.filter((fv) => schemaOf(fv) !== 'zrv.wf.form/1').length,
        foreignKeys: clone(
          foreignKeys?.() ?? [
            {
              tableName: 'XX_ZRV_WF_FORM_VERSIONS',
              constraintName: 'ZWF_FK_FV_SV',
              deleteRule: 'NO ACTION',
              status: 'ENABLED',
            },
          ],
        ),
      };
    },
    async deleteDraftVersion(c, { sourceId, sourceVersionId, rowVersion }) {
      const tables = tablesOf(c);
      const index = tables.sourceVersions.findIndex(
        (v) =>
          v.sourceVersionId === sourceVersionId &&
          v.sourceId === sourceId &&
          (v.rowVersion ?? 1) === rowVersion &&
          v.lifecycleState === 'DRAFT' &&
          !v.isDefault &&
          !v.publishedAt,
      );
      if (index < 0) return 0;
      if (tables.formVersions.some((fv) => fv.headerSourceVersionId === sourceVersionId)) {
        throw oracleError(
          2292,
          'integrity constraint (XXZP.ZWF_FK_FV_SV) violated - child record found',
        );
      }
      tables.sourceVersions.splice(index, 1);
      return 1;
    },
  };
}

/**
 * The M1 registry functions the M2-A service and the M1 identity update use, over `tablesOf(c)`
 * (same semantics as helpers/workflowManagerFakes.js, including the parent-row lock).
 */
export function createRegistryFakeRepository(tablesOf, { dictionary = [] } = {}) {
  const view = (c, s) => ({
    ...clone(s),
    versionCount: tablesOf(c).sourceVersions.filter((v) => v.sourceId === s.sourceId).length,
  });
  return {
    async findSource(c, sourceId) {
      const s = tablesOf(c).sources.find((row) => row.sourceId === sourceId);
      return s ? view(c, s) : null;
    },
    async lockSource(c, sourceId) {
      await c?.lockRow?.(`SRC:${sourceId}`);
      return tablesOf(c).sources.some((s) => s.sourceId === sourceId) ? sourceId : null;
    },
    async updateSource(c, source) {
      const row = tablesOf(c).sources.find(
        (s) => s.sourceId === source.sourceId && s.rowVersion === source.rowVersion,
      );
      if (!row) return 0;
      Object.assign(row, {
        sourceName: source.sourceName,
        sourceKind: source.sourceKind,
        ownerName: source.ownerName,
        objectName: source.objectName,
        handlerCode: source.handlerCode,
        updatedBy: source.actorUserId,
        rowVersion: row.rowVersion + 1,
      });
      return 1;
    },
    async findDictionaryObject(_c, { ownerName, objectName }) {
      return dictionary.filter((o) => o.ownerName === ownerName && o.objectName === objectName);
    },
  };
}

/**
 * Wraps every function of a repository: records the call name, can fail the next call of a name
 * with an Oracle-like error, and can pause it at a gate (see createLockingDb).
 */
export function instrument(repository, { calls = [], failures = new Set(), gates } = {}) {
  return Object.fromEntries(
    Object.entries(repository).map(([name, fn]) => [
      name,
      async (...args) => {
        calls.push(name);
        if (failures.has(name)) {
          failures.delete(name);
          throw oracleError(3113, 'end-of-file on communication channel');
        }
        await gates?.pass(name);
        return fn(...args);
      },
    ]),
  );
}

// ------------------------------------------------------------------------------- dictionary

const col = (name, oracleType, extra = {}) => ({
  columnId: extra.columnId ?? null,
  name,
  oracleType,
  dataLength: extra.dataLength ?? (oracleType === 'NUMBER' ? 22 : 100),
  charLength: extra.charLength ?? (oracleType === 'VARCHAR2' ? 100 : 0),
  precision: extra.precision ?? null,
  scale: extra.scale ?? null,
  nullable: extra.nullable ?? true,
  identity: extra.identity ?? null,
});

/** Synthetic object XXZP.XXZP_DEMO_REQUEST_T (fictional; no real business form). */
export const demoObject = () => ({
  objectType: 'TABLE',
  status: 'VALID',
  columns: [
    col('REQUEST_ID', 'NUMBER', { nullable: false, identity: 'ALWAYS', precision: 19, scale: 0 }),
    col('REQUEST_NO', 'VARCHAR2', { charLength: 30, nullable: false }),
    col('REQUESTER_NO', 'VARCHAR2', { charLength: 30 }),
    col('ORG_ID', 'NUMBER', { precision: 15, scale: 0, nullable: false }),
    col('LINE_NO', 'NUMBER', { precision: 9, scale: 0, nullable: false }),
    col('STATUS', 'VARCHAR2', { charLength: 30 }),
    col('NOTES', 'CLOB'),
    col('PAYLOAD', 'BLOB'),
  ],
  constraints: [
    {
      name: 'XXZP_DEMO_REQUEST_PK',
      type: 'P',
      status: 'ENABLED',
      validated: 'VALIDATED',
      columns: ['REQUEST_ID'],
    },
  ],
  uniqueIndexes: [],
  observations: {},
});

export function createFakeDictionary(seed = {}) {
  const objects = new Map(Object.entries({ 'XXZP.XXZP_DEMO_REQUEST_T': demoObject(), ...seed }));
  const statements = [];
  const stats = { connections: 0, rollbacks: 0, observations: 0 };
  const failures = new Set();
  const get = (owner, objectName) => objects.get(`${owner}.${objectName}`) ?? null;

  const repository = {
    async findObjects(_c, { owner, objectName }) {
      const o = get(owner, objectName);
      return o ? [{ objectType: o.objectType, status: o.status }] : [];
    },
    async listColumns(_c, { owner, objectName }) {
      return clone(get(owner, objectName)?.columns ?? []);
    },
    async listKeyConstraints(_c, { owner, objectName }) {
      return clone(get(owner, objectName)?.constraints ?? []);
    },
    async listUniqueIndexes(_c, { owner, objectName }) {
      return clone(get(owner, objectName)?.uniqueIndexes ?? []);
    },
    async observeKeyUniqueness(_c, { owner, objectName, columns }) {
      stats.observations += 1;
      if (failures.delete('observe')) {
        throw Object.assign(new Error('NJS-123: call timeout of 15000 ms exceeded'), {
          code: 'NJS-123',
        });
      }
      return clone(
        get(owner, objectName)?.observations?.[columns.join(',')] ?? {
          rowCount: 12,
          nullKeyRows: 0,
          duplicateKeyGroups: 0,
        },
      );
    },
  };
  const withConnection = async (_pool, work) => {
    stats.connections += 1;
    const connection = {
      callTimeout: 0,
      async execute(sql) {
        statements.push(sql);
        return { rows: [] };
      },
      async rollback() {
        stats.rollbacks += 1;
      },
    };
    return work(connection);
  };
  const service = createDictionaryService({
    repository,
    withConnection,
    now: () => new Date('2026-11-09T08:00:00.000Z'),
  });
  return {
    service,
    objects,
    statements,
    stats,
    object: (key = 'XXZP.XXZP_DEMO_REQUEST_T') => objects.get(key),
    failNext: (name) => failures.add(name),
  };
}

// ------------------------------------------------------------------------------- locking db

const KEYS = Object.freeze({
  sources: 'sourceId',
  sourceVersions: 'sourceVersionId',
  formVersions: 'formVersionId',
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Async mutexes keyed by row; a holder (transaction) re-entering its own lock passes. */
function createLocks() {
  const held = new Map(); // key → { owner, queue: [resolve] }
  return {
    async acquire(key, owner) {
      for (;;) {
        const lock = held.get(key);
        if (!lock) {
          held.set(key, { owner, queue: [] });
          return;
        }
        if (lock.owner === owner) return;
        await new Promise((resolve) => lock.queue.push(resolve));
      }
    },
    releaseAll(owner) {
      for (const [key, lock] of [...held]) {
        if (lock.owner !== owner) continue;
        held.delete(key);
        for (const resolve of lock.queue) resolve();
      }
    },
    isHeld: (key) => held.has(key),
  };
}

/** Pauses the next call of a repository function until released. */
function createGates() {
  const gates = new Map();
  return {
    gate(name) {
      let release;
      let reached;
      const gate = {
        reached: new Promise((resolve) => {
          reached = resolve;
        }),
        open: new Promise((resolve) => {
          release = resolve;
        }),
      };
      gates.set(name, { ...gate, signal: reached });
      return { reached: gate.reached, release: () => release() };
    },
    async pass(name) {
      const gate = gates.get(name);
      if (!gate) return;
      gates.delete(name);
      gate.signal();
      await gate.open;
    },
  };
}

function diffApply(committed, base, working) {
  for (const [table, key] of Object.entries(KEYS)) {
    const before = new Map(base[table].map((row) => [row[key], row]));
    const after = new Map(working[table].map((row) => [row[key], row]));
    for (const [id, row] of after) {
      const old = before.get(id);
      if (old && JSON.stringify(old) === JSON.stringify(row)) continue;
      const index = committed[table].findIndex((item) => item[key] === id);
      if (index >= 0) committed[table][index] = clone(row);
      else committed[table].push(clone(row));
    }
    for (const id of before.keys()) {
      if (after.has(id)) continue;
      const index = committed[table].findIndex((item) => item[key] === id);
      if (index >= 0) committed[table].splice(index, 1);
    }
  }
}

function checkConstraints(tables) {
  const seen = new Set();
  for (const v of tables.sourceVersions) {
    const key = `${v.sourceId}:${v.versionNo}`;
    if (seen.has(key)) {
      throw oracleError(1, 'unique constraint (XXZP.ZWF_UQ_SV_1) violated');
    }
    seen.add(key);
  }
  const ids = new Set(tables.sourceVersions.map((v) => v.sourceVersionId));
  for (const fv of tables.formVersions) {
    if (!ids.has(fv.headerSourceVersionId)) {
      throw oracleError(
        2291,
        'integrity constraint (XXZP.ZWF_FK_FV_SV) violated - parent key not found',
      );
    }
  }
}

export function createLockingDb(initial = emptyTables()) {
  const committed = clone(initial);
  const locks = createLocks();
  const gates = createGates();
  let txCounter = 0;
  const stats = { commits: 0, rollbacks: 0 };

  const connectionFor = (tx) => {
    const c = {
      tx,
      // Statement-level READ COMMITTED: after a lock wait, a transaction without own writes sees
      // the latest committed state.
      async lockRow(key) {
        await tick();
        await locks.acquire(key, tx.id);
        if (JSON.stringify(tx.base) === JSON.stringify(tx.working)) {
          tx.base = clone(committed);
          tx.working = clone(committed);
        }
      },
    };
    return c;
  };

  return {
    committed,
    locks,
    stats,
    gate: (name) => gates.gate(name),
    gates,
    /** Tables of a connection: the transaction's working copy, or committed rows outside one. */
    tablesOf: (c) => (c?.tx ? c.tx.working : committed),
    withConnection: async (_pool, work) => work({}),
    async withTransaction(_pool, work) {
      const tx = { id: ++txCounter, base: clone(committed), working: clone(committed) };
      const connection = connectionFor(tx);
      try {
        const result = await work(connection);
        await tick();
        const next = clone(committed);
        diffApply(next, tx.base, tx.working);
        checkConstraints(next);
        diffApply(committed, tx.base, tx.working);
        stats.commits += 1;
        return result;
      } catch (error) {
        stats.rollbacks += 1;
        throw error;
      } finally {
        locks.releaseAll(tx.id);
      }
    },
  };
}
