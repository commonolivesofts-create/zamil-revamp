# Employee of the Month Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Employee of the Month Form** (in the UI
> titled *"Employee Reward Nomination Form"*; workflow message type / form code `EMF`) —
> **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup APIs and the **form
> flow** (conditional visibility rules — §7). **Workflow / approval / email logic is explicitly OUT
> of scope** — this module has a workflow (`controllers/Emp_mon_flow.php`, `XXPHP_WORKFLOW`,
> Zmailer approve/reject links, phpmailer sends); everything workflow-related is catalogued in §9
> and must NOT be implemented. **Print is out of scope.** **Attachments do not exist in this
> module at all.**
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
>
> - `controllers/Emp_mon.php` (`class Emp_mon`; methods: `form($department, $id)`, `report()`,
>   `fetchEmployees()`)
> - `models/Emp_mon_model.php` (all SQL: `fetchEmployees`, `getFormDataByID`, `getLinesDataByID`,
>   `report`, `add`, `add_lines`, `updateRequestStatus`, `GetEmpNoById`, `getUserProfile`,
>   `get_column_value`, `format_date_to_oracle`, `validateRemark`, `uuid_v4`)
> - `views/Emp_mon/layout.php` (the whole page: navbar include, employee card, rating table,
>   all JS), `views/Emp_mon/topNav.php` (navbar + Save/Submit buttons),
>   `views/Emp_mon/modal.php` (department chooser), `views/Emp_mon/emp-details.php`
>   (left-hand employee card), `views/Emp_mon/emp-list.php` (employee search modal),
>   `views/Emp_mon/production.php` (4-criterion block), `views/Emp_mon/shared-services.php`
>   (6-criterion block), `views/Emp_mon/report.php` (listing/report page)
> - `controllers/Emp_mon_flow.php` (workflow engine — excluded)
> - Legacy **dead** files, not loaded by the current module: `views/Emp_mon/form.php` (an older
>   standalone card layout — nothing loads it), `Emp_mon_model::fetchEmpNo()` (never called, and
>   contains the typo `UPERVISOR_NAME` — §8.12), `Emp_mon_model::getExpenseFlowRec()` (callers
>   commented out, hardcoded employee numbers — §8.13)
>
> **Database:** Oracle, schema `XXZP`; the two writable tables are
> `XXZP.XX_EMP_RATING_EOM_HEADER` (one row per nomination) and `XXZP.XX_EMP_RATING_EOM_LINES`
> (one row per rated criterion). Lookups come from `XX_DIGI_EMP_MASTER` on the default connection.
> All SQL below uses **bind variables** — never string-concatenate user input (the legacy code
> does; do not copy that habit).
>
> **Related specs (repository root):** `README_personal_status_change_form.md`,
> `README_transfer_request_form.md`, `README_performance_appraisal_form.md`,
> `README_employee_report_form.md`, `README_orientation_training_form.md` — same structure and
> conventions. Do not implement workflow from anywhere.

---

## 1. Data Model

**Two writable tables** for the whole form: a header (the nomination) and its rating lines.
Lookups are read-only.

| #   | Table                                      | Role                                                    |
| --- | ------------------------------------------ | ------------------------------------------------------- |
| 1   | `XXZP.XX_EMP_RATING_EOM_HEADER`            | The nomination (1 row per request)                      |
| 2   | `XXZP.XX_EMP_RATING_EOM_LINES`             | 4 (Production) or 6 (Shared Services) rating lines      |
| 3   | `XX_DIGI_EMP_MASTER`                       | Employee search / picker + requestor profile            |

### 1.1 `XXZP.XX_EMP_RATING_EOM_HEADER`

Union of the form inputs (`production.php` / `shared-services.php`), the employee card
(`emp-details.php`), and the model SQL (`add`, `getFormDataByID`, `report`). Types are inferred —
confirm against the real table before coding.

| Column                  | Type (inferred)  | Legacy form field          | Notes                                                                 |
| ----------------------- | ---------------- | -------------------------- | --------------------------------------------------------------------- |
| `HEADER_ID`             | NUMBER PK        | hidden `HEADER_ID`         | **DB-generated.** The hidden input is `0` on a new form and the real id on edit; the INSERT omits the column entirely (§5.3) |
| `UUID`                  | VARCHAR2(36)     | —                          | v4, generated in PHP (`uuid_v4()`) — read the new id back by it       |
| `REQUEST_NO`            | VARCHAR2         | —                          | `'PROD-0001'` / `'SS-0007'` = dept prefix + `LPAD(header_id,4,'0')`, written by a second UPDATE (§5.3) |
| `DEPT_TYPE`             | VARCHAR2         | hidden `filter_dept`       | `'Production'` \| `'Shared-services'` (`ucfirst()` of the URL segment) — decides the line count and the criteria text |
| `EMPLOYEE_NUMBER`       | VARCHAR2/NUMBER  | `EMPLOYEE_NUMBER`          | readonly on screen; filled by the employee picker modal               |
| `EMPLOYEE_NAME`         | VARCHAR2         | `EMPLOYEE_NAME`            | readonly; from `XX_DIGI_EMP_MASTER.FULL_NAME`                         |
| `EMPLOYEE_EMAIL`        | VARCHAR2         | `EMPLOYEE_EMAIL`           | readonly; from `EMAIL_ADDRESS`                                        |
| `EMPLOYEE_DEPARTMENT`   | VARCHAR2         | `EMPLOYEE_DEPARTMENT`      | readonly; from `DEPARTMENT`                                          |
| `EMPLOYEE_POSITION`     | VARCHAR2         | `EMPLOYEE_POSITION`        | readonly; from `POSITION_NAME`                                       |
| `ACTIVITY_DATE`         | DATE             | `ACTIVITY_DATE` (date)     | **required**; labelled *"Effective Date"*; defaults to today; stored via `TO_DATE`/`DD-MON-YYYY` (§5.4) |
| `OVERALL_RATING`        | VARCHAR2(2)      | `OVERALL_RATING` (select)  | **required**; one of `A` \| `AS` \| `BS` \| `CS` — same scale as the lines |
| `REMARK`                | VARCHAR2         | `REMARK` (input)           | **required** by the form; **not** length-checked server-side (§8.8)  |
| `CREATED_BY`            | NUMBER           | —                          | audit = authenticated user id (session `FormsSession`/`req.auth`)     |
| `CREATED_BY_EMP_NUM`    | VARCHAR2/NUMBER  | —                          | the requestor's `EMPLOYEE_NUMBER`, resolved from `CREATED_BY`; only used by the workflow to find the direct manager (§9) |
| `CREATED_AT`            | DATE             | —                          | **date only, no time** (`format_date_to_oracle(date('Y-m-d'))`) — see §8.6 |
| `UPDATED_BY`            | NUMBER           | —                          | written on **update only** — never on insert (asymmetric audit)       |
| `UPDATED_AT`            | DATE             | —                          | written on update only, also **date-only** (§8.6)                     |
| `STATUS`                | VARCHAR2         | —                          | **server-owned**; `'DRAFT'` on insert; workflow writes `INPROCESS` / `APPROVED` / `REJECTED`; an edit of an approved row writes `'DRAFT'` back (§5.6) |

**There is no month/period column.** The only date is `ACTIVITY_DATE`; "Employee of the Month" is
not identifiable by month from the data model, and nothing prevents two nominations of the same
employee in the same month. This is an open decision, not a bug to silently invent around (§5.7,
decision 1).

### 1.2 `XXZP.XX_EMP_RATING_EOM_LINES`

| Column         | Type (inferred) | Legacy source                     | Notes                                                              |
| -------------- | --------------- | --------------------------------- | ------------------------------------------------------------------ |
| `HEADER_ID`    | NUMBER FK       | hidden `HEADER_ID`                | FK to the header; **no constraint declared** in the legacy DDL path |
| `LINE_NUMBER`  | NUMBER          | loop counter                      | **0-based** (`0..3` Production, `0..5` Shared Services) — the DELETE/INSERT loop starts at 0, NOT 1. Ordering in queries is `ORDER BY LINE_NUMBER` |
| `RATING`       | VARCHAR2(2)     | `LINE_RATING_{n}` (select)        | `A` \| `AS` \| `BS` \| `CS` (see the scale in §6.3)                |
| `REMARK`       | VARCHAR2(500)   | `LINE_REMARK_{n}` (text input)    | labelled *"…- Evidence"*; truncated **silently** to 500 chars server-side (`validateRemark`) |

**The criterion text is NOT stored.** Line `0..3` mean *different things* in the two departments
(§6.3). Only `LINE_NUMBER` + `RATING` + `REMARK` are persisted; the labels are rendered from the
department view (`production.php` / `shared-services.php`). The new system must reproduce the
labels in code (or a config table) — see §6.3.

### 1.3 How the two tables are written

Every save is **delete-all-lines-then-reinsert** (`add_lines()`): the legacy code deletes all lines
for the header and re-inserts them in a `for` loop, **with no transaction** (§8.2). The new API
must do the same replacement **inside one transaction**.

---

## 2. API Surface

Base path: `/api/v1/hr/employee-of-the-month`
Auth: session (`authenticate`); `created_by` from `req.auth` — never the body.

| Method   | Endpoint                                        | Permission Code                       | Purpose                                                     |
| -------- | ----------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| `POST`   | `/api/v1/hr/employee-of-the-month`              | `HR.EMPLOYEE_OF_THE_MONTH.CREATE`     | **Insert** one nomination + its lines (server owns id/uuid/requestNo/status/audit) |
| `GET`    | `/api/v1/hr/employee-of-the-month/:headerId`    | `HR.EMPLOYEE_OF_THE_MONTH.VIEW`       | **Read** one nomination (header + ordered lines)            |
| `PUT`    | `/api/v1/hr/employee-of-the-month/:headerId`    | `HR.EMPLOYEE_OF_THE_MONTH.UPDATE`     | **Update** one nomination (replaces all lines — §5.5)       |
| `DELETE` | `/api/v1/hr/employee-of-the-month/:headerId`    | `HR.EMPLOYEE_OF_THE_MONTH.DELETE`     | **Delete** header + lines (hard delete; legacy has none — §4.2) |
| `GET`    | `/api/v1/hr/employee-of-the-month`              | `HR.EMPLOYEE_OF_THE_MONTH.VIEW`       | **Listing with filters** + pagination (§3)                  |
| `GET`    | `.../lookups/employees`                         | `HR.EMPLOYEE_OF_THE_MONTH.VIEW`       | employee search for the picker modal (§6.1)                 |
| `GET`    | `.../lookups/requestor`                         | `HR.EMPLOYEE_OF_THE_MONTH.VIEW`       | session user's name / email / employee number (§6.2)         |
| `GET`    | `.../lookups/criteria?department=production`    | `HR.EMPLOYEE_OF_THE_MONTH.VIEW`       | the criterion labels + rating scale for a department (§6.3)  |

**Route order:** register `/lookups/...` routes **before** `/:headerId`.

**Universal responses**

```jsonc
{ "success": true, "data": { ... } }                                       // 200 / 201
{ "success": false, "message": "Nomination not found" }                     // 404
{ "success": false, "message": "Validation failed", "errors": [ ... ] }     // 400
{ "success": false, "message": "Cannot update nomination while it is In Process" } // 409
```

---

## 3. `GET /api/v1/hr/employee-of-the-month` — Listing with filters

The legacy report (`report.php` + `Emp_mon_model::report()`) selects **every row** (no scope, no
filters, no pagination) and lets DataTables page/search client-side. A row click opens
`Emp_mon/form/{dept}/{headerId}`.

### 3.1 Scoping — the legacy module has NONE (open decision)

`report()` is an unfiltered `SELECT` with `ORDER BY CREATED_AT DESC` and `Emp_mon::report()` has
**no session check at all**, so the list is readable by anyone who can reach the URL. Every other
module in this repo has an HR-tag rule; this one does not.

Recommended: apply the same rule as the sibling modules (`XX_DIGI_LOOKUP_VALUES.LOOKUP_TYPE =
'XXZP_HR'` → see all rows, otherwise `CREATED_BY = session user`). **Do not assume it** — it is
decision 2 in §5.7.

### 3.2 Filters (query parameters)

Legacy has no server-side filtering; these are the columns the report shows and therefore what the
new listing should filter on.

| Param          | Type            | Matches                                                       | Legacy source                |
| -------------- | --------------- | ------------------------------------------------------------- | ---------------------------- |
| `search`       | string          | `REQUEST_NO`, `EMPLOYEE_NUMBER`, `EMPLOYEE_NAME`, `EMPLOYEE_POSITION`, `EMPLOYEE_DEPARTMENT` (case-insensitive `LIKE`) | DataTables global search |
| `status`       | enum            | `STATUS` — `DRAFT` \| `INPROCESS` \| `APPROVED` \| `REJECTED` | Status column                |
| `department`   | enum            | `DEPT_TYPE` — `production` \| `shared-services` (map to stored casing) | Department column   |
| `employeeNumber` | string        | `EMPLOYEE_NUMBER` (exact)                                     | Emp No column                |
| `requestNo`    | string          | `REQUEST_NO` (exact)                                          | Request No column            |
| `date_from`    | `YYYY-MM-DD`    | `ACTIVITY_DATE >= date_from` (inclusive)                      | Activity Date column         |
| `date_to`      | `YYYY-MM-DD`    | `ACTIVITY_DATE <= date_to` (inclusive)                        | Activity Date column         |
| `page`         | number ≥ 1      | default 1                                                     | DataTables paging            |
| `pageSize`     | number 1–100    | default 25                                                    | `pageLength: 25`             |
| `sort`         | enum            | `headerId` \| `requestNo` \| `employeeName` \| `activityDate` \| `status` \| `createdAt` | click-to-sort headers |
| `order`        | `asc` \| `desc` | default `desc` (legacy `ORDER BY h.CREATED_AT DESC`)          |                              |

### 3.3 Listing SQL (bind variables)

`CREATED_AT` is date-only in the legacy data, so ties are common — always add `HEADER_ID` as the
final tiebreaker so paging is stable.

```sql
SELECT h.HEADER_ID,
       h.REQUEST_NO,
       h.DEPT_TYPE,
       h.EMPLOYEE_NUMBER,
       h.EMPLOYEE_NAME,
       h.EMPLOYEE_POSITION,
       h.EMPLOYEE_DEPARTMENT,
       h.ACTIVITY_DATE,
       h.OVERALL_RATING,
       h.REMARK,
       h.STATUS,
       h.CREATED_AT,
       h.CREATED_BY,
       (SELECT EM.FULL_NAME
          FROM XX_DIGI_EMP_MASTER EM
         WHERE EM.USER_ID = h.CREATED_BY
           AND ROWNUM = 1) AS REQUESTOR,
       (SELECT COUNT(*) FROM XXZP.XX_EMP_RATING_EOM_LINES L
         WHERE L.HEADER_ID = h.HEADER_ID AND L.RATING = 'A')  AS RATING_A_COUNT,
       (SELECT COUNT(*) FROM XXZP.XX_EMP_RATING_EOM_LINES L
         WHERE L.HEADER_ID = h.HEADER_ID AND L.RATING = 'AS') AS RATING_AS_COUNT,
       (SELECT COUNT(*) FROM XXZP.XX_EMP_RATING_EOM_LINES L
         WHERE L.HEADER_ID = h.HEADER_ID AND L.RATING = 'BS') AS RATING_BS_COUNT,
       (SELECT COUNT(*) FROM XXZP.XX_EMP_RATING_EOM_LINES L
         WHERE L.HEADER_ID = h.HEADER_ID AND L.RATING = 'CS') AS RATING_CS_COUNT
  FROM XXZP.XX_EMP_RATING_EOM_HEADER h
 WHERE 1 = 1
   /* optional scope predicate — §3.1 */
   AND (:status       IS NULL OR UPPER(h.STATUS) = :status)
   AND (:deptType     IS NULL OR h.DEPT_TYPE = :deptType)
   AND (:empNo        IS NULL OR h.EMPLOYEE_NUMBER = :empNo)
   AND (:requestNo    IS NULL OR h.REQUEST_NO = :requestNo)
   AND (:dateFrom     IS NULL OR h.ACTIVITY_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
   AND (:dateTo       IS NULL OR h.ACTIVITY_DATE <= TO_DATE(:dateTo, 'YYYY-MM-DD'))
   AND (:search       IS NULL OR (
          UPPER(h.REQUEST_NO)           LIKE :search
       OR UPPER(h.EMPLOYEE_NAME)       LIKE :search
       OR UPPER(h.EMPLOYEE_POSITION)   LIKE :search
       OR UPPER(h.EMPLOYEE_DEPARTMENT) LIKE :search
       OR TO_CHAR(h.EMPLOYEE_NUMBER)   LIKE :search))
 ORDER BY h.CREATED_AT DESC, h.HEADER_ID DESC
 OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```

Bind `:search` as `'%' || UPPER(:search) || '%'` computed in Node on the raw value (never
concatenated into the SQL string).

Count query: the same `FROM`/`WHERE` without the four rating subqueries and without the ORDER BY,
as `SELECT COUNT(*)`.

### 3.4 Response shape

```jsonc
{
  "success": true,
  "data": [
    {
      "headerId": 41,
      "requestNo": "PROD-0041",
      "department": "Production",
      "employeeNumber": "1190",
      "employeeName": "AL SULAIM, BADER",
      "employeePosition": "Machine Operator",
      "employeeDepartment": "Production",
      "activityDate": "2026-09-30",
      "overallRating": "AS",
      "remark": "Consistent output and zero safety incidents.",
      "ratings": { "A": 1, "AS": 2, "BS": 0, "CS": 0 },
      "status": "INPROCESS",
      "requestor": "AL SULAIM, BADER",
      "createdAt": "2026-10-01"
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 12, "totalPages": 1 }
}
```

**`PENDING_AT` / "Approved By" is deliberately absent** — the legacy report reads it from
`XXPHP_WORKFLOW`, which is out of scope (§9). Return nothing rather than a placeholder field.

---

## 4. Read and Delete

### 4.1 Read — `GET /api/v1/hr/employee-of-the-month/:headerId`

`getFormDataByID()` + `getLinesDataByID()` (`ORDER BY LINE_NUMBER`), returned as one object. The
lines array **must** include every expected index for the department so the React screen can render
an empty select for a criterion that was never saved (legacy relies on `isset()` and renders blank).

```jsonc
{
  "success": true,
  "data": {
    "headerId": 41,
    "uuid": "6f1c0e2a-9d45-4a53-9bd0-2f0c8f0f0a11",
    "requestNo": "PROD-0041",
    "department": "Production",
    "employeeNumber": "1190",
    "employeeName": "AL SULAIM, BADER",
    "employeeEmail": "bader.alsulaim@zamilplastic.com",
    "employeePosition": "Machine Operator",
    "employeeDepartment": "Production",
    "activityDate": "2026-09-30",
    "overallRating": "AS",
    "remark": "Consistent output and zero safety incidents.",
    "status": "DRAFT",
    "createdBy": "300000004800434",
    "createdByEmpNum": "1190",
    "createdAt": "2026-10-01",
    "updatedBy": null,
    "lines": [
      { "lineNumber": 0, "criterion": "Adherence to Core Values", "rating": "A",  "remark": "…" },
      { "lineNumber": 1, "criterion": "Demonstrates Excellence in Production", "rating": "AS", "remark": "…" },
      { "lineNumber": 2, "criterion": "Demonstrate Excellence in Quality - Production", "rating": "BS", "remark": "…" },
      { "lineNumber": 3, "criterion": "Demonstrate Excellence in Overall Work Performance", "rating": "CS", "remark": "…" }
    ]
  }
}
```

`criterion` is derived from `LINE_NUMBER` + `department` (§6.3) — it is not a column.

Unknown id → `404`. A non-numeric id (`:headerId = 'abc'`) must be rejected **before** it reaches
SQL (legacy interpolates it; §8.1).

### 4.2 Delete — `DELETE /api/v1/hr/employee-of-the-month/:headerId`

**Legacy has no delete at all** — neither controller nor model exposes one, and the report has no
delete button. Since the revamp's CRUD list includes it, implement a hard delete of the header
**and its lines in the same transaction**:

```sql
DELETE FROM XXZP.XX_EMP_RATING_EOM_LINES  WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XX_EMP_RATING_EOM_HEADER WHERE HEADER_ID = :headerId;
```

Return `404` when the header delete affects 0 rows. **No status guard exists in legacy**, so the
guard is decision 3 in §5.7 (recommended default: only `DRAFT` and `REJECTED` are deletable;
`INPROCESS`/`APPROVED` → `409`).

---

## 5. Write endpoints

### 5.1 Payload (create and update share the shape)

```jsonc
{
  "department": "production",
  "employee": {
    "number": "1190",
    "name": "AL SULAIM, BADER",
    "email": "bader.alsulaim@zamilplastic.com",
    "position": "Machine Operator",
    "departmentName": "Production"
  },
  "activityDate": "2026-09-30",
  "overallRating": "AS",
  "remark": "Consistent output and zero safety incidents.",
  "lines": [
    { "lineNumber": 0, "rating": "A",  "remark": "Evidence text…" },
    { "lineNumber": 1, "rating": "AS", "remark": "Evidence text…" },
    { "lineNumber": 2, "rating": "BS", "remark": "Evidence text…" },
    { "lineNumber": 3, "rating": "CS", "remark": "Evidence text…" }
  ]
}
```

The legacy POST is flat (`EMPLOYEE_NUMBER`, `EMPLOYEE_NAME`, `EMPLOYEE_EMAIL`,
`EMPLOYEE_DEPARTMENT`, `EMPLOYEE_POSITION`, `ACTIVITY_DATE`, `DEPT_TYPE`, `OVERALL_RATING`,
`REMARK`, `HEADER_ID`, `LINE_RATING_0..5`, `LINE_REMARK_0..5`, plus the picker's hidden
`filter_dept`). Either shape works as long as the mapping is documented; the nested shape above is
what the other READMEs use.

**Never accept from the body:** `headerId`, `uuid`, `requestNo`, `status`, `createdBy`,
`createdByEmpNum`, `createdAt`, `updatedBy`.

### 5.2 Validation

Legacy has **zero server-side validation** — it trusts the HTML `required` attributes and
`<select>` options, and only truncates line remarks (§8.8).

| #   | Rule                                                                                             | Error code                    |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| 1   | `department` ∈ `production` \| `shared-services` (the only two the router accepts)                | `INVALID_DEPARTMENT`          |
| 2   | `employee.number`, `employee.name`, `employee.email`, `employee.position`, `employee.departmentName` all non-empty | `REQUIRED_FIELD`    |
| 3   | `employee.number` must exist in `XX_DIGI_EMP_MASTER` with `CURRENT_EMP_FLAG = 'Y'`; the name/email/position/department **must be re-read server-side from the master** and must match what was sent | `INVALID_EMPLOYEE` / `EMPLOYEE_DATA_MISMATCH` |
| 4   | `activityDate` present and a valid `YYYY-MM-DD` date                                              | `INVALID_DATE`                |
| 5   | `overallRating` ∈ `A` \| `AS` \| `BS` \| `CS`                                                    | `INVALID_RATING`              |
| 6   | `remark` non-empty, max length of the real column (legacy doesn't check at all)                   | `REMARK_TOO_LONG`             |
| 7   | `lines` must contain **exactly** the department's line count (4 / 6), each `lineNumber` present **once**, contiguous from `0` | `INVALID_LINE_COUNT` |
| 8   | Each line `rating` ∈ `A` \| `AS` \| `BS` \| `CS`                                                  | `INVALID_RATING`              |
| 9   | Each line `remark` non-empty; **max 500** (legacy silently truncates — reject instead, or truncate and say so) | `LINE_REMARK_TOO_LONG` |
| 10  | `employee.number` ≠ the requestor's own employee number — **not enforced in legacy** (self-nomination is possible); decide in §5.7 decision 5 and document either way | `SELF_NOMINATION_NOT_ALLOWED` |

### 5.3 ID generation and `REQUEST_NO`

Legacy computes `SELECT NVL(MAX(HEADER_ID)+1,1)` and then **never uses it** (dead code with a
classic `MAX+1` race, §8.3). The real flow:

1. INSERT the header **without** `HEADER_ID` → the DB sequence/identity assigns it.
2. Read the new id back **by the generated `UUID`** (`get_column_value('XX_EMP_RATING_EOM_HEADER',
   'HEADER_ID', ['UUID' => $uuid])`). In the new API use `INSERT … RETURNING HEADER_ID INTO :id`
   — no round-trip, no race.
3. `UPDATE … SET REQUEST_NO = :prefix || '-' || LPAD(:headerId, 4, '0')` where `:prefix` is
   `'PROD'` for `production` and `'SS'` for `shared-services`.
4. INSERT the lines.

**`REQUEST_NO` is not a unique key** — it is derived from `HEADER_ID`, so it is unique in practice,
but nothing in the schema enforces it. Note the prefix collision hazard: the dept is encoded twice
(`DEPT_TYPE = 'Shared-services'` but `REQUEST_NO = 'SS-…'`) and there is no separate request-number
sequence.

### 5.4 SQL — create

```sql
INSERT INTO XXZP.XX_EMP_RATING_EOM_HEADER
  (UUID,
   EMPLOYEE_NUMBER, EMPLOYEE_NAME, EMPLOYEE_EMAIL,
   EMPLOYEE_POSITION, EMPLOYEE_DEPARTMENT,
   ACTIVITY_DATE, DEPT_TYPE, OVERALL_RATING, REMARK,
   CREATED_BY, CREATED_BY_EMP_NUM, CREATED_AT, STATUS)
VALUES
  (:uuid,
   :empNo, :empName, :empEmail,
   :empPosition, :empDept,
   TO_DATE(:activityDate, 'YYYY-MM-DD'), :deptType, :overallRating, :remark,
   :createdBy, :createdByEmpNum, SYSDATE, 'DRAFT')
RETURNING HEADER_ID INTO :headerId
```

```sql
UPDATE XXZP.XX_EMP_RATING_EOM_HEADER
   SET REQUEST_NO = :prefix || '-' || LPAD(:headerId, 4, '0')
 WHERE HEADER_ID = :headerId
```

```sql
INSERT INTO XXZP.XX_EMP_RATING_EOM_LINES (HEADER_ID, LINE_NUMBER, RATING, REMARK)
VALUES (:headerId, :lineNumber, :rating, :remark)
```

`CREATED_AT`: legacy writes a **date-only** value (`format_date_to_oracle(date('Y-m-d'))`). Write
`SYSDATE` instead so the listing sort is meaningful, and expose it as `createdAt` with time in the
API (display-only change; §8.6).

`STATUS` is `'DRAFT'` — uppercased, unlike the sibling modules that store `'Draft'`. Pick one
canonical casing for the revamp (`DRAFT` recommended) and normalise on read.

### 5.5 SQL — update (replaces all lines)

```sql
UPDATE XXZP.XX_EMP_RATING_EOM_HEADER
   SET EMPLOYEE_NUMBER      = :empNo,
       EMPLOYEE_NAME        = :empName,
       EMPLOYEE_EMAIL       = :empEmail,
       EMPLOYEE_POSITION    = :empPosition,
       EMPLOYEE_DEPARTMENT  = :empDept,
       ACTIVITY_DATE        = TO_DATE(:activityDate, 'YYYY-MM-DD'),
       OVERALL_RATING       = :overallRating,
       REMARK               = :remark,
       UPDATED_BY           = :updatedBy,
       UPDATED_AT           = SYSDATE,
       STATUS               = :status          -- only when the guard in §5.6 requires a reset
 WHERE HEADER_ID = :headerId
```

```sql
DELETE FROM XXZP.XX_EMP_RATING_EOM_LINES WHERE HEADER_ID = :headerId;
-- then the same line INSERT as §5.4, repeated for each submitted line
```

`DEPT_TYPE` is **not** updatable (the router redirects any request whose URL department differs
from the stored `DEPT_TYPE`; a different department means different criterion text and a different
line count — §7.4). If a department change is ever needed, it must be a deliberate "recreate with
the other template" operation, not an UPDATE.

**Wrap the DELETE + INSERTs + UPDATE in one transaction.** Legacy does not, and deletes the lines
*before* it knows whether the insert will succeed (§8.2).

### 5.6 Update guard — and what legacy does with the status

| Stored `STATUS` (uppercased) | Legacy behaviour on save                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `DRAFT`                      | update allowed, status untouched                                                         |
| `REJECTED`                   | update allowed, status stays `'REJECTED'` (never returns to Draft — inconsistent)         |
| `INPROCESS`                  | **blocked** — the model `echo 'inprocess'` and returns; the page shows an alert and reloads |
| `APPROVED`                   | update allowed, and the model **forces `STATUS = 'DRAFT'`**; the browser first asks *"This request is already APPROVED, Updating data will also make Request Status to DRAFT. Would you like to update request Data?"* |

Reproduce the `409` for `INPROCESS` with the legacy wording. Whether `APPROVED` may be edited at all
(and silently un-approved) is **decision 4** in §5.7 — the current behaviour is a data-integrity
risk, and the reset is exactly the kind of state change the server should own explicitly.

An unknown `:headerId` on `PUT` → `404`. **Legacy instead treats it as a create** (`$exist == null`
falls into the insert branch), which can silently mint a new nomination (§8.4).

### 5.7 Open decisions (do not decide these yourself)

1. **Period (month/year).** The table has no period column, so "Employee of the Month for October
   2026" cannot be selected or reported, duplicates per employee+month are possible, and
   `ACTIVITY_DATE` is the only anchor. Options: (a) add `PERIOD_MONTH`/`PERIOD_YEAR` and validate
   one nomination per employee+period; (b) derive the period from `ACTIVITY_DATE` and only add a
   computed filter/response field; (c) leave as-is and document that the period is implicit. **Needs
   a DBA answer.**
2. **Listing scope.** Legacy is unscoped and unauthenticated (§3.1). Apply the HR-tag rule of the
   sibling modules, restrict to HR only, or keep it open?
3. **Delete guard.** Legacy has no delete. Allow delete only for `DRAFT`/`REJECTED` (recommended),
   or for any status?
4. **Editing an `APPROVED` nomination.** Keep the legacy "edit resets to `DRAFT`" behaviour, block
   with `409`, or allow the edit without touching the status?
5. **Self-nomination.** Legacy permits nominating yourself. Enforce "nominator ≠ nominee", or allow?
   (Also decide whether the letter of the form — *Employee Reward Nomination* — implies an HR-only
   create permission.)

---

## 6. Lookup APIs

### 6.1 `GET /api/v1/hr/employee-of-the-month/lookups/employees`

Legacy: `Emp_mon/fetchEmployees` — the picker modal (`emp-list.php`) POSTs JSON
`{ dept, emp_no, emp_name, emp_email }` to it and renders whatever comes back. It is called from an
**unauthenticated** controller method (§8.5), passes the raw body through `xss_clean`, and
string-concatenates every filter into the SQL (§8.1).

Base query:

```sql
SELECT PERSON_ID,
       EMPLOYEE_NUMBER,
       FULL_NAME,
       EMAIL_ADDRESS,
       POSITION_NAME AS POSITION,
       DEPARTMENT    AS DEPT,
       'Zamil Plastic Industries Ltd' AS COMPANY_NAME
  FROM XX_DIGI_EMP_MASTER
 WHERE CURRENT_EMP_FLAG = 'Y'
```

Request (query string, all optional):

| Param    | Matches                                                     |
| -------- | ----------------------------------------------------------- |
| `empNo`  | `EMPLOYEE_NUMBER LIKE '%…%'`                                |
| `name`   | `UPPER(FULL_NAME) LIKE '%…%'` (legacy uppercases the input) |
| `email`  | `EMAIL_ADDRESS LIKE '%…%'`                                  |
| `dept`   | **legacy ignores this** — see below                         |
| `limit`  | default 50, max 100 (legacy returns every match, no limit)  |

Two legacy facts the new API must handle deliberately:

- **`dept` is accepted and discarded.** The modal is opened from the Production or Shared-Services
  screen and sends `filter_dept`, but `fetchEmployees()` never uses it — so the Production screen
  lets you nominate a Shared-Services employee. Decision 6 in §5.7? No — this one is a *bug*, not a
  business decision: either filter by the department module mapping
  (`XX_DIGI_DEPT_MAPPING.DEPARTMENT_MODULE`) or drop the parameter. Do not silently keep sending an
  ignored filter.
- **`COMPANY_NAME` is a hardcoded literal** — not a column. If the API returns it, it must be a
  constant too (or omitted).

Response items: `employeeNumber`, `fullName`, `email`, `position`, `department` (the legacy field is
named `DEPT` and the UI labels it *"Employee Section"*), `personId`. No matches → `200` with `[]`
(the UI prints *"Employee Details Not Found"*, §7.3).

### 6.2 `GET /api/v1/hr/employee-of-the-month/lookups/requestor`

Legacy: `GetEmpNoById($user_id)` — `EMPLOYEE_NUMBER` for the session user, used to stamp
`CREATED_BY_EMP_NUM`:

```sql
SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS
  FROM XX_DIGI_EMP_MASTER
 WHERE USER_ID = :userId
   AND USER_ID <> 0
   AND ROWNUM = 1
```

Returns `{ employeeNumber, fullName, email }` or `404` when the session user has no master row
(legacy returns `0`, which then lands in `CREATED_BY_EMP_NUM` — §8.9).

### 6.3 `GET /api/v1/hr/employee-of-the-month/lookups/criteria?department=production`

The criterion labels live only in the two view files. They must move into the API/UI config,
because **the same `LINE_NUMBER` means different things per department**:

| Dept              | `lineNumber` | Criterion label (legacy verbatim)                    | Rating field      | Remark field              |
| ----------------- | ------------ | ---------------------------------------------------- | ----------------- | ------------------------- |
| `production`      | 0            | Adherence to Core Values                             | `LINE_RATING_0`   | `LINE_REMARK_0` (…- Evidence) |
| `production`      | 1            | Demonstrates Excellence in Production                | `LINE_RATING_1`   | `LINE_REMARK_1`           |
| `production`      | 2            | Demonstrate Excellence in Quality - Production       | `LINE_RATING_2`   | `LINE_REMARK_2` (…- Evidence) |
| `production`      | 3            | Demonstrate Excellence in Overall Work Performance   | `LINE_RATING_3`   | `LINE_REMARK_3` (…-Evidence) |
| `shared-services` | 0            | Adherence to Core Values                             | `LINE_RATING_0`   | `LINE_REMARK_0` (…- Evidence) |
| `shared-services` | 1            | Demonstrate Excellence in Cost Managemnet *(sic)*    | `LINE_RATING_1`   | `LINE_REMARK_1`           |
| `shared-services` | 2            | Demonstrate Excellence in Dealing with Internal and External Customers | `LINE_RATING_2` | `LINE_REMARK_2` |
| `shared-services` | 3            | Demonstrate Excellence in Overall Work Performance   | `LINE_RATING_3`   | `LINE_REMARK_3`           |
| `shared-services` | 4            | Innovation                                           | `LINE_RATING_4`   | `LINE_REMARK_4`           |
| `shared-services` | 5            | Process Adherence                                     | `LINE_RATING_5`   | `LINE_REMARK_5`           |

Rating scale (identical for every line and for `OVERALL_RATING`, labelled *"Overall Feedback"*):

| Code | Label              |
| ---- | ------------------ |
| `A`  | At Standard        |
| `AS` | Above Standard     |
| `BS` | Below Standard     |
| `CS` | Close to Standard  |

Fix the `Managemnet` typo only if the business confirms (it is user-visible text today). Note the
scale has **no positive/negative ordering** (`BS`/`CS` are both below `A`) — the report counts them
without weighting, so do not invent a score.

---

## 7. Form flow — conditional behaviour (what the React screen must reproduce)

### 7.1 Entry: the department chooser

`Emp_mon/form` with **no department segment** renders `modal.php` — a card with the Zamil logo,
the title *"Employee Reward Nomination Form"* and exactly **two** choices: **Production** and
**Shared-Service**. There is no list of existing nominations on this screen; the only way into a
record is the report page (§7.8).

The chosen department is part of the **route** (`/form/production/:id` or
`/form/shared-services/:id`), not a form field. Any segment other than those two (including a typo)
silently renders the chooser again — the router never 404s.

### 7.2 New form vs. edit form

| Aspect                | New (`/form/:dept`)                              | Edit (`/form/:dept/:id`)                                  |
| --------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Route segment         | no id                                            | numeric id; a non-numeric id falls back to a blank form   |
| Hidden `HEADER_ID`    | `0`                                              | the real id                                               |
| Request number header | hidden                                           | `Request Number: PROD-0041` + status badge                |
| Employee fields       | empty, populated only via the picker (§7.3)      | prefilled from the header, still `readonly`                |
| Rating selects/inputs | empty, first option `Select`                     | preselected from `LINE_RATING_n` / `LINE_REMARK_n`         |
| `ACTIVITY_DATE`       | today                                            | stored date (rendered `Y-m-d` for the date input)          |
| Department mismatch   | n/a                                              | URL department ≠ stored `DEPT_TYPE` → **redirect** to the stored department |
| Navbar **Submit**     | hidden                                           | shown (§7.7)                                               |

The legacy department redirect compares `strtolower($department)` with
`strtolower($header['DEPT_TYPE'])` — so `/form/shared-services/41` for a Production record bounces to
`/form/production/41`. Keep that behaviour: the criterion template depends on it.

### 7.3 Employee picker (the main conditional)

The left card (`emp-details.php`) shows five **readonly** fields — Employee Number, Name, Email,
Department, Position — and a *"Choose Employee"* link that opens the search modal
(`emp-list.php`).

Flow:

1. Modal opens with three filters: **Employee Number** (digits only — every keystroke is stripped
   of non-numerics by `validateNumericInput`), **Employee Name**, **Employee Email**. A hidden
   `filter_dept` carries the current department to the backend (which ignores it, §6.1).
2. *"View Employees"* → `POST Emp_mon/fetchEmployees` with the JSON body; the list area first shows
   *"Loading Employees List"*.
3. Results render as clickable cards showing Employee Number / Position / Name / Email / Section.
   Empty result → *"Employee Details Not Found"* + *"Apply filter/Search Employee with Number, Name
   or Email Address"*.
4. Clicking a card copies the five values into the readonly fields, clears the three filters,
   empties the list and closes the modal by **programmatically clicking `.btn-close`**.

Reimplementation note: the legacy click handler scrapes `textContent` of `td` **indices 1, 3, 5, 7,
9** from the rendered table. That is not a contract — carry the employee object in the row's data
attribute instead. Also, the picker does **not** clear a previously chosen employee when the search
returns nothing, so stale values can be saved; the new UI should clear on open or on failed search.

### 7.4 Criterion block per department

The rating table is `include`d by name: `include_once "$selected_dept.php"` — i.e.
`production.php` (4 criteria) or `shared-services.php` (6 criteria). Both blocks are the same
pattern repeated: a label cell, a rating `<select>` (`LINE_RATING_n`, required) and an adjacent
evidence `<input type="text">` (`LINE_REMARK_n`, required), then a shared **Overall Feedback**
select (`OVERALL_RATING`) and **Remarks** input (`REMARK`).

Quirks to reproduce or explicitly drop:

- The first criterion of `production.php` has a plain `<option value="">Select</option>`, while
  every other select has **both** `<option selected disabled value="">Select</option>` **and** a
  second empty `<option value="">Select</option>` (a duplicated empty option). One placeholder per
  select in the new UI.
- The first row's select in `production.php` has no `disabled`, so a user *can* pick "Select" as a
  value; the others cannot. The API's `INVALID_RATING` rule (§5.2 rule 5/8) closes this hole.
- The remark labels and the criterion labels disagree within the same block
  (*"Demonstrates Excellence in Production"* vs *"Demonstrate Excellence in Production"*, hyphens
  and missing spaces included). Keep the user-visible strings exactly (except the confirmed typo
  fix) or normalise them all — but not half-way.
- `OVERALL_RATING` is **not derived** from the line ratings in any way; nothing validates agreement
  between the lines and the overall feedback.
- The remark inputs are single-line `<input type="text">`, not textareas.

### 7.5 Editability matrix

| Field                            | New       | Edit `DRAFT` | Edit `REJECTED` | Edit `APPROVED` | Edit `INPROCESS` |
| -------------------------------- | --------- | ------------ | --------------- | --------------- | ---------------- |
| Department (route)               | chosen once | fixed      | fixed           | fixed           | fixed            |
| Employee Number/Name/Email/Dept/Position | readonly, picker only | readonly | readonly | readonly | readonly |
| `ACTIVITY_DATE`                  | editable  | editable     | editable        | editable        | editable (but save is blocked) |
| `LINE_RATING_0..n`               | editable  | editable     | editable        | editable        | editable         |
| `LINE_REMARK_0..n`               | editable  | editable     | editable        | editable        | editable         |
| `OVERALL_RATING`                 | editable  | editable     | editable        | editable        | editable         |
| `REMARK`                         | editable  | editable     | editable        | editable        | editable         |
| Save button                      | shown     | shown        | shown           | shown (confirm, then status → `DRAFT`) | shown, but the server refuses |

Everything stays *visually* editable in `INPROCESS`; the block is server-side only. The new UI
should disable the fields (or the Save button) in `INPROCESS` instead of letting the user type and
then failing.

### 7.6 Auto-computed / prefilled values

| Value             | Rule                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `ACTIVITY_DATE`   | defaults to **today** on a new form; on edit, the stored date (legacy passes it through `date('Y-m-d', strtotime(…))` for the `<input type="date">`) |
| `REQUEST_NO`      | server-generated, `PROD-####` / `SS-####` — never typed (§5.3)        |
| `STATUS`          | `'DRAFT'` on create; badge colours in §7.7                            |
| `CREATED_BY` / `CREATED_BY_EMP_NUM` | session user + their master employee number (§6.2)   |
| Employee card     | *only* from the picker; the five fields are `readonly`, so any value must have come from `XX_DIGI_EMP_MASTER` |
| Rating counts     | not shown on the form at all — computed only in the report (§7.8)     |

### 7.7 Navbar buttons

`topNav.php` renders: brand *"Employee Reward Nomination - Production Section"* (or
*"Shared Services Section"*; empty on the chooser screen), then **Home**, **Request Form**,
**View Report**, then — only when a department is chosen — the action buttons.

| Button   | Legacy condition                                                                 | Actual effect                                                                 |
| -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Save** | rendered whenever a department is chosen (i.e. always on the form, new or edit)    | `<button type="submit">` inside the outer `<form id="submitForm">` → AJAX POST to `Emp_mon/form` |
| **Submit** | `if ($header != null && $lines != null)` then `if (STATUS !== 'APPROVED' \|\| STATUS !== 'INPROCESS')` | the second condition is **always true** (see below), and the first is only true for a saved record (empty arrays `== null`), so **Submit shows on every existing nomination regardless of status**; clicking a closed/in-process one gets the server message *"Request is Inprocess. Cannot Re-initialize Workflow"* / *"Request is Approved. …"* |
| **Print** | **does not exist in the form navbar** (no `window.print()` anywhere in the module; only the report page's DataTables export buttons, §7.8) | —                                        |

The `||` in that status check is a bug: a status can never be both `APPROVED` and `INPROCESS`, so
the guard never hides the button. The new UI must use `!['INPROCESS','APPROVED'].includes(status)`
(§8.10). Also note the JS restores the button label to *"Submit"* after a response, but reads it
from a spinner div written in a different markup style — cosmetic only.

Save-flow messages (must be preserved as user-visible behaviour):

| Server echo                     | UI action                                                          |
| ------------------------------- | ------------------------------------------------------------------ |
| saved URL                       | `alert("Data Saved Successfully")` then navigate to that URL        |
| `'fail'`                        | `alert("Failed to Save Data")`                                      |
| `'inprocess'`                   | `alert("Request is in-process, Data cannot be updated.")` then **reload** |
| (before posting, `APPROVED`)    | `confirm("This request is already APPROVED, Updating data will also make Request Status to DRAFT. Would you like to update request Data?")` — cancelling aborts the post; the status is read from a hidden `<p class="status-container d-none">` holding the **uppercased** status |

The new API should answer with a status code instead of an echoed token; the mapping above is the
behaviour to keep.

### 7.8 Report page behaviour

`Emp_mon/report` → `Emp_mon_model::report()` — **all rows**, `ORDER BY CREATED_AT DESC`, no scope,
no filters. Columns:

| Column                     | Source                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| SR NO                      | row counter                                                          |
| DEPARTMENT                 | `DEPT_TYPE` (`Production` / `Shared-services`)                       |
| REQUEST NO                 | `REQUEST_NO`                                                         |
| EMP NO / EMP NAME / EMP POSITION / EMP DEPT | header columns                                     |
| EMP RATING                 | four counts printed as `A : 1` / `AS : 2` / `BS : 0` / `CS : 0` from `XX_EMP_RATING_EOM_LINES` |
| ACTIVITY DATE              | `ACTIVITY_DATE`                                                      |
| REQUESTED BY               | `CREATED_BY` → `XX_DIGI_EMP_MASTER.USER_ID` → `FULL_NAME` (a correlated subquery inside another subquery) |
| REQUESTED ON               | `CREATED_AT` formatted `d-M-Y`                                       |
| STATUS                     | `display_status()` — lowercased/capitalised, coloured `text-success` for APPROVED/ACCEPTED/COMPLETED, `text-danger` for REJECTED/REJECT/CANCELLED, `text-info` for INPROCESS, otherwise primary |
| PENDING AT / APPROVED BY   | `XXPHP_WORKFLOW` (`MSG_TYPE='EMF'`, `STATUS='Open'`, `TYPE_PARAM IS NULL`) — **out of scope**, blank after approval even in legacy |

Table behaviour: DataTables with `copy`, `csv`, `excel`, `pdf`, `print` buttons and `pageLength: 25`,
**English only** (no Arabic table, unlike the performance-appraisal report). Row click navigates to
`Emp_mon/form/{dept}/{headerId}` where `dept = strtolower(str_replace(" ", "-", DEPT_TYPE))` — the
same string-transform trick as the click handler, and the reason `DEPT_TYPE` casing matters (§8.7).

`Emp_mon/report` has **no session check** (§8.5), and the whole page is rendered with `echo` and no
output escaping (XSS via `EMPLOYEE_NAME` etc.).

### 7.9 Client-side validation summary

Only three mechanisms exist, all HTML-level:

1. `required` on: all five employee fields (readonly but required), `ACTIVITY_DATE`, every
   `LINE_RATING_n`, every `LINE_REMARK_n`, `OVERALL_RATING`, `REMARK`.
2. `<select>` option whitelists for the two rating enums.
3. `validateNumericInput()` on the modal's Employee Number filter (strips non-digits).

There is **no** date-range check, no remark length check, no employee-existence check and no
cross-field check (nominee ≠ nominator, overall vs lines). The server validates nothing (§5.2).

---

## 8. Legacy bugs — do not reproduce

1. **SQL injection everywhere.** `fetchEmployees()` concatenates `emp_no` / `emp_name` / `emp_email`
   into `LIKE '%…%'`; `getFormDataByID()`, `getLinesDataByID()` and `updateRequestStatus()`
   interpolate the id; `getUserProfile()` interpolates the user id. Bind variables only.
2. **No transaction around the line replacement.** `add_lines()` deletes all lines first, then
   inserts in a loop — a failure mid-loop leaves the nomination with missing criteria, and the loop
   returns only the **last** insert's result, so earlier failures are invisible.
3. **`MAX(HEADER_ID)+1` dead code.** `add()` computes the next id and never uses it (the INSERT lets
   the DB assign one). Keep the `RETURNING` approach of §5.3; delete the `MAX+1` entirely.
4. **Unknown id on save silently creates a record.** When `getFormDataByID($postdata['HEADER_ID'])`
   returns null — including for a bogus id — the code takes the *insert* branch. `PUT` must `404`.
5. **Missing auth.** `report()` and `fetchEmployees()` have no session check (only `form()` does),
   so the data and the employee directory are reachable unauthenticated.
6. **`CREATED_AT` is date-only** (`format_date_to_oracle(date('Y-m-d'))`), so same-day rows tie and
   `ORDER BY CREATED_AT DESC` is unstable. Also `REQUESTED ON` can never show a time.
7. **Department casing is load-bearing.** Stored as `ucfirst($dept)` → `'Production'` /
   `'Shared-services'`, and the report's row-click rebuilds the URL with
   `strtolower(str_replace(" ", "-", …))`. One extra space or capital silently breaks the link. Store
   and compare a canonical enum.
8. **Silent remark truncation.** `validateRemark()` cuts line remarks to 500 chars and the header
   `REMARK` is never checked at all (possible `ORA-12899` on save). Validate and report instead.
9. **`GetEmpNoById()` returns `0`** when the session user has no master row, and `0` is then stored
   in `CREATED_BY_EMP_NUM` — the workflow later looks up the direct manager of employee `0`.
10. **Impossible status guard.** `if ($header['STATUS'] !== 'APPROVED' || $header['STATUS'] !== 'INPROCESS')`
    is always true, so **Submit is never hidden**. Same class of `||`/`&&` mistake appears elsewhere
    in this codebase — use an explicit allow-list.
11. **Status casing is inconsistent.** `'DRAFT'` on insert, `'INPROCESS'` / `'APPROVED'` /
    `'REJECTED'` from the flow, mixed-case comparisons in `add()`, and `'Accepted'` in the flow's
    `exist_arr` even though nothing ever writes it. Normalise to one enum.
12. **Dead code with a typo.** `fetchEmpNo()` is never called and references a non-existent column
    `UPERVISOR_NAME` (missing `S`) — it would raise `ORA-00904` if anyone called it. `views/Emp_mon/form.php`
    is likewise never loaded.
13. **Hardcoded workflow routing.** `getExpenseFlowRec()` pins employee numbers `1190`, `1153`,
    `2387`, `1770`, `2280` and a `'Shared Service'` / `'SALES'` branch; `Emp_mon_flow::submit()`
    special-cases the user **`AlSulaim, Bader`** by name, and `workflow()` hardcodes the approver
    **`AL ESSA, SAAD`** plus the delegation form code `1009` (while `$form_code = 1056` sits unused
    two lines below). Do not port any of it (§9).
14. **Nested `<form id="submitForm">`** — `layout.php` opens one and `emp-details.php` opens a second
    with the same id inside it. Browsers drop the inner tag; the AJAX `new FormData($('#submitForm'))`
    then silently depends on that. One form, one id.
15. **Employee card scraping.** The picker copies values by reading `textContent` of hardcoded `td`
    indices — any markup change (an extra cell, a wrapper) writes the wrong field. Bind to the
    employee object.
16. **`filter_dept` is collected and ignored** (§6.1) — the department screen does not filter the
    employee list.
17. **Unescaped output** throughout the report and the picker cards (names, positions, remarks), and
    `xss_clean` applied to a JSON body before `json_decode` (which mangles legitimate data).
18. **Secrets and credentials in source.** `Emp_mon_flow.php` contains the SMTP host, mailbox and
    password in plaintext, twice. No credential belongs in a controller (out of scope, but note it).
19. **Route/base-URL inconsistency** — `Emp_mon/form` is posted without the `index.php` segment in
    `layout.php` while `Emp_mon/report`'s click handler includes it. Both work only because of the
    current `base_url` config.

---

## 9. Out of scope (do not implement)

- **Workflow / approval / email.** `controllers/Emp_mon_flow.php` (`submit()`, `workflow()`),
  `Workflow_model` (`delegatedUser`, `callXXPHP_WORKFLOW`, `checkRequestOpen`,
  `notification_details`, `all_notifications_under_request`, `check_RFI_mode`), `XXPHP_WORKFLOW`,
  the `EMF` message type, Zmailer approve / reject / forward / reassign / RFI links, phpmailer SMTP
  sends and both email bodies.
- **Status transitions.** Only `'DRAFT'` is written by the CRUD API (plus the documented
  `APPROVED → DRAFT` edit reset or its replacement, §5.6). `INPROCESS` / `APPROVED` / `REJECTED`
  belong to the workflow.
- **Report workflow columns** — `PENDING_AT` / "Approved By" (an `XXPHP_WORKFLOW` subquery).
- **Dead routing helpers** — `getExpenseFlowRec()`, the hardcoded `AlSulaim, Bader` branch, the
  hardcoded approvers and SMTP credentials.
- **Print / PDF export** (the report's DataTables export buttons are browser-side only; not
  reproduced server-side).
- **Attachments** — this module has none.
- **Dead files** — `views/Emp_mon/form.php`, `Emp_mon_model::fetchEmpNo()`.
- **Arabic version** — the module is English-only (titles, labels and the report).

---

## 10. Legacy → new endpoint map

| Legacy (PHP)                                                         | New API                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET Emp_mon/form` (department chooser, `modal.php`)                  | UI route only — no API                                                  |
| `GET Emp_mon/form/:department/:id` (`getFormDataByID` + `getLinesDataByID`) | `GET /api/v1/hr/employee-of-the-month/:headerId`                    |
| `POST Emp_mon/form` → `Emp_mon_model::add()` (insert branch)          | `POST /api/v1/hr/employee-of-the-month`                                 |
| `POST Emp_mon/form` → `Emp_mon_model::add()` (update branch, + `INPROCESS` echo guard) | `PUT /api/v1/hr/employee-of-the-month/:headerId`       |
| `add_lines()` (delete + reinsert 4 / 6 lines)                         | inside the POST / PUT transaction (§5.4, §5.5)                          |
| `POST Emp_mon/fetchEmployees`                                         | `GET .../lookups/employees` (§6.1)                                      |
| `GetEmpNoById($user_id)`                                              | `GET .../lookups/requestor` (§6.2)                                      |
| `production.php` / `shared-services.php` criterion labels             | `GET .../lookups/criteria?department=` (§6.3)                           |
| `Emp_mon/report` (`report()`)                                         | `GET /api/v1/hr/employee-of-the-month` (§3)                             |
| `updateRequestStatus()`                                               | — (workflow — §9)                                                       |
| `Emp_mon_flow/submit`, `Emp_mon_flow/workflow`, Zmailer links          | — (workflow — §9)                                                       |
| — (no legacy delete)                                                  | `DELETE /api/v1/hr/employee-of-the-month/:headerId`                     |

---

## 11. Acceptance checklist

- [ ] **E-01** `POST` returns `201` with `headerId`, `uuid` and a generated `requestNo`
      (`PROD-####` / `SS-####`); the body cannot set `headerId`, `uuid`, `requestNo`, `status`,
      `createdBy` or `createdByEmpNum`.
- [ ] **E-02** `POST` with each missing/invalid value in §5.2 → the documented `400` code.
- [ ] **E-03** `POST` with a `lines` array of the wrong length or with a duplicate/gapped
      `lineNumber` → `400 INVALID_LINE_COUNT`; a valid Production payload stores exactly
      `LINE_NUMBER` `0..3`, a Shared-Services payload `0..5` (0-based).
- [ ] **E-04** `POST` writes `STATUS = 'DRAFT'`, `CREATED_BY` from the session, and **no** line
      remark longer than 500 chars (rejected, not silently cut).
- [ ] **E-05** `GET :id` returns header + `lines` ordered by `lineNumber` with `criterion` resolved
      from the department; unknown or non-numeric id → `404` / `400`, never a SQL error.
- [ ] **E-06** `PUT :id` replaces all lines atomically: forcing the third line insert to fail leaves
      the previous lines **and** the header unchanged (transaction test).
- [ ] **E-07** `PUT :id` on an `INPROCESS` nomination → `409` with the legacy wording; on `APPROVED`
      → the agreed §5.6 decision (409 or documented reset), never a silent un-approval.
- [ ] **E-08** `PUT` with an unknown `:headerId` → `404` and **does not create a row**.
- [ ] **E-09** `DELETE :id` removes header **and** lines; a second delete → `404`; the delete guard
      follows decision 3.
- [ ] **E-10** Listing applies §3.2 filters alone and combined, returns `meta.total` from a real
      `COUNT(*)`, is stably ordered (`CREATED_AT DESC, HEADER_ID DESC`), and honours `page` /
      `pageSize`.
- [ ] **E-11** Listing never reads `XXPHP_WORKFLOW`; the response has no `pendingAt`/`approvedBy`.
- [ ] **E-12** Listing scoping follows the §5.7 decision 2 (and the test asserts the chosen rule).
- [ ] **E-13** `lookups/employees` filters by `empNo`/`name`/`email`, returns `200 []` when nothing
      matches, and either applies or drops `dept` per the §6.1 decision — it must not accept and
      ignore it.
- [ ] **E-14** `lookups/criteria?department=production` returns 4 labelled criteria and
      `shared-services` returns 6, each with the 4-value scale; an unknown department → `400`.
- [ ] **E-15** `lookups/requestor` returns the session user's employee number, or `404` (never `0`).
- [ ] **E-16** The frontend reproduces §7.2: new form blank with `ACTIVITY_DATE` = today; edit form
      prefilled and readonly on the five employee fields; a URL department that differs from the
      record redirects to the stored department.
- [ ] **E-17** The frontend reproduces §7.3: picker modal filters, loading/no-data states, and a
      click fills all five readonly fields and closes the modal — no `textContent` index scraping.
- [ ] **E-18** The frontend reproduces §7.7: Save always on the form; **Submit hidden on new forms,
      on `INPROCESS` and on `APPROVED`**; the confirm-before-reset copy for an approved nomination.
- [ ] **E-19** The report screen shows exactly the §7.8 columns, the four rating counts per row, and
      navigates to the right record on row click — with the department casing canonical.
- [ ] **E-20** Every SQL statement uses bind variables — `search` = `%' OR 1=1 --` returns 0 rows;
      unauthenticated calls to every endpoint (including the lookups and the listing) get `401`.
- [ ] **E-21** Every endpoint requires the matching `HR.EMPLOYEE_OF_THE_MONTH.*` permission code
      (UPDATE, never EDIT).
- [ ] **E-22** No hardcoded approvers, employee numbers, SMTP credentials, `MAX+1` ids or echoed
      string tokens (`'fail'` / `'inprocess'`) appear in the new code.

---

## 12. Implementation prompt (copy-ready)

> Copy everything in this block into your agent's task prompt together with this file.
>
> ```
> Implement the backend for the EMPLOYEE OF THE MONTH FORM (UI title "Employee Reward Nomination
> Form", workflow code EMF) in this repository, following README_employee_of_the_month_form.md as
> the authoritative spec. Spec-driven: do not invent behaviour the README does not describe, and do
> not read behaviour from the legacy PHP beyond what it documents.
>
> GOAL
> - CRUD + listing for TWO tables: XXZP.XX_EMP_RATING_EOM_HEADER (+ XXZP.XX_EMP_RATING_EOM_LINES).
> - Endpoints (base /api/v1/hr/employee-of-the-month):
>     POST   /                 create  (HR.EMPLOYEE_OF_THE_MONTH.CREATE)
>     GET    /:headerId        read    (HR.EMPLOYEE_OF_THE_MONTH.VIEW)
>     PUT    /:headerId        update  (HR.EMPLOYEE_OF_THE_MONTH.UPDATE)
>     DELETE /:headerId        delete  (HR.EMPLOYEE_OF_THE_MONTH.DELETE)
>     GET    /                 listing with filters + pagination (VIEW)
>     GET    /lookups/employees | /lookups/requestor | /lookups/criteria?department=
>   Register /lookups/* BEFORE /:headerId. Permission codes use UPDATE, never EDIT.
>
> NON-GOALS (do not build)
> - No workflow/approval/email: no Emp_mon_flow, XXPHP_WORKFLOW, Zmailer, EMF notifications, SMTP,
>   status transitions, or PENDING_AT/approved-by columns. STATUS is server-owned ('DRAFT' on
>   insert) except the documented edit-reset decision.
> - No print/PDF, no attachments, no dead files (views/Emp_mon/form.php, fetchEmpNo), no
>   getExpenseFlowRec, no hardcoded approvers.
>
> DATA RULES
> - Oracle; bind variables everywhere, never string concatenation.
> - HEADER_ID is DB-generated: INSERT ... RETURNING HEADER_ID INTO :id (never MAX+1, never trust a
>   client-sent id). REQUEST_NO = prefix || '-' || LPAD(id,4,'0'), prefix PROD for production and SS
>   for shared-services.
> - Server-owned: HEADER_ID, UUID, REQUEST_NO, STATUS, CREATED_BY, CREATED_BY_EMP_NUM, CREATED_AT,
>   UPDATED_BY. Ignore them in the body.
> - LINE_NUMBER is 0-based: exactly 4 lines for production, 6 for shared-services. DEPT_TYPE is not
>   updatable.
> - Line replacement (DELETE all + INSERT all) must run in ONE transaction with the header update.
> - Dates: accept/return YYYY-MM-DD and bind with TO_DATE(...,'YYYY-MM-DD'); write SYSDATE for
>   CREATED_AT (legacy date-only value is a bug).
> - Re-read the employee's name/email/position/department from XX_DIGI_EMP_MASTER server-side and
>   reject mismatches (INVALID_EMPLOYEE / EMPLOYEE_DATA_MISMATCH).
>
> FORM FLOW (README §7) — the frontend contract
> - Department chooser (production | shared-services) decides the criterion template; the department
>   is part of the route, never a form field, and is immutable after creation.
> - Employee picker: filters empNo (digits) / name / email, loading + no-data states, click fills the
>   five readonly fields. No textContent index scraping.
> - Editability matrix (§7.5), the always-visible Submit bug fixed to hide on INPROCESS/APPROVED
>   (§7.7), the approved-reset confirm copy, and the report columns/counts (§7.8) are frontend rules;
>   the API only supplies data.
>
> RULES
> 1. Read README_employee_of_the_month_form.md fully before coding; its SQL blocks are the reference
>    queries — port them with bind variables.
> 2. Fix, never copy, the legacy bugs in §8 (SQL injection, no transaction, MAX+1, unknown-id
>    create, missing auth, date-only CREATED_AT, department casing, silent truncation, status-casing
>    chaos, always-true status guard, nested forms).
> 3. Validate per §5.2 with the documented error codes; guard updates per §5.6 and deletes per §4.2.
> 4. Filter building per §3.2; response envelope { success, data } per §2; meta.total is a real
>    COUNT(*).
> 5. Before coding, resolve the FIVE OPEN DECISIONS in §5.7 with me: (a) period month/year column or
>    derived period, (b) listing scope rule, (c) delete guard, (d) editing an APPROVED nomination,
>    (e) self-nomination. Do not decide these yourself.
>
> DONE WHEN
> - E-01…E-22 in README §11 are covered by tests that exercise the real endpoints.
> - The project's typecheck/lint/test suite passes with no new suppressions.
> - You report which checks you ran, which failed, and anything you could not verify.
> ```

---

*Generated for the Zamil Plastic HR revamp. Legacy of record: `pmform_codebase` (CodeIgniter) —
`Emp_mon` module. The full specification is README_employee_of_the_month_form.md in the repository
root.*
