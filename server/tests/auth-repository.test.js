import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import oracledb from 'oracledb';
import {
  findLoginCandidates,
  PRIVILEGE_COLUMNS,
  privilegeColumnsSql,
  recordFailedAttempt,
  recordLoginSuccess,
  recordMfaStep,
  enrollMfa,
  terminationStatusSql,
} from '../src/modules/auth/auth.repository.js';
import {
  findSessionByTokenHash,
  insertSession,
  revokeSession,
} from '../src/modules/auth/session.repository.js';
import { insertAuditEvent } from '../src/modules/audit/securityAudit.repository.js';
import { buildAuditEvent } from '../src/modules/audit/securityAudit.service.js';

// Recording test doubles: these verify bind usage and result mapping only. The SQL text itself
// is checked against the real TEST schema by `npm run db:verify-auth` (read-only).

function recordingConnection(result) {
  const calls = [];
  return {
    calls,
    async execute(sql, binds, options) {
      calls.push({ sql, binds, options });
      return typeof result === 'function' ? result(sql, binds) : result;
    },
  };
}

describe('auth repositories', () => {
  it('passes the username only as a bind variable and reads IDs as strings', async () => {
    const hostile = "x' OR '1'='1";
    const connection = recordingConnection({ rows: [] });

    await findLoginCandidates(connection, hostile);

    const [{ sql, binds, options }] = connection.calls;
    assert.deepEqual(binds, { username: hostile, ...PRIVILEGE_COLUMNS.binds });
    assert.ok(!sql.includes(hostile));
    assert.match(sql, /UPPER\(TRIM\(e\.user_name\)\) = UPPER\(TRIM\(:username\)\)/);
    assert.match(sql, /FETCH FIRST 2 ROWS ONLY/);
    assert.deepEqual(options.fetchInfo.USER_ID, { type: oracledb.STRING });
    assert.ok(
      !/basic_salary|passport|iqama|national_identifier/i.test(sql),
      'no sensitive HR data',
    );
  });

  it('maps a 19-digit USER_ID without precision loss', async () => {
    const bigId = '9223372036854775807';
    const connection = recordingConnection({
      rows: [
        {
          EMPLOYEE_NUMBER: 'E1',
          USER_NAME: 'A',
          EMPLOYEE_ROW_COUNT: 1,
          TERMINATION_STATUS: 'FUTURE',
          CURRENT_EMP_FLAG: 'Y',
          USER_ID: bigId,
          MFA_ENROLLED: 0,
          IS_PRIVILEGED_ROLE_MEMBER: 0,
          HAS_SECURITY_ADMINISTRATION: 1,
          DB_NOW: new Date(),
        },
      ],
    });

    const [candidate] = await findLoginCandidates(connection, 'A');
    assert.equal(candidate.account.userId, bigId);
    assert.equal(candidate.employee.terminationStatus, 'FUTURE');
    assert.equal(candidate.account.employeeNumber, 'E1');
    assert.equal(candidate.account.isPrivilegedRoleMember, false);
    assert.equal(candidate.account.hasSecurityAdministration, true);
  });

  it('returns null when a concurrent request already holds the lock', async () => {
    const connection = recordingConnection({ rowsAffected: 0 });
    const result = await recordFailedAttempt(connection, {
      userId: '1',
      maxFailures: 5,
      lockSeconds: 900,
    });

    assert.equal(result, null);
    assert.equal(connection.calls[0].binds.maxFailures, 5);
    assert.equal(connection.calls[0].binds.lockSeconds, 900);
  });

  it('maps the failed-attempt counter and lock flag from RETURNING', async () => {
    const connection = recordingConnection({
      rowsAffected: 1,
      outBinds: { failedAttempts: [5], locked: [1] },
    });

    assert.deepEqual(
      await recordFailedAttempt(connection, { userId: '1', maxFailures: 5, lockSeconds: 900 }),
      { failedAttempts: 5, locked: true },
    );
  });

  it('reports a login-success update that no longer matches the account state', async () => {
    assert.equal(await recordLoginSuccess(recordingConnection({ rowsAffected: 0 }), '1'), false);
    assert.equal(await recordLoginSuccess(recordingConnection({ rowsAffected: 1 }), '1'), true);
  });

  it('stores only the token digest and returns the session ID as a string', async () => {
    const tokenHash = Buffer.alloc(32, 7);
    const connection = recordingConnection({
      outBinds: { sessionId: ['12345678901234567890'], expiresAt: [new Date(0)] },
    });

    const result = await insertSession(connection, {
      userId: '1',
      tokenHash,
      absoluteSeconds: 28800,
      ipAddress: '192.0.2.1',
      userAgent: 'ua',
    });

    const { binds, sql } = connection.calls[0];
    assert.equal(binds.tokenHash, tokenHash);
    assert.equal(binds.sessionId.type, oracledb.STRING);
    assert.match(sql, /created_by\s*\)\s*VALUES[\s\S]*:userId\s*\)/, 'CREATED_BY = USER_ID');
    assert.equal(result.sessionId, '12345678901234567890');
  });

  it('looks sessions up by digest only', async () => {
    const tokenHash = Buffer.alloc(32, 1);
    const connection = recordingConnection({ rows: [] });

    await findSessionByTokenHash(connection, tokenHash);
    assert.deepEqual(connection.calls[0].binds, { tokenHash, ...PRIVILEGE_COLUMNS.binds });
  });

  it('reports whether a revocation changed a row', async () => {
    assert.equal(
      await revokeSession(recordingConnection({ rowsAffected: 1 }), {
        sessionId: '1',
        actorUserId: null,
      }),
      true,
    );
  });
});

describe('MFA repository atomicity', () => {
  // Oracle serialises concurrent UPDATEs of the same row and re-evaluates the WHERE clause for the
  // waiting statement after the first commits, so only one can affect the row. These tests pin
  // the guards in the SQL and the rowsAffected handling that the service relies on.
  it('consumes a TOTP step only if it is later than the last accepted step', async () => {
    const connection = recordingConnection({ rowsAffected: 1 });
    assert.equal(await recordMfaStep(connection, { userId: '1', step: 42 }), true);

    const { sql, binds } = connection.calls[0];
    assert.match(sql, /^\s*UPDATE xx_zrv_users/);
    assert.match(sql, /mfa_last_used_step = :step/);
    assert.match(sql, /\(mfa_last_used_step IS NULL OR mfa_last_used_step < :step\)/);
    assert.deepEqual(binds, { userId: '1', step: 42 });
    assert.equal(await recordMfaStep(recordingConnection({ rowsAffected: 0 }), binds), false);
  });

  it('enrolls only when no authenticator exists', async () => {
    const connection = recordingConnection({ rowsAffected: 1 });
    assert.equal(
      await enrollMfa(connection, { userId: '1', encryptedSecret: 'v1.k1.x', step: 7 }),
      true,
    );

    const { sql } = connection.calls[0];
    assert.match(sql, /mfa_totp_secret_encrypted IS NULL\s+AND mfa_enrolled_at IS NULL/);
    assert.equal(
      await enrollMfa(recordingConnection({ rowsAffected: 0 }), {
        userId: '1',
        encryptedSecret: 'v1.k1.x',
        step: 7,
      }),
      false,
    );
  });
});

describe('eligibility and privilege SQL builders', () => {
  it('compares TERMINATION_DATE as a calendar date against the Asia/Riyadh business date', () => {
    const sql = terminationStatusSql('e.termination_date');

    assert.match(sql, /WHEN e\.termination_date IS NULL THEN 'NONE'/);
    assert.match(
      sql,
      /TRUNC\(e\.termination_date\) > TRUNC\(CAST\(SYSTIMESTAMP AT TIME ZONE 'Asia\/Riyadh' AS DATE\)\)/,
    );
    assert.match(sql, /ELSE 'ENDED'/);
  });

  it('binds the approved protected roles and security module, never interpolating them', () => {
    const { sql, binds } = PRIVILEGE_COLUMNS;

    assert.deepEqual(binds, {
      privRole0: 'SUPER_ADMINISTRATOR',
      privRole1: 'MAIN_ADMINISTRATOR',
      privRole2: 'ADMINISTRATOR',
      secModule0: 'SECURITY_ADMINISTRATION',
    });
    assert.ok(!/SUPER_ADMINISTRATOR|SECURITY_ADMINISTRATION/.test(sql));
    assert.match(sql, /pr\.role_code IN \(:privRole0, :privRole1, :privRole2\)/);
    assert.match(sql, /sm\.module_code IN \(:secModule0\)/);
  });

  it('applies active state, expiry and DENY precedence in the classification SQL', () => {
    const { sql } = PRIVILEGE_COLUMNS;
    const [roleSql, permissionSql] = sql.split('AS is_privileged_role_member');

    // Protected role: active membership, active role, unexpired.
    assert.match(roleSql, /pur\.is_active = 1/);
    assert.match(roleSql, /pr\.is_active = 1/);
    assert.match(roleSql, /pur\.expires_at IS NULL OR pur\.expires_at > SYSTIMESTAMP/);
    // Security permission: active permission, resource and module; any action (no action filter).
    assert.match(
      permissionSql,
      /sp\.is_active = 1[\s\S]*sres\.is_active = 1[\s\S]*sm\.is_active = 1/,
    );
    assert.doesNotMatch(permissionSql, /action_code/);
    // DENY (active, unexpired) excludes the permission before role grants and ALLOW are considered.
    assert.match(
      permissionSql,
      /AND NOT EXISTS \([\s\S]*sd\.is_active = 1[\s\S]*override_effect = 'DENY'[\s\S]*sd\.expires_at > SYSTIMESTAMP[\s\S]*\)\s*AND \(/,
    );
    assert.match(permissionSql, /srp\.is_active = 1/);
    assert.match(permissionSql, /sur\.expires_at IS NULL OR sur\.expires_at > SYSTIMESTAMP/);
    assert.match(permissionSql, /override_effect = 'ALLOW'[\s\S]*sa\.expires_at > SYSTIMESTAMP/);
  });

  it('refuses to build an empty classification', () => {
    for (const classification of [
      { privilegedRoleCodes: [], securityAdministrationModuleCodes: ['M'] },
      { privilegedRoleCodes: ['R'], securityAdministrationModuleCodes: [] },
      { privilegedRoleCodes: null, securityAdministrationModuleCodes: null },
    ]) {
      assert.throws(() => privilegeColumnsSql(classification), /requires role and security-module/);
    }
  });
});

describe('security audit rows', () => {
  it('populates CREATED_BY only for USER actors and pairs target type and id', () => {
    const anonymous = buildAuditEvent({
      eventCode: 'AUTH_LOGIN_FAILED',
      outcome: 'FAILURE',
      actorType: 'ANONYMOUS',
      actorUserId: '9',
      reasonCode: 'UNKNOWN_USERNAME',
      context: { requestId: 'r'.repeat(80), ipAddress: '1'.repeat(60), userAgent: 'u'.repeat(600) },
    });

    assert.equal(anonymous.createdBy, null);
    assert.equal(anonymous.targetType, null);
    assert.equal(anonymous.targetRecordId, null);
    assert.equal(anonymous.eventDetails, null);
    assert.equal(anonymous.correlationId.length, 64);
    assert.equal(anonymous.clientIpAddress.length, 45);
    assert.equal(anonymous.userAgent.length, 512);

    const user = buildAuditEvent({
      eventCode: 'AUTH_LOGOUT',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorUserId: '9',
      target: { type: 'USER_SESSION', id: '5' },
      details: { a: 1 },
    });
    assert.equal(user.createdBy, '9');
    assert.equal(user.targetType, 'USER_SESSION');
    assert.equal(user.targetRecordId, '5');
    assert.equal(user.eventDetails, '{"a":1}');
  });

  it('refuses a USER event without an actor', () => {
    assert.throws(() => buildAuditEvent({ eventCode: 'X', outcome: 'SUCCESS', actorType: 'USER' }));
  });

  it('binds every audit column', async () => {
    const connection = recordingConnection({});
    await insertAuditEvent(
      connection,
      buildAuditEvent({ eventCode: 'AUTH_LOGOUT', outcome: 'SUCCESS', actorType: 'SYSTEM' }),
    );

    assert.equal(Object.keys(connection.calls[0].binds).length, 12);
  });
});
