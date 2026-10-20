// Read-only Oracle TEST checks around the controlled Phase 04 user-administration run
// (`npm run db:users-check -- --employee=<number> --stage=preflight|post [--hours=N]`).
// SELECT statements only. Prints PASS/FAIL with statuses, counts and reason codes; no names,
// e-mail addresses, hashes, secrets or tokens.
import { pathToFileURL } from 'node:url';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER } from '../src/modules/access-control/securityCatalog.js';
import { evaluateProvisioning } from '../src/modules/users/users.service.js';
import * as usersRepository from '../src/modules/users/users.repository.js';

export function parseArgs(argv) {
  const args = { hours: 3 };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'employee' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(value ?? '')) {
      args.employee = value;
    } else if (key === 'stage' && ['preflight', 'post'].includes(value)) args.stage = value;
    else if (key === 'hours' && /^\d{1,3}$/.test(value ?? '')) args.hours = Number(value);
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!args.employee || !args.stage) {
    throw new Error('Usage: --employee=<number> --stage=preflight|post [--hours=N]');
  }
  return args;
}

async function run({ employee, stage, hours }) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  };

  await withConnection(POOLS.LOW, async (connection) => {
    const q = async (sql, binds = {}) => (await connection.execute(sql, binds)).rows;

    // Employee eligibility (same SQL and rules as provisioning).
    const candidates = await usersRepository.findEmployeeCandidate(connection, employee);
    const evaluation = evaluateProvisioning(candidates);
    check(
      `employee ${employee}: eligible for an account`,
      evaluation.eligible,
      evaluation.eligible
        ? `rows=${candidates.length}, current=${candidates[0].employee.currentEmployeeFlag}, termination=${candidates[0].employee.terminationStatus}, usernameUnique=${candidates[0].usernameCount === 1}`
        : evaluation.reason,
    );

    const accounts = await q(
      `SELECT u.user_id, u.account_status,
              CASE WHEN u.password_hash IS NULL THEN 0 ELSE 1 END,
              CASE WHEN u.password_changed_at IS NULL THEN 0 ELSE 1 END,
              CASE WHEN u.mfa_enrolled_at IS NULL AND u.mfa_totp_secret_encrypted IS NULL THEN 0 ELSE 1 END,
              u.failed_login_attempts, u.created_by
         FROM xx_zrv_users u WHERE u.employee_number = :employee`,
      { employee },
    );
    const [zaid] = await q(
      `SELECT user_id, account_status, CASE WHEN mfa_enrolled_at IS NULL THEN 0 ELSE 1 END
         FROM xx_zrv_users WHERE employee_number = :emp`,
      { emp: SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER },
    );
    const zaidId = String(zaid?.[0]);

    if (stage === 'preflight') {
      check(
        `employee ${employee}: no application account yet`,
        accounts.length === 0,
        accounts.length ? `existing USER_ID ${accounts[0][0]} status ${accounts[0][1]}` : 'absent',
      );
    } else {
      const [account] = accounts;
      check(
        `employee ${employee}: exactly one account`,
        accounts.length === 1,
        `${accounts.length}`,
      );
      if (account) {
        const [userId, status, hasHash, hasChange, hasMfa, failed, createdBy] = account;
        check(
          'account PENDING without password, MFA or failed attempts',
          status === 'PENDING' && hasHash === 0 && hasChange === 0 && hasMfa === 0 && failed === 0,
          `USER_ID ${userId}, status ${status}`,
        );
        check('account created by the Super Administrator', String(createdBy) === zaidId);
        const binds = { userId: String(userId) };
        const [[roles]] = await q(
          `SELECT COUNT(*) FROM xx_zrv_user_roles WHERE user_id = :userId`,
          binds,
        );
        const [[overrides]] = await q(
          `SELECT COUNT(*) FROM xx_zrv_user_permission_overrides WHERE user_id = :userId`,
          binds,
        );
        const [[sessions]] = await q(
          `SELECT COUNT(*) FROM xx_zrv_user_sessions WHERE user_id = :userId`,
          binds,
        );
        const [[tokens]] = await q(
          `SELECT COUNT(*) FROM xx_zrv_account_action_tokens WHERE user_id = :userId`,
          binds,
        );
        check(
          'no roles, overrides, sessions or action tokens',
          roles + overrides + sessions + tokens === 0,
          `roles ${roles}, overrides ${overrides}, sessions ${sessions}, tokens ${tokens}`,
        );
        const events = await q(
          `SELECT event_code, event_outcome, NVL(reason_code, '-'), created_by, COUNT(*)
             FROM xx_zrv_rbac_audit_logs WHERE subject_user_id = :userId
            GROUP BY event_code, event_outcome, reason_code, created_by
            ORDER BY event_code, reason_code`,
          binds,
        );
        const provisioned = events.filter((e) => e[0] === 'ACCOUNT_PROVISIONED');
        check(
          'audit: one ACCOUNT_PROVISIONED SUCCESS by the Super Administrator',
          provisioned.length === 1 &&
            provisioned[0][1] === 'SUCCESS' &&
            String(provisioned[0][3]) === zaidId &&
            provisioned[0][4] === 1,
        );
        check(
          'audit: no activation, disable or session revocation of the account',
          !events.some((e) =>
            ['ACCOUNT_ACTIVATED', 'ACCOUNT_DISABLED', 'SESSION_REVOKED'].includes(e[0]),
          ),
          events.map((e) => `${e[0]}/${e[1]}/${e[2]}x${e[4]}`).join(', '),
        );
      }
      const denied = await q(
        `SELECT NVL(reason_code, '-'), COUNT(*) FROM xx_zrv_rbac_audit_logs
          WHERE event_code = 'ACCESS_DENIED' AND created_by = :zaidId
            AND created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')
          GROUP BY reason_code ORDER BY reason_code`,
        { zaidId, hours },
      );
      console.log(
        `INFO  ACCESS_DENIED by the Super Administrator in the last ${hours} h  (${denied.map((d) => `${d[0]}x${d[1]}`).join(', ') || 'none'})`,
      );
    }

    // The Super Administrator account and grants are unchanged (both stages).
    check(
      'Super Administrator ACTIVE and MFA-enrolled',
      zaid?.[1] === 'ACTIVE' && zaid?.[2] === 1,
      `USER_ID ${zaidId}`,
    );
    const memberships = await q(
      `SELECT r.role_code, ur.is_active FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = :zaidId`,
      { zaidId },
    );
    check(
      'Super Administrator memberships: only SUPER_ADMINISTRATOR (active)',
      memberships.length === 1 &&
        memberships[0][0] === 'SUPER_ADMINISTRATOR' &&
        memberships[0][1] === 1,
    );
    const [[grants]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_role_permissions g JOIN xx_zrv_roles r ON r.role_id = g.role_id
        WHERE r.role_code = 'SUPER_ADMINISTRATOR' AND g.is_active = 1 AND r.is_active = 1`,
    );
    check('SUPER_ADMINISTRATOR active grants = 23', grants === 23, `${grants}`);
    const [[zaidOverrides]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_user_permission_overrides WHERE user_id = :zaidId`,
      { zaidId },
    );
    check('no overrides on the Super Administrator', zaidOverrides === 0);
    const [[open]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions
        WHERE user_id = :zaidId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
      { zaidId },
    );
    check('no open Super Administrator session', open === 0, `${open} open`);
  });
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2));
  const { database } = config;
  validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
  await createPool(POOLS.LOW);
  let failures;
  try {
    failures = await run(args);
  } finally {
    await closeDatabase();
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}
