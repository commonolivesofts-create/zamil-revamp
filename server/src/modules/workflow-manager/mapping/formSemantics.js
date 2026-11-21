import Joi from 'joi';
import { fingerprint } from './canonicalJson.js';
import { freezeBlockers } from './findings.js';
import { CODE, ALIAS, ORACLE_IDENTIFIER } from './identifiers.js';
import { DATA_CLASSES } from './sourceContract.js';
import {
  canonicalInteger,
  FIELD_TYPES,
  fieldTypeIncompatibility,
  REFERENCE_TYPES,
} from './typeCompatibility.js';

/*
 * Business semantics shared by every form mapping contract version (`zrv.wf.form/1` and
 * `zrv.wf.form/2`): the typed field catalogue, person attributes, organization scope, status and
 * transitions, trigger events, the deep link to the form's own detail page and additional
 * record-access permissions. Only WHERE data comes from differs between the versions (v1: header
 * and directly joined lines; v2: a relationship graph), so each version passes in its sources and
 * a placement rule; the checks, codes and messages here are the same for both.
 */
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
export const SENSITIVITY_RANK = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  PERSONAL: 2,
  SENSITIVE: 3,
});

const PERSON_REF_TYPES = Object.freeze(['EMPLOYEE_NUMBER_REF', 'USER_ID_REF', 'PERSON_ID_REF']);
const PERMISSION_KEY = /^[A-Z][A-Z0-9_]*\.[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/;
const ROUTE_PARAM = /:([A-Za-z][A-Za-z0-9]*)/g;

// --- Joi building blocks shared by the contract versions ----------------------------------------
export const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
export const code = Joi.string().pattern(CODE);
export const alias = Joi.string().pattern(ALIAS);
export const column = Joi.string().pattern(ORACLE_IDENTIFIER);
export const text = (max) =>
  Joi.string()
    .trim()
    .min(1)
    .max(max)
    .pattern(/^[^\p{Cc}]+$/u);
export const label = Joi.object({ en: text(200).required(), ar: text(200) });
export const verification = Joi.string()
  .valid(...VERIFICATION)
  .required();
export const evidence = Joi.object({
  kind: Joi.string()
    .valid(...EVIDENCE_KINDS)
    .required(),
  reference: text(500).required(),
});

export const semanticsSchema = {
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
          evidence: evidence.required(),
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
};

/**
 * Validates the shared semantics of a schema-valid mapping.
 *
 * @param {object} input
 * @param {object} input.value          schema-validated mapping (fields, attributes, orgScope, …)
 * @param {object} input.registeredForm M1 row: { formCode, detailRoute }
 * @param {Map<string, {columns: Map, keyless: boolean}>} input.sources alias → usable source
 * @param {string[]|null} input.rootKeyColumns columns of the root record key (null when unknown)
 * @param {(field: object, purpose: string) => ({code: string, message: string}|null)} input.placement
 *        where a field may come from for ATTRIBUTE, ORG_SCOPE, ORG_SCOPE_INPUT and STATUS
 * @param {object} input.findings       createFindings() collector
 * @param {object[]} input.blockers     publication blockers collector
 * @returns {Map<string, object>} field code → field with its resolved source column
 */
export function validateFormSemantics({
  value,
  registeredForm,
  sources,
  rootKeyColumns,
  placement,
  findings,
  blockers,
  recordAccessRegistry,
  permissionExists,
}) {
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
    fields.set(field.code, { ...field, sourceColumn });
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

  const recordField = (fieldCode, path, purpose, { types = null, refTypes = null } = {}) => {
    const field = fields.get(fieldCode);
    if (!field) {
      findings.error('FIELD_UNKNOWN', path, `Unknown field ${fieldCode}`);
      return null;
    }
    const misplaced = placement(field, purpose);
    if (misplaced) findings.error(misplaced.code, path, misplaced.message);
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
    recordField(attribute.field, `attributes[${index}].field`, 'ATTRIBUTE', {
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
    recordField(value.orgScope.field, 'orgScope.field', 'ORG_SCOPE', {
      types: ['REFERENCE'],
      refTypes: ['ORGANIZATION_REF'],
    });
  } else if (value.orgScope.kind === 'RESOLVER_REQUIRED') {
    recordField(value.orgScope.input, 'orgScope.input', 'ORG_SCOPE_INPUT', {
      types: ['REFERENCE'],
    });
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
    const statusField = recordField(value.status.field, 'status.field', 'STATUS', {
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
        if (rootKeyColumns && !rootKeyColumns.includes(binding.keyColumn)) {
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
  return fields;
}

/**
 * The frozen result of a form mapping preparation: validity, findings, publication blockers and
 * the canonical CONFIG_JSON with its SHA-256 (null when the draft could not be read at all).
 */
export function formVersionResult({
  findings,
  blockers,
  config,
  headerSourceVersionId,
  schemaVersion,
  maxBytes,
}) {
  let payload = null;
  if (config) {
    payload = fingerprint(config);
    if (payload.bytes > maxBytes) {
      findings.error('CONFIG_TOO_LARGE', '$', `The configuration exceeds ${maxBytes} bytes`);
    }
  }
  return Object.freeze({
    valid: !findings.hasErrors(),
    findings: findings.list(),
    publicationBlockers: freezeBlockers(blockers),
    schemaVersion,
    headerSourceVersionId,
    config: config ? JSON.parse(payload.json) : null,
    configJson: payload?.json ?? null,
    configSha256: payload?.sha256 ?? null,
  });
}
