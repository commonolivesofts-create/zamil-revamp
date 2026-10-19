import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import * as auditRepository from '../src/modules/audit/securityAudit.repository.js';
import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
  createSecurityAuditService,
} from '../src/modules/audit/securityAudit.service.js';

// Static and unit checks (Decisions 03 and 07). They guard the application code only; database
// immutability (trigger, revoked UPDATE/DELETE grants) is a separate pre-production blocker.

const SRC = join(import.meta.dirname, '..', 'src');
const SCRIPTS = join(import.meta.dirname, '..', 'scripts');

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith('.js')
        ? [join(dir, entry.name)]
        : [],
  );
}

const MUTATION =
  /\b(UPDATE|DELETE(\s+FROM)?|MERGE\s+INTO|TRUNCATE\s+TABLE)\s+(\w+\.)?xx_zrv_rbac_audit_logs\b/i;

describe('security audit is append-only in the application (Decision 03)', () => {
  it('no application or script SQL updates, deletes, merges or truncates audit rows', () => {
    const offenders = [...sourceFiles(SRC), ...sourceFiles(SCRIPTS)]
      .filter((file) => MUTATION.test(readFileSync(file, 'utf8')))
      .map((file) => relative(join(SRC, '..'), file));

    assert.deepEqual(offenders, []);
  });

  it('the audit repository exposes only an INSERT', async () => {
    assert.deepEqual(Object.keys(auditRepository), ['insertAuditEvent']);

    let sql;
    await auditRepository.insertAuditEvent(
      {
        async execute(statement) {
          sql = statement;
        },
      },
      {},
    );
    assert.match(sql, /^\s*INSERT INTO xx_zrv_rbac_audit_logs\s*\(/);
    assert.ok(!/updated_at|updated_by/i.test(sql), 'UPDATED_* stay NULL (CK_ZRV_AUD_IMMUT)');
  });

  it('the audit service offers no update or delete operation', () => {
    assert.deepEqual(Object.keys(createSecurityAuditService()).sort(), [
      'record',
      'recordIndependently',
    ]);
  });

  it('recordIndependently commits in its own transaction', async () => {
    const calls = [];
    const service = createSecurityAuditService({
      repository: { insertAuditEvent: async () => calls.push('insert') },
      withTransaction: async (pool, work) => {
        calls.push(`begin:${pool}`);
        await work({});
        calls.push('commit');
      },
    });

    await service.recordIndependently({
      eventCode: AUDIT_EVENTS.LOGIN_FAILED,
      outcome: AUDIT_OUTCOMES.FAILURE,
      actorType: ACTOR_TYPES.ANONYMOUS,
    });
    assert.deepEqual(calls, ['begin:LOW', 'insert', 'commit']);
  });
});

describe('approved audit catalogue (Decision 07)', () => {
  it('uses exactly the approved event codes and outcomes', () => {
    assert.deepEqual(Object.values(AUDIT_EVENTS).sort(), [
      'ACCESS_DENIED',
      'ACCOUNT_LOCKED',
      'LOGIN_FAILED',
      'LOGIN_SUCCESS',
      'LOGOUT',
      'SECURITY_BOOTSTRAP',
      'SESSION_EXPIRED',
      'SESSION_REVOKED',
    ]);
    assert.deepEqual(Object.values(AUDIT_OUTCOMES).sort(), ['DENIED', 'FAILURE', 'SUCCESS']);
  });

  it('fits the locked Oracle column checks', () => {
    // CK_ZRV_AUD_EVENT, EVENT_CODE VARCHAR2(80); CK_ZRV_AUD_OUTCOME, VARCHAR2(12); CK_ZRV_AUD_ACTOR.
    for (const code of Object.values(AUDIT_EVENTS)) {
      assert.match(code, /^[A-Z][A-Z0-9_]*$/);
      assert.ok(code.length <= 80);
    }
    for (const outcome of Object.values(AUDIT_OUTCOMES)) assert.ok(outcome.length <= 12);
    assert.deepEqual(Object.values(ACTOR_TYPES).sort(), ['ANONYMOUS', 'SYSTEM', 'USER']);
  });

  it('no source file uses an event code outside the catalogue', () => {
    const used = new Set();
    for (const file of sourceFiles(SRC)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/AUDIT_EVENTS\.([A-Z_]+)/g)) {
        used.add(match[1]);
      }
      assert.doesNotMatch(readFileSync(file, 'utf8'), /'AUTH_(LOGIN|LOGOUT|SESSION|ACCOUNT)/);
    }
    for (const key of used) assert.ok(key in AUDIT_EVENTS, key);
  });
});
