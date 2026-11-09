import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger as defaultLogger } from '../../shared/logger/index.js';
import { sourceHandlerRegistry as defaultHandlerRegistry } from './integrations/index.js';
import { sha256Hex } from './mapping/canonicalJson.js';
import {
  compareColumns,
  createDictionaryService,
  DictionaryError,
} from './mapping/dictionary.service.js';
import { createFindings, freezeBlockers, sortFindings } from './mapping/findings.js';
import { assessKeyCandidate, ENFORCEMENT } from './mapping/keyAssurance.js';
import { checkSourceDrift, prepareSourceVersion, SOURCE_SCHEMA } from './mapping/sourceContract.js';
import { describeOracleType, FAMILIES, keyIneligibility } from './mapping/typeCompatibility.js';
import * as defaultRepository from './sourceMapping.repository.js';
import * as defaultRegistryRepository from './workflowManager.repository.js';
import { isLockTimeout, sourceBusy } from './workflowManager.service.js';

/*
 * Workflow Manager M2-A — source version mapping. `authorize` has already checked
 * WORKFLOW_MANAGER.SOURCE_MAPPING:<action> and DATA_SOURCE_REGISTRY:VIEW; these rules apply on top:
 *
 *   - The M2-0 contract is the only schema: prepareSourceVersion() validates the author draft and
 *     derives every fact (dictionary columns, enforcement, observations, attestation), producing
 *     canonical CONFIG_JSON and its SHA-256. Only VALID configurations are ever stored.
 *   - Writes create or change DRAFT versions only (IS_DEFAULT 'N', no publication fields).
 *     Versions in any other state are read-only here; they can be cloned into a new DRAFT.
 *   - Expensive read-only evidence (dictionary snapshot, aggregate uniqueness observations) is
 *     gathered BEFORE the write transaction on separate READ ONLY connections. The write
 *     transaction then locks the parent data source row (the lock M1 identity changes also take),
 *     re-reads the source, refuses if its identity changed since the evidence was taken, and
 *     re-derives the configuration from the locked row before writing.
 *   - VERSION_NO = MAX + 1 under that lock, backed by the unique key (SOURCE_ID, VERSION_NO).
 *   - Delete is restricted to an unreferenced DRAFT: version row lock, structural dependency
 *     checks, a fail-closed rule for unreadable configurations and non-restricting foreign keys,
 *     and the enforced FK itself (ORA-02292) as the final guard.
 *   - Responses carry dictionary facts and aggregate counts only — never business rows.
 */
const STATE = Object.freeze({ DRAFT: 'DRAFT' });
// The documented FK of HEADER_SOURCE_VERSION_ID (references counted explicitly on delete).
const FORM_VERSIONS_TABLE = 'XX_ZRV_WF_FORM_VERSIONS';
const ORA = Object.freeze({ UNIQUE: 1, CHILD_FOUND: 2292 });
const CALL_TIMEOUT = /^(NJS-123|DPI-1067)\b/;

const notFound = (what) => new AppError(404, 'RESOURCE_NOT_FOUND', `${what} not found`);
const versionNotFound = () => notFound('Source version');
const stale = () =>
  new AppError(
    409,
    'STALE_RECORD',
    'The source version was changed by someone else. Reload it and apply your change again.',
  );
const notDraft = () =>
  new AppError(
    409,
    'SOURCE_VERSION_NOT_DRAFT',
    'Only DRAFT source versions can be changed or deleted. Clone this version to start a new draft.',
  );
const identityChanged = () =>
  new AppError(
    409,
    'SOURCE_IDENTITY_CHANGED',
    'The data source object changed while the mapping was being validated. Reload and try again.',
  );
const versionConflict = () =>
  new AppError(
    409,
    'SOURCE_VERSION_CONFLICT',
    'Another source version was created at the same time. Reload and try again.',
  );
const referenced = () =>
  new AppError(
    409,
    'SOURCE_VERSION_REFERENCED',
    'This source version is used by a form mapping and cannot be deleted.',
  );
const dependencyUnverified = () =>
  new AppError(
    409,
    'SOURCE_VERSION_DEPENDENCY_UNVERIFIED',
    'The references to this source version cannot be verified safely, so it was not deleted.',
  );
const immutable = () =>
  new AppError(
    409,
    'SOURCE_VERSION_IMMUTABLE',
    'The database refused the change because the source version is no longer a draft.',
  );
const dictionaryTimeout = () =>
  new AppError(
    503,
    'DICTIONARY_TIMEOUT',
    'The database dictionary did not answer in time. Try again later.',
  );

const findingDetails = (findings) =>
  findings.map((f) => ({ field: f.path, message: f.message, code: f.code, severity: f.severity }));

const mappingInvalid = (prepared) =>
  new AppError(
    400,
    'SOURCE_MAPPING_INVALID',
    'The source mapping is not valid. Correct the errors and save again.',
    findingDetails(prepared.findings),
  );

const revalidationFailed = (prepared) =>
  new AppError(
    409,
    'SOURCE_VERSION_REVALIDATION_FAILED',
    'The draft no longer validates against the live source. It was left unchanged.',
    findingDetails(prepared.findings),
  );

const sourceUnavailable = (code) =>
  new AppError(
    409,
    'SOURCE_OBJECT_UNAVAILABLE',
    'The registered source object cannot be inspected in the database dictionary.',
    [{ field: 'source', message: DICTIONARY_MESSAGES[code] ?? code, code, severity: 'ERROR' }],
  );

const DICTIONARY_MESSAGES = Object.freeze({
  OBJECT_NOT_ALLOWED: 'The object is outside the source allowlist',
  OBJECT_NOT_FOUND: 'The object no longer exists',
  OBJECT_TYPE_MISMATCH: 'The object is no longer of the registered type',
  OBJECT_INVALID: 'The object is not VALID',
  COLUMN_NOT_FOUND: 'A key column no longer exists',
  KEY_COLUMNS_INVALID: 'A key column name is invalid',
});

const isCallTimeout = (error) =>
  error?.errorNum === 3156 || CALL_TIMEOUT.test(String(error?.code ?? error?.message ?? ''));

const sameIdentity = (a, b) =>
  a.sourceKind === b.sourceKind &&
  (a.ownerName ?? null) === (b.ownerName ?? null) &&
  (a.objectName ?? null) === (b.objectName ?? null) &&
  (a.handlerCode ?? null) === (b.handlerCode ?? null);

/** Author choices of a stored config (the only input a clone or revalidation re-submits). */
export function authorDraftOf(config) {
  return {
    columns: (config?.columns ?? []).map((column) => ({
      name: column.name,
      exposed: column.exposed,
      dataClass: column.dataClass,
    })),
    keyCandidates: (config?.keyCandidates ?? []).map((key) => ({
      code: key.code,
      columns: [...key.columns],
      assurance: key.assurance
        ? {
            basis: key.assurance.basis,
            evidenceRef: key.assurance.evidenceRef,
            rationale: key.assurance.rationale,
          }
        : null,
    })),
  };
}

/** Publication blockers implied by a stored config (the same rules as prepareSourceVersion). */
export function storedBlockers(config, source) {
  const blockers = [];
  if (source?.isActive === false) blockers.push({ code: 'SOURCE_INACTIVE', path: 'source' });
  (config?.keyCandidates ?? []).forEach((key, index) => {
    if (key.enforcement === ENFORCEMENT.DECLARED) {
      blockers.push({ code: 'PROVISIONAL_KEY', path: `keyCandidates[${index}]` });
    }
  });
  return freezeBlockers(blockers);
}

const sourceSummary = (source) => ({
  sourceId: source.sourceId,
  sourceCode: source.sourceCode,
  sourceName: source.sourceName,
  sourceKind: source.sourceKind,
  ownerName: source.ownerName ?? null,
  objectName: source.objectName ?? null,
  handlerCode: source.handlerCode ?? null,
  isActive: source.isActive,
  rowVersion: source.rowVersion,
});

const versionSummary = (version) => ({
  sourceVersionId: version.sourceVersionId,
  sourceId: version.sourceId,
  versionNo: version.versionNo,
  lifecycleState: version.lifecycleState,
  isDefault: version.isDefault,
  configSha256: version.configSha256,
  schemaVersion: version.schemaVersion,
  validatedAt: version.validatedAt,
  validatedBy: version.validatedBy,
  publishedAt: version.publishedAt,
  createdAt: version.createdAt,
  createdBy: version.createdBy,
  updatedAt: version.updatedAt,
  updatedBy: version.updatedBy,
  rowVersion: version.rowVersion,
  editable: version.lifecycleState === STATE.DRAFT,
});

/**
 * Stored CONFIG_JSON → { config, configIntegrity }: VERIFIED when it parses as zrv.wf.source/1 and
 * its SHA-256 equals CONFIG_SHA256; MISMATCH when it parses but the fingerprint differs;
 * UNREADABLE otherwise (config null). A non-VERIFIED config is never used as evidence.
 */
function readStoredConfig(version) {
  if (typeof version.configJson !== 'string')
    return { config: null, configIntegrity: 'UNREADABLE' };
  let config;
  try {
    config = JSON.parse(version.configJson);
  } catch {
    return { config: null, configIntegrity: 'UNREADABLE' };
  }
  if (config?.schema !== SOURCE_SCHEMA || !Array.isArray(config.columns)) {
    return { config: null, configIntegrity: 'UNREADABLE' };
  }
  const verified = sha256Hex(version.configJson) === version.configSha256;
  return { config, configIntegrity: verified ? 'VERIFIED' : 'MISMATCH' };
}

const snapshotView = (snapshot) => ({
  objectType: snapshot.objectType,
  status: snapshot.status,
  capturedAt: snapshot.capturedAt,
  columnsSha256: snapshot.columnsSha256,
  columns: snapshot.columns.map((column) => ({
    ...column,
    supported: describeOracleType(column).family !== FAMILIES.UNSUPPORTED,
    keyEligible: !keyIneligibility(column),
  })),
  constraints: snapshot.constraints.map((c) => ({
    name: c.name,
    type: c.type,
    status: c.status,
    validated: c.validated,
    columns: [...c.columns],
  })),
  uniqueIndexes: snapshot.uniqueIndexes.map((i) => ({
    name: i.name,
    status: i.status,
    functionBased: i.functionBased,
    columns: [...i.columns],
  })),
});

export function createSourceMappingService({
  repository = defaultRepository,
  registryRepository = defaultRegistryRepository,
  dictionaryService,
  handlerRegistry = defaultHandlerRegistry,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  logger = defaultLogger,
  now = () => new Date(),
} = {}) {
  const dictionary = dictionaryService ?? createDictionaryService({ withConnection });
  const read = (work) => withConnection(POOLS.LOW, work);

  const audit = (event, fields) =>
    logger.info({ event, ...fields }, 'Workflow source mapping changed');

  async function requireSource(sourceId) {
    const source = await read((c) => registryRepository.findSource(c, sourceId));
    if (!source) throw notFound('Data source');
    return source;
  }

  async function requireVersion(sourceId, sourceVersionId) {
    return read(async (c) => {
      const source = await registryRepository.findSource(c, sourceId);
      if (!source) throw notFound('Data source');
      const version = await repository.findVersion(c, { sourceId, sourceVersionId });
      if (!version) throw versionNotFound();
      return { source, version, ...readStoredConfig(version) };
    });
  }

  const objectOf = (source) => ({
    owner: source.ownerName,
    objectName: source.objectName,
    objectType: source.sourceKind,
  });

  /** Runs a dictionary call; DictionaryError → 409 SOURCE_OBJECT_UNAVAILABLE, timeout → 503. */
  async function inspect(work) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof DictionaryError) throw sourceUnavailable(error.code);
      if (isCallTimeout(error)) throw dictionaryTimeout();
      throw error;
    }
  }

  /**
   * Read-only evidence for a draft: the live snapshot and an aggregate uniqueness observation for
   * every key candidate the database does not enforce (and whose columns are eligible). HANDLER
   * sources have no dictionary evidence. Runs outside any write transaction.
   */
  async function gatherEvidence(source, draft) {
    if (source.sourceKind === 'HANDLER') return { snapshot: null, observations: {} };
    const snapshot = await inspect(() => dictionary.snapshot(objectOf(source)));
    const observations = {};
    const live = new Map(snapshot.columns.map((column) => [column.name, column]));
    for (const candidate of draft?.keyCandidates ?? []) {
      const assessment = assessKeyCandidate(candidate, snapshot);
      const observable =
        assessment.enforcement === ENFORCEMENT.DECLARED &&
        candidate.columns.every((name) => live.has(name) && !keyIneligibility(live.get(name)));
      if (observable) {
        observations[candidate.code] = await inspect(() =>
          dictionary.observeKeyUniqueness({ ...objectOf(source), columns: candidate.columns }),
        );
      }
    }
    return { snapshot, observations };
  }

  const prepare = (draft, source, evidence, actor, previousConfig = null) =>
    prepareSourceVersion({
      draft,
      registeredSource: source,
      snapshot: evidence.snapshot,
      handlerRegistry,
      observations: evidence.observations,
      previousConfig,
      actor,
      now: now(),
    });

  /**
   * Write transaction on the locked parent source: re-reads the source, refuses an identity that
   * changed since the evidence was taken, re-derives the configuration from the locked row (it
   * must still be valid) and hands it to `write`. Oracle errors become stable, safe codes.
   */
  async function writeLocked(sourceId, validatedSource, derive, write) {
    try {
      return await withTransaction(POOLS.LOW, async (c) => {
        if (!(await registryRepository.lockSource(c, sourceId))) throw notFound('Data source');
        const current = await registryRepository.findSource(c, sourceId);
        if (!current) throw notFound('Data source');
        if (!sameIdentity(current, validatedSource)) throw identityChanged();
        const prepared = derive ? derive(current) : null;
        if (prepared && !prepared.valid) throw mappingInvalid(prepared);
        return write(c, current, prepared);
      });
    } catch (error) {
      if (isLockTimeout(error)) throw sourceBusy();
      if (error?.errorNum === ORA.UNIQUE) throw versionConflict();
      if (error?.errorNum === ORA.CHILD_FOUND) throw referenced();
      if (error?.errorNum >= 20000 && error?.errorNum <= 20999) throw immutable();
      throw error;
    }
  }

  async function detail(sourceId, sourceVersionId) {
    const { source, version, config, configIntegrity } = await requireVersion(
      sourceId,
      sourceVersionId,
    );
    return {
      source: sourceSummary(source),
      version: {
        ...versionSummary(version),
        createdByName: version.createdByName,
        updatedByName: version.updatedByName,
        validatedByName: version.validatedByName,
        configIntegrity,
        config,
        publicationBlockers: storedBlockers(config, source),
      },
    };
  }

  const validationOf = (prepared) => ({
    valid: prepared.valid,
    findings: prepared.findings,
    publicationBlockers: prepared.publicationBlockers,
  });

  /** Inserts a new DRAFT from author choices (create and clone). */
  async function insertDraft(actor, sourceId, draft, event, extra = {}) {
    const source = await requireSource(sourceId);
    const evidence = await gatherEvidence(source, draft);
    const prepared = prepare(draft, source, evidence, actor);
    if (!prepared.valid) throw mappingInvalid(prepared);
    const { sourceVersionId, versionNo, final } = await writeLocked(
      sourceId,
      source,
      (current) => prepare(draft, current, evidence, actor),
      async (c, _current, locked) => {
        const nextNo = await repository.nextVersionNo(c, sourceId);
        const id = await repository.insertVersion(c, {
          sourceId,
          versionNo: nextNo,
          configJson: locked.configJson,
          configSha256: locked.configSha256,
          schemaVersion: locked.schemaVersion,
          actorUserId: actor.userId,
        });
        return { sourceVersionId: id, versionNo: nextNo, final: locked };
      },
    );
    audit(event, {
      sourceId,
      sourceVersionId,
      versionNo,
      configSha256: final.configSha256,
      actorUserId: actor.userId,
      ...extra,
    });
    return { ...(await detail(sourceId, sourceVersionId)), validation: validationOf(final) };
  }

  /** Replaces a DRAFT's configuration (update and revalidate). */
  async function replaceDraft(actor, sourceId, sourceVersionId, rowVersion, draft, onInvalid) {
    const { source, version, config } = await requireVersion(sourceId, sourceVersionId);
    if (version.lifecycleState !== STATE.DRAFT) throw notDraft();
    if (version.rowVersion !== rowVersion) throw stale();
    const evidence = await gatherEvidence(source, draft);
    const prepared = prepare(draft, source, evidence, actor, config);
    if (!prepared.valid) throw onInvalid(prepared);
    return writeLocked(
      sourceId,
      source,
      (current) => prepare(draft, current, evidence, actor, config),
      async (c, _current, locked) => {
        const changed = await repository.updateVersionConfig(c, {
          sourceId,
          sourceVersionId,
          rowVersion,
          configJson: locked.configJson,
          configSha256: locked.configSha256,
          schemaVersion: locked.schemaVersion,
          actorUserId: actor.userId,
        });
        if (changed) return locked;
        const latest = await repository.findVersion(c, { sourceId, sourceVersionId });
        if (!latest) throw versionNotFound();
        if (latest.lifecycleState !== STATE.DRAFT) throw notDraft();
        throw stale();
      },
    );
  }

  /** Drift of a stored config against the live dictionary (or handler contract). */
  async function driftFindings(source, config) {
    const findings = createFindings();
    let current = null;
    let handler = null;
    if (config.source?.kind === 'HANDLER') {
      const contract = handlerRegistry?.contract(config.source.handlerCode) ?? null;
      if (!contract) {
        findings.error(
          'SOURCE_HANDLER_NOT_REGISTERED',
          'handler',
          'The source handler is not registered on the server',
        );
      } else {
        handler = { code: contract.code, contractVersion: contract.contractVersion };
        if (contract.contractVersion !== config.handler?.contractVersion) {
          findings.error(
            'HANDLER_CONTRACT_CHANGED',
            'handler',
            'The handler contract version changed',
          );
        }
        for (const f of compareColumns(config.columns ?? [], contract.fields)) {
          findings.error(f.code, f.path, f.message);
        }
      }
      return { findings: sortFindings(findings.list()), current, handler };
    }
    let snapshot;
    try {
      snapshot = await dictionary.snapshot(objectOf(source));
    } catch (error) {
      if (!(error instanceof DictionaryError)) {
        if (isCallTimeout(error)) throw dictionaryTimeout();
        throw error;
      }
      findings.error(error.code, 'dictionary', DICTIONARY_MESSAGES[error.code] ?? error.code);
      return { findings: sortFindings(findings.list()), current, handler };
    }
    current = {
      objectType: snapshot.objectType,
      status: snapshot.status,
      capturedAt: snapshot.capturedAt,
      columnsSha256: snapshot.columnsSha256,
    };
    const drift = checkSourceDrift(config, snapshot);
    for (const f of drift.findings) findings.error(f.code, f.path, f.message);
    (config.keyCandidates ?? []).forEach((key, index) => {
      if (key.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) return;
      const at = `keyCandidates[${index}]`;
      const assessment = assessKeyCandidate(key, snapshot, at);
      if (assessment.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) {
        findings.error(
          'KEY_ENFORCEMENT_LOST',
          at,
          `${key.enforcedBy?.name ?? 'The constraint'} no longer enforces key ${key.code}`,
        );
      } else if (assessment.enforcedBy?.name !== key.enforcedBy?.name) {
        findings.warning(
          'KEY_ENFORCEMENT_CHANGED',
          at,
          `Key ${key.code} is now enforced by ${assessment.enforcedBy.name}`,
        );
      }
    });
    if (
      config.dictionary?.columnsSha256 &&
      config.dictionary.columnsSha256 !== snapshot.columnsSha256
    ) {
      findings.warning(
        'DICTIONARY_FINGERPRINT_CHANGED',
        'dictionary',
        'The object columns changed since validation (added columns are not exposed)',
      );
    }
    return { findings: sortFindings(findings.list()), current, handler };
  }

  return Object.freeze({
    /** Live dictionary facts of a registered source (no data), or its handler contract. */
    async dictionary(sourceId) {
      const source = await requireSource(sourceId);
      const base = { source: sourceSummary(source), snapshot: null, handler: null };
      if (source.sourceKind === 'HANDLER') {
        const contract = handlerRegistry?.contract(source.handlerCode) ?? null;
        if (!contract) {
          return {
            ...base,
            available: false,
            findings: [
              {
                severity: 'ERROR',
                code: 'SOURCE_HANDLER_NOT_REGISTERED',
                path: 'source',
                message: 'The source handler is not registered on the server',
              },
            ],
          };
        }
        return {
          ...base,
          available: true,
          handler: {
            code: contract.code,
            name: contract.name,
            contractVersion: contract.contractVersion,
            fields: contract.fields.map((field) => ({
              ...field,
              supported: true,
              keyEligible: !keyIneligibility(field),
            })),
          },
          findings: [],
        };
      }
      try {
        const snapshot = await dictionary.snapshot(objectOf(source));
        return { ...base, available: true, snapshot: snapshotView(snapshot), findings: [] };
      } catch (error) {
        if (!(error instanceof DictionaryError)) {
          if (isCallTimeout(error)) throw dictionaryTimeout();
          throw error;
        }
        return {
          ...base,
          available: false,
          findings: [
            {
              severity: 'ERROR',
              code: error.code,
              path: 'source',
              message: DICTIONARY_MESSAGES[error.code] ?? error.code,
            },
          ],
        };
      }
    },

    async listVersions(sourceId, { page, pageSize }) {
      return read(async (c) => {
        if (!(await registryRepository.findSource(c, sourceId))) throw notFound('Data source');
        const { total, items } = await repository.listVersions(c, {
          sourceId,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        return { total, items: items.map(versionSummary) };
      });
    },

    getVersion: detail,

    createVersion(actor, sourceId, { draft }) {
      return insertDraft(actor, sourceId, draft, 'WORKFLOW_SOURCE_VERSION_CREATED');
    },

    async updateVersion(actor, sourceId, sourceVersionId, { rowVersion, draft }) {
      const final = await replaceDraft(
        actor,
        sourceId,
        sourceVersionId,
        rowVersion,
        draft,
        mappingInvalid,
      );
      audit('WORKFLOW_SOURCE_VERSION_UPDATED', {
        sourceId,
        sourceVersionId,
        configSha256: final.configSha256,
        actorUserId: actor.userId,
      });
      return { ...(await detail(sourceId, sourceVersionId)), validation: validationOf(final) };
    },

    /**
     * Re-validates a stored DRAFT against the live source with fresh evidence. On failure nothing
     * is written (409 with the findings), so a previously valid draft is never corrupted.
     */
    async revalidateVersion(actor, sourceId, sourceVersionId, { rowVersion }) {
      const { version, config, configIntegrity } = await requireVersion(sourceId, sourceVersionId);
      if (version.lifecycleState !== STATE.DRAFT) throw notDraft();
      if (!config) {
        throw revalidationFailed({
          findings: [
            {
              severity: 'ERROR',
              code: 'CONFIG_UNREADABLE',
              path: '$',
              message: 'The stored configuration cannot be read',
            },
          ],
        });
      }
      const final = await replaceDraft(
        actor,
        sourceId,
        sourceVersionId,
        rowVersion,
        authorDraftOf(config),
        revalidationFailed,
      );
      audit('WORKFLOW_SOURCE_VERSION_REVALIDATED', {
        sourceId,
        sourceVersionId,
        configSha256: final.configSha256,
        previousIntegrity: configIntegrity,
        actorUserId: actor.userId,
      });
      return { ...(await detail(sourceId, sourceVersionId)), validation: validationOf(final) };
    },

    /** Read-only drift check of any version (stored config vs live dictionary/handler). */
    async driftVersion(sourceId, sourceVersionId) {
      const { source, version, config, configIntegrity } = await requireVersion(
        sourceId,
        sourceVersionId,
      );
      const head = {
        sourceVersionId: version.sourceVersionId,
        versionNo: version.versionNo,
        lifecycleState: version.lifecycleState,
        configIntegrity,
        checkedAt: now().toISOString(),
        saved: config
          ? { dictionary: config.dictionary ?? null, handler: config.handler ?? null }
          : null,
      };
      if (!config) {
        return {
          ...head,
          drifted: true,
          current: null,
          handler: null,
          findings: [
            {
              severity: 'ERROR',
              code: 'CONFIG_UNREADABLE',
              path: '$',
              message: 'The stored configuration cannot be read',
            },
          ],
        };
      }
      const { findings, current, handler } = await driftFindings(source, config);
      const all = [...findings];
      if (configIntegrity === 'MISMATCH') {
        all.unshift({
          severity: 'ERROR',
          code: 'CONFIG_FINGERPRINT_MISMATCH',
          path: '$',
          message: 'The stored configuration does not match its fingerprint',
        });
      }
      const ordered = sortFindings(all);
      return {
        ...head,
        drifted: ordered.some((f) => f.severity === 'ERROR'),
        current,
        handler,
        findings: ordered,
      };
    },

    /**
     * New DRAFT from any version of the same source. The origin is only read. Evidence and key
     * attestations are taken fresh (attested by the cloning user now), and the clone must validate.
     */
    async cloneVersion(actor, sourceId, sourceVersionId) {
      const { source, version, config, configIntegrity } = await requireVersion(
        sourceId,
        sourceVersionId,
      );
      if (!config || configIntegrity !== 'VERIFIED') {
        throw new AppError(
          409,
          'SOURCE_VERSION_UNREADABLE',
          'The stored configuration of this version cannot be verified, so it cannot be cloned.',
        );
      }
      const ownIdentity =
        config.source?.sourceCode === source.sourceCode &&
        config.source?.kind === source.sourceKind &&
        (config.source?.owner ?? null) ===
          (source.sourceKind === 'HANDLER' ? null : source.ownerName) &&
        (config.source?.object ?? null) ===
          (source.sourceKind === 'HANDLER' ? null : source.objectName);
      if (!ownIdentity) throw identityChanged();
      return insertDraft(actor, sourceId, authorDraftOf(config), 'WORKFLOW_SOURCE_VERSION_CLONED', {
        clonedFromVersionId: version.sourceVersionId,
      });
    },

    /** Deletes an unreferenced DRAFT (restricted delete; fail closed on any doubt). */
    async deleteVersion(actor, sourceId, sourceVersionId, { rowVersion }) {
      const source = await requireSource(sourceId);
      let versionNo = null;
      await writeLocked(sourceId, source, null, async (c) => {
        const locked = await repository.lockVersion(c, { sourceId, sourceVersionId });
        if (!locked) throw versionNotFound();
        if (locked.lifecycleState !== STATE.DRAFT || locked.isDefault) throw notDraft();
        if (locked.rowVersion !== rowVersion) throw stale();
        const refs = await repository.findVersionReferences(c, sourceVersionId);
        if (refs.headerRefs > 0 || refs.lineRefs > 0) throw referenced();
        // Fail closed: the known header FK must be visible (otherwise the dictionary cannot be
        // trusted to show the others), and no visible FK may cascade or, for a table whose
        // references are not counted above, be disabled.
        const headerKeyVisible = refs.foreignKeys.some(
          (key) => key.tableName === FORM_VERSIONS_TABLE,
        );
        const unsafeKey = refs.foreignKeys.some(
          (key) =>
            key.deleteRule !== 'NO ACTION' ||
            (key.status !== 'ENABLED' && key.tableName !== FORM_VERSIONS_TABLE),
        );
        if (refs.unverifiable > 0 || unsafeKey || !headerKeyVisible) throw dependencyUnverified();
        versionNo = locked.versionNo;
        const deleted = await repository.deleteDraftVersion(c, {
          sourceId,
          sourceVersionId,
          rowVersion,
        });
        if (!deleted) throw stale();
      });
      audit('WORKFLOW_SOURCE_VERSION_DELETED', {
        sourceId,
        sourceVersionId,
        versionNo,
        actorUserId: actor.userId,
      });
      return { sourceId, sourceVersionId, deleted: true };
    },
  });
}
