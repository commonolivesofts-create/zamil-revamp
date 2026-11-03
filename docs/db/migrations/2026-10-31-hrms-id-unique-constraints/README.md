# HRMS-ID-UK-001: unique constraints on HRMS ID columns

**Status:** proposed and **not applied**. This needs DBA review and owner approval under gate G1. CI3 also writes to these tables, so it needs G4 review too.

**Why:**
- These tables give every row an ID, but most have no primary or unique key. A clash between the CI3 `MAX+1` IDs and the Oracle identity values would therefore store a duplicate silently.
- The Node backend now uses the identity columns for Probation and Orientation (see `docs/testing/hrms-recruitment-audit.md` §9.1).
- A unique key turns any remaining clash into an immediate `ORA-00001`, instead of hidden duplicate data.

| File | Purpose | Writes? |
|---|---|---|
| `00-duplicate-check.sql` | Duplicate and NULL counts per ID column, ambiguous orientation flag mappings, existing unique indexes | No (SELECT only) |
| `01-migration.sql` | Adds five `UNIQUE` constraints and their indexes | DDL |
| `02-rollback.sql` | Drops those constraints and indexes | DDL |

**Order:**
1. Run `00` on TEST.
2. Run `01` only if every count is 0.
3. Check the CI3 forms that insert into these tables still work.
4. Repeat on the next environment.
5. Once approved, store the applied scripts under `server/database-changes/` with this change ID, as `server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md` §B5 requires.

## TEST results (2026-10-31, ZPADWTEST, read-only)

| ID column | Duplicate IDs | NULL IDs | In `01`? |
|---|---|---|---|
| `XXZP_PAF_PROBATION_HEADER.HEADER_ID` | 0 | 0 | yes |
| `XXZP_PAF_PROBATION_LINES.LINE_ID` | 0 | 0 | yes |
| `XXZP_NEW_HIRETRAINING_SS_HDR_T.HEADER_ID` | 0 | 0 | yes |
| `XXZP_NEW_HIRETRAIN_SS_LINE_T.DEP_LINE_ID` | 0 | 0 | yes |
| `XXZP_EMPLOYMENT_OFFER_HEADER_T.HEADER_ID` | 0 | 0 | yes |
| `XXZPI_PER_REQUISITIONS_ALL.REQUISITION_ID` | **1** (ID 100800, two rows) | 0 | **blocked** |
| `XXZP_INTERVW_ASSESMNT_HEADER_T.HEADER_ID` | **1** (ID 677, two rows) | 0 | **blocked** |
| `XXZP_ALL_ATTACHMENTS.HEADER_ID` | **3,564** (each exactly two rows; 7,201 rows in total) | 0 | **blocked** |
| `XXZP_NHT_MASTER_FLAG.HEADER_ID` | 0 | 0 | already has a PK |
| `XXZP_NHT_MASTER_FLAG.FORM_HEADER_ID` | 0 | 0 | not a key (see below) |
| Orientation header IDs present in both header tables | 0 | — | — |

The production orientation header and line tables and `XXZP_NHT_MASTER_FLAG` already have primary keys.

## Before the three blocked constraints can be added

These need an owner decision on the data. No data change is proposed here.

**Update 2026-10-31:**
- The read-only analysis is in `docs/testing/hrms-recruitment-audit.md` §10.
- The proposed cleanup is `../2026-10-31-hrms-duplicate-cleanup/` (HRMS-DUP-CLEAN-001, not applied). Uncomment the three constraints only after it has been committed and verified.

The original notes follow.
- **Requisition 100800 and interview 677:** two rows share each ID. Compare the two rows of each, read-only, e.g. `SELECT * FROM XXZP.XXZPI_PER_REQUISITIONS_ALL WHERE REQUISITION_ID = 100800`, and decide which row is authoritative.
- **Attachments:** exactly two rows for 3,564 IDs looks like a duplicated data load, not a design. Before deciding, check whether each pair differs in `FORM_HEADER_ID`, `FORM_NAME`, `FILE_NAME` or `UUID`.

The requisition API deletes an attachment by `HEADER_ID` and `FORM_HEADER_ID`, so today a duplicate pair is deleted together.

## Effect on CI3 of the requisition, interview and attachment constraints

The three constraints that are commented out today are `XXZPI_PER_REQUISITIONS_ALL.REQUISITION_ID`, `XXZP_INTERVW_ASSESMNT_HEADER_T.HEADER_ID` and `XXZP_ALL_ATTACHMENTS.HEADER_ID`. They change what CI3 users see.

**Why CI3 is affected:**
- CI3 still picks these IDs with `SELECT MAX(...)` followed by an insert.
- When two CI3 saves race, or a CI3 save lands on a value the identity column has already handed to the Node backend, the second insert **fails with `ORA-00001`**. Today it silently stores a duplicate instead.
- The user gets a CI3 error page and has to save again.
- The Node backend uses the identity columns (audit report §11), so it does not race with itself. It can still collide with a CI3 `MAX`-based ID; it then gets `ORA-00001` and returns an error.

**Apply these three constraints only when one of these holds:**
1. CI3 no longer writes to these tables (the screens are retired or switched to the identity), **or**
2. HR and the CI3 users have been warned that a save can occasionally fail with a database error and must be repeated, and the support desk knows the cause.

**Also:** apply them only after HRMS-DUP-CLEAN-001 has been committed and verified; with duplicates still present, the `ALTER TABLE` fails. The same effect applies to the five constraints already in `01-migration.sql` wherever CI3 still inserts into those tables with `MAX`-based IDs. I could not read the CI3 code (`php-ci3-old-app/` is empty here), so check that before applying them too.

## Related risk (not addressed by this change)

`XXZP_NHT_MASTER_FLAG` maps an orientation `FORM_HEADER_ID` to its table (`SHARED` or `PRODUCTION`). Each header table has its own identity, so the same header ID can later exist in both tables and the mapping becomes ambiguous. This does not happen today. A unique key on `FORM_HEADER_ID` would block such inserts, but it would not fix the design, so it is not proposed here.
