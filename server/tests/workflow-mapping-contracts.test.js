/*
 * Workflow Manager M2-0 — key assurance, source mapping contract and form mapping contract, with
 * synthetic form-independent fixtures (tests/helpers/workflowMappingFixtures.js).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assessKeyCandidate,
  attestAssurance,
  ENFORCEMENT,
  observationFindings,
} from '../src/modules/workflow-manager/mapping/keyAssurance.js';
import {
  checkSourceDrift,
  prepareSourceVersion,
} from '../src/modules/workflow-manager/mapping/sourceContract.js';
import { prepareFormVersion } from '../src/modules/workflow-manager/mapping/formContract.js';
import { createRecordAccessRegistry } from '../src/modules/workflow-manager/mapping/recordAccess.js';
import { createSourceHandlerRegistry } from '../src/modules/workflow-manager/mapping/sourceHandlers.js';
import {
  ACTOR,
  assurance,
  cleanObservation,
  formDraft,
  headerColumns,
  headerDraft,
  headerSnapshot,
  headerSource,
  lineDraft,
  lineSnapshot,
  lineSource,
  NOW,
  registeredForm,
  status,
} from './helpers/workflowMappingFixtures.js';

const codes = (result, severity = 'ERROR') =>
  result.findings.filter((finding) => finding.severity === severity).map((finding) => finding.code);
const blockerCodes = (result) => result.publicationBlockers.map((blocker) => blocker.code);
const clone = (value) => structuredClone(value);

const evidence = (overrides = {}) => ({
  columns: headerColumns(),
  constraints: [],
  uniqueIndexes: [],
  ...overrides,
});

describe('key assurance', () => {
  it('treats only enabled + validated constraints or valid unique indexes as database-enforced', () => {
    const pk = {
      name: 'DEMO_PK',
      type: 'P',
      status: 'ENABLED',
      validated: 'VALIDATED',
      columns: ['REQUEST_ID'],
    };
    const enforced = assessKeyCandidate(
      { code: 'PK', columns: ['REQUEST_ID'] },
      evidence({ constraints: [pk] }),
    );
    assert.equal(enforced.enforcement, ENFORCEMENT.DATABASE_ENFORCED);
    assert.equal(enforced.provisional, false);
    assert.deepEqual(enforced.enforcedBy, { kind: 'PRIMARY_KEY', name: 'DEMO_PK' });

    for (const constraint of [
      { ...pk, status: 'DISABLED' },
      { ...pk, validated: 'NOT VALIDATED' },
      { ...pk, columns: ['REQUEST_ID', 'REQUEST_NO'] }, // covers more than the key
    ]) {
      const result = assessKeyCandidate(
        { code: 'PK', columns: ['REQUEST_ID'], assurance: assurance() },
        evidence({ constraints: [constraint] }),
      );
      assert.equal(result.enforcement, ENFORCEMENT.DECLARED, JSON.stringify(constraint));
    }

    // A unique constraint/index enforces only when every key column is NOT NULL.
    const uk = {
      name: 'DEMO_UK',
      type: 'U',
      status: 'ENABLED',
      validated: 'VALIDATED',
      columns: ['REQUESTER_NO'],
    };
    const nullable = assessKeyCandidate(
      { code: 'UK', columns: ['REQUESTER_NO'], assurance: assurance('OWNER_ATTESTED') },
      evidence({ constraints: [uk] }),
    );
    assert.equal(nullable.enforcement, ENFORCEMENT.DECLARED);
    const index = {
      name: 'DEMO_UX',
      status: 'VALID',
      functionBased: false,
      columns: ['REQUEST_NO'],
    };
    assert.equal(
      assessKeyCandidate(
        { code: 'UX', columns: ['REQUEST_NO'] },
        evidence({ uniqueIndexes: [index] }),
      ).enforcement,
      ENFORCEMENT.DATABASE_ENFORCED,
    );
    assert.equal(
      assessKeyCandidate(
        { code: 'UX', columns: ['REQUEST_NO'], assurance: assurance('OWNER_ATTESTED') },
        evidence({ uniqueIndexes: [{ ...index, functionBased: true }] }),
      ).enforcement,
      ENFORCEMENT.DECLARED,
    );
    // A unique subset also enforces a wider key (reported as not minimal).
    const wider = assessKeyCandidate(
      { code: 'W', columns: ['REQUEST_ID', 'REQUEST_NO'] },
      evidence({ constraints: [pk] }),
    );
    assert.equal(wider.enforcement, ENFORCEMENT.DATABASE_ENFORCED);
    assert.ok(wider.findings.some((f) => f.code === 'KEY_NOT_MINIMAL'));
  });

  it('keeps an identity column without a constraint DECLARED and provisional', () => {
    const result = assessKeyCandidate(
      { code: 'PK', columns: ['REQUEST_ID'], assurance: assurance() },
      evidence(),
    );
    assert.equal(result.enforcement, ENFORCEMENT.DECLARED);
    assert.equal(result.provisional, true);
    assert.ok(result.findings.some((f) => f.code === 'KEY_NOT_DATABASE_ENFORCED'));
    assert.ok(!result.findings.some((f) => f.severity === 'ERROR'));
  });

  it('requires documented, dictionary-consistent assurance for declared keys', () => {
    const missing = assessKeyCandidate({ code: 'PK', columns: ['REQUEST_ID'] }, evidence());
    assert.ok(missing.findings.some((f) => f.code === 'KEY_ASSURANCE_REQUIRED'));
    // REQUEST_ID is GENERATED ALWAYS, so BY DEFAULT is inconsistent; REQUEST_NO is no identity.
    const inconsistent = assessKeyCandidate(
      {
        code: 'PK',
        columns: ['REQUEST_ID'],
        assurance: assurance('GENERATED_BY_DEFAULT_IDENTITY'),
      },
      evidence(),
    );
    assert.ok(inconsistent.findings.some((f) => f.code === 'KEY_ASSURANCE_INCONSISTENT'));
    const notIdentity = assessKeyCandidate(
      { code: 'NO', columns: ['REQUEST_NO'], assurance: assurance() },
      evidence(),
    );
    assert.ok(notIdentity.findings.some((f) => f.code === 'KEY_ASSURANCE_INCONSISTENT'));
    const incomplete = assessKeyCandidate(
      {
        code: 'PK',
        columns: ['REQUEST_ID'],
        assurance: { basis: 'APPLICATION_GENERATED', evidenceRef: ' ', rationale: 'x' },
      },
      evidence(),
    );
    assert.ok(incomplete.findings.some((f) => f.code === 'KEY_ASSURANCE_INCOMPLETE'));
    const ineligible = assessKeyCandidate(
      { code: 'K', columns: ['NOTES'], assurance: assurance('OWNER_ATTESTED') },
      evidence(),
    );
    assert.ok(ineligible.findings.some((f) => f.code === 'KEY_TYPE_LOB'));
    const unknown = assessKeyCandidate(
      { code: 'K', columns: ['NOPE'], assurance: assurance('OWNER_ATTESTED') },
      evidence(),
    );
    assert.ok(unknown.findings.some((f) => f.code === 'KEY_COLUMN_NOT_FOUND'));
  });

  it('treats a clean observation as evidence, never a guarantee; duplicates and nulls fail', () => {
    assert.deepEqual(observationFindings(cleanObservation(['REQUEST_ID'])), []);
    assert.deepEqual(
      observationFindings(
        cleanObservation(['REQUEST_ID'], { duplicateKeyGroups: 3, nullKeyRows: 1 }),
      ).map((f) => f.code),
      ['KEY_DUPLICATES_OBSERVED', 'KEY_NULLS_OBSERVED'],
    );
  });

  it('sets attestation on the server and keeps it while the assurance is unchanged', () => {
    const forged = { ...assurance(), attestedBy: '999', attestedAt: '2000-01-01T00:00:00.000Z' };
    const first = attestAssurance(forged, null, { actorUserId: '7', now: NOW });
    assert.equal(first.attestedBy, '7');
    assert.equal(first.attestedAt, NOW.toISOString());
    const kept = attestAssurance(assurance(), first, { actorUserId: '8', now: new Date() });
    assert.equal(kept.attestedBy, '7', 'unchanged assurance keeps its attestation');
    const changed = attestAssurance({ ...assurance(), rationale: 'Revised' }, first, {
      actorUserId: '8',
      now: NOW,
    });
    assert.equal(changed.attestedBy, '8');
  });
});

const sourceInput = (overrides = {}) => ({
  draft: headerDraft(),
  registeredSource: headerSource(),
  snapshot: headerSnapshot(),
  observations: { PK: cleanObservation(['REQUEST_ID']) },
  actor: ACTOR,
  now: NOW,
  ...overrides,
});

describe('source mapping contract (zrv.wf.source/1)', () => {
  it('derives facts from the dictionary and produces a canonical, server-hashed payload', () => {
    const result = prepareSourceVersion(sourceInput());
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.schemaVersion, 1);
    assert.match(result.configSha256, /^[0-9a-f]{64}$/);
    assert.equal(result.config.schema, 'zrv.wf.source/1');
    assert.deepEqual(result.config.source, {
      sourceCode: 'DEMO_REQUEST_HEADER',
      kind: 'TABLE',
      owner: 'DEMO_APP',
      object: 'DEMO_REQUEST_H',
      handlerCode: null,
    });
    assert.deepEqual(
      result.config.columns.map((c) => c.name),
      [...result.config.columns.map((c) => c.name)].sort(),
      'columns sorted',
    );
    const id = result.config.columns.find((c) => c.name === 'REQUEST_ID');
    assert.equal(id.oracleType, 'NUMBER');
    assert.equal(id.identity, 'ALWAYS');
    const [key] = result.config.keyCandidates;
    assert.equal(key.enforcement, 'DECLARED');
    assert.equal(key.assurance.attestedBy, '7');
    assert.equal(key.observation.duplicateKeyGroups, 0);
    assert.deepEqual(blockerCodes(result), ['PROVISIONAL_KEY']);
    assert.ok(
      Object.isFrozen(result.publicationBlockers) &&
        result.publicationBlockers.every(Object.isFrozen),
    );
    // Deterministic: the same input gives the same fingerprint.
    assert.equal(prepareSourceVersion(sourceInput()).configSha256, result.configSha256);
  });

  it('accepts only author choices: no SQL, expressions or client-supplied facts', () => {
    for (const extra of [{ sql: 'SELECT 1 FROM DUAL' }, { where: '1=1' }, { dictionary: {} }]) {
      const result = prepareSourceVersion(sourceInput({ draft: { ...headerDraft(), ...extra } }));
      assert.ok(codes(result).includes('SCHEMA_INVALID'), JSON.stringify(extra));
      assert.equal(result.config, null);
    }
    const forged = headerDraft();
    forged.columns[0].oracleType = 'VARCHAR2';
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ draft: forged }))).includes('SCHEMA_INVALID'),
    );
    const forgedKey = headerDraft();
    forgedKey.keyCandidates[0].enforcement = 'DATABASE_ENFORCED';
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ draft: forgedKey }))).includes('SCHEMA_INVALID'),
    );
  });

  it('refuses missing columns, unexposed key columns and unsupported exposed types', () => {
    const missing = headerDraft();
    missing.columns.push({ name: 'GHOST', exposed: true, dataClass: 'INTERNAL' });
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ draft: missing }))).includes('COLUMN_NOT_IN_SOURCE'),
    );
    const blob = headerDraft();
    blob.columns.push({ name: 'PAYLOAD', exposed: true, dataClass: 'INTERNAL' });
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ draft: blob }))).includes('COLUMN_TYPE_UNSUPPORTED'),
    );
    const hidden = headerDraft();
    hidden.columns.find((c) => c.name === 'REQUEST_ID').exposed = false;
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ draft: hidden }))).includes(
        'KEY_COLUMN_NOT_EXPOSED',
      ),
    );
  });

  it('requires a clean uniqueness observation for declared keys', () => {
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ observations: {} }))).includes(
        'KEY_UNIQUENESS_NOT_OBSERVED',
      ),
    );
    const dup = prepareSourceVersion(
      sourceInput({
        observations: { PK: cleanObservation(['REQUEST_ID'], { duplicateKeyGroups: 1 }) },
      }),
    );
    assert.ok(codes(dup).includes('KEY_DUPLICATES_OBSERVED'));
    const other = prepareSourceVersion(
      sourceInput({ observations: { PK: cleanObservation(['REQUEST_NO']) } }),
    );
    assert.ok(codes(other).includes('KEY_OBSERVATION_MISMATCH'));
  });

  it('records a database-enforced key without provisional blockers', () => {
    const snapshot = headerSnapshot({
      constraints: [
        {
          name: 'DEMO_PK',
          type: 'P',
          status: 'ENABLED',
          validated: 'VALIDATED',
          columns: ['REQUEST_ID'],
        },
      ],
    });
    const result = prepareSourceVersion(sourceInput({ snapshot, observations: {} }));
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.config.keyCandidates[0].enforcement, 'DATABASE_ENFORCED');
    assert.equal(result.config.keyCandidates[0].assurance, null);
    assert.deepEqual(blockerCodes(result), []);
  });

  it('requires a matching live snapshot and reports an inactive source', () => {
    assert.ok(
      codes(prepareSourceVersion(sourceInput({ snapshot: null }))).includes(
        'DICTIONARY_SNAPSHOT_MISMATCH',
      ),
    );
    assert.ok(
      codes(
        prepareSourceVersion(sourceInput({ snapshot: headerSnapshot({ objectType: 'VIEW' }) })),
      ).includes('DICTIONARY_SNAPSHOT_MISMATCH'),
    );
    const inactive = prepareSourceVersion(
      sourceInput({ registeredSource: headerSource({ isActive: false }) }),
    );
    assert.ok(blockerCodes(inactive).includes('SOURCE_INACTIVE'));
  });

  it('builds HANDLER sources only from a registered handler contract', () => {
    const handlerSource = headerSource({
      sourceKind: 'HANDLER',
      ownerName: null,
      objectName: null,
      handlerCode: 'DEMO_HANDLER',
    });
    const empty = prepareSourceVersion(
      sourceInput({
        registeredSource: handlerSource,
        snapshot: null,
        handlerRegistry: createSourceHandlerRegistry([]),
      }),
    );
    assert.ok(codes(empty).includes('SOURCE_HANDLER_NOT_REGISTERED'));
    const registry = createSourceHandlerRegistry([
      {
        code: 'DEMO_HANDLER',
        name: 'Demo handler',
        contractVersion: 1,
        fields: [{ name: 'REC_ID', oracleType: 'NUMBER', scale: 0, nullable: false }],
      },
    ]);
    const result = prepareSourceVersion(
      sourceInput({
        registeredSource: handlerSource,
        snapshot: null,
        handlerRegistry: registry,
        observations: {},
        draft: {
          columns: [{ name: 'REC_ID', exposed: true, dataClass: 'INTERNAL' }],
          keyCandidates: [
            { code: 'PK', columns: ['REC_ID'], assurance: assurance('APPLICATION_GENERATED') },
          ],
        },
      }),
    );
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.deepEqual(result.config.handler, { code: 'DEMO_HANDLER', contractVersion: 1 });
    assert.equal(result.config.dictionary, null);
  });

  it('detects dictionary drift of allowlisted columns', () => {
    const { config } = prepareSourceVersion(sourceInput());
    assert.equal(checkSourceDrift(config, headerSnapshot()).drifted, false);
    const changed = headerColumns().map((c) => (c.name === 'AMOUNT' ? { ...c, scale: 2 } : c));
    const drift = checkSourceDrift(config, headerSnapshot({ columns: changed }));
    assert.equal(drift.drifted, true);
    assert.ok(drift.findings.some((f) => f.code === 'COLUMN_CHANGED'));
    const dropped = checkSourceDrift(
      config,
      headerSnapshot({ columns: headerColumns().filter((c) => c.name !== 'STATUS') }),
    );
    assert.ok(dropped.findings.some((f) => f.code === 'COLUMN_MISSING'));
    assert.ok(
      checkSourceDrift(config, headerSnapshot({ status: 'INVALID' })).findings.some(
        (f) => f.code === 'OBJECT_INVALID',
      ),
    );
    // Columns added to the object later are not drift: they are simply not allowlisted.
    const added = checkSourceDrift(
      config,
      headerSnapshot({ columns: [...headerColumns(), { name: 'NEW_COL', oracleType: 'NUMBER' }] }),
    );
    assert.equal(added.drifted, false);
  });
});

// --- Form mapping contract -------------------------------------------------------------------------

const headerVersion = () => ({
  sourceVersionId: '11',
  lifecycleState: 'DRAFT',
  config: prepareSourceVersion(sourceInput()).config,
});
const lineVersion = (draft = lineDraft(), snapshot = lineSnapshot()) => ({
  sourceVersionId: '12',
  lifecycleState: 'DRAFT',
  config: prepareSourceVersion({
    draft,
    registeredSource: lineSource(),
    snapshot,
    actor: ACTOR,
    now: NOW,
  }).config,
});
const formInput = (overrides = {}) => ({
  draft: formDraft(),
  registeredForm: registeredForm(),
  sourceVersions: new Map([
    ['11', headerVersion()],
    ['12', lineVersion()],
  ]),
  recordAccessRegistry: createRecordAccessRegistry([]),
  ...overrides,
});
const withDraft = (mutate) => {
  const draft = clone(formDraft());
  mutate(draft);
  return prepareFormVersion(formInput({ draft }));
};

describe('form mapping contract (zrv.wf.form/1)', () => {
  it('accepts a complete generic mapping and reports immutable publication blockers', () => {
    const result = prepareFormVersion(formInput());
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.config.schema, 'zrv.wf.form/1');
    assert.equal(result.config.formCode, 'DEMO_REQUEST');
    assert.equal(result.headerSourceVersionId, '11');
    assert.match(result.configSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(blockerCodes(result), [
      'KEYLESS_LINE_RESTRICTED_USE',
      'NO_RECORD_ACCESS_PROVIDER',
      'PROVISIONAL_KEY',
      'SOURCE_VERSION_NOT_PUBLISHED',
      'SOURCE_VERSION_NOT_PUBLISHED',
    ]);
    assert.ok(Object.isFrozen(result.publicationBlockers));
    assert.throws(() => result.publicationBlockers.push({ code: 'X' }), TypeError);
    assert.throws(() => {
      result.publicationBlockers[0].code = 'CHANGED';
    }, TypeError);
  });

  it('rejects SQL, expressions and unknown properties anywhere', () => {
    for (const mutate of [
      (d) => (d.where = '1=1'),
      (d) => (d.lines[0].fixedFilters[0].operator = 'LIKE'),
      (d) => (d.lines[0].distinct = true),
      (d) => (d.fields[0].expression = 'UPPER(x)'),
      (d) => (d.status.writer = { mode: 'ATOMIC_UPDATE' }),
      (d) => (d.orgScope = { kind: 'SQL', value: 'SELECT ORG FROM X' }),
      (d) => (d.fields[0].ref.column = 'REQUEST_NO; DROP TABLE X'),
    ]) {
      assert.ok(codes(withDraft(mutate)).includes('SCHEMA_INVALID'), mutate.toString());
    }
  });

  it('resolves every reference against exposed columns and compatible types', () => {
    assert.ok(
      codes(withDraft((d) => (d.fields[0].ref.column = 'PAYLOAD'))).includes('COLUMN_NOT_EXPOSED'),
    );
    assert.ok(codes(withDraft((d) => (d.fields[0].ref.alias = 'X'))).includes('ALIAS_UNKNOWN'));
    assert.ok(
      codes(withDraft((d) => (d.fields[3].type = 'DATE'))).includes('FIELD_TYPE_INCOMPATIBLE'),
    );
    assert.ok(
      codes(withDraft((d) => (d.fields[3].type = 'INTEGER'))).includes('FIELD_TYPE_NOT_INTEGRAL'),
    );
    assert.ok(
      codes(withDraft((d) => (d.header.keyCandidate = 'NOPE'))).includes('KEY_CANDIDATE_NOT_FOUND'),
    );
    assert.ok(
      codes(withDraft((d) => (d.header.sourceVersionId = '99'))).includes(
        'SOURCE_VERSION_NOT_FOUND',
      ),
    );
    assert.ok(codes(withDraft((d) => (d.lines[0].alias = 'H'))).includes('ALIAS_DUPLICATE'));
    assert.ok(
      codes(withDraft((d) => d.fields.push({ ...d.fields[0] }))).includes('FIELD_CODE_DUPLICATE'),
    );
  });

  it('never lets a field be less sensitive than its source column', () => {
    assert.ok(
      codes(withDraft((d) => (d.fields[1].sensitivity = 'PUBLIC'))).includes(
        'SENSITIVITY_DOWNGRADE',
      ),
    );
    assert.equal(
      withDraft((d) => (d.fields[0].sensitivity = 'SENSITIVE')).valid,
      true,
      'raising is allowed',
    );
  });

  it('validates composite header/detail joins and canonical fixed filters', () => {
    assert.ok(
      codes(withDraft((d) => (d.lines[0].join[0].lineColumn = 'FILE_NAME'))).includes(
        'JOIN_TYPE_INCOMPATIBLE',
      ),
    );
    assert.ok(
      codes(withDraft((d) => (d.lines[0].join[0].headerColumn = 'PAYLOAD'))).includes(
        'COLUMN_NOT_EXPOSED',
      ),
    );
    const twoPart = withDraft((d) =>
      d.lines[0].join.push({ lineColumn: 'DOC_KIND', headerColumn: 'REQUEST_NO' }),
    );
    assert.equal(twoPart.valid, true, JSON.stringify(twoPart.findings));
    assert.ok(
      codes(
        withDraft((d) => (d.lines[0].join[0].headerColumn = 'ORG_ID')),
        'WARNING',
      ).includes('JOIN_NOT_ON_HEADER_KEY'),
    );
    const numeric = withDraft(
      (d) => (d.lines[0].fixedFilters = [{ column: 'REQUEST_ID', value: '007.0' }]),
    );
    assert.equal(
      numeric.config.lines[0].fixedFilters[0].value,
      '7',
      'filter value stored canonically',
    );
    assert.ok(
      codes(
        withDraft((d) => (d.lines[0].fixedFilters = [{ column: 'REQUEST_ID', value: 'abc' }])),
      ).includes('INVALID_DECIMAL'),
    );
  });

  it('keeps keyless detail rows as they are and refuses identity-dependent use', () => {
    const result = prepareFormVersion(formInput());
    const [line] = result.config.lines;
    assert.equal(line.lineKey, null);
    assert.equal(line.rowIdentity, 'NONE');
    assert.equal(
      'distinct' in line || 'deduplicate' in line,
      false,
      'no de-duplication option exists',
    );
    assert.ok(
      codes(withDraft((d) => (d.lines[0].keylessAcknowledged = false))).includes(
        'KEYLESS_ACK_REQUIRED',
      ),
    );
    assert.ok(
      codes(withDraft((d) => (d.lines[0].usage = ['DISPLAY', 'CONDITION']))).includes(
        'KEYLESS_LINE_USAGE_NOT_ALLOWED',
      ),
    );
    assert.ok(
      codes(withDraft((d) => (d.lines[0].cardinality = 'ONE'))).includes(
        'KEYLESS_LINE_CARDINALITY',
      ),
    );
    assert.ok(
      codes(withDraft((d) => (d.lines[0].rowIdentity = 'KEYED'))).includes('ROW_IDENTITY_MISMATCH'),
    );
    assert.ok(
      codes(withDraft((d) => (d.fields[5].usage = ['CONDITION']))).includes(
        'KEYLESS_FIELD_USAGE_NOT_ALLOWED',
      ),
    );
    assert.ok(
      codes(
        withDraft((d) => (d.lines[0].orderBy = [])),
        'WARNING',
      ).includes('LINE_ORDER_UNSPECIFIED'),
    );
  });

  it('accepts keyed lines and marks declared line keys provisional', () => {
    const keyed = lineDraft({
      keyCandidates: [
        { code: 'LK', columns: ['LINE_ID'], assurance: assurance('GENERATED_BY_DEFAULT_IDENTITY') },
      ],
    });
    const version = {
      ...lineVersion(keyed),
      config: prepareSourceVersion({
        draft: keyed,
        registeredSource: lineSource(),
        snapshot: lineSnapshot(),
        observations: { LK: cleanObservation(['LINE_ID']) },
        actor: ACTOR,
        now: NOW,
      }).config,
    };
    const draft = clone(formDraft());
    Object.assign(draft.lines[0], {
      lineKey: 'LK',
      rowIdentity: 'KEYED',
      keylessAcknowledged: false,
      usage: ['DISPLAY', 'CONDITION'],
    });
    draft.fields[5].usage = ['DISPLAY', 'CONDITION'];
    const result = prepareFormVersion(
      formInput({
        draft,
        sourceVersions: new Map([
          ['11', headerVersion()],
          ['12', version],
        ]),
      }),
    );
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.ok(blockerCodes(result).includes('PROVISIONAL_LINE_KEY'));
    assert.ok(!blockerCodes(result).includes('KEYLESS_LINE_RESTRICTED_USE'));
  });

  it('records person attributes and organization scope without resolving them', () => {
    assert.ok(
      codes(
        withDraft((d) => (d.attributes = [{ role: 'REQUESTER', field: 'ORGANIZATION' }])),
      ).includes('REFERENCE_TYPE_NOT_ALLOWED'),
    );
    assert.ok(
      codes(withDraft((d) => (d.attributes = [{ role: 'OWNER', field: 'FILE_NAME' }]))).includes(
        'FIELD_NOT_HEADER',
      ),
    );
    assert.ok(codes(withDraft((d) => (d.orgScope = null))).includes('ORG_SCOPE_REQUIRED'));
    assert.ok(
      codes(withDraft((d) => (d.orgScope = { kind: 'FIELD', field: 'REQUESTER' }))).includes(
        'REFERENCE_TYPE_NOT_ALLOWED',
      ),
    );
    const constant = withDraft((d) => (d.orgScope = { kind: 'CONSTANT', value: 'ORG-ALL' }));
    assert.equal(constant.valid, true);
    const resolver = withDraft(
      (d) =>
        (d.orgScope = {
          kind: 'RESOLVER_REQUIRED',
          input: 'REQUESTER',
          output: 'ORGANIZATION_REF',
          resolverCode: null,
        }),
    );
    assert.equal(resolver.valid, true, JSON.stringify(resolver.findings));
    assert.ok(blockerCodes(resolver).includes('PROVISIONAL_ORG_SCOPE'));
    assert.ok(blockerCodes(resolver).includes('RESOLVER_UNBOUND'));
  });

  it('validates statuses, transitions and events and keeps unverified ones provisional', () => {
    assert.ok(codes(withDraft((d) => (d.status = null))).includes('STATUS_REQUIRED'));
    assert.ok(
      codes(withDraft((d) => (d.status.values[0].category = 'IN_PROGRESS'))).includes(
        'STATUS_INITIAL_REQUIRED',
      ),
    );
    assert.ok(
      codes(withDraft((d) => d.status.values.push(status('AGAIN', 'Draft', 'CANCELLED')))).includes(
        'STATUS_STORED_DUPLICATE',
      ),
    );
    assert.ok(
      codes(withDraft((d) => (d.status.transitions[0].to = 'NOPE'))).includes('STATUS_UNKNOWN'),
    );
    assert.ok(
      codes(withDraft((d) => (d.status.transitions[0].event = 'NOPE'))).includes('EVENT_UNKNOWN'),
    );
    assert.ok(
      codes(withDraft((d) => d.status.transitions.push({ ...d.status.transitions[0] }))).includes(
        'TRANSITION_AMBIGUOUS',
      ),
    );
    assert.ok(codes(withDraft((d) => (d.events = []))).includes('EVENT_REQUIRED'));
    assert.ok(
      codes(withDraft((d) => (d.events[0].resubmitFrom = ['NOPE']))).includes('STATUS_UNKNOWN'),
    );
    const provisional = withDraft((d) => {
      d.status.values[1].verification = 'PROVISIONAL';
      d.status.transitions[0].verification = 'PROVISIONAL';
      d.events[0].verification = 'PROVISIONAL';
    });
    assert.equal(provisional.valid, true);
    for (const code of ['PROVISIONAL_STATUS', 'PROVISIONAL_TRANSITION', 'PROVISIONAL_EVENT']) {
      assert.ok(blockerCodes(provisional).includes(code), code);
    }
  });

  it('maps deep-link parameters only to header record key columns', () => {
    assert.ok(
      codes(
        withDraft((d) => (d.deepLink.params = { other: { keyColumn: 'REQUEST_ID' } })),
      ).includes('DEEP_LINK_PARAMS_MISMATCH'),
    );
    assert.ok(
      codes(withDraft((d) => (d.deepLink.params.requestId.keyColumn = 'REQUEST_NO'))).includes(
        'DEEP_LINK_NOT_KEY',
      ),
    );
    const noRoute = prepareFormVersion(
      formInput({ registeredForm: registeredForm({ detailRoute: null }) }),
    );
    assert.ok(codes(noRoute).includes('DEEP_LINK_ROUTE_MISSING'));
    assert.ok(
      codes(
        withDraft((d) => (d.deepLink = null)),
        'WARNING',
      ).includes('DEEP_LINK_NOT_MAPPED'),
    );
  });

  it('only adds record-access requirements and verifies them against the catalogue', () => {
    const draft = clone(formDraft());
    draft.recordAccess.additionalPermissions = ['DEMO.REQUESTS:VIEW'];
    assert.ok(
      codes(prepareFormVersion(formInput({ draft })), 'WARNING').includes(
        'PERMISSION_NOT_VERIFIED',
      ),
    );
    assert.ok(
      codes(prepareFormVersion(formInput({ draft, permissionExists: () => false }))).includes(
        'PERMISSION_UNKNOWN',
      ),
    );
    assert.equal(
      prepareFormVersion(formInput({ draft, permissionExists: () => true })).valid,
      true,
    );
    for (const weaken of [{ provider: 'NONE' }, { bypass: true }, { skipProvider: true }]) {
      const weakened = clone(formDraft());
      Object.assign(weakened.recordAccess, weaken);
      assert.ok(
        codes(prepareFormVersion(formInput({ draft: weakened }))).includes('SCHEMA_INVALID'),
        JSON.stringify(weaken),
      );
    }
    const registry = createRecordAccessRegistry([
      { formCode: 'DEMO_REQUEST', contractVersion: 1, canView: async () => ({}) },
    ]);
    assert.ok(
      !blockerCodes(prepareFormVersion(formInput({ recordAccessRegistry: registry }))).includes(
        'NO_RECORD_ACCESS_PROVIDER',
      ),
    );
  });

  it('reports published dependencies and an inactive form as blockers only', () => {
    const published = new Map([
      ['11', { ...headerVersion(), lifecycleState: 'PUBLISHED' }],
      ['12', { ...lineVersion(), lifecycleState: 'PUBLISHED' }],
    ]);
    const result = prepareFormVersion(
      formInput({ sourceVersions: published, registeredForm: registeredForm({ isActive: false }) }),
    );
    assert.ok(!blockerCodes(result).includes('SOURCE_VERSION_NOT_PUBLISHED'));
    assert.ok(blockerCodes(result).includes('FORM_INACTIVE'));
    assert.equal(result.valid, true);
  });
});
