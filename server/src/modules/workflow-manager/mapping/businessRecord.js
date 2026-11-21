import { CARDINALITY, relationshipGraph } from './formContractV2.js';
import { SENSITIVITY_RANK } from './formSemantics.js';
import { buildRecordKey } from './recordKey.js';
import { canonicalFieldValue, canonicalKeyValue, MappingValueError } from './typeCompatibility.js';

/*
 * The one typed business-data result of a form record, `zrv.wf.businessRecord/1`, assembled from
 * rows ALREADY read under the form's mapping (`zrv.wf.form/2`). This module never reads data,
 * builds SQL or decides access: the authorized read-only reader of a later package (M2-C preview,
 * M3 conditions, M4 templates, execution) fetches the rows — the root by key with at most two rows,
 * each relationship batched for its parents with maxRows + 1 rows per parent — after the
 * form-owned RecordAccessProvider allowed the root and the related-source rules allowed the rest.
 *
 * Result: the root identity (canonical record key), organization scope, mapped status, fields
 * grouped by where they come from, every lookup as an object or null and every collection as a
 * complete, ordered list — one header with its lines, never flattened rows that repeat header
 * values — plus source/version provenance. Rules (fail closed; the first violation throws
 * BusinessRecordError and nothing partial is returned):
 *   root: exactly one row                                ROOT_NOT_FOUND / ROOT_AMBIGUOUS
 *   SINGLE_LOOKUP: exactly one row                       LOOKUP_REQUIRED_MISSING / LOOKUP_AMBIGUOUS
 *   OPTIONAL_LOOKUP: none → null, more than one          LOOKUP_AMBIGUOUS
 *   COLLECTION: none → empty, more than maxRows          COLLECTION_OVERFLOW (never truncated)
 *   REQUIRED_COLLECTION: none                            COLLECTION_REQUIRED_EMPTY
 *   keyed collection rows share a row key                ROW_KEY_DUPLICATE
 *   keyless collection rows                              kept as read, duplicates included
 *   a fetched row violates a filter / lacks a column     ROW_FILTER_MISMATCH / ROW_COLUMN_MISSING
 *   a stored status is not mapped                        STATUS_UNMAPPED
 *   a value is not valid for its type                    VALUE_INVALID
 * Fields more sensitive than the audience's `maxSensitivity` are returned as REDACTED (the value is
 * never included). Missing optional data is null or an empty list — values are never fabricated.
 */
export const BUSINESS_RECORD_FORMAT = 'zrv.wf.businessRecord/1';
export const REDACTED = Object.freeze({ redacted: true });

export class BusinessRecordError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = 'BusinessRecordError';
    this.code = code;
    this.path = path;
  }
}

const fail = (code, path, message) => {
  throw new BusinessRecordError(code, path, message);
};

/**
 * @param {object} input
 * @param {object} input.config         prepared `zrv.wf.form/2` configuration (valid)
 * @param {Map<string, object>} input.sourceVersions sourceVersionId → { config (zrv.wf.source/1) }
 * @param {Record<string, object[]>} input.rows alias → rows read for that alias (column → value)
 * @param {object} input.audience       { maxSensitivity: PUBLIC | INTERNAL | PERSONAL | SENSITIVE }
 * @param {object} [input.context]      allowlisted filter context { FORM_CODE, ORGANIZATION_SCOPE }
 */
export function assembleBusinessRecord({ config, sourceVersions, rows, audience, context = {} }) {
  const graph = relationshipGraph(config);
  if (!audience || !(audience.maxSensitivity in SENSITIVITY_RANK)) {
    fail('AUDIENCE_REQUIRED', 'audience', 'The audience sensitivity must be stated explicitly');
  }
  const allowed = SENSITIVITY_RANK[audience.maxSensitivity];
  const contextValues = { FORM_CODE: config.formCode, ...context };

  const columnsOf = new Map(
    graph.sources.map((source) => {
      const version = sourceVersions?.get(source.sourceVersionId);
      if (!version?.config) {
        fail('SOURCE_VERSION_NOT_FOUND', source.alias, `Source version of ${source.alias} missing`);
      }
      return [source.alias, new Map(version.config.columns.map((c) => [c.name, c]))];
    }),
  );
  const keyCandidate = (alias, keyCode) => {
    const version = sourceVersions.get(
      graph.sources.find((s) => s.alias === alias).sourceVersionId,
    );
    return version.config.keyCandidates.find((key) => key.code === keyCode) ?? null;
  };
  const fieldsOf = new Map();
  for (const field of config.fields) {
    if (!fieldsOf.has(field.ref.alias)) fieldsOf.set(field.ref.alias, []);
    fieldsOf.get(field.ref.alias).push(field);
  }
  const childrenOf = new Map();
  for (const relationship of graph.relationships) {
    if (!childrenOf.has(relationship.from)) childrenOf.set(relationship.from, []);
    childrenOf.get(relationship.from).push(relationship);
  }

  const read = (alias, row, columnName, path) => {
    if (!row || !Object.hasOwn(row, columnName)) {
      fail('ROW_COLUMN_MISSING', path, `A row of ${alias} was read without ${columnName}`);
    }
    return row[columnName];
  };
  const guard = (path, action) => {
    try {
      return action();
    } catch (cause) {
      if (cause instanceof MappingValueError) fail('VALUE_INVALID', path, cause.message);
      throw cause;
    }
  };
  // Canonical tuple of join/key values; null when a part is null (SQL equality never matches).
  const tuple = (alias, row, columnNames, path) => {
    const parts = [];
    for (const name of columnNames) {
      const raw = read(alias, row, name, path);
      if (raw === null || raw === undefined) return null;
      parts.push(guard(path, () => canonicalKeyValue(columnsOf.get(alias).get(name), raw)));
    }
    return JSON.stringify(parts);
  };

  const fieldsFor = (alias, row, path) => {
    const values = {};
    for (const field of fieldsOf.get(alias) ?? []) {
      const raw = read(alias, row, field.ref.column, `${path}.${field.code}`);
      values[field.code] =
        SENSITIVITY_RANK[field.sensitivity] > allowed
          ? REDACTED
          : guard(`${path}.${field.code}`, () =>
              canonicalFieldValue(field, columnsOf.get(alias).get(field.ref.column), raw),
            );
    }
    return Object.freeze(values);
  };

  // Child rows of every relationship, checked against its filters once.
  const candidates = new Map();
  for (const relationship of graph.relationships) {
    const childRows = rows?.[relationship.to] ?? [];
    if (!Array.isArray(childRows)) fail('ROWS_INVALID', relationship.to, 'Rows must be a list');
    const toColumns = relationship.join.map((pair) => pair.toColumn);
    const index = new Map();
    childRows.forEach((row, position) => {
      const at = `${relationship.to}[${position}]`;
      for (const filter of relationship.filters) {
        const raw = read(relationship.to, row, filter.column, at);
        const expected = filter.kind === 'FIXED' ? filter.value : contextValues[filter.context];
        const column = columnsOf.get(relationship.to).get(filter.column);
        const actual =
          raw === null || raw === undefined
            ? null
            : guard(at, () => canonicalKeyValue(column, raw));
        const wanted =
          expected === null || expected === undefined
            ? null
            : guard(at, () => canonicalKeyValue(column, expected));
        if (actual === null || actual !== wanted) {
          fail(
            'ROW_FILTER_MISMATCH',
            at,
            `A row of ${relationship.to} does not satisfy the ${filter.column} filter`,
          );
        }
      }
      const key = tuple(relationship.to, row, toColumns, at);
      if (key === null) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    });
    candidates.set(relationship.code, index);
  }

  const node = (alias, row, path) => {
    const related = {};
    for (const relationship of childrenOf.get(alias) ?? []) {
      const at = `${path}.${relationship.code}`;
      const parentKey = tuple(
        alias,
        row,
        relationship.join.map((pair) => pair.fromColumn),
        at,
      );
      const matched =
        parentKey === null ? [] : (candidates.get(relationship.code).get(parentKey) ?? []);
      related[relationship.code] = relationship.collection
        ? collection(relationship, matched, at)
        : lookup(relationship, matched, at);
    }
    return Object.freeze({ fields: fieldsFor(alias, row, path), related: Object.freeze(related) });
  };

  const lookup = (relationship, matched, at) => {
    if (matched.length > 1) {
      fail(
        'LOOKUP_AMBIGUOUS',
        at,
        `${relationship.code} matched ${matched.length} rows; exactly one is allowed`,
      );
    }
    if (!matched.length) {
      if (relationship.kind === 'SINGLE_LOOKUP') {
        fail('LOOKUP_REQUIRED_MISSING', at, `${relationship.code} is required but no row matched`);
      }
      return null;
    }
    return node(relationship.to, matched[0], at);
  };

  const collection = (relationship, matched, at) => {
    if (matched.length > relationship.maxRows) {
      fail(
        'COLLECTION_OVERFLOW',
        at,
        `${relationship.code} has more than ${relationship.maxRows} rows; the list would be incomplete`,
      );
    }
    if (!matched.length && relationship.kind === 'REQUIRED_COLLECTION') {
      fail('COLLECTION_REQUIRED_EMPTY', at, `${relationship.code} needs at least one row`);
    }
    const keyColumns = relationship.rowKey
      ? keyCandidate(relationship.to, relationship.rowKey).columns.map((name) =>
          columnsOf.get(relationship.to).get(name),
        )
      : null;
    const seen = new Set();
    const items = matched.map((row, position) => {
      const rowAt = `${at}[${position}]`;
      let rowKey = null;
      if (keyColumns) {
        const values = Object.fromEntries(
          keyColumns.map((column) => [column.name, read(relationship.to, row, column.name, rowAt)]),
        );
        rowKey = guard(rowAt, () => buildRecordKey(keyColumns, values)).json;
        if (seen.has(rowKey))
          fail('ROW_KEY_DUPLICATE', rowAt, `Two rows of ${relationship.code} share a key`);
        seen.add(rowKey);
      }
      return Object.freeze({ rowKey, ...node(relationship.to, row, rowAt) });
    });
    return Object.freeze({
      cardinality: CARDINALITY[relationship.kind],
      keyed: Boolean(keyColumns),
      complete: true,
      rowCount: items.length,
      rows: Object.freeze(items),
    });
  };

  // --- Root ------------------------------------------------------------------------------------
  const rootRows = rows?.[graph.root.alias];
  if (!Array.isArray(rootRows) || rootRows.length === 0) {
    fail('ROOT_NOT_FOUND', graph.root.alias, 'No record has this key');
  }
  if (rootRows.length > 1)
    fail('ROOT_AMBIGUOUS', graph.root.alias, 'More than one record has this key');
  const rootRow = rootRows[0];
  const rootKeyColumns = keyCandidate(graph.root.alias, graph.root.keyCandidate).columns.map(
    (name) => columnsOf.get(graph.root.alias).get(name),
  );
  const recordKey = guard(graph.root.alias, () =>
    buildRecordKey(
      rootKeyColumns,
      Object.fromEntries(
        rootKeyColumns.map((column) => [
          column.name,
          read(graph.root.alias, rootRow, column.name, 'root'),
        ]),
      ),
    ),
  );
  const data = node(graph.root.alias, rootRow, 'root');

  const status = statusOf(config, columnsOf, rootRow, read, guard);
  return Object.freeze({
    format: BUSINESS_RECORD_FORMAT,
    formCode: config.formCode,
    recordKey: Object.freeze({
      format: recordKey.format,
      json: recordKey.json,
      sha256: recordKey.sha256,
    }),
    organization: organizationOf(config, data),
    status,
    data,
    provenance: Object.freeze({ formSchema: config.schema, sources: graph.sources }),
  });
}

function statusOf(config, columnsOf, rootRow, read, guard) {
  if (!config.status) return null;
  const field = config.fields.find((item) => item.code === config.status.field);
  const raw = read(config.root.alias, rootRow, field.ref.column, 'status');
  const stored = guard('status', () =>
    canonicalFieldValue(field, columnsOf.get(config.root.alias).get(field.ref.column), raw),
  );
  const mapped = config.status.values.find((value) => value.stored === stored);
  if (!mapped) fail('STATUS_UNMAPPED', 'status', 'The stored status is not mapped');
  return Object.freeze({ code: mapped.code, category: mapped.category });
}

// FIELD scope must be a mandatory record-level field (the contract guarantees it); the value is
// read from the assembled data, so a redacted or missing value never becomes a scope.
function organizationOf(config, data) {
  const scope = config.orgScope;
  if (!scope) return null;
  if (scope.kind === 'CONSTANT') return Object.freeze({ kind: 'CONSTANT', value: scope.value });
  if (scope.kind === 'RESOLVER_REQUIRED')
    return Object.freeze({ kind: 'RESOLVER_REQUIRED', value: null });
  const field = config.fields.find((item) => item.code === scope.field);
  const value = findField(config, data, field);
  if (value === null || value === REDACTED) {
    fail(
      'ORGANIZATION_SCOPE_UNAVAILABLE',
      'orgScope',
      'The organization of the record is not readable',
    );
  }
  return Object.freeze({ kind: 'FIELD', value });
}

function findField(config, data, field) {
  if (field.ref.alias === config.root.alias) return data.fields[field.code] ?? null;
  // Walk the lookup path from the root (mandatory lookups only, per the contract).
  const path = [];
  let alias = field.ref.alias;
  while (alias !== config.root.alias) {
    const relationship = config.relationships.find((item) => item.to === alias);
    path.unshift(relationship.code);
    alias = relationship.from;
  }
  let current = data;
  for (const code of path) {
    current = current?.related?.[code] ?? null;
    if (!current || current.rows) return null;
  }
  return current.fields[field.code] ?? null;
}
