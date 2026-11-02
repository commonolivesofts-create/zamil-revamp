import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import oracledb from 'oracledb';
import * as orientationRepository from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import * as probationRepository from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';

// Probation (GENERATED ALWAYS) and orientation (BY DEFAULT) IDs come from Oracle identity columns:
// headers return theirs with RETURNING INTO, lines and the flag registry never send an ID.
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
});
