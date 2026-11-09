import Joi from 'joi';
import { fingerprint } from './canonicalJson.js';
import { compareColumns } from './dictionary.service.js';
import { createFindings, freezeBlockers } from './findings.js';
import { CODE, ORACLE_IDENTIFIER } from './identifiers.js';
import {
  ASSURANCE_BASES,
  assessKeyCandidate,
  attestAssurance,
  ENFORCEMENT,
  observationFindings,
} from './keyAssurance.js';
import { describeOracleType, FAMILIES } from './typeCompatibility.js';

/*
 * Source mapping contract `zrv.wf.source/1` (XX_ZRV_WF_SOURCE_VERSIONS.CONFIG_JSON, SCHEMA_VERSION 1).
 *
 * The author supplies only choices: which columns are exposed, their data class, and key candidates
 * with documented assurance. Everything factual is derived on the server from the live dictionary
 * (or the registered handler contract): column datatypes, the dictionary snapshot, key enforcement,
 * uniqueness observations and attestation. Unknown properties are rejected, so no SQL text,
 * expression or filter can enter a source mapping. The result is canonical JSON with a server
 * SHA-256; publication blockers are reported for M6, never acted on.
 */
export const SOURCE_SCHEMA = 'zrv.wf.source/1';
export const SOURCE_SCHEMA_VERSION = 1;
export const MAX_CONFIG_BYTES = 256 * 1024;
export const DATA_CLASSES = Object.freeze(['PUBLIC', 'INTERNAL', 'PERSONAL', 'SENSITIVE']);

const identifier = Joi.string().pattern(ORACLE_IDENTIFIER);
const code = Joi.string().pattern(CODE);
const text = (max) =>
  Joi.string()
    .trim()
    .min(1)
    .max(max)
    .pattern(/^[^\p{Cc}]+$/u);

export const sourceDraftSchema = Joi.object({
  columns: Joi.array()
    .items(
      Joi.object({
        name: identifier.required(),
        exposed: Joi.boolean().required(),
        dataClass: Joi.string()
          .valid(...DATA_CLASSES)
          .required(),
      }),
    )
    .min(1)
    .max(1000)
    .unique('name')
    .required(),
  keyCandidates: Joi.array()
    .items(
      Joi.object({
        code: code.required(),
        columns: Joi.array().items(identifier).min(1).max(32).unique().required(),
        assurance: Joi.object({
          basis: Joi.string()
            .valid(...ASSURANCE_BASES)
            .required(),
          evidenceRef: text(500).required(),
          rationale: text(1000).required(),
        })
          .allow(null)
          .default(null),
      }),
    )
    .max(20)
    .unique('code')
    .default([]),
});

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const byCode = (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/**
 * Builds and validates a source mapping version from an author draft and server facts.
 *
 * @param {object} input
 * @param {object} input.draft            author choices (sourceDraftSchema)
 * @param {object} input.registeredSource M1 row: { sourceCode, sourceKind, ownerName, objectName,
 *                                        handlerCode, isActive }
 * @param {object} [input.snapshot]       dictionary.service snapshot (TABLE/VIEW)
 * @param {object} [input.handlerRegistry] source handler registry (HANDLER)
 * @param {object} [input.observations]   { [keyCode]: dictionary uniqueness observation }
 * @param {object} [input.previousConfig] the version's current config (keeps attestations)
 * @param {object} input.actor            { userId }
 * @param {Date}   [input.now]
 */
export function prepareSourceVersion({
  draft,
  registeredSource,
  snapshot = null,
  handlerRegistry = null,
  observations = {},
  previousConfig = null,
  actor,
  now = new Date(),
}) {
  const findings = createFindings();
  const blockers = [];
  const { value, error } = sourceDraftSchema.validate(draft ?? {}, { abortEarly: false });
  if (error) {
    for (const detail of error.details) {
      findings.error('SCHEMA_INVALID', detail.path.join('.') || '$', detail.message);
    }
    return result(findings, blockers, null);
  }

  const kind = registeredSource?.sourceKind;
  if (!['TABLE', 'VIEW', 'HANDLER'].includes(kind)) {
    findings.error('SOURCE_NOT_REGISTERED', 'source', 'The data source is not registered');
    return result(findings, blockers, null);
  }
  if (registeredSource.isActive === false) {
    findings.warning('SOURCE_INACTIVE', 'source', 'The data source is inactive');
    blockers.push({ code: 'SOURCE_INACTIVE', path: 'source' });
  }

  let available;
  let dictionary = null;
  let handler = null;
  let evidence;
  if (kind === 'HANDLER') {
    const contract = handlerRegistry?.contract(registeredSource.handlerCode) ?? null;
    if (!contract) {
      findings.error('SOURCE_HANDLER_NOT_REGISTERED', 'source', 'The handler is not registered');
      return result(findings, blockers, null);
    }
    handler = { code: contract.code, contractVersion: contract.contractVersion };
    available = contract.fields;
    evidence = { columns: available, constraints: [], uniqueIndexes: [] };
  } else {
    if (
      !snapshot ||
      snapshot.owner !== registeredSource.ownerName ||
      snapshot.objectName !== registeredSource.objectName ||
      snapshot.objectType !== kind
    ) {
      findings.error(
        'DICTIONARY_SNAPSHOT_MISMATCH',
        'source',
        'A live dictionary snapshot of the registered object is required',
      );
      return result(findings, blockers, null);
    }
    dictionary = {
      objectType: snapshot.objectType,
      status: snapshot.status,
      capturedAt: snapshot.capturedAt,
      columnsSha256: snapshot.columnsSha256,
    };
    available = snapshot.columns;
    evidence = snapshot;
  }

  const live = new Map(available.map((column) => [column.name, column]));
  const columns = [];
  value.columns.forEach((choice, index) => {
    const column = live.get(choice.name);
    const at = `columns[${index}]`;
    if (!column) {
      findings.error(
        'COLUMN_NOT_IN_SOURCE',
        at,
        `Column ${choice.name} does not exist in the source`,
      );
      return;
    }
    if (choice.exposed && describeOracleType(column).family === FAMILIES.UNSUPPORTED) {
      findings.error(
        'COLUMN_TYPE_UNSUPPORTED',
        at,
        `${column.oracleType} columns cannot be exposed`,
      );
    }
    columns.push({
      name: column.name,
      oracleType: column.oracleType,
      dataLength: column.dataLength ?? null,
      charLength: column.charLength ?? null,
      precision: column.precision ?? null,
      scale: column.scale ?? null,
      nullable: column.nullable !== false,
      identity: column.identity ?? null,
      exposed: choice.exposed,
      dataClass: choice.dataClass,
    });
  });
  const exposed = new Set(columns.filter((column) => column.exposed).map((column) => column.name));

  const previousKeys = new Map((previousConfig?.keyCandidates ?? []).map((key) => [key.code, key]));
  const keyCandidates = [];
  value.keyCandidates.forEach((candidate, index) => {
    const at = `keyCandidates[${index}]`;
    const assessment = assessKeyCandidate(candidate, evidence, at);
    for (const finding of assessment.findings)
      findings[finding.severity === 'ERROR' ? 'error' : 'warning'](
        finding.code,
        finding.path,
        finding.message,
      );
    candidate.columns.forEach((name, position) => {
      if (live.has(name) && !exposed.has(name)) {
        findings.error(
          'KEY_COLUMN_NOT_EXPOSED',
          `${at}.columns[${position}]`,
          `Expose ${name} to use it in a key`,
        );
      }
    });
    let observation = null;
    if (assessment.enforcement === ENFORCEMENT.DECLARED) {
      blockers.push({ code: 'PROVISIONAL_KEY', path: at });
      observation = observations[candidate.code] ?? null;
      if (observation) {
        const sameColumns =
          JSON.stringify([...(observation.columns ?? [])].sort()) ===
          JSON.stringify([...candidate.columns].sort());
        if (!sameColumns) {
          findings.error(
            'KEY_OBSERVATION_MISMATCH',
            at,
            'The uniqueness observation is for other columns',
          );
        }
        for (const finding of observationFindings(observation, at))
          findings.error(finding.code, finding.path, finding.message);
      } else if (kind !== 'HANDLER') {
        findings.error(
          'KEY_UNIQUENESS_NOT_OBSERVED',
          at,
          'Observe uniqueness before relying on a declared key',
        );
      } else {
        findings.warning(
          'KEY_UNIQUENESS_NOT_OBSERVABLE',
          at,
          'Handler keys rely on the handler owner',
        );
      }
    }
    keyCandidates.push({
      code: candidate.code,
      columns: [...candidate.columns],
      enforcement: assessment.enforcement,
      enforcedBy: assessment.enforcedBy ? { ...assessment.enforcedBy } : null,
      assurance:
        assessment.enforcement === ENFORCEMENT.DECLARED
          ? attestAssurance(candidate.assurance, previousKeys.get(candidate.code)?.assurance, {
              actorUserId: actor?.userId,
              now,
            })
          : null,
      observation: observation
        ? {
            rowCount: observation.rowCount,
            nullKeyRows: observation.nullKeyRows,
            duplicateKeyGroups: observation.duplicateKeyGroups,
            observedAt: observation.observedAt,
          }
        : null,
    });
  });

  const config = {
    schema: SOURCE_SCHEMA,
    source: {
      sourceCode: registeredSource.sourceCode,
      kind,
      owner: kind === 'HANDLER' ? null : registeredSource.ownerName,
      object: kind === 'HANDLER' ? null : registeredSource.objectName,
      handlerCode: kind === 'HANDLER' ? registeredSource.handlerCode : null,
    },
    dictionary,
    handler,
    columns: columns.sort(byName),
    keyCandidates: keyCandidates.sort(byCode),
  };
  return result(findings, blockers, config);
}

/**
 * Re-validation of a stored source config against the live dictionary: drift of any allowlisted
 * column, object status/type changes, or a different object identity are errors.
 */
export function checkSourceDrift(config, snapshot) {
  const findings = createFindings();
  if (config?.source?.kind === 'HANDLER')
    return Object.freeze({ drifted: false, findings: findings.list() });
  if (
    !snapshot ||
    snapshot.owner !== config?.source?.owner ||
    snapshot.objectName !== config?.source?.object
  ) {
    findings.error('DICTIONARY_SNAPSHOT_MISMATCH', 'source', 'Snapshot of another object');
  } else {
    if (snapshot.objectType !== config.dictionary?.objectType) {
      findings.error('OBJECT_TYPE_CHANGED', 'dictionary', 'The object type changed');
    }
    if (snapshot.status !== 'VALID')
      findings.error('OBJECT_INVALID', 'dictionary', 'The object is not VALID');
    for (const finding of compareColumns(config.columns ?? [], snapshot.columns)) {
      findings.error(finding.code, finding.path, finding.message);
    }
  }
  return Object.freeze({ drifted: findings.hasErrors(), findings: findings.list() });
}

function result(findings, blockers, config) {
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
    schemaVersion: SOURCE_SCHEMA_VERSION,
    config: config ? JSON.parse(payload.json) : null,
    configJson: payload?.json ?? null,
    configSha256: payload?.sha256 ?? null,
  });
}
