import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleBusinessRecord,
  BUSINESS_RECORD_FORMAT,
  REDACTED,
} from '../src/modules/workflow-manager/mapping/businessRecord.js';
import {
  FORM_SCHEMA_V2,
  MAX_GRAPH_DEPTH,
  prepareFormVersionV2,
  relationshipGraph,
} from '../src/modules/workflow-manager/mapping/formContractV2.js';
import {
  formSourceReferences,
  prepareFormMapping,
} from '../src/modules/workflow-manager/mapping/formMapping.js';
import { createRecordAccessRegistry } from '../src/modules/workflow-manager/mapping/recordAccess.js';

/*
 * zrv.wf.form/2 (relationship graph) and the zrv.wf.businessRecord/1 assembler. The fixture is an
 * ILLUSTRATIVE, FICTIONAL request form — not a verified Zamil form or Oracle object: a request
 * header with lines, an item looked up for each line, an optional requester and the requester's
 * department (multi-hop), and keyless notes. Source versions are given in the shape of
 * zrv.wf.source/1 configurations (exposed columns with data classes and key candidates).
 */
const clone = (value) => structuredClone(value);
const num = (name, precision, scale, extra = {}) => ({
  name,
  oracleType: 'NUMBER',
  precision,
  scale,
  nullable: false,
  exposed: true,
  dataClass: 'INTERNAL',
  ...extra,
});
const txt = (name, length, extra = {}) => ({
  name,
  oracleType: 'VARCHAR2',
  charLength: length,
  precision: null,
  scale: null,
  nullable: true,
  exposed: true,
  dataClass: 'INTERNAL',
  ...extra,
});
const key = (code, columns, enforcement = 'DATABASE_ENFORCED') => ({ code, columns, enforcement });
const version = (sourceVersionId, columns, keyCandidates, lifecycleState = 'PUBLISHED') => ({
  sourceVersionId,
  lifecycleState,
  config: { schema: 'zrv.wf.source/1', columns, keyCandidates },
});

const sourceVersions = () =>
  new Map([
    [
      '21',
      version(
        '21',
        [
          num('REQUEST_ID', 19, 0),
          txt('REQUEST_NO', 30),
          num('ORG_ID', 10, 0),
          txt('STATUS', 1),
          num('TOTAL_AMOUNT', 15, 2),
          txt('REQUESTER_EMP_NO', 30),
        ],
        [key('PK', ['REQUEST_ID']), key('BUSINESS_NO', ['ORG_ID', 'REQUEST_NO'])],
      ),
    ],
    [
      '22',
      version(
        '22',
        [
          num('LINE_ID', 19, 0),
          num('REQUEST_ID', 19, 0),
          num('LINE_NO', 5, 0),
          txt('ITEM_CODE', 40),
          num('QTY', 12, 3),
          txt('LINE_STATUS', 1),
        ],
        [key('PK', ['LINE_ID'])],
      ),
    ],
    [
      '23',
      version(
        '23',
        [txt('ITEM_CODE', 40), txt('DESCRIPTION', 240, { dataClass: 'PUBLIC' })],
        [key('UK', ['ITEM_CODE'])],
      ),
    ],
    [
      '24',
      version(
        '24',
        [
          txt('EMPLOYEE_NUMBER', 30),
          num('ORG_ID', 10, 0),
          txt('FULL_NAME', 240, { dataClass: 'PERSONAL' }),
          num('DEPT_ID', 10, 0),
        ],
        [key('PK', ['EMPLOYEE_NUMBER'])],
      ),
    ],
    [
      '25',
      version(
        '25',
        [num('DEPT_ID', 10, 0), num('ORG_ID', 10, 0), txt('DEPT_NAME', 240)],
        [key('PK', ['DEPT_ID'])],
      ),
    ],
    ['26', version('26', [num('REQUEST_ID', 19, 0), txt('NOTE_TEXT', 4000)], [])],
  ]);

const evidence = { kind: 'CODE_REFERENCE', reference: 'Fictional fixture' };
const rel = (code, kind, from, to, join, extra = {}) => ({
  code,
  label: { en: code },
  kind,
  from,
  to,
  join: join.map(([fromColumn, toColumn]) => ({ fromColumn, toColumn })),
  scope: 'PARENT_RECORD',
  usage: ['DISPLAY', 'TEMPLATE'],
  verification: 'VERIFIED',
  evidence,
  ...extra,
});
const field = (code, alias, column, type = 'TEXT', extra = {}) => ({
  code,
  label: { en: code },
  type,
  ref: { alias, column },
  sensitivity: 'INTERNAL',
  usage: ['DISPLAY', 'TEMPLATE'],
  ...extra,
});

const draft = () => ({
  root: { alias: 'REQ', sourceVersionId: '21', keyCandidate: 'PK' },
  sources: [
    { alias: 'LINES', sourceVersionId: '22' },
    { alias: 'ITEM', sourceVersionId: '23' },
    { alias: 'EMP', sourceVersionId: '24' },
    { alias: 'DEPT', sourceVersionId: '25' },
    { alias: 'NOTES', sourceVersionId: '26' },
  ],
  relationships: [
    rel('LINES', 'COLLECTION', 'REQ', 'LINES', [['REQUEST_ID', 'REQUEST_ID']], {
      orderBy: [
        { column: 'LINE_NO', direction: 'ASC' },
        { column: 'LINE_ID', direction: 'ASC' },
      ],
      maxRows: 50,
      rowKey: 'PK',
      usage: ['DISPLAY', 'CONDITION', 'TEMPLATE'],
      filters: [{ column: 'LINE_STATUS', kind: 'FIXED', value: 'A' }],
    }),
    rel('ITEM', 'SINGLE_LOOKUP', 'LINES', 'ITEM', [['ITEM_CODE', 'ITEM_CODE']], {
      scope: 'REFERENCE_DATA',
    }),
    rel(
      'REQUESTER',
      'OPTIONAL_LOOKUP',
      'REQ',
      'EMP',
      [
        ['REQUESTER_EMP_NO', 'EMPLOYEE_NUMBER'],
        ['ORG_ID', 'ORG_ID'],
      ],
      {
        scope: 'SAME_ORGANIZATION',
        organizationJoin: { fromColumn: 'ORG_ID', toColumn: 'ORG_ID' },
      },
    ),
    rel(
      'DEPARTMENT',
      'SINGLE_LOOKUP',
      'EMP',
      'DEPT',
      [
        ['DEPT_ID', 'DEPT_ID'],
        ['ORG_ID', 'ORG_ID'],
      ],
      {
        scope: 'SAME_ORGANIZATION',
        organizationJoin: { fromColumn: 'ORG_ID', toColumn: 'ORG_ID' },
      },
    ),
    rel('NOTES', 'COLLECTION', 'REQ', 'NOTES', [['REQUEST_ID', 'REQUEST_ID']], {
      orderBy: [{ column: 'NOTE_TEXT', direction: 'ASC' }],
      maxRows: 20,
      rowKey: null,
      keylessAcknowledged: true,
    }),
  ],
  fields: [
    field('REQUEST_NO', 'REQ', 'REQUEST_NO'),
    field('TOTAL_AMOUNT', 'REQ', 'TOTAL_AMOUNT', 'DECIMAL', {
      usage: ['DISPLAY', 'CONDITION', 'TEMPLATE'],
    }),
    field('STATUS', 'REQ', 'STATUS'),
    field('ORG', 'REQ', 'ORG_ID', 'REFERENCE', { refType: 'ORGANIZATION_REF' }),
    field('REQUESTER_NO', 'REQ', 'REQUESTER_EMP_NO', 'REFERENCE', {
      refType: 'EMPLOYEE_NUMBER_REF',
    }),
    field('REQUESTER_NAME', 'EMP', 'FULL_NAME', 'TEXT', { sensitivity: 'PERSONAL' }),
    field('DEPARTMENT', 'DEPT', 'DEPT_NAME'),
    field('ITEM_CODE', 'LINES', 'ITEM_CODE'),
    field('QUANTITY', 'LINES', 'QTY', 'DECIMAL'),
    field('ITEM_DESCRIPTION', 'ITEM', 'DESCRIPTION'),
    field('NOTE', 'NOTES', 'NOTE_TEXT', 'TEXT', { usage: ['DISPLAY'] }),
  ],
  attributes: [{ role: 'REQUESTER', field: 'REQUESTER_NO' }],
  orgScope: { kind: 'FIELD', field: 'ORG' },
  status: {
    field: 'STATUS',
    match: 'EXACT',
    values: [
      { code: 'SUBMITTED', stored: 'S', category: 'INITIAL', verification: 'VERIFIED', evidence },
      { code: 'APPROVED', stored: 'A', category: 'APPROVED', verification: 'VERIFIED', evidence },
    ],
    transitions: [],
    writer: { mode: 'NONE' },
  },
  events: [{ code: 'SUBMIT', label: { en: 'Submit' }, verification: 'VERIFIED' }],
});

const prepare = (mutate = () => {}, overrides = {}) => {
  const value = clone(draft());
  mutate(value);
  return prepareFormVersionV2({
    draft: value,
    registeredForm: { formCode: 'DEMO_REQUEST', detailRoute: null, isActive: true },
    sourceVersions: sourceVersions(),
    recordAccessRegistry: createRecordAccessRegistry([]),
    ...overrides,
  });
};
const codes = (result) => result.findings.map((finding) => finding.code);
const blockerCodes = (result) => result.publicationBlockers.map((blocker) => blocker.code);
const relationship = (d, code) => d.relationships.find((item) => item.code === code);

describe('form mapping contract zrv.wf.form/2 (relationship graph)', () => {
  it('accepts a bounded graph: lines, a lookup per line, a multi-hop lookup and keyless notes', () => {
    const result = prepare();
    assert.equal(result.valid, true, JSON.stringify(result.findings));
    assert.equal(result.config.schema, FORM_SCHEMA_V2);
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.headerSourceVersionId, '21', 'the root is the header foreign key');
    assert.match(result.configSha256, /^[0-9a-f]{64}$/);
    const blockers = blockerCodes(result);
    assert.ok(blockers.includes('KEYLESS_LINE_RESTRICTED_USE'), 'keyless notes are restricted');
    assert.ok(blockers.includes('NO_RECORD_ACCESS_PROVIDER'));
    // Root access is not blanket access: the requester's (personal) name stays blocked.
    assert.ok(
      result.publicationBlockers.some(
        (b) => b.code === 'RELATED_SOURCE_ACCESS_UNVERIFIED' && b.path === 'fields[5]',
      ),
    );
    assert.equal(
      result.publicationBlockers.filter((b) => b.code === 'RELATED_SOURCE_ACCESS_UNVERIFIED')
        .length,
      1,
      'internal and public related fields are not blocked',
    );
    const graph = relationshipGraph(result.config);
    const order = graph.relationships.map((item) => item.code);
    assert.ok(order.indexOf('LINES') < order.indexOf('ITEM'), 'parents before children');
    assert.ok(order.indexOf('REQUESTER') < order.indexOf('DEPARTMENT'));
    assert.equal(
      graph.relationships.find((item) => item.code === 'ITEM').cardinality,
      'EXACTLY_ONE',
    );
    assert.equal(
      graph.relationships.find((item) => item.code === 'REQUESTER').cardinality,
      'ZERO_OR_ONE',
    );
  });

  it('keeps every source reference findable for dependency checks, for v1 and v2', () => {
    const { config } = prepare();
    assert.deepEqual(formSourceReferences(config), {
      header: '21',
      others: ['22', '23', '24', '25', '26'],
    });
    assert.deepEqual(
      formSourceReferences({
        schema: 'zrv.wf.form/1',
        header: { sourceVersionId: '11' },
        lines: [{ sourceVersionId: '12' }],
      }),
      { header: '11', others: ['12'] },
    );
    assert.throws(() => formSourceReferences({ schema: 'zrv.wf.form/9' }), {
      code: 'FORM_SCHEMA_UNSUPPORTED',
    });
    assert.throws(() => prepareFormMapping(3, {}), { code: 'FORM_SCHEMA_UNSUPPORTED' });
    assert.equal(
      prepareFormMapping(2, {
        draft: draft(),
        registeredForm: { formCode: 'DEMO_REQUEST', detailRoute: null },
        sourceVersions: sourceVersions(),
        recordAccessRegistry: createRecordAccessRegistry([]),
      }).config.schema,
      FORM_SCHEMA_V2,
    );
    assert.throws(() => relationshipGraph({ schema: 'zrv.wf.form/1' }), {
      code: 'FORM_SCHEMA_UNSUPPORTED',
    });
  });

  it('rejects SQL, expressions and unknown properties', () => {
    const result = prepare((d) => {
      relationship(d, 'LINES').where = "STATUS <> 'X'";
      d.root.sql = 'SELECT 1 FROM dual';
    });
    assert.equal(result.valid, false);
    assert.ok(codes(result).every((code) => code === 'SCHEMA_INVALID'));
    assert.equal(result.config, null);
  });

  it('refuses cycles, sources with two parents and unconnected sources', () => {
    const cycle = prepare((d) => {
      // EMP ← DEPT ← EMP: neither is reachable from the root any more.
      relationship(d, 'REQUESTER').from = 'DEPT';
    });
    assert.ok(codes(cycle).includes('RELATIONSHIP_CYCLE'));

    const twoParents = prepare((d) => {
      d.relationships.push(
        rel('ITEM_AGAIN', 'OPTIONAL_LOOKUP', 'REQ', 'ITEM', [['REQUEST_NO', 'ITEM_CODE']]),
      );
    });
    assert.ok(codes(twoParents).includes('SOURCE_MULTIPLE_PARENTS'));

    const loose = prepare((d) => {
      d.relationships = d.relationships.filter((item) => item.code !== 'NOTES');
      d.fields = d.fields.filter((item) => item.code !== 'NOTE');
    });
    assert.ok(codes(loose).includes('SOURCE_UNREACHABLE'));

    const toRoot = prepare((d) => {
      d.relationships.push(
        rel('BACK', 'SINGLE_LOOKUP', 'LINES', 'REQ', [['REQUEST_ID', 'REQUEST_ID']]),
      );
    });
    assert.ok(codes(toRoot).includes('RELATIONSHIP_TO_ROOT'));
  });

  it('bounds depth, collection nesting and the total row budget', () => {
    // A chain of lookups deeper than allowed: REQ → L1 → L2 → … (each a reuse of DEPT).
    const deep = prepare((d) => {
      d.sources = [];
      d.relationships = [];
      d.fields = d.fields.filter((item) => item.ref.alias === 'REQ');
      let parent = 'REQ';
      let column = 'ORG_ID';
      for (let level = 1; level <= MAX_GRAPH_DEPTH + 1; level += 1) {
        const alias = `D${level}`;
        d.sources.push({ alias, sourceVersionId: '25' });
        d.relationships.push(
          rel(alias, 'OPTIONAL_LOOKUP', parent, alias, [[column, 'DEPT_ID']], {
            scope: 'REFERENCE_DATA',
          }),
        );
        parent = alias;
        column = 'ORG_ID';
      }
    });
    assert.ok(codes(deep).includes('GRAPH_TOO_DEEP'));

    const nested = prepare((d) => {
      // REQ → LINES (collection) → LINES2 (collection) → LINES3 (collection)
      d.sources.push(
        { alias: 'LINES2', sourceVersionId: '22' },
        { alias: 'LINES3', sourceVersionId: '22' },
      );
      const sub = (code, from) =>
        rel(code, 'COLLECTION', from, code, [['LINE_ID', 'REQUEST_ID']], {
          orderBy: [{ column: 'LINE_ID', direction: 'ASC' }],
          maxRows: 2,
          rowKey: 'PK',
        });
      d.relationships.push(sub('LINES2', 'LINES'), sub('LINES3', 'LINES2'));
    });
    assert.ok(codes(nested).includes('COLLECTION_NESTING_TOO_DEEP'));

    const budget = prepare((d) => {
      relationship(d, 'LINES').maxRows = 1000;
      d.sources.push({ alias: 'SUB', sourceVersionId: '22' });
      d.relationships.push(
        rel('SUB', 'COLLECTION', 'LINES', 'SUB', [['LINE_ID', 'REQUEST_ID']], {
          orderBy: [{ column: 'LINE_ID', direction: 'ASC' }],
          maxRows: 1000,
          rowKey: 'PK',
        }),
      );
    });
    assert.ok(codes(budget).includes('ROW_BUDGET_EXCEEDED'));
  });

  it('allows lookups only through a key of the looked-up source — never "the first row"', () => {
    const unkeyed = prepare((d) => {
      // DEPT_NAME is not a key: several departments could match.
      relationship(d, 'DEPARTMENT').join = [{ fromColumn: 'DEPT_ID', toColumn: 'ORG_ID' }];
      relationship(d, 'DEPARTMENT').organizationJoin = {
        fromColumn: 'DEPT_ID',
        toColumn: 'ORG_ID',
      };
    });
    assert.ok(codes(unkeyed).includes('LOOKUP_KEY_REQUIRED'));

    const declared = prepare(() => {}, {
      sourceVersions: (() => {
        const map = sourceVersions();
        map.get('23').config.keyCandidates = [key('UK', ['ITEM_CODE'], 'DECLARED')];
        return map;
      })(),
    });
    assert.equal(declared.valid, true, JSON.stringify(declared.findings));
    assert.ok(blockerCodes(declared).includes('PROVISIONAL_LOOKUP_KEY'));

    const ordered = prepare((d) => {
      relationship(d, 'ITEM').orderBy = [{ column: 'DESCRIPTION', direction: 'ASC' }];
    });
    assert.ok(codes(ordered).includes('LOOKUP_ORDER_NOT_ALLOWED'));
  });

  it('requires deterministic, complete collections and restricts keyless rows', () => {
    const unordered = prepare((d) => {
      relationship(d, 'LINES').orderBy = [];
    });
    assert.ok(codes(unordered).includes('COLLECTION_ORDER_REQUIRED'));

    const notUnique = prepare((d) => {
      relationship(d, 'LINES').orderBy = [{ column: 'LINE_NO', direction: 'ASC' }];
    });
    assert.ok(notUnique.findings.some((f) => f.code === 'COLLECTION_ORDER_NOT_UNIQUE'));

    const unacknowledged = prepare((d) => {
      relationship(d, 'NOTES').keylessAcknowledged = false;
    });
    assert.ok(codes(unacknowledged).includes('KEYLESS_ACK_REQUIRED'));

    const keylessCondition = prepare((d) => {
      relationship(d, 'NOTES').usage = ['DISPLAY', 'CONDITION'];
      d.fields.find((item) => item.code === 'NOTE').usage = ['CONDITION'];
    });
    assert.ok(codes(keylessCondition).includes('KEYLESS_LINE_USAGE_NOT_ALLOWED'));
    assert.ok(codes(keylessCondition).includes('KEYLESS_FIELD_USAGE_NOT_ALLOWED'));

    const underKeyless = prepare((d) => {
      d.sources.push({ alias: 'SUB', sourceVersionId: '22' });
      d.relationships.push(
        rel('SUB', 'COLLECTION', 'NOTES', 'SUB', [['REQUEST_ID', 'REQUEST_ID']], {
          orderBy: [{ column: 'LINE_ID', direction: 'ASC' }],
          maxRows: 5,
          rowKey: 'PK',
        }),
      );
    });
    assert.ok(codes(underKeyless).includes('COLLECTION_UNDER_KEYLESS_ROWS'));

    const noMaxRows = prepare((d) => {
      delete relationship(d, 'LINES').maxRows;
    });
    assert.ok(codes(noMaxRows).includes('SCHEMA_INVALID'));
  });

  it('never joins across organizations and records provisional relationships as blockers', () => {
    const orgOutsideJoin = prepare((d) => {
      relationship(d, 'REQUESTER').join = [
        { fromColumn: 'REQUESTER_EMP_NO', toColumn: 'EMPLOYEE_NUMBER' },
      ];
    });
    assert.ok(codes(orgOutsideJoin).includes('ORGANIZATION_JOIN_MISSING'));

    const referenceCollection = prepare((d) => {
      relationship(d, 'LINES').scope = 'REFERENCE_DATA';
    });
    assert.ok(codes(referenceCollection).includes('REFERENCE_DATA_COLLECTION'));

    const provisional = prepare((d) => {
      relationship(d, 'ITEM').verification = 'PROVISIONAL';
    });
    assert.equal(provisional.valid, true);
    assert.ok(blockerCodes(provisional).includes('PROVISIONAL_RELATIONSHIP'));

    const incompatible = prepare((d) => {
      relationship(d, 'ITEM').join = [{ fromColumn: 'QTY', toColumn: 'ITEM_CODE' }];
    });
    assert.ok(codes(incompatible).includes('JOIN_TYPE_INCOMPATIBLE'));
  });

  it('places record-level semantics only where a single value is guaranteed', () => {
    const statusFromLine = prepare((d) => {
      d.fields.push(field('LINE_STATUS', 'LINES', 'LINE_STATUS'));
      d.status.field = 'LINE_STATUS';
    });
    assert.ok(codes(statusFromLine).includes('FIELD_NOT_ROOT'));

    const scopeFromOptional = prepare((d) => {
      d.fields.push(
        field('EMP_ORG', 'EMP', 'ORG_ID', 'REFERENCE', { refType: 'ORGANIZATION_REF' }),
      );
      d.orgScope = { kind: 'FIELD', field: 'EMP_ORG' };
    });
    assert.ok(codes(scopeFromOptional).includes('FIELD_NOT_MANDATORY'));

    const attributeFromCollection = prepare((d) => {
      d.fields.push(
        field('LINE_REQ', 'LINES', 'REQUEST_ID', 'REFERENCE', { refType: 'PERSON_ID_REF' }),
      );
      d.attributes.push({ role: 'OWNER', field: 'LINE_REQ' });
    });
    assert.ok(codes(attributeFromCollection).includes('FIELD_NOT_RECORD_LEVEL'));

    const downgrade = prepare((d) => {
      d.fields.find((item) => item.code === 'REQUESTER_NAME').sensitivity = 'INTERNAL';
    });
    assert.ok(codes(downgrade).includes('SENSITIVITY_DOWNGRADE'));
  });
});

// --- Business record assembler ------------------------------------------------------------------

const rows = () => ({
  REQ: [
    {
      REQUEST_ID: '1001',
      REQUEST_NO: 'REQ-1001',
      ORG_ID: '7',
      STATUS: 'S',
      TOTAL_AMOUNT: '1250.50',
      REQUESTER_EMP_NO: 'E-42',
    },
  ],
  LINES: [
    {
      LINE_ID: '2',
      REQUEST_ID: '1001',
      LINE_NO: '1',
      ITEM_CODE: 'BOLT',
      QTY: '10',
      LINE_STATUS: 'A',
    },
    {
      LINE_ID: '3',
      REQUEST_ID: '1001',
      LINE_NO: '2',
      ITEM_CODE: 'NUT',
      QTY: '2.500',
      LINE_STATUS: 'A',
    },
    {
      LINE_ID: '4',
      REQUEST_ID: '1001',
      LINE_NO: '3',
      ITEM_CODE: 'BOLT',
      QTY: '1',
      LINE_STATUS: 'A',
    },
  ],
  ITEM: [
    { ITEM_CODE: 'BOLT', DESCRIPTION: 'Hex bolt' },
    { ITEM_CODE: 'NUT', DESCRIPTION: 'Hex nut' },
  ],
  EMP: [{ EMPLOYEE_NUMBER: 'E-42', ORG_ID: '7', FULL_NAME: 'Fictional Person', DEPT_ID: '5' }],
  DEPT: [{ DEPT_ID: '5', ORG_ID: '7', DEPT_NAME: 'Maintenance' }],
  NOTES: [
    { REQUEST_ID: '1001', NOTE_TEXT: 'Urgent' },
    { REQUEST_ID: '1001', NOTE_TEXT: 'Urgent' },
  ],
});
const assemble = (mutateRows = () => {}, options = {}) => {
  const data = rows();
  mutateRows(data);
  return assembleBusinessRecord({
    config: options.config ?? prepare().config,
    sourceVersions: sourceVersions(),
    rows: data,
    audience: { maxSensitivity: 'PERSONAL' },
    ...options,
  });
};
const throwsCode = (action, code) =>
  assert.throws(
    action,
    (error) => error.name === 'BusinessRecordError' && error.code === code,
    code,
  );

describe('business record assembler (zrv.wf.businessRecord/1)', () => {
  it('returns one header with complete lines and a lookup per line — never flattened rows', () => {
    const record = assemble();
    assert.equal(record.format, BUSINESS_RECORD_FORMAT);
    assert.equal(record.recordKey.json, '{"REQUEST_ID":"1001"}');
    assert.deepEqual(record.organization, { kind: 'FIELD', value: '7' });
    assert.deepEqual(record.status, { code: 'SUBMITTED', category: 'INITIAL' });
    // Header values appear exactly once, whatever the number of lines.
    assert.equal(record.data.fields.TOTAL_AMOUNT, '1250.5');
    const lines = record.data.related.LINES;
    assert.equal(lines.complete, true);
    assert.equal(lines.keyed, true);
    assert.equal(lines.rowCount, 3);
    assert.deepEqual(
      lines.rows.map((line) => [
        line.rowKey,
        line.fields.ITEM_CODE,
        line.fields.QUANTITY,
        line.related.ITEM.fields.ITEM_DESCRIPTION,
      ]),
      [
        ['{"LINE_ID":"2"}', 'BOLT', '10', 'Hex bolt'],
        ['{"LINE_ID":"3"}', 'NUT', '2.5', 'Hex nut'],
        ['{"LINE_ID":"4"}', 'BOLT', '1', 'Hex bolt'],
      ],
      'the same item is looked up for each line that uses it',
    );
    // Multi-hop: requester → department.
    assert.equal(record.data.related.REQUESTER.fields.REQUESTER_NAME, 'Fictional Person');
    assert.equal(record.data.related.REQUESTER.related.DEPARTMENT.fields.DEPARTMENT, 'Maintenance');
    assert.deepEqual(
      record.provenance.sources.map((source) => [source.alias, source.sourceVersionId]),
      [
        ['REQ', '21'],
        ['LINES', '22'],
        ['ITEM', '23'],
        ['EMP', '24'],
        ['DEPT', '25'],
        ['NOTES', '26'],
      ],
    );
    assert.ok(Object.isFrozen(record) && Object.isFrozen(lines.rows));
  });

  it('returns null for a missing optional lookup and fails for a missing required one', () => {
    const record = assemble((data) => {
      data.EMP = [];
    });
    assert.equal(record.data.related.REQUESTER, null, 'optional missing lookup is null');
    throwsCode(
      () =>
        assemble((data) => {
          data.ITEM = data.ITEM.filter((item) => item.ITEM_CODE !== 'NUT');
        }),
      'LOOKUP_REQUIRED_MISSING',
    );
    // An employee of another organization never matches the organization-scoped join.
    const other = assemble((data) => {
      data.EMP[0].ORG_ID = '8';
    });
    assert.equal(other.data.related.REQUESTER, null);
  });

  it('fails explicitly when a single lookup matches more than one row', () => {
    throwsCode(
      () =>
        assemble((data) => {
          data.ITEM.push({ ITEM_CODE: 'BOLT', DESCRIPTION: 'Duplicate bolt' });
        }),
      'LOOKUP_AMBIGUOUS',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.EMP.push({ ...data.EMP[0], FULL_NAME: 'Second match' });
        }),
      'LOOKUP_AMBIGUOUS',
    );
  });

  it('never truncates a collection and enforces required collections', () => {
    const config = prepare((d) => {
      relationship(d, 'LINES').maxRows = 2;
    }).config;
    throwsCode(() => assemble(() => {}, { config }), 'COLLECTION_OVERFLOW');

    const empty = assemble((data) => {
      data.LINES = [];
    });
    assert.deepEqual(
      { rowCount: empty.data.related.LINES.rowCount, rows: empty.data.related.LINES.rows },
      { rowCount: 0, rows: [] },
      'no lines is an empty list',
    );
    const required = prepare((d) => {
      relationship(d, 'LINES').kind = 'REQUIRED_COLLECTION';
    }).config;
    throwsCode(
      () =>
        assemble(
          (data) => {
            data.LINES = [];
          },
          { config: required },
        ),
      'COLLECTION_REQUIRED_EMPTY',
    );
  });

  it('keeps keyless rows exactly as read and refuses duplicate keys of keyed rows', () => {
    const notes = assemble().data.related.NOTES;
    assert.equal(notes.keyed, false);
    assert.deepEqual(
      notes.rows.map((row) => [row.rowKey, row.fields.NOTE]),
      [
        [null, 'Urgent'],
        [null, 'Urgent'],
      ],
      'duplicates are preserved, never merged',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.LINES.push({ ...data.LINES[0] });
        }),
      'ROW_KEY_DUPLICATE',
    );
  });

  it('redacts fields above the audience and requires the audience to be stated', () => {
    const internal = assemble(() => {}, { audience: { maxSensitivity: 'INTERNAL' } });
    assert.equal(internal.data.related.REQUESTER.fields.REQUESTER_NAME, REDACTED);
    assert.equal(internal.data.fields.REQUEST_NO, 'REQ-1001');
    assert.ok(!JSON.stringify(internal).includes('Fictional Person'), 'the value is not included');
    throwsCode(() => assemble(() => {}, { audience: undefined }), 'AUDIENCE_REQUIRED');
  });

  it('fails closed on a missing or duplicated root, filter violations, missing columns and unmapped status', () => {
    throwsCode(
      () =>
        assemble((data) => {
          data.REQ = [];
        }),
      'ROOT_NOT_FOUND',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.REQ.push({ ...data.REQ[0] });
        }),
      'ROOT_AMBIGUOUS',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.LINES[1].LINE_STATUS = 'X';
        }),
      'ROW_FILTER_MISMATCH',
    );
    throwsCode(
      () =>
        assemble((data) => {
          delete data.LINES[0].QTY;
        }),
      'ROW_COLUMN_MISSING',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.REQ[0].STATUS = 'Z';
        }),
      'STATUS_UNMAPPED',
    );
    throwsCode(
      () =>
        assemble((data) => {
          data.LINES[0].QTY = 1.5;
        }),
      'VALUE_INVALID',
    );
  });

  it('identifies the record by a composite business key in canonical form', () => {
    const config = prepare((d) => {
      d.root.keyCandidate = 'BUSINESS_NO';
    }).config;
    const record = assemble(() => {}, { config });
    assert.equal(record.recordKey.json, '{"ORG_ID":"7","REQUEST_NO":"REQ-1001"}');
    assert.match(record.recordKey.sha256, /^[0-9a-f]{64}$/);
  });
});
