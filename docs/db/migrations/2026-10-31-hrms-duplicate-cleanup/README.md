# HRMS-DUP-CLEAN-001: remove the duplicate HRMS IDs on TEST

**Status:** proposed and **not applied**. This needs DBA review and owner approval (gate G1). CI3 writes to these tables too, so it also needs G4 review.

**Why:** three ID columns hold duplicates, and that blocks their `UNIQUE` constraints in HRMS-ID-UK-001. The findings are in `docs/testing/hrms-recruitment-audit.md` §10.

| ID | What the duplicate is | Action |
|---|---|---|
| Requisition `100800` | Two identical rows: all 31 non-null columns are equal and 19 are null in both | Delete one copy |
| Interview `677` | Two **different** interviews by two users, created in the same second. One is `Approved` and has `INT_NO`; the other is `InProcess` without it | Keep the `Approved` row on 677. Move the `InProcess` row and its 3 child rows (one per child table, matched by `CREATED_BY`) to a new ID from the table's identity sequence |
| Attachments | 3,564 `HEADER_ID`s with 2 rows each. The two rows agree on `UUID` (null), `FORM_HEADER_ID`, `FORM_NAME` and `FILE_NAME`; `ATTACHED_ON` differs in 3,444 pairs | Keep the row with the earliest `ATTACHED_ON` and delete the other (3,564 rows). Both rows name the same file, so no file is lost |

| File | Purpose | Writes? |
|---|---|---|
| `00-precheck.sql` | Confirms the data still matches the findings (expected values in comments) | No (SELECT only). Run on TEST on 2026-10-31: every value matched |
| `01-backup.sql` | `XXZP_DUPFIX_*` backup tables with every touched row, plus the renumbering map | DDL (CTAS) |
| `02-cleanup.sql` | One PL/SQL block. Every step checks its row count and raises if the count is off. **Does not commit** | DML |
| `03-verify.sql` | Post-checks, run in the same session before `COMMIT` | No |
| `04-rollback.sql` | Restores the backed-up rows after a committed cleanup | DML |

**Order:**
1. Run `00` and stop if any value differs from its comment.
2. Run `01`.
3. Run `02`, then `03` in the same session.
4. `COMMIT` only if every check in `03` matches; otherwise `ROLLBACK`.
5. Smoke-test the CI3 and Node screens for requisitions, interviews and attachments.
6. Then uncomment the three blocked constraints in HRMS-ID-UK-001 `01-migration.sql`.
7. Drop the backup tables after sign-off.

**Notes for the DBA:**
- `02` takes the new interview ID with `NEXTVAL` from the identity sequence of `XXZP_INTERVW_ASSESMNT_HEADER_T.HEADER_ID`, so the identity can never hand that value out again. Confirm on TEST that the schema owner may select `NEXTVAL` from that `ISEQ$$_…` sequence. If not, choose an unused ID above both `MAX(HEADER_ID)` and the sequence's `LAST_NUMBER` and replace the `EXECUTE IMMEDIATE` line with it.
- Only `00` was executed. `01`–`04` have not been run anywhere.
- **Production:** these scripts are written for the TEST findings. Run HRMS-ID-UK-001 `00-duplicate-check.sql` and this `00` on production first. If the figures differ, the scripts need a revision; do not adapt them on the fly.
- **Order matters:** new duplicates can appear until the ID generation fixes in the audit report (§10.4) are in place. Apply the constraints straight after the cleanup.
