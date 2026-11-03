# HR identity mapping: HR check and employee clearance

Branch `fix/hr-identity-mapping`. Date 2026-11-02. All Oracle work was read-only on TEST
(`SET TRANSACTION READ ONLY`, rolled back) and printed counts only.

## 1. Three user IDs

| ID | Where | Used by |
|---|---|---|
| Application user ID | `XX_ZRV_USERS.USER_ID` (session `req.auth.userId`) | New app: RBAC, `CREATED_BY` written by the new app |
| Master user ID | `XX_DIGI_EMP_MASTER.USER_ID` | Legacy `returnRec`; 9 of 12 `XXZP_HR` tags |
| Details user ID | `XX_DIGI_EMP_DETAILS.USER_ID` | Legacy clearance manager columns and `CREATED_BY`; 3 of 12 `XXZP_HR` tags |

For the same employee the master and details user IDs never agree on TEST (0 equal, 71 differ).
None of them equals the application user ID. All 5 application accounts have both a master and a
details user ID.

## 2. HR check fails closed (step 2)

`TAG` is compared with a scalar subquery that returns a value only when the application user maps,
through `XX_ZRV_USERS.EMPLOYEE_NUMBER`, to exactly one non-blank master user ID on current rows
(`HAVING COUNT(DISTINCT E.USER_ID) = 1 AND COUNT(*) = COUNT(E.USER_ID)`). Otherwise the
subquery returns no row, and `TAG = NULL` is never true.

Each module's exact SQL was run on Oracle with synthetic rows only (a `WITH` clause shadowing the
three tables), for all eight modules:

| Case | Expected | Result |
|---|---|---|
| No employee number | not HR | not HR |
| No old-system user ID | not HR | not HR |
| Two different old-system user IDs | not HR | not HR |
| One old-system user ID plus a blank one | not HR | not HR |
| Unknown application user | not HR | not HR |
| Only a non-current row | not HR | not HR |
| Exactly one old-system user ID (control) | HR | HR |
| Two current rows, same old-system user ID | HR | HR |

Real TEST accounts are unchanged: 3 of 5 are HR, the same as probation's `MEANING` check.
Mocked tests: `server/tests/hr-identity-mapping.test.js`.

**Open (owner, G2):** 3 of the 12 `XXZP_HR` tags hold a details user ID, so the check does not
recognise those 3 HR entries. All 12 rows' `MEANING` is the employee number of the same person
(12 of 12). Options: also accept the details user ID (with the same exactly-one rule), or use
`MEANING` = employee number as probation does.

## 3. Employee clearance manager fields and routing (step 3, no code change)

### What is stored

| Section | Column | Rows | ID set | Master ID | Details ID | Application ID | Resolves to one person (details) |
|---|---|---|---|---|---|---|---|
| Department | `XX_CLEARANCE_EMPLOYEES.EMP_MGR_USERID` | 401 | 170 | 0 | 127 | 0 | 127 |
| Quality | `XX_CLEARANCE_QUALITY.QLTY_MGR_USERID` | 387 | 157 | 0 | 19 | 0 | 19 |
| Warehouse | `XX_CLEARANCE_WH.WH_MGR_USERID` | 386 | 157 | 0 | 157 | 0 | 157 |
| Accounts | `XX_CLEARANCE_ACCOUNTS.ACC_MGR_USERID` | 386 | 157 | 0 | 157 | 0 | 157 |
| Admin | `XX_CLEARANCE_ADMIN.ADMIN_MGR_USERID` | 387 | 157 | 0 | 62 | 0 | 62 |

All columns are `NUMBER`. Header `CREATED_BY` (`VARCHAR2`): 404 rows, 265 details IDs, 0 master,
0 application. The latest header is from 2025; no TEST row was written by the new app.

### What each side writes and compares

- **Legacy writes** the details user ID in every manager column (`getManager`, `getWahoManager`,
  `getAccManager`, `getAdminManager` select `XX_DIGI_EMP_DETAILS.USER_ID`) and the session user ID
  in `CREATED_BY`.
- **Legacy compares** the session user ID with each manager column to decide which section the
  viewer may edit (`Empclearance.php`, view action). `CREATED_BY` shows the session ID is the
  details user ID for clearance; `returnRec` looks it up as a master user ID, which never matches.
- **New code writes** the department manager as the supervisor's *master* user ID
  (`supervisorUserId`), unlike legacy, and the other four from the details user ID (`approvers`,
  only when exactly one approver exists). It writes `CREATED_BY` and the work row as the
  *application* user ID.
- **New code compares** none of the manager columns: section approval routing is not built. The
  values are only returned as `managerUserId`.

### Rows that would route correctly (stored ID set: 798)

| Comparison | Department | Quality | Warehouse | Accounts | Admin | Total |
|---|---|---|---|---|---|---|
| Session application user ID = column | 0 | 0 | 0 | 0 | 0 | 0 |
| Master user ID = column | 0 | 0 | 0 | 0 | 0 | 0 |
| Details user ID = column (legacy data) | 127 | 19 | 157 | 157 | 62 | 522 |
| ...and that person is today's expected approver | 57 | 0 | 157 | 157 | 13 | 384 |

"Expected approver" is the employee's current supervisor (department) or the single
`XX_CLEARANCE_APPR` approver for the section (TEST has 0 for quality, 1 for warehouse, 1 for
accounts, 2 for admin). Rows that resolve but differ were routed to an earlier approver.

## 4. Proposed fix (not implemented)

1. **One stored ID.** Store every manager column as the details user ID, as legacy does: change the
   department manager lookup to `XX_DIGI_EMP_DETAILS.USER_ID`. Legacy rows stay readable and new
   rows stay readable by legacy (G4).
2. **Compare by employee number.** When section routing is built, resolve the session through
   `XX_ZRV_USERS.EMPLOYEE_NUMBER`, resolve the stored ID through `XX_DIGI_EMP_DETAILS` to an
   employee number, and allow the section only when both give exactly one, equal employee number
   (fail closed otherwise). Never compare the application user ID with a manager column.
3. **`CREATED_BY` (owner, G4).** The new app writes the application user ID where legacy wrote the
   details user ID, so legacy cannot attribute new rows and the new app cannot attribute legacy
   rows. Either write the details user ID (and keep the application ID elsewhere), or record the
   mixed meaning and compare by employee number on both sides.
4. **HR tags** as in §2 (open).

## 5. Other observation

The legacy `pmform_codebase` has a controller action that sets the forms session to any user ID
passed in the URL, without authentication. It is legacy-only and was not changed.
