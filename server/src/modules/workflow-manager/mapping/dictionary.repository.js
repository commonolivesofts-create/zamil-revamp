import oracledb from 'oracledb';
import { qualifiedName, quoteIdentifier } from './identifiers.js';

/*
 * Read-only Oracle data-dictionary queries for Workflow Manager mapping. Owner and object names are
 * always bound in dictionary queries. The single statement that reads a business object
 * (observeKeyUniqueness) is aggregate-only, and its identifiers are interpolated ONLY after the
 * service verified them against the live dictionary — and then double-quoted. No statement here
 * writes; dictionary.service.js additionally runs every call inside SET TRANSACTION READ ONLY.
 */
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const rows = async (connection, sql, binds) => (await connection.execute(sql, binds, OBJECT)).rows;
const splitColumns = (list) => (list ? String(list).split(',') : []);

export async function findObjects(connection, { owner, objectName }) {
  const result = await rows(
    connection,
    `SELECT object_type, status FROM all_objects
      WHERE owner = :owner AND object_name = :objectName AND object_type IN ('TABLE', 'VIEW')`,
    { owner, objectName },
  );
  return result.map((row) => ({ objectType: row.OBJECT_TYPE, status: row.STATUS }));
}

export async function listColumns(connection, { owner, objectName }) {
  const result = await rows(
    connection,
    `SELECT c.column_id, c.column_name, c.data_type, c.data_length, c.char_length,
            c.data_precision, c.data_scale, c.nullable, i.generation_type
       FROM all_tab_columns c
       LEFT JOIN all_tab_identity_cols i
         ON i.owner = c.owner AND i.table_name = c.table_name AND i.column_name = c.column_name
      WHERE c.owner = :owner AND c.table_name = :objectName
      ORDER BY c.column_id`,
    { owner, objectName },
  );
  return result.map((row) => ({
    columnId: row.COLUMN_ID,
    name: row.COLUMN_NAME,
    oracleType: row.DATA_TYPE,
    dataLength: row.DATA_LENGTH,
    charLength: row.CHAR_LENGTH,
    precision: row.DATA_PRECISION,
    scale: row.DATA_SCALE,
    nullable: row.NULLABLE !== 'N',
    identity: row.GENERATION_TYPE ?? null,
  }));
}

export async function listKeyConstraints(connection, { owner, objectName }) {
  const result = await rows(
    connection,
    `SELECT c.constraint_name, c.constraint_type, c.status, c.validated,
            (SELECT LISTAGG(cc.column_name, ',') WITHIN GROUP (ORDER BY cc.position)
               FROM all_cons_columns cc
              WHERE cc.owner = c.owner AND cc.constraint_name = c.constraint_name) AS column_list
       FROM all_constraints c
      WHERE c.owner = :owner AND c.table_name = :objectName AND c.constraint_type IN ('P', 'U')
      ORDER BY c.constraint_name`,
    { owner, objectName },
  );
  return result.map((row) => ({
    name: row.CONSTRAINT_NAME,
    type: row.CONSTRAINT_TYPE,
    status: row.STATUS,
    validated: row.VALIDATED,
    columns: splitColumns(row.COLUMN_LIST),
  }));
}

export async function listUniqueIndexes(connection, { owner, objectName }) {
  const result = await rows(
    connection,
    `SELECT i.index_name, i.index_type, i.status,
            (SELECT LISTAGG(ic.column_name, ',') WITHIN GROUP (ORDER BY ic.column_position)
               FROM all_ind_columns ic
              WHERE ic.index_owner = i.owner AND ic.index_name = i.index_name) AS column_list
       FROM all_indexes i
      WHERE i.table_owner = :owner AND i.table_name = :objectName AND i.uniqueness = 'UNIQUE'
      ORDER BY i.index_name`,
    { owner, objectName },
  );
  return result.map((row) => ({
    name: row.INDEX_NAME,
    status: row.STATUS,
    functionBased: String(row.INDEX_TYPE ?? '').includes('FUNCTION-BASED'),
    columns: splitColumns(row.COLUMN_LIST),
  }));
}

/**
 * Aggregate uniqueness observation of a key on a dictionary-verified object: total rows, rows with
 * a null key part, and key values occurring more than once. No row data is returned.
 */
export async function observeKeyUniqueness(connection, { owner, objectName, columns }) {
  const table = qualifiedName(owner, objectName);
  const keys = columns.map((name) => quoteIdentifier(name, 'Key column'));
  const anyNull = keys.map((key) => `${key} IS NULL`).join(' OR ');
  const allSet = keys.map((key) => `${key} IS NOT NULL`).join(' AND ');
  const [row] = await rows(
    connection,
    `SELECT (SELECT COUNT(*) FROM ${table}) AS row_count,
            (SELECT COUNT(*) FROM ${table} WHERE ${anyNull}) AS null_key_rows,
            (SELECT COUNT(*) FROM (SELECT 1 FROM ${table} WHERE ${allSet}
                GROUP BY ${keys.join(', ')} HAVING COUNT(*) > 1)) AS duplicate_key_groups
       FROM dual`,
    {},
  );
  return {
    rowCount: row.ROW_COUNT,
    nullKeyRows: row.NULL_KEY_ROWS,
    duplicateKeyGroups: row.DUPLICATE_KEY_GROUPS,
  };
}
