import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import oracledb from 'oracledb';
import * as orientationRepository from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import * as interviewRepository from '../src/modules/hr/interview-assessments/interviewAssessment.repository.js';
import * as probationRepository from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';
import * as requisitionRepository from '../src/modules/hr/requisitions/requisition.repository.js';

// Probation (GENERATED ALWAYS) and orientation, requisition, interview and attachment (BY DEFAULT)
// IDs come from Oracle identity columns: headers return theirs with RETURNING INTO, lines and the
// flag registry never send an ID. Requisition numbers and INT_NO are written from the returned ID.
function recordingConnection(outBinds) {
  const statements = [];
  return {
    statements,
    async execute(sql, binds) {
      statements.push({ sql, binds });
      return { rows: [], rowsAffected: 1, outBinds };
    },
  };
}

describe('HR identity-column IDs', () => {
  it('probation header insert returns HEADER_ID through RETURNING INTO', async () => {
    const connection = recordingConnection({ headerId: ['1040'] });
    const id = await probationRepository.insertHeader(connection, { uuid: 'u' });
    const [{ sql, binds }] = connection.statements;
    assert.match(sql, /RETURNING HEADER_ID INTO :headerId/);
    assert.doesNotMatch(sql, /MAX\(/);
    assert.deepEqual(binds.headerId, { dir: oracledb.BIND_OUT, type: oracledb.STRING });
    assert.equal(id, '1040');
  });

  it('orientation header insert returns HEADER_ID through RETURNING INTO', async () => {
    const connection = recordingConnection({ headerId: ['1081'] });
    const id = await orientationRepository.insertHeader(
      connection,
      orientationRepository.TABLES.Y,
      { uuid: 'u' },
    );
    assert.match(connection.statements[0].sql, /RETURNING HEADER_ID INTO :headerId/);
    assert.equal(id, '1081');
  });

  it('line and flag-registry inserts leave the ID to the identity column', async () => {
    const connection = recordingConnection();
    await probationRepository.insertLine(connection, { headerId: '1' });
    await orientationRepository.insertLine(connection, orientationRepository.TABLES.N, {
      headerId: '1',
    });
    await orientationRepository.registerFlag(connection, '1', 'PRODUCTION');
    const [probationLine, orientationLine, flag] = connection.statements.map(({ sql }) => sql);
    assert.doesNotMatch(probationLine, /\bLINE_ID\b/);
    assert.doesNotMatch(orientationLine, /DEP_LINE_ID/);
    assert.match(flag, /\(FORM_HEADER_ID, TABLE_NAME\)/);
    for (const sql of connection.statements.map((s) => s.sql)) assert.doesNotMatch(sql, /MAX\(/);
  });

  it('no MAX+1 ID helpers remain in either repository', () => {
    for (const name of ['generateHeaderId', 'generateLineId', 'findHeaderIdByUuid']) {
      assert.equal(name in probationRepository, false, `probation ${name}`);
      assert.equal(name in orientationRepository, false, `orientation ${name}`);
    }
  });

  it('requisition header and attachment inserts return identity IDs; the number follows the ID', async () => {
    const connection = recordingConnection({ reqId: ['100021'], attachmentId: ['48600'] });
    assert.equal(
      await requisitionRepository.insertHeader(connection, { createdBy: '1' }),
      '100021',
    );
    await requisitionRepository.setRequisitionNumber(connection, '100021');
    const attachmentId = await requisitionRepository.insertAttachment(connection, {
      requisitionId: '100021',
      fileName: 'a.pdf',
    });
    assert.equal(attachmentId, '48600');

    const [header, number, attachment] = connection.statements;
    assert.match(header.sql, /RETURNING REQUISITION_ID INTO :reqId/);
    assert.doesNotMatch(header.sql.split('RETURNING')[0], /REQUISITION_ID|REQUISITION_NUMBER/);
    assert.deepEqual(header.binds.reqId, { dir: oracledb.BIND_OUT, type: oracledb.STRING });
    assert.match(number.sql, /SET REQUISITION_NUMBER = TO_CHAR\(REQUISITION_ID\)/);
    assert.deepEqual(number.binds, { requisitionId: '100021' });
    assert.match(attachment.sql, /RETURNING HEADER_ID INTO :attachmentId/);
    assert.doesNotMatch(attachment.sql.split('RETURNING')[0], /[(\s]HEADER_ID\b/);
    for (const { sql } of connection.statements) assert.doesNotMatch(sql, /MAX\(/);
  });

  it('interview header insert returns HEADER_ID; INT_NO is set from it afterwards', async () => {
    const connection = recordingConnection({ headerId: ['1590'] });
    assert.equal(await interviewRepository.insertHeader(connection, { uuid: 'u' }), '1590');
    await interviewRepository.setIntNo(connection, { headerId: '1590', intNo: 'BU-1590' });
    const [insert, intNo] = connection.statements;
    assert.match(insert.sql, /RETURNING HEADER_ID INTO :headerId/);
    assert.doesNotMatch(insert.sql.split('RETURNING')[0], /[(\s]HEADER_ID\b|\bINT_NO\b/);
    assert.match(intNo.sql, /SET INT_NO = :intNo WHERE HEADER_ID = :headerId/);
    assert.doesNotMatch(insert.sql, /MAX\(/);
  });

  it('interview evaluation insert avoids Oracle reserved bind name COMMENT', async () => {
    const connection = recordingConnection();
    const binds = {
      headerId: '1590',
      evalStatus: 'Passed',
      evalComment: 'Recommended',
      createdBy: '9',
    };
    await interviewRepository.insertEvaluation(connection, binds);
    await interviewRepository.mergeEvaluation(connection, { ...binds, updatedBy: '9' });
    for (const { sql, binds: usedBinds } of connection.statements) {
      assert.doesNotMatch(sql, /:comment\b/i);
      assert.match(sql, /:evalComment\b/);
      assert.equal(usedBinds.evalComment, 'Recommended');
    }
  });

  it('no MAX-based ID helpers remain for requisitions, interviews or attachments', () => {
    for (const name of ['generateRequisitionId', 'generateAttachmentId']) {
      assert.equal(name in requisitionRepository, false, name);
    }
    assert.equal('generateHeaderId' in interviewRepository, false);
  });
});
