import { CODE, isOracleIdentifier } from './identifiers.js';
import { keyIneligibility } from './typeCompatibility.js';

/*
 * How far a record or line key can be trusted.
 *
 *   DATABASE_ENFORCED — an ENABLED + VALIDATED primary key or unique constraint, or a VALID
 *     non-function-based unique index, covers exactly the key columns (or a subset of them), and
 *     — for unique constraints/indexes — every key column is NOT NULL. Oracle guarantees it.
 *   DECLARED — anything else: an identity column (ALWAYS or BY DEFAULT), an application-generated
 *     value or an owner attestation. Nothing in the database prevents a duplicate, so a DECLARED
 *     key is ALWAYS provisional: it requires documented assurance, its uniqueness observation is
 *     evidence with a date (never a guarantee), every read by key still fails closed on duplicates
 *     (recordKey.assertSingleRecord) and publishing it needs explicit M6 governance.
 * Attestation identity and time are always set by the server.
 */
export const ENFORCEMENT = Object.freeze({
  DATABASE_ENFORCED: 'DATABASE_ENFORCED',
  DECLARED: 'DECLARED',
});

export const ASSURANCE_BASES = Object.freeze([
  'GENERATED_ALWAYS_IDENTITY',
  'GENERATED_BY_DEFAULT_IDENTITY',
  'APPLICATION_GENERATED',
  'OWNER_ATTESTED',
]);

const IDENTITY_BASIS = Object.freeze({
  GENERATED_ALWAYS_IDENTITY: 'ALWAYS',
  GENERATED_BY_DEFAULT_IDENTITY: 'BY DEFAULT',
});

const sameOrSubset = (enforcedColumns, keyColumns) =>
  enforcedColumns.length > 0 && enforcedColumns.every((name) => keyColumns.includes(name));

/**
 * Assessment of one key candidate against the live dictionary evidence
 * (`{ columns, constraints, uniqueIndexes }` from dictionary.service.js).
 * Returns `{ code, columns, enforcement, provisional, enforcedBy, findings }`.
 */
export function assessKeyCandidate(candidate, evidence, path = 'keyCandidate') {
  const findings = [];
  const error = (code, message, at = path) =>
    findings.push({ severity: 'ERROR', code, path: at, message });
  const warning = (code, message, at = path) =>
    findings.push({ severity: 'WARNING', code, path: at, message });

  const columns = Array.isArray(candidate?.columns) ? candidate.columns : [];
  if (!CODE.test(candidate?.code ?? '')) error('KEY_CODE_INVALID', 'Key candidate code is invalid');
  if (!columns.length) error('KEY_COLUMNS_REQUIRED', 'A key needs at least one column');
  if (new Set(columns).size !== columns.length)
    error('KEY_COLUMN_DUPLICATE', 'Column listed twice');

  const byName = new Map((evidence?.columns ?? []).map((column) => [column.name, column]));
  for (const [index, name] of columns.entries()) {
    const at = `${path}.columns[${index}]`;
    if (!isOracleIdentifier(name)) error('KEY_COLUMN_INVALID', 'Not an Oracle column name', at);
    else if (!byName.has(name)) error('KEY_COLUMN_NOT_FOUND', `Column ${name} does not exist`, at);
    else {
      const reason = keyIneligibility(byName.get(name));
      if (reason) error(reason, `Column ${name} cannot be part of a key`, at);
    }
  }

  const allNotNull = columns.every((name) => byName.get(name)?.nullable === false);
  const enforcing = [
    ...(evidence?.constraints ?? [])
      .filter((c) => c.status === 'ENABLED' && c.validated === 'VALIDATED')
      .filter((c) => c.type === 'P' || (c.type === 'U' && allNotNull))
      .map((c) => ({ kind: c.type === 'P' ? 'PRIMARY_KEY' : 'UNIQUE_CONSTRAINT', ...c })),
    ...(evidence?.uniqueIndexes ?? [])
      .filter((i) => i.status === 'VALID' && !i.functionBased && allNotNull)
      .map((i) => ({ kind: 'UNIQUE_INDEX', ...i })),
  ].filter((item) => sameOrSubset(item.columns, columns));

  if (enforcing.length && !findings.some((f) => f.severity === 'ERROR')) {
    const best = enforcing.find((item) => item.columns.length === columns.length) ?? enforcing[0];
    if (best.columns.length < columns.length) {
      warning('KEY_NOT_MINIMAL', `${best.name} already makes a subset of these columns unique`);
    }
    return Object.freeze({
      code: candidate.code,
      columns: Object.freeze([...columns]),
      enforcement: ENFORCEMENT.DATABASE_ENFORCED,
      provisional: false,
      enforcedBy: Object.freeze({ kind: best.kind, name: best.name }),
      findings: Object.freeze(findings),
    });
  }

  // DECLARED: documented assurance is mandatory and must agree with the dictionary.
  const assurance = candidate?.assurance;
  if (!assurance) {
    error(
      'KEY_ASSURANCE_REQUIRED',
      'The database does not enforce this key; document its assurance',
    );
  } else {
    if (!ASSURANCE_BASES.includes(assurance.basis)) {
      error('KEY_ASSURANCE_BASIS_INVALID', 'Unknown assurance basis', `${path}.assurance.basis`);
    } else if (IDENTITY_BASIS[assurance.basis]) {
      const identity = columns.length === 1 ? byName.get(columns[0])?.identity : null;
      if (identity !== IDENTITY_BASIS[assurance.basis]) {
        error(
          'KEY_ASSURANCE_INCONSISTENT',
          `The dictionary does not show a GENERATED ${IDENTITY_BASIS[assurance.basis]} identity column`,
          `${path}.assurance.basis`,
        );
      }
    }
    for (const [name, max] of [
      ['evidenceRef', 500],
      ['rationale', 1000],
    ]) {
      const value = assurance[name];
      if (typeof value !== 'string' || !value.trim() || value.length > max) {
        error(
          'KEY_ASSURANCE_INCOMPLETE',
          `${name} is required (at most ${max} characters)`,
          `${path}.assurance.${name}`,
        );
      }
    }
  }
  if (columns.length && !allNotNull) {
    warning('KEY_COLUMN_NULLABLE', 'A key column allows NULL; null keys are refused at read time');
  }
  warning(
    'KEY_NOT_DATABASE_ENFORCED',
    'Uniqueness is not enforced by Oracle; this key is provisional',
  );
  return Object.freeze({
    code: candidate?.code,
    columns: Object.freeze([...columns]),
    enforcement: ENFORCEMENT.DECLARED,
    provisional: true,
    enforcedBy: null,
    findings: Object.freeze(findings),
  });
}

/**
 * Applies a validation-time uniqueness observation (`{ rowCount, nullKeyRows, duplicateKeyGroups,
 * observedAt }`). Duplicates or null keys are errors. A clean observation is recorded as dated
 * evidence only: it never upgrades a DECLARED key and never removes its provisional status.
 */
export function observationFindings(observation, path = 'keyCandidate') {
  const findings = [];
  if (!observation) return findings;
  if (observation.duplicateKeyGroups > 0) {
    findings.push({
      severity: 'ERROR',
      code: 'KEY_DUPLICATES_OBSERVED',
      path,
      message: `${observation.duplicateKeyGroups} key value(s) occur more than once`,
    });
  }
  if (observation.nullKeyRows > 0) {
    findings.push({
      severity: 'ERROR',
      code: 'KEY_NULLS_OBSERVED',
      path,
      message: `${observation.nullKeyRows} row(s) have a null key part`,
    });
  }
  return findings;
}

/**
 * Server-side assurance record: client-supplied attestedBy/attestedAt are ignored. An unchanged
 * assurance keeps its original attestation; any change is re-attested by the current actor.
 */
export function attestAssurance(incoming, previous, { actorUserId, now }) {
  if (!incoming) return null;
  const content = {
    basis: incoming.basis,
    evidenceRef: incoming.evidenceRef,
    rationale: incoming.rationale,
  };
  const unchanged =
    previous &&
    previous.basis === content.basis &&
    previous.evidenceRef === content.evidenceRef &&
    previous.rationale === content.rationale;
  return unchanged
    ? { ...content, attestedBy: previous.attestedBy, attestedAt: previous.attestedAt }
    : { ...content, attestedBy: String(actorUserId), attestedAt: now.toISOString() };
}
