// Read-only Oracle TEST checks around the controlled first-password setup run
// (`npm run db:setup-check -- --employee=<number> --stage=pre|post`). SELECT statements only;
// prints PASS/FAIL with statuses, counts and codes. No names, addresses, hashes, secrets or tokens.
import { pathToFileURL } from 'node:url';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER } from '../src/modules/access-control/securityCatalog.js';
import { findDatabaseName } from '../src/modules/notifications/databaseIdentity.repository.js';
import { evaluateProvisioning } from '../src/modules/users/users.service.js';
import * as usersRepository from '../src/modules/users/users.repository.js';
import { preflightProblems } from './setup-test-flow.js';

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'employee' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(value ?? ''))
      args.employee = value;
    else if (key === 'stage' && ['pre', 'post'].includes(value)) args.stage = value;
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!args.employee || !args.stage) throw new Error('Usage: --employee=<number> --stage=pre|post');
  return args;
}

async function run({ employee, stage }) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  };
  await withConnection(POOLS.LOW, async (connection) => {
    const q = async (sql, binds = {}) => (await connection.execute(sql, binds)).rows;
    const [zaid] = await q(
      `SELECT user_id, account_status, CASE WHEN mfa_enrolled_at IS NULL THEN 0 ELSE 1 END
         FROM xx_zrv_users WHERE employee_number = :emp`,
      { emp: SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER },
    );
    const zaidId = String(zaid?.[0]);

    const problems = preflightProblems(config, await findDatabaseName(connection));
    check(
      'safety preflight (TEST database, approved test mailbox only, privileged delivery off)',
      problems.length === 0,
      problems.join('; '),
    );

    const candidates = await usersRepository.findEmployeeCandidate(connection, employee);
    const evaluation = evaluateProvisioning(candidates);
    check(`employee ${employee}: eligible`, evaluation.eligible, evaluation.reason ?? '');
    check(
      `employee ${employee}: employee-master e-mail present`,
      Boolean(candidates[0]?.employee.email?.trim()),
    );

    const [account] = await q(
      `SELECT user_id, account_status,
              CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END,
              CASE WHEN password_changed_at IS NULL THEN 0 ELSE 1 END,
              CASE WHEN mfa_enrolled_at IS NULL AND mfa_totp_secret_encrypted IS NULL THEN 0 ELSE 1 END,
              failed_login_attempts
         FROM xx_zrv_users WHERE employee_number = :employee`,
      { employee },
    );
    if (!account) {
      check('account exists', false);
      return;
    }
    const [userId, status, hasHash, hasChange, hasMfa, failed] = account;
    const binds = { userId: String(userId) };
    const count = async (sql) => (await q(sql, binds))[0][0];
    const roles = await count(`SELECT COUNT(*) FROM xx_zrv_user_roles WHERE user_id = :userId`);
    const overrides = await count(
      `SELECT COUNT(*) FROM xx_zrv_user_permission_overrides WHERE user_id = :userId`,
    );
    const openSessions = await count(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions
        WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
    );
    const tokens = await q(
      `SELECT action_type,
              CASE WHEN consumed_at IS NOT NULL THEN 'CONSUMED'
                   WHEN revoked_at IS NOT NULL THEN 'REVOKED'
                   WHEN expires_at <= SYSTIMESTAMP THEN 'EXPIRED' ELSE 'USABLE' END,
              CASE WHEN expires_at - created_at BETWEEN NUMTODSINTERVAL(86399, 'SECOND')
                                                AND NUMTODSINTERVAL(86401, 'SECOND') THEN 1 ELSE 0 END
         FROM xx_zrv_account_action_tokens WHERE user_id = :userId ORDER BY created_at`,
      binds,
    );
    const events = await q(
      `SELECT event_code, event_outcome, NVL(reason_code, '-'), actor_type, created_by,
              CASE WHEN event_details LIKE '%TEST_OVERRIDE%' THEN 1 ELSE 0 END
         FROM xx_zrv_rbac_audit_logs WHERE subject_user_id = :userId ORDER BY created_at, audit_log_id`,
      binds,
    );
    const summary = (code) => events.filter((e) => e[0] === code);
    check(
      'no roles or overrides',
      roles + overrides === 0,
      `roles ${roles}, overrides ${overrides}`,
    );
    check('MFA not enrolled', hasMfa === 0);

    if (stage === 'pre') {
      check(
        `USER_ID ${userId} PENDING without password`,
        status === 'PENDING' && hasHash === 0 && hasChange === 0,
        status,
      );
      check('no action tokens yet', tokens.length === 0, `${tokens.length}`);
      check('no open sessions', openSessions === 0, `${openSessions}`);
    } else {
      check(
        `USER_ID ${userId} ACTIVE with password and change time`,
        status === 'ACTIVE' && hasHash === 1 && hasChange === 1,
        status,
      );
      check('failed login attempts 0', failed === 0, `${failed}`);
      check(
        'exactly one PASSWORD_SETUP token (24 h), consumed; none usable',
        tokens.length === 1 &&
          tokens[0][0] === 'PASSWORD_SETUP' &&
          tokens[0][1] === 'CONSUMED' &&
          tokens[0][2] === 1,
        tokens.map((t) => `${t[0]}:${t[1]}`).join(', '),
      );
      const issued = summary('ACTION_TOKEN_ISSUED');
      check(
        'audit: ACTION_TOKEN_ISSUED SUCCESS / PASSWORD_SETUP, recipient TEST_OVERRIDE, by the Super Administrator',
        issued.length === 1 &&
          issued[0][1] === 'SUCCESS' &&
          issued[0][2] === 'PASSWORD_SETUP' &&
          issued[0][5] === 1 &&
          String(issued[0][4]) === zaidId,
        issued.map((e) => `${e[1]}/${e[2]}`).join(', '),
      );
      const changed = summary('PASSWORD_CHANGED');
      const activated = summary('ACCOUNT_ACTIVATED');
      check(
        'audit: PASSWORD_CHANGED and ACCOUNT_ACTIVATED (PASSWORD_SETUP) by the user',
        changed.length === 1 &&
          changed[0][2] === 'PASSWORD_SETUP' &&
          String(changed[0][4]) === String(userId) &&
          activated.length === 1 &&
          activated[0][2] === 'PASSWORD_SETUP',
      );
      check(
        'audit: token replay refused (ACCESS_DENIED TOKEN_NOT_USABLE)',
        summary('ACCESS_DENIED').some((e) => e[2] === 'TOKEN_NOT_USABLE'),
      );
      check(
        'audit: ordinary-user LOGIN_SUCCESS and LOGOUT',
        summary('LOGIN_SUCCESS').length >= 1 && summary('LOGOUT').length >= 1,
      );
      check(
        'audit: denied administration calls (ACCESS_DENIED NO_GRANT)',
        summary('ACCESS_DENIED').filter((e) => e[2] === 'NO_GRANT').length >= 3,
      );
      check('no open sessions after logout', openSessions === 0, `${openSessions}`);
      console.log(`INFO  audit trail: ${events.map((e) => `${e[0]}/${e[1]}/${e[2]}`).join(' > ')}`);
    }

    // The Super Administrator: account, membership, grants, overrides and MFA unchanged.
    check('Super Administrator ACTIVE and MFA-enrolled', zaid?.[1] === 'ACTIVE' && zaid?.[2] === 1);
    const memberships = await q(
      `SELECT r.role_code, ur.is_active FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = :zaidId`,
      { zaidId },
    );
    check(
      'Super Administrator: only SUPER_ADMINISTRATOR (active)',
      memberships.length === 1 &&
        memberships[0][0] === 'SUPER_ADMINISTRATOR' &&
        memberships[0][1] === 1,
    );
    const [[grants]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_role_permissions g JOIN xx_zrv_roles r ON r.role_id = g.role_id
        WHERE r.role_code = 'SUPER_ADMINISTRATOR' AND g.is_active = 1`,
    );
    check('SUPER_ADMINISTRATOR active grants = 23', grants === 23, `${grants}`);
    const [[zaidTokens]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_account_action_tokens WHERE user_id = :zaidId`,
      { zaidId },
    );
    check('no recovery tokens for the Super Administrator', zaidTokens === 0, `${zaidTokens}`);
    const [[zaidOpen]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions
        WHERE user_id = :zaidId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
      { zaidId },
    );
    check('no open Super Administrator session', zaidOpen === 0, `${zaidOpen}`);
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
