-- Workflow Manager M1 — read-only Oracle TEST dictionary check
-- Run only under the schema that owns XX_ZRV_WF_* (e.g., XXZP), or adapt to ALL_* views.
-- No DDL, DML, grants, seeds, or app-data writes.

SELECT table_name
  FROM user_tables
 WHERE table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY table_name;

SELECT table_name, column_id, column_name, data_type, data_length,
       data_precision, data_scale, char_length, nullable
  FROM user_tab_columns
 WHERE table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY table_name, column_id;

SELECT c.table_name,c.constraint_name,c.constraint_type,c.status,c.validated,
       cc.position,cc.column_name,c.r_constraint_name
  FROM user_constraints c
  LEFT JOIN user_cons_columns cc ON cc.constraint_name=c.constraint_name
                                AND cc.table_name=c.table_name
 WHERE c.table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY c.table_name,c.constraint_name,cc.position;

SELECT i.table_name,i.index_name,i.uniqueness,i.status,ic.column_position,ic.column_name
  FROM user_indexes i
  LEFT JOIN user_ind_columns ic ON ic.index_name=i.index_name
 WHERE i.table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY i.table_name,i.index_name,ic.column_position;

SELECT table_name,column_name,generation_type
  FROM user_tab_identity_cols
 WHERE table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY table_name,column_name;

SELECT trigger_name,table_name,status FROM user_triggers
 WHERE table_name IN ('XX_ZRV_WF_FORMS','XX_ZRV_WF_DATA_SOURCES','XX_ZRV_WF_SOURCE_VERSIONS','XX_ZRV_WF_FORM_VERSIONS')
 ORDER BY table_name,trigger_name;
