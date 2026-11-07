import { POOLS, withConnection as defaultWithConnection } from '../../../database/oracle.js';
import {
  ALLOWED_SOURCE_OWNERS,
  isProtectedObjectName,
  PROTECTED_OBJECT_PREFIXES,
} from '../workflowManager.catalog.js';
import { fingerprint } from './canonicalJson.js';
import { isOracleIdentifier } from './identifiers.js';
import * as defaultRepository from './dictionary.repository.js';

/*
 * Dictionary snapshots, drift detection and key evidence for mapping validation.
 *
 * Security invariants:
 *   - Only objects of an allowlisted owner (M1 ALLOWED_SOURCE_OWNERS), outside the protected
 *     XX_ZRV_ prefix, with valid Oracle names, are ever inspected (OBJECT_NOT_ALLOWED otherwise).
 *   - Every call runs on the LOW pool inside SET TRANSACTION READ ONLY with a call timeout and is
 *     rolled back: Oracle itself refuses any write attempted on that connection.
 *   - Key columns are confirmed in the live dictionary before the aggregate uniqueness query.
 */
export class DictionaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DictionaryError';
    this.code = code;
  }
}

export const OBJECT_TYPES = Object.freeze(['TABLE', 'VIEW']);
const COMPARED = Object.freeze([
  'oracleType',
  'dataLength',
  'charLength',
  'precision',
  'scale',
  'nullable',
  'identity',
]);

/** Dictionary column without its position: what a source version snapshots and compares. */
export const normalizeColumn = (column) => ({
  name: column.name,
  oracleType: column.oracleType,
  dataLength: column.dataLength ?? null,
  charLength: column.charLength ? column.charLength : null,
  precision: column.precision ?? null,
  scale: column.scale ?? null,
  nullable: column.nullable !== false,
  identity: column.identity ?? null,
});

/**
 * Drift between columns saved in a source version and the live dictionary: COLUMN_MISSING when a
 * saved column no longer exists, COLUMN_CHANGED when any datatype attribute differs. Columns added
 * to the object since the snapshot are not drift (they are simply not allowlisted).
 */
export function compareColumns(savedColumns, liveColumns, path = 'columns') {
  const live = new Map(liveColumns.map((column) => [column.name, normalizeColumn(column)]));
  const findings = [];
  savedColumns.forEach((saved, index) => {
    const current = live.get(saved.name);
    const at = `${path}[${index}]`;
    if (!current) {
      findings.push({
        severity: 'ERROR',
        code: 'COLUMN_MISSING',
        path: at,
        message: `Column ${saved.name} no longer exists`,
      });
      return;
    }
    const changed = COMPARED.filter((key) => (saved[key] ?? null) !== current[key]);
    if (changed.length) {
      findings.push({
        severity: 'ERROR',
        code: 'COLUMN_CHANGED',
        path: at,
        message: `Column ${saved.name} changed: ${changed.join(', ')}`,
      });
    }
  });
  return findings;
}

export function createDictionaryService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  now = () => new Date(),
  allowedOwners = ALLOWED_SOURCE_OWNERS,
  callTimeoutMs = 15000,
} = {}) {
  function authorizeObject(owner, objectName) {
    if (!isOracleIdentifier(owner) || !isOracleIdentifier(objectName)) {
      throw new DictionaryError('OBJECT_NOT_ALLOWED', 'Owner and object must be Oracle names');
    }
    if (!allowedOwners.includes(owner)) {
      throw new DictionaryError('OBJECT_NOT_ALLOWED', 'The owner is not on the source allowlist');
    }
    if (isProtectedObjectName(objectName)) {
      throw new DictionaryError(
        'OBJECT_NOT_ALLOWED',
        `Objects starting with ${PROTECTED_OBJECT_PREFIXES.join(', ')} cannot be sources`,
      );
    }
  }

  const readOnly = (work) =>
    withConnection(POOLS.LOW, async (connection) => {
      await connection.execute('SET TRANSACTION READ ONLY');
      const previousTimeout = connection.callTimeout;
      connection.callTimeout = callTimeoutMs;
      try {
        return await work(connection);
      } finally {
        connection.callTimeout = previousTimeout;
        await connection.rollback();
      }
    });

  async function requireObject(connection, { owner, objectName, objectType }) {
    const objects = await repository.findObjects(connection, { owner, objectName });
    if (!objects.length) throw new DictionaryError('OBJECT_NOT_FOUND', 'The object does not exist');
    const match = objects.find((object) => object.objectType === objectType);
    if (!match)
      throw new DictionaryError('OBJECT_TYPE_MISMATCH', `The object is not a ${objectType}`);
    if (match.status !== 'VALID')
      throw new DictionaryError('OBJECT_INVALID', 'The object is not VALID');
    return match;
  }

  return Object.freeze({
    /**
     * Frozen snapshot of an allowlisted TABLE/VIEW: columns, their fingerprint and the key
     * evidence (enabled/validated P/U constraints and unique indexes).
     */
    async snapshot({ owner, objectName, objectType }) {
      if (!OBJECT_TYPES.includes(objectType)) {
        throw new DictionaryError(
          'OBJECT_TYPE_MISMATCH',
          'Only TABLE and VIEW sources are inspected',
        );
      }
      authorizeObject(owner, objectName);
      return readOnly(async (connection) => {
        const object = await requireObject(connection, { owner, objectName, objectType });
        const columns = (await repository.listColumns(connection, { owner, objectName })).map(
          normalizeColumn,
        );
        const constraints = await repository.listKeyConstraints(connection, { owner, objectName });
        const uniqueIndexes = await repository.listUniqueIndexes(connection, { owner, objectName });
        const sorted = [...columns].sort((a, b) => (a.name < b.name ? -1 : 1));
        return Object.freeze({
          owner,
          objectName,
          objectType: object.objectType,
          status: object.status,
          capturedAt: now().toISOString(),
          columns: Object.freeze(columns.map((column) => Object.freeze(column))),
          columnsSha256: fingerprint(sorted).sha256,
          constraints: Object.freeze(constraints.map((c) => Object.freeze({ ...c }))),
          uniqueIndexes: Object.freeze(uniqueIndexes.map((i) => Object.freeze({ ...i }))),
        });
      });
    },

    /**
     * Aggregate, dated uniqueness observation of a key (evidence, never a guarantee). The object
     * is re-verified and every key column must exist in the live dictionary.
     */
    async observeKeyUniqueness({ owner, objectName, objectType, columns }) {
      authorizeObject(owner, objectName);
      if (!Array.isArray(columns) || !columns.length || !columns.every(isOracleIdentifier)) {
        throw new DictionaryError('KEY_COLUMNS_INVALID', 'Key columns must be Oracle names');
      }
      return readOnly(async (connection) => {
        await requireObject(connection, { owner, objectName, objectType });
        const live = new Set(
          (await repository.listColumns(connection, { owner, objectName })).map((c) => c.name),
        );
        const missing = columns.filter((name) => !live.has(name));
        if (missing.length) {
          throw new DictionaryError('COLUMN_NOT_FOUND', `Unknown column(s): ${missing.join(', ')}`);
        }
        const counts = await repository.observeKeyUniqueness(connection, {
          owner,
          objectName,
          columns,
        });
        return Object.freeze({
          ...counts,
          columns: Object.freeze([...columns]),
          observedAt: now().toISOString(),
        });
      });
    },
  });
}
