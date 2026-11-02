# HRMS-DUP-CLEAN-001: remove the duplicate HRMS IDs on TEST

**Status:** proposed and **not applied**. This needs DBA review and owner approval (gate G1). CI3 writes to these tables too, so it also needs G4 review.

**Why:** three ID columns hold duplicates, and that blocks their `UNIQUE` constraints in HRMS-ID-UK-001. The findings are in `docs/testing/hrms-recruitment-audit.md` §10.

| ID | What the duplicate is | Action | Scripts |
|---|---|---|---|
| Requisition `100800` | Two identical rows: all 31 non-null columns are equal and 19 are null in both | Delete one copy | `00`–`04` |
| Attachments | 3,564 `HEADER_ID`s with 2 rows each. The two rows agree on `UUID` (null), `FORM_HEADER_ID`, `FORM_NAME` and `FILE_NAME`; `ATTACHED_ON` differs in 3,444 pairs | Keep the row with the earliest `ATTACHED_ON` and delete the other (3,564 rows). Both rows name the same file, so no file is lost | `00`–`04` |
| Interview `677` | Two **different** interviews by two users, created in the same second. One is `Approved` and has `INT_NO`; the other is `InProcess` without it | Keep the `Approved` row on 677. Move the `InProcess` row and its 3 child rows (one per child table, matched by `CREATED_BY`) to a new ID from the table's identity sequence | `10`–`13` |

## Requisition 100800 and attachments

| File | Purpose | Writes? |
|---|---|---|
| `00-precheck.sql` | Confirms the data still matches the findings (expected values in the comments) | No (SELECT only). Run on TEST on 2026-10-31: every value matched |
| `01-backup.sql` | `XXZP_DUPFIX_REQ_BAK` and `XXZP_DUPFIX_ATT_BAK` with every touched row | DDL (CTAS) |
| `02-cleanup.sql` | One PL/SQL block. Every step checks its row count and raises if the count is off. **Does not commit** | DML |
| `03-verify.sql` | Post-checks, run in the same session before `COMMIT` | No |
| `04-rollback.sql` | Restores the backed-up rows after a committed cleanup | DML |

**Order:**
1. Run `00` and stop if any value differs from its comment.
2. Run `01`.
3. Run `02`, then `03` in the same session.
4. `COMMIT` only if every check in `03` matches; otherwise `ROLLBACK`.

## Interview 677 (HR confirms first)

| File | Purpose | Writes? |
|---|---|---|
| `10-interview-677-precheck.sql` | Lists the header and child rows on 677 with **row IDs, status and creator only**, plus the expected counts | No (SELECT only). Checked on TEST: 2 header rows, 9 child rows, 3 owned by the `InProcess` creator (values not printed) |
| `11-interview-677-backup.sql` | `XXZP_DUPFIX_INT_*_BAK` with every row on 677, plus the `XXZP_DUPFIX_INT_MAP` table | DDL (CTAS) |
| `12-interview-677-renumber.sql` | One PL/SQL block, **no commit**. Takes a new ID from the identity sequence, records each moved row by `ROWID` in the map, then moves the `InProcess` header and its 3 children. Ends with same-session checks | DML |
| `13-interview-677-rollback.sql` | Moves the mapped rows back to 677 by their original `ROWID` | DML |

**Order:**
1. Run `10` and send the output to HR. HR confirms that the `Approved` row keeps 677 and that the `InProcess` row and its children (same `CREATED_BY`) are one interview.
2. Run `11`.
3. Run `12` and check its queries in the same session.
4. `COMMIT` only if every check matches; otherwise `ROLLBACK`.
5. Give HR the new ID printed by `12`.

The moved interview keeps an empty `INT_NO`, as it has today.

## After both parts

1. Smoke-test the CI3 and Node screens for requisitions, interviews and attachments.
2. Then add the three blocked constraints of HRMS-ID-UK-001. Read its "Effect on CI3" section first: racing CI3 saves will fail with `ORA-00001`.
3. Drop the `XXZP_DUPFIX_*` tables after sign-off.

## Notes for the DBA

- `12` takes the new interview ID with `NEXTVAL` from the identity sequence of `XXZP_INTERVW_ASSESMNT_HEADER_T.HEADER_ID`, so the identity can never hand that value out again. Confirm on TEST that the schema owner may select `NEXTVAL` from that `ISEQ$$_…` sequence. If not, choose an unused ID above both `MAX(HEADER_ID)` and the sequence's `LAST_NUMBER` and replace the `EXECUTE IMMEDIATE` line with it.
- Only `00` and `10` have been executed (both read-only). `01`–`04` and `11`–`13` have not been run anywhere.
- **Production:** these scripts are written for the TEST findings. Run HRMS-ID-UK-001 `00-duplicate-check.sql`, `00` and `10` on production first. If the figures differ, the scripts need a revision; do not adapt them on the fly.
- The Node backend now creates requisitions, interviews and requisition attachments through the identity columns (audit report §11), so it no longer races. CI3 still uses `MAX`-based IDs until it stops writing to these tables.
