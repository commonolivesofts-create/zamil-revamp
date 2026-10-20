import oracledb from 'oracledb';

const ID_AS_STRING = { type: oracledb.STRING };
const NOT_EXPIRED = (alias) =>
  `(${alias}.expires_at IS NULL OR ${alias}.expires_at > SYSTIMESTAMP)`;

/*
 * Effective-permission building blocks for permission row `p` and user `:userId` (approved
 * precedence, rbac-schema/README): an active, unexpired DENY override always denies; an active,
 * unexpired ALLOW override or a role grant (active, unexpired membership of an active role with an
 * active role grant) allows; nothing else allows (default deny). Module, resource and permission
 * must all be active.
 */
export const overrideExistsSql = (effect) => `EXISTS (
    SELECT 1 FROM xx_zrv_user_permission_overrides o
     WHERE o.user_id = :userId AND o.permission_id = p.permission_id
       AND o.is_active = 1 AND o.override_effect = '${effect === 'DENY' ? 'DENY' : 'ALLOW'}'
       AND ${NOT_EXPIRED('o')})`;

export const ROLE_GRANT_EXISTS_SQL = `EXISTS (
    SELECT 1 FROM xx_zrv_user_roles ur
      JOIN xx_zrv_roles r ON r.role_id = ur.role_id
      JOIN xx_zrv_role_permissions rp ON rp.role_id = r.role_id AND rp.permission_id = p.permission_id
     WHERE ur.user_id = :userId AND ur.is_active = 1 AND r.is_active = 1 AND rp.is_active = 1
       AND ${NOT_EXPIRED('ur')})`;

const CATALOG_JOIN = `
  FROM xx_zrv_permissions p
  JOIN xx_zrv_resources res ON res.resource_id = p.resource_id
  JOIN xx_zrv_app_modules m ON m.module_id = res.module_id`;

export const PERMISSION_DECISION_SQL = `
  SELECT p.permission_id,
         CASE WHEN p.is_active = 1 AND res.is_active = 1 AND m.is_active = 1 THEN 1 ELSE 0 END
           AS catalog_active,
         CASE WHEN ${overrideExistsSql('DENY')} THEN 1 ELSE 0 END AS denied,
         CASE WHEN ${overrideExistsSql('ALLOW')} THEN 1 ELSE 0 END AS allowed_by_override,
         CASE WHEN ${ROLE_GRANT_EXISTS_SQL} THEN 1 ELSE 0 END AS allowed_by_role
  ${CATALOG_JOIN}
   WHERE m.module_code = :moduleCode AND res.resource_code = :resourceCode
     AND p.action_code = :actionCode`;

/**
 * Facts needed to decide one permission for one user, evaluated in Oracle on every request (no
 * cache, so a revocation is effective on the next request). Null when the permission is unknown.
 */
export async function findPermissionDecision(
  connection,
  { userId, moduleCode, resourceCode, actionCode },
) {
  const result = await connection.execute(
    PERMISSION_DECISION_SQL,
    { userId, moduleCode, resourceCode, actionCode },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { PERMISSION_ID: ID_AS_STRING } },
  );
  const [row] = result.rows;
  if (!row) return null;
  return {
    permissionId: row.PERMISSION_ID,
    catalogActive: row.CATALOG_ACTIVE === 1,
    denied: row.DENIED === 1,
    allowedByOverride: row.ALLOWED_BY_OVERRIDE === 1,
    allowedByRole: row.ALLOWED_BY_ROLE === 1,
  };
}

const EFFECTIVE_PERMISSIONS_SQL = `
  SELECT m.module_code, res.resource_code, p.action_code, p.permission_id,
         CASE WHEN ${ROLE_GRANT_EXISTS_SQL} THEN 1 ELSE 0 END AS via_role,
         CASE WHEN ${overrideExistsSql('ALLOW')} THEN 1 ELSE 0 END AS via_override
  ${CATALOG_JOIN}
   WHERE p.is_active = 1 AND res.is_active = 1 AND m.is_active = 1
     AND NOT ${overrideExistsSql('DENY')}
     AND (${ROLE_GRANT_EXISTS_SQL} OR ${overrideExistsSql('ALLOW')})
   ORDER BY m.module_code, res.resource_code, p.action_code
   FETCH FIRST 1000 ROWS ONLY`;

/** Every permission the user effectively holds (bounded to 1,000). */
export async function listEffectivePermissions(connection, userId) {
  const result = await connection.execute(
    EFFECTIVE_PERMISSIONS_SQL,
    { userId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { PERMISSION_ID: ID_AS_STRING } },
  );
  return result.rows.map((row) => ({
    permissionId: row.PERMISSION_ID,
    moduleCode: row.MODULE_CODE,
    resourceCode: row.RESOURCE_CODE,
    actionCode: row.ACTION_CODE,
    viaRole: row.VIA_ROLE === 1,
    viaOverride: row.VIA_OVERRIDE === 1,
  }));
}
