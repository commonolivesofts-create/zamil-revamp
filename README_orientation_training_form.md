# Orientation Training Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Orientation Training Form** (a.k.a. New Hire
> Training / NHT) — **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup
> (dropdown) APIs and line-row handling. **Workflow / approval / email logic is explicitly OUT of
> scope** — this module has heavy workflow (form code `NHTF`); everything workflow-related is
> catalogued in §11 and must NOT be implemented.
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
> - `controllers/Newhiretrain.php` (`class Newhiretrain`; methods: `index`, `form`, `addNewhiretrain`, `addtrainee`, `newaddtrainee`, `deleteRow`, `submitWorkflow`, `pdf`)
> - `models/Newhiretrain_model.php` (all SQL)
> - `views/ZPIL/nht-new.php` (current create/edit form), `views/update/newhiretrain.php` (legacy edit form)
> - `views/ZPIL/nht_list.php` + `views/ZPIL/filter.php` (listing/report page)
> - `views/ZPIL/nhtplant.php`, `views/ZPIL/nht.php`, `views/ZPIL/nhtpdf.php` (older variants / PDF — out of scope)
> - `controllers/NHT_Flow.php` (workflow engine — excluded)
>
> **Database:** Oracle, schema `XXZP`. All SQL below uses **bind variables** — never
> string-concatenate user input (the legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_interview_assessment_form.md`,
> `README_employment_offer_form.md`, `README_personal_requisition_form.md` — same structure and
> conventions. Do not implement workflow from anywhere.

---

## 1. Data Model

The form has **two variants** chosen by an employee-type flag (`SHARED SERVICE` = Y, `PRODUCTION` =
N). Each variant has its own header + lines table pair, plus a flag-registry table.

| # | Table | Variant | Role |
|---|---|---|---|
| 1 | `XXZP.XXZP_NEW_HIRETRAINING_SS_HDR_T` | Shared Services (Y) | Header |
| 2 | `XXZP.XXZP_NEW_HIRETRAIN_SS_LINE_T` | Shared Services (Y) | Lines (1:N) |
| 3 | `XXZP.XXZP_NEW_HIRETRAIN_PROD_HDR_T` | Production (N) | Header |
| 4 | `XXZP.XXZP_NEW_HIRETRA_PROD_LINES_T` | Production (N) | Lines (1:N) |
| 5 | `XXZP.XXZP_NHT_MASTER_FLAG` | both | Maps `FORM_HEADER_ID` → `TABLE_NAME` ('SHARED'/'PRODUCTION') |

### 1.1 Header tables (`...SS_HDR_T` / `...PROD_HDR_T`)

Same columns for both variants. Legacy generates IDs via `NVL(MAX(HEADER_ID+1),1)` (seed 1,
no sequence/trigger) and reads back by UUID.

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `HEADER_ID` | NUMBER PK | hidden `header_id` | generated `NVL(MAX(HEADER_ID+1),1)` — §3.1 |
| `UUID` | VARCHAR2(36) | — | v4 UUID, generated server-side; read back `HEADER_ID` by UUID |
| `EMPLOYEE_NUMBER` | NUMBER/VARCHAR2 | `empno` | selected employee number |
| `DIVISION` | VARCHAR2 | `section` | employee's section / division |
| `EMPLOYEE_NAME` | VARCHAR2 | `empname` | employee full name |
| `ORIENTATION_DURATION_FROM` | DATE `DD-Mon-YY` | `from_orient` (date) | orientation start date |
| `ORIENTATION_DURATION_TO` | DATE `DD-Mon-YY` | `to_orient` (date) | orientation end date |
| `STARTING_DATE` | DATE `DD-Mon-YY` | `start_date` | employee joining/start date |
| `ORIENTATION_SCHEDULE_BY` | VARCHAR2 | `orientation_by` | who scheduled (defaults to logged-in user name) |
| `STATUS` | VARCHAR2 | `status` (readonly) | enum `Draft` \| `Inprocess` \| `Approved`; **API writes `'Draft'` only** |
| `CREATED_BY` | NUMBER | — | audit = authenticated user id |
| `CREATION_DATE` | DATE `DD-Mon-YY` | — | audit |
| `ATTRIBUTE2` | NUMBER/VARCHAR2 | `person_id` | PERSON_ID from employee details |
| `ATTRIBUTE4` | VARCHAR2 | `division` | employee's division |
| `ATTRIBUTE5` | VARCHAR2 | `reference` | generated ref `${DIVISION}/${yy}/${SEQ3}` e.g. `Production/26/001` |
| `EMP_POSITION` | VARCHAR2 | `position` | employee position |
| `EMP_TYPE` | VARCHAR2 | `type` | employee type (Supervisor/Manager/Employee) |
| `REQ_TYPE` | VARCHAR2 | — | `'new'` on fresh insert (newaddtrainee) |
| `LAST_UPDATED_BY` / `LAST_UPDATE_LOGIN` / `LAST_UPDATE_DATE` | audit | — | update only |

### 1.2 Line tables (`...SS_LINE_T` / `...PROD_LINES_T`)

Same columns for both variants. One header can have N dynamic training lines.

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `DEP_LINE_ID` | NUMBER PK | hidden per-row (legacy `line_id_hidden*`) | generated `NVL(MAX(DEP_LINE_ID+1),1)` |
| `HEADER_ID` | NUMBER FK | hidden `header_id` | |
| `DEPARTMENT` | VARCHAR2 | `skill_name*` | training subject (e.g. "Quality Assurance / Control") |
| `DEPARTMENT_HEAD` | VARCHAR2 | `dept_head*` | manager dropdown for that line |
| `ORIENTATION_PERIOD` | VARCHAR2 | `dept_orient_period*` | computed `X.XX Hrs` from time_from/to |
| `TIME_FROM` | VARCHAR2 | `dept_from_time*` (time) | |
| `TIME_TO` | VARCHAR2 | `dept_to_time*` (time) | |
| `REMARKS` | VARCHAR2 | `dept_remark*` | |
| `CREATED_BY`, `CREATION_DATE` | audit | — | |
| `FROM_DATE`, `TO_DATE` | DATE `DD-Mon-YY` | `dept_from_date*` / `dept_to_date*` (date) | |
| `ORIENTATION_DAYS` | NUMBER | `dept_orient_days*` (computed) | days between from/to |

### 1.3 Flag table

`XXZP.XXZP_NHT_MASTER_FLAG`: `HEADER_ID` (PK, max+1), `FORM_HEADER_ID` (= header id),
`TABLE_NAME` ('SHARED' | 'PRODUCTION'). Query `checkFlagStatus(id)` returns Y/N.

---

## 2. API Surface

Base path: `/api/v1/hr/orientation-trainings`
Auth: session (`authenticate`); `created_by` / `updated_by` from `req.auth` — never the body.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/hr/orientation-trainings` | **Insert** header + lines in ONE transaction |
| `GET` | `/api/v1/hr/orientation-trainings/:headerId` | **Read** header + lines for one record |
| `PUT` | `/api/v1/hr/orientation-trainings/:headerId` | **Update** header + lines (delete-all-lines + reinsert) |
| `DELETE` | `/api/v1/hr/orientation-trainings/:headerId` | **Delete** lines + header (one transaction) |
| `DELETE` | `/.../:headerId/lines/:lineId` | **Delete** a single line row (legacy `deleteRow`) |
| `GET` | `/api/v1/hr/orientation-trainings` | **Listing with filters** + pagination (flag Y or N) |
| `GET` | `.../lookups/flag?empNo=` | shared-service vs production flag (§8.1) |
| `GET` | `.../lookups/employees` | employee list (§8.2) |
| `GET` | `.../lookups/managers` | department-head dropdown (§8.3) |
| `GET` | `.../lookups/employee-details?empNo=` | single employee prefill (§8.4) |
| `GET` | `.../lookups/skills?empType=` | default training list by type (§8.5) |

**Universal responses**
```jsonc
{ "success": true, "data": { ... } }              // 200 / 201
{ "success": false, "message": "Orientation training not found" }   // 404
{ "success": false, "message": "Validation failed", "errors": [...] } // 400
```

---

## 3. INSERT — `POST /api/v1/hr/orientation-trainings`

### 3.1 Key & flag resolution

1. **Flag** (Shared Service Y / Production N):
   ```sql
   SELECT (SELECT decode(upper(ATTRIBUTE1),'SHARED SERVICE','Y','N') FROM XX_DIGI_ORG_INFO
           WHERE ORGANIZATION_ID = paaf.organization_id) AS SHARED_SERVICE
   FROM XX_DIGI_ASSIGNMENT_INFO paaf
   WHERE PRIMARY_FLAG='Y' AND ASSIGNMENT_TYPE='E'
     AND PERSON_ID = (SELECT DISTINCT person_id FROM XX_DIGI_EMP_DETAILS
                      WHERE EMPLOYEE_NUMBER = :empNo)
     AND TRUNC(SYSDATE) BETWEEN TRUNC(effective_start_date) AND TRUNC(effective_end_date);
   ```
   → pick header/lines table pair: Y → `XXZP_NEW_HIRETRAINING_SS_HDR_T` /
   `XXZP_NEW_HIRETRAIN_SS_LINE_T`; N → `XXZP_NEW_HIRETRAIN_PROD_HDR_T` /
   `XXZP_NEW_HIRETRA_PROD_LINES_T`.

2. **HEADER_ID**: `SELECT NVL(MAX(HEADER_ID+1), 1) AS ID FROM <header_table>` inside the transaction.
3. **UUID**: `crypto.randomUUID()`; insert header WITHOUT PK column, read back `HEADER_ID` by UUID
   (`SELECT HEADER_ID FROM <header_table> WHERE UUID = :uuid`).
4. **Reference** (`ATTRIBUTE5`): `${division}/${yy}/${sprintf("%03d", headerId)}` — generated AFTER
   header ID known, then a second UPDATE sets `ATTRIBUTE5` (legacy two-pass). For the API you may
   compute it client-side in SQL after insert; keep the legacy two-pass behaviour (insert then
   update ATTRIBUTE5) to stay faithful.
5. `REQ_TYPE = 'new'` on fresh insert (per `newaddtrainee`).
6. `STATUS = 'Draft'` on insert; dates stored `DD-Mon-YY`.

### 3.2 Payload (JSON)

```jsonc
{
  "empNo": "12345",                        // EMPLOYEE_NUMBER (required)
  "fromOrient": "2026-10-25",              // ORIENTATION_DURATION_FROM (required)
  "toOrient": "2026-10-30",                // ORIENTATION_DURATION_TO (required)
  "startDate": "2026-10-01",               // STARTING_DATE (optional)
  "orientationBy": "HR Manager",           // ORIENTATION_SCHEDULE_BY (default: actor name)
  "flag": "Y",                             // 'Y' shared | 'N' production (resolved server-side if omitted)
  "lines": [                               // 1:N training lines (at least 1)
    {
      "department": "Quality Assurance / Control",  // DEPARTMENT / skill_name
      "departmentHead": "Ali Manager",              // DEPARTMENT_HEAD
      "fromDate": "2026-10-25",                     // FROM_DATE
      "toDate": "2026-10-25",                       // TO_DATE
      "orientationDays": 1,                         // ORIENTATION_DAYS
      "timeFrom": "09:00",                          // TIME_FROM
      "timeTo": "17:00",                            // TIME_TO
      "orientationPeriod": "8.00 Hrs",              // ORIENTATION_PERIOD (computed)
      "remarks": "Induction"                        // REMARKS
    }
  ]
}
```

> Fields `section` (DIVISION), `empname`, `person_id` (ATTRIBUTE2), `division` (ATTRIBUTE4),
> `type` (EMP_TYPE), `position` (EMP_POSITION) are **prefilled from employee details** (§8.4) and
> echoed back on insert/update — include them in the payload or resolve server-side from
> `getDetails(empNo)`.

### 3.3 SQL — header + lines in ONE transaction (`withTransaction(POOLS.LOW, ...)`)

```sql
-- 1) HEADER insert (no PK column)
INSERT INTO XXZP.XXZP_NEW_HIRETRAINING_SS_HDR_T   -- or PROD variant
  (UUID, EMPLOYEE_NUMBER, DIVISION, EMPLOYEE_NAME, ORIENTATION_DURATION_FROM,
   ORIENTATION_DURATION_TO, STARTING_DATE, ORIENTATION_SCHEDULE_BY, STATUS,
   CREATED_BY, CREATION_DATE, ATTRIBUTE2, ATTRIBUTE4, EMP_POSITION, EMP_TYPE, REQ_TYPE)
VALUES
  (:uuid, :empNo, :division, :employeeName,
   TO_DATE(:fromOrient, 'DD-Mon-YY'), TO_DATE(:toOrient, 'DD-Mon-YY'),
   TO_DATE(:startDate, 'DD-Mon-YY'), :orientationBy, 'Draft',
   :createdBy, SYSDATE, :personId, :divisionATTRIBUTE4, :position, :empType, 'new');
```
```sql
-- 2) read back generated key
SELECT HEADER_ID FROM <header_table> WHERE UUID = :uuid;
```
```sql
-- 3) set reference number (ATTRIBUTE5) — second pass, legacy behaviour
UPDATE <header_table> SET ATTRIBUTE5 = :division || '/' || TO_CHAR(SYSDATE,'YY') || '/' ||
         LPAD(:headerId, 3, '0') WHERE HEADER_ID = :headerId;
```
```sql
-- 4) register flag
INSERT INTO XXZP.XXZP_NHT_MASTER_FLAG
  (HEADER_ID, FORM_HEADER_ID, TABLE_NAME)
VALUES (NVL((SELECT MAX(HEADER_ID) FROM XXZP.XXZP_NHT_MASTER_FLAG),1) + 1, :headerId,
        :flagName);   -- 'SHARED' or 'PRODUCTION'
```
```sql
-- 5) lines (one row each; DEP_LINE_ID generated max+1 per row inside transaction)
INSERT INTO XXZP.XXZP_NEW_HIRETRAIN_SS_LINE_T   -- or PROD variant
  (DEP_LINE_ID, HEADER_ID, DEPARTMENT, DEPARTMENT_HEAD, ORIENTATION_PERIOD,
   TIME_FROM, TIME_TO, REMARKS, CREATED_BY, CREATION_DATE, FROM_DATE, TO_DATE, ORIENTATION_DAYS)
VALUES
  (:lineId, :headerId, :department, :departmentHead, :orientationPeriod,
   :timeFrom, :timeTo, :remarks, :createdBy, SYSDATE,
   TO_DATE(:fromDate, 'DD-Mon-YY'), TO_DATE(:toDate, 'DD-Mon-YY'), :orientationDays);
```

**Order:** `BEGIN` → resolve flag → generate HEADER_ID → insert header → read back by UUID →
update ATTRIBUTE5 → insert flag row → insert all lines → `COMMIT`. Any error → `ROLLBACK` → `500`.
**Response `201`:** `{ success: true, data: { headerId, flag, reference } }`

---

## 4. READ — `GET /api/v1/hr/orientation-trainings/:headerId`

1. Resolve flag: `SELECT TABLE_NAME FROM XXZP.XXZP_NHT_MASTER_FLAG WHERE FORM_HEADER_ID = :headerId`
   → Y → SS tables, N → PROD tables. Default N if absent.
2. Header:
   ```sql
   SELECT * FROM <header_table> WHERE HEADER_ID = :headerId;
   ```
3. Lines:
   ```sql
   SELECT * FROM <line_table> WHERE HEADER_ID = :headerId ORDER BY DEP_LINE_ID ASC;
   ```
- Header missing → `404`. Lines may be empty → `lines: []`.
- **Response:** JSON per §3.2 plus `headerId`, `status`, `reference`, `createdAt`.

---

## 5. UPDATE — `PUT /api/v1/hr/orientation-trainings/:headerId`

Legacy `newaddtrainee` pattern: **delete ALL existing lines for the header, then reinsert** from
the payload; update header fields; set audit trio.

```sql
-- header update
UPDATE <header_table>
SET EMPLOYEE_NUMBER = :empNo, DIVISION = :division, EMPLOYEE_NAME = :employeeName,
    ORIENTATION_DURATION_FROM = TO_DATE(:fromOrient,'DD-Mon-YY'),
    ORIENTATION_DURATION_TO = TO_DATE(:toOrient,'DD-Mon-YY'),
    STARTING_DATE = TO_DATE(:startDate,'DD-Mon-YY'),
    ORIENTATION_SCHEDULE_BY = :orientationBy,
    ATTRIBUTE2 = :personId, ATTRIBUTE4 = :divisionATTRIBUTE4,
    EMP_POSITION = :position, EMP_TYPE = :empType,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy,
    LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :headerId;
```
```sql
-- lines: delete all then reinsert
DELETE FROM <line_table> WHERE HEADER_ID = :headerId;
INSERT INTO <line_table>
  (DEP_LINE_ID, HEADER_ID, DEPARTMENT, DEPARTMENT_HEAD, ORIENTATION_PERIOD,
   TIME_FROM, TIME_TO, REMARKS, CREATED_BY, CREATION_DATE, FROM_DATE, TO_DATE, ORIENTATION_DAYS)
VALUES (:lineId, :headerId, ...);
```
**Rules**
- Verify header exists (§4) → `404` if absent; check flag via master-flag table to pick tables.
- `STATUS` is **not** changed by update (write-once `'Draft'` unless workflow transitions —
  excluded). `CREATED_BY`/`CREATION_DATE` never touched.
- Run header update + line delete + line inserts in **one** `withTransaction(POOLS.LOW, ...)`;
  rollback on failure.
- **Response `200`:** `{ success: true, data: { headerId } }`

---

## 6. DELETE

### 6.1 Single line — `DELETE /api/v1/hr/orientation-trainings/:headerId/lines/:lineId`

```sql
DELETE FROM <line_table> WHERE HEADER_ID = :headerId AND DEP_LINE_ID = :lineId;
```
- Return `404` if 0 rows affected; `200 { success: true }` otherwise.
- No transaction strictly needed (single statement), but wrap with the header existence check.

### 6.2 Whole record — `DELETE /api/v1/hr/orientation-trainings/:headerId`

> Legacy has **no header delete** (only line delete `deleteRowFromDB`). New API deletes lines
> then header in one transaction.

```sql
DELETE FROM <line_table> WHERE HEADER_ID = :headerId;
DELETE FROM <header_table> WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZP_NHT_MASTER_FLAG WHERE FORM_HEADER_ID = :headerId;
```

**Rules**
- Load header + flag first → `404` if absent.
- Recommended guard (confirm policy with owner): refuse when `STATUS <> 'Draft'` → `409`.
- `BEGIN` → deletes → `COMMIT`; check row counts; rollback on error.
- **Response:** `200 { success: true, data: { headerId, deleted: true } }`

---

## 7. LISTING WITH FILTERS — `GET /api/v1/hr/orientation-trainings`

Legacy `newhiretrain_list($flag)` runs separate queries per flag (Y SS header / N PROD header)
with HR scoping (`XXZP_HR` lookup `tag` = user id; HR sees all, non-HR sees `CREATED_BY =
user`). Query columns: `HEADER_ID, REQ_TYPE, EMPLOYEE_NUMBER, DIVISION, EMPLOYEE_NAME,
ORIENTATION_DURATION_FROM, ORIENTATION_DURATION_TO, STARTING_DATE, ORIENTATION_SCHEDULE_BY,
ATTRIBUTE2, ATTRIBUTE4, ATTRIBUTE5, STATUS` + workflow-derived columns (PENDING_AT, START_DATE,
END_DATE, LAST_ACTION, TOTAL_ACTIONS — **excluded**, §11).

### 7.1 Query parameters

| Param | Type | Maps to | Notes |
|---|---|---|---|
| `flag` | `Y`\|`N` (required) | variant | `Y` = Shared Services header table, `N` = Production |
| `page` / `pageSize` | int (1 / 20, max 100) | — | `OFFSET/FETCH` |
| `search` | string | `EMPLOYEE_NAME`, `DIVISION`, `ATTRIBUTE5`, `EMP_POSITION` | partial match |
| `status` | string | `STATUS` | `Draft` \| `Inprocess` \| `Approved` |
| `empNo` | string | `EMPLOYEE_NUMBER` | exact |
| `empType` | string | `EMP_TYPE` | exact |
| `dateFrom` / `dateTo` | date | `ORIENTATION_DURATION_FROM` | `>=` / `< +1 day` |
| `sortBy` | whitelist | — | `HEADER_ID` (default, desc), `ORIENTATION_DURATION_FROM`, `EMPLOYEE_NAME`, `CREATION_DATE` |
| `sortDir` | `asc`\|`desc` | — | default `desc` |

### 7.2 Base query (parameterise `<header_table>` by flag)

```sql
SELECT HEADER_ID, REQ_TYPE, EMPLOYEE_NUMBER, DIVISION, EMPLOYEE_NAME,
       ORIENTATION_DURATION_FROM, ORIENTATION_DURATION_TO, STARTING_DATE,
       ORIENTATION_SCHEDULE_BY, ATTRIBUTE2, ATTRIBUTE4, ATTRIBUTE5 AS REFERENCE,
       EMP_POSITION, EMP_TYPE, STATUS, CREATED_BY, CREATION_DATE
FROM XXZP.<header_table>
WHERE 1 = 1
  AND (:search IS NULL OR UPPER(EMPLOYEE_NAME) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(DIVISION) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(ATTRIBUTE5) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(EMP_POSITION) LIKE '%'||UPPER(:search)||'%')
  AND (:status IS NULL OR STATUS = :status)
  AND (:empNo IS NULL OR TO_CHAR(EMPLOYEE_NUMBER) = :empNo)
  AND (:empType IS NULL OR EMP_TYPE = :empType)
  AND (:dateFrom IS NULL OR ORIENTATION_DURATION_FROM >= TO_DATE(:dateFrom,'YYYY-MM-DD'))
  AND (:dateTo   IS NULL OR ORIENTATION_DURATION_FROM <  TO_DATE(:dateTo,'YYYY-MM-DD')+1)
  AND :scoping   -- §7.4
ORDER BY
  CASE WHEN :sortBy='HEADER_ID'      AND UPPER(:sortDir)='DESC' THEN HEADER_ID      END DESC,
  CASE WHEN :sortBy='HEADER_ID'      AND UPPER(:sortDir)='ASC'  THEN HEADER_ID      END ASC,
  CASE WHEN :sortBy='ORIENTATION_DURATION_FROM' AND UPPER(:sortDir)='DESC' THEN ORIENTATION_DURATION_FROM END DESC,
  CASE WHEN :sortBy='ORIENTATION_DURATION_FROM' AND UPPER(:sortDir)='ASC'  THEN ORIENTATION_DURATION_FROM END ASC,
  CASE WHEN :sortBy='EMPLOYEE_NAME'  AND UPPER(:sortDir)='ASC'  THEN EMPLOYEE_NAME  END ASC,
  CASE WHEN :sortBy='EMPLOYEE_NAME'  AND UPPER(:sortDir)='DESC' THEN EMPLOYEE_NAME  END DESC,
  CASE WHEN :sortBy='CREATION_DATE'  AND UPPER(:sortDir)='DESC' THEN CREATION_DATE  END DESC,
  CASE WHEN :sortBy='CREATION_DATE'  AND UPPER(:sortDir)='ASC'  THEN CREATION_DATE  END ASC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```
- Count query: same conditions without ORDER BY / OFFSET.
- `offset = (page - 1) * pageSize`; bind `null` for unused filters.

### 7.3 Response

```jsonc
{
  "success": true,
  "data": {
    "flag": "Y",
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "headerId": "1",
        "reqType": "new",
        "empNo": "12345",
        "division": "Production",
        "employeeName": "John Doe",
        "fromOrient": "25-Oct-26",
        "toOrient": "30-Oct-26",
        "startDate": "01-Oct-26",
        "orientationBy": "HR Manager",
        "reference": "Production/26/001",
        "empPosition": "Operator",
        "empType": "Employee",
        "status": "Draft",
        "createdBy": 9311,
        "creationDate": "25-Oct-26"
      }
    ]
  }
}
```

### 7.4 Access scoping (HR vs non-HR — server-side from the actor)

```sql
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId;
```
- **HR user** (probe returns rows): no extra predicate → sees all rows of that flag's table.
- **Non-HR user**: add `AND CREATED_BY = :userId` — enforced server-side from `req.auth`, never
  from a request parameter.

---

## 8. LOOKUP APIs

### 8.1 Flag (shared service vs production) — `GET .../lookups/flag?empNo=`
Same SQL as §3.1 (`XX_DIGI_ORG_INFO` / `XX_DIGI_ASSIGNMENT_INFO` / `XX_DIGI_EMP_DETAILS`);
returns `{ flag: 'Y'|'N', tableName: 'SHARED'|'PRODUCTION' }`.

### 8.2 Employees — `GET .../lookups/employees`
```sql
-- HR sees all current employees; non-HR sees own + supervised subordinates.
-- HR branch (models/Newhiretrain_model.php:getEmpNum HR branch):
SELECT PERSON_ID, EMPLOYEE_NUMBER, FULL_NAME, JOINING_DATE AS START_DATE, JOB_ID,
       JOB_TITLE AS NAME, COST_CENTER AS SECTION, DIVISION AS DIV, ORGANIZATION_ID,
       POSITION_NAME AS EMP_POSITION,
       (CASE WHEN WORKER_CATEGORY='Supervisor' THEN 'Supervisor'
             WHEN WORKER_CATEGORY='Management' THEN 'Manager'
             WHEN WORKER_CATEGORY='GM' THEN 'Manager'
             WHEN WORKER_CATEGORY='VP' THEN 'Manager'
             ELSE 'Employee' END) AS EMPLOYEE_TYPE
FROM XX_DIGI_EMP_MASTER
WHERE CURRENT_EMP_FLAG = 'Y'
ORDER BY FULL_NAME;
```

### 8.3 Managers (department head dropdown) — `GET .../lookups/managers`
```sql
SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE SUPERVISOR_NAME IN (
  SELECT DISTINCT FULL_NAME FROM XX_DIGI_EMP_MASTER
  WHERE JOB_ID IN (300000002811134, 300000002699988, 300000002811331,
                   300000002811350, 300000002811380)
     OR EMPLOYEE_NUMBER IN (1153,1770,2387))
  AND CURRENT_EMP_FLAG='Y'
UNION ALL
SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE CURRENT_EMP_FLAG='Y' AND JOB_ID IN (300000004332594,300000002811134,300000002699988,
                                          300000002811331,300000002811350,300000002811380)
UNION ALL
SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE CURRENT_EMP_FLAG='Y'
  AND JOB_ID IN (SELECT DISTINCT JOB_ID FROM XX_DIGI_JOB_MASTER
                 WHERE APPROVAL_AUTHORITY > 4 AND APPROVAL_AUTHORITY < 10);
```

### 8.4 Employee details (prefill) — `GET .../lookups/employee-details?empNo=`
```sql
SELECT PERSON_ID, DIVISION AS DIV, FULL_NAME, EMPLOYEE_NUMBER, JOB_TITLE, JOB_ID,
       DEPARTMENT, ORGANIZATION_ID AS DEPARTMENT_ID,
       SUPERVISOR_NAME AS DIRECT_MANAGER
FROM XX_DIGI_EMP_MASTER
WHERE EMPLOYEE_NUMBER = :empNo AND CURRENT_EMP_FLAG = 'Y';
```
Returns `section`, `division`, `empname`, `personId`, `empType`, `position`, `startDate` to
prefill the form (mirrors JS `getEmlpoyee`).

### 8.5 Default training list by type — `GET .../lookups/skills?empType=`
Hardcoded in legacy JS (`views/ZPIL/nht-new.php:241-244`) — return as static reference data:
| empType | trainings |
|---|---|
| Supervisor | Training with HR Dept, Training with safety Dept, Meeting with Manager, Meeting with his director, Training with IT Dept, Tour around factory, Meeting with HR to make sure all tasks are clear |
| Manager | Training with HR Dept, Training with safety Dept, Meeting with all directors, Meeting with General Manager, Training with IT Dept, Tour around factory, Meeting with HR to make sure all tasks are clear |
| Employee | Training with HR Dept, Training with safety Dept, Training with IT Dept, Tour around factory, Meeting with HR to make sure all tasks are clear |
| (plant default) | Quality Assurance / Control, Planning, HR Department, Production / Process, Maintenance, Tool Room, Warehouse & Shipping, Safety, Administration and HR, Purchasing, Finance, IT |

---

## 9. Validation Rules (API must enforce — legacy had NONE)

| Field | Rule |
|---|---|
| `empNo` | required; must exist in `XX_DIGI_EMP_MASTER` (current employee) |
| `fromOrient`, `toOrient` | required, valid dates; `toOrient >= fromOrient` |
| `startDate` | optional valid date |
| `flag` | `Y` \| `N` (resolved server-side from empNo if omitted; do not trust body) |
| `lines` | required array, min 1 item |
| `lines[].department` | required string (max ~200) |
| `lines[].departmentHead` | required string |
| `lines[].fromDate`/`toDate` | required valid dates within header range |
| `lines[].orientationDays` | integer ≥ 0 |
| `lines[].timeFrom`/`timeTo` | valid HH:mm |
| `lines[].remarks` | optional string |
| unknown body fields | rejected (Joi default) |
| `headerId` / `lineId` | string `/^[1-9][0-9]{0,18}$/` |

---

## 10. Implementation Checklist for the Agent

1. ✅ Feature folder `server/src/modules/hr/orientation-trainings/` with
   `orientationTraining.routes.js` / `.controller.js` / `.service.js` / `.repository.js` /
   `orientationTraining.validation.js` — factories with injectable deps, mirroring
   `src/modules/users/` and `DEVELOPER-MODULE-GUIDE.md` §4.
2. ✅ 5 core endpoints (§2) + single-line delete + 5 lookups; guards in approved order:
   `authenticate` → `requireCsrfToken` (unsafe) → `authorize('HR.ORIENTATION_TRAININGS', 'ACTION')`
   → `validate({...})`; `Cache-Control: no-store`.
3. ✅ Insert / Update / Delete inside ONE `withTransaction(POOLS.LOW, ...)`; repositories get
   the connection and never commit/rollback; named bind variables only; `POOLS.LOW`.
4. ✅ Variant routing via `XXZP_NHT_MASTER_FLAG` (`TABLE_NAME` 'SHARED'/'PRODUCTION') → pick
   correct `<header_table>`/`<line_table>` pair (§1, §7.2).
5. ✅ ID generation exactly as legacy: `NVL(MAX(HEADER_ID+1),1)` and per-row
   `NVL(MAX(DEP_LINE_ID+1),1)`; UUID generated in Node; read back `HEADER_ID` by UUID; two-pass
   `ATTRIBUTE5` reference (`${division}/${yy}/${LPAD(id,3,'0')}`).
6. ✅ `STATUS` written only as `'Draft'` on insert; never transitioned here (§11); audit trio set
   on update only; `CREATED_BY`/`CREATION_DATE` never touched.
7. ✅ Update = delete-all-lines + reinsert (legacy `newaddtrainee` pattern) + header update,
   one transaction.
8. ✅ Listing: `flag` param, server-side filters (§7.1), pagination, `total`, allowlisted sort,
   HR vs non-HR scoping (§7.4) — NO workflow columns.
9. ✅ Validation per §9 → `400 VALIDATION_ERROR` with `details[{field,message}]`.
10. ✅ Keep exact legacy column names (`DEPARTMENT`, `DEPARTMENT_HEAD`, `ORIENTATION_PERIOD`,
    `ATTRIBUTE2/4/5`, `REQ_TYPE`) — no renames without DB migration (gate G1).
11. ✅ Document every operation in `server/docs/openapi/openapi.yaml`, add routes to
    `tests/api-docs.test.js`; Supertest tests with doubles: success, 400, 401, 403 (+ DENY),
    404, 409 (delete guard), pagination bounds, CSRF, rollback. Run `cd server; npm run check`.

---

## 11. WORKFLOW — EXPLICITLY OUT OF SCOPE (verified present in legacy; do NOT implement)

- `Newhiretrain::submitWorkflow()` (`controllers/Newhiretrain.php:131-400`) — SMTP mail
  (hard-coded `workflowmailer@zamilplastic.com` / `D@989955427519ud`), `callXXPHP_WORKFLOW(... 'NHTF' ...)`,
  then `updateRequestStatus(id, flag, 'INPROCESS')`.
- `NHT_Flow::workflow()` / `workflow1()` (`controllers/NHT_Flow.php`) — approve/reject handlers
  writing `STATUS = 'Approved' | 'Rejected'`.
- `Workflow_model::callXXPHP_WORKFLOW` (`models/Workflow_model.php:107`), `Data_model`
  notification IDs/status close, `Zmailer` NHTF mail actions (approve/reject/forward/RFI/delegation).
- `XX_REQ_WF_REC` approver-chain rebuild (`setWorkflowRec`, model 675-706, incl. its
  `DELETE FROM XX_REQ_WF_REC ...` — the only delete in legacy NHT code, workflow-only).
- **Status transitions:** any API call setting `STATUS` to `Inprocess`/`Approved`/`Rejected`.
  Only `'Draft'` is written by this API; other values are only **read** (list filter).
- **Listing columns that are workflow projections:** `PENDING_AT`, `START_DATE`, `END_DATE`,
  `LAST_ACTION`, `TOTAL_ACTIONS` — excluded from §7.
- `check_request_is_inprocess()` (model 642-663) is only a read-gate used before workflow; do
  not call it from CRUD.

---

## 12. AGENT PROMPT (copy-paste this to your coding assistant)

```text
You are helping me implement a change in the Zamil Digitalization repository
(GitHub: commonolivesofts-create/zamil-revamp). React 19 + Vite 8 frontend (client/) and
Node.js 24 + Express 5 ES-module backend (server/) over an existing Oracle Autonomous
Database schema. The repository is public.

MY TASK (backend-only — do not touch client/)
Implement the Orientation Training Form (New Hire Training / NHT) CRUD API, fully specified
in README_orientation_training_form.md at the repository root. Scope is strictly: INSERT,
READ, UPDATE, DELETE, LISTING WITH FILTERS, single-line delete, and the lookup endpoints
defined in that file. The legacy PHP (CodeIgniter 3) implementation exists only at
C:\xampp\htdocs\zpil_codebase (controllers/Newhiretrain.php, models/Newhiretrain_model.php,
views/ZPIL/nht-new.php, views/update/newhiretrain.php, views/ZPIL/nht_list.php) — use it
ONLY to verify field behaviour if the README is unclear.

EXPLICIT EXCLUSIONS (README §11 is authoritative)
- NO workflow/approval/email logic of any kind: do NOT read or write XXPHP_WORKFLOW, do NOT
  touch XX_REQ_WF_REC, do NOT implement submit/approve/reject (Newhiretrain::submitWorkflow,
  controllers/NHT_Flow.php, Zmailer), no SMTP, no RFI/forward/delegation. The API writes
  STATUS only as 'Draft' on insert and NEVER transitions it. Status values Inprocess/Approved
  are only read (list filter).
- Do NOT add the workflow-derived listing columns (PENDING_AT, START_DATE, END_DATE,
  LAST_ACTION, TOTAL_ACTIONS).
- No frontend work, no DDL/sequences or schema changes (needs my explicit approval), no new
  dependencies.

READ BEFORE WRITING CODE (base every statement on files you actually read)
1. README_orientation_training_form.md — the authoritative spec: two table-pairs (Shared
   Services Y / Production N), flag registry XXZP_NHT_MASTER_FLAG, column↔field mapping,
   payload, exact SQL per operation, filters, flag resolution, validation rules, lookups,
   legacy quirks (literal values, two-pass ATTRIBUTE5, delete-all-lines-on-update) — follow it
   exactly and flag conflicts instead of choosing silently.
2. README_interview_assessment_form.md, README_employment_offer_form.md,
   README_personal_requisition_form.md — only for conventions/format; implement nothing else
   from them.
3. server/CLAUDE.md and server/docs/01-SYSTEM_ARCHITECTURE.md,
   02-API_DEVELOPMENT_STANDARDS.md, 03-ORACLE_DATABASE_ARCHITECTURE.md,
   06-ARCHITECTURE_DECISIONS_GUIDELINES.md (locked ADRs — do not work around them).
4. server/docs/DEVELOPER-MODULE-GUIDE.md — section 4 "Adding a backend module" is your
   step-by-step checklist; mirror the existing src/modules/users/ module end to end.
5. server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md, BACKEND-TESTING.md, and
   docs/FEATURE-DELIVERY-WORKFLOW.md (approval gates).

WHAT TO BUILD
- New feature folder src/modules/hr/orientation-trainings/ with
  orientationTraining.routes.js / .controller.js / .service.js / .repository.js /
  orientationTraining.validation.js (factory functions with injectable dependencies, exactly
  like the users module).
- Endpoints under /api/v1/hr/orientation-trainings:
    POST   /                     insert header + lines in ONE
                                  withTransaction(POOLS.LOW, ...); resolve flag Y/N via
                                  XX_DIGI_ORG_INFO (§3.1); id from
                                  SELECT NVL(MAX(HEADER_ID+1),1); read back HEADER_ID by UUID;
                                  set ATTRIBUTE5 reference (${division}/${yy}/${SEQ3});
                                  register XXZP_NHT_MASTER_FLAG; insert all lines; STATUS='Draft'
    GET    /                     listing: ?flag=Y|N required (+ §7.1 filters); query the correct
                                  <header_table> by flag; pagination + total; allowlisted sort;
                                  HR vs non-HR scoping from req.auth (§7.4); NO workflow columns
    GET    /:headerId            resolve flag via XXZP_NHT_MASTER_FLAG → read header + lines from
                                  the correct table pair (404 if absent)
    PUT    /:headerId            update header + delete-all-lines + reinsert lines, one
                                  transaction, 404 if absent; never touch STATUS/CREATED_BY/
                                  CREATION_DATE
    DELETE /:headerId            delete lines + header + flag row in one transaction; 404 if
                                  absent; apply §6.2 guards (Draft-only) — confirm policy if it
                                  differs
    DELETE /:headerId/lines/:lineId   delete single line row; 404 if 0 affected
    GET    /lookups/flag?empNo= | /employees | /managers | /employee-details?empNo= |
           /skills?empType=         (README §8 exact SQL)
- Guards in approved order on every route: authenticate → requireCsrfToken (unsafe) →
  authorize('HR.ORIENTATION_TRAININGS', 'ACTION') → validate({ params, query, body });
  Cache-Control: no-store. Controllers thin; SQL ONLY in the repository with named bind
  variables; business rules only in the service; AppError for expected failures;
  sendSuccess / sendPaginated envelopes; headerId/lineId travel as strings
  (/^[1-9][0-9]{0,18}$/); rows mapped to camelCase; explicit column lists; POOLS.LOW.

RULES I WILL HOLD YOU TO
- Never invent tables, columns, endpoints, permissions or business rules — if the README and
  the real Oracle schema disagree, stop and ask me.
- Flag (Y/N) must be resolved server-side from the employee's org info (§3.1 / §8.1), never
  blindly trusted from the request body.
- Reuse shared infrastructure only (config, logger, validate, AppError, apiResponse,
  withConnection/withTransaction); never read process.env, never console.*, no ORMs, no
  generic base repositories, no parallel helpers.
- Register the router in src/routes/api.routes.js (accepting deps.*Repository and db.* for
  tests), document every operation in server/docs/openapi/openapi.yaml in the same change,
  and add the routes to tests/api-docs.test.js.
- Permission codes (e.g. HR.ORIENTATION_TRAININGS {VIEW, CREATE, EDIT, DELETE, MANAGE_LINES})
  must be registered in the RBAC catalogue — tell me which codes you need and wait for my
  approval before assuming they exist; default-deny otherwise.
- Supertest + node:test tests with injected doubles: success paths, 400 validation, 401,
  403 (missing permission + DENY), 404, 409 (delete guard), pagination bounds, CSRF on changes,
  and transaction rollback for insert/update/delete.
- Before writing code, list the exact files you will create/modify with full paths and why.
- Never claim tests pass unless you executed them: run `cd server; npm run check` and show
  the output; otherwise say "not executed".
- No credentials, wallet contents, .env values or real employee data anywhere.

Start by reading the documents above, then summarize your understanding of the spec and the
users module pattern, then propose your file list and endpoint contract before coding.
```
