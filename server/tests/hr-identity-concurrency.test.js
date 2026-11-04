import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInterviewAssessmentService } from '../src/modules/hr/interview-assessments/interviewAssessment.service.js';
import { createRequisitionService } from '../src/modules/hr/requisitions/requisition.service.js';

// Concurrent creates through the real services and repositories (audit §10.4). A simulated Oracle
// connection yields before every statement so transactions interleave, shows each transaction only
// committed rows plus its own (READ COMMITTED) and assigns identity values atomically on
// INSERT … RETURNING. The control test shows the same simulator catches the legacy MAX+1 clash.
const tick = () => new Promise((resolve) => setImmediate(resolve));

function simulatedOracle() {
  const committed = [];
  const identity = new Map();
  const nextIdentity = (table) => {
    const value = identity.get(table) ?? 1000;
    identity.set(table, value + 1);
    return String(value);
  };

  const connectionFor = (pending) => ({
    async execute(sql, binds = {}) {
      await tick();
      const text = sql.replace(/\s+/g, ' ').trim();
      const visible = () => [...committed, ...pending];

      const max = /^SELECT NVL\(MAX\((\w+)\) \+ 1, 1\) AS ID FROM (\S+)$/i.exec(text);
      if (max) {
        const ids = visible()
          .filter((row) => row.table === max[2])
          .map((row) => Number(row.id));
        return { rows: [{ ID: ids.length ? Math.max(...ids) + 1 : 1 }] };
      }
      const insert = /^INSERT INTO (\S+) .*?(?:RETURNING (\w+) INTO :(\w+))?$/i.exec(text);
      if (insert) {
        const [, table, , outName] = insert;
        const id = outName ? nextIdentity(table) : (binds.id ?? null);
        pending.push({ table, id, binds });
        return { rowsAffected: 1, outBinds: outName ? { [outName]: [id] } : undefined };
      }
      if (/^UPDATE XXZPI_PER_REQUISITIONS_ALL SET REQUISITION_NUMBER/i.test(text)) {
        const row = pending.find((r) => r.id === binds.requisitionId);
        row.number = row.id;
        return { rowsAffected: 1 };
      }
      if (/^UPDATE XXZP\.XXZP_INTERVW_ASSESMNT_HEADER_T SET INT_NO/i.test(text)) {
        pending.find((r) => r.id === binds.headerId).number = binds.intNo;
        return { rowsAffected: 1 };
      }
      if (/FROM XX_DIGI_LOOKUP_VALUES/i.test(text)) return { rows: [] };
      if (/FROM XX_DIGI_EMP_MASTER/i.test(text)) {
        return {
          rows: [{ FULL_NAME: 'ZZTEST Person', EMAIL_ADDRESS: null, EMPLOYEE_NUMBER: '9' }],
        };
      }
      if (/^SELECT REQUISITION_NUMBER FROM XXZPI_PER_REQUISITIONS_ALL/i.test(text)) {
        return { rows: [{ REQUISITION_NUMBER: binds.requisitionNo }] };
      }
      throw new Error(`Unexpected SQL in the simulator: ${text.slice(0, 80)}`);
    },
  });

  return {
    committed,
    withConnection: (_pool, work) => work(connectionFor([])),
    async withTransaction(_pool, work) {
      const pending = [];
      const result = await work(connectionFor(pending));
      committed.push(...pending);
      return result;
    },
  };
}

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const PARALLEL = 12;

describe('HR identity IDs under concurrent creates', () => {
  it('control: the simulator does expose the legacy MAX+1 clash', async () => {
    const db = simulatedOracle();
    await Promise.all(
      Array.from({ length: PARALLEL }, () =>
        db.withTransaction(null, async (c) => {
          const [{ ID }] = (await c.execute('SELECT NVL(MAX(ID) + 1, 1) AS ID FROM LEGACY_T')).rows;
          await c.execute('INSERT INTO LEGACY_T (ID) VALUES (:id)', { id: String(ID) });
        }),
      ),
    );
    assert.ok(duplicates(db.committed.map((row) => row.id)).length > 0, 'MAX+1 clashes');
  });

  it('requisition creates with attachments get distinct IDs, numbers and attachment IDs', async () => {
    const db = simulatedOracle();
    const service = createRequisitionService({
      auditService: { record: async () => {} },
      storage: { save: async () => {}, remove: async () => {} },
      withConnection: db.withConnection,
      withTransaction: db.withTransaction,
    });
    const body = {
      requestDate: '2026-11-02',
      dateNeeded: '2026-12-01',
      jobName: 'ZZTEST job',
      deptName: 'ZZTEST dept',
      reasonOfReq: 'Addition',
    };
    const files = [
      { originalname: 'a.pdf', buffer: Buffer.from('a') },
      { originalname: 'b.pdf', buffer: Buffer.from('b') },
    ];
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => service.create({ userId: '1' }, body, files)),
    );

    const ids = results.map((r) => r.requisitionId);
    assert.deepEqual(duplicates(ids), []);
    for (const r of results) assert.equal(r.requisitionNumber, r.requisitionId);

    const headers = db.committed.filter((row) => row.table === 'XXZPI_PER_REQUISITIONS_ALL');
    assert.equal(headers.length, PARALLEL);
    for (const header of headers) assert.equal(header.number, header.id, 'number = ID');
    // Consecutive identity values: requisition numbers now step by 1.
    assert.deepEqual(
      ids.map(Number).sort((a, b) => a - b),
      Array.from({ length: PARALLEL }, (_, index) => 1000 + index),
    );

    const attachments = db.committed.filter((row) => row.table === 'xxzp_all_attachments');
    assert.equal(attachments.length, PARALLEL * 2);
    assert.deepEqual(duplicates(attachments.map((row) => row.id)), []);
    for (const row of attachments) assert.ok(ids.includes(row.binds.requisitionId));
  });

  it('interview creates get distinct HEADER_IDs, matching INT_NOs and child rows', async () => {
    const db = simulatedOracle();
    const service = createInterviewAssessmentService({
      withConnection: db.withConnection,
      withTransaction: db.withTransaction,
    });
    const body = {
      candidateName: 'ZZTEST Candidate',
      positionName: 'ZZTEST Position',
      requisitionNo: '100000',
      attribute3: '300000003618177',
      evaluation: { status: 'Passed' },
    };
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => service.create({ userId: '1' }, body)),
    );

    const ids = results.map((r) => r.headerId);
    assert.deepEqual(duplicates(ids), []);
    for (const r of results) {
      assert.equal(r.intNo, `300000003618177-${r.headerId.padStart(3, '0')}`);
    }
    const headers = db.committed.filter(
      (row) => row.table === 'XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T',
    );
    assert.deepEqual(
      headers.map((h) => h.number).sort(),
      results.map((r) => r.intNo).sort(),
      'INT_NO stored from the returned ID',
    );
    for (const table of [
      'XXZP.XXZP_PERSONAL_SPEC_T',
      'XXZP.XXZP_JOB_COMPETENCY_T',
      'XXZP.XXZP_INTERVIEW_EVAL_T',
    ]) {
      const children = db.committed.filter((row) => row.table === table);
      assert.deepEqual(
        children.map((row) => row.binds.headerId).sort(),
        [...ids].sort(),
        `${table}: one child per header`,
      );
    }
  });
});
