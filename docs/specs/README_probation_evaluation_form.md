# Probation Evaluation Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Probation Evaluation Form** (PAF — Performance Appraisal
> Form for Probation Period) — **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup (dropdown)
> APIs and evaluation-line handling. **Workflow / approval / email logic is explicitly OUT of scope** — this module has
> heavy workflow (form code `EPRBF` / type `1064`); everything workflow-related is catalogued in §11 and must NOT be
> implemented.
>
> **Legacy source of truth (PHP/CodeIgniter, `pmform_codebase`, for reference only):**
> - `controllers/Probation.php` (`class Probation`; methods: `add_probation_data`, `probreport`, `index`, `getEmpDetails`)
> - `controllers/ProbationFlow.php` (workflow engine — excluded)
> - `models/Probation_Model.php` (all form SQL)
> - `models/Data_model.php` (`fetchFormData`, `getPROBRecords`, `getEmp`, `getAllEmp`, `getRequestedBy`)
> - `views/probation/probation.php` (create form), `views/probation/prf_uplines.php` (edit/update form)
> - `views/probation/prob_report.php` (listing/report page)
>
> **Database:** Oracle, schema `XXZP`. All SQL below uses **bind variables** — never string-concatenate user input (the
> legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_interview_assessment_form.md`, `README_employment_offer_form.md`,
> `README_personal_requisition_form.md`, `README_orientation_training_form.md` — same structure and conventions.

---

## 1. Data Model

Exactly **2 tables**, keyed by `HEADER_ID`. The header is 1 row per evaluation; lines are the evaluation criteria
(rating 1–5 per criterion). Legacy loops exactly 20 line slots on insert/update.

| # | Table | Role |
|---|---|---|
| 1 | `XXZP.XXZP_PAF_PROBATION_HEADER` | Header (1 row per probation evaluation) |
| 2 | `XXZP.XXZP_PAF_PROBATION_LINES` | Evaluation criteria lines (1:N, up to 20 per header) |

### 1.1 `XXZP.XXZP_PAF_PROBATION_HEADER`

| Column | Type (inferred) | Legacy form field | Notes / enum |
|---|---|---|---|
| `HEADER_ID` | NUMBER PK | hidden `header_id` | generated `NVL(MAX(HEADER_ID+1),1)` — §3.1 |
| `UUID` | VARCHAR2(36) | — | v4 UUID, generated server-side; read back `HEADER_ID` by UUID |
| `FORM_DATE` | DATE `DD-Mon-YYYY` | `prf_date` | appraisal/preparation date |
| `EMP_ID` | VARCHAR2 | `e_id` | employee ID |
| `GRADE` | NUMBER | `grade` | job grade, default `0` |
| `EVALUATION_PERIOD` | VARCHAR2 | `Eperiod` | evaluation period text, default `'-'` |
| `FORM_NAME` | VARCHAR2 | `dropSelect` | form type: `Workers_Technicians` \| `Trainee` \| `Engineers_Staff` \| `Department_Managers` \| `Supervisors_and_Foremens`, default `'-'` |
| `TOTAL_RATING` | NUMBER | `total` | sum of line ratings, default `0` |
| `PREPARED_BY_CMNT` | VARCHAR2 | `comment` | prepared-by comment, default `'-'` |
| `APPROVED_BY_CMNT` | VARCHAR2 | `comments` | approver suggestion, default `'-'` |
| `EMP_NAME` | VARCHAR2 | `employee_name` | employee full name, default `'-'` |
| `JOB_T` | VARCHAR2 | `job_title` | job title, default `'-'` |
| `DEPARTMENT` | VARCHAR2 | `department` | department, default `'-'` |
| `EMP_NUMBER` | VARCHAR2 | `employee_number` | employee number, default `'-'` |
| `FROM_DATE` | DATE `DD-Mon-YYYY` | `from_date` | evaluation period from, default `01-JAN-00` |
| `TO_DATE` | DATE `DD-Mon-YYYY` | `to_date` | evaluation period to, default `01-JAN-00` |
| `USER_NAME` | VARCHAR2 | `hidden_username` | prepared-by user name, default `'-'` |
| `USER_MAIL` | VARCHAR2 | `hidden_useremail` | prepared-by email, default `'-'` |
| `REQUEST_STATUS` | VARCHAR2 | — | `DRAFT` \| `INPROCESS` \| `APPROVED` \| `Rejected`. **API writes `'DRAFT'` only** |
| `CREATED_AT` | DATE `DD-Mon-YYYY` | — | audit |
| `CREATED_BY` | NUMBER | — | audit = authenticated user id |

### 1.2 `XXZP.XXZP_PAF_PROBATION_LINES`

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `LINE_ID` | NUMBER PK | hidden `line_id{i}` | generated `NVL(MAX(line_id+1),1)` per header — §3.1 |
| `HEADER_ID` | NUMBER FK | hidden `header_id` | |
| `RATING_LINE` | NUMBER | `rating{i}` | rating `1`–`5`, default `0` |
| `PARAM_NAME` | VARCHAR2 | `param{i}` | evaluation criterion name |
| `PARAMA_NAME_AR` | VARCHAR2 | `param_ar{i}` | Arabic criterion name |

---

## 2. API Surface

Base path: `/api/v1/hr/probation-evaluations`
Auth: session (`authenticate`); `created_by` from `req.auth` — never the body.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/hr/probation-evaluations` | **Insert** header + up to 20 lines in ONE transaction |
| `GET` | `/api/v1/hr/probation-evaluations/:headerId` | **Read** header + lines |
| `PUT` | `/api/v1/hr/probation-evaluations/:headerId` | **Update** header + lines (update existing lines by LINE_ID) |
| `DELETE` | `/api/v1/hr/probation-evaluations/:headerId` | **Delete** lines + header (one transaction) — legacy has none; new capability |
| `GET` | `/api/v1/hr/probation-evaluations` | **Listing with filters** + pagination |
| `GET` | `.../lookups/form-types` | §8.1 |
| `GET` | `.../lookups/employees` | §8.2 |
| `GET` | `.../lookups/requestor` | §8.3 |
| `GET` | `.../lookups/employee-details?empName=` | §8.4 |

**Universal responses**
```jsonc
{ "success": true, "data": { ... } }              // 200 / 201
{ "success": false, "message": "Probation evaluation not found" }   // 404
{ "success": false, "message": "Validation failed", "errors": [...] } // 400
```

---

## 3. INSERT — `POST /api/v1/hr/probation-evaluations`

### 3.1 Key generation

```sql
-- HEADER_ID
SELECT NVL(MAX(HEADER_ID + 1), 1) AS ID FROM XXZP.XXZP_PAF_PROBATION_HEADER;
```
- Run inside the insert transaction (legacy concurrency caveat — if parallel users are expected,
  propose an Oracle SEQUENCE — needs owner approval, gate G1).
- Generate `UUID` in Node (`crypto.randomUUID()`); insert header WITHOUT the PK column; read back:
  ```sql
  SELECT HEADER_ID FROM XXZP.XXZP_PAF_PROBATION_HEADER WHERE UUID = :uuid;
  ```
- Each line: `SELECT NVL(MAX(line_id + 1), 1) AS ID FROM XXZP.XXZP_PAF_PROBATION_LINES WHERE HEADER_ID = :headerId`
- Dates: React sends ISO `YYYY-MM-DD`; legacy stores `DD-Mon-YYYY` (e.g. `25-Oct-2026`) for
  `FORM_DATE` / `FROM_DATE` / `TO_DATE` / `CREATED_AT`. Empty date → legacy default `'01-JAN-00'`.

### 3.2 Payload (JSON)

```jsonc
{
  "formDate": "2026-10-25",             // FORM_DATE (prf_date)
  "evaluationPeriod": "Probation 2026", // EVALUATION_PERIOD (Eperiod), default "-"
  "formType": "Engineers_Staff",        // FORM_NAME (dropSelect): Workers_Technicians | Trainee | Engineers_Staff | Department_Managers | Supervisors_and_Foremens
  "employeeName": "John Doe",           // EMP_NAME, default "-"
  "employeeNumber": "12345",            // EMP_NUMBER, default "-"
  "empId": "E12345",                    // EMP_ID, default "-"
  "grade": 5,                           // GRADE, default 0
  "jobTitle": "Machine Operator",       // JOB_T, default "-"
  "department": "Production",           // DEPARTMENT, default "-"
  "fromDate": "2026-04-01",             // FROM_DATE
  "toDate": "2026-09-30",               // TO_DATE
  "comment": "Good progress",           // PREPARED_BY_CMNT (comment), default "-"
  "totalRating": 85,                    // TOTAL_RATING (total), default 0 — server may recompute
  "lines": [                            // 1..20 evaluation criteria
    {
      "param": "Quality of Work",              // PARAM_NAME
      "paramAr": "جودة العمل",                // PARAMA_NAME_AR
      "rating": 4                             // RATING_LINE (1-5), default 0
    }
  ]
}
```

### 3.3 SQL — header + lines in ONE transaction (`withTransaction(POOLS.LOW, ...)`)

```sql
-- 1) HEADER insert (no PK column)
INSERT INTO XXZP.XXZP_PAF_PROBATION_HEADER
  (UUID, FORM_DATE, EMP_ID, GRADE, EVALUATION_PERIOD, FORM_NAME, TOTAL_RATING,
   PREPARED_BY_CMNT, APPROVED_BY_CMNT, EMP_NAME, JOB_T, DEPARTMENT, EMP_NUMBER,
   FROM_DATE, TO_DATE, USER_NAME, USER_MAIL, REQUEST_STATUS, CREATED_AT, CREATED_BY)
VALUES
  (:uuid, TO_DATE(:formDate, 'DD-Mon-YYYY'), :empId, NVL(:grade, 0),
   NVL(:evaluationPeriod, '-'), NVL(:formType, '-'), NVL(:totalRating, 0),
   NVL(:comment, '-'), NVL(:comments, '-'), :employeeName, :jobTitle, :department,
   :employeeNumber, TO_DATE(:fromDate, 'DD-Mon-YYYY'), TO_DATE(:toDate, 'DD-Mon-YYYY'),
   :userName, :userMail, 'DRAFT', SYSDATE, :createdBy);
```
```sql
-- 2) read back generated key
SELECT HEADER_ID FROM XXZP.XXZP_PAF_PROBATION_HEADER WHERE UUID = :uuid;
```
```sql
-- 3) lines (one row each; line_id generated max+1 per header inside transaction)
INSERT INTO XXZP.XXZP_PAF_PROBATION_LINES
  (HEADER_ID, LINE_ID, RATING_LINE, PARAM_NAME, PARAMA_NAME_AR)
VALUES
  (:headerId, :lineId, NVL(:rating, 0), :param, NVL(:paramAr, '-'));
```

**Order:** `BEGIN` → generate HEADER_ID → insert header → read back by UUID → insert all lines
(up to 20) → `COMMIT`. Any error → `ROLLBACK` → `500`.
**Response `201`:** `{ success: true, data: { headerId, uuid } }`

> Legacy defaults: empty text → `'-'`; empty numbers → `0`; empty date → `'01-JAN-00'`. Empty
> `param_ar` → `'-'`.

---

## 4. READ — `GET /api/v1/hr/probation-evaluations/:headerId`

```sql
-- header (legacy: fetchFormData($id, 'header'))
SELECT * FROM XXZP.XXZP_PAF_PROBATION_HEADER WHERE HEADER_ID = :headerId;
```
```sql
-- lines (legacy: fetchFormData($id, 'lines'))
SELECT LINE_ID, HEADER_ID, RATING_LINE, PARAM_NAME, PARAMA_NAME_AR
FROM XXZP.XXZP_PAF_PROBATION_LINES
WHERE HEADER_ID = :headerId
ORDER BY LINE_ID;
```
- Header missing → `404`. Lines may be empty → `lines: []`.
- **Response:** JSON per §3.2 plus `headerId`, `requestStatus`, `createdAt`.

---

## 5. UPDATE — `PUT /api/v1/hr/probation-evaluations/:headerId`

Legacy `add_form_data()` update branch: header fields updated, then each existing line updated by
`LINE_ID`.

```sql
-- header update
UPDATE XXZP.XXZP_PAF_PROBATION_HEADER
SET FORM_DATE = TO_DATE(:formDate, 'DD-Mon-YYYY'),
    EMP_ID = :empId,
    GRADE = NVL(:grade, 0),
    EVALUATION_PERIOD = NVL(:evaluationPeriod, '-'),
    FORM_NAME = NVL(:formType, '-'),
    TOTAL_RATING = NVL(:totalRating, 0),
    PREPARED_BY_CMNT = NVL(:comment, '-'),
    APPROVED_BY_CMNT = NVL(:comments, '-'),
    EMP_NAME = :employeeName,
    JOB_T = :jobTitle,
    DEPARTMENT = :department,
    EMP_NUMBER = :employeeNumber,
    FROM_DATE = TO_DATE(:fromDate, 'DD-Mon-YYYY'),
    TO_DATE = TO_DATE(:toDate, 'DD-Mon-YYYY')
WHERE HEADER_ID = :headerId;
```
```sql
-- lines: update each existing line by LINE_ID
UPDATE XXZP.XXZP_PAF_PROBATION_LINES
SET RATING_LINE = NVL(:rating, 0),
    PARAM_NAME = :param,
    PARAMA_NAME_AR = NVL(:paramAr, '-')
WHERE LINE_ID = :lineId AND HEADER_ID = :headerId;
```

**Rules**
- Verify the header exists (§4) → `404` if absent.
- `REQUEST_STATUS`, `USER_NAME`, `USER_MAIL`, `CREATED_AT`, `CREATED_BY` are **never** updated.
- Loop over all lines present in the payload; update by `LINE_ID`. Lines not in the payload are
  left untouched (legacy does not delete/insert lines on update — it only updates existing
  `line_id{i}` rows).
- Run header update + all line updates in **one** `withTransaction(POOLS.LOW, ...)`; rollback on
  failure; check `sqlRowCounts`.
- **Response `200`:** `{ success: true, data: { headerId } }`

---

## 6. DELETE — `DELETE /api/v1/hr/probation-evaluations/:headerId`

> The legacy app has **no delete** for this form (no DELETE statement anywhere in Probation
> files). New API deletes lines then header in one transaction.

```sql
DELETE FROM XXZP.XXZP_PAF_PROBATION_LINES WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZP_PAF_PROBATION_HEADER WHERE HEADER_ID = :headerId;
```

**Rules**
- Load the header first (§4) → `404` if absent.
- Recommended guard (confirm policy with owner): refuse when `REQUEST_STATUS <> 'DRAFT'` → `409`.
- `BEGIN` → deletes → `COMMIT`; check row counts; rollback on error.
- **Response:** `200 { success: true, data: { headerId, deleted: true } }`

---

## 7. LISTING WITH FILTERS — `GET /api/v1/hr/probation-evaluations`

Legacy `getPROBRecords($lang)` (`models/Data_model.php:5250`): HR probe against
`XX_DIGI_LOOKUP_VALUES` `LOOKUP_TYPE='XXZP_HR'` `MEANING = employee_number`. HR sees all rows;
non-HR sees `CREATED_BY = userID`. Query columns: `HEADER_ID, EMP_NAME, EMP_NUMBER, JOB_T,
DEPARTMENT, TOTAL_RATING, REQUEST_STATUS, CREATED_AT, PENDING_AT` (workflow-derived — **excluded**,
§11). Order by `HEADER_ID desc`.

### 7.1 Query parameters

| Param | Type | Maps to | Notes |
|---|---|---|---|
| `page` / `pageSize` | int (1 / 20, max 100) | — | `OFFSET/FETCH` |
| `search` | string | `EMP_NAME`, `EMP_NUMBER`, `JOB_T`, `DEPARTMENT` | partial match |
| `requestStatus` | string | `REQUEST_STATUS` | `DRAFT` \| `INPROCESS` \| `APPROVED` \| `Rejected` |
| `formType` | string | `FORM_NAME` | exact form type |
| `empNumber` | string | `EMP_NUMBER` | exact |
| `department` | string | `DEPARTMENT` | exact or partial |
| `dateFrom` / `dateTo` | date | `CREATED_AT` | `>=` / `< +1 day` |
| `sortBy` | whitelist | — | `HEADER_ID` (default, desc), `CREATED_AT`, `EMP_NAME`, `TOTAL_RATING` |
| `sortDir` | `asc`\|`desc` | — | default `desc` |

### 7.2 Base query

```sql
SELECT HEADER_ID, FORM_DATE, EMP_NAME, EMP_NUMBER, JOB_T, DEPARTMENT, FORM_NAME,
       TOTAL_RATING, REQUEST_STATUS, CREATED_AT, CREATED_BY
FROM XXZP.XXZP_PAF_PROBATION_HEADER
WHERE 1 = 1
  AND (:search IS NULL OR UPPER(EMP_NAME) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(EMP_NUMBER) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(JOB_T) LIKE '%'||UPPER(:search)||'%'
                        OR UPPER(DEPARTMENT) LIKE '%'||UPPER(:search)||'%')
  AND (:requestStatus IS NULL OR REQUEST_STATUS = :requestStatus)
  AND (:formType IS NULL OR FORM_NAME = :formType)
  AND (:empNumber IS NULL OR EMP_NUMBER = :empNumber)
  AND (:department IS NULL OR UPPER(DEPARTMENT) = UPPER(:department))
  AND (:dateFrom IS NULL OR CREATED_AT >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
  AND (:dateTo   IS NULL OR CREATED_AT <  TO_DATE(:dateTo, 'YYYY-MM-DD') + 1)
  AND :scoping   -- §7.4
ORDER BY
  CASE WHEN :sortBy='HEADER_ID'    AND UPPER(:sortDir)='DESC' THEN HEADER_ID    END DESC,
  CASE WHEN :sortBy='HEADER_ID'    AND UPPER(:sortDir)='ASC'  THEN HEADER_ID    END ASC,
  CASE WHEN :sortBy='CREATED_AT'   AND UPPER(:sortDir)='DESC' THEN CREATED_AT   END DESC,
  CASE WHEN :sortBy='CREATED_AT'   AND UPPER(:sortDir)='ASC'  THEN CREATED_AT   END ASC,
  CASE WHEN :sortBy='EMP_NAME'     AND UPPER(:sortDir)='ASC'  THEN EMP_NAME     END ASC,
  CASE WHEN :sortBy='EMP_NAME'     AND UPPER(:sortDir)='DESC' THEN EMP_NAME     END DESC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```
- Count query: same conditions without ORDER BY / OFFSET.
- `offset = (page - 1) * pageSize`; bind `null` for unused filters.

### 7.3 Response

```jsonc
{
  "success": true,
  "data": {
    "total": 27,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "headerId": "3",
        "formDate": "25-Oct-2026",
        "employeeName": "John Doe",
        "employeeNumber": "12345",
        "jobTitle": "Machine Operator",
        "department": "Production",
        "formType": "Engineers_Staff",
        "totalRating": 85,
        "requestStatus": "DRAFT",
        "createdAt": "25-Oct-26",
        "createdBy": 9311
      }
    ]
  }
}
```

### 7.4 Access scoping (HR vs non-HR — server-side from the actor)

```sql
-- HR probe (same lookup used across modules)
SELECT MEANING
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR'
  AND MEANING = :employeeNumber;   -- legacy compares MEANING to emp_no
```
- **HR user** (probe returns rows): no extra predicate → sees **all** evaluations.
- **Non-HR user**: add `AND CREATED_BY = :userId` — enforced server-side from `req.auth`, never
  from a request parameter.

---

## 8. LOOKUP APIs

### 8.1 Form types — `GET .../lookups/form-types`
Static reference data (from `views/probation/probation.php` `dropSelect` options):
`Workers_Technicians`, `Trainee`, `Engineers_Staff`, `Department_Managers`,
`Supervisors_and_Foremens`.

### 8.2 Employees — `GET .../lookups/employees`
Hierarchical list of employees under the actor (legacy `getEmp` / `getAllEmp`,
`models/Data_model.php:3123`):
```sql
SELECT LEVEL AS hierarchy_level, USER_ID, FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE SYSTEM_PERSON_TYPE IN ('EMP','EMP_APL')
  AND ASSIGNMENT_STATUS_TYPE_ID = '1'
  AND CURRENT_EMP_FLAG = 'Y'
  AND LEVEL != 1
START WITH FULL_NAME = (SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
CONNECT BY PRIOR FULL_NAME = SUPERVISOR_NAME;
```

### 8.3 Requestor (logged-in user) — `GET .../lookups/requestor`
```sql
SELECT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
FROM XX_DIGI_EMP_MASTER
WHERE EMPLOYEE_NUMBER = (
  SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId
);
```

### 8.4 Employee details (prefill on employee select) — `GET .../lookups/employee-details?empName=`
Legacy `Probation_Model::getEmpDetails` — returns `ids` (person_id, employee_number), `hire`
(start_date), `job` (name, job_id), `dept` (organization_id, name), `sup` (supervisor full_name),
`pos_year_detail` (years in position), `years_in_companay`. Core SQL:
```sql
SELECT PERSON_ID, EMPLOYEE_NUMBER
FROM XX_DIGI_EMP_MASTER
WHERE FULL_NAME = :empName AND CURRENT_EMP_FLAG = 'Y';

SELECT JOINING_DATE AS START_DATE
FROM XX_DIGI_EMP_MASTER
WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y';

SELECT JOB_TITLE AS NAME, JOB_ID
FROM XX_DIGI_EMP_MASTER
WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y';

SELECT ORGANIZATION_ID, ORGANIZATION_NAME AS NAME
FROM XX_DIGI_EMP_MASTER
WHERE PERSON_ID = :personId AND CURRENT_EMP_FLAG = 'Y';
```

---

## 9. Validation Rules (API must enforce — legacy had NONE)

| Field | Rule |
|---|---|
| `employeeName` | required, max ~200 |
| `employeeNumber` | required, max ~50 |
| `formType` | required: one of the 5 values (§8.1) |
| `formDate`, `fromDate`, `toDate` | required valid dates (ISO in, `DD-Mon-YYYY` stored); `toDate >= fromDate` |
| `grade` | integer ≥ 0 (default 0) |
| `totalRating` | integer 0–100 (legacy sums line ratings; server may recompute) |
| `lines` | required array, max 20 items |
| `lines[].param` | required string |
| `lines[].rating` | integer 1–5 (default 0) |
| `lines[].paramAr` | optional string |
| unknown body fields | rejected (Joi default) |
| `headerId` / `lineId` | string `/^[1-9][0-9]{0,18}$/` |

---

## 10. Implementation Checklist for the Agent

1. ✅ Feature folder `server/src/modules/hr/probation-evaluations/` with
   `probationEvaluation.routes.js` / `.controller.js` / `.service.js` / `.repository.js` /
   `probationEvaluation.validation.js` — factories with injectable deps, mirroring
   `src/modules/users/` and `DEVELOPER-MODULE-GUIDE.md` §4.
2. ✅ 5 core endpoints (§2) + 4 lookups; guards in approved order:
   `authenticate` → `requireCsrfToken` (unsafe) → `authorize('HR.PROBATION_EVALUATIONS', 'ACTION')`
   → `validate({...})`; `Cache-Control: no-store`.
3. ✅ Insert / Update / Delete inside ONE `withTransaction(POOLS.LOW, ...)`; repositories get
   the connection and never commit/rollback; named bind variables only; `POOLS.LOW`.
4. ✅ ID generation exactly as legacy: `NVL(MAX(HEADER_ID+1),1)` for header and per-line
   `NVL(MAX(line_id+1),1)` scoped to `HEADER_ID`; UUID generated in Node; read back header id by
   UUID.
5. ✅ `REQUEST_STATUS` written only as `'DRAFT'` on insert; never transitioned here (§11); audit
   fields (`CREATED_BY`, `CREATED_AT`) never touched on update; `USER_NAME`/`USER_MAIL` not
   updated.
6. ✅ Update = header UPDATE + per-line UPDATE by `LINE_ID` (legacy pattern: lines are updated,
   not deleted/inserted), one transaction.
7. ✅ Listing: server-side filters (§7.1), pagination, `total`, allowlisted sort, HR vs non-HR
   scoping (§7.4) — NO workflow columns (`PENDING_AT` excluded).
8. ✅ Validation per §9 → `400 VALIDATION_ERROR` with `details[{field,message}]`.
9. ✅ Keep exact legacy column names (`JOB_T`, `PREPARED_BY_CMNT`, `APPROVED_BY_CMNT`,
   `PARAMA_NAME_AR`, `REQUEST_STATUS`) — no renames without DB migration (gate G1).
10. ✅ Document every operation in `server/docs/openapi/openapi.yaml`, add routes to
    `tests/api-docs.test.js`; Supertest tests with doubles: success, 400, 401, 403 (+ DENY),
    404, 409 (delete guard), pagination bounds, CSRF, rollback. Run `cd server; npm run check`.

---

## 11. WORKFLOW — EXPLICITLY OUT OF SCOPE (verified present in legacy; do NOT implement)

- `ProbationFlow::submit()` (`controllers/ProbationFlow.php:66-296`) — SMTP mail
  (hard-coded `workflowmailer@zamilplastic.com` / `D@989955427519ud`),
  `callXXPHP_WORKFLOW(... 'EPRBF' ...)`, then `updateRequestStatus(id, 'INPROCESS')`.
- `ProbationFlow::workflow()` (`controllers/ProbationFlow.php:298-754`) — approve/reject handler
  writing `REQUEST_STATUS = 'Approved' | 'Rejected'`.
- `Workflow_model::callXXPHP_WORKFLOW` (`models/Workflow_model.php`), `Data_model` notification
  IDs/status close, `Zmailer` EPRBF mail actions (approve/reject/forward/RFI/delegation),
  delegation `form_code = 1064`.
- **Status transitions:** any API call setting `REQUEST_STATUS` to `INPROCESS`/`Approved`/`Rejected`.
  Only `'DRAFT'` is written by this API; other values are only **read** (list filter).
- **Listing columns that are workflow projections:** `PENDING_AT` — excluded from §7.
- `fetchApprover()` / `XX_PROBATION_WF` lookup — workflow-only.

---

## 12. AGENT PROMPT (copy-paste this to your coding assistant)

```text
You are helping me implement a change in the Zamil Digitalization repository
(GitHub: commonolivesofts-create/zamil-revamp). React 19 + Vite 8 frontend (client/) and
Node.js 24 + Express 5 ES-module backend (server/) over an existing Oracle Autonomous
Database schema. The repository is public.

MY TASK (backend-only — do not touch client/)
Implement the Probation Evaluation Form (PAF) CRUD API, fully specified in
/docs/specs/README_probation_evaluation_form.md at the repository root. Scope is strictly: INSERT, READ,
UPDATE, DELETE, LISTING WITH FILTERS, and the lookup endpoints defined in that file.
The legacy PHP (CodeIgniter 3) implementation exists only at
C:\xampp\htdocs\zpil_codebase\pmform_codebase (controllers/Probation.php,
models/Probation_Model.php, models/Data_model.php, views/probation/probation.php,
views/probation/prf_uplines.php, views/probation/prob_report.php) — use it ONLY to verify
field behaviour if the README is unclear.

EXPLICIT EXCLUSIONS (README §11 is authoritative)
- NO workflow/approval/email logic of any kind: do NOT read or write XXPHP_WORKFLOW, do NOT
  touch ProbationFlow, do NOT implement submit/approve/reject, no SMTP, no RFI/forward/delegation.
  The API writes REQUEST_STATUS only as 'DRAFT' on insert and NEVER transitions it.
- Do NOT add the workflow-derived listing column PENDING_AT.
- No frontend work, no DDL/sequences or schema changes (needs my explicit approval), no new
  dependencies.

READ BEFORE WRITING CODE (base every statement on files you actually read)
1. README_probation_evaluation_form.md — the authoritative spec: 2 tables, column↔field
   mapping, payload, exact SQL per operation, filters, scoping, validation rules, lookups,
   legacy defaults ('-' / 0 / '01-JAN-00', max 20 lines) — follow it exactly and flag
   conflicts instead of choosing silently.
2. README_interview_assessment_form.md, README_employment_offer_form.md,
   README_personal_requisition_form.md, README_orientation_training_form.md — only for
   conventions/format; implement nothing else from them.
3. server/CLAUDE.md and server/docs/01-SYSTEM_ARCHITECTURE.md,
   02-API_DEVELOPMENT_STANDARDS.md, 03-ORACLE_DATABASE_ARCHITECTURE.md,
   06-ARCHITECTURE_DECISIONS_GUIDELINES.md (locked ADRs — do not work around them).
4. server/docs/DEVELOPER-MODULE-GUIDE.md — section 4 "Adding a backend module" is your
   step-by-step checklist; mirror the existing src/modules/users/ module end to end.
5. server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md, BACKEND-TESTING.md, and
   docs/FEATURE-DELIVERY-WORKFLOW.md (approval gates).

WHAT TO BUILD
- New feature folder src/modules/hr/probation-evaluations/ with
  probationEvaluation.routes.js / .controller.js / .service.js / .repository.js /
  probationEvaluation.validation.js (factory functions with injectable dependencies, exactly
  like the users module).
- Endpoints under /api/v1/hr/probation-evaluations:
    POST   /                     insert header + lines in ONE
                                  withTransaction(POOLS.LOW, ...); id from
                                  SELECT NVL(MAX(HEADER_ID+1),1); read back HEADER_ID by UUID;
                                  per-line id from NVL(MAX(line_id+1),1) WHERE HEADER_ID;
                                  REQUEST_STATUS='DRAFT'
    GET    /                     listing with filters + pagination + total (README §7.1;
                                  allowlisted sortBy/sortOrder; OFFSET/FETCH; HR vs non-HR
                                  scoping from req.auth — §7.4; NO PENDING_AT column)
    GET    /:headerId            read header + lines ordered by LINE_ID (404 if absent)
    PUT    /:headerId            update header + per-line UPDATE by LINE_ID, one transaction,
                                  404 if absent; never touch REQUEST_STATUS/USER_NAME/
                                  USER_MAIL/CREATED_AT/CREATED_BY
    DELETE /:headerId            delete lines then header in one transaction; 404 if absent;
                                  apply §6 guard (Draft-only) — confirm policy if it differs
    GET    /lookups/form-types | /employees | /requestor | /employee-details?empName=
                                  (README §8 exact SQL)
- Guards in approved order on every route: authenticate → requireCsrfToken (unsafe) →
  authorize('HR.PROBATION_EVALUATIONS', 'ACTION') → validate({ params, query, body });
  Cache-Control: no-store. Controllers thin; SQL ONLY in the repository with named bind
  variables; business rules only in the service; AppError for expected failures;
  sendSuccess / sendPaginated envelopes; headerId/lineId travel as strings
  (/^[1-9][0-9]{0,18}$/); rows mapped to camelCase; explicit column lists; POOLS.LOW.

RULES I WILL HOLD YOU TO
- Never invent tables, columns, endpoints, permissions or business rules — if the README and
  the real Oracle schema disagree, stop and ask me.
- Reuse shared infrastructure only (config, logger, validate, AppError, apiResponse,
  withConnection/withTransaction); never read process.env, never console.*, no ORMs, no
  generic base repositories, no parallel helpers.
- Register the router in src/routes/api.routes.js (accepting deps.*Repository and db.* for
  tests), document every operation in server/docs/openapi/openapi.yaml in the same change,
  and add the routes to tests/api-docs.test.js.
- Permission codes (e.g. HR.PROBATION_EVALUATIONS {VIEW, CREATE, UPDATE, DELETE}) must be
  registered in the RBAC catalogue — tell me which codes you need and wait for my approval
  before assuming they exist; default-deny otherwise.
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
