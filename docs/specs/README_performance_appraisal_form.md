# Performance Appraisal Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Performance Appraisal Form** (printed as
> *Employee Performance Appraisal* / *Performance Rating Form*; workflow form code `PRF`, form code
> `1010`) — **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup APIs and the
> **form flow** (rating maths, quotas, conditional behaviour — §7). **Workflow / approval / email
> logic is explicitly OUT of scope** — this module has workflow (`controllers/PRFFlow.php`, steps
> 1–3, `XXPHP_WORKFLOW`, SMTP notification mails); everything workflow-related is catalogued in §9
> and must NOT be implemented. **Print/PDF is out of scope** (`window.print()` only).
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
>
> - `controllers/Rating.php` (`class Rating`; methods: `index`, `add_rating`, `updateprf`,
>   `update_rating`, `prfreport`, `employee_comment`, `add_employee_comment`, `getEmpDetails`,
>   `logout`)
> - `models/Data_model.php` (all PRF SQL: `add_rating`, `update_rating`, `getPRFRecords`,
>   `getMainRecordsPRFByID`, `getRatingRecordsPRFByID`, `getDevRecordsPRFByID`,
>   `getTraRecordsPRFByID`, `getAllocatedGrades`, `getEmp`, `getEmpDetails`, `getRequestedBy`,
>   `add_employee_comment`, `changePRFStatus`)
> - `views/prf.php` (create, English), `views/aprf.php` (create, Arabic), `views/prfedit.php` +
>   `views/aprfedit.php` (edit), `views/prfreport.php` (report, EN+AR tables), `views/employee_remark.php`
>   + `views/aemployee_remark.php` (employee's remarks page)
> - `controllers/PRFFlow.php` (workflow engine — excluded), `XXZP.XXZP_RATING_WF_LOOKUP`
>   (approver registry written at insert — workflow, excluded)
>
> **Database:** Oracle, schema `XXZP` (legacy sometimes writes `XXZP.` explicitly, sometimes
> unqualified). Lookups come from `XX_DIGI_EMP_MASTER`. All SQL below uses **bind variables** —
> never string-concatenate user input (the legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_transfer_request_form.md`,
> `README_personal_status_change_form.md`, `README_employee_report_form.md` — same structure and
> conventions. Do not implement workflow from anywhere.

---

## 1. Data Model

One header row + exactly **20 rating lines** (fixed — one per performance criterion) + up to 5
development lines + up to 5 training lines, all keyed by the same `HEADER_ID`.

| #   | Table                                | Role                                                    |
| --- | ------------------------------------ | ------------------------------------------------------- |
| 1   | `XXZP.XXZPI_HR_PA_HEADER_TAB`        | Appraisal header (note the `XXZPI` prefix)              |
| 2   | `XXZP.XXZPI_HR_PA_RATING_TAB`        | 20 competency lines (always 20, `RATING_ID` 1…20)        |
| 3   | `XXZP.XXZPI_HR_PA_DEV_TAB`           | Development goals (up to 5, `IND_DEV_ID` 1…5)            |
| 4   | `XXZP.XXZPI_HR_PA_PLANNING_TAB`      | Training needs (up to 5, `PLANNING_ID` 1…5)              |
| 5   | `XXZP.XXZP_RATING_WF_LOOKUP`         | **workflow-only** approver registry (§9) — do not write  |

### 1.1 `XXZP.XXZPI_HR_PA_HEADER_TAB`

| Column                 | Type (inferred) | Legacy form field        | Notes                                                             |
| ---------------------- | --------------- | ------------------------ | ----------------------------------------------------------------- |
| `HEADER_ID`            | NUMBER PK       | hidden `header_id_hidden`| **DB-generated** — INSERT omits it; read back by `UUID` (§5.3)     |
| `UUID`                 | VARCHAR2(36)    | —                        | v4, generated in PHP (`uuid_v4()`)                                 |
| `EMPLOYEE_ID`          | NUMBER          | hidden `person_id`       | `PERSON_ID` from auto-fill                                         |
| `EMPLOYEE_NAME`        | VARCHAR2        | `employee_name`          | create: dropdown; edit: readonly text                              |
| `EMPLOYEE_NUMBER`      | NUMBER          | `employee_number`        | readonly, auto-filled                                              |
| `HIRE_DATE`            | DATE `DD-MON-RR`| hidden `hire_date`       | `JOINING_DATE` from auto-fill                                      |
| `JOB_ID`               | NUMBER          | hidden `job_id`          | auto-filled                                                       |
| `JOB_TITLE`            | VARCHAR2        | `job_title`              | readonly, auto-filled                                              |
| `APPRAISAL_PERIOD_FROM`| DATE `DD-MON-RR`| derived from `year`      | `01-Jan-<yy>` of the selected review year (§7.7)                   |
| `APPRAISAL_PERIOD_TO`  | DATE `DD-MON-RR`| derived from `year`      | `31-Dec-<yy>`                                                     |
| `DEPARTMENT_ID`        | NUMBER          | hidden `department_id`   | `ORGANIZATION_ID` from auto-fill                                   |
| `DEPARTMENT_NAME`      | VARCHAR2        | `department`             | readonly, auto-filled                                              |
| `REPORTING_TO`         | VARCHAR2        | —                        | **hardcoded `'ZAMIL PLASTIC'`** (company, not a person)            |
| `EVALUATED_BY`         | VARCHAR2        | `appraiser_details`      | auto-filled with the **logged-in user's** name (§7.4)              |
| `TOTAL_RATINGS`        | NUMBER          | hidden `rating_block`    | average of the 20 rates — **recompute server-side** (§5.4)         |
| `FINAL_RATING_TOTAL`   | NUMBER          | hidden `rating_block`    | written with the same value (duplicate column, both are set)       |
| `NUMBER_OF_FACTORS`    | NUMBER          | —                        | constant `20`                                                      |
| `YEAR`                 | NUMBER          | `year` (select)          | review year; **the report's primary filter**                       |
| `CREATED_BY`           | NUMBER          | —                        | audit = session user id                                            |
| `CREATION_DATE`        | DATE `DD-MON-RR`| —                        | audit (`d-M-y`)                                                    |
| `ATTRIBUTE9`           | VARCHAR2        | hidden `description_block`| grade **description** text (e.g. `CONSISTENTLY EXCEEDS`)          |
| `ATTRIBUTE10`          | VARCHAR2        | hidden `grade_block`     | grade letter `A` \| `B` \| `C` \| `D` \| `E`                       |
| `ATTRIBUTE11`          | NUMBER          | hidden `year_in_company` | years in company (auto-fill)                                       |
| `ATTRIBUTE12`          | NUMBER          | hidden `year_in_position`| years in current position (auto-fill)                              |
| `STATUS`               | VARCHAR2        | hidden `status` (edit)   | **server-owned**; insert writes `'Inprocess'` (§7.8)               |
| `EMP_REMARKS`          | VARCHAR2        | `meeting_comment`        | employee's meeting comment (create: readonly; §7.6)                |
| `APP_REMARKS`          | VARCHAR2        | `appraiser_remark`       | appraiser's remarks                                                |
| `ATTRIBUTE1`           | VARCHAR2        | session `language`       | form language stored at insert (`English` / `Arabic`)              |
| `ATTRIBUTE2` / `ATTRIBUTE3` / `ATTRIBUTE4` | VARCHAR2 | —       | **approver emails** written during insert — workflow-owned (§9)    |

There are **no `UPDATED_BY` / `UPDATED_AT` columns** and the update path never touches employee
info, period, year or status (§5.5).

### 1.2 `XXZP.XXZPI_HR_PA_RATING_TAB` (exactly 20 rows per header)

| Column           | Type (inferred) | Legacy form field     | Notes                                                        |
| ---------------- | --------------- | --------------------- | ------------------------------------------------------------ |
| `RATING_ID`      | NUMBER          | —                     | 1…20 (line number, part of the PK with `HEADER_ID`)           |
| `HEADER_ID`      | NUMBER FK       | —                     |                                                              |
| `PERSON_ID`      | NUMBER          | hidden `person_id`    | copies the header's employee id                              |
| `COMPETENCY_CODE`| NUMBER          | —                     | same 1…20 as `RATING_ID`                                     |
| `COMPETENCY_NAME`| VARCHAR2        | **hardcoded row label** | the 20 fixed criteria, stored in the form's language (§7.1) |
| `DESCRIPTION`    | VARCHAR2        | `justification1…20`   | "Explanation & Justification of Ratings" per criterion       |
| `RATINGS`        | NUMBER          | `rate1…20`            | select `1`–`5` (empty option posts `0`)                      |
| `CREATION_DATE`  | DATE `DD-MON-RR`| —                     | audit                                                        |

**The 20 criteria (English, in `RATING_ID` order):** Quality / Accuracy of Work · Quanitity of
Work *(sic)* · Dependability · Attendance / Punctuality · Professional Communication Skills with
co-workers/Supervisors · Customer-focused Communication Skills · Ability to work as a member of a
team; teamwork · Demonstrates Positive Attitude · Ability to work independently · Open to feedback ·
Willingness to take on additional responsibilities · Complies with company policies and procedures ·
Exhibits effective problem solving skills · Eagerness to learn new-job related skills · Ask questions
and seek guidance as needed · Makes progress towards professional development goals · Demonstrates
Zamil Group Core Values · Initiative · Developing Others · Health Safety & Environment (HSE).
(Arabic equivalents are rendered when the session language is `Arabic`.)

### 1.3 `XXZP.XXZPI_HR_PA_DEV_TAB` and `XXZP.XXZPI_HR_PA_PLANNING_TAB`

| Table         | Column            | Type (inferred) | Legacy form field    | Notes                                   |
| ------------- | ----------------- | --------------- | -------------------- | --------------------------------------- |
| `…DEV_TAB`    | `IND_DEV_ID`      | NUMBER          | —                    | 1…5                                     |
| `…DEV_TAB`    | `IDENTIFIED_NEEDS`| VARCHAR2        | `development1…5`     | first one required (create)             |
| `…DEV_TAB`    | `HEADER_ID`, `CREATION_DATE` | audit | —               |                                         |
| `…PLANNING_TAB` | `PLANNING_ID`   | NUMBER          | —                    | 1…5                                     |
| `…PLANNING_TAB` | `OBJECTIVE_ID`  | NUMBER          | —                    | same value as `PLANNING_ID`             |
| `…PLANNING_TAB` | `OBJECTIVE`     | VARCHAR2        | `training1…5`        | first one required (create)             |
| `…PLANNING_TAB` | `HEADER_ID`, `CREATION_DATE` | audit | —               |                                         |

Both line tables keep **positional ids** (row 1…5): the legacy update overwrites line *n* in place
and never deletes rows (§8.5).

---

## 2. API Surface

Base path: `/api/v1/hr/performance-appraisals`
Auth: session (`authenticate`); `created_by` from `req.auth` — never the body.

| Method   | Endpoint                                            | Permission Code                                | Purpose                                                        |
| -------- | --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `POST`   | `/api/v1/hr/performance-appraisals`                 | `HR.PERFORMANCE_APPRAISALS.CREATE`             | **Insert** header + 20 ratings + dev + training (one transaction) |
| `GET`    | `/api/v1/hr/performance-appraisals/:headerId`       | `HR.PERFORMANCE_APPRAISALS.VIEW`               | **Read** header + all line arrays                              |
| `PUT`    | `/api/v1/hr/performance-appraisals/:headerId`       | `HR.PERFORMANCE_APPRAISALS.UPDATE`             | **Update** (guard per §5.6)                                    |
| `PUT`    | `/api/v1/hr/performance-appraisals/:headerId/employee-remarks` | `HR.PERFORMANCE_APPRAISALS.UPDATE` | **Update only `EMP_REMARKS`** (legacy `add_employee_comment`) |
| `DELETE` | `/api/v1/hr/performance-appraisals/:headerId`       | `HR.PERFORMANCE_APPRAISALS.DELETE`             | **Delete** header + all lines (legacy has none — §4.2)         |
| `GET`    | `/api/v1/hr/performance-appraisals`                 | `HR.PERFORMANCE_APPRAISALS.VIEW`               | **Listing with filters** + pagination (year-default current)   |
| `GET`    | `.../lookups/employees`                             | `HR.PERFORMANCE_APPRAISALS.VIEW`               | eligible-employee dropdown (§6.1)                              |
| `GET`    | `.../lookups/employees/:name`                       | `HR.PERFORMANCE_APPRAISALS.VIEW`               | **auto-fill payload** + duplicate-year check (§6.2)            |
| `GET`    | `.../lookups/grade-stats`                           | `HR.PERFORMANCE_APPRAISALS.VIEW`               | grade quota blocks (§6.3)                                      |
| `GET`    | `.../lookups/requestor`                             | `HR.PERFORMANCE_APPRAISALS.VIEW`               | session user's name/email (hidden form fields, §6.4)           |

**Route order:** register `/lookups/...` routes **before** `/:headerId`.

**Universal responses**

```jsonc
{ "success": true, "data": { ... } }                             // 200 / 201
{ "success": false, "message": "Performance appraisal not found" } // 404
{ "success": false, "message": "Validation failed", "errors": [...] } // 400
{ "success": false, "message": "Request is Inprocess. Can not Update Request" } // 409
{ "success": false, "message": "Already Rating Given" }          // 409 (duplicate year)
```

---

## 3. `GET /api/v1/hr/performance-appraisals` — Listing with filters

Legacy `prfreport($year)` + `getPRFRecords($lang, $year)`: a **year dropdown** (populated from the
distinct `YEAR` values of the header table, defaulting to the current year), a *View Appraisals*
button that reloads with that year, DataTables filtering client-side with an Excel button, and rows
that navigate to `rating/updateprf/:headerId` on click.

### 3.1 Scoping (legacy rule — implement it)

```sql
-- HR user? (tag match on the XXZP_HR lookup)
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
  FROM XX_DIGI_LOOKUP_VALUES
 WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId;
```

- **HR user** → sees all appraisals for the year.
- **Non-HR** → `CREATED_BY = <session user id>` only; if the user has no `EMPLOYEE_NUMBER` in the
  master, legacy returns **zero rows** (`AND 1 = 0`) — reproduce as an explicit empty result, not
  an error.
- Do **not** port any hardcoded user ids if you find them nearby (none in the active query).

### 3.2 Filters (query parameters)

| Param        | Type         | Matches                                                | Legacy source                |
| ------------ | ------------ | ------------------------------------------------------ | ---------------------------- |
| `year`       | number       | `YEAR` — **defaults to current year** when omitted     | year dropdown (`?year=YYYY`) |
| `search`     | string       | `EMPLOYEE_NAME`, `EMPLOYEE_NUMBER`, `JOB_TITLE`, `DEPARTMENT_NAME` (case-insensitive `LIKE`) | DataTables global search |
| `status`     | string       | `STATUS` (case-insensitive)                            | Status chip                  |
| `grade`      | enum         | `ATTRIBUTE10` (`A`–`E`)                                | Grade column                 |
| `department` | string       | `DEPARTMENT_NAME` (exact)                              | Department column            |
| `page`       | number ≥ 1   | default 1                                              | DataTables paging            |
| `pageSize`   | number 1–100 | default 25                                             |                              |
| `sort`       | enum         | `headerId \| empName \| empNumber \| jobTitle \| grade \| rating \| year \| creationDate` | click-to-sort headers |
| `order`      | `asc` \| `desc` | default `headerId desc`                             |                              |

### 3.3 Listing SQL (bind variables; scope predicate added server-side)

```sql
SELECT HR.HEADER_ID,
       HR.EMPLOYEE_NAME,
       HR.EMPLOYEE_NUMBER,
       HR.JOB_TITLE,
       HR.DEPARTMENT_NAME,
       HR.TOTAL_RATINGS,
       HR.ATTRIBUTE9  AS DESCRIPTION_TEXT,
       HR.ATTRIBUTE10 AS GRADE,
       HR.STATUS,
       HR.YEAR,
       HR.CREATION_DATE
  FROM XXZP.XXZPI_HR_PA_HEADER_TAB HR
 WHERE HR.YEAR = :year
   AND (UPPER(HR.EMPLOYEE_NAME)    LIKE UPPER(:search) OR
        UPPER(HR.JOB_TITLE)        LIKE UPPER(:search) OR
        UPPER(HR.DEPARTMENT_NAME)  LIKE UPPER(:search) OR
        TO_CHAR(HR.EMPLOYEE_NUMBER) LIKE :search)
   AND (UPPER(HR.STATUS) = UPPER(:status)  OR :status IS NULL)
   AND (HR.ATTRIBUTE10 = :grade           OR :grade IS NULL)
   AND (HR.DEPARTMENT_NAME = :department  OR :department IS NULL)
   AND (:is_hr = 1 OR HR.CREATED_BY = :user_id)          -- §3.1
 ORDER BY :sort :order, HR.HEADER_ID DESC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY;

-- total count: same predicates, no ORDER BY / OFFSET
SELECT COUNT(*) FROM XXZP.XXZPI_HR_PA_HEADER_TAB HR WHERE ...;
```

**Do not** reproduce the legacy `PENDING_AT` subquery — it reads `XXPHP_WORKFLOW` (workflow, §9).

### 3.4 Response shape

```jsonc
{
  "success": true,
  "data": {
    "meta": { "year": 2026, "page": 1, "pageSize": 25, "total": 84, "sort": "headerId", "order": "desc" },
    "rows": [
      {
        "headerId": 771, "empName": "AHMED, SAMI", "empNumber": 4321,
        "jobTitle": "Machine Operator", "department": "Production Section",
        "rating": 3.85, "grade": "B",
        "description": "MEETS AND EXCEEDS", "status": "Inprocess",
        "year": 2026, "creationDate": "2026-10-29"
      }
    ]
  }
}
```

Legacy status chips: `Inprocess` → info (cyan), `Rejected` → danger (red), **everything else →
success (green)** — i.e. even `Draft` renders green (§8.15). The API returns the raw status; the
frontend colours it.

---

## 4. Read and Delete

### 4.1 Read — `GET /api/v1/hr/performance-appraisals/:headerId`

Legacy `updateprf($id)` loads four queries (`getMainRecordsPRFByID`, `getRatingRecordsPRFByID`,
`getDevRecordsPRFByID`, `getTraRecordsPRFByID`). The API returns them combined:

```jsonc
{ "success": true, "data": {
    "headerId": 771, "uuid": "…",
    "employee": { "personId": 123456, "name": "AHMED, SAMI", "number": 4321,
                   "hireDate": "2018-04-01", "jobId": 881, "jobTitle": "Machine Operator",
                   "departmentId": 440, "department": "Production Section" },
    "period": { "year": 2026, "from": "2026-01-01", "to": "2026-12-31" },
    "appraiser": { "evaluatedBy": "KHALED, ALI", "yearsInCompany": 8, "yearsInPosition": 3 },
    "result": { "rating": 3.85, "grade": "B", "description": "MEETS AND EXCEEDS" },
    "criteria": [ { "id": 1, "name": "Quality / Accuracy of Work", "rating": 4, "justification": "…" }
                   /* … exactly 20, in RATING_ID order … */ ],
    "development": [ { "id": 1, "need": "…" } /* up to 5 */ ],
    "training":    [ { "id": 1, "objective": "…" } /* up to 5 */ ],
    "remarks": { "employee": "…", "appraiser": "…" },
    "status": "Inprocess", "formLanguage": "English",
    "createdBy": 88, "creationDate": "2026-10-29"
} }
```

Unknown id → `404 { "success": false, "message": "Performance appraisal not found" }`.

### 4.2 Delete — `DELETE /api/v1/hr/performance-appraisals/:headerId`

**The legacy module has no delete.** Implement one transaction, lines first:

```sql
DELETE FROM XXZP.XXZPI_HR_PA_RATING_TAB    WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZPI_HR_PA_DEV_TAB       WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZPI_HR_PA_PLANNING_TAB  WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZPI_HR_PA_HEADER_TAB    WHERE HEADER_ID = :headerId;
```

- `404` if no header matched; success returns `{ "success": true, "data": { "headerId": 771 } }`.
- **Open decision (recommended):** block delete while `STATUS = 'Inprocess'` →
  `409 { message: "Cannot delete an appraisal that is In Process" }`.

---

## 5. Write endpoints

### 5.1 Payload (create and update share the shape)

```jsonc
{
  "year": 2026,                                   // drives the appraisal period (§7.7)
  "employee": { "personId": 123456, "name": "AHMED, SAMI", "number": 4321,
                 "hireDate": "2018-04-01", "jobId": 881, "jobTitle": "Machine Operator",
                 "departmentId": 440, "department": "Production Section",
                 "yearsInCompany": 8, "yearsInPosition": 3, "evaluatedBy": "KHALED, ALI" },
  "criteria": [                                    // exactly 20, ids 1..20
    { "id": 1, "rating": 4, "justification": "…" },
    { "id": 2, "rating": 3, "justification": "…" }
    /* … 20 total … */
  ],
  "development": ["…goal 1…", "…goal 2…"],          // up to 5, first required
  "training": ["…need 1…"],                        // up to 5, first required
  "remarks": { "employee": "…", "appraiser": "…" },
  "formLanguage": "English"                        // 'English' | 'Arabic' (§7.1)
}
```

**Never accepted from the body:** `headerId`/`uuid` (on create), `status`, `createdBy`,
`creationDate`, `result.rating` / `result.grade` / `result.description` (server computes §5.4),
`criteria[].name` (server renders the fixed 20 criteria), and the approver `attribute2/3/4` columns.

### 5.2 Validation

| Field                     | Rule                                                | Failure                        |
| ------------------------- | --------------------------------------------------- | ------------------------------ |
| `year`                    | required, integer in `currentYear-5 … currentYear` (create) | `400 YEAR_INVALID`     |
| `employee.*`              | required; must resolve in §6.1/§6.2 lookups         | `400 EMP_NOT_FOUND`            |
| duplicate year            | no non-rejected appraisal for this employee+year (§6.2) | `409 ALREADY_RATED`         |
| `criteria`                | exactly 20 entries, ids 1…20, each `rating` ∈ 1…5   | `400 RATINGS_INVALID`          |
| `criteria[].justification`| optional text (legacy stores `'-'` when blank)      | —                              |
| `development[0]`          | required non-empty (create)                         | `400 DEVELOPMENT_REQUIRED`     |
| `training[0]`             | required non-empty (create)                         | `400 TRAINING_REQUIRED`        |
| `remarks.*`               | optional text                                       | —                              |

Mirrors the create form's client validation modal (§7.9) — plus server-side enforcement, which
legacy entirely lacks.

### 5.3 ID / period generation

- All four INSERTs **omit their PK columns**; the database generates `HEADER_ID`.
- Generate `UUID` in Node (`crypto.randomUUID()`), insert the header, read the id back
  (`SELECT HEADER_ID … WHERE UUID = :uuid`) — exactly what legacy does via `get_column_value()` —
  then use it for the line inserts (all in one transaction).
- Period: `APPRAISAL_PERIOD_FROM = 01-Jan-<year>`, `APPRAISAL_PERIOD_TO = 31-Dec-<year>`
  (legacy builds a short-year string `01-Jan-26` and relies on Oracle's `RR` conversion — bind
  `TO_DATE(:from,'YYYY-MM-DD')` instead).

### 5.4 Server-computed result (do not trust the client)

The legacy form computes these three in JavaScript and posts them as hidden fields. The API must
recompute from the 20 ratings:

```
rating     = round(sum(ratings) / 20, 2)
grade      = rating > 4.24 ? 'A'
           : rating > 3.49 ? 'B'
           : rating > 2.49 ? 'C'
           : rating > 1.59 ? 'D'
           :                'E'
description= 'A' → 'CONSISTENTLY EXCEEDS'
             'B' → 'MEETS AND EXCEEDS'
             'C' → 'SUCCESSFULLY MEETS'
             'D' → 'MEETS SOME'
             'E' → 'BELOW EXPECTATIONS'
```

Write `rating` into **both** `TOTAL_RATINGS` and `FINAL_RATING_TOTAL`, `grade` into `ATTRIBUTE10`,
`description` into `ATTRIBUTE9`.

### 5.5 SQL — create

```sql
-- 1. header
INSERT INTO XXZP.XXZPI_HR_PA_HEADER_TAB
  (UUID, EMPLOYEE_ID, EMPLOYEE_NAME, EMPLOYEE_NUMBER, HIRE_DATE, JOB_ID, JOB_TITLE,
   APPRAISAL_PERIOD_FROM, APPRAISAL_PERIOD_TO, DEPARTMENT_ID, DEPARTMENT_NAME, REPORTING_TO,
   EVALUATED_BY, TOTAL_RATINGS, NUMBER_OF_FACTORS, YEAR, CREATED_BY, CREATION_DATE,
   ATTRIBUTE9, ATTRIBUTE10, ATTRIBUTE11, ATTRIBUTE12, FINAL_RATING_TOTAL, STATUS,
   EMP_REMARKS, APP_REMARKS, ATTRIBUTE1)
VALUES
  (:uuid, :personId, :empName, :empNumber, TO_DATE(:hireDate,'YYYY-MM-DD'), :jobId, :jobTitle,
   TO_DATE(:periodFrom,'YYYY-MM-DD'), TO_DATE(:periodTo,'YYYY-MM-DD'), :deptId, :deptName,
   'ZAMIL PLASTIC',
   :evaluatedBy, :rating, 20, :year, :createdBy, SYSDATE,
   :description, :grade, :yearsInCompany, :yearsInPosition, :rating, 'Inprocess',
   :empRemarks, :appRemarks, :formLanguage)
RETURNING HEADER_ID INTO :headerId;

-- 2. exactly 20 rating lines (loop with binds)
INSERT INTO XXZP.XXZPI_HR_PA_RATING_TAB
  (RATING_ID, HEADER_ID, PERSON_ID, COMPETENCY_CODE, COMPETENCY_NAME, DESCRIPTION, RATINGS, CREATION_DATE)
VALUES
  (:ratingId, :headerId, :personId, :ratingId, :criteriaName(:ratingId), :justification, :rating, SYSDATE);

-- 3. development lines (only for non-empty slots, positional id = index+1)
INSERT INTO XXZP.XXZPI_HR_PA_DEV_TAB (IND_DEV_ID, IDENTIFIED_NEEDS, HEADER_ID, CREATION_DATE)
VALUES (:devId, :need, :headerId, SYSDATE);

-- 4. training lines (only for non-empty slots)
INSERT INTO XXZP.XXZPI_HR_PA_PLANNING_TAB (PLANNING_ID, OBJECTIVE_ID, OBJECTIVE, HEADER_ID, CREATION_DATE)
VALUES (:planId, :planId, :objective, :headerId, SYSDATE);
```

`STATUS = 'Inprocess'` on create is the **legacy** behaviour (immediately locks the record, §7.8)
— see open decision 1 in §5.6 before copying it. **Do not** insert into `XXZP_RATING_WF_LOOKUP` or
write `ATTRIBUTE2/3/4` (workflow, §9).

### 5.6 SQL — update + guard

Legacy guard first:

```sql
SELECT STATUS FROM XXZP.XXZPI_HR_PA_HEADER_TAB WHERE HEADER_ID = :headerId;
-- if STATUS = 'Inprocess' → 409 "Request is Inprocess. Can not Update Request"
```

Then, one transaction:

```sql
UPDATE XXZP.XXZPI_HR_PA_HEADER_TAB
   SET TOTAL_RATINGS     = :rating,
       FINAL_RATING_TOTAL = :rating,
       ATTRIBUTE9        = :description,
       ATTRIBUTE10       = :grade,
       EMP_REMARKS       = :empRemarks,
       APP_REMARKS       = :appRemarks
 WHERE HEADER_ID = :headerId;

UPDATE XXZP.XXZPI_HR_PA_RATING_TAB
   SET DESCRIPTION = :justification, RATINGS = :rating
 WHERE HEADER_ID = :headerId AND RATING_ID = :ratingId;   -- loop 1..20

UPDATE XXZP.XXZPI_HR_PA_DEV_TAB
   SET IDENTIFIED_NEEDS = :need
 WHERE HEADER_ID = :headerId AND IND_DEV_ID = :devId;      -- loop 1..5, non-empty only

UPDATE XXZP.XXZPI_HR_PA_PLANNING_TAB
   SET OBJECTIVE = :objective
 WHERE HEADER_ID = :headerId AND PLANNING_ID = :planId;    -- loop 1..5, non-empty only
```

- Updates **do not** touch employee info, period, year, status, audit or approver columns.
- 0 rows on the header update → `404`.
- The **employee-remarks endpoint** is a single statement (legacy `add_employee_comment`):
  `UPDATE XXZP.XXZPI_HR_PA_HEADER_TAB SET EMP_REMARKS = :remarks WHERE HEADER_ID = :headerId;`
  → `200 { success, data: { headerId, remarks } }`.

**Open decisions (confirm before coding):**

1. **Initial status.** Legacy inserts `'Inprocess'`, which makes the record un-editable until the
   (out-of-scope) workflow resolves it. Recommended: keep parity (`'Inprocess'`) and let the future
   workflow own transitions — or start at `'Draft'`; do not decide silently.
2. **Duplicate appraisal per employee+year.** The dropdown and the auto-fill both try to prevent
   one (§6.1, §6.2) but with *different tables and status rules*. Recommended: enforce a single
   server-side rule — one non-rejected appraisal per `EMPLOYEE_NUMBER`+`YEAR` → `409`.
3. **Grade quotas** (A ≤ 15 %, B ≤ 30 %, C ≤ 40 %, D ≤ 10 %, E ≤ 5 %) are enforced **only in the
   browser, and only for A and E** (§7.5). Recommended: keep quotas client-side for now and document
   them as guidance, or enforce server-side — decide before implementation.

---

## 6. Lookup APIs

### 6.1 `GET .../lookups/employees` — eligible-employee dropdown

Legacy `Data_model->getEmp($userID)` — **the logged-in user's subordinates**, minus anyone who
already has this year's appraisal:

```sql
SELECT DISTINCT LEVEL AS HIERARCHY_LEVEL, OT.USER_ID, OT.FULL_NAME
  FROM XX_DIGI_EMP_MASTER OT
 WHERE OT.SYSTEM_PERSON_TYPE IN ('EMP','EMP_APL')
   AND OT.ASSIGNMENT_STATUS_TYPE_ID = '1'
   AND OT.CURRENT_EMP_FLAG = 'Y'
   AND LEVEL != 1
   AND NOT EXISTS (SELECT 1
                     FROM XXZP.XXZPI_HR_PAF_HEADER_TAB HD
                    WHERE HD.EMPLOYEE_NUMBER = OT.EMPLOYEE_NUMBER
                      AND HD.YEAR = TO_CHAR(SYSDATE,'YYYY')
                      AND HD.STATUS <> 'Rejected')
START WITH OT.FULL_NAME = (SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
CONNECT BY PRIOR OT.FULL_NAME = OT.SUPERVISOR_NAME;
```

- `LEVEL != 1` excludes the logged-in user themself.
- **Verify on the database:** the `NOT EXISTS` clause reads `XXZP.XXZPI_HR_PAF_HEADER_TAB`
  (`PAF`, not `PA` — the table this form writes). It is either a real parallel table or a stale
  name; the behaviour of the dropdown depends on it (open decision 2 in §6.2 covers the rule).

### 6.2 `GET .../lookups/employees/:name` — auto-fill payload

Legacy `POST Rating/getEmpDetails` → `Data_model->getEmpDetails($emp_name)`:

1. **Duplicate check first** — if a record already exists for this employee and the **current
   calendar year**, return `"exist"` (HTTP-wise legacy just echoes the string) → the frontend
   alerts **"Already Rating Given"** and does not fill the form:

```sql
SELECT COUNT(1) AS COUNT
  FROM XXZP.XXZPI_HR_PA_HEADER_TAB
 WHERE EMPLOYEE_NAME = :name
   AND YEAR = TO_CHAR(SYSDATE,'YYYY');
```

2. Otherwise return the auto-fill set (all against `XX_DIGI_EMP_MASTER`, current rows only):

```sql
-- ids: person_id + employee_number (CURRENT_EMP_FLAG='Y', PAPF dates)
-- hire: JOINING_DATE AS START_DATE
-- job : JOB_TITLE AS NAME, JOB_ID            (PAAF dates)
-- dept: ORGANIZATION_ID, ORGANIZATION_NAME AS NAME (PAAF dates)
-- sup : FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :sessionUserId   ← the appraiser
-- years in company   : floor((SYSDATE - MIN(PAAF_EFFECTIVE_START_DATE)) / 365) by person
-- years in position  : same, scoped to the employee's JOB_ID
```

Response:

```jsonc
{ "success": true, "data": {
    "personId": 123456, "empNumber": 4321, "hireDate": "2018-04-01",
    "jobId": 881, "jobTitle": "Machine Operator",
    "departmentId": 440, "departmentName": "Production Section",
    "yearsInCompany": 8, "yearsInPosition": 3,
    "evaluatedBy": "KHALED, ALI"
} }
```

- **Duplicate for the requested year** → `409 { message: "Already Rating Given" }` (note: legacy
  checks the *current* year only, while the form lets you pick `currentYear-5 … currentYear` —
  open decision 2 says which rule wins).
- `job_grade` is **never** returned — the field exists in the UI but legacy never fills it (§8.10).

### 6.3 `GET .../lookups/grade-stats` — the quota blocks

```sql
-- per grade A..E: how many of MY appraisals already carry that grade
SELECT COUNT(1) AS GRADE FROM XXZP.XXZPI_HR_PA_HEADER_TAB
 WHERE ATTRIBUTE10 = 'A' AND CREATED_BY = :userId;   -- repeat for B, C, D, E

-- total employee count for the distribution row
SELECT COUNT(*) FROM XX_DIGI_EMP_MASTER WHERE ...;    -- legacy = count($all_emps) of §6.1
```

```jsonc
{ "success": true, "data": { "totalEmployees": 340,
    "quota": { "percent": { "A": 15, "B": 30, "C": 40, "D": 10, "E": 5 },
               "target":  { "A": 51,  "B": 102, "C": 136, "D": 34, "E": 17 },
               "allocated": { "A": 3, "B": 9, "C": 14, "D": 2, "E": 1 } } } }
```

`target` = client formula: `Math.round(percent/100 * total)` for A–D, `Math.ceil` for E; when
`total ≤ 5` every target is 1.

### 6.4 `GET .../lookups/requestor` — session prefill (hidden fields)

```sql
SELECT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
  FROM XX_DIGI_EMP_MASTER
 WHERE EMPLOYEE_NUMBER = (SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER
                           WHERE USER_ID = :userId);
```

Powers the hidden `hidden_username` / `hidden_useremail` fields the legacy emails used.

---

## 7. Form flow — conditional behaviour (what the React screen must reproduce)

### 7.1 Bilingual forms (session language switches the whole view)

| Session `language` | Create page | Edit page      | Employee remarks page    | Report table       |
| ------------------ | ----------- | -------------- | ------------------------ | ------------------ |
| `Arabic`           | `aprf`      | `aprfedit`     | `aemployee_remark`       | Arabic table (`#example1`) |
| anything else      | `prf`       | `prfedit`      | `employee_remark`        | English table (`#example`) |

- The **criteria names are stored in the form's language** at insert time (`COMPETENCY_NAME` +
  header `ATTRIBUTE1`); the API must render the fixed 20 criteria in `formLanguage`.
- The report page renders **one** of the two tables per language (same data, mirrored column order).

### 7.2 The three screens

| Screen                   | Route (legacy)                | Form target                 | Purpose                                  |
| ------------------------ | ----------------------------- | --------------------------- | ---------------------------------------- |
| Create appraisal         | `Rating/index` (session ✓)    | `rating/add_rating`         | appraiser rates a subordinate            |
| Edit appraisal           | `Rating/updateprf/:id` (session ✓) | `rating/update_rating` | re-rate / add remarks (guarded, §7.8)    |
| Employee's remarks       | `Rating/employee_comment/:id` (**no session check** §8.2) | `rating/add_employee_comment` | the *employee* comments on their rating (linked from approval mails as "Form Link") |
| Report                   | `Rating/prfreport[/:year]` (**no session check**) | — (year reload)      | listing                                   |

Nav buttons on all three forms: **Home**, **Report**, **Submit**, **Print**, **Logout**.
Edit page heading: *"Update - Employee Performance Appraisal"*.

### 7.3 Employee dropdown — who can even be picked

- The dropdown contains **only the logged-in user's subordinates** (hierarchy below them, excluding
  themselves), minus employees already excluded per §6.1's `NOT EXISTS`.
- Placeholder option is `<Option value="0">Select Employee</Option>` — `employee_name = "0"` means
  "nothing chosen" and blocks both the rating calculation and submit.
- Picking a name that already has a current-year appraisal → alert **"Already Rating Given"**
  (auto-fill does not run).

### 7.4 Auto-fill mapping (on employee change)

| Target field           | Source                                             |
| ---------------------- | -------------------------------------------------- |
| `employee_number`      | `ids.EMPLOYEE_NUMBER` (readonly)                   |
| `job_title`            | `job.NAME` (readonly)                              |
| `department` / `department_id` | `dept.NAME` / `dept.ORGANIZATION_ID` (readonly) |
| `year_in_company`      | `years_in_companay` *(sic)* (readonly)             |
| `year_in_position`     | `pos_year_detail.YEAR` (readonly)                  |
| `appraiser_details`    | **the logged-in user's own** `FULL_NAME` (readonly) |
| hidden `person_id`, `hire_date`, `job_id` | from auto-fill                        |
| `job_grade`            | **never filled** — stays empty (§8.10)             |
| `rating_block`, `grade_block`, `description_block` | supposed to be cleared — legacy uses **wrong element ids** so stale values survive (§8.12) |

Changing the employee re-runs the whole auto-fill and overwrites manual edits in the info block.

### 7.5 Rating calculation, grade mapping and quotas (the core conditional)

Recalculation runs on **every change of any `rate*` select, but only when an employee is selected**
(otherwise: alert *"Select Employee First !!!"* and `rate20` resets to `0`):

1. `rating = (rate1 + … + rate20) / 20` (legacy posts the raw float — the API rounds to 2 decimals, §5.4).
2. Grade from the thresholds in §5.4, description from the table in §5.4.
3. **Quota gate (client-side only):**
   - **Grade A** — allowed only while `targetA > myAllocatedA`; otherwise
     `alert("Grade A cannot More Than <targetA>")`, `rate20` resets to `0`, and the
     rating/grade/description blocks are **cleared**.
   - **Grade E** — same rule with `"Grade E cannot More Than <targetE>"`.
   - **Grades B/C/D** — the equivalent checks are **commented out** in legacy: always allowed.
   - When the gate passes, the blocks are filled: `rating_block`, `grade_block`, `description_block`
     (all readonly inputs).
4. Scale legend table (display only): `4.25 & Above` → CONSISTENTLY EXCEEDS · `3.5-4.24` → MEETS
   AND EXCEEDS · `2.5-3.49` → SUCCESSFULLY MEETS · `1.6-2.49` → MEETS SOME · `1-1.5` → BELOW
   EXPECTATIONS.
5. Distribution row (display only, from `lookups/grade-stats` §6.3): fixed percentages
   `15 / 30 / 40 / 10 / 5`, computed targets (`No of Employees Grade Wise`) and my own historical
   counts (`No of Employees Grade Allocated`); `Total No. of Employees` = dropdown size.

### 7.6 Editability matrix

| Field / block                                   | Create           | Edit                | Employee remarks page |
| ----------------------------------------------- | ---------------- | ------------------- | --------------------- |
| Employee info block (name, number, job, dept, years, appraiser) | readonly (dropdown + autofill) | **readonly inputs** | readonly |
| `year` / period display                          | **select** (current-5…current, default current) | shown as text + hidden `period_from`/`period_to` | text |
| `rate1…rate20`                                   | editable, required | **editable**        | readonly text inputs  |
| `justification1…20`                              | editable         | editable            | readonly              |
| `development1…5` / `training1…5`                 | editable (first required) | editable       | readonly              |
| `rating_block` / `grade_block` / `description_block` | readonly (computed) | readonly (from record) | readonly        |
| `appraiser_remark`                              | editable         | editable            | readonly              |
| `meeting_comment` (Employee's Remarks)          | **readonly**     | **editable**        | **the only editable field** |
| `appraiser_signature` input                     | editable, **posted but never stored** (§8.13) | — | — |
| Hidden `status`                                 | —                | posted but **ignored** by the model | posted, ignored |

### 7.7 Period of review

- Create: a single `<select name="year">` listing `From 01-JAN-<y> To 31-DEC-<y>` for
  `currentYear-5 … currentYear`, current year preselected; the server derives the period dates
  (§5.3) and stores `YEAR`.
- Edit: the stored period printed as text with hidden `period_from` / `period_to` echoes (legacy
  posts them but the model never reads them).

### 7.8 Status behaviour and the update guard

- **Create writes `STATUS = 'Inprocess'` immediately** — there is no Draft state.
- **Update guard:** if `STATUS = 'Inprocess'` → flash *"Request is Inprocess. Can not Update
  Request"* and redirect back — nothing is saved (this is why the record is only editable once the
  out-of-scope workflow resolves it to `Approved`/`Rejected`).
- Status transitions (`Inprocess` → `Approved`/`Rejected`) are performed **only** by
  `PRFFlow` / `changePRFStatus` — workflow, §9. The API returns status read-only.
- Report chips: `Inprocess` cyan, `Rejected` red, everything else green (§8.15).

### 7.9 Client-side validation

- **Create:** on submit, builds an error list in a modal (*"Select Employee Name First"*, *"Enter
  Atleast First Development Goal"*, *"Enter Atleast First Training Goal"*, *"Select Rating 1"…
  *"Select Rating 20"*), blocks submit while any fail, and disables the Submit button on success
  (double-submit guard).
- **Edit:** the same handler targets `#ratingForm`, but the edit form's `<form>` tag **has no
  `id`** — the handler never binds, so **edit has no client validation at all** (§8.7).
- Server-side validation (§5.2) is therefore the only reliable gate.

### 7.10 Report page behaviour

- Year dropdown (distinct stored years, current year preselected) + **View Appraisals** button →
  `rating/prfreport/<year>`.
- Columns (EN): `#`, `Emp. #`, `Name`, `Job Title`, `Department`, `Rating`, `Grade`, `Remark`,
  `Year`, `Status`, `Date`, `Pending At` — the last is workflow (§9) and is **dropped** from the new
  listing; AR table mirrors them.
- Export = DataTables **Excel button only** (client-side); row click → `rating/updateprf/:headerId`.

### 7.11 Employee's remarks page (from the approval e-mail "Form Link")

- The entire form renders read-only (rates, justifications, goals, totals, identity block) and
  **only `meeting_comment` is editable** → `PUT .../employee-remarks`.
- It carries the same hidden fields as the edit form but the endpoint only persists `EMP_REMARKS`.
- **No session check in legacy** — the API must require authentication and decide who may post
  (open: restrict to the employee themself or HR? — flag for product).

---

## 8. Legacy bugs — do not reproduce

1. **SQL injection everywhere.** Header insert/update, line loops, duplicate check, auto-fill,
   `getPRFRecords`, `add_employee_comment`, `changePRFStatus` all concatenate input (partial
   `escape_str` use does not make it safe). Bind variables only.
2. **Missing auth checks.** `add_rating`, `update_rating`, `employee_comment`,
   `add_employee_comment`, `prfreport` and `getEmpDetails` run without verifying `FormsSession`
   (only `index`/`updateprf` check). Every new endpoint requires session + permission code.
3. **`print_r($header_id); die;` inside `update_rating()`** — after writing the header and lines
   the model prints the raw id and halts: the browser shows a bare number, no redirect, and the
   controller code after it (mail + workflow) is unreachable dead code.
4. **Dead approver logic.** Everything after the `die` in (3) is dead, and in `add_rating()` the
   branch `if ($appraiserPosition == 'MANAGER')` compares a real position name
   (*"HR and Administration Manager"*) to the literal `'MANAGER'`, so the `else` branch always
   runs; the computed `$workflowType` variable is never used at all.
5. **Development-loop guard checks the wrong variable** — `if ($department[$dev_loop] != "")`
   indexes a *string* instead of `$development[$dev_loop]`, so dev rows are written (or skipped)
   based on the department name's characters.
6. **Duplicate-year checks disagree.** The dropdown excludes via `XXZPI_HR_PAF_HEADER_TAB`
   (non-rejected, current year); the auto-fill blocks via `XXZPI_HR_PA_HEADER_TAB` (any status,
   `EMPLOYEE_NAME` match, current year) — while the form's year selector spans five years
   (§6.1/§6.2, open decision 2).
7. **Edit form has no client validation** — the `<form>` lacks `id="ratingForm"` so the submit
   handler never binds (§7.9).
8. **Client-computed results are trusted** — `rating_block` / `grade_block` / `description_block`
   are readonly inputs the server writes verbatim; anyone can post any grade (§5.4 requires
   server-side recompute).
9. **Quotas half-implemented** — only grades A and E are gated (B/C/D checks are commented out),
   the gate is browser-only, and `Math.round` targets can sum to >100 %.
10. **`job_grade` never populated** and `REPORTING_TO` / `company_name` are hardcoded
    (`'ZAMIL PLASTIC'`) although `job_grade` renders as an input.
11. **Stale-result clearing is a no-op** — `$('#rating-block').html('')` targets ids that don't
    exist (`#rating_block` is an input), so old totals survive an employee change.
12. **`rate20 == NaN` is always false** (NaN never `==`), so a non-numeric total silently grades
    `E`; unrounded floats (e.g. `3.8500000000000005`) are posted as the total.
13. **`appraiser_signature`** is collected but never stored (no column reads it).
14. **No update audit** — no `UPDATED_*` columns, and `update_rating` never refreshs period,
    employee info, year or status.
15. **Status casing in the report** — anything that is not `Inprocess`/`Rejected` renders green,
    including `Draft`; the guard compares the exact string `'Inprocess'`.
16. **Unescaped output** (XSS) throughout — names, remarks and criteria are echoed raw.
17. **`getEmpDetails` interpolates `EMPLOYEE_NAME`** — an employee name containing a quote breaks
    (and injects) the query.

---

## 9. Out of scope (do not implement)

- **Workflow / approval / email.** `controllers/PRFFlow.php` (`step1`/`step2`/`step3`,
  accept/reject links from the notification mails), `Workflow_model` (incl. delegation),
  `XXPHP_WORKFLOW`, the `PENDING_AT` listing column, SMTP notification mails (phpmailer),
  `changePRFStatus()` status transitions (`Inprocess`/`Approved`/`Rejected`), the approver
  computation and `ATTRIBUTE2`/`ATTRIBUTE3`/`ATTRIBUTE4` writes, and the
  `XXZP.XXZP_RATING_WF_LOOKUP` insert/update (approver registry).
- **Status changes** — the API never writes `STATUS`; it only reads it for the update guard.
- **Print/PDF** — `window.print()` only.
- **Excel export** — client-side DataTables button on the legacy report; not an API concern.
- **Dead code** — `Rating::testYear()`, the dead half of `update_rating()`, commented-out queries
  in `Data_model`.

---

## 10. Legacy → new endpoint map

| Legacy (PHP)                                                        | New API                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET Rating/index` + POST `rating/add_rating`                       | `POST /api/v1/hr/performance-appraisals`                                   |
| `GET Rating/updateprf/:id` (4 queries)                              | `GET /api/v1/hr/performance-appraisals/:headerId`                          |
| POST `rating/update_rating` (guarded by `STATUS`)                   | `PUT /api/v1/hr/performance-appraisals/:headerId`                          |
| POST `rating/add_employee_comment` (`employee_remark` page)         | `PUT /api/v1/hr/performance-appraisals/:headerId/employee-remarks`         |
| `GET Rating/prfreport[/:year]` → `getPRFRecords` (DataTables)       | `GET /api/v1/hr/performance-appraisals` (§3)                               |
| POST `Rating/getEmpDetails` (auto-fill + duplicate check)           | `GET .../lookups/employees/:name`                                          |
| `Data_model->getEmp()` (dropdown)                                   | `GET .../lookups/employees`                                                |
| `getAllocatedGrades()` + `count($all_emps)` (quota blocks)          | `GET .../lookups/grade-stats`                                              |
| `getRequestedBy()` (hidden username/useremail)                      | `GET .../lookups/requestor`                                                |
| `PRFFlow/step1..3`, `changePRFStatus`, `XXZP_RATING_WF_LOOKUP`      | — (workflow — §9)                                                          |
| `window.print()`, DataTables Excel button                           | — (browser)                                                                |
| — (no legacy delete)                                                | `DELETE /api/v1/hr/performance-appraisals/:headerId`                       |

---

## 11. Acceptance checklist

- [ ] **T-01** `POST` inserts header + exactly 20 rating lines (+ dev/training) in **one
      transaction**, returns `201` with `headerId` read back by `UUID`; body cannot set `status`,
      `createdBy`, grade/rating/description or criteria names.
- [ ] **T-02** `POST` recomputes `rating = round(avg,2)` and the grade/description per §5.4 — a
      tampered `result` in the body changes nothing.
- [ ] **T-03** Each validation rule in §5.2 returns its documented `400`/`409`.
- [ ] **T-04** `GET :id` returns `criteria` of exactly 20 entries in `RATING_ID` order plus the
      `development`/`training` arrays; unknown id → `404`.
- [ ] **T-05** `PUT :id` updates only totals/grade/description/remarks + the line rows — employee
      info, period, year, `STATUS` and audit columns unchanged; 0 rows → `404`.
- [ ] **T-06** `PUT` while `STATUS = 'Inprocess'` → `409` with the legacy wording *"Request is
      Inprocess. Can not Update Request"*.
- [ ] **T-07** `PUT .../employee-remarks` changes only `EMP_REMARKS`.
- [ ] **T-08** `DELETE :id` removes header + all lines in one transaction; second call → `404`.
- [ ] **T-09** Listing honours §3.1 (HR sees all, non-HR sees only `CREATED_BY`, missing employee
      number ⇒ empty result) and **contains no `PENDING_AT` / no `XXPHP_WORKFLOW` reads**.
- [ ] **T-10** `year` defaults to the current year; every filter (§3.2) narrows alone and combined;
      `meta.total` is a real `COUNT(*)`; default order `HEADER_ID DESC`.
- [ ] **T-11** `lookups/employees` reproduces §6.1 (subordinates only, `LEVEL != 1`, year-exclusion
      semantics documented after the DB check).
- [ ] **T-12** `lookups/employees/:name` returns the full auto-fill set; duplicate employee+year →
      `409 "Already Rating Given"`; unknown name → `404`.
- [ ] **T-13** `lookups/grade-stats` returns percent/target/allocated matching §6.3 (incl. the
      `total ≤ 5 ⇒ 1` rule and `Math.ceil` on E).
- [ ] **T-14** Frontend reproduces §7.5: changing any rate recomputes total/grade/description, the
      A and E quota gates alert + clear exactly as specified, B/C/D stay ungated (until decision 3
      in §5.6 says otherwise).
- [ ] **T-15** Frontend reproduces §7.6 editability — including *only* `meeting_comment` being
      editable on the employee-remarks page.
- [ ] **T-16** Bilingual rule (§7.1) holds: `formLanguage` decides criteria names at insert and
      the report table; Arabic appraisals round-trip.
- [ ] **T-17** Every SQL statement uses bind variables — an employee name of `x' OR '1'='1`
      returns `404`, not a dump; unauthenticated calls get `401`.
- [ ] **T-18** All endpoints require the session + the matching
      `HR.PERFORMANCE_APPRAISALS.*` permission code (UPDATE, never EDIT), and **no endpoint writes
      `STATUS`**.

---

## 12. Implementation prompt (copy-ready)

> Copy everything in this block into your agent's task prompt together with this file.
>
> ```
> Implement the backend for the PERFORMANCE APPRAISAL FORM ("Employee Performance Appraisal",
> workflow code PRF) in this repository, following README_performance_appraisal_form.md as the
> authoritative spec. Spec-driven: do not invent behaviour the README does not describe, and do not
> read behaviour from the legacy PHP beyond what it documents.
>
> GOAL
> - CRUD + listing over FOUR tables keyed by HEADER_ID: XXZP.XXZPI_HR_PA_HEADER_TAB,
>   XXZPI_HR_PA_RATING_TAB (always 20 lines), XXZPI_HR_PA_DEV_TAB (≤5), XXZPI_HR_PA_PLANNING_TAB (≤5).
> - Endpoints (base /api/v1/hr/performance-appraisals):
>     POST   /                        create  (HR.PERFORMANCE_APPRAISALS.CREATE)
>     GET    /:headerId               read    (VIEW)
>     PUT    /:headerId               update  (UPDATE, guard §5.6)
>     PUT    /:headerId/employee-remarks  EMP_REMARKS only (UPDATE)
>     DELETE /:headerId               delete  (DELETE)
>     GET    /                        listing with filters + pagination + HR scoping (VIEW)
>     GET    /lookups/employees | /lookups/employees/:name | /lookups/grade-stats |
>            /lookups/requestor
>   Register /lookups/* BEFORE /:headerId. Permission codes use UPDATE, never EDIT.
>
> NON-GOALS (do not build)
> - No workflow/approval/email: no PRFFlow, XXPHP_WORKFLOW, XXZP_RATING_WF_LOOKUP, approver
>   ATTRIBUTE2/3/4 writes, delegation, notification mails, and NO writes to STATUS anywhere —
>   status is read-only and only used for the update guard.
> - No print/PDF, no Excel export endpoint, no legacy dead code (testYear, the post-`die` block).
>
> DATA RULES
> - Oracle; bind variables everywhere, never string concatenation.
> - All four INSERTs omit PKs: generate a UUID in Node, insert the header, read HEADER_ID back by
>   UUID, then insert the lines — one transaction.
> - SERVER-COMPUTED (§5.4): rating = round(sum(ratings)/20, 2); grade/description from the
>   threshold tables. The client posts them; ignore them. Criteria names come from the fixed list
>   of 20 in the record's formLanguage.
> - Period: 01-Jan/year .. 31-Dec/year via TO_DATE(:d,'YYYY-MM-DD'). Dates never as '01-Jan-26'
>   short-year strings.
> - Update guard: STATUS='Inprocess' => 409 "Request is Inprocess. Can not Update Request".
> - Listing scoping (§3.1): XXZP_HR tag => all rows, else CREATED_BY = session user; year defaults
>   to the current year; drop the PENDING_AT workflow column.
>
> FORM FLOW (README §7) — the frontend contract
> - Bilingual: session language selects EN/AR view and the language the 20 criteria are stored in.
> - Employee dropdown = logged-in user's subordinates (hierarchy, LEVEL != 1) with year exclusion;
>   auto-fill fills the readonly info block; duplicate => 409 "Already Rating Given".
> - Grade quotas (A/E gated in the browser, targets 15/30/40/10/5) are display/client rules per
>   §7.5 — do not enforce server-side until decision 3 is answered.
> - Three screens (create / edit / employee remarks) and their editability matrix are §7.6; only
>   meeting_comment is editable on the employee-remarks page.
>
> RULES
> 1. Read README_performance_appraisal_form.md fully before coding; its SQL blocks are the reference
>    queries — port them with bind variables.
> 2. Fix, never copy, the legacy bugs in §8 (SQL injection, missing auth, print_r/die, wrong dev-loop
>    guard, trusted client results, missing edit validation).
> 3. Validate per §5.2 with the documented error codes; response envelope { success, data } per §2;
>    meta.total is a real COUNT(*).
> 4. Before coding, resolve the FOUR OPEN DECISIONS with me: (a) initial STATUS ('Inprocess' parity
>    vs 'Draft'), (b) the single duplicate-appraisal rule (which table/status/year wins), (c)
>    server-side grade quotas or client-only, (d) who may POST employee remarks (the employee only,
>    or HR too). Do not decide these yourself.
>
> DONE WHEN
> - T-01…T-18 in README §11 are covered by tests that exercise the real endpoints (including the
>   20-line round-trip and the Inprocess guard).
> - The project's typecheck/lint/test suite passes with no new suppressions.
> - You report which checks you ran, which failed, and anything you could not verify.
> ```

---

*Generated for the Zamil Plastic HR revamp. Legacy of record: `pmform_codebase` (CodeIgniter) —
`Rating` module (views `prf`/`aprf`). The full specification is README_performance_appraisal_form.md
in the repository root.*
