# Personal Status Change Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Personal Status Change Form** (also
> printed as *PERSONNEL RECORD CHANGE FORM* / *Personnel Status Request Change*; form code `RCF`) —
> **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup (dropdown / auto-fill)
> APIs and the **form flow** (conditional visibility rules — §7). **Workflow / approval / email
> logic is explicitly OUT of scope** — this module has workflow (`controllers/Rec_flow.php`,
> `XXPHP_WORKFLOW`, approver routing); everything workflow-related is catalogued in §9 and must NOT
> be implemented. **Print/PDF is out of scope** (the legacy form only calls `window.print()`).
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
>
> - `controllers/Rec_change.php` (`class Rec_change extends FileUploader`; methods: `index`, `add`, `delete`, `getEmpDetails`, `list`)
> - `models/Rec_change_model.php` (all SQL: `fetchRecord`, `all_records`, `getEmpDetails`, `fetchEmpNo`, `fetchPositions`, `add`, `getFormDataByID`, `updateRequestStatus`, `updateAction`, plus workflow helpers)
> - `views/Rec_change/form.php` (current create/edit form), `views/Rec_change/navbar.php` (action buttons + visibility rules), `views/Rec_change/report.php` (listing page)
> - `views/Rec_change/form_old.php` (dead variant — posts to `trial/add`; do not port)
> - `controllers/Rec_flow.php` (workflow engine — excluded)
>
> **Database:** Oracle, default connection user `XXZP`; the form table is written unqualified as
> `XX_REC_CHANGE` (⇒ `XXZP.XX_REC_CHANGE`); lookup data comes from `XX_DIGI_EMP_MASTER` on the same
> connection. All SQL below uses **bind variables** — never string-concatenate user input (the
> legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_orientation_training_form.md`,
> `README_interview_assessment_form.md`, `README_employee_report_form.md` — same structure and
> conventions. Do not implement workflow from anywhere.

---

## 1. Data Model

**Exactly one writable table** — every CRUD operation targets it (there are no line/detail tables).
Two lookup tables feed the form.

| #   | Table                     | Role                                                          |
| --- | ------------------------- | ------------------------------------------------------------- |
| 1   | `XXZP.XX_REC_CHANGE`      | The request (header = the whole form; 1 row per request)      |
| 2   | `XX_DIGI_EMP_MASTER`      | Lookup + auto-fill source (read-only for this module)         |
| 3   | `XX_DIGI_EMP_MASTER`      | `POSITION_NAME` values for the "Revised Position" datalist     |

### 1.1 `XXZP.XX_REC_CHANGE`

Column set is the union of the form inputs (`views/Rec_change/form.php`) and the model SQL
(`fetchRecord`, `all_records`, `getEmpDetails`). Types are inferred — confirm against the real
table before coding.

| Column                | Type (inferred)  | Legacy form field   | Notes                                                                 |
| --------------------- | ---------------- | ------------------- | --------------------------------------------------------------------- |
| `HEADER_ID`           | NUMBER PK        | hidden `HEADER_ID`  | generated `NVL(MAX(HEADER_ID)+1,1)` — §5.3                            |
| `REF_NO`              | VARCHAR2         | `REF_NO` (readonly) | server-generated `LPAD(id,4,'0') \|\| '-' \|\| SECTION`, e.g. `0142-Production` |
| `FORM_DATE`           | DATE `DD-MON-RR` | `FORM_DATE`         | readonly; defaults to today                                            |
| `ARB_DATE`            | VARCHAR2         | `ARB_DATE`          | Hijri date, auto-filled client-side, user-editable free text           |
| `EFFECTIVE_DATE`      | DATE `DD-MON-RR` | `EFFECTIVE_DATE`    | **required**; when the change takes effect                            |
| `USER_ID`             | NUMBER           | hidden `USER_ID`    | intended as the employee's user id — **never populated** (§8.6)       |
| `EMP_NO`              | NUMBER           | `EMP_NO`            | employee number, datalist-validated (§7.2)                            |
| `EMP_NAME`            | VARCHAR2         | `EMP_NAME`          | readonly, auto-filled                                                  |
| `NATIONALITY`         | VARCHAR2         | `NATIONALITY`       | readonly, auto-filled                                                  |
| `SECTION`             | VARCHAR2         | `SECTION`           | readonly, auto-filled (= `DIVISION` from master)                      |
| `DEPT`                | VARCHAR2         | `DEPT`              | readonly, auto-filled                                                  |
| `START_DATE`          | DATE/string      | `START_DATE`        | readonly, auto-filled (= `JOINING_DATE`)                              |
| `OLD_POSITION`        | VARCHAR2         | `OLD_POSITION`      | current record — readonly                                             |
| `OLD_BASIC_SAL`       | NUMBER           | `OLD_BASIC_SAL`     | readonly                                                              |
| `OLD_HOUSE_ALL`       | NUMBER           | `OLD_HOUSE_ALL`     | readonly                                                              |
| `OLD_TRANS_ALL`       | NUMBER           | `OLD_TRANS_ALL`     | readonly                                                              |
| `OLD_COMMUN_ALL`      | NUMBER           | `OLD_COMMUN_ALL`    | readonly                                                              |
| `OLD_CAR_ALL`         | NUMBER           | `OLD_CAR_ALL`       | readonly                                                              |
| `OLD_OTHER_ALL`       | NUMBER           | `OLD_OTHER_ALL`     | readonly                                                              |
| `OLD_TOTAL`           | NUMBER           | `OLD_TOTAL`         | readonly (from master `TOTAL_SALARY`)                                 |
| `OLD_MARITAL_STATUS`  | VARCHAR2         | `OLD_MARITAL_STATUS`| **editable although it sits in the read-only block** (§8.8)           |
| `OLD_GRADE`           | VARCHAR2         | —                   | column exists, **no input on the current form** (grade/level are labels only) |
| `OLD_LEVEL`           | VARCHAR2         | —                   | same as above                                                         |
| `NEW_POSITION`        | VARCHAR2         | `NEW_POSITION`      | **required**, datalist from `fetchPositions()`                        |
| `NEW_BASIC_SAL`       | NUMBER           | `NEW_BASIC_SAL`     | **required**, numeric, `maxlength=7`                                  |
| `NEW_HOUSE_ALL`       | NUMBER           | `NEW_HOUSE_ALL`     | **required**, numeric, `maxlength=7`                                  |
| `NEW_TRANS_ALL`       | NUMBER           | `NEW_TRANS_ALL`     | **required**, numeric, `maxlength=7`                                  |
| `NEW_COMMUN_ALL`      | NUMBER           | `NEW_COMMUN_ALL`    | **required**, numeric, `maxlength=7`                                  |
| `NEW_CAR_ALL`         | NUMBER           | `NEW_CAR_ALL`       | **required**, numeric, `maxlength=7`                                  |
| `NEW_OTHER_ALL`       | NUMBER           | `NEW_OTHER_ALL`     | **required**, numeric, `maxlength=7`                                  |
| `NEW_MARITAL_STATUS`  | VARCHAR2         | `NEW_MARITAL_STATUS`| **required**, datalist `S` = Single, `M` = Married                     |
| `NEW_TOTAL`           | NUMBER           | `NEW_TOTAL`         | readonly in UI, **computed client-side** — server must recompute (§5.4) |
| `NEW_GRADE`           | VARCHAR2         | —                   | column exists, no input on the current form                           |
| `NEW_LEVEL`           | VARCHAR2         | —                   | same as above                                                         |
| `REMARKS`             | VARCHAR2(2000)   | `REMARKS`           | textarea, max 2000 chars                                              |
| `VIEWS`               | VARCHAR2(2000)   | `VIEWS`             | "Views & Suggestions" textarea, max 2000 chars                        |
| `STATUS`              | VARCHAR2         | —                   | **server-owned**; `'DRAFT'` on insert, never accepted from the body   |
| `HR_ADMIN`, `HR_ADMIN_SIGN` | VARCHAR2/DATE | —                | workflow signature block (display-only; workflow-owned)              |
| `VP`, `VP_SIGN`       | VARCHAR2/DATE    | —                   | workflow signature (the VP column was removed from the UI — §7.6)     |
| `PRESIDENT`, `PRESIDENT_SIGN` | VARCHAR2/DATE | —               | workflow signature (display-only)                                     |
| `CREATED_BY`          | NUMBER           | —                   | audit = authenticated user id                                         |
| `CREATED_AT`          | DATE `DD-MON-RR` | —                   | audit (legacy writes `d-M-y`)                                         |
| `UPDATED_BY`          | NUMBER           | —                   | audit                                                                 |
| `UPDATED_AT`          | DATE `DD-MON-RR` | —                   | audit                                                                 |

**Status values:** legacy rows contain a case-mixed mix of `DRAFT` (insert), `INPROCESS`,
`APPROVED`, `REJECTED` (workflow writes uppercase) and the listing view compares title-case
`Inprocess`/`Approved`/`Rejected` (§8.9). The new API must canonicalise to
`DRAFT | INPROCESS | APPROVED | REJECTED` and treat status as read-only.

---

## 2. API Surface

Base path: `/api/v1/hr/personnel-record-changes`
Auth: session (`authenticate`); `created_by` / `updated_by` from `req.auth` — never the body.

| Method   | Endpoint                                        | Permission Code                               | Purpose                                                    |
| -------- | ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `POST`   | `/api/v1/hr/personnel-record-changes`           | `HR.PERSONNEL_RECORD_CHANGES.CREATE`           | **Insert** one request row (server sets id/ref/status/audit) |
| `GET`    | `/api/v1/hr/personnel-record-changes/:headerId` | `HR.PERSONNEL_RECORD_CHANGES.VIEW`             | **Read** one request (full form record)                    |
| `PUT`    | `/api/v1/hr/personnel-record-changes/:headerId` | `HR.PERSONNEL_RECORD_CHANGES.UPDATE`           | **Update** one request (never touches `STATUS`/id/ref/audit-create) |
| `DELETE` | `/api/v1/hr/personnel-record-changes/:headerId` | `HR.PERSONNEL_RECORD_CHANGES.DELETE`           | **Delete** the row (hard delete; legacy has none — §4.2)    |
| `GET`    | `/api/v1/hr/personnel-record-changes`           | `HR.PERSONNEL_RECORD_CHANGES.VIEW`             | **Listing with filters** + pagination                      |
| `GET`    | `.../lookups/employees`                         | `HR.PERSONNEL_RECORD_CHANGES.VIEW`             | employee-number datalist (§6.1)                            |
| `GET`    | `.../lookups/positions`                         | `HR.PERSONNEL_RECORD_CHANGES.VIEW`             | position datalist (§6.2)                                   |
| `GET`    | `.../lookups/employees/:empNo`                  | `HR.PERSONNEL_RECORD_CHANGES.VIEW`             | **auto-fill payload** — the two-branch legacy query (§6.3)  |

**Route order:** register `/lookups/...` routes **before** `/:headerId`, otherwise `lookups` is
parsed as a header id.

**Universal responses**

```jsonc
{ "success": true, "data": { ... } }                        // 200 / 201
{ "success": false, "message": "Personnel record change not found" }   // 404
{ "success": false, "message": "Validation failed", "errors": [...] }  // 400
```

---

## 3. `GET /api/v1/hr/personnel-record-changes` — Listing with filters

The legacy page (`report.php` + `all_records()`) has **no server-side filters** — it selects every
row and lets DataTables filter client-side (default page length 25, click-to-sort columns, buttons
copy/csv/excel/pdf/print). Row click navigates to `Rec_change/index/:headerId`. The new endpoint
reproduces those columns server-side with real filters.

### 3.1 Filters (query parameters)

| Param       | Type            | Matches                                       | Legacy source                       |
| ----------- | --------------- | --------------------------------------------- | ----------------------------------- |
| `search`    | string          | `EMP_NO`, `EMP_NAME`, `REF_NO` (case-insensitive `LIKE`) | DataTables global search |
| `status`    | enum            | `STATUS` (compare upper-cased)                 | status chip column                  |
| `section`   | string          | `SECTION` (exact)                             | "SECTION" column                    |
| `department`| string          | `DEPT` (exact)                                | "DEPARTMENT" column                 |
| `position`  | string          | `NEW_POSITION` (exact)                        | "POSITION" column                   |
| `requestor` | number          | `CREATED_BY`                                  | "REQUESTOR" column                  |
| `date_from` | `YYYY-MM-DD`    | `FORM_DATE >= date_from` (inclusive)           | new (was client-side sorting)       |
| `date_to`   | `YYYY-MM-DD`    | `FORM_DATE <= date_to` (inclusive)             | new                                 |
| `page`      | number ≥ 1      | page number (default 1)                       | DataTables paging                   |
| `pageSize`  | number 1–100    | page size (default 25, max 100)               | DataTables `pageLength: 25`         |
| `sort`      | enum            | `headerId \| empNo \| empName \| formDate \| status \| oldTotal \| newTotal` | click-to-sort headers |
| `order`     | `asc` \| `desc` | sort direction (default `desc` by `HEADER_ID`) |                                     |

> **Decision:** preserve the legacy behavior: every authenticated user with VIEW permission sees
> every request. Do not apply implicit `CREATED_BY` scoping or add a `created_by` filter.

### 3.2 Listing SQL (bind variables)

```sql
-- page of rows
SELECT REC.HEADER_ID,
       REC.REF_NO,
       REC.FORM_DATE,
       REC.EFFECTIVE_DATE,
       REC.EMP_NO,
       REC.EMP_NAME,
       REC.NEW_POSITION,
       REC.SECTION,
       REC.DEPT,
       REC.OLD_TOTAL,
       REC.NEW_TOTAL,
       REC.REMARKS,
       REC.STATUS,
       REC.CREATED_BY,
       (SELECT M.FULL_NAME
          FROM XX_DIGI_EMP_MASTER M
         WHERE M.USER_ID = REC.CREATED_BY) AS REQUESTOR
  FROM XXZP.XX_REC_CHANGE REC
 WHERE (UPPER(REC.EMP_NAME)     LIKE UPPER(:search) OR
        UPPER(REC.REF_NO)       LIKE UPPER(:search) OR
        TO_CHAR(REC.EMP_NO)     LIKE :search)
   AND (UPPER(REC.STATUS)       = UPPER(:status)       OR :status IS NULL)
   AND (REC.SECTION             = :section             OR :section IS NULL)
   AND (REC.DEPT                = :department          OR :department IS NULL)
   AND (REC.NEW_POSITION        = :position            OR :position IS NULL)
   AND (REC.CREATED_BY          = :requestor           OR :requestor IS NULL)
   AND (REC.FORM_DATE >= TO_DATE(:date_from, 'YYYY-MM-DD') OR :date_from IS NULL)
   AND (REC.FORM_DATE <= TO_DATE(:date_to,   'YYYY-MM-DD') OR :date_to IS NULL)
 ORDER BY :sort :order, REC.HEADER_ID DESC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY;

-- total count for the same predicate (without ORDER BY / OFFSET)
SELECT COUNT(*) FROM XXZP.XX_REC_CHANGE REC WHERE ...same predicates...;
```

`REQUESTOR` mirrors legacy's `XX_DIGI_EMP_MASTER` lookup (`USER_ID = CREATED_BY`), simplified to a
single subquery. **Do not** reproduce the legacy `PENDING_AT` subquery — it reads
`XXPHP_WORKFLOW` (workflow, §9).

### 3.3 Response shape

```jsonc
{
  "success": true,
  "data": {
    "meta": { "page": 1, "pageSize": 25, "total": 137, "sort": "headerId", "order": "desc" },
    "rows": [
      {
        "headerId": 142, "refNo": "0142-Production", "formDate": "2026-10-29",
        "effectiveDate": "2026-11-01", "empNo": 1234, "empName": "AL ESSA, SAAD",
        "position": "Supervisor", "section": "Production", "department": "Injection",
        "oldTotal": 8500.00, "newTotal": 9250.50,
        "remarks": "...", "status": "DRAFT", "requestor": "JOHN, DOE"
      }
    ]
  }
}
```

Legacy render mapping for status chips: `Inprocess → info`, `Approved → success`,
`Rejected → danger`, anything else printed raw — the API returns the raw canonical status and the
frontend does the colouring.

---

## 4. Read and Delete

### 4.1 Read — `GET /api/v1/hr/personnel-record-changes/:headerId`

Legacy: `index($header_id)` → `fetchRecord($id)` (`SELECT * ... WHERE HEADER_ID = ?`) and the view
renders every column. The API returns the full row mapped to the form's field names:

```jsonc
{ "success": true, "data": {
    "headerId": 142, "refNo": "0142-Production", "formDate": "2026-10-29",
    "arbDate": "الخميس ٦ / ربيع الآخر / ١٤٤٨", "effectiveDate": "2026-11-01",
    "empNo": 1234, "empName": "...", "nationality": "Saudi", "section": "Production",
    "department": "Injection", "startDate": "2019-03-17",
    "old": { "position": "...", "basicSal": 5000, "houseAll": 1000, "transAll": 500,
              "communAll": 300, "carAll": 200, "otherAll": 0, "total": 7000,
              "maritalStatus": "M", "grade": null, "level": null },
    "new": { "position": "Senior Supervisor", "basicSal": 5500, "houseAll": 1000,
              "transAll": 500, "communAll": 300, "carAll": 200, "otherAll": 0,
              "total": 7500.00, "maritalStatus": "M", "grade": null, "level": null },
    "remarks": "...", "views": "...", "status": "DRAFT",
    "signatures": { "hrAdmin": null, "hrAdminSign": null, "vp": null, "vpSign": null,
                     "president": null, "presidentSign": null },
    "createdBy": 88, "createdAt": "...", "updatedBy": null, "updatedAt": null
} }
```

Unknown id → `404 { "success": false, "message": "Personnel record change not found" }`.

### 4.2 Delete — `DELETE /api/v1/hr/personnel-record-changes/:headerId`

**The legacy module has no delete for records** — the only `delete()` in `Rec_change.php` removes an
attachment row (`XXZP_ALL_ATTACHMENTS`) with interpolated input and then redirects to a *different*
module (`trial/index/`) — a bug, and there is no upload UI on the form, so it is dead code (§8.3).

The new API implements a straightforward hard delete of the single row:

```sql
DELETE FROM XXZP.XX_REC_CHANGE WHERE HEADER_ID = :headerId;
```

- Return `404` if no row matched.
- Response: `{ "success": true, "data": { "headerId": 142 } }`.
- **Decision:** allow hard deletion for every status. Return `404` only when no row matched; do not
  add a status guard or return `409` for status.

---

## 5. Write endpoints

Legacy collapses insert and update into one `add()` method: the form POSTs everything to
`rec_change/add`, the model checks whether the posted `HEADER_ID` already exists
(`getFormDataByID`) and inserts or updates accordingly. The new API splits them honestly.

### 5.1 Payload (both create and update)

Field names are the form's names (the React client posts the same keys):

```jsonc
{
  "empNo": 1234,
  "formDate": "2026-10-29",        // optional; server defaults to today
  "arbDate": "الخميس ٦ / ربيع الآخر / ١٤٤٨",
  "effectiveDate": "2026-11-01",   // required
  "empName": "AL ESSA, SAAD", "nationality": "Saudi",
  "section": "Production", "department": "Injection", "startDate": "2019-03-17",
  "old": { "position": "...", "basicSal": 5000, "houseAll": 1000, "transAll": 500,
            "communAll": 300, "carAll": 200, "otherAll": 0, "total": 7000,
            "maritalStatus": "M" },
  "new": { "position": "Senior Supervisor", "basicSal": 5500, "houseAll": 1000,
            "transAll": 500, "communAll": 300, "carAll": 200, "otherAll": 0,
            "total": 7500.00, "maritalStatus": "M" },
  "remarks": "...", "views": "..."
}
```

**Never accepted from the body:** `headerId` (on create), `refNo`, `status`, `createdBy`,
`createdAt`, `updatedBy`, `updatedAt`, the signature columns (`hrAdmin*`, `vp*`, `president*`),
`userId` (always null — §8.6), `grade`/`level` (no UI).

### 5.2 Validation

| Field                    | Rule                                                | Failure                    |
| ------------------------ | --------------------------------------------------- | -------------------------- |
| `empNo`                  | required; must resolve in the auto-fill lookup (§6.3) | `400` `EMP_NOT_FOUND`      |
| `effectiveDate`          | required, valid `YYYY-MM-DD`                        | `400` `EFFECTIVE_DATE_REQUIRED` |
| 
ew.position`           | required, must be in the positions lookup (§6.2)    | `400` `POSITION_INVALID`   |
| 
ew.basicSal` … 
ew.otherAll` | required, numeric, `0 ≤ x ≤ 9999999` (7 digits) | `400` `ALLOWANCE_INVALID`  |
| 
ew.maritalStatus`      | required, one of `S`, `M`                           | `400` `MARITAL_STATUS_INVALID` |
| 
ew.total`              | **ignored** — server recomputes (§5.4)              | —                          |
| `remarks`, `views`       | optional, ≤ 2000 chars                              | `400` `TEXT_TOO_LONG`      |
| `formDate`, `arbDate`    | optional                                             | —                          |

Legacy client rules being mirrored: numeric inputs strip non-digits on keyup (`[^0-9.]` — accept
only a plain number server-side), `maxlength=7` on every revised allowance, `maxlength=2000` on
both textareas, `required` on the effective date + all revised fields.

### 5.3 ID / reference generation

```sql
SELECT NVL(MAX(HEADER_ID) + 1, 1) FROM XXZP.XX_REC_CHANGE;
```

- Run inside the insert transaction. `MAX+1` without a sequence is racy: serialize the read+insert
  (retry on unique-key violation) or — if the DBA allows — replace it with a sequence/identity and
  keep the same value shape.
- Do not hardcode a fallback seed other than the legacy `1`.
- `REF_NO = LPAD(:headerId, 4, '0') || '-' || :section` → `0142-Production`
  (legacy: `sprintf("%04d", $id) . '-' . $SECTION`).
- `REF_NO` is generated **on insert only** — updates keep the original (legacy quirk, §8.5).

### 5.4 SQL

Insert (one statement, all binds; `NEW_TOTAL` computed by the API):

```sql
INSERT INTO XXZP.XX_REC_CHANGE
  (HEADER_ID, REF_NO, FORM_DATE, ARB_DATE, EFFECTIVE_DATE, USER_ID,
   EMP_NO, EMP_NAME, NATIONALITY, SECTION, DEPT, START_DATE,
   OLD_POSITION, OLD_BASIC_SAL, OLD_HOUSE_ALL, OLD_TRANS_ALL, OLD_COMMUN_ALL,
   OLD_CAR_ALL, OLD_OTHER_ALL, OLD_TOTAL, OLD_MARITAL_STATUS, OLD_GRADE, OLD_LEVEL,
   NEW_POSITION, NEW_BASIC_SAL, NEW_HOUSE_ALL, NEW_TRANS_ALL, NEW_COMMUN_ALL,
   NEW_CAR_ALL, NEW_OTHER_ALL, NEW_TOTAL, NEW_MARITAL_STATUS, NEW_GRADE, NEW_LEVEL,
   REMARKS, VIEWS, STATUS, CREATED_BY, CREATED_AT)
VALUES
  (:headerId, :refNo, TO_DATE(:formDate,'YYYY-MM-DD'), :arbDate,
   TO_DATE(:effectiveDate,'YYYY-MM-DD'), NULL,
   :empNo, :empName, :nationality, :section, :dept, TO_DATE(:startDate,'YYYY-MM-DD'),
   :oldPosition, :oldBasicSal, :oldHouseAll, :oldTransAll, :oldCommunAll,
   :oldCarAll, :oldOtherAll, :oldTotal, :oldMaritalStatus, NULL, NULL,
   :newPosition, :newBasicSal, :newHouseAll, :newTransAll, :newCommunAll,
   :newCarAll, :newOtherAll, :newTotal, :newMaritalStatus, NULL, NULL,
   :remarks, :views, 'DRAFT', :createdBy, SYSDATE);
```

Update (client-sent fields only; `STATUS`, `REF_NO`, `HEADER_ID`, `CREATED_*` untouched):

```sql
UPDATE XXZP.XX_REC_CHANGE
   SET FORM_DATE       = TO_DATE(:formDate,'YYYY-MM-DD'),
       ARB_DATE        = :arbDate,
       EFFECTIVE_DATE  = TO_DATE(:effectiveDate,'YYYY-MM-DD'),
       EMP_NO          = :empNo,
       EMP_NAME        = :empName,
       NATIONALITY     = :nationality,
       SECTION         = :section,
       DEPT            = :dept,
       START_DATE      = TO_DATE(:startDate,'YYYY-MM-DD'),
       OLD_POSITION    = :oldPosition,
       OLD_BASIC_SAL   = :oldBasicSal,
       OLD_HOUSE_ALL   = :oldHouseAll,
       OLD_TRANS_ALL   = :oldTransAll,
       OLD_COMMUN_ALL  = :oldCommunAll,
       OLD_CAR_ALL     = :oldCarAll,
       OLD_OTHER_ALL   = :oldOtherAll,
       OLD_TOTAL       = :oldTotal,
       OLD_MARITAL_STATUS = :oldMaritalStatus,
       NEW_POSITION    = :newPosition,
       NEW_BASIC_SAL   = :newBasicSal,
       NEW_HOUSE_ALL   = :newHouseAll,
       NEW_TRANS_ALL   = :newTransAll,
       NEW_COMMUN_ALL  = :newCommunAll,
       NEW_CAR_ALL     = :newCarAll,
       NEW_OTHER_ALL   = :newOtherAll,
       NEW_TOTAL       = :newTotal,
       NEW_MARITAL_STATUS = :newMaritalStatus,
       REMARKS         = :remarks,
       VIEWS           = :views,
       UPDATED_BY      = :updatedBy,
       UPDATED_AT      = SYSDATE
 WHERE HEADER_ID = :headerId;
```

If the update affects 0 rows → `404`. Create returns `201` with the read payload (`headerId`,
`refNo`, `status: "DRAFT"`); update returns `200` with the same shape.

### 5.5 Legacy date handling

- Legacy stores `FORM_DATE`/`EFFECTIVE_DATE` as PHP `date('d-M-y')` (e.g. `29-Oct-26`) and
  `CREATED_AT`/`UPDATED_AT` as `date('d-M-y')`; `START_DATE` arrives from the master lookup as-is.
- The API accepts/returns ISO `YYYY-MM-DD` and binds with `TO_DATE(...,'YYYY-MM-DD')`; convert at
  the boundary only.

---

## 6. Lookup APIs

### 6.1 `GET .../lookups/employees` — employee datalist

```sql
SELECT DISTINCT EMPLOYEE_NUMBER AS empNo FROM XX_DIGI_EMP_MASTER ORDER BY 1;
```

### 6.2 `GET .../lookups/positions` — revised-position datalist

```sql
SELECT DISTINCT POSITION_NAME AS name FROM XX_DIGI_EMP_MASTER ORDER BY 1;
```

### 6.3 `GET .../lookups/employees/:empNo` — auto-fill payload

This is legacy `getEmpDetails()` and it has **two branches** — the most important conditional in
the module (it drives §7.2):

**Branch A — the employee has no previous request** (`XX_REC_CHANGE` has no row for that
`EMP_NO`): current values come from the master, current employees only.

```sql
SELECT EMPLOYEE_NUMBER, PERSON_ID, ASSIGNMENT_ID, FULL_NAME, FULL_NAME_AR,
       JOINING_DATE, JOINING_DATE_AR,
       DEPARTMENT AS DEPARTMENT_NAME, NATIONALITY, NATIONALITY_AR,
       '' AS SEGMENT3, '' AS SEGMENT4, '' AS SEGMENT5,
       MARITAL_STATUS, NATIONAL_IDENTIFIER,
       JOB_TITLE AS JOB_NAME, JOB_NAME_AR AS JOB_AR, DIVISION,
       BASIC_SALARY, HOUSING_ALLOWANCE, TRANSPORTATION_ALLOWANCE,
       COMMUNICATION_ALLOWANCE, CAR_ALLOWANCE, TOTAL_SALARY, OTHER_ALLOWANCE
  FROM XX_DIGI_EMP_MASTER
 WHERE EMPLOYEE_NUMBER = :empNo
   AND CURRENT_EMP_FLAG = 'Y';
```

**Branch B — the employee already has requests:** current values come from their **latest
previous request** (so the previous revision becomes the new "current"), no `CURRENT_EMP_FLAG`
filter:

```sql
SELECT HEADER_ID, FORM_DATE, REF_NO, ARB_DATE, EFFECTIVE_DATE, EMP_NO,
       EMP_NAME AS FULL_NAME, NATIONALITY,
       SECTION AS DIVISION, DEPT AS DEPARTMENT_NAME,
       START_DATE AS JOINING_DATE,
       OLD_POSITION, OLD_BASIC_SAL, OLD_HOUSE_ALL, OLD_TRANS_ALL, OLD_COMMUN_ALL,
       OLD_CAR_ALL, OLD_OTHER_ALL, OLD_GRADE, OLD_LEVEL, OLD_TOTAL,
       NEW_POSITION AS JOB_NAME,
       NEW_BASIC_SAL AS BASIC_SALARY, NEW_HOUSE_ALL AS HOUSING_ALLOWANCE,
       NEW_TRANS_ALL AS TRANSPORTATION_ALLOWANCE, NEW_OTHER_ALL AS OTHER_ALLOWANCE,
       NEW_COMMUN_ALL AS COMMUNICATION_ALLOWANCE, NEW_CAR_ALL AS CAR_ALLOWANCE,
       NEW_GRADE, NEW_LEVEL, NEW_TOTAL AS TOTAL_SALARY,
       REMARKS, VIEWS, HR_ADMIN, HR_ADMIN_SIGN, VP, VP_SIGN,
       PRESIDENT, PRESIDENT_SIGN, STATUS
  FROM XXZP.XX_REC_CHANGE XRC
 WHERE XRC.EMP_NO = :empNo
   AND XRC.HEADER_ID = (SELECT MAX(XRC2.HEADER_ID)
                          FROM XXZP.XX_REC_CHANGE XRC2
                         WHERE XRC2.EMP_NO = XRC.EMP_NO);
```

Response maps straight onto the form's read-only block: `FULL_NAME, NATIONALITY, DIVISION,
DEPARTMENT_NAME, JOINING_DATE, JOB_NAME, BASIC_SALARY, HOUSING_ALLOWANCE,
TRANSPORTATION_ALLOWANCE, COMMUNICATION_ALLOWANCE, CAR_ALLOWANCE, OTHER_ALLOWANCE,
TOTAL_SALARY, MARITAL_STATUS`.

- **No row in either branch** → `404 { success:false, message:"No Data Available for given Employee Number" }`
  (legacy shows exactly that alert and clears/zeroes the fields).
- Branch B does **not** select `MARITAL_STATUS` (legacy bug §8.7) — the new endpoint should return
  `maritalStatus: null` for branch B rather than pretending the client can prefill it; document the
  choice in the PR.
- Detection query used by legacy to choose the branch:
  `SELECT MAX(HEADER_ID), EMP_NO FROM XX_REC_CHANGE WHERE EMP_NO = :empNo GROUP BY EMP_NO`.

---

## 7. Form flow — conditional behaviour (what the React screen must reproduce)

This section is the screen's behavioural contract: every "if X, show/hide Y" rule found in the
legacy form, navbar and model. All of it is **frontend/lookup behaviour** — none of it belongs in
the workflow engine.

### 7.1 New form vs. edit form

| Condition                    | Behaviour                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| Route without `headerId`     | Blank form; hidden `HEADER_ID = 0`; no status badge; no Submit button      |
| Route with `:headerId`       | Record loaded; hidden `HEADER_ID = id`; **status badge shown** (top-right) |
| Badge colour                 | `APPROVED` → green/bold, `REJECTED` → red, anything else → plain black     |
| `REF_NO` input               | Always readonly, placeholder *"Generated Automatically"*; filled only after first save |
| `FORM_DATE` input            | Always readonly, defaults to today                                        |

### 7.2 Employee auto-fill (the main conditional)

When the user picks an `Emp#` (`change` event on the `EMP_NO` datalist):

1. **Datalist validation on typing** — every `input` event checks the typed value against the
   datalist options (partial match allowed). If no option contains it →
   `alert('Invalid Employee number')` and the field is cleared to `''`.
2. **Auto-fill request** fires `POST /lookups/employees/:empNo`:
   - **No previous request for this employee (Branch A)** → current block = master data
     (`CURRENT_EMP_FLAG='Y'`).
   - **Employee already has requests (Branch B)** → current block = their **latest previous
     request**, i.e. the previous revision's `NEW_*` values become this request's `OLD_*` values and
     the previous position becomes the pre-filled `NEW_POSITION`.
3. **Fields written by the auto-fill:** `EMP_NAME`, `NATIONALITY`, `DEPT`, `SECTION`, `START_DATE`,
   all `OLD_*` (position/basic/house/trans/commun/car/other/total), `OLD_MARITAL_STATUS`,
   `NEW_POSITION`, `NEW_MARITAL_STATUS`, hidden `USER_ID`.
4. **No data found** → `alert('No Data Available for given Employee Number')`; name/nationality/
   dept/section/start-date/position cleared to `''`, every `OLD_*` numeric set to `'0'`,
   `USER_ID` cleared.
5. **Re-selecting the same employee re-runs the whole auto-fill**, overwriting any manual edits in
   the read-only block.

### 7.3 Editability matrix

| Field                                   | Mode     | Notes                                    |
| --------------------------------------- | -------- | ---------------------------------------- |
| `EMP_NO`                                | editable | datalist + input-validation (§7.2.1)     |
| `EMP_NAME`, `NATIONALITY`, `SECTION`, `DEPT`, `START_DATE` | readonly | auto-filled only      |
| `OLD_POSITION`, `OLD_BASIC_SAL`, `OLD_HOUSE_ALL`, `OLD_TRANS_ALL`, `OLD_COMMUN_ALL`, `OLD_CAR_ALL`, `OLD_OTHER_ALL`, `OLD_TOTAL` | readonly | auto-filled only |
| `OLD_MARITAL_STATUS`                    | **editable** | sits in the read-only block but has no `readonly` (§8.8) |
| `FORM_DATE`, `REF_NO`                   | readonly | server/derived                            |
| `ARB_DATE`                              | editable | auto-filled with today's Hijri date on load |
| `EFFECTIVE_DATE`                        | editable | `required`                                |
| `NEW_POSITION`                          | editable | datalist, `required`                      |
| `NEW_BASIC_SAL`, `NEW_HOUSE_ALL`, `NEW_TRANS_ALL`, `NEW_COMMUN_ALL`, `NEW_CAR_ALL`, `NEW_OTHER_ALL` | editable | `required`, numeric, `maxlength=7` |
| `NEW_MARITAL_STATUS`                    | editable | datalist (`S`/`M`), `required`            |
| `NEW_TOTAL`                             | readonly | computed (§7.4)                           |
| `REMARKS`, `VIEWS`                      | editable | `maxlength=2000`                          |
| Grade / Level labels                    | labels only | no inputs exist — do not render fields |

### 7.4 Auto-computed values

| Value        | Computed where | Formula                                                            |
| ------------ | -------------- | ------------------------------------------------------------------ |
| `NEW_TOTAL`  | client `sum()` | `basic + house + trans + other + commun + car`, 2 decimals, recomputed on **keyup** of any revised field; NaN treated as 0 |
| `REF_NO`     | server (insert)| `LPAD(headerId,4,'0') \|\| '-' \|\| SECTION`                       |
| `ARB_DATE`   | client on load | Hijri date via `Intl.DateTimeFormat('ar-TN-u-ca-islamic', …)`       |
| `FORM_DATE`  | client/server  | today when creating; stored value when editing                     |

The API must recompute `NEW_TOTAL` server-side (the readonly input is a client-only guard).

### 7.5 Navbar buttons — visibility rules

From 
avbar.php`:

| Button   | Shown when                                                                | Hidden when                                        |
| -------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `Submit` (workflow) | URL segment ≠ `list` **AND** record exists **AND** `UPPER(STATUS)` ∉ `INPROCESS, APPROVED, ACCEPTED` | new form; list page; any in-process/approved request |
| `Save`   | URL segment ≠ `list` (both new and edit, **any status**)                   | list page                                          |
| `Print`  | always (`window.print()`)                                                  | never                                              |

- Legacy quirks to decide on deliberately: (a) **Save stays visible on APPROVED/INPROCESS records**
  (the form can still be edited after approval — recommend hiding it); (b) the `<ul>` that wraps the
  buttons is only opened when `Submit` shows, but always closed (stray `</ul>`, §8.11).
- `Submit` itself only calls the workflow endpoint (`Rec_flow/submit`) — **out of scope** (§9); the
  React app keeps the button hidden or wires it to the future workflow API.

### 7.6 Signature block

- Rendered columns: **"Noted by : HR & Admin. Manager"** (`HR_ADMIN` + `HR_ADMIN_SIGN`) and
  **"Approved by : President"** (`PRESIDENT` + `PRESIDENT_SIGN`), each showing `STATUS` text +
  `d-m-y` date, coloured green for `APPROVED`, red otherwise.
- The **Vice-President column was deliberately removed** (comment in the view: *"Remove Khaled VP"*)
  — the `VP`/`VP_SIGN` columns still exist in the table but must not be rendered.
- All signature values are workflow-owned: the form only displays them (read-only, from the Read
  payload).

### 7.7 Client-side validation summary

- Numeric revised fields: strip anything outside `[0-9.]` on keyup; server accepts plain numbers only.
- Employee number must partially match a datalist option or it is cleared (§7.2.1).
- HTML `required`: `EFFECTIVE_DATE`, `NEW_POSITION`, all six revised allowances, `NEW_MARITAL_STATUS`, `NEW_TOTAL`.
- Textareas capped at 2000 characters (`maxlength`).
- Save is an AJAX `POST` to `rec_change/add`; success shows *"Data Saved Successfully"* and follows
  the response as a redirect URL (the update path's response is broken — §8.4).

---

## 8. Legacy bugs — do not reproduce

1. **Missing auth checks.** Only `index()` verifies `FormsSession`; `add()`, `getEmpDetails()`,
   `list()` and `delete()` run unauthenticated. Every new endpoint requires the authenticated
   session + permission code.
2. **SQL injection everywhere.** `fetchRecord`, `all_records`, `getEmpDetails` (both branches),
   `getFormDataByID`, `updateRequestStatus`, `updateAction`, `getUserProfile` and `delete()` all
   concatenate input into SQL. Bind variables only (§1).
3. **Dead/broken delete.** `Rec_change::delete()` deletes `XXZP_ALL_ATTACHMENTS` using the `$file_id`
   parameter directly and redirects to `trial/index/` — a different module. No record delete exists
   at all (§4.2).
4. **Broken redirect after update.** The update branch echoes `'Data updated successfully'` *and*
   redirects; the AJAX success handler then does `window.location = response`, navigating to that
   literal string. Return JSON (`{success,…}`) and never echo-then-redirect.
5. **`REF_NO` staleness.** Generated on insert only — if `SECTION` later changes, the reference keeps
   the old section. Decide: keep legacy behaviour (documented here) or regenerate; do not silently
   change it.
6. **Hidden `USER_ID` is never filled.** Neither auto-fill branch selects `USER_ID`, so the hidden
   field stays empty and the column stores NULL. Also, the success handler reads `res[0].JOB_NAME`
   on an object, which throws — everything after the marital-status prefill is dead code. Populate
   it server-side if the column is needed; otherwise drop it from the payload.
7. **Marital status only prefills on the first request.** Branch B has no `MARITAL_STATUS` column,
   so `.val(undefined)` silently leaves the field unchanged for returning employees (§6.3).
8. **`OLD_MARITAL_STATUS` is editable** although it belongs to the read-only "current record"
   block — either make it readonly in the UI or accept it as user input deliberately; do not leave
   the ambiguity.
9. **Status case mismatch.** Insert writes `'DRAFT'`, workflow writes `'INPROCESS'/'APPROVED'/
   'REJECTED'`, but the listing compares title-case `'Inprocess'/'Approved'/'Rejected'` (chips fall
   through to raw text) while the navbar uppercases before comparing. Canonicalise server-side (§1.1).
10. **`MAX+1` id race** with a hardcoded `1` fallback and no sequence/transaction guard (§5.3).
11. **Navbar markup:** the button `<ul>` is opened only when `Submit` renders but always closed, and
    `Save` remains active for approved records (§7.5).
12. **Loose numeric filter** — `[^0-9.]` permits multiple decimal points; empty strings are posted
    for readonly fields and overwrite columns with `''`.
13. **No server-side validation at all** — `add()` inserts whatever was posted (`$this->input->post()`)
    and the listing has no filters; never trust the client's `STATUS`, `REF_NO`, ids or audit fields.
14. **Unescaped output** — the form echoes stored values raw into HTML (XSS). Escape on render.

---

## 9. Out of scope (do not implement)

- **Workflow / approval / email.** `controllers/Rec_flow.php` (`Rec_flow/submit`), `Workflow_model`,
  `XXPHP_WORKFLOW`, the `PENDING_AT` listing subquery, phpmailer approval mails, approver routing in
  `getExpenseFlowRec()` / `getEmp()` (department-based approver steps: Operations Director / HR &
  Administration Manager / General Manager), and status transitions
  (`updateRequestStatus()` → `DRAFT/INPROCESS/APPROVED/REJECTED`, `updateAction()` writing the
  `HR_ADMIN`/`VP`/`PRESIDENT` signature cells).
- **Signature actions** — the API only *returns* the signature columns; it never writes them.
- **Print/PDF** — legacy is `window.print()` only; no server rendering.
- **Attachments** — `FileUploader` inheritance and `XXZP_ALL_ATTACHMENTS` delete are unused on this
  form (no upload UI).
- **Legacy variants** — `views/Rec_change/form_old.php` (posts to `trial/add`, `trial_flow/submit`)
  and the `trial`/`Trial.php` module.
- **Employee/position master maintenance** — `XX_DIGI_EMP_MASTER` is read-only for this module.

---

## 10. Legacy → new endpoint map

| Legacy (PHP)                                                     | New API                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET index.php/Rec_change/index` (new form)                      | `POST /api/v1/hr/personnel-record-changes` (or blank-form route) |
| `GET index.php/Rec_change/index/:headerId` (edit form, `fetchRecord`) | `GET /api/v1/hr/personnel-record-changes/:headerId`         |
| `POST rec_change/add` → insert branch (`getFormDataByID` null)   | `POST /api/v1/hr/personnel-record-changes`                      |
| `POST rec_change/add` → update branch                            | `PUT /api/v1/hr/personnel-record-changes/:headerId`             |
| `GET Rec_change/getEmpDetails` (POST `emp_no`)                   | `GET /api/v1/hr/personnel-record-changes/lookups/employees/:empNo` |
| `Rec_change_model->fetchEmpNo()` (datalist)                      | `GET .../lookups/employees`                                     |
| `Rec_change_model->fetchPositions()` (datalist)                  | `GET .../lookups/positions`                                     |
| `GET Rec_change/list` → `all_records()` + DataTables filtering   | `GET /api/v1/hr/personnel-record-changes` (§3)                  |
| `Rec_change/delete($form_id, $file_id)` (attachments)            | — (dead code, no UI — do not port)                              |
| `Rec_flow/submit`, `updateRequestStatus`, `updateAction`         | — (workflow — §9)                                               |
| `window.print()`                                                 | — (browser print)                                               |

---

## 11. Acceptance checklist

- [ ] **T-01** `POST` creates a row with server-generated `HEADER_ID`, `REF_NO` (`0142-Production`),
      `STATUS='DRAFT'`, `CREATED_BY` from the session; body cannot set any of them.
- [ ] **T-02** `POST` with missing/invalid `effectiveDate` → `400 EFFECTIVE_DATE_REQUIRED`.
- [ ] **T-03** `POST` with unknown `empNo` → `400/404 EMP_NOT_FOUND`.
- [ ] **T-04** `NEW_TOTAL` equals `basic+house+trans+other+commun+car` even when the client sends a
      different value.
- [ ] **T-05** `GET :id` returns the full record incl. `old`/
ew` groups and signature block;
      unknown id → `404`.
- [ ] **T-06** `PUT :id` updates form fields only — `STATUS`, `REF_NO`, `CREATED_*` unchanged;
      0 rows → `404`.
- [ ] **T-07** `DELETE :id` removes the row; second delete → `404`.
- [ ] **T-08** Listing returns `meta.total` + a page of ≤ `pageSize` rows, default order
      `HEADER_ID DESC`.
- [ ] **T-09** Each filter (`search`, `status`, `section`, `department`, `position`, `requestor`,
      `date_from`, `date_to`) narrows results correctly, alone and combined.
- [ ] **T-10** Listing response contains **no** workflow fields (no `PENDING_AT`, no
      `XXPHP_WORKFLOW` reads anywhere).
- [ ] **T-11** `lookups/employees` and `lookups/positions` return de-duplicated sorted lists.
- [ ] **T-12** Auto-fill: employee **without** previous request → Branch A payload (master data,
      `CURRENT_EMP_FLAG='Y'`); **with** previous request → Branch B payload where `old.*` mirrors the
      previous request's 
ew.*`.
- [ ] **T-13** Auto-fill for an unknown/not-current employee → `404` with the legacy message
      *"No Data Available for given Employee Number"*.
- [ ] **T-14** Frontend reproduces §7.5 button rules: no `Submit` on new forms, on the list page, or
      when `UPPER(STATUS)` ∈ {`INPROCESS`,`APPROVED`,`ACCEPTED`}; `Print` always.
- [ ] **T-15** Frontend reproduces §7.3 editability (current block readonly except
      `OLD_MARITAL_STATUS`) and §7.4 auto-computed values (incl. Hijri `ARB_DATE`).
- [ ] **T-16** Status badge colours: `APPROVED` green, `REJECTED` red, otherwise plain; signature
      block shows HR & Admin Manager + President only (**no VP column**).
- [ ] **T-17** Every SQL statement uses bind variables — a `search` value of `%' OR 1=1 --` returns
      0 rows instead of everything.
- [ ] **T-18** All endpoints require the session + the matching
      `HR.PERSONNEL_RECORD_CHANGES.*` permission code; unauthenticated calls get `401`.

---

## 12. Implementation prompt (copy-ready)

> Copy everything in this block into your agent's task prompt together with this file.
>
> ```
> Implement the backend for the PERSONNEL RECORD CHANGE FORM ("Personal Status Change") in this
> repository, following README_personal_status_change_form.md as the authoritative spec. This is a
> spec-driven implementation task: do not invent behaviour that the README does not describe, and
> do not read behaviour from the legacy PHP beyond what the README documents.
>
> GOAL
> - CRUD + listing for ONE table: XXZP.XX_REC_CHANGE.
> - Endpoints (base /api/v1/hr/personnel-record-changes):
>     POST   /                      create  (HR.PERSONNEL_RECORD_CHANGES.CREATE)
>     GET    /:headerId             read    (HR.PERSONNEL_RECORD_CHANGES.VIEW)
>     PUT    /:headerId             update  (HR.PERSONNEL_RECORD_CHANGES.UPDATE)
>     DELETE /:headerId             delete  (HR.PERSONNEL_RECORD_CHANGES.DELETE)
>     GET    /                      listing with filters + pagination (VIEW)
>     GET    /lookups/employees     employee datalist (VIEW)
>     GET    /lookups/positions     position datalist (VIEW)
>     GET    /lookups/employees/:empNo   two-branch auto-fill payload (VIEW)
>   Register /lookups/* BEFORE /:headerId. Permission codes use UPDATE, never EDIT.
>
> NON-GOALS (do not build)
> - No workflow/approval/email/status transitions: no Rec_flow, XXPHP_WORKFLOW, PENDING_AT,
>   approver routing, signature writes. STATUS is server-owned ('DRAFT' on insert, read-only after).
> - No print/PDF endpoint, no attachments, no form_old/trial code, no master-data maintenance.
>
> DATA RULES
> - Oracle; every statement uses bind variables, never string concatenation.
> - Server-owned fields: HEADER_ID, REF_NO, STATUS, CREATED_*, UPDATED_*, signature columns.
>   Ignore them if the client sends them.
> - HEADER_ID: SELECT NVL(MAX(HEADER_ID)+1,1) inside the insert transaction, retry on conflict.
> - REF_NO = LPAD(headerId,4,'0') || '-' || SECTION, insert-only.
> - NEW_TOTAL is recomputed server-side: basic+house+trans+other+commun+car (2 decimals).
> - Dates: accept/return YYYY-MM-DD, bind with TO_DATE(:d,'YYYY-MM-DD'). Legacy DD-MON-RR strings
>   are a display concern only.
> - Canonical status enum: DRAFT | INPROCESS | APPROVED | REJECTED (legacy rows are case-mixed).
>
> FORM FLOW (README §7) — the frontend contract, implement/verify as specified there
> - Auto-fill has two branches: no previous request => XX_DIGI_EMP_MASTER (CURRENT_EMP_FLAG='Y');
>   otherwise => the employee's latest XX_REC_CHANGE row, where old.* mirrors the previous new.*.
>   No row in either branch => 404 "No Data Available for given Employee Number".
> - Button/status rules (Submit visibility by status, badge colours, HR+President signature block
>   with the VP column removed) live in the React client; the API only supplies the data.
>
> RULES
> 1. Read README_personal_status_change_form.md fully before writing code; its SQL blocks are the
>    reference queries — port them with bind variables.
> 2. Fix, never copy, the legacy bugs in §8 (SQL injection, missing auth, echo-then-redirect,
>    unvalidated input, status case mismatch).
> 3. Validate per §5.2 with the documented error codes; never trust the body for server-owned fields.
> 4. Filter building per §3.1; response envelope { success, data } per §2; meta.total is a real
>    COUNT(*).
> 5. Before coding, resolve the two OPEN DECISIONS with me: (a) listing scoping (legacy has none —
>    recommend an optional created_by=me filter), (b) delete guard for INPROCESS/APPROVED rows
>    (recommend 409). Do not decide these yourself.
>
> DONE WHEN
> - T-01…T-18 in README §11 are covered by tests that exercise the real endpoints.
> - The project's typecheck/lint/test suite passes with no new suppressions.
> - You report which checks you ran, which failed, and anything you could not verify.
> ```

---

*Generated for the Zamil Plastic HR revamp. Legacy of record: `pmform_codebase` (CodeIgniter) —
`Rec_change` module. The full specification is README_personal_status_change_form.md in the
repository root.*
