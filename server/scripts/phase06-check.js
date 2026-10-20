// Read-only Oracle TEST checks for the Phase 06 live scenarios
// (`npm run db:phase06-check -- --scenario=rbac|change|reset --employee=<number> --stage=pre|post`).
// SELECT statements only; prints PASS/FAIL with statuses, counts and codes; no names, addresses,
// hashes, secrets or tokens.
import { pathToFileURL } from 'node:url';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER } from '../src/modules/access-control/securityCatalog.js';
import { listEffectivePermissions } from '../src/modules/access-control/authorization.repository.js';
import { findDatabaseName } from '../src/modules/notifications/databaseIdentity.repository.js';
import { testEnvironmentProblems } from './operator-session.js';
import { TEMP_PREFIX } from './rbac-user-test-flow.js';

export function parseArgs(argv) {
  const args = { hours: 3 };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'scenario' && ['rbac', 'change', 'reset'].includes(value)) args.scenario = value;
    else if (key === 'employee' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/.test(value ?? ''))
      args.employee = value;
    else if (key === 'stage' && ['pre', 'post'].includes(value)) args.stage = value;
    else if (key === 'hours' && /^\d{1,3}$/.test(value ?? '')) args.hours = Number(value);
    else throw new Error(`Unexpected argument ${arg}`);
  }
  if (!args.scenario || !args.employee || !args.stage) {
    throw new Error(
      'Usage: --scenario=rbac|change|reset --employee=<number> --stage=pre|post [--hours=N]',
    );
  }
  return args;
}

async function run({ scenario, employee, stage, hours }) {
  let failures = 0;
  const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  };
  await withConnection(POOLS.LOW, async (connection) => {
    const q = async (sql, binds = {}) => (await connection.execute(sql, binds)).rows;
    const one = async (sql, binds) => (await q(sql, binds))[0][0];
    const problems = testEnvironmentProblems(config, await findDatabaseName(connection));
    check(
      'TEST environment (non-production, configured TEST database)',
      problems.length === 0,
      problems.join('; '),
    );

    const [account] = await q(
      `SELECT user_id, account_status, CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END,
              failed_login_attempts,
              CASE WHEN mfa_enrolled_at IS NULL AND mfa_totp_secret_encrypted IS NULL THEN 0 ELSE 1 END
         FROM xx_zrv_users WHERE employee_number = :employee`,
      { employee },
    );
    if (!account) return check('account exists', false);
    const [userId, status, hasHash, failed, hasMfa] = account;
    const u = { userId: String(userId) };
    const w = { ...u, hours };
    check(
      `USER_ID ${userId} ACTIVE with password, no MFA`,
      status === 'ACTIVE' && hasHash === 1 && hasMfa === 0,
      status,
    );
    const openSessions = await one(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
      u,
    );
    check('no open sessions', openSessions === 0, `${openSessions}`);
    const activeRoles = await one(
      `SELECT COUNT(*) FROM xx_zrv_user_roles WHERE user_id = :userId AND is_active = 1`,
      u,
    );
    const activeOverrides = await one(
      `SELECT COUNT(*) FROM xx_zrv_user_permission_overrides WHERE user_id = :userId AND is_active = 1`,
      u,
    );
    check(
      'no active role memberships or overrides',
      activeRoles + activeOverrides === 0,
      `roles ${activeRoles}, overrides ${activeOverrides}`,
    );
    const effective = await listEffectivePermissions(connection, String(userId));
    check('no effective permissions', effective.length === 0, `${effective.length}`);
    const usableTokens = await one(
      `SELECT COUNT(*) FROM xx_zrv_account_action_tokens WHERE user_id = :userId
          AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
      u,
    );
    check('no usable action tokens', usableTokens === 0, `${usableTokens}`);

    const events = await q(
      `SELECT event_code, event_outcome, NVL(reason_code, '-'),
              CASE WHEN event_details LIKE '%TEST_OVERRIDE%' THEN 1 ELSE 0 END, COUNT(*)
         FROM xx_zrv_rbac_audit_logs
        WHERE subject_user_id = :userId AND created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')
        GROUP BY event_code, event_outcome, reason_code,
                 CASE WHEN event_details LIKE '%TEST_OVERRIDE%' THEN 1 ELSE 0 END
        ORDER BY event_code, reason_code`,
      w,
    );
    const has = (codeName, reason) =>
      events.some((e) => e[0] === codeName && (!reason || e[2] === reason));
    const prefix = `${TEMP_PREFIX.replaceAll('_', '\\_')}%`;
    const activeTemp = await one(
      `SELECT (SELECT COUNT(*) FROM xx_zrv_app_modules WHERE module_code LIKE :prefix ESCAPE '\\' AND is_active = 1)
            + (SELECT COUNT(*) FROM xx_zrv_roles WHERE role_code LIKE :prefix ESCAPE '\\' AND is_active = 1)
         FROM dual`,
      { prefix },
    );

    if (stage === 'pre') {
      check('no active temporary (ZRV_IT_*) modules or roles', activeTemp === 0, `${activeTemp}`);
    } else if (scenario === 'rbac') {
      check('all temporary modules and roles inactive', activeTemp === 0, `${activeTemp} active`);
      const [[resources, permissions, grants]] = await q(
        `SELECT (SELECT COUNT(*) FROM xx_zrv_resources r JOIN xx_zrv_app_modules m ON m.module_id = r.module_id
                  WHERE m.module_code LIKE :prefix ESCAPE '\\' AND r.is_active = 1),
                (SELECT COUNT(*) FROM xx_zrv_permissions p JOIN xx_zrv_resources r ON r.resource_id = p.resource_id
                   JOIN xx_zrv_app_modules m ON m.module_id = r.module_id
                  WHERE m.module_code LIKE :prefix ESCAPE '\\' AND p.is_active = 1),
                (SELECT COUNT(*) FROM xx_zrv_role_permissions g JOIN xx_zrv_roles r ON r.role_id = g.role_id
                  WHERE r.role_code LIKE :prefix ESCAPE '\\' AND g.is_active = 1)
           FROM dual`,
        { prefix },
      );
      check(
        'all temporary resources, permissions and grants inactive',
        resources + permissions + grants === 0,
        `${resources}/${permissions}/${grants}`,
      );
      for (const [codeName] of [
        ['RBAC_ROLE_ASSIGNED'],
        ['RBAC_ROLE_UNASSIGNED'],
        ['RBAC_OVERRIDE_SET'],
        ['RBAC_OVERRIDE_REVOKED'],
      ]) {
        check(`audit: ${codeName} for the employee`, has(codeName));
      }
    } else if (scenario === 'change') {
      check(
        'audit: PASSWORD_CHANGED / PASSWORD_CHANGE',
        has('PASSWORD_CHANGED', 'PASSWORD_CHANGE'),
      );
      check('audit: SESSION_REVOKED / PASSWORD_CHANGE', has('SESSION_REVOKED', 'PASSWORD_CHANGE'));
      check('failed attempts reset by the final sign-in', failed === 0, `${failed}`);
    } else {
      const latest = await q(
        `SELECT CASE WHEN consumed_at IS NOT NULL THEN 'CONSUMED' WHEN revoked_at IS NOT NULL THEN 'REVOKED'
                     WHEN expires_at <= SYSTIMESTAMP THEN 'EXPIRED' ELSE 'USABLE' END
           FROM xx_zrv_account_action_tokens WHERE user_id = :userId AND action_type = 'PASSWORD_RESET'
          ORDER BY created_at DESC FETCH FIRST 1 ROWS ONLY`,
        u,
      );
      check(
        'latest PASSWORD_RESET token consumed',
        latest[0]?.[0] === 'CONSUMED',
        latest[0]?.[0] ?? 'none',
      );
      check(
        'audit: ACTION_TOKEN_ISSUED / PASSWORD_RESET to TEST_OVERRIDE',
        events.some(
          (e) =>
            e[0] === 'ACTION_TOKEN_ISSUED' &&
            e[1] === 'SUCCESS' &&
            e[2] === 'PASSWORD_RESET' &&
            e[3] === 1,
        ),
      );
      check('audit: PASSWORD_CHANGED / PASSWORD_RESET', has('PASSWORD_CHANGED', 'PASSWORD_RESET'));
      check(
        'audit: token replay refused (TOKEN_NOT_USABLE)',
        has('ACCESS_DENIED', 'TOKEN_NOT_USABLE'),
      );
    }
    if (stage === 'post') {
      console.log(
        `INFO  audit (${hours} h): ${events.map((e) => `${e[0]}/${e[1]}/${e[2]}x${e[4]}`).join(', ') || 'none'}`,
      );
    }

    // The Super Administrator is unchanged.
    const [zaid] = await q(
      `SELECT user_id, account_status, CASE WHEN mfa_enrolled_at IS NULL THEN 0 ELSE 1 END
         FROM xx_zrv_users WHERE employee_number = :emp`,
      { emp: SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER },
    );
    const z = { zaidId: String(zaid?.[0]) };
    check('Super Administrator ACTIVE and MFA-enrolled', zaid?.[1] === 'ACTIVE' && zaid?.[2] === 1);
    const memberships = await q(
      `SELECT r.role_code, ur.is_active FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = :zaidId`,
      z,
    );
    check(
      'Super Administrator: only SUPER_ADMINISTRATOR (active)',
      memberships.length === 1 &&
        memberships[0][0] === 'SUPER_ADMINISTRATOR' &&
        memberships[0][1] === 1,
    );
    const grants = await one(
      `SELECT COUNT(*) FROM xx_zrv_role_permissions g JOIN xx_zrv_roles r ON r.role_id = g.role_id
        WHERE r.role_code = 'SUPER_ADMINISTRATOR' AND g.is_active = 1`,
    );
    check('SUPER_ADMINISTRATOR active grants = 23', grants === 23, `${grants}`);
    const zaidTokens = await one(
      `SELECT COUNT(*) FROM xx_zrv_account_action_tokens WHERE user_id = :zaidId`,
      z,
    );
    check('no recovery tokens for the Super Administrator', zaidTokens === 0, `${zaidTokens}`);
    const zaidOpen = await one(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions WHERE user_id = :zaidId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP`,
      z,
    );
    check('no open Super Administrator session', zaidOpen === 0, `${zaidOpen}`);
    return undefined;
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
