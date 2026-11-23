import { FORM_SCHEMA, FORM_SCHEMA_VERSION, prepareFormVersion } from './formContract.js';
import { FORM_SCHEMA_V2, FORM_SCHEMA_VERSION_V2, prepareFormVersionV2 } from './formContractV2.js';
import { MappingValueError } from './typeCompatibility.js';

/*
 * Version dispatch of the form mapping contracts. Every stored form version keeps the contract it
 * was written with (SCHEMA_VERSION / `schema`); readers dispatch on it and never reinterpret one
 * version as another. An unknown version is refused (fail closed), never guessed.
 */
export const FORM_SCHEMAS = Object.freeze({
  [FORM_SCHEMA_VERSION]: FORM_SCHEMA,
  [FORM_SCHEMA_VERSION_V2]: FORM_SCHEMA_V2,
});

const unsupported = () =>
  new MappingValueError('FORM_SCHEMA_UNSUPPORTED', 'Unsupported form mapping contract version');

/** Validates a draft with the contract of `schemaVersion` (1 or 2). */
export function prepareFormMapping(schemaVersion, input) {
  if (schemaVersion === FORM_SCHEMA_VERSION) return prepareFormVersion(input);
  if (schemaVersion === FORM_SCHEMA_VERSION_V2) return prepareFormVersionV2(input);
  throw unsupported();
}

/**
 * Every source version a stored configuration references: the header/root (also held by the
 * HEADER_SOURCE_VERSION_ID foreign key) and all others — v1 `$.lines[*].sourceVersionId`, v2
 * `$.sources[*].sourceVersionId`. The dependency check in sourceMapping.repository.js reads the
 * same two paths structurally in SQL; this is its in-process equivalent for later packages.
 */
export function formSourceReferences(config) {
  if (config?.schema === FORM_SCHEMA) {
    return Object.freeze({
      header: config.header.sourceVersionId,
      others: Object.freeze(config.lines.map((line) => line.sourceVersionId)),
    });
  }
  if (config?.schema === FORM_SCHEMA_V2) {
    return Object.freeze({
      header: config.root.sourceVersionId,
      others: Object.freeze(config.sources.map((source) => source.sourceVersionId)),
    });
  }
  throw unsupported();
}
