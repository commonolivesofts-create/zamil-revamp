// Read-only Oracle TEST post-check for the Phase 03 RBAC integration run
// (`npm run db:rbac-post-check [-- --hours=N]`). SELECT statements only; prints PASS/FAIL with
// codes and counts. No employee data, hashes, secrets, tokens or audit details are printed.
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER } from '../src/modules/access-control/securityCatalog.js';
import { TEMP_ROLE_PREFIX } from './rbac-test-flow.js';

const hoursArg = process.argv.slice(2).find((arg) => /^--hours=\d{1,3}$/.test(arg));
const hours = hoursArg ? Number(hoursArg.split('=')[1]) : 3;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};
const info = (label, detail) => console.log(`INFO  ${label}  (${detail})`);

const { database } = config;
validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
await createPool(POOLS.LOW);

try {
  await withConnection(POOLS.LOW, async (connection) => {
    const q = async (sql, binds = {}) => (await connection.execute(sql, binds)).rows;
    const window = { hours };

    // Super Administrator account, memberships and grants are unchanged.
    const [zaid] = await q(
      `SELECT user_id, account_status, CASE WHEN mfa_enrolled_at IS NULL THEN 0 ELSE 1 END
         FROM xx_zrv_users WHERE employee_number = :emp`,
      { emp: SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER },
    );
    check(
      'Super Administrator account ACTIVE and MFA-enrolled',
      zaid?.[1] === 'ACTIVE' && zaid?.[2] === 1,
      `USER_ID ${zaid?.[0]}`,
    );
    const userId = String(zaid?.[0]);
    const memberships = await q(
      `SELECT r.role_code, ur.is_active FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = :userId ORDER BY r.role_code`,
      { userId },
    );
    check(
      'memberships: only SUPER_ADMINISTRATOR (active)',
      memberships.length === 1 &&
        memberships[0][0] === 'SUPER_ADMINISTRATOR' &&
        memberships[0][1] === 1,
      memberships.map((m) => `${m[0]}=${m[1]}`).join(', '),
    );
    const [[overrides]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_user_permission_overrides WHERE user_id = :userId`,
      { userId },
    );
    check('no overrides on the Super Administrator', overrides === 0, `${overrides}`);

    const adminRoles = await q(
      `SELECT r.role_code, r.is_active,
              (SELECT COUNT(*) FROM xx_zrv_role_permissions g WHERE g.role_id = r.role_id AND g.is_active = 1),
              (SELECT COUNT(*) FROM xx_zrv_role_permissions g WHERE g.role_id = r.role_id AND g.is_active = 0)
         FROM xx_zrv_roles r
        WHERE r.role_code IN ('SUPER_ADMINISTRATOR', 'MAIN_ADMINISTRATOR', 'ADMINISTRATOR')
        ORDER BY r.role_code`,
    );
    for (const [roleCode, active, activeGrants, inactiveGrants] of adminRoles) {
      const expected = roleCode === 'SUPER_ADMINISTRATOR' ? activeGrants === 23 : true;
      check(
        `${roleCode} active, grants intact`,
        active === 1 && inactiveGrants === 0 && expected,
        `active grants ${activeGrants}, inactive ${inactiveGrants}`,
      );
    }
    const [[securityInactive]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_permissions p JOIN xx_zrv_resources res ON res.resource_id = p.resource_id
         JOIN xx_zrv_app_modules m ON m.module_id = res.module_id
        WHERE m.module_code = 'SECURITY_ADMINISTRATION'
          AND (p.is_active = 0 OR res.is_active = 0 OR m.is_active = 0)`,
    );
    check(
      'security catalogue fully active',
      securityInactive === 0,
      `${securityInactive} inactive`,
    );

    // Temporary roles: inactive, no active grants, no members.
    const temp = await q(
      `SELECT r.role_id, r.is_active, r.created_by,
              (SELECT COUNT(*) FROM xx_zrv_role_permissions g WHERE g.role_id = r.role_id AND g.is_active = 1),
              (SELECT COUNT(*) FROM xx_zrv_role_permissions g WHERE g.role_id = r.role_id),
              (SELECT COUNT(*) FROM xx_zrv_user_roles ur WHERE ur.role_id = r.role_id)
         FROM xx_zrv_roles r WHERE r.role_code LIKE :prefix ESCAPE '\\' ORDER BY r.role_id`,
      { prefix: `${TEMP_ROLE_PREFIX.replaceAll('_', '\\_')}%` },
    );
    check('temporary role(s) found', temp.length > 0, `${temp.length}`);
    for (const [roleId, active, createdBy, activeGrants, grants, members] of temp) {
      check(
        `temp role ${roleId}: inactive, no active grants, no members, created by Super Administrator`,
        active === 0 && activeGrants === 0 && members === 0 && String(createdBy) === userId,
        `grant rows ${grants} (revoked), members ${members}`,
      );
      const events = await q(
        `SELECT event_code, event_outcome FROM xx_zrv_rbac_audit_logs
          WHERE target_type = 'ROLE' AND target_record_id = :roleId ORDER BY created_at, audit_log_id`,
        { roleId: String(roleId) },
      );
      const sequence = events.map((e) => e[0]).join(' > ');
      check(
        `temp role ${roleId}: audit trail`,
        sequence ===
          'RBAC_ROLE_CREATED > RBAC_ROLE_UPDATED > RBAC_PERMISSION_GRANTED > RBAC_PERMISSION_REVOKED > RBAC_ROLE_DEACTIVATED' &&
          events.every((e) => e[1] === 'SUCCESS'),
        sequence,
      );
    }

    // Audit rows in the window (codes, outcomes and reason codes only).
    const audit = await q(
      `SELECT event_code, event_outcome, NVL(reason_code, '-'), COUNT(*)
         FROM xx_zrv_rbac_audit_logs
        WHERE created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')
        GROUP BY event_code, event_outcome, reason_code ORDER BY event_code, reason_code`,
      window,
    );
    for (const [eventCode, outcome, reason, count] of audit)
      info(`audit ${eventCode}/${outcome}/${reason}`, `${count}`);
    const [[badActor]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_rbac_audit_logs
        WHERE created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')
          AND event_code LIKE 'RBAC\\_%' ESCAPE '\\' AND (actor_type <> 'USER' OR created_by <> :userId)`,
      { ...window, userId },
    );
    check(
      'RBAC_* rows in window all by the Super Administrator',
      badActor === 0,
      `${badActor} other`,
    );

    // Sessions from the run are closed.
    const [[open]] = await q(
      `SELECT COUNT(*) FROM xx_zrv_user_sessions
        WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > SYSTIMESTAMP
          AND created_at > SYSTIMESTAMP - NUMTODSINTERVAL(:hours, 'HOUR')`,
      { ...window, userId },
    );
    check('no open Super Administrator session from the run', open === 0, `${open} open`);
  });
} finally {
  await closeDatabase();
}

console.log(failures === 0 ? '\nAll post-checks passed.' : `\n${failures} post-check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
