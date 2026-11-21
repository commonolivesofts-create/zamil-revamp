import Joi from 'joi';
import { createFindings } from './findings.js';
import {
  alias,
  code,
  column,
  EVIDENCE_KINDS,
  FIELD_USAGES,
  formVersionResult,
  id,
  KEYLESS_LINE_USAGES,
  PERSON_ROLES,
  semanticsSchema,
  SENSITIVITIES,
  STATUS_CATEGORIES,
  validateFormSemantics,
  VERIFICATION,
} from './formSemantics.js';
import { ENFORCEMENT } from './keyAssurance.js';
import {
  canonicalKeyValue,
  joinable,
  keyIneligibility,
  MappingValueError,
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

// Shared vocabularies (formSemantics.js), re-exported for existing importers.
export {
  EVIDENCE_KINDS,
  FIELD_USAGES,
  KEYLESS_LINE_USAGES,
  PERSON_ROLES,
  SENSITIVITIES,
  STATUS_CATEGORIES,
  VERIFICATION,
};

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
  ...semanticsSchema,
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

  // --- Fields, attributes, organization scope, status, events, deep link, record access ---------
  validateFormSemantics({
    value,
    registeredForm,
    sources,
    rootKeyColumns: headerKey ? headerKey.columns : null,
    // v1: record-level semantics come from the header source only.
    placement: (field) =>
      field.ref.alias === value.header.alias
        ? null
        : { code: 'FIELD_NOT_HEADER', message: `${field.code} must be a header field` },
    findings,
    blockers,
    recordAccessRegistry,
    permissionExists,
  });

  const config = { schema: FORM_SCHEMA, formCode: registeredForm.formCode, ...value };
  return result(findings, blockers, config, value.header.sourceVersionId);
}

const result = (findings, blockers, config, headerSourceVersionId) =>
  formVersionResult({
    findings,
    blockers,
    config,
    headerSourceVersionId,
    schemaVersion: FORM_SCHEMA_VERSION,
    maxBytes: MAX_CONFIG_BYTES,
  });
