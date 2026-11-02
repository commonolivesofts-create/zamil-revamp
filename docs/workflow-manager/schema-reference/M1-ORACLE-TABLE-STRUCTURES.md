# Workflow Manager Oracle TEST — M1 physical schema design reference

**Status: reference only, not a runnable migration or proof of exact deployed DDL.** This was transcribed from the earlier v1.3.1 JSON-fix schema package used as the basis for the owner's TEST deployment. The owner's post-deployment verification passed **21 tables, 50 FKs, 48 indexes and 16 enabled triggers**; later manual repairs mean the original migration files cannot be assumed to match the deployed dictionary.

The previous documentation PR included only the table **names**; this missing physical structure blocked M1 development. This M1 reference supplies column types, PKs, unique/check constraints and foreign keys for the four M1 tables. **Do not execute any CREATE statements below.** Compare all referenced columns with the live TEST Oracle data dictionary before finalizing runtime SQL or claiming tests passed. Use the included [read-only M1 dictionary queries](READONLY-VERIFY-M1.sql).

## M1 — XX_ZRV_WF_FORMS

- `FORM_ID` NUMBER(19,0), **identity, PK, NOT NULL**
- `FORM_CODE` VARCHAR2(80 CHAR), **NOT NULL, UNIQUE**
- `FORM_NAME` VARCHAR2(200 CHAR), **NOT NULL**
- `MODULE_CODE` VARCHAR2(80 CHAR), **NOT NULL**
- `DETAIL_ROUTE` VARCHAR2(500 CHAR), nullable
- `DESCRIPTION` VARCHAR2(1000 CHAR), nullable
- `IS_ACTIVE` VARCHAR2(1 CHAR), default `'Y'`, NOT NULL, check Y/N
- `CREATED_AT` TIMESTAMP(6) WITH TIME ZONE, default SYSTIMESTAMP, NOT NULL
- `CREATED_BY` NUMBER(19,0), NOT NULL
- `UPDATED_AT` TIMESTAMP(6) WITH TIME ZONE, default SYSTIMESTAMP, NOT NULL
- `UPDATED_BY` NUMBER(19,0), nullable
- `ROW_VERSION` NUMBER(10,0), default 1, NOT NULL
- Design constraints: `ZWF_PK_FORM` PK(FORM_ID), `ZWF_UQ_FORM_1` UNIQUE(FORM_CODE), `ZWF_CK_FORM_1` IS_ACTIVE in ('Y','N').
- Design indexes: `ZWF_IX_FORM_1` (MODULE_CODE, IS_ACTIVE); PK and unique indexes supplied by constraints.

## M1 — XX_ZRV_WF_DATA_SOURCES

- `SOURCE_ID` NUMBER(19,0), **identity, PK, NOT NULL**
- `SOURCE_CODE` VARCHAR2(80 CHAR), **NOT NULL, UNIQUE**
- `SOURCE_NAME` VARCHAR2(200 CHAR), **NOT NULL**
- `SOURCE_KIND` VARCHAR2(20 CHAR), **NOT NULL**, check TABLE/VIEW/HANDLER
- `OWNER_NAME` VARCHAR2(128 CHAR), nullable
- `OBJECT_NAME` VARCHAR2(128 CHAR), nullable
- `HANDLER_CODE` VARCHAR2(128 CHAR), nullable
- `IS_ACTIVE` VARCHAR2(1 CHAR), default `'Y'`, NOT NULL, check Y/N
- `CREATED_AT` TIMESTAMP(6) WITH TIME ZONE, default SYSTIMESTAMP, NOT NULL
- `CREATED_BY` NUMBER(19,0), NOT NULL
- `UPDATED_AT` TIMESTAMP(6) WITH TIME ZONE, default SYSTIMESTAMP, NOT NULL
- `UPDATED_BY` NUMBER(19,0), nullable
- `ROW_VERSION` NUMBER(10,0), default 1, NOT NULL
- Design constraints: `ZWF_PK_SRC` PK(SOURCE_ID), `ZWF_UQ_SRC_1` UNIQUE(SOURCE_CODE), `ZWF_CK_SRC_1` kind in TABLE/VIEW/HANDLER; `ZWF_CK_SRC_2` active Y/N.
- `ZWF_CK_SRC_3`: TABLE/VIEW requires OWNER_NAME and OBJECT_NAME, with HANDLER_CODE null; HANDLER requires HANDLER_CODE, with OWNER_NAME and OBJECT_NAME null.
- Design index: `ZWF_IX_SRC_1` (OWNER_NAME, OBJECT_NAME).

## Read-only M1 dependency — XX_ZRV_WF_SOURCE_VERSIONS

- `SOURCE_VERSION_ID` NUMBER(19,0), identity PK NOT NULL
- `SOURCE_ID` NUMBER(19,0), NOT NULL, FK to DATA_SOURCES(SOURCE_ID)
- `VERSION_NO` NUMBER(9,0), NOT NULL, positive
- `LIFECYCLE_STATE` VARCHAR2(20 CHAR), NOT NULL, allowed DRAFT/REVIEW/APPROVED/PUBLISHED/RETIRED
- `IS_DEFAULT` VARCHAR2(1 CHAR), default N, NOT NULL, Y/N (Y requires PUBLISHED)
- `CONFIG_JSON` CLOB, NOT NULL, `IS JSON STRICT WITH UNIQUE KEYS`
- `VALIDATED_AT` TIMESTAMP(6) WITH TIME ZONE, nullable
- `VALIDATED_BY` NUMBER(19,0), nullable
- `CONFIG_SHA256` VARCHAR2(64 CHAR), NOT NULL, length 64
- `SCHEMA_VERSION` NUMBER(9,0), default 1, NOT NULL, positive
- `PUBLISHED_AT` TIMESTAMP(6) WITH TIME ZONE, nullable
- `PUBLISHED_BY` NUMBER(19,0), nullable
- `CREATED_AT`, `UPDATED_AT` TIMESTAMP(6) WITH TIME ZONE, defaults SYSTIMESTAMP, NOT NULL
- `CREATED_BY` NUMBER(19,0), NOT NULL; `UPDATED_BY` NUMBER(19,0), nullable
- `ROW_VERSION` NUMBER(10,0), default 1, NOT NULL
- Unique (SOURCE_ID, VERSION_NO); conditional default unique index `ZWF_UX_SV_DEF` one default per SOURCE_ID.

## Read-only M1 dependency — XX_ZRV_WF_FORM_VERSIONS

- `FORM_VERSION_ID` NUMBER(19,0), identity PK NOT NULL
- `FORM_ID` NUMBER(19,0), NOT NULL, FK to FORMS(FORM_ID)
- `HEADER_SOURCE_VERSION_ID` NUMBER(19,0), NOT NULL, FK to SOURCE_VERSIONS(SOURCE_VERSION_ID)
- `VERSION_NO` NUMBER(9,0), NOT NULL, positive
- `LIFECYCLE_STATE` VARCHAR2(20 CHAR), NOT NULL, allowed DRAFT/REVIEW/APPROVED/PUBLISHED/RETIRED
- `IS_DEFAULT` VARCHAR2(1 CHAR), default N, NOT NULL, Y/N (Y requires PUBLISHED)
- `CONFIG_JSON` CLOB, NOT NULL, `IS JSON STRICT WITH UNIQUE KEYS`
- `CONFIG_SHA256` VARCHAR2(64 CHAR), NOT NULL, length 64
- `SCHEMA_VERSION` NUMBER(9,0), default 1, NOT NULL, positive
- `PUBLISHED_AT` TIMESTAMP(6) WITH TIME ZONE, nullable
- `PUBLISHED_BY` NUMBER(19,0), nullable
- `CREATED_AT`, `UPDATED_AT` TIMESTAMP(6) WITH TIME ZONE, defaults SYSTIMESTAMP, NOT NULL
- `CREATED_BY` NUMBER(19,0), NOT NULL; `UPDATED_BY` NUMBER(19,0), nullable
- `ROW_VERSION` NUMBER(10,0), default 1, NOT NULL
- Unique (FORM_ID, VERSION_NO) and (FORM_VERSION_ID, FORM_ID); conditional default unique index `ZWF_UX_FV_DEF` one default per FORM_ID.

## Outstanding baseline work

The **full 21-table as-deployed dictionary has not yet been exported into the repository**. The design v1.3.1 package included 21 CREATE TABLE statements, 48 proposed named indexes and triggers, but manual TEST repairs occurred (e.g. JSON check syntax; RFI and other indexes; missing `XX_ZRV_WF_EXCEPTIONS.CREATED_AT` in original source). Do not assume design files are a precise production replay script. M2–E7 must perform their own source/dictionary reconciliation before coding SQL against later tables.

**Gates:** Reading the Oracle dictionary is allowed where existing access permits. No DDL, DML test writes, RBAC catalogue registration or CI3 cutover without the exact owner approval required by repository G1–G4.
