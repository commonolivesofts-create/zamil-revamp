import oracledb from 'oracledb';

/*
 * Workflow Manager M1 SQL over the deployed configuration tables (Oracle TEST dictionary,
 * 2026-11-02):
 *   XX_ZRV_WF_FORMS          read/write  FORM_ID identity, UQ FORM_CODE, IS_ACTIVE Y/N, ROW_VERSION
 *   XX_ZRV_WF_DATA_SOURCES   read/write  SOURCE_ID identity, UQ SOURCE_CODE, CHECK ZWF_CK_SRC_1/3
 *   XX_ZRV_WF_SOURCE_VERSIONS  read only  (metadata; CONFIG_JSON is never selected)
 *   XX_ZRV_WF_FORM_VERSIONS    read only  (metadata; CONFIG_JSON is never selected)
 * plus read-only lookups of the RBAC module catalogue (XX_ZRV_APP_MODULES), the user/employee
 * display name and the Oracle data dictionary (ALL_OBJECTS).
 *
 * Values are always bound; sort columns come only from the fixed maps below. IDs are read and
 * bound as strings. Timestamps are written in UTC. ROW_VERSION is the optimistic lock: updates
 * match the caller's version and increment it. Statements run on the connection the service passes
 * in — repositories never commit or roll back.
 */
const ID = { type: oracledb.STRING };
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";
const idOut = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });

const rows = async (connection, sql, binds, fetchInfo) =>
  (await connection.execute(sql, binds, { ...OBJECT, fetchInfo })).rows;

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));
const flag = (value) => value === 'Y';

// Display name of an application user (XX_ZRV_USERS → employee master); MAX() keeps a scalar
// result even if the employee master holds a duplicate row.
const userName = (column) =>
  `(SELECT MAX(e.full_name) FROM xx_zrv_users u
      JOIN xx_digi_emp_master e ON e.employee_number = u.employee_number
     WHERE u.user_id = ${column})`;

const STATUS_FILTER = { ACTIVE: 'Y', INACTIVE: 'N' };

// --- Forms ---------------------------------------------------------------------------------------

const FORM_SORT = Object.freeze({
  FORM_CODE: 'f.form_code',
  FORM_NAME: 'UPPER(f.form_name)',
  MODULE_CODE: 'f.module_code',
  UPDATED_AT: 'f.updated_at',
});

const FORM_COLUMNS = `f.form_id, f.form_code, f.form_name, f.module_code, f.detail_route,
       f.description, f.is_active, f.created_at, f.created_by, f.updated_at, f.updated_by,
       f.row_version,
       (SELECT m.module_name FROM xx_zrv_app_modules m WHERE m.module_code = f.module_code)
         AS module_name,
       (SELECT COUNT(*) FROM xx_zrv_wf_form_versions v WHERE v.form_id = f.form_id)
         AS version_count`;

const FORM_FETCH = { FORM_ID: ID, CREATED_BY: ID, UPDATED_BY: ID };

const mapForm = (row) => ({
  formId: row.FORM_ID,
  formCode: row.FORM_CODE,
  formName: row.FORM_NAME,
  moduleCode: row.MODULE_CODE,
  moduleName: row.MODULE_NAME ?? null,
  detailRoute: row.DETAIL_ROUTE ?? null,
  description: row.DESCRIPTION ?? null,
  isActive: flag(row.IS_ACTIVE),
  versionCount: row.VERSION_COUNT,
  rowVersion: row.ROW_VERSION,
  createdAt: iso(row.CREATED_AT),
  createdBy: row.CREATED_BY,
  createdByName: row.CREATED_BY_NAME ?? null,
  updatedAt: iso(row.UPDATED_AT),
  updatedBy: row.UPDATED_BY ?? null,
  updatedByName: row.UPDATED_BY_NAME ?? null,
});

function formFilters({ search, moduleCode, status }) {
  const where = [];
  const binds = {};
  if (search) {
    where.push(`(f.form_code LIKE :search ESCAPE '\\' OR UPPER(f.form_name) LIKE :search ESCAPE '\\'
                 OR f.module_code LIKE :search ESCAPE '\\')`);
    binds.search = search;
  }
  if (moduleCode) {
    where.push('f.module_code = :moduleCode');
    binds.moduleCode = moduleCode;
  }
  if (status) {
    where.push('f.is_active = :isActive');
    binds.isActive = STATUS_FILTER[status];
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

export async function listForms(connection, { limit, offset, filters, sortBy, sortDir }) {
  const { clause, binds } = formFilters(filters);
  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS total FROM xx_zrv_wf_forms f ${clause}`,
    binds,
  );
  const order = `${FORM_SORT[sortBy]} ${sortDir === 'desc' ? 'DESC' : 'ASC'}, f.form_id`;
  const items = await rows(
    connection,
    `SELECT ${FORM_COLUMNS}
       FROM xx_zrv_wf_forms f ${clause}
      ORDER BY ${order}
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    FORM_FETCH,
  );
  return { total, items: items.map(mapForm) };
}

export async function findForm(connection, formId) {
  const [row] = await rows(
    connection,
    `SELECT ${FORM_COLUMNS},
            ${userName('f.created_by')} AS created_by_name,
            ${userName('f.updated_by')} AS updated_by_name
       FROM xx_zrv_wf_forms f
      WHERE f.form_id = :formId`,
    { formId },
    FORM_FETCH,
  );
  return row ? mapForm(row) : null;
}

export async function findFormIdByCode(connection, formCode) {
  const [row] = await rows(
    connection,
    'SELECT form_id FROM xx_zrv_wf_forms WHERE form_code = :formCode',
    { formCode },
    { FORM_ID: ID },
  );
  return row ? row.FORM_ID : null;
}

/** Inserts an active form; FORM_ID comes from the identity column. */
export async function insertForm(connection, form) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_wf_forms
       (form_code, form_name, module_code, detail_route, description, is_active,
        created_at, created_by, updated_at, updated_by, row_version)
     VALUES
       (:formCode, :formName, :moduleCode, :detailRoute, :description, 'Y',
        ${UTC_NOW}, :actorUserId, ${UTC_NOW}, :actorUserId, 1)
     RETURNING form_id INTO :formId`,
    { ...form, formId: idOut() },
  );
  return result.outBinds.formId[0];
}

/** Returns the number of rows changed (0: missing or stale ROW_VERSION). */
export async function updateForm(connection, form) {
  const result = await connection.execute(
    `UPDATE xx_zrv_wf_forms
        SET form_name = :formName, module_code = :moduleCode, detail_route = :detailRoute,
            description = :description, updated_at = ${UTC_NOW}, updated_by = :actorUserId,
            row_version = row_version + 1
      WHERE form_id = :formId AND row_version = :rowVersion`,
    form,
  );
  return result.rowsAffected;
}

export async function setFormActive(connection, { formId, isActive, rowVersion, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_wf_forms
        SET is_active = :isActive, updated_at = ${UTC_NOW}, updated_by = :actorUserId,
            row_version = row_version + 1
      WHERE form_id = :formId AND row_version = :rowVersion`,
    { formId, isActive: isActive ? 'Y' : 'N', rowVersion, actorUserId },
  );
  return result.rowsAffected;
}

/** Read-only form mapping versions (M2 creates them); CONFIG_JSON is never read here. */
export async function listFormVersions(connection, formId) {
  const result = await rows(
    connection,
    `SELECT v.form_version_id, v.version_no, v.lifecycle_state, v.is_default, v.config_sha256,
            v.schema_version, v.published_at, v.created_at, v.updated_at,
            v.header_source_version_id, sv.version_no AS source_version_no,
            s.source_id, s.source_code
       FROM xx_zrv_wf_form_versions v
       JOIN xx_zrv_wf_source_versions sv ON sv.source_version_id = v.header_source_version_id
       JOIN xx_zrv_wf_data_sources s ON s.source_id = sv.source_id
      WHERE v.form_id = :formId
      ORDER BY v.version_no DESC
      FETCH FIRST 200 ROWS ONLY`,
    { formId },
    { FORM_VERSION_ID: ID, HEADER_SOURCE_VERSION_ID: ID, SOURCE_ID: ID },
  );
  return result.map((row) => ({
    formVersionId: row.FORM_VERSION_ID,
    versionNo: row.VERSION_NO,
    lifecycleState: row.LIFECYCLE_STATE,
    isDefault: flag(row.IS_DEFAULT),
    configSha256: row.CONFIG_SHA256,
    schemaVersion: row.SCHEMA_VERSION,
    publishedAt: iso(row.PUBLISHED_AT),
    createdAt: iso(row.CREATED_AT),
    updatedAt: iso(row.UPDATED_AT),
    headerSource: {
      sourceVersionId: row.HEADER_SOURCE_VERSION_ID,
      versionNo: row.SOURCE_VERSION_NO,
      sourceId: row.SOURCE_ID,
      sourceCode: row.SOURCE_CODE,
    },
  }));
}

// --- Data sources --------------------------------------------------------------------------------

const SOURCE_SORT = Object.freeze({
  SOURCE_CODE: 's.source_code',
  SOURCE_NAME: 'UPPER(s.source_name)',
  SOURCE_KIND: 's.source_kind',
  UPDATED_AT: 's.updated_at',
});

const SOURCE_COLUMNS = `s.source_id, s.source_code, s.source_name, s.source_kind, s.owner_name,
       s.object_name, s.handler_code, s.is_active, s.created_at, s.created_by, s.updated_at,
       s.updated_by, s.row_version,
       (SELECT COUNT(*) FROM xx_zrv_wf_source_versions v WHERE v.source_id = s.source_id)
         AS version_count`;

const SOURCE_FETCH = { SOURCE_ID: ID, CREATED_BY: ID, UPDATED_BY: ID };

const mapSource = (row) => ({
  sourceId: row.SOURCE_ID,
  sourceCode: row.SOURCE_CODE,
  sourceName: row.SOURCE_NAME,
  sourceKind: row.SOURCE_KIND,
  ownerName: row.OWNER_NAME ?? null,
  objectName: row.OBJECT_NAME ?? null,
  handlerCode: row.HANDLER_CODE ?? null,
  isActive: flag(row.IS_ACTIVE),
  versionCount: row.VERSION_COUNT,
  rowVersion: row.ROW_VERSION,
  createdAt: iso(row.CREATED_AT),
  createdBy: row.CREATED_BY,
  createdByName: row.CREATED_BY_NAME ?? null,
  updatedAt: iso(row.UPDATED_AT),
  updatedBy: row.UPDATED_BY ?? null,
  updatedByName: row.UPDATED_BY_NAME ?? null,
});

function sourceFilters({ search, sourceKind, status }) {
  const where = [];
  const binds = {};
  if (search) {
    where.push(`(s.source_code LIKE :search ESCAPE '\\' OR UPPER(s.source_name) LIKE :search ESCAPE '\\'
                 OR s.object_name LIKE :search ESCAPE '\\' OR s.handler_code LIKE :search ESCAPE '\\')`);
    binds.search = search;
  }
  if (sourceKind) {
    where.push('s.source_kind = :sourceKind');
    binds.sourceKind = sourceKind;
  }
  if (status) {
    where.push('s.is_active = :isActive');
    binds.isActive = STATUS_FILTER[status];
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

export async function listSources(connection, { limit, offset, filters, sortBy, sortDir }) {
  const { clause, binds } = sourceFilters(filters);
  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS total FROM xx_zrv_wf_data_sources s ${clause}`,
    binds,
  );
  const order = `${SOURCE_SORT[sortBy]} ${sortDir === 'desc' ? 'DESC' : 'ASC'}, s.source_id`;
  const items = await rows(
    connection,
    `SELECT ${SOURCE_COLUMNS}
       FROM xx_zrv_wf_data_sources s ${clause}
      ORDER BY ${order}
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    SOURCE_FETCH,
  );
  return { total, items: items.map(mapSource) };
}

export async function findSource(connection, sourceId) {
  const [row] = await rows(
    connection,
    `SELECT ${SOURCE_COLUMNS},
            ${userName('s.created_by')} AS created_by_name,
            ${userName('s.updated_by')} AS updated_by_name
       FROM xx_zrv_wf_data_sources s
      WHERE s.source_id = :sourceId`,
    { sourceId },
    SOURCE_FETCH,
  );
  return row ? mapSource(row) : null;
}

export async function findSourceIdByCode(connection, sourceCode) {
  const [row] = await rows(
    connection,
    'SELECT source_id FROM xx_zrv_wf_data_sources WHERE source_code = :sourceCode',
    { sourceCode },
    { SOURCE_ID: ID },
  );
  return row ? row.SOURCE_ID : null;
}

export async function insertSource(connection, source) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_wf_data_sources
       (source_code, source_name, source_kind, owner_name, object_name, handler_code, is_active,
        created_at, created_by, updated_at, updated_by, row_version)
     VALUES
       (:sourceCode, :sourceName, :sourceKind, :ownerName, :objectName, :handlerCode, 'Y',
        ${UTC_NOW}, :actorUserId, ${UTC_NOW}, :actorUserId, 1)
     RETURNING source_id INTO :sourceId`,
    { ...source, sourceId: idOut() },
  );
  return result.outBinds.sourceId[0];
}

export async function updateSource(connection, source) {
  const result = await connection.execute(
    `UPDATE xx_zrv_wf_data_sources
        SET source_name = :sourceName, source_kind = :sourceKind, owner_name = :ownerName,
            object_name = :objectName, handler_code = :handlerCode, updated_at = ${UTC_NOW},
            updated_by = :actorUserId, row_version = row_version + 1
      WHERE source_id = :sourceId AND row_version = :rowVersion`,
    source,
  );
  return result.rowsAffected;
}

export async function setSourceActive(connection, { sourceId, isActive, rowVersion, actorUserId }) {
  const result = await connection.execute(
    `UPDATE xx_zrv_wf_data_sources
        SET is_active = :isActive, updated_at = ${UTC_NOW}, updated_by = :actorUserId,
            row_version = row_version + 1
      WHERE source_id = :sourceId AND row_version = :rowVersion`,
    { sourceId, isActive: isActive ? 'Y' : 'N', rowVersion, actorUserId },
  );
  return result.rowsAffected;
}

/** Read-only source versions (M2 creates them); CONFIG_JSON is never read here. */
export async function listSourceVersions(connection, sourceId) {
  const result = await rows(
    connection,
    `SELECT v.source_version_id, v.version_no, v.lifecycle_state, v.is_default, v.config_sha256,
            v.schema_version, v.validated_at, v.published_at, v.created_at, v.updated_at
       FROM xx_zrv_wf_source_versions v
      WHERE v.source_id = :sourceId
      ORDER BY v.version_no DESC
      FETCH FIRST 200 ROWS ONLY`,
    { sourceId },
    { SOURCE_VERSION_ID: ID },
  );
  return result.map((row) => ({
    sourceVersionId: row.SOURCE_VERSION_ID,
    versionNo: row.VERSION_NO,
    lifecycleState: row.LIFECYCLE_STATE,
    isDefault: flag(row.IS_DEFAULT),
    configSha256: row.CONFIG_SHA256,
    schemaVersion: row.SCHEMA_VERSION,
    validatedAt: iso(row.VALIDATED_AT),
    publishedAt: iso(row.PUBLISHED_AT),
    createdAt: iso(row.CREATED_AT),
    updatedAt: iso(row.UPDATED_AT),
  }));
}

// --- Overview ------------------------------------------------------------------------------------

export async function countForms(connection) {
  const [row] = await rows(
    connection,
    `SELECT COUNT(*) AS total, NVL(SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END), 0) AS active
       FROM xx_zrv_wf_forms`,
    {},
  );
  return { total: row.TOTAL, active: row.ACTIVE };
}

export async function countSources(connection) {
  const result = await rows(
    connection,
    `SELECT source_kind, COUNT(*) AS total,
            SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END) AS active
       FROM xx_zrv_wf_data_sources
      GROUP BY source_kind`,
    {},
  );
  return result.map((row) => ({
    sourceKind: row.SOURCE_KIND,
    total: row.TOTAL,
    active: row.ACTIVE,
  }));
}

// --- Read-only lookups ---------------------------------------------------------------------------

/** Active RBAC modules (the locked catalogue is only read). */
export async function listActiveModules(connection) {
  const result = await rows(
    connection,
    `SELECT module_code, module_name FROM xx_zrv_app_modules
      WHERE is_active = 1
      ORDER BY display_order, module_code
      FETCH FIRST 500 ROWS ONLY`,
    {},
  );
  return result.map((row) => ({ moduleCode: row.MODULE_CODE, moduleName: row.MODULE_NAME }));
}

export async function findActiveModule(connection, moduleCode) {
  const [row] = await rows(
    connection,
    `SELECT module_code, module_name FROM xx_zrv_app_modules
      WHERE module_code = :moduleCode AND is_active = 1`,
    { moduleCode },
  );
  return row ? { moduleCode: row.MODULE_CODE, moduleName: row.MODULE_NAME } : null;
}

/**
 * One dictionary object (names only — no data is read). `ownerName`/`objectName` are bound values,
 * never interpolated.
 */
export async function findDictionaryObject(connection, { ownerName, objectName }) {
  const result = await rows(
    connection,
    `SELECT owner, object_name, object_type, status FROM all_objects
      WHERE owner = :ownerName AND object_name = :objectName
        AND object_type IN ('TABLE', 'VIEW')`,
    { ownerName, objectName },
  );
  return result.map((row) => ({
    ownerName: row.OWNER,
    objectName: row.OBJECT_NAME,
    objectType: row.OBJECT_TYPE,
    status: row.STATUS,
  }));
}

/** VALID tables or views of the allowlisted owners, excluding the protected name prefixes. */
export async function listDictionaryObjects(
  connection,
  { owners, objectType, search, excludedPrefixes, limit },
) {
  const ownerBinds = Object.fromEntries(owners.map((owner, index) => [`owner${index}`, owner]));
  const excluded = excludedPrefixes.map(
    (_, index) => `object_name NOT LIKE :excluded${index} ESCAPE '\\'`,
  );
  const excludedBinds = Object.fromEntries(
    excludedPrefixes.map((prefix, index) => [
      `excluded${index}`,
      `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    ]),
  );
  const result = await rows(
    connection,
    `SELECT owner, object_name, object_type FROM all_objects
      WHERE owner IN (${Object.keys(ownerBinds)
        .map((key) => `:${key}`)
        .join(', ')})
        AND object_type = :objectType AND status = 'VALID'
        ${excluded.length ? `AND ${excluded.join(' AND ')}` : ''}
        ${search ? "AND object_name LIKE :search ESCAPE '\\'" : ''}
      ORDER BY owner, object_name
      FETCH FIRST :limit ROWS ONLY`,
    { ...ownerBinds, ...excludedBinds, objectType, ...(search ? { search } : {}), limit },
  );
  return result.map((row) => ({
    ownerName: row.OWNER,
    objectName: row.OBJECT_NAME,
    objectType: row.OBJECT_TYPE,
  }));
}
