/*
 * Oracle identifiers in their stored dictionary form (upper case, unquoted shape). Only names that
 * pass these checks AND were confirmed in the live dictionary may ever be placed in SQL text, and
 * then always double-quoted. Values are never placed in SQL text: they are bound.
 */
export const ORACLE_IDENTIFIER = /^[A-Z][A-Z0-9_$#]{0,127}$/;
// Mapping aliases and configuration codes (fields, events, statuses, key candidates, lines).
export const ALIAS = /^[A-Z][A-Z0-9_]{0,29}$/;
export const CODE = /^[A-Z][A-Z0-9_]{0,79}$/;

export class IdentifierError extends Error {
  constructor(label, reason) {
    super(`${label} ${reason}`);
    this.name = 'IdentifierError';
    this.code = 'INVALID_IDENTIFIER';
  }
}

export const isOracleIdentifier = (value) =>
  typeof value === 'string' && ORACLE_IDENTIFIER.test(value);

export function assertOracleIdentifier(value, label = 'Identifier') {
  if (!isOracleIdentifier(value)) {
    throw new IdentifierError(label, 'must be an upper-case Oracle name (A-Z, 0-9, _, $, #)');
  }
  return value;
}

/** `"NAME"` — the identifier is validated first, so it can never contain a quote. */
export const quoteIdentifier = (value, label) => `"${assertOracleIdentifier(value, label)}"`;

/** `"OWNER"."OBJECT"`. */
export const qualifiedName = (owner, object) =>
  `${quoteIdentifier(owner, 'Owner')}.${quoteIdentifier(object, 'Object name')}`;
