import oracledb from 'oracledb';
import { FORM_SCHEMA } from './mapping/formContract.js';

/*
 * Workflow Manager M2-A SQL — source version mapping over XX_ZRV_WF_SOURCE_VERSIONS.
 *
 *   XX_ZRV_WF_SOURCE_VERSIONS  read/write  DRAFT rows only: INSERT, UPDATE of the configuration
 *                                          and DELETE, each guarded by SOURCE_ID, ROW_VERSION and
 *                                          LIFECYCLE_STATE = 'DRAFT' in the statement itself.
 *   XX_ZRV_WF_FORM_VERSIONS    read only   dependency checks (header FK column and the structural
 *                                          JSON path of line sources; never a text LIKE scan).
 *   ALL_CONSTRAINTS            read only   foreign keys that reference XX_ZRV_WF_SOURCE_VERSIONS.
 *
 * Writes always set LIFECYCLE_STATE = 'DRAFT', IS_DEFAULT = 'N' and leave PUBLISHED_AT/BY null;
 * no statement here moves a version to REVIEW, APPROVED, PUBLISHED or RETIRED (package M6).
 * CONFIG_JSON is the canonical JSON produced by mapping/canonicalJson.js and CONFIG_SHA256 its
 * server fingerprint; both are bound, never interpolated. IDs are read and bound as strings,
 * timestamps are written in UTC, and ROW_VERSION is matched and incremented by the application
 * (no trigger maintains it). Statements run on the connection the service passes in —
 * repositories never commit or roll back.
 */
const ID = { type: oracledb.STRING };
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const UTC_NOW = "(SYSTIMESTAMP AT TIME ZONE 'UTC')";
// Bounded wait for a row lock held by a concurrent writer (ORA-30006 when it expires).
const LOCK_WAIT_SECONDS = 10;
const idOut = () => ({ dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 });
const clob = (value) => ({ val: value, type: oracledb.CLOB });

const rows = async (connection, sql, binds, fetchInfo) =>
  (await connection.execute(sql, binds, { ...OBJECT, fetchInfo })).rows;

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));
const flag = (value) => value === 'Y';

const userName = (column) =>
  `(SELECT MAX(e.full_name) FROM xx_zrv_users u
      JOIN xx_digi_emp_master e ON e.employee_number = u.employee_number
     WHERE u.user_id = ${column})`;

const VERSION_COLUMNS = `v.source_version_id, v.source_id, v.version_no, v.lifecycle_state,
       v.is_default, v.config_sha256, v.schema_version, v.validated_at, v.validated_by,
       v.published_at, v.created_at, v.created_by, v.updated_at, v.updated_by, v.row_version`;

const VERSION_FETCH = {
  SOURCE_VERSION_ID: ID,
  SOURCE_ID: ID,
  VALIDATED_BY: ID,
  CREATED_BY: ID,
  UPDATED_BY: ID,
};

const mapVersion = (row) => ({
  sourceVersionId: row.SOURCE_VERSION_ID,
  sourceId: row.SOURCE_ID,
  versionNo: row.VERSION_NO,
  lifecycleState: row.LIFECYCLE_STATE,
  isDefault: flag(row.IS_DEFAULT),
  configSha256: row.CONFIG_SHA256,
  schemaVersion: row.SCHEMA_VERSION,
  validatedAt: iso(row.VALIDATED_AT),
  validatedBy: row.VALIDATED_BY ?? null,
  publishedAt: iso(row.PUBLISHED_AT),
  createdAt: iso(row.CREATED_AT),
  createdBy: row.CREATED_BY,
  updatedAt: iso(row.UPDATED_AT),
  updatedBy: row.UPDATED_BY ?? null,
  rowVersion: row.ROW_VERSION,
});

/** Stable page of version metadata, newest version first (CONFIG_JSON is not read). */
export async function listVersions(connection, { sourceId, limit, offset }) {
  const [{ TOTAL: total }] = await rows(
    connection,
    'SELECT COUNT(*) AS total FROM xx_zrv_wf_source_versions v WHERE v.source_id = :sourceId',
    { sourceId },
  );
  const items = await rows(
    connection,
    `SELECT ${VERSION_COLUMNS}
       FROM xx_zrv_wf_source_versions v
      WHERE v.source_id = :sourceId
      ORDER BY v.version_no DESC, v.source_version_id DESC
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { sourceId, offset, limit },
    VERSION_FETCH,
  );
  return { total, items: items.map(mapVersion) };
}

/**
 * One version of one source with its stored CONFIG_JSON text. Both IDs are matched, so a version
 * of another source is "not found".
 */
export async function findVersion(connection, { sourceId, sourceVersionId }) {
  const [row] = await rows(
    connection,
    `SELECT ${VERSION_COLUMNS}, v.config_json,
            ${userName('v.created_by')} AS created_by_name,
            ${userName('v.updated_by')} AS updated_by_name,
            ${userName('v.validated_by')} AS validated_by_name
       FROM xx_zrv_wf_source_versions v
      WHERE v.source_version_id = :sourceVersionId AND v.source_id = :sourceId`,
    { sourceId, sourceVersionId },
    { ...VERSION_FETCH, CONFIG_JSON: { type: oracledb.STRING } },
  );
  if (!row) return null;
  return {
    ...mapVersion(row),
    configJson: row.CONFIG_JSON ?? null,
    createdByName: row.CREATED_BY_NAME ?? null,
    updatedByName: row.UPDATED_BY_NAME ?? null,
    validatedByName: row.VALIDATED_BY_NAME ?? null,
  };
}

/**
 * Locks one version row of one source for the rest of the transaction (delete). Returns its
 * lifecycle metadata, or null when it does not exist (for that source).
 */
export async function lockVersion(connection, { sourceId, sourceVersionId }) {
  const [row] = await rows(
    connection,
    `SELECT v.source_version_id, v.version_no, v.lifecycle_state, v.is_default, v.row_version
       FROM xx_zrv_wf_source_versions v
      WHERE v.source_version_id = :sourceVersionId AND v.source_id = :sourceId
        FOR UPDATE WAIT ${LOCK_WAIT_SECONDS}`,
    { sourceId, sourceVersionId },
    { SOURCE_VERSION_ID: ID },
  );
  return row
    ? {
        sourceVersionId: row.SOURCE_VERSION_ID,
        versionNo: row.VERSION_NO,
        lifecycleState: row.LIFECYCLE_STATE,
        isDefault: flag(row.IS_DEFAULT),
        rowVersion: row.ROW_VERSION,
      }
    : null;
}

/**
 * Next VERSION_NO of a source. Call only while holding the parent source row lock
 * (workflowManager.repository.lockSource): the lock serializes allocation, and the unique key
 * (SOURCE_ID, VERSION_NO) rejects anything else. There is no durable counter, so the number of a
 * deleted highest DRAFT is allocated again (documented limitation; versions are never renumbered).
 */
export async function nextVersionNo(connection, sourceId) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(v.version_no), 0) + 1 AS next_no
       FROM xx_zrv_wf_source_versions v
      WHERE v.source_id = :sourceId`,
    { sourceId },
  );
  return row.NEXT_NO;
}

/** Inserts a validated DRAFT; SOURCE_VERSION_ID comes from the identity column. */
export async function insertVersion(
  connection,
  { sourceId, versionNo, configJson, configSha256, schemaVersion, actorUserId },
) {
  const result = await connection.execute(
    `INSERT INTO xx_zrv_wf_source_versions
       (source_id, version_no, lifecycle_state, is_default, config_json, validated_at,
        validated_by, config_sha256, schema_version, published_at, published_by,
        created_at, created_by, updated_at, updated_by, row_version)
     VALUES
       (:sourceId, :versionNo, 'DRAFT', 'N', :configJson, ${UTC_NOW},
        :actorUserId, :configSha256, :schemaVersion, NULL, NULL,
        ${UTC_NOW}, :actorUserId, ${UTC_NOW}, :actorUserId, 1)
     RETURNING source_version_id INTO :sourceVersionId`,
    {
      sourceId,
      versionNo,
      configJson: clob(configJson),
      configSha256,
      schemaVersion,
      actorUserId,
      sourceVersionId: idOut(),
    },
  );
  return result.outBinds.sourceVersionId[0];
}

/**
 * Replaces the configuration of a DRAFT and re-stamps its validation. Returns the number of rows
 * changed (0: missing, another source, not DRAFT any more, or stale ROW_VERSION).
 */
export async function updateVersionConfig(
  connection,
  { sourceId, sourceVersionId, rowVersion, configJson, configSha256, schemaVersion, actorUserId },
) {
  const result = await connection.execute(
    `UPDATE xx_zrv_wf_source_versions
        SET config_json = :configJson, config_sha256 = :configSha256,
            schema_version = :schemaVersion, validated_at = ${UTC_NOW},
            validated_by = :actorUserId, updated_at = ${UTC_NOW}, updated_by = :actorUserId,
            row_version = row_version + 1
      WHERE source_version_id = :sourceVersionId AND source_id = :sourceId
        AND row_version = :rowVersion AND lifecycle_state = 'DRAFT'`,
    {
      sourceId,
      sourceVersionId,
      rowVersion,
      configJson: clob(configJson),
      configSha256,
      schemaVersion,
      actorUserId,
    },
  );
  return result.rowsAffected;
}

/**
 * Structural references to a source version, read inside the deleting transaction:
 *   headerRefs   form versions whose HEADER_SOURCE_VERSION_ID (FK) is the version;
 *   lineRefs     form versions whose CONFIG_JSON names it as a line source, matched by the JSON
 *                path $.lines[*].sourceVersionId with a bound value (zrv.wf.form/1);
 *   unverifiable form versions whose CONFIG_JSON is not zrv.wf.form/1, so their references
 *                cannot be read structurally (the service fails closed);
 *   foreignKeys  every foreign key of the current schema that references the table, with its
 *                delete rule and status (a cascading or disabled key fails closed, and so does
 *                a dictionary that does not show the documented FORM_VERSIONS header key).
 */
export async function findVersionReferences(connection, sourceVersionId) {
  const [counts] = await rows(
    connection,
    `SELECT (SELECT COUNT(*) FROM xx_zrv_wf_form_versions fv
              WHERE fv.header_source_version_id = :sourceVersionId) AS header_refs,
            (SELECT COUNT(*) FROM xx_zrv_wf_form_versions fv
              WHERE JSON_EXISTS(fv.config_json, '$.lines[*]?(@.sourceVersionId == $sv)'
                                PASSING :sourceVersionId AS "sv")) AS line_refs,
            (SELECT COUNT(*) FROM xx_zrv_wf_form_versions fv
              WHERE NVL(JSON_VALUE(fv.config_json, '$.schema'
                                   RETURNING VARCHAR2(40) NULL ON ERROR), '#')
                    <> :formSchema) AS unverifiable
       FROM dual`,
    { sourceVersionId, formSchema: FORM_SCHEMA },
  );
  const keys = await rows(
    connection,
    `SELECT c.table_name, c.constraint_name, c.delete_rule, c.status
       FROM all_constraints c
       JOIN all_constraints p ON p.owner = c.r_owner AND p.constraint_name = c.r_constraint_name
      WHERE c.constraint_type = 'R'
        AND p.constraint_type IN ('P', 'U')
        AND p.table_name = 'XX_ZRV_WF_SOURCE_VERSIONS'
        AND p.owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
      ORDER BY c.table_name, c.constraint_name`,
    {},
  );
  return {
    headerRefs: counts.HEADER_REFS,
    lineRefs: counts.LINE_REFS,
    unverifiable: counts.UNVERIFIABLE,
    foreignKeys: keys.map((row) => ({
      tableName: row.TABLE_NAME,
      constraintName: row.CONSTRAINT_NAME,
      deleteRule: row.DELETE_RULE,
      status: row.STATUS,
    })),
  };
}

/**
 * Deletes an unreferenced DRAFT. The statement itself re-checks source, ROW_VERSION, lifecycle,
 * default flag and publication; any referencing row still raises ORA-02292 (enforced FK).
 */
export async function deleteDraftVersion(connection, { sourceId, sourceVersionId, rowVersion }) {
  const result = await connection.execute(
    `DELETE FROM xx_zrv_wf_source_versions
      WHERE source_version_id = :sourceVersionId AND source_id = :sourceId
        AND row_version = :rowVersion AND lifecycle_state = 'DRAFT'
        AND is_default = 'N' AND published_at IS NULL`,
    { sourceId, sourceVersionId, rowVersion },
  );
  return result.rowsAffected;
}
