import Joi from 'joi';
import { fingerprint } from './canonicalJson.js';
import { createFindings, freezeBlockers } from './findings.js';
import { ALIAS, CODE, ORACLE_IDENTIFIER } from './identifiers.js';
import { ENFORCEMENT } from './keyAssurance.js';
import { DATA_CLASSES } from './sourceContract.js';
import {
  canonicalInteger,
  canonicalKeyValue,
  FIELD_TYPES,
  fieldTypeIncompatibility,
  joinable,
  keyIneligibility,
  MappingValueError,
  REFERENCE_TYPES,
} from './typeCompatibility.js';

/*
 * Form mapping contract `zrv.wf.form/1` (XX_ZRV_WF_FORM_VERSIONS.CONFIG_JSON, SCHEMA_VERSION 1).
 * Generic for every business form: it references allowlisted columns of source versions by alias
 * and column name, and records — but never executes — business semantics.
 *
 *   header       source version + record key (a key candidate of that version)
 *   lines        detail sources joined to the header; keyed lines or explicitly acknowledged
 *                keyless lines (rows preserved as they are — never de-duplicated — and limited to
 *                DISPLAY/TEMPLATE use)
 *   fields       typed business field catalogue with sensitivity that may never be lower than the
 *                source column's data class
 *   attributes   generic person roles linked to reference fields (no resolution in M2)
 *   orgScope     FIELD | CONSTANT | RESOLVER_REQUIRED (the M4 resolver is recorded, not built)
 *   status       stored values with category, verification and evidence; transitions; writer NONE
 *   events       trigger events (XX_ZRV_WF_DEFINITIONS.TRIGGER_EVENT_CODE)
 *   deepLink     route parameters of the registered form's DETAIL_ROUTE → header key columns
 *   recordAccess ADDITIONAL permissions only; the form-owned provider stays authoritative
 * Unknown properties are rejected, so no SQL, expression or arbitrary filter can be configured.
 * Publication blockers are reported for M6 governance, never acted on here.
 */
export const FORM_SCHEMA = 'zrv.wf.form/1';
export const FORM_SCHEMA_VERSION = 1;
export const MAX_CONFIG_BYTES = 256 * 1024;

export const SENSITIVITIES = DATA_CLASSES;
export const FIELD_USAGES = Object.freeze(['DISPLAY', 'CONDITION', 'TEMPLATE']);
export const KEYLESS_LINE_USAGES = Object.freeze(['DISPLAY', 'TEMPLATE']);
export const PERSON_ROLES = Object.freeze([
  'REQUESTER',
  'SUBJECT_EMPLOYEE',
  'OWNER',
  'CREATED_BY',
  'UPDATED_BY',
]);
export const STATUS_CATEGORIES = Object.freeze([
  'INITIAL',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'CANCELLED',
  'LEGACY_TERMINAL',
]);
export const VERIFICATION = Object.freeze(['VERIFIED', 'PROVISIONAL']);
export const EVIDENCE_KINDS = Object.freeze(['OBSERVED_DATA', 'CODE_REFERENCE', 'OWNER_DECLARED']);

const PERSON_REF_TYPES = Object.freeze(['EMPLOYEE_NUMBER_REF', 'USER_ID_REF', 'PERSON_ID_REF']);
const PERMISSION_KEY = /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/;
const ROUTE_PARAM = /:([A-Za-z][A-Za-z0-9]*)/g;
const SENSITIVITY_RANK = Object.freeze({ PUBLIC: 0, INTERNAL: 1, PERSONAL: 2, SENSITIVE: 3 });

const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const code = Joi.string().pattern(CODE);
const alias = Joi.string().pattern(ALIAS);
const column = Joi.string().pattern(ORACLE_IDENTIFIER);
const text = (max) =>
  Joi.string()
    .trim()
    .min(1)
    .max(max)
    .pattern(/^[^\p{Cc}]+$/u);
const label = Joi.object({ en: text(200).required(), ar: text(200) });
const verification = Joi.string()
  .valid(...VERIFICATION)
  .required();

export const formConfigSchema = Joi.object({
  header: Joi.object({
    alias: alias.required(),
    sourceVersionId: id.required(),
    keyCandidate: code.required(),
  }).required(),
  lines: Joi.array()
    .items(
      Joi.object({
        code: code.required(),
        alias: alias.required(),
        sourceVersionId: id.required(),
        cardinality: Joi.string().valid('ONE', 'MANY').required(),
        join: Joi.array()
          .items(Joi.object({ lineColumn: column.required(), headerColumn: column.required() }))
          .min(1)
          .max(32)
          .required(),
        fixedFilters: Joi.array()
          .items(
            Joi.object({
              column: column.required(),
              value: Joi.string().min(1).max(4000).required(),
            }),
          )
          .max(8)
          .default([]),
        lineKey: code.allow(null).required(),
        rowIdentity: Joi.string().valid('KEYED', 'NONE').required(),
        keylessAcknowledged: Joi.boolean().default(false),
        orderBy: Joi.array()
          .items(
            Joi.object({
              column: column.required(),
              direction: Joi.string().valid('ASC', 'DESC').required(),
            }),
          )
          .max(8)
          .default([]),
        maxRows: Joi.number().integer().min(1).max(1000).required(),
        usage: Joi.array()
          .items(Joi.string().valid(...FIELD_USAGES))
          .min(1)
          .unique()
          .required(),
      }),
    )
    .max(10)
    .default([]),
  fields: Joi.array()
    .items(
      Joi.object({
        code: code.required(),
        label: label.required(),
        type: Joi.string()
          .valid(...FIELD_TYPES)
          .required(),
        refType: Joi.when('type', {
          is: 'REFERENCE',
          then: Joi.string()
            .valid(...REFERENCE_TYPES)
            .required(),
          otherwise: Joi.forbidden(),
        }),
        booleanMapping: Joi.when('type', {
          is: 'BOOLEAN',
          then: Joi.object({ true: text(100).required(), false: text(100).required() }).required(),
          otherwise: Joi.forbidden(),
        }),
        ref: Joi.object({ alias: alias.required(), column: column.required() }).required(),
        group: text(100),
        sensitivity: Joi.string()
          .valid(...SENSITIVITIES)
          .required(),
        usage: Joi.array()
          .items(Joi.string().valid(...FIELD_USAGES))
          .min(1)
          .unique()
          .required(),
      }),
    )
    .max(500)
    .default([]),
  attributes: Joi.array()
    .items(
      Joi.object({
        role: Joi.string()
          .valid(...PERSON_ROLES)
          .required(),
        field: code.required(),
      }),
    )
    .max(10)
    .unique('role')
    .default([]),
  orgScope: Joi.alternatives()
    .try(
      Joi.object({ kind: Joi.string().valid('FIELD').required(), field: code.required() }),
      Joi.object({
        kind: Joi.string().valid('CONSTANT').required(),
        value: Joi.string()
          .pattern(/^[A-Za-z0-9_.:-]{1,100}$/)
          .required(),
      }),
      Joi.object({
        kind: Joi.string().valid('RESOLVER_REQUIRED').required(),
        input: code.required(),
        output: Joi.string().valid('ORGANIZATION_REF').required(),
        resolverCode: code.allow(null).required(),
      }),
    )
    .allow(null)
    .default(null),
  status: Joi.object({
    field: code.required(),
    match: Joi.string().valid('EXACT').required(),
    values: Joi.array()
      .items(
        Joi.object({
          code: code.required(),
          stored: Joi.string().min(1).max(4000).required(),
          category: Joi.string()
            .valid(...STATUS_CATEGORIES)
            .required(),
          verification,
          evidence: Joi.object({
            kind: Joi.string()
              .valid(...EVIDENCE_KINDS)
              .required(),
            reference: text(500).required(),
          }).required(),
        }),
      )
      .min(1)
      .max(100)
      .unique('code')
      .required(),
    transitions: Joi.array()
      .items(
        Joi.object({
          event: code.required(),
          from: Joi.array().items(code).min(1).unique().required(),
          to: code.required(),
          verification,
        }),
      )
      .max(200)
      .default([]),
    writer: Joi.object({ mode: Joi.string().valid('NONE').required() }).required(),
  })
    .allow(null)
    .default(null),
  events: Joi.array()
    .items(
      Joi.object({
        code: code.required(),
        label: label.required(),
        resubmitFrom: Joi.array().items(code).unique().default([]),
        verification,
      }),
    )
    .max(20)
    .unique('code')
    .default([]),
  deepLink: Joi.object({
    params: Joi.object()
      .pattern(/^[A-Za-z][A-Za-z0-9]*$/, Joi.object({ keyColumn: column.required() }))
      .min(1)
      .required(),
  })
    .allow(null)
    .default(null),
  recordAccess: Joi.object({
    additionalPermissions: Joi.array()
      .items(Joi.string().pattern(PERMISSION_KEY))
      .max(10)
      .unique()
      .default([]),
  }).default({ additionalPermissions: [] }),
});

/**
 * Validates a form mapping draft in its context and returns the canonical payload, findings and
 * publication blockers.
 *
 * @param {object} input
 * @param {object} input.draft            form mapping (formConfigSchema)
 * @param {object} input.registeredForm   M1 row: { formCode, detailRoute, isActive }
 * @param {Map<string, object>} input.sourceVersions sourceVersionId → { sourceVersionId,
 *                                        lifecycleState, config (zrv.wf.source/1) }
 * @param {object} input.recordAccessRegistry registry from integrations/index.js
 * @param {(key: string) => boolean} [input.permissionExists] active catalogue permission check
 */
export function prepareFormVersion({
  draft,
  registeredForm,
  sourceVersions,
  recordAccessRegistry,
  permissionExists = null,
}) {
  const findings = createFindings();
  const blockers = [];
  const { value, error } = formConfigSchema.validate(draft ?? {}, { abortEarly: false });
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

  // --- Sources: header and lines -------------------------------------------------------------
  const sources = new Map(); // alias → { version, columns: Map, keyCandidates: Map, keyless }
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
    };
    sources.set(aliasName, entry);
    return entry;
  };

  const header = useSource(
    value.header.sourceVersionId,
    value.header.alias,
    'header.sourceVersionId',
  );
  let headerKey = null;
  if (header) {
    headerKey = header.keyCandidates.get(value.header.keyCandidate) ?? null;
    if (!headerKey) {
      findings.error(
        'KEY_CANDIDATE_NOT_FOUND',
        'header.keyCandidate',
        'Not a key candidate of the header source',
      );
    } else {
      headerKey.columns.forEach((name) => {
        const keyColumn = header.columns.get(name);
        if (!keyColumn || keyIneligibility(keyColumn)) {
          findings.error(
            'KEY_COLUMN_INVALID',
            'header.keyCandidate',
            `Key column ${name} is not usable`,
          );
        }
      });
      if (headerKey.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) {
        blockers.push({ code: 'PROVISIONAL_KEY', path: 'header.keyCandidate' });
      }
    }
  }

  value.lines.forEach((line, index) => {
    const at = `lines[${index}]`;
    if (value.lines.findIndex((other) => other.code === line.code) !== index) {
      findings.error('LINE_CODE_DUPLICATE', `${at}.code`, `Line ${line.code} is declared twice`);
    }
    const source = useSource(line.sourceVersionId, line.alias, `${at}.sourceVersionId`);
    if (!source || !header) return;
    line.join.forEach((pair, position) => {
      const left = source.columns.get(pair.lineColumn);
      const right = header.columns.get(pair.headerColumn);
      const jat = `${at}.join[${position}]`;
      if (!left)
        findings.error(
          'COLUMN_NOT_EXPOSED',
          jat,
          `${pair.lineColumn} is not an exposed line column`,
        );
      if (!right)
        findings.error(
          'COLUMN_NOT_EXPOSED',
          jat,
          `${pair.headerColumn} is not an exposed header column`,
        );
      if (left && right && !joinable(left, right)) {
        findings.error('JOIN_TYPE_INCOMPATIBLE', jat, 'The joined columns have incompatible types');
      }
    });
    if (headerKey) {
      const joined = new Set(line.join.map((pair) => pair.headerColumn));
      if (!headerKey.columns.every((name) => joined.has(name))) {
        findings.warning(
          'JOIN_NOT_ON_HEADER_KEY',
          `${at}.join`,
          'The join does not cover the header record key',
        );
      }
    }
    line.fixedFilters.forEach((filter, position) => {
      const fat = `${at}.fixedFilters[${position}]`;
      const filterColumn = source.columns.get(filter.column);
      if (!filterColumn) {
        findings.error('COLUMN_NOT_EXPOSED', fat, `${filter.column} is not an exposed line column`);
        return;
      }
      try {
        // Constant equality only, stored in its exact canonical form.
        filter.value = canonicalKeyValue(filterColumn, filter.value);
      } catch (cause) {
        findings.error(
          cause instanceof MappingValueError ? cause.code : 'FILTER_VALUE_INVALID',
          fat,
          'The fixed filter value is not valid for this column',
        );
      }
    });
    line.orderBy.forEach((order, position) => {
      if (!source.columns.has(order.column)) {
        findings.error(
          'COLUMN_NOT_EXPOSED',
          `${at}.orderBy[${position}]`,
          `${order.column} is not exposed`,
        );
      }
    });
    if (!line.orderBy.length) {
      findings.warning('LINE_ORDER_UNSPECIFIED', `${at}.orderBy`, 'Row order is not guaranteed');
    }

    if (line.lineKey === null) {
      // Keyless: rows are kept exactly as stored (duplicates included); no stable row identity.
      source.keyless = true;
      if (line.rowIdentity !== 'NONE') {
        findings.error(
          'ROW_IDENTITY_MISMATCH',
          `${at}.rowIdentity`,
          'A line without a key has rowIdentity NONE',
        );
      }
      if (!line.keylessAcknowledged) {
        findings.error(
          'KEYLESS_ACK_REQUIRED',
          `${at}.keylessAcknowledged`,
          'Acknowledge that rows have no stable identity',
        );
      }
      if (line.usage.some((usage) => !KEYLESS_LINE_USAGES.includes(usage))) {
        findings.error(
          'KEYLESS_LINE_USAGE_NOT_ALLOWED',
          `${at}.usage`,
          'Lines without a key allow DISPLAY and TEMPLATE only',
        );
      }
      if (line.cardinality === 'ONE') {
        findings.error(
          'KEYLESS_LINE_CARDINALITY',
          `${at}.cardinality`,
          'A line without a key cannot be ONE',
        );
      }
      blockers.push({ code: 'KEYLESS_LINE_RESTRICTED_USE', path: at });
    } else {
      const lineKey = source.keyCandidates.get(line.lineKey);
      if (line.rowIdentity !== 'KEYED') {
        findings.error(
          'ROW_IDENTITY_MISMATCH',
          `${at}.rowIdentity`,
          'A keyed line has rowIdentity KEYED',
        );
      }
      if (!lineKey) {
        findings.error(
          'KEY_CANDIDATE_NOT_FOUND',
          `${at}.lineKey`,
          'Not a key candidate of the line source',
        );
      } else if (lineKey.enforcement !== ENFORCEMENT.DATABASE_ENFORCED) {
        blockers.push({ code: 'PROVISIONAL_LINE_KEY', path: `${at}.lineKey` });
      }
      if (line.cardinality === 'ONE') {
        const joinColumns = line.join.map((pair) => pair.lineColumn).sort();
        const unique = [...source.keyCandidates.values()].some(
          (key) => JSON.stringify([...key.columns].sort()) === JSON.stringify(joinColumns),
        );
        if (!unique) {
          findings.warning(
            'LINE_CARDINALITY_NOT_ENFORCED',
            `${at}.cardinality`,
            'ONE is not backed by a key on the join columns',
          );
        }
      }
    }
  });

  // --- Fields ----------------------------------------------------------------------------------
  const fields = new Map();
  value.fields.forEach((field, index) => {
    const at = `fields[${index}]`;
    if (fields.has(field.code)) {
      findings.error('FIELD_CODE_DUPLICATE', `${at}.code`, `Field ${field.code} is declared twice`);
      return;
    }
    const source = sources.get(field.ref.alias);
    const sourceColumn = source?.columns.get(field.ref.column);
    fields.set(field.code, {
      ...field,
      header: field.ref.alias === value.header.alias,
      sourceColumn,
    });
    if (!source) {
      findings.error('ALIAS_UNKNOWN', `${at}.ref.alias`, `Unknown source alias ${field.ref.alias}`);
      return;
    }
    if (!sourceColumn) {
      findings.error(
        'COLUMN_NOT_EXPOSED',
        `${at}.ref.column`,
        `${field.ref.column} is not an exposed column`,
      );
      return;
    }
    const reason = fieldTypeIncompatibility(field.type, sourceColumn);
    if (reason)
      findings.error(reason, `${at}.type`, `${field.type} cannot read ${sourceColumn.oracleType}`);
    if (SENSITIVITY_RANK[field.sensitivity] < SENSITIVITY_RANK[sourceColumn.dataClass]) {
      findings.error(
        'SENSITIVITY_DOWNGRADE',
        `${at}.sensitivity`,
        `The source column is classified ${sourceColumn.dataClass}; the field cannot be less sensitive`,
      );
    }
    if (source.keyless && field.usage.some((usage) => !KEYLESS_LINE_USAGES.includes(usage))) {
      findings.error(
        'KEYLESS_FIELD_USAGE_NOT_ALLOWED',
        `${at}.usage`,
        'Fields of a line without a key allow DISPLAY and TEMPLATE only',
      );
    }
  });

  const headerField = (fieldCode, path, { types = null, refTypes = null } = {}) => {
    const field = fields.get(fieldCode);
    if (!field) {
      findings.error('FIELD_UNKNOWN', path, `Unknown field ${fieldCode}`);
      return null;
    }
    if (!field.header)
      findings.error('FIELD_NOT_HEADER', path, `${fieldCode} must be a header field`);
    if (types && !types.includes(field.type)) {
      findings.error(
        'FIELD_TYPE_NOT_ALLOWED',
        path,
        `${fieldCode} must be of type ${types.join(' or ')}`,
      );
    }
    if (refTypes && !refTypes.includes(field.refType)) {
      findings.error(
        'REFERENCE_TYPE_NOT_ALLOWED',
        path,
        `${fieldCode} must reference ${refTypes.join(' or ')}`,
      );
    }
    return field;
  };

  // --- Person attributes and organization scope (recorded; resolution is M4) -----------------
  value.attributes.forEach((attribute, index) =>
    headerField(attribute.field, `attributes[${index}].field`, {
      types: ['REFERENCE'],
      refTypes: PERSON_REF_TYPES,
    }),
  );
  if (!value.orgScope) {
    findings.error(
      'ORG_SCOPE_REQUIRED',
      'orgScope',
      'Declare how the organization scope is determined',
    );
  } else if (value.orgScope.kind === 'FIELD') {
    headerField(value.orgScope.field, 'orgScope.field', {
      types: ['REFERENCE'],
      refTypes: ['ORGANIZATION_REF'],
    });
  } else if (value.orgScope.kind === 'RESOLVER_REQUIRED') {
    headerField(value.orgScope.input, 'orgScope.input', { types: ['REFERENCE'] });
    blockers.push({ code: 'PROVISIONAL_ORG_SCOPE', path: 'orgScope' });
    blockers.push({ code: 'RESOLVER_UNBOUND', path: 'orgScope' });
  }

  // --- Status and events -----------------------------------------------------------------------
  const events = new Set(value.events.map((event) => event.code));
  if (!value.events.length)
    findings.error('EVENT_REQUIRED', 'events', 'Declare at least one trigger event');
  const statusCodes = new Set();
  if (!value.status) {
    findings.error('STATUS_REQUIRED', 'status', 'Map the business status of the form');
  } else {
    const statusField = headerField(value.status.field, 'status.field', {
      types: ['TEXT', 'INTEGER'],
    });
    const stored = new Set();
    value.status.values.forEach((status, index) => {
      const at = `status.values[${index}]`;
      statusCodes.add(status.code);
      let storedValue = status.stored;
      if (statusField?.type === 'INTEGER') {
        try {
          storedValue = canonicalInteger(status.stored);
          status.stored = storedValue;
        } catch {
          findings.error('STATUS_VALUE_INVALID', `${at}.stored`, 'Not an integer status value');
        }
      }
      if (stored.has(storedValue)) {
        findings.error(
          'STATUS_STORED_DUPLICATE',
          `${at}.stored`,
          'Two statuses share a stored value',
        );
      }
      stored.add(storedValue);
      if (status.verification === 'PROVISIONAL')
        blockers.push({ code: 'PROVISIONAL_STATUS', path: at });
    });
    if (!value.status.values.some((status) => status.category === 'INITIAL')) {
      findings.error(
        'STATUS_INITIAL_REQUIRED',
        'status.values',
        'One status must be in category INITIAL',
      );
    }
    const seen = new Set();
    value.status.transitions.forEach((transition, index) => {
      const at = `status.transitions[${index}]`;
      if (!events.has(transition.event))
        findings.error('EVENT_UNKNOWN', `${at}.event`, `Unknown event ${transition.event}`);
      for (const statusCode of [...transition.from, transition.to]) {
        if (!statusCodes.has(statusCode))
          findings.error('STATUS_UNKNOWN', at, `Unknown status ${statusCode}`);
      }
      for (const from of transition.from) {
        const pair = `${transition.event}\u0000${from}`;
        if (seen.has(pair))
          findings.error(
            'TRANSITION_AMBIGUOUS',
            at,
            `${transition.event} from ${from} is declared twice`,
          );
        seen.add(pair);
      }
      if (transition.verification === 'PROVISIONAL')
        blockers.push({ code: 'PROVISIONAL_TRANSITION', path: at });
    });
  }
  value.events.forEach((event, index) => {
    const at = `events[${index}]`;
    for (const statusCode of event.resubmitFrom) {
      if (!statusCodes.has(statusCode))
        findings.error('STATUS_UNKNOWN', `${at}.resubmitFrom`, `Unknown status ${statusCode}`);
    }
    if (event.verification === 'PROVISIONAL')
      blockers.push({ code: 'PROVISIONAL_EVENT', path: at });
  });

  // --- Deep link and record access -------------------------------------------------------------
  const routeParams = registeredForm.detailRoute
    ? [...registeredForm.detailRoute.matchAll(ROUTE_PARAM)].map((match) => match[1]).sort()
    : [];
  if (value.deepLink) {
    if (!registeredForm.detailRoute) {
      findings.error(
        'DEEP_LINK_ROUTE_MISSING',
        'deepLink',
        'The registered form has no detail route',
      );
    } else {
      const mapped = Object.keys(value.deepLink.params).sort();
      if (JSON.stringify(mapped) !== JSON.stringify(routeParams)) {
        findings.error(
          'DEEP_LINK_PARAMS_MISMATCH',
          'deepLink.params',
          `The route needs ${routeParams.join(', ') || 'no'} parameters`,
        );
      }
      for (const [param, binding] of Object.entries(value.deepLink.params)) {
        if (headerKey && !headerKey.columns.includes(binding.keyColumn)) {
          findings.error(
            'DEEP_LINK_NOT_KEY',
            `deepLink.params.${param}`,
            'Route parameters must come from the record key',
          );
        }
      }
    }
  } else if (routeParams.length) {
    findings.warning(
      'DEEP_LINK_NOT_MAPPED',
      'deepLink',
      'The detail route parameters are not mapped',
    );
  }

  value.recordAccess.additionalPermissions.forEach((key, index) => {
    const at = `recordAccess.additionalPermissions[${index}]`;
    if (typeof permissionExists !== 'function') {
      findings.warning(
        'PERMISSION_NOT_VERIFIED',
        at,
        'The permission was not checked against the catalogue',
      );
    } else if (!permissionExists(key)) {
      findings.error('PERMISSION_UNKNOWN', at, `${key} is not an active permission`);
    }
  });
  if (!recordAccessRegistry?.has(registeredForm.formCode)) {
    blockers.push({ code: 'NO_RECORD_ACCESS_PROVIDER', path: 'recordAccess' });
  }

  const config = { schema: FORM_SCHEMA, formCode: registeredForm.formCode, ...value };
  return result(findings, blockers, config, value.header.sourceVersionId);
}

function result(findings, blockers, config, headerSourceVersionId) {
  let payload = null;
  if (config) {
    payload = fingerprint(config);
    if (payload.bytes > MAX_CONFIG_BYTES) {
      findings.error(
        'CONFIG_TOO_LARGE',
        '$',
        `The configuration exceeds ${MAX_CONFIG_BYTES} bytes`,
      );
    }
  }
  return Object.freeze({
    valid: !findings.hasErrors(),
    findings: findings.list(),
    publicationBlockers: freezeBlockers(blockers),
    schemaVersion: FORM_SCHEMA_VERSION,
    headerSourceVersionId,
    config: config ? JSON.parse(payload.json) : null,
    configJson: payload?.json ?? null,
    configSha256: payload?.sha256 ?? null,
  });
}
