# Employee Report Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** the **Employee Report** screen for contractor employees
> (`XXZP.XX_CON_EMPLOYEE_INFO`) and the endpoints it actually depends on:
> **Listing with filters + pagination**, **Read** of a single employee (the `Employee#` link
> target), **Delete** (the row action), the **lookup APIs** behind the filter bar and the linked
> Employee form, and the **Create / Update** writes of that linked form — the only write paths
> reachable from this report.
>
> **This module has NO workflow:** there is no approval chain, no email, no PDF, no status
> transition. `STATUS` is a plain `Active | Inactive` flag maintained by editing the employee.
> Everything excluded is catalogued in §8.
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
>
> - `controllers/Contractor.php` — `employee_report()` (report screen), `employee()` (the
>   create/edit screen opened by the `Employee#` link), `delete_employee($id)`,
>   `add_employee()`, `contractor_detail($id)`
> - `controllers/ebs/Contractor.php` — identical route set for the `ebs` deployment
> - `models/employee_model.php` — `fetch_employee`, `fetch_dept`, `fetchEmployeeData`,
>   `fetch_dep`, `fetch_job_titles`, `fetch_bosses`, `add_employee`, `update_employee`
> - `models/ebs/employee_model.php` — same methods, second database group
> - `views/contractor/employee_report.php` (+ `views/ebs/contractor/employee_report.php`) —
>   filter bar + DataTables listing
> - `views/contractor/employee.php`, `views/contractor/update_employee.php` — the two legacy
>   edit screens (see §5.1)
>
> **Database:** Oracle, schema `XXZP`. Two CodeIgniter connection groups exist
> (`default` → `ZPIL`, `ebs` → `ZPIL` as `apps`); both read and write the **same** tables.
> All SQL below uses **bind variables** — never string-concatenate user input (the legacy code
> does; do not copy that habit). Credentials stay in the environment / config, never in code.
>
> **Related specs (repository root):** `README_orientation_training_form.md`,
> `README_interview_assessment_form.md` — same structure and conventions.

---

## 1. Data Model

One flat table. **No header/line split and no flag table**, and no UUID is read or written by
this module.

| #   | Table                            | Role                                                  |
| --- | -------------------------------- | ----------------------------------------------------- |
| 1   | `XXZP.XX_CON_EMPLOYEE_INFO`      | The employee record shown, filtered, edited, deleted  |
| 2   | `XXZP.XX_CONTRACTOR_INFO`        | Parent contractor (lookup + `CON_NUMBER` validation)  |

### 1.1 `XXZP.XX_CON_EMPLOYEE_INFO`

| Column               | Type (inferred) | Legacy form field                        | Notes                                                                                                  |
| -------------------- | --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `EMP_ID`             | NUMBER PK       | hidden `EMP_ID` (`0` for a new record)   | EBS app: `NVL(MAX(EMP_ID)+1,1)`. Default app: DB-generated, read back as `MAX(EMP_ID)` — §5.3           |
| `EMPLOYEE_NUMBER`    | NUMBER          | readonly `EMPLOYEE_NUMBER`               | generated per contractor — §5.3                                                                        |
| `EMPLOYEE_NAME`      | VARCHAR2        | `EMPLOYEE_NAME`                          | full name                                                                                              |
| `DIVISION`           | VARCHAR2        | `DIVISION`                               | BU code — §1.3                                                                                         |
| `IQAMAH`             | NUMBER          | `IQAMAH`                                 | iqama / ID number                                                                                      |
| `DEPARTMENT`         | VARCHAR2        | `DEPARTMENT`                             | enum `Production` \| `QC` \| `Maintenance` \| `W/H` \| `Admin`                                         |
| `PROD_DEP`           | VARCHAR2        | `PROD_DEP`                               | section/organization id from the section lookup; enabled only when `DEPARTMENT = 'Production'`         |
| `DIRECT_BOSS`        | VARCHAR2        | hidden `DIRECT_BOSS`                     | boss **name**, derived from `DIRECT_BOSS_ID`                                                           |
| `DIRECT_BOSS_ID`     | NUMBER          | `DIRECT_BOSS_ID`                         | person id from the boss lookup                                                                         |
| `JOB`                | NUMBER          | `JOB`                                    | job id from the job-title lookup                                                                       |
| `JOB_TITLE`          | VARCHAR2        | hidden `JOB_TITLE`                       | job **name**, derived from `JOB`                                                                       |
| `PLACE`              | VARCHAR2        | `PLACE`                                  | place of work                                                                                          |
| `REPLACEMENT`        | NUMBER          | `REPLACEMENT`                            | replacement employee number                                                                            |
| `RATE`               | NUMBER          | `RATE`                                   | hourly rate                                                                                            |
| `START_DATE`         | DATE            | `START_DATE`                             | employment from                                                                                        |
| `END_DATE`           | DATE            | `END_DATE`                               | employment to, **nullable** (open-ended)                                                               |
| `STATUS`             | VARCHAR2        | `STATUS`                                 | `Active` \| `Inactive` — **not** a workflow status                                                     |
| `AJEER`              | VARCHAR2        | `AJEER` (checkbox)                       | literal `'on'` or `NULL` (legacy stores the raw checkbox value)                                        |
| `SFDA`               | VARCHAR2        | `SFDA` (checkbox)                        | literal `'on'` or `NULL`                                                                               |
| `BLACKLIST`          | VARCHAR2        | `BLACKLIST` (checkbox)                   | literal `'on'` or `NULL`                                                                               |
| `REMARK`             | VARCHAR2(4000)  | `REMARK`                                 | free text                                                                                              |
| `CON_NUMBER`         | NUMBER          | `CON_NUMBER`                             | contractor number; joins `XX_CONTRACTOR_INFO.CON_NUMBER`                                               |
| `CON_NAME`           | VARCHAR2        | `CON_NAME`                               | **denormalized** copy of the contractor name                                                           |
| `CREATEB_BY`         | NUMBER          | —                                        | authenticated user id (**misspelling is the real column name**)                                        |
| `CREATION_DATE`      | DATE            | —                                        | audit                                                                                                  |
| `UPDATED_BY`         | NUMBER          | —                                        | update only                                                                                            |
| `UPDATED_DATE`       | DATE            | —                                        | update only                                                                                            |

### 1.2 `XXZP.XX_CONTRACTOR_INFO` (lookup / parent)

| Column                          | Type (inferred) | Notes                                        |
| ------------------------------- | --------------- | -------------------------------------------- |
| `CON_ID`                        | NUMBER PK       | `NVL(MAX(CON_ID)+1,1)` in legacy              |
| `CON_NUMBER`                    | NUMBER          | matched by `XX_CON_EMPLOYEE_INFO.CON_NUMBER` |
| `CON_NAME`                      | VARCHAR2        | copied into the employee row                 |
| `START_DATE` / `END_DATE`       | DATE            | contract period                              |
| `STATUS`                        | VARCHAR2        | `Active` \| `Inactive`                       |
| `RATE`                          | NUMBER          | default hourly rate, pre-fills the form      |
| `CREATEB_BY`, `CREATION_DATE`, `UPDATED_BY`, `UPDATED_DATE` | audit | same misspelling as above |

The employee row keeps its own `CON_NAME` snapshot: the report reads only
`XX_CON_EMPLOYEE_INFO` and never joins, so a contractor rename does **not** change old rows.

### 1.3 `DIVISION` values (two deployments, mixed legacy data)

| Deployment          | Stored `DIVISION`                                          | Filter dropdown |
| ------------------- | ---------------------------------------------------------- | --------------- |
| Default app (create screen) | Fusion BU id from `APP_BU_INFO` in `config/constants.php` (`300000003618177` = IPP BU, `300000003618190` = FPP BU) | BU ids |
| Default app (legacy `update_employee` screen) | `IBM` or `Z3P`                            | —               |
| EBS app             | `IBM` (IPP BU) or `Z3P` (FPP BU)                            | `IBM` / `Z3P`   |

Consequence: production data can contain **either** form. The new API must keep the filter an
exact match until a normalization decision is made (`IBM`/`Z3P` ↔ BU id). The EBS listing
additionally maps `IBM → IPP`, `Z3P → FPP` for display only — that mapping belongs in the
frontend, not in an API response.

---

## 2. API Surface

Base path: `/api/v1/hr/contractor-employees`
Auth: session (`authenticate`); `created_by` / `updated_by` from `req.auth` — never the body.
Permission codes below are the proposed new codes (legacy has only a session check).

| Method   | Endpoint                                          | Permission Code                        | Purpose                                                        |
| -------- | ------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/v1/hr/contractor-employees`                 | `HR.CONTRACTOR_EMPLOYEES.VIEW`         | **Listing with filters** + pagination (the report grid)        |
| `GET`    | `/api/v1/hr/contractor-employees/:empId`          | `HR.CONTRACTOR_EMPLOYEES.VIEW`         | **Read** one employee (target of the `Employee#` link)         |
| `DELETE` | `/api/v1/hr/contractor-employees/:empId`          | `HR.CONTRACTOR_EMPLOYEES.DELETE`       | **Delete** one employee (the row trash action)                 |
| `POST`   | `/api/v1/hr/contractor-employees`                 | `HR.CONTRACTOR_EMPLOYEES.CREATE`       | **Insert** (linked Employee form)                              |
| `PUT`    | `/api/v1/hr/contractor-employees/:empId`          | `HR.CONTRACTOR_EMPLOYEES.UPDATE`       | **Update** (linked Employee form)                              |
| `GET`    | `/api/v1/hr/contractor-employees/lookups/:name`   | `HR.CONTRACTOR_EMPLOYEES.VIEW`         | Lookup lists — §6 (`divisions` … `departments`)                |
| `GET`    | `/api/v1/hr/contractors/:conNumber`               | `HR.CONTRACTOR_EMPLOYEES.VIEW`         | Contractor auto-fill (legacy `contractor_detail`) — §6.3       |

Implementation note: register the literal `/lookups/:name` route **before** `/:empId`, or a
request for `lookups` will be parsed as an employee id.

**Universal responses**

```jsonc
{ "success": true, "data": { ... } }                                  // 200
{ "success": true, "data": { ... }, "meta": { ... } }                // 200 listing
{ "success": true, "data": { "emp_id": 1234 } }                      // 201 created
{ "success": false, "message": "Employee not found" }                // 404
{ "success": false, "message": "Validation failed", "errors": [] }   // 400
{ "success": false, "message": "Unauthorized" }                      // 401 / 403
```

Legacy used `set_flashdata` + `redirect` (HTML), so every JSON shape above is new. Keep
`success` and `message` identical to the sibling forms so one frontend helper serves all modules.

---

## 3. `GET /api/v1/hr/contractor-employees` — Listing with filters

### 3.1 Query parameters

| Param               | Legacy name           | Type / values                          | Maps to (SQL)                                          |
| ------------------- | --------------------- | -------------------------------------- | ------------------------------------------------------ |
| `division`          | `org`                 | BU code, `IBM`, `Z3P`, `ALL`, omitted  | `DIVISION = :division` (omitted / empty / `ALL` = no filter) |
| `department`        | `dept`                | text, `ALL`, omitted                   | `DEPARTMENT = :department` (omitted / empty / `ALL` = no filter) |
| `contractor_number` | `c_no`                | integer                                | `CON_NUMBER = :contractorNumber`                       |
| `status`            | `status`              | `Active` \| `Inactive` \| `ALL`        | `STATUS = :status` (omitted / empty / `ALL` = no filter) |
| `date_from`         | `from`                | `YYYY-MM-DD`                           | `START_DATE >= :dateFrom`                              |
| `date_to`           | `to`                  | `YYYY-MM-DD`                           | `END_DATE <= :dateTo`                                  |
| `page`              | —                     | integer ≥ 1 (default `1`)              | pagination                                             |
| `limit`             | —                     | integer 1–200 (default `50`)           | pagination                                             |
| `sort`              | —                     | `employee_number` \| `employee_name` \| `start_date` \| `end_date` \| `status` \| `con_number` (default `employee_number`) | `ORDER BY` |
| `order`             | —                     | `asc` \| `desc` (default `asc`)        | `ORDER BY`                                             |

The legacy `action=search` switch only toggles "apply filters or return everything"; the new
endpoint always accepts the filters and treats all-empty as "everything". `ALL` is still
accepted on `division`, `department` and `status` so an unchanged legacy client keeps working.

### 3.2 Filter semantics (verified against legacy)

All conditions are ANDed. Only these six exist — do not add unrequested filters.

| Filter        | Behaviour when supplied                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| `division`    | Exact match, case-sensitive (`DECODE` in the EBS model is an equality in disguise)       |
| `department`  | Exact match                                                                             |
| `status`      | Exact match                                                                             |
| `contractor_number` | Exact match on `CON_NUMBER`                                                       |
| `date_from`   | `START_DATE >= date_from` — i.e. employment starts on/after the date                    |
| `date_to`     | `END_DATE <= date_to` — i.e. employment ends on/before the date                         |

Two behaviours must be **decided, not silently copied**:

1. **`date_to` excludes open-ended employees.** Legacy `'$to' >= END_DATE` is false when
   `END_DATE IS NULL`, so employees with no end date disappear from a filtered report.
   Recommended: `(:dateTo IS NULL OR END_DATE IS NULL OR END_DATE <= :dateTo)`.
2. **The pair is a "contract period inside range" filter**, not "active during range". If
   product expects the latter, the predicate becomes
   `START_DATE <= :dateTo AND (END_DATE IS NULL OR END_DATE >= :dateFrom)`.
   Confirm before implementing; document the answer in the PR.

### 3.3 SQL (parameterized)

```sql
SELECT EMP_ID, EMPLOYEE_NUMBER, DIVISION, DEPARTMENT,
       CON_NUMBER, CON_NAME, EMPLOYEE_NAME,
       TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
       TO_CHAR(END_DATE,   'YYYY-MM-DD') AS END_DATE,
       STATUS
FROM XXZP.XX_CON_EMPLOYEE_INFO
WHERE (:division         IS NULL OR DIVISION = :division)
  AND (:department       IS NULL OR DEPARTMENT = :department)
  AND (:status           IS NULL OR STATUS = :status)
  AND (:conNumber        IS NULL OR CON_NUMBER = :conNumber)
  AND (:dateFrom         IS NULL OR START_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
  AND (:dateTo           IS NULL OR END_DATE   <= TO_DATE(:dateTo,   'YYYY-MM-DD'))
ORDER BY EMPLOYEE_NUMBER ASC, EMP_ID ASC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY;
```

The count query repeats the same `WHERE` with `SELECT COUNT(*)`. Always append `EMP_ID` as the
final tie-breaker to the `ORDER BY` (as above) so page boundaries are stable when the sort key is
not unique. `OFFSET/FETCH` needs Oracle 12c+; wrap with `ROWNUM` for older versions. Never build
the `WHERE` by concatenation.

### 3.4 Response body

Fields the report grid renders (column order is a frontend concern):

| Report column    | API field        |
| ---------------- | ---------------- |
| `#`              | `row_no` (computed by the frontend: `(page - 1) * limit + index + 1`) |
| `Employee#`      | `employee_number` (link → `emp_id`) |
| `Division`       | `division`       |
| `Department`     | `department`     |
| `Contractor Name`| `con_name`       |
| `Contractor#`    | `con_number`     |
| `Emp Name`       | `employee_name`  |
| `Start Date`     | `start_date` (`YYYY-MM-DD`) |
| `End Date`       | `end_date` (`YYYY-MM-DD`, `null` allowed) |
| `Status`         | `status`         |
| `Action`         | — (DELETE via `emp_id`) |

```jsonc
{
  "success": true,
  "data": [
    {
      "emp_id": 1234,
      "employee_number": 70001,
      "division": "IBM",
      "department": "Production",
      "con_number": 88,
      "con_name": "ABC Manpower",
      "employee_name": "JOHN DOE",
      "start_date": "2026-01-01",
      "end_date": null,
      "status": "Active"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 1, "total_pages": 1 }
}
```

`total` must come from the count query, **not** from `data.length`.

### 3.5 Export

The legacy grid renders **every** row into the DOM and exports client-side with DataTables
buttons (`copy`, `csv`, `excel`, `pdf`, `print`). There is no export endpoint. Do not invent a
server-side export for this revamp unless product asks for one; if it is asked for, export must
run the same `WHERE` without pagination.

---

## 4. Read and Delete

### 4.1 `GET /api/v1/hr/contractor-employees/:empId`

Returns the full record, for the `Employee#` link target (legacy opened
`contractor/employee/{EMP_ID}` in a new tab).

```jsonc
{
  "success": true,
  "data": {
    "emp_id": 1234,
    "employee_number": 70001,
    "employee_name": "JOHN DOE",
    "division": "IBM",
    "iqamah": 2412345678,
    "department": "Production",
    "prod_dep": "300000001234567",
    "direct_boss": "ALI HASSAN",
    "direct_boss_id": 2519,
    "job": 4711,
    "job_title": "OPERATOR",
    "place": "PLANT 1",
    "replacement": null,
    "rate": 12.5,
    "start_date": "2026-01-01",
    "end_date": null,
    "status": "Active",
    "ajeer": true,
    "sfda": false,
    "blacklist": false,
    "remark": null,
    "con_number": 88,
    "con_name": "ABC Manpower",
    "created_by": 9001,
    "creation_date": "2026-01-01T08:00:00.000Z",
    "updated_by": 9001,
    "updated_date": "2026-01-01T08:00:00.000Z"
  }
}
```

Rules:
- `empId` must be numeric → `400` otherwise; unknown id → `404`.
- Convert `AJEER` / `SFDA` / `BLACKLIST` from the stored `'on'`/`NULL` into booleans on read
  (and back to `'on'`/`NULL` on write — other legacy screens compare against the literal `'on'`).
- Expose `direct_boss_id` and `job` alongside the derived names so the form can preselect them.

### 4.2 `DELETE /api/v1/hr/contractor-employees/:empId`

- Hard delete: `DELETE FROM XXZP.XX_CON_EMPLOYEE_INFO WHERE EMP_ID = :empId`.
- One row expected; `0` rows → `404`; success → `204` (or `200` with `{ "success": true }`).
- No child tables exist, so no cascade is required.
- Deletion does **not** touch attendance/punch history (`ZPI.ICLOCK_TRANSACTION` is matched by
  `EMPLOYEE_NUMBER`, not by `EMP_ID`); say so in the API description so nobody assumes otherwise.
- Legacy triggered this from a `GET` link with `confirm()`; the new API must use `DELETE` with
  the permission check. Never delete from a `GET`.
- If product prefers deactivation over hard delete, `PUT` with `status = "Inactive"` already
  covers it — do not add a soft-delete column without a decision.

---

## 5. Write endpoints of the linked Employee form

The report has no save action of its own; its only writes are **Delete** and the **Employee form**
behind the `Employee#` link. That form is where `status` is flipped to `Inactive`, so its
`Create`/`Update` belong to this spec.

### 5.1 Two legacy edit paths (one new `PUT`)

| Legacy path                              | Screen                          | Posts to                 | Behaviour                                                     |
| ---------------------------------------- | ------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `contractor/employee/{EMP_ID}`           | `views/contractor/employee.php` | `contractor/add_employee`| Insert when `EMP_ID` does not exist, update when it does       |
| `contractor/update_employee/{EMP_ID}`    | `views/contractor/update_employee.php` | `contractor/update_employee_data` | Update only, reduced field set (no job/section/boss lookups) |

Both paths become `POST` (create) + `PUT` (update). The reduced screen's fields are a subset of
the full form, so no separate endpoint is needed.

### 5.2 Payload (create and update use the same body)

```jsonc
{
  "division": "IBM",
  "con_number": 88,
  "status": "Active",
  "rate": 12.5,
  "employee_name": "JOHN DOE",
  "iqamah": 2412345678,
  "department": "Production",
  "prod_dep": "300000001234567",
  "job": 4711,
  "direct_boss_id": 2519,
  "place": "PLANT 1",
  "replacement": null,
  "start_date": "2026-01-01",
  "end_date": null,
  "ajeer": true,
  "sfda": false,
  "blacklist": false,
  "remark": null
}
```

`EMP_ID`, `EMPLOYEE_NUMBER`, `CON_NAME`, `JOB_TITLE` and `DIRECT_BOSS` are **server-owned**:
ignore them if sent. Derive `con_name` from `XX_CONTRACTOR_INFO`, `job_title` from the job
lookup and `direct_boss` from `DIRECT_BOSS_ID`.

`con_number` may be corrected on update; `con_name` is then re-derived. `employee_number` is
**not** regenerated when the contractor changes — it is a historical identifier, so renumbering
is out of scope.

Validation:

| Field             | Rule                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- |
| `division`        | required; must belong to the configured BU code set — §1.3                            |
| `con_number`      | required; must exist in `XX_CONTRACTOR_INFO` (legacy posted a select value but never validated it → fix) |
| `status`          | required; `Active` \| `Inactive`                                                      |
| `rate`            | required; number ≥ 0                                                                  |
| `employee_name`   | required; ≤ 150 chars                                                                 |
| `iqamah`          | required; integer                                                                     |
| `department`      | required; one of `Production`, `QC`, `Maintenance`, `W/H`, `Admin`                    |
| `prod_dep`        | required when `department = 'Production'`; ignored/`null` otherwise (legacy disables it) |
| `job`             | required; must exist in the job lookup                                                |
| `direct_boss_id`  | required; must exist in the boss lookup                                               |
| `start_date`      | required; `YYYY-MM-DD`                                                                |
| `end_date`        | optional; must be ≥ `start_date`                                                      |
| `ajeer` / `sfda` / `blacklist` | optional booleans, default `false`                                        |
| `remark`          | optional; ≤ 4000 chars                                                                |
| `place`, `replacement` | optional                                                                         |

### 5.3 ID / number generation

```sql
-- EMP_ID (EBS behaviour; replace with a sequence/identity if one exists)
SELECT NVL(MAX(EMP_ID) + 1, 1) AS ID FROM XXZP.XX_CON_EMPLOYEE_INFO;

-- EMPLOYEE_NUMBER: next number within the contractor group, seeded from CON_NUMBER
SELECT NVL(MAX(EMPLOYEE_NUMBER) + 1, :conNumber) AS NUM
FROM XXZP.XX_CON_EMPLOYEE_INFO
WHERE CON_NUMBER = :conNumber;
```

Both must run **inside the same transaction** as the insert. `MAX + 1` is not concurrency-safe:
serialize with `SELECT ... FOR UPDATE` on the contractor row (or use a sequence) and handle the
unique-key collision with a retry. `EMPLOYEE_NUMBER` is read-only on create and is not renumbered
on update: the main legacy form posted it back unchanged, and the reduced screen's ability to
edit it is dropped.

### 5.4 SQL

```sql
INSERT INTO XXZP.XX_CON_EMPLOYEE_INFO (
  EMP_ID, EMPLOYEE_NUMBER, EMPLOYEE_NAME, DIVISION, IQAMAH, DEPARTMENT, PROD_DEP,
  DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE, PLACE, REPLACEMENT, RATE,
  START_DATE, END_DATE, STATUS, AJEER, SFDA, BLACKLIST, REMARK,
  CON_NUMBER, CON_NAME, CREATEB_BY, CREATION_DATE
) VALUES (
  :empId, :employeeNumber, :employeeName, :division, :iqamah, :department, :prodDep,
  :directBoss, :directBossId, :job, :jobTitle, :place, :replacement, :rate,
  TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), :status,
  :ajeer, :sfda, :blacklist, :remark,
  :conNumber, :conName, :createdBy, SYSDATE
);
```

```sql
UPDATE XXZP.XX_CON_EMPLOYEE_INFO SET
  EMPLOYEE_NAME = :employeeName,
  DIVISION      = :division,
  IQAMAH        = :iqamah,
  DEPARTMENT    = :department,
  PROD_DEP      = :prodDep,
  DIRECT_BOSS   = :directBoss,
  DIRECT_BOSS_ID= :directBossId,
  JOB           = :job,
  JOB_TITLE     = :jobTitle,
  PLACE         = :place,
  REPLACEMENT   = :replacement,
  RATE          = :rate,
  START_DATE    = TO_DATE(:startDate, 'YYYY-MM-DD'),
  END_DATE      = TO_DATE(:endDate,   'YYYY-MM-DD'),
  STATUS        = :status,
  AJEER         = :ajeer,
  SFDA          = :sfda,
  BLACKLIST     = :blacklist,
  REMARK        = :remark,
  CON_NUMBER    = :conNumber,
  CON_NAME      = :conName,
  UPDATED_BY    = :updatedBy,
  UPDATED_DATE  = SYSDATE
WHERE EMP_ID = :empId;
```

Submit `NULL` explicitly for `END_DATE` (an all-null `END_DATE` must clear the column — legacy's
`update_employee` could not clear values because unchecked checkboxes were simply absent).

### 5.5 Legacy date storage

Legacy formats dates as PHP `d-M-Y` upper-cased (`28-OCT-2026`) and lets Oracle implicitly
convert the string, relying on `NLS_DATE_FORMAT`. The API must **accept** `YYYY-MM-DD`, bind
with `TO_DATE`, and **return** `YYYY-MM-DD`. Do not compare a string to a `DATE` column.

---

## 6. Lookup APIs

`GET /api/v1/hr/contractor-employees/lookups/:name` → `{ "success": true, "data": [{ "value": "...", "label": "..." }] }`

### 6.1 For the report filter bar

| `:name`       | Legacy source                                                                                                   | Notes |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ----- |
| `divisions`   | `APP_BU_INFO` (`config/constants.php`) on the default app; hard-coded `IBM`/`Z3P` on EBS                          | Add `ALL` client-side, not in the list |
| `departments` | `SELECT DISTINCT DEPARTMENT FROM XXZP.XX_CON_EMPLOYEE_INFO WHERE DEPARTMENT IS NOT NULL` (+ `'ALL'` via `UNION`) | Legacy returns rows shaped `{ DEPARTMENT: value }`; the new API returns `value`/`label` |

### 6.2 For the Employee form

| `:name`      | Legacy SQL (default app)                                                                                   | EBS variant |
| ------------ | ---------------------------------------------------------------------------------------------------------- | ----------- |
| `contractors`| `SELECT DISTINCT CON_ID, CON_NUMBER, CON_NAME FROM XXZP.XX_CONTRACTOR_INFO`                                | same        |
| `jobs`       | `SELECT DISTINCT JOB_ID, JOB_TITLE FROM XX_DIGI_EMP_MASTER ORDER BY 1`                                      | `SELECT DISTINCT JOB_ID, NAME FROM PER_JOBS_TL WHERE LANGUAGE = 'US' ORDER BY 1` |
| `bosses`     | `SELECT DISTINCT PERSON_ID, FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE FULL_NAME IN (SELECT DISTINCT SUPERVISOR_NAME FROM XX_DIGI_EMP_MASTER) AND CURRENT_EMP_FLAG = 'Y'` | `PER_PEOPLE_X` / `PER_ASSIGNMENTS_X` (active, production orgs, payroll 21/22/61) |
| `sections`   | `SELECT DISTINCT ORGANIZATION_ID, ORGANIZATION_NAME FROM XX_DIGI_EMP_MASTER ORDER BY 1`                     | `SELECT DISTINCT ORGANIZATION_ID, NAME FROM HR_ORGANIZATION_UNITS WHERE TYPE = 'SEC'` |

EBS `bosses` also appends two hard-coded people (`1190`, `2519`) to the query — reproduce only
if it is still required.

### 6.3 Contractor auto-fill

`GET /api/v1/hr/contractors/:conNumber` (legacy `contractor/contractor_detail/{CON_NUMBER}`)
returns `con_name`, `status`, `rate` from `XXZP.XX_CONTRACTOR_INFO` so the form can pre-fill
those fields when a contractor is picked. The server must still derive `con_name` on save —
auto-fill is a convenience, not a trust boundary.

---

## 7. Legacy bugs — do not reproduce

| #   | Legacy behaviour                                                                                                     | Fix in the new API |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | `employee_report()` has **no session check** (every sibling action checks `FormsSession`)                             | authenticate + permission code |
| 2   | Every filter and id is interpolated into SQL (`"$div"`, `$dept`, `$num`, `$id`)                                       | bound variables only |
| 3   | `'$from' <= START_DATE` compares a **string** to a `DATE` (NLS-dependent)                                            | `TO_DATE` on both sides |
| 4   | No `ORDER BY` and no pagination; DataTables sorts/filters client-side                                                | deterministic `ORDER BY` + server pagination |
| 5   | `update_employee()` reads `Cnum` / `Cname` but **never writes** `CON_NUMBER` / `CON_NAME`                             | persist both, derive `CON_NAME` server-side |
| 6   | `update_employee()` never writes `JOB_TITLE` / `DIRECT_BOSS_ID`                                                      | persist both |
| 7   | Unchecked checkboxes are absent from the POST, so they can never be cleared                                           | explicit `NULL` |
| 8   | `add_employee()` (default app) sets `DIVISION = $div['DIVISION']` where `$div` is undefined → `DIVISION` is `NULL`   | take `division` from the validated body |
| 9   | `MAX(...)+1` id/number generation races under concurrent saves                                                       | sequence or `FOR UPDATE` + retry |
| 10  | Delete is a `GET` link (`contractor/delete_employee/{id}`)                                                           | `DELETE` + CSRF-safe client |
| 11  | Default-app report BU dropdown uses `$fatch['ORG']` (undefined) so the selected division is lost after a search       | frontend keeps filter state from the URL/query |
| 12  | `employee_report` returns all rows when not filtered — no limit                                                      | `limit` cap 200 |
| 13  | Report prints `DIVISION` raw, so `IBM`, `Z3P` and BU ids all appear                                                  | map codes → labels in the frontend |

---

## 8. Out of scope (do not implement)

- Any workflow, approval, email or notification — **this module has none**.
- PDF generation / server-side export (legacy export is client-side DataTables only).
- Contractor CRUD (`contractor/contractor`, `add_contractor`), the contractor report
  (`contractor_report`) and the contractor summary / attendance-hours screens
  (`contractor/summary`, `contractor/test`).
- The legacy duplicate screen `contractor/update_employee/{id}` — a reduced edit form whose
  fields are covered by `PUT` (§5.1); `update_employee_data` is that screen's POST handler.
- `fetch_summary`, `fetch_summary_report`, `fetchDataHeader`, `fetch_summary_stats`,
  `calculateIRR`, `calculateNPV`, `testIRR`, `testNPV` in the controllers/models — unrelated
  utilities and dead/`return []` stubs.
- Job/section/boss master maintenance — the lookups are read-only here.

---

## 9. Legacy → new endpoint map

| Legacy URL (CodeIgniter, no custom routes)        | New endpoint |
| ------------------------------------------------- | ------------ |
| `contractor/employee_report`                      | `GET /api/v1/hr/contractor-employees` |
| `contractor/employee_report?action=search&org=&dept=&c_no=&status=&from=&to=` | `GET /api/v1/hr/contractor-employees?division=&department=&contractor_number=&status=&date_from=&date_to=` |
| `contractor/employee/{EMP_ID}`                    | `GET /api/v1/hr/contractor-employees/:empId` |
| `contractor/add_employee` (POST)                  | `POST /api/v1/hr/contractor-employees` |
| `contractor/update_employee_data` (POST)          | `PUT /api/v1/hr/contractor-employees/:empId` |
| `contractor/delete_employee/{EMP_ID}`             | `DELETE /api/v1/hr/contractor-employees/:empId` |
| `contractor/contractor_detail/{CON_NUMBER}`       | `GET /api/v1/hr/contractors/:conNumber` |
| `employee_model->fetch_dept()` (dropdown)         | `GET /api/v1/hr/contractor-employees/lookups/departments` |
| `APP_BU_INFO` (dropdown)                          | `GET /api/v1/hr/contractor-employees/lookups/divisions` |

Deployments `contractor/*` and `ebs/contractor/*` share one API; the environment selects the
database connection, not a different route set.

---

## 10. Acceptance checklist

| #    | Test                                                                                                       | Expected |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------- |
| T-01 | `GET /contractor-employees` with no params                                                                 | `200`, first page of all employees, `meta.total` = table count |
| T-02 | `GET` with `department=Production`                                                                          | only Production rows |
| T-03 | `GET` with `department=ALL` and `status=ALL`                                                                | identical to T-01 (no filters applied) |
| T-04 | `GET` with `contractor_number=88`                                                                           | only that contractor's employees |
| T-05 | `GET` with `date_from=2026-01-01&date_to=2026-12-31`                                                        | rows whose period is inside the range; open-ended behaviour matches the decision from §3.2 |
| T-06 | `GET` with `page=2&limit=10`                                                                                | 10 rows, correct `meta`, no overlap with page 1 |
| T-07 | `GET /contractor-employees/999999999`                                                                       | `404` |
| T-08 | `GET /contractor-employees/abc`                                                                              | `400` |
| T-09 | `POST` valid body                                                                                            | `201`; `EMPLOYEE_NUMBER` = `MAX + 1` for that `CON_NUMBER`; `CREATEB_BY` = token user |
| T-10 | `POST` with `con_number` not in `XX_CONTRACTOR_INFO`                                                         | `400` |
| T-11 | `POST` with `department=QC` and no `prod_dep`                                                                | `201`, `PROD_DEP` null |
| T-12 | `PUT` changing `status` to `Inactive`                                                                        | `200`; record shows `Inactive` in the listing |
| T-13 | `PUT` clearing `end_date`, `remark` and `blacklist`                                                          | `200`; all three are `null`/`false` afterwards |
| T-14 | `PUT` changing `con_number`                                                                                  | `200`; `CON_NUMBER` **and** `CON_NAME` updated |
| T-15 | `DELETE` existing id                                                                                         | `204`; row gone; second call `404` |
| T-16 | `DELETE` without permission                                                                                  | `403`, row still present |
| T-17 | Any filter containing `' OR 1=1 --`                                                                          | literal match, no error, no injection |
| T-18 | Read back after create                                                                                       | dates `YYYY-MM-DD`, checkbox flags booleans |

---

## 11. Implementation prompt (copy-ready)

Paste the block below into a coding agent together with this file. It is scoped to the backend
API only; the React screen is not part of it.

```text
ROLE
You are implementing the backend REST API for the Contractor Employee Report module of this
repository. The full specification is README_employee_report_form.md in the repository root.
Read it first and treat it as the single source of truth. Do not re-derive behaviour from the
legacy CodeIgniter code; it is reference only and contains bugs listed in section 7 that you
must NOT reproduce.

GOAL
Replace these legacy screens with one JSON API used by the report grid and the Employee form
it links to:
- the report listing with filters and pagination (GET)
- the employee record read (GET one)
- delete from the report row (DELETE)
- the create and update of the employee form behind the Employee# link (POST / PUT)
- the lookups the filter bar and the form need (GET)

NON-GOALS - do not implement, add columns, or add endpoints for any of these:
workflow / approval / email / notifications, PDF or server-side export, contractor CRUD or
contractor report, contractor summary or attendance-hours screens, punch-clock data, IRR/NPV
helpers, job/section/boss master maintenance, soft delete, audit history tables, i18n, or extra
filters beyond the six in section 3.2.

ENDPOINTS (base path /api/v1/hr)
GET    /contractor-employees                 HR.CONTRACTOR_EMPLOYEES.VIEW
GET    /contractor-employees/:empId          HR.CONTRACTOR_EMPLOYEES.VIEW
DELETE /contractor-employees/:empId          HR.CONTRACTOR_EMPLOYEES.DELETE
POST   /contractor-employees                 HR.CONTRACTOR_EMPLOYEES.CREATE
PUT    /contractor-employees/:empId          HR.CONTRACTOR_EMPLOYEES.UPDATE
GET    /contractor-employees/lookups/:name   HR.CONTRACTOR_EMPLOYEES.VIEW
GET    /contractors/:conNumber               HR.CONTRACTOR_EMPLOYEES.VIEW
Register /lookups/:name before /:empId.

DATA
Oracle, schema XXZP. Employee table XXZP.XX_CON_EMPLOYEE_INFO, parent XXZP.XX_CONTRACTOR_INFO.
Use the exact column names from section 1, including CREATEB_BY (misspelled in the database).
AJEER / SFDA / BLACKLIST store the literal 'on' or NULL: accept and return booleans at the API
boundary and map back to 'on' / NULL on write. Dates: accept and return YYYY-MM-DD, bind with
TO_DATE, never compare a string literal to a DATE column.

IMPLEMENTATION RULES
1. Bind variables only. No string concatenation of any request value into SQL, ever.
2. Never trust the body for identity or audit: emp_id and employee_number are server-owned;
   created_by / updated_by come from the authenticated session.
3. Listing: accept division, department, contractor_number, status, date_from, date_to, page,
   limit (default 50, max 200), sort, order. Empty or 'ALL' on division/department/status means
   no filter. Return meta { page, limit, total, total_pages } with total from a COUNT query.
4. Always add EMP_ID as the final ORDER BY tie-breaker so pagination is stable.
5. Create in one transaction: generate EMP_ID and EMPLOYEE_NUMBER (section 5.3) while holding
   the XX_CONTRACTOR_INFO row with SELECT ... FOR UPDATE, or use a sequence; retry once on a
   unique-key collision. Derive CON_NAME, JOB_TITLE and DIRECT_BOSS on the server.
6. Update: persist every editable column including CON_NUMBER, CON_NAME, JOB_TITLE and
   DIRECT_BOSS_ID, and write NULL explicitly to clear columns (end_date, remark, flags).
7. Delete: hard delete by EMP_ID, 204 on success, 404 when absent, never via GET.
8. Validate per the table in section 5.2. Return 400 with { success: false, message:
   'Validation failed', errors: [...] }, 404 for unknown ids, 403 for missing permission.
9. Follow the response envelope in section 2 exactly so the frontend reuses the helper written
   for the other forms in this repo.
10. Keep secrets in the environment; do not paste credentials from config/database.php anywhere.

BEFORE YOU WRITE CODE
Section 3.2 leaves two product decisions open: (a) whether date_to should include employees
with a NULL END_DATE, and (b) whether the date pair means "contract period inside range" or
"active during range". Ask me which behaviour applies, implement the answer, and add it to the
endpoint documentation. Do not silently copy the legacy predicate.

DEFINITION OF DONE
- Every case in section 10 (T-01 to T-18) is covered by an automated test that hits the real
  HTTP endpoints and the real database layer, not a mock of the query.
- The project's typecheck and full test suite pass with no new suppressions.
- Manually exercised once end to end: filter, create, update (including clearing fields),
  read back, delete, and a request that is missing a permission.
- Report what you changed, what you verified, and anything that could not be run.
```
