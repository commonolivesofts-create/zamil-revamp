import Joi from 'joi';
import { createFindings } from './findings.js';
import {
  alias,
  code,
  column,
  evidence,
  FIELD_USAGES,
  formVersionResult,
  id,
  KEYLESS_LINE_USAGES,
  semanticsSchema,
  SENSITIVITY_RANK,
  validateFormSemantics,
  verification,
} from './formSemantics.js';
import { ENFORCEMENT } from './keyAssurance.js';
import {
  canonicalKeyValue,
  joinable,
  keyIneligibility,
  MappingValueError,
} from './typeCompatibility.js';

/*
 * Form mapping contract `zrv.wf.form/2` (XX_ZRV_WF_FORM_VERSIONS.CONFIG_JSON, SCHEMA_VERSION 2):
 * the business data of one form as ONE logical root record and a bounded, acyclic graph of
 * registered, pinned source versions reached from it. `zrv.wf.form/1` (formContract.js) stays
 * readable and valid unchanged; nothing is migrated automatically.
 *
 *   root           source version + record key of the business record (HEADER_SOURCE_VERSION_ID)
 *   sources        every other source version the record reads, by alias — the ONLY place a
 *                  non-root source version is referenced, so dependency checks read one path
 *   relationships  one per non-root source: how it is reached from its parent alias
 *                    SINGLE_LOOKUP        exactly one row        (missing or duplicate: error)
 *                    OPTIONAL_LOOKUP      zero or one row        (missing: null; duplicate: error)
 *                    COLLECTION           zero or more rows      (none: empty list)
 *                    REQUIRED_COLLECTION  one or more rows       (none: error)
 *                  with typed column-pair equality joins (composite allowed), organization
 *                  scope, typed fixed/context filters, deterministic order and row limits.
 *                  Collections never truncate: more rows than maxRows is an explicit error.
 *   fields …       the shared semantics of every version (formSemantics.js)
 *
 * Bounded graph: one parent per source, every source reachable from the root (hence no cycles),
 * depth ≤ MAX_GRAPH_DEPTH, at most MAX_COLLECTION_NESTING collections on any path and a total row
 * budget, so there is no unbounded fan-out or Cartesian product. Lookups must join on a key
 * candidate of the looked-up source (no "first row" for single lookups). A relationship is only a
 * recorded, verified or provisional design decision — nothing here reads data or executes SQL, and
 * a heuristic suggestion is never an approved relationship (PROVISIONAL is a publication blocker).
 */
export const FORM_SCHEMA_V2 = 'zrv.wf.form/2';
export const FORM_SCHEMA_VERSION_V2 = 2;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const MAX_SOURCES = 20;
export const MAX_GRAPH_DEPTH = 4;
export const MAX_COLLECTION_NESTING = 2;
export const MAX_ROW_BUDGET = 10000;

export const RELATIONSHIP_KINDS = Object.freeze([
  'SINGLE_LOOKUP',
  'OPTIONAL_LOOKUP',
  'COLLECTION',
  'REQUIRED_COLLECTION',
]);
export const LOOKUP_KINDS = Object.freeze(['SINGLE_LOOKUP', 'OPTIONAL_LOOKUP']);
export const COLLECTION_KINDS = Object.freeze(['COLLECTION', 'REQUIRED_COLLECTION']);
/** Cardinality of each kind, in the vocabulary of the specification. */
export const CARDINALITY = Object.freeze({
  SINGLE_LOOKUP: 'EXACTLY_ONE',
  OPTIONAL_LOOKUP: 'ZERO_OR_ONE',
  COLLECTION: 'ZERO_OR_MANY',
  REQUIRED_COLLECTION: 'ONE_OR_MANY',
});
/**
 * How related rows stay inside the record's organization:
 *   PARENT_RECORD     rows belong to the parent record through the join (lines of a request)
 *   SAME_ORGANIZATION the join includes the organization column pair `organizationJoin`
 *   REFERENCE_DATA    organization-independent master data (lookups only)
 */
export const RELATIONSHIP_SCOPES = Object.freeze([
  'PARENT_RECORD',
  'SAME_ORGANIZATION',
  'REFERENCE_DATA',
]);
/** Allowlisted runtime context values a filter may compare with (equality only). */
export const FILTER_CONTEXTS = Object.freeze(['FORM_CODE', 'ORGANIZATION_SCOPE']);

const joinPair = Joi.object({ fromColumn: column.required(), toColumn: column.required() });

const relationshipSchema = Joi.object({
  code: code.required(),
  label: Joi.object({
    en: Joi.string().trim().min(1).max(200).required(),
    ar: Joi.string().trim().min(1).max(200),
  }).required(),
  kind: Joi.string()
    .valid(...RELATIONSHIP_KINDS)
    .required(),
  from: alias.required(),
  to: alias.required(),
  join: Joi.array().items(joinPair).min(1).max(32).required(),
  scope: Joi.string()
    .valid(...RELATIONSHIP_SCOPES)
    .required(),
  organizationJoin: Joi.when('scope', {
    is: 'SAME_ORGANIZATION',
    then: joinPair.required(),
    otherwise: Joi.forbidden(),
  }),
  filters: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.object({
          column: column.required(),
          kind: Joi.string().valid('FIXED').required(),
          value: Joi.string().min(1).max(4000).required(),
        }),
        Joi.object({
          column: column.required(),
          kind: Joi.string().valid('CONTEXT').required(),
          context: Joi.string()
            .valid(...FILTER_CONTEXTS)
            .required(),
        }),
      ),
    )
    .max(8)
    .default([]),
  orderBy: Joi.array()
    .items(
      Joi.object({
        column: column.required(),
        direction: Joi.string().valid('ASC', 'DESC').required(),
      }),
    )
    .max(8)
    .default([]),
  maxRows: Joi.when('kind', {
    is: Joi.valid(...COLLECTION_KINDS),
    then: Joi.number().integer().min(1).max(1000).required(),
    otherwise: Joi.forbidden(),
  }),
  rowKey: Joi.when('kind', {
    is: Joi.valid(...COLLECTION_KINDS),
    then: code.allow(null).required(),
    otherwise: Joi.forbidden(),
  }),
  keylessAcknowledged: Joi.when('kind', {
    is: Joi.valid(...COLLECTION_KINDS),
    then: Joi.boolean().default(false),
    otherwise: Joi.forbidden(),
  }),
  usage: Joi.array()
    .items(Joi.string().valid(...FIELD_USAGES))
    .min(1)
    .unique()
    .required(),
  verification,
  evidence: evidence.required(),
});

export const formConfigSchemaV2 = Joi.object({
  root: Joi.object({
    alias: alias.required(),
    sourceVersionId: id.required(),
    keyCandidate: code.required(),
  }).required(),
  sources: Joi.array()
    .items(Joi.object({ alias: alias.required(), sourceVersionId: id.required() }))
    .max(MAX_SOURCES)
    .default([]),
  relationships: Joi.array().items(relationshipSchema).max(MAX_SOURCES).default([]),
  ...semanticsSchema,
});

/**
 * Validates a `zrv.wf.form/2` draft in its context and returns the canonical payload, findings and
 * publication blockers (same result shape as prepareFormVersion of v1, schemaVersion 2).
 *
 * @param {object} input
 * @param {object} input.draft            form mapping (formConfigSchemaV2)
 * @param {object} input.registeredForm   M1 row: { formCode, detailRoute, isActive }
 * @param {Map<string, object>} input.sourceVersions sourceVersionId → { sourceVersionId,
 *                                        lifecycleState, config (zrv.wf.source/1) }
 * @param {object} input.recordAccessRegistry registry from integrations/index.js
 * @param {(key: string) => boolean} [input.permissionExists] active catalogue permission check
 */
export function prepareFormVersionV2({
  draft,
  registeredForm,
  sourceVersions,
  recordAccessRegistry,
  permissionExists = null,
}) {
  const findings = createFindings();
  const blockers = [];
  const { value, error } = formConfigSchemaV2.validate(draft ?? {}, { abortEarly: false });
  if (error) {
    for (const detail of error.details) {
      findings.error('SCHEMA_INVALID', detail.path.join('.') || '$', detail.message);
    }
    return result(findings, blockers, null, null);
  }
  if (!registeredForm?.formCode) {
    findings.error('FORM_NOT_REGISTERED', 'formCode', 'The form is not registered');
    return result(findings, blockers, null, null);
  }
  if (registeredForm.isActive === false) blockers.push({ code: 'FORM_INACTIVE', path: 'formCode' });

  // --- Sources ---------------------------------------------------------------------------------
  // alias → { version, columns: Map (exposed), keyCandidates: Map, keyless, relationship, depth,
  //           collections (on the path from the root), rowBudget, recordLevel, mandatory }
  const sources = new Map();
  const useSource = (sourceVersionId, aliasName, path) => {
    const version = sourceVersions?.get(sourceVersionId);
    if (!version?.config) {
      findings.error('SOURCE_VERSION_NOT_FOUND', path, 'The source version does not exist');
      return null;
    }
    if (version.lifecycleState !== 'PUBLISHED') {
      blockers.push({ code: 'SOURCE_VERSION_NOT_PUBLISHED', path });
    }
    if (sources.has(aliasName)) {
      findings.error('ALIAS_DUPLICATE', path, `Alias ${aliasName} is used twice`);
      return null;
    }
    const entry = {
      version,
      columns: new Map(version.config.columns.filter((c) => c.exposed).map((c) => [c.name, c])),
      keyCandidates: new Map(version.config.keyCandidates.map((k) => [k.code, k])),
      keyless: false,
      relationship: null,
    };
    sources.set(aliasName, entry);
    return entry;
  };

  const root = useSource(value.root.sourceVersionId, value.root.alias, 'root.sourceVersionId');
  let rootKey = null;
  if (root) {
    Object.assign(root, {
      depth: 0,
      collections: 0,
      rowBudget: 1,
      recordLevel: true,
      mandatory: true,
      rowKeyColumns: null,
    });
    rootKey = root.keyCandidates.get(value.root.keyCandidate) ?? null;
    if (!rootKey) {
      findings.error(
        'KEY_CANDIDATE_NOT_FOUND',
        'root.keyCandidate',
        'Not a key candidate of the root source',
      );
    } else {
      rootKey.columns.forEach((name) => {
        const keyColumn = root.columns.get(name);
        if (!keyColumn || keyIneligibility(keyColumn)) {
          findings.error(
            'KEY_COLUMN_INVALID',
            'root.keyCandidate',
            `Key column ${name} is not usable`,
          );
        }
      });
      if (rootKey.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) {
        blockers.push({ code: 'PROVISIONAL_KEY', path: 'root.keyCandidate' });
      }
      root.rowKeyColumns = rootKey.columns;
    }
  }
  value.sources.forEach((source, index) =>
    useSource(source.sourceVersionId, source.alias, `sources[${index}].sourceVersionId`),
  );

  // --- Relationship graph: one parent per source, all reachable from the root -----------------
  const byTarget = new Map();
  value.relationships.forEach((relationship, index) => {
    const at = `relationships[${index}]`;
    if (value.relationships.findIndex((other) => other.code === relationship.code) !== index) {
      findings.error(
        'RELATIONSHIP_CODE_DUPLICATE',
        `${at}.code`,
        `Relationship ${relationship.code} is declared twice`,
      );
    }
    if (relationship.to === value.root.alias) {
      findings.error('RELATIONSHIP_TO_ROOT', `${at}.to`, 'The root record has no parent');
      return;
    }
    if (!value.sources.some((source) => source.alias === relationship.to)) {
      findings.error('ALIAS_UNKNOWN', `${at}.to`, `Unknown source alias ${relationship.to}`);
      return;
    }
    if (
      relationship.from !== value.root.alias &&
      !value.sources.some((s) => s.alias === relationship.from)
    ) {
      findings.error('ALIAS_UNKNOWN', `${at}.from`, `Unknown source alias ${relationship.from}`);
      return;
    }
    if (byTarget.has(relationship.to)) {
      findings.error(
        'SOURCE_MULTIPLE_PARENTS',
        `${at}.to`,
        `${relationship.to} is reached by more than one relationship`,
      );
      return;
    }
    byTarget.set(relationship.to, { relationship, index });
  });
  value.sources.forEach((source, index) => {
    if (!byTarget.has(source.alias)) {
      findings.error(
        'SOURCE_UNREACHABLE',
        `sources[${index}].alias`,
        `${source.alias} is not connected to the record by a relationship`,
      );
    }
  });

  // Walk from the root in dependency order; anything never reached is a cycle (or hangs off one).
  const placed = new Set(root ? [value.root.alias] : []);
  let totalRows = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (const [target, { relationship, index }] of byTarget) {
      if (placed.has(target) || !placed.has(relationship.from)) continue;
      placed.add(target);
      progress = true;
      const parent = sources.get(relationship.from);
      const child = sources.get(target);
      if (!parent || !child) continue;
      const rows = checkRelationship({
        relationship,
        at: `relationships[${index}]`,
        parent,
        child,
        findings,
        blockers,
      });
      totalRows += rows;
    }
  }
  for (const [target, { index }] of byTarget) {
    if (!placed.has(target) && root) {
      findings.error(
        'RELATIONSHIP_CYCLE',
        `relationships[${index}]`,
        `${target} is part of a cycle and cannot be reached from the root record`,
      );
    }
  }
  if (totalRows > MAX_ROW_BUDGET) {
    findings.error(
      'ROW_BUDGET_EXCEEDED',
      'relationships',
      `Together the collections could return ${totalRows} rows; at most ${MAX_ROW_BUDGET} are allowed`,
    );
  }

  // --- Shared semantics: fields, attributes, scope, status, events, deep link, record access --
  const fields = validateFormSemantics({
    value,
    registeredForm,
    sources,
    rootKeyColumns: rootKey ? rootKey.columns : null,
    placement: (field, purpose) => placementOf(sources.get(field.ref.alias), field, purpose, value),
    findings,
    blockers,
    recordAccessRegistry,
    permissionExists,
  });

  // Root record access is not blanket access to related tables: personal or sensitive fields of
  // related sources stay blocked until their own access rule is verified (M2-C / G3).
  value.fields.forEach((field, index) => {
    if (
      fields.get(field.code)?.sourceColumn &&
      field.ref.alias !== value.root.alias &&
      SENSITIVITY_RANK[field.sensitivity] >= SENSITIVITY_RANK.PERSONAL
    ) {
      blockers.push({ code: 'RELATED_SOURCE_ACCESS_UNVERIFIED', path: `fields[${index}]` });
    }
  });

  const config = { schema: FORM_SCHEMA_V2, formCode: registeredForm.formCode, ...value };
  return result(findings, blockers, config, value.root.sourceVersionId);
}

/** Where a record-level semantic (status, scope, people) may read from in a graph. */
function placementOf(source, field, purpose, value) {
  if (purpose === 'STATUS') {
    return field.ref.alias === value.root.alias
      ? null
      : { code: 'FIELD_NOT_ROOT', message: `${field.code} must be a field of the root record` };
  }
  if (purpose === 'ORG_SCOPE') {
    return source?.mandatory
      ? null
      : {
          code: 'FIELD_NOT_MANDATORY',
          message: `${field.code} must come from the root record or a single (required) lookup`,
        };
  }
  return source?.recordLevel
    ? null
    : {
        code: 'FIELD_NOT_RECORD_LEVEL',
        message: `${field.code} must come from the root record or a lookup, not a collection`,
      };
}

/**
 * Checks one relationship and annotates the child source with its position in the graph.
 * Returns the number of rows the relationship may contribute to the row budget.
 */
function checkRelationship({ relationship, at, parent, child, findings, blockers }) {
  const lookup = LOOKUP_KINDS.includes(relationship.kind);
  child.relationship = relationship;
  child.depth = parent.depth + 1;
  child.collections = parent.collections + (lookup ? 0 : 1);
  child.rowBudget = parent.rowBudget * (lookup ? 1 : relationship.maxRows);
  child.recordLevel = parent.recordLevel && lookup;
  child.mandatory = parent.mandatory && relationship.kind === 'SINGLE_LOOKUP';
  child.rowKeyColumns = null;
  if (child.depth > MAX_GRAPH_DEPTH) {
    findings.error(
      'GRAPH_TOO_DEEP',
      at,
      `${relationship.to} is ${child.depth} relationships from the root; at most ${MAX_GRAPH_DEPTH} are allowed`,
    );
  }
  if (child.collections > MAX_COLLECTION_NESTING) {
    findings.error(
      'COLLECTION_NESTING_TOO_DEEP',
      at,
      `At most ${MAX_COLLECTION_NESTING} collections may be nested`,
    );
  }
  if (!lookup && parent.keyless) {
    findings.error(
      'COLLECTION_UNDER_KEYLESS_ROWS',
      at,
      'Rows without a key cannot own a collection: their child rows could not be attributed',
    );
  }

  // Joins: exposed columns of compatible types, no implicit conversion.
  relationship.join.forEach((pair, position) => {
    const jat = `${at}.join[${position}]`;
    const left = parent.columns.get(pair.fromColumn);
    const right = child.columns.get(pair.toColumn);
    if (!left)
      findings.error(
        'COLUMN_NOT_EXPOSED',
        jat,
        `${pair.fromColumn} is not an exposed column of ${relationship.from}`,
      );
    if (!right)
      findings.error(
        'COLUMN_NOT_EXPOSED',
        jat,
        `${pair.toColumn} is not an exposed column of ${relationship.to}`,
      );
    if (left && right && !joinable(left, right)) {
      findings.error('JOIN_TYPE_INCOMPATIBLE', jat, 'The joined columns have incompatible types');
    }
  });
  const toColumns = relationship.join.map((pair) => pair.toColumn);
  const fromColumns = relationship.join.map((pair) => pair.fromColumn);
  if (new Set(toColumns).size !== toColumns.length) {
    findings.error('JOIN_COLUMN_DUPLICATE', `${at}.join`, 'A column is joined twice');
  }

  // Organization scope: never across organizations.
  if (relationship.scope === 'SAME_ORGANIZATION') {
    const org = relationship.organizationJoin;
    if (
      !relationship.join.some(
        (pair) => pair.fromColumn === org.fromColumn && pair.toColumn === org.toColumn,
      )
    ) {
      findings.error(
        'ORGANIZATION_JOIN_MISSING',
        `${at}.organizationJoin`,
        'The organization column pair must be part of the join',
      );
    }
  } else if (relationship.scope === 'REFERENCE_DATA' && !lookup) {
    findings.error(
      'REFERENCE_DATA_COLLECTION',
      `${at}.scope`,
      'Reference data may only be looked up, not collected',
    );
  } else if (relationship.scope === 'PARENT_RECORD' && parent.rowKeyColumns) {
    const joined = new Set(fromColumns);
    if (!parent.rowKeyColumns.every((name) => joined.has(name))) {
      findings.warning(
        'JOIN_NOT_ON_PARENT_KEY',
        `${at}.join`,
        `The join does not cover the record key of ${relationship.from}`,
      );
    }
  }

  // Filters: allowlisted columns; fixed values in exact canonical form; context by name only.
  relationship.filters.forEach((filter, position) => {
    const fat = `${at}.filters[${position}]`;
    const filterColumn = child.columns.get(filter.column);
    if (!filterColumn) {
      findings.error('COLUMN_NOT_EXPOSED', fat, `${filter.column} is not an exposed column`);
      return;
    }
    if (filter.kind === 'FIXED') {
      try {
        filter.value = canonicalKeyValue(filterColumn, filter.value);
      } catch (cause) {
        findings.error(
          cause instanceof MappingValueError ? cause.code : 'FILTER_VALUE_INVALID',
          fat,
          'The fixed filter value is not valid for this column',
        );
      }
    } else if (keyIneligibility(filterColumn)) {
      findings.error('FILTER_COLUMN_INVALID', fat, `${filter.column} cannot be compared exactly`);
    }
  });

  relationship.orderBy.forEach((order, position) => {
    if (!child.columns.has(order.column)) {
      findings.error(
        'COLUMN_NOT_EXPOSED',
        `${at}.orderBy[${position}]`,
        `${order.column} is not exposed`,
      );
    }
  });

  if (relationship.verification === 'PROVISIONAL') {
    blockers.push({ code: 'PROVISIONAL_RELATIONSHIP', path: at });
  }

  if (lookup) {
    // A lookup is unique only through a key of the looked-up source contained in the join.
    if (relationship.orderBy.length) {
      findings.error(
        'LOOKUP_ORDER_NOT_ALLOWED',
        `${at}.orderBy`,
        'A lookup returns one row; it has no order',
      );
    }
    const backing = [...child.keyCandidates.values()].filter((key) =>
      key.columns.every((name) => toColumns.includes(name)),
    );
    if (!backing.length) {
      findings.error(
        'LOOKUP_KEY_REQUIRED',
        `${at}.join`,
        `The join must contain a key candidate of ${relationship.to}, so at most one row can match`,
      );
    } else if (!backing.some((key) => key.enforcement === ENFORCEMENT.DATABASE_ENFORCED)) {
      blockers.push({ code: 'PROVISIONAL_LOOKUP_KEY', path: `${at}.join` });
    }
    child.rowKeyColumns = backing[0]?.columns ?? null;
    return 0;
  }

  // Collections: complete and deterministic, never silently truncated.
  if (!relationship.orderBy.length) {
    findings.error('COLLECTION_ORDER_REQUIRED', `${at}.orderBy`, 'Declare the order of the rows');
  }
  if (relationship.rowKey === null) {
    // Keyless rows are kept exactly as stored, duplicates included, for display and templates.
    child.keyless = true;
    if (!relationship.keylessAcknowledged) {
      findings.error(
        'KEYLESS_ACK_REQUIRED',
        `${at}.keylessAcknowledged`,
        'Acknowledge that rows have no stable identity',
      );
    }
    if (relationship.usage.some((usage) => !KEYLESS_LINE_USAGES.includes(usage))) {
      findings.error(
        'KEYLESS_LINE_USAGE_NOT_ALLOWED',
        `${at}.usage`,
        'Rows without a key allow DISPLAY and TEMPLATE only',
      );
    }
    blockers.push({ code: 'KEYLESS_LINE_RESTRICTED_USE', path: at });
  } else {
    const rowKey = child.keyCandidates.get(relationship.rowKey);
    if (!rowKey) {
      findings.error(
        'KEY_CANDIDATE_NOT_FOUND',
        `${at}.rowKey`,
        `Not a key candidate of ${relationship.to}`,
      );
    } else {
      child.rowKeyColumns = rowKey.columns;
      if (rowKey.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) {
        blockers.push({ code: 'PROVISIONAL_LINE_KEY', path: `${at}.rowKey` });
      }
      const ordered = new Set(relationship.orderBy.map((order) => order.column));
      if (relationship.orderBy.length && !rowKey.columns.every((name) => ordered.has(name))) {
        findings.warning(
          'COLLECTION_ORDER_NOT_UNIQUE',
          `${at}.orderBy`,
          'Rows with equal order values keep no guaranteed order; add the row key to the order',
        );
      }
    }
  }
  return child.rowBudget;
}

const result = (findings, blockers, config, headerSourceVersionId) =>
  formVersionResult({
    findings,
    blockers,
    config,
    headerSourceVersionId,
    schemaVersion: FORM_SCHEMA_VERSION_V2,
    maxBytes: MAX_CONFIG_BYTES,
  });

/**
 * The relationship graph of a prepared `zrv.wf.form/2` configuration, for readers (M2-C preview,
 * M3 conditions, M4 templates, execution): the root and each relationship in parent-before-child
 * order with its cardinality. Throws on any other schema — callers dispatch by schema first.
 */
export function relationshipGraph(config) {
  if (config?.schema !== FORM_SCHEMA_V2) {
    throw new MappingValueError('FORM_SCHEMA_UNSUPPORTED', 'Not a zrv.wf.form/2 configuration');
  }
  const order = [];
  const placed = new Set([config.root.alias]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const relationship of config.relationships) {
      if (!placed.has(relationship.to) && placed.has(relationship.from)) {
        placed.add(relationship.to);
        order.push(
          Object.freeze({
            ...relationship,
            cardinality: CARDINALITY[relationship.kind],
            collection: COLLECTION_KINDS.includes(relationship.kind),
          }),
        );
        progress = true;
      }
    }
  }
  return Object.freeze({
    root: Object.freeze({ ...config.root }),
    sources: Object.freeze(
      [
        { alias: config.root.alias, sourceVersionId: config.root.sourceVersionId },
        ...config.sources,
      ].map((source) => Object.freeze({ ...source })),
    ),
    relationships: Object.freeze(order),
  });
}
