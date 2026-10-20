import oracledb from 'oracledb';

// SQL for RBAC administration on the locked tables. Values are always bound; table and column names
// come only from the fixed maps below. IDs (NUMBER(19,0)) are read and bound as strings.
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";
const ID = { type: oracledb.STRING };
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const idOut = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });
const timestampBind = (value) => ({ val: value ?? null, type: oracledb.DB_TYPE_TIMESTAMP_TZ });

const rows = async (connection, sql, binds, fetchInfo) =>
  (await connection.execute(sql, binds, { ...OBJECT, fetchInfo })).rows;

// --- Users ---------------------------------------------------------------------------------

export async function findUser(connection, userId) {
  const [row] = await rows(
    connection,
    `SELECT user_id, employee_number, account_status FROM xx_zrv_users WHERE user_id = :userId`,
    { userId },
    { USER_ID: ID },
  );
  return row
    ? {
        userId: row.USER_ID,
        employeeNumber: row.EMPLOYEE_NUMBER,
        accountStatus: row.ACCOUNT_STATUS,
      }
    : null;
}

/** Codes of the user's currently effective roles (active, unexpired membership of an active role). */
export async function listActiveRoleCodes(connection, userId) {
  const result = await rows(
    connection,
    `SELECT r.role_code FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = :userId AND ur.is_active = 1 AND r.is_active = 1
        AND (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP)`,
    { userId },
  );
  return result.map((row) => row.ROLE_CODE);
}

// --- Roles ---------------------------------------------------------------------------------

const ROLE_COLUMNS = `role_id, role_code, role_name, description, is_active, created_at, updated_at`;
const mapRole = (row) => ({
  roleId: row.ROLE_ID,
  roleCode: row.ROLE_CODE,
  roleName: row.ROLE_NAME,
  description: row.DESCRIPTION,
  isActive: row.IS_ACTIVE === 1,
  createdAt: row.CREATED_AT,
  updatedAt: row.UPDATED_AT,
});

export async function listRoles(connection, { limit, offset }) {
  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS total FROM xx_zrv_roles`,
    {},
  );
  const result = await rows(
    connection,
    `SELECT ${ROLE_COLUMNS} FROM xx_zrv_roles ORDER BY role_code
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { offset, limit },
    { ROLE_ID: ID },
  );
  return { total, items: result.map(mapRole) };
}

export async function findRole(connection, roleId) {
  const [row] = await rows(
    connection,
    `SELECT ${ROLE_COLUMNS} FROM xx_zrv_roles WHERE role_id = :roleId`,
    { roleId },
    { ROLE_ID: ID },
  );
  return row ? mapRole(row) : null;
}

export async function insertRole(connection, { roleCode, roleName, description, actorUserId }) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_roles (role_code, role_name, description, is_active, created_by)
     VALUES (:roleCode, :roleName, :description, 1, :actorUserId)
     RETURNING role_id INTO :id`,
    { roleCode, roleName, description, actorUserId, id: idOut() },
  );
  return result.outBinds.id[0];
}

export async function updateRole(connection, { roleId, roleName, description, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_roles
        SET role_name = :roleName, description = :description,
            updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE role_id = :roleId`,
    { roleId, roleName, description, actorUserId },
  );
  return result.rowsAffected === 1;
}

// --- Permission catalogue ----------------------------------------------------------------------

export async function listCatalog(connection) {
  const result = await rows(
    connection,
    `SELECT m.module_id, m.module_code, m.module_name, m.display_order, m.is_active AS module_active,
            res.resource_id, res.resource_code, res.resource_name, res.is_active AS resource_active,
            p.permission_id, p.action_code, p.description AS permission_description,
            p.is_active AS permission_active
       FROM xx_zrv_app_modules m
       LEFT JOIN xx_zrv_resources res ON res.module_id = m.module_id
       LEFT JOIN xx_zrv_permissions p ON p.resource_id = res.resource_id
      ORDER BY m.display_order, m.module_code, res.resource_code, p.action_code
      FETCH FIRST 2000 ROWS ONLY`,
    {},
    { MODULE_ID: ID, RESOURCE_ID: ID, PERMISSION_ID: ID },
  );

  const modules = new Map();
  for (const row of result) {
    if (!modules.has(row.MODULE_ID)) {
      modules.set(row.MODULE_ID, {
        moduleId: row.MODULE_ID,
        moduleCode: row.MODULE_CODE,
        moduleName: row.MODULE_NAME,
        displayOrder: row.DISPLAY_ORDER,
        isActive: row.MODULE_ACTIVE === 1,
        resources: new Map(),
      });
    }
    const module = modules.get(row.MODULE_ID);
    if (row.RESOURCE_ID === null) continue;
    if (!module.resources.has(row.RESOURCE_ID)) {
      module.resources.set(row.RESOURCE_ID, {
        resourceId: row.RESOURCE_ID,
        resourceCode: row.RESOURCE_CODE,
        resourceName: row.RESOURCE_NAME,
        isActive: row.RESOURCE_ACTIVE === 1,
        permissions: [],
      });
    }
    if (row.PERMISSION_ID === null) continue;
    module.resources.get(row.RESOURCE_ID).permissions.push({
      permissionId: row.PERMISSION_ID,
      actionCode: row.ACTION_CODE,
      description: row.PERMISSION_DESCRIPTION,
      isActive: row.PERMISSION_ACTIVE === 1,
    });
  }
  return [...modules.values()].map((module) => ({
    ...module,
    resources: [...module.resources.values()],
  }));
}

export async function findModule(connection, moduleId) {
  const [row] = await rows(
    connection,
    `SELECT module_id, module_code, is_active FROM xx_zrv_app_modules WHERE module_id = :moduleId`,
    { moduleId },
    { MODULE_ID: ID },
  );
  return row
    ? { moduleId: row.MODULE_ID, moduleCode: row.MODULE_CODE, isActive: row.IS_ACTIVE === 1 }
    : null;
}

export async function findResource(connection, resourceId) {
  const [row] = await rows(
    connection,
    `SELECT res.resource_id, res.resource_code, res.is_active, m.module_code
       FROM xx_zrv_resources res JOIN xx_zrv_app_modules m ON m.module_id = res.module_id
      WHERE res.resource_id = :resourceId`,
    { resourceId },
    { RESOURCE_ID: ID },
  );
  return row
    ? {
        resourceId: row.RESOURCE_ID,
        resourceCode: row.RESOURCE_CODE,
        moduleCode: row.MODULE_CODE,
        isActive: row.IS_ACTIVE === 1,
      }
    : null;
}

/** A permission with its module/resource codes and whether the whole chain is active. */
export async function findPermission(connection, permissionId) {
  const [row] = await rows(
    connection,
    `SELECT p.permission_id, p.action_code, p.is_active, res.resource_code, m.module_code,
            CASE WHEN p.is_active = 1 AND res.is_active = 1 AND m.is_active = 1 THEN 1 ELSE 0 END
              AS chain_active
       FROM xx_zrv_permissions p
       JOIN xx_zrv_resources res ON res.resource_id = p.resource_id
       JOIN xx_zrv_app_modules m ON m.module_id = res.module_id
      WHERE p.permission_id = :permissionId`,
    { permissionId },
    { PERMISSION_ID: ID },
  );
  return row
    ? {
        permissionId: row.PERMISSION_ID,
        moduleCode: row.MODULE_CODE,
        resourceCode: row.RESOURCE_CODE,
        actionCode: row.ACTION_CODE,
        isActive: row.IS_ACTIVE === 1,
        chainActive: row.CHAIN_ACTIVE === 1,
      }
    : null;
}

export async function insertModule(
  connection,
  { moduleCode, moduleName, description, displayOrder, actorUserId },
) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_app_modules (module_code, module_name, description, display_order, is_active, created_by)
     VALUES (:moduleCode, :moduleName, :description, :displayOrder, 1, :actorUserId)
     RETURNING module_id INTO :id`,
    { moduleCode, moduleName, description, displayOrder, actorUserId, id: idOut() },
  );
  return result.outBinds.id[0];
}

export async function insertResource(
  connection,
  { moduleId, resourceCode, resourceName, description, actorUserId },
) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_resources (module_id, resource_code, resource_name, description, is_active, created_by)
     VALUES (:moduleId, :resourceCode, :resourceName, :description, 1, :actorUserId)
     RETURNING resource_id INTO :id`,
    { moduleId, resourceCode, resourceName, description, actorUserId, id: idOut() },
  );
  return result.outBinds.id[0];
}

export async function insertPermission(
  connection,
  { resourceId, actionCode, description, actorUserId },
) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_permissions (resource_id, action_code, description, is_active, created_by)
     VALUES (:resourceId, :actionCode, :description, 1, :actorUserId)
     RETURNING permission_id INTO :id`,
    { resourceId, actionCode, description, actorUserId, id: idOut() },
  );
  return result.outBinds.id[0];
}

// Allowlisted identifiers for activation changes; never derived from request input.
const ACTIVATABLE = Object.freeze({
  ROLE: { table: 'xx_zrv_roles', key: 'role_id' },
  MODULE: { table: 'xx_zrv_app_modules', key: 'module_id' },
  RESOURCE: { table: 'xx_zrv_resources', key: 'resource_id' },
  PERMISSION: { table: 'xx_zrv_permissions', key: 'permission_id' },
});

/** Sets IS_ACTIVE; returns false when the row already had that state (or does not exist). */
export async function setActive(connection, { entity, id, isActive, actorUserId }) {
  const target = ACTIVATABLE[entity];
  if (!target) throw new Error(`Unsupported entity ${entity}`);
  const result = await connection.execute(
    `UPDATE ${target.table}
        SET is_active = :isActive, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE ${target.key} = :id AND is_active <> :isActive`,
    { id, isActive: isActive ? 1 : 0, actorUserId },
  );
  return result.rowsAffected === 1;
}

// --- Role permissions --------------------------------------------------------------------------

const PERMISSION_KEY_COLUMNS = `p.permission_id, m.module_code, res.resource_code, p.action_code`;
const PERMISSION_KEY_JOIN = `
  JOIN xx_zrv_permissions p ON p.permission_id = g.permission_id
  JOIN xx_zrv_resources res ON res.resource_id = p.resource_id
  JOIN xx_zrv_app_modules m ON m.module_id = res.module_id`;
const mapPermissionKey = (row) => ({
  permissionId: row.PERMISSION_ID,
  moduleCode: row.MODULE_CODE,
  resourceCode: row.RESOURCE_CODE,
  actionCode: row.ACTION_CODE,
});

export async function listRolePermissions(connection, roleId) {
  const result = await rows(
    connection,
    `SELECT ${PERMISSION_KEY_COLUMNS}, g.is_active, g.created_at, g.updated_at
       FROM xx_zrv_role_permissions g ${PERMISSION_KEY_JOIN}
      WHERE g.role_id = :roleId
      ORDER BY m.module_code, res.resource_code, p.action_code FETCH FIRST 1000 ROWS ONLY`,
    { roleId },
    { PERMISSION_ID: ID },
  );
  return result.map((row) => ({
    ...mapPermissionKey(row),
    isActive: row.IS_ACTIVE === 1,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  }));
}

/** Active grants of a role (for the no-escalation check when assigning the role). */
export async function listActiveRoleGrantKeys(connection, roleId) {
  const result = await rows(
    connection,
    `SELECT ${PERMISSION_KEY_COLUMNS} FROM xx_zrv_role_permissions g ${PERMISSION_KEY_JOIN}
      WHERE g.role_id = :roleId AND g.is_active = 1 FETCH FIRST 1000 ROWS ONLY`,
    { roleId },
    { PERMISSION_ID: ID },
  );
  return result.map(mapPermissionKey);
}

/** Grants (or re-activates) a role permission; false when it was already active. */
export async function grantRolePermission(connection, { roleId, permissionId, actorUserId }) {
  const result = await connection.execute(
    `MERGE INTO xx_zrv_role_permissions t
     USING (SELECT TO_NUMBER(:roleId) AS role_id, TO_NUMBER(:permissionId) AS permission_id FROM dual) s
        ON (t.role_id = s.role_id AND t.permission_id = s.permission_id)
      WHEN MATCHED THEN UPDATE
           SET t.is_active = 1, t.updated_at = ${UTC_NOW}, t.updated_by = :actorUserId
         WHERE t.is_active = 0
      WHEN NOT MATCHED THEN
           INSERT (role_id, permission_id, is_active, created_by)
           VALUES (s.role_id, s.permission_id, 1, :actorUserId)`,
    { roleId, permissionId, actorUserId },
  );
  return result.rowsAffected === 1;
}

export async function revokeRolePermission(connection, { roleId, permissionId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_role_permissions
        SET is_active = 0, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE role_id = :roleId AND permission_id = :permissionId AND is_active = 1`,
    { roleId, permissionId, actorUserId },
  );
  return result.rowsAffected === 1;
}

// --- User roles --------------------------------------------------------------------------------

export async function listUserRoles(connection, userId) {
  const result = await rows(
    connection,
    `SELECT r.role_id, r.role_code, r.role_name, r.is_active AS role_active,
            ur.is_active, ur.expires_at, ur.created_at, ur.updated_at,
            CASE WHEN ur.is_active = 1 AND r.is_active = 1
                      AND (ur.expires_at IS NULL OR ur.expires_at > SYSTIMESTAMP) THEN 1 ELSE 0 END
              AS effective
       FROM xx_zrv_user_roles ur JOIN xx_zrv_roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = :userId ORDER BY r.role_code FETCH FIRST 500 ROWS ONLY`,
    { userId },
    { ROLE_ID: ID },
  );
  return result.map((row) => ({
    roleId: row.ROLE_ID,
    roleCode: row.ROLE_CODE,
    roleName: row.ROLE_NAME,
    roleActive: row.ROLE_ACTIVE === 1,
    isActive: row.IS_ACTIVE === 1,
    expiresAt: row.EXPIRES_AT,
    effective: row.EFFECTIVE === 1,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  }));
}

/** Assigns (or re-activates, setting the expiry) a role membership. */
export async function assignUserRole(connection, { userId, roleId, expiresAt, actorUserId }) {
  const result = await connection.execute(
    `MERGE INTO xx_zrv_user_roles t
     USING (SELECT TO_NUMBER(:userId) AS user_id, TO_NUMBER(:roleId) AS role_id FROM dual) s
        ON (t.user_id = s.user_id AND t.role_id = s.role_id)
      WHEN MATCHED THEN UPDATE
           SET t.is_active = 1, t.expires_at = :expiresAt,
               t.updated_at = ${UTC_NOW}, t.updated_by = :actorUserId
      WHEN NOT MATCHED THEN
           INSERT (user_id, role_id, is_active, expires_at, created_by)
           VALUES (s.user_id, s.role_id, 1, :expiresAt, :actorUserId)`,
    { userId, roleId, expiresAt: timestampBind(expiresAt), actorUserId },
  );
  return result.rowsAffected === 1;
}

export async function unassignUserRole(connection, { userId, roleId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_user_roles
        SET is_active = 0, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND role_id = :roleId AND is_active = 1`,
    { userId, roleId, actorUserId },
  );
  return result.rowsAffected === 1;
}

// --- User permission overrides -------------------------------------------------------------------

export async function listUserOverrides(connection, userId) {
  const result = await rows(
    connection,
    `SELECT ${PERMISSION_KEY_COLUMNS}, g.override_effect, g.justification, g.is_active,
            g.expires_at, g.created_at, g.updated_at
       FROM xx_zrv_user_permission_overrides g ${PERMISSION_KEY_JOIN}
      WHERE g.user_id = :userId
      ORDER BY m.module_code, res.resource_code, p.action_code FETCH FIRST 500 ROWS ONLY`,
    { userId },
    { PERMISSION_ID: ID },
  );
  return result.map((row) => ({
    ...mapPermissionKey(row),
    effect: row.OVERRIDE_EFFECT,
    justification: row.JUSTIFICATION,
    isActive: row.IS_ACTIVE === 1,
    expiresAt: row.EXPIRES_AT,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  }));
}

/** Sets (creates or replaces) the single override of a user for a permission. */
export async function setOverride(
  connection,
  { userId, permissionId, effect, justification, expiresAt, actorUserId },
) {
  const result = await connection.execute(
    `MERGE INTO xx_zrv_user_permission_overrides t
     USING (SELECT TO_NUMBER(:userId) AS user_id, TO_NUMBER(:permissionId) AS permission_id FROM dual) s
        ON (t.user_id = s.user_id AND t.permission_id = s.permission_id)
      WHEN MATCHED THEN UPDATE
           SET t.override_effect = :effect, t.justification = :justification, t.is_active = 1,
               t.expires_at = :expiresAt, t.updated_at = ${UTC_NOW}, t.updated_by = :actorUserId
      WHEN NOT MATCHED THEN
           INSERT (user_id, permission_id, override_effect, justification, is_active, expires_at, created_by)
           VALUES (s.user_id, s.permission_id, :effect, :justification, 1, :expiresAt, :actorUserId)`,
    {
      userId,
      permissionId,
      effect,
      justification,
      expiresAt: timestampBind(expiresAt),
      actorUserId,
    },
  );
  return result.rowsAffected === 1;
}

export async function revokeOverride(connection, { userId, permissionId, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_user_permission_overrides
        SET is_active = 0, updated_at = ${UTC_NOW}, updated_by = :actorUserId
      WHERE user_id = :userId AND permission_id = :permissionId AND is_active = 1`,
    { userId, permissionId, actorUserId },
  );
  return result.rowsAffected === 1;
}
