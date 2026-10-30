# Personal Requisition Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the Personal Requisition Form —
> **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup APIs and
> attachment handling the form needs. **Workflow / approval / email logic is explicitly OUT of
> scope** — unlike the other forms, the legacy Requisition module has *heavy* workflow (form
> code `REQF`); everything workflow-related is catalogued in §11 and must NOT be implemented.
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
> - `controllers/Requisition.php` (methods `index`, `addRequisition`, `insert`, `update`, `getBudget`; *ignore* `Workflow`/`submitWorkflow` — workflow)
> - `models/Requisition_model.php` (all SQL)
> - `views/ZPIL/requisition.php` (create form), `views/update/requisition.php` (edit form)
> - `views/ZPIL/requisition_list.php` + `views/ZPIL/filter.php` (listing/filter page)
> - *Do not use:* `controllers/REQ_Flow.php` (workflow engine), `views/ZPIL/req.php` (misnamed
>   New-Hire-Training file), `views/ZPIL/dummy.php` (orphan old list), `*_old` variants.
>
> **Database:** Oracle, schema `XXZP`/`XXZPI`. All SQL below uses **bind variables** — never
> string-concatenate user input (the legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_interview_assessment_form.md` and
> `README_employment_offer_form.md` — only the shared contracts noted in §9 matter here.

---

## 1. Data Model

One header table (no line/detail tables — requisitions are single-row records) plus a generic
attachments table.

| # | Table | Role |
|---|---|---|
| 1 | `XXZPI_PER_REQUISITIONS_ALL` | The requisition (1 row per request) |
| 2 | `xxzp_all_attachments` (aka `XXZP.XXZP_ALL_ATTACHMENTS`) | Files, `FORM_NAME = 'Requisition'` |

### 1.1 `XXZPI_PER_REQUISITIONS_ALL`

| Column | Type (inferred) | Legacy form field | Notes / enum |
|---|---|---|---|
| `REQUISITION_ID` | NUMBER **PK** | hidden (URL segment on edit) | generated `NVL(MAX(REQUISITION_ID + 20), 100000)` — §3.1 |
| `REQUISITION_NUMBER` | VARCHAR2 | `requisition_no` (readonly) | **set = `REQUISITION_ID`** on insert |
| `REQUISITION_STATUS` | VARCHAR2 | `status` (readonly) | enum `Draft` \| `Inprocess` \| `Approved` \| `Rejected`. **API writes only `'Draft'` on insert** — transitions are workflow-owned (§11) |
| `REQUESTED_BY` | NUMBER/VARCHAR2 | `emp_no` (hidden) | employee number of logged-in user → `req.auth` |
| `REQUESTER_NAME` | VARCHAR2 | `name` (readonly) | |
| `REQUEST_DATE` | DATE `DD-Mon-YY` | `request_date` (readonly) | |
| `JOB_ID` | NUMBER | `job_id` (hidden, from datalist label) | `NULL` if empty |
| `JOB_NAME` | VARCHAR2 | `title` (text + datalist) | |
| `DEPT_ID` | NUMBER | `dept_id` (hidden) | `NULL` if empty |
| `DEPT_NAME` | VARCHAR2 | `dept` (text + datalist) | |
| `DATE_NEEDED` | DATE `DD-Mon-YY` | `needed_date` | |
| `REASON_OF_REQ` | VARCHAR2 | `reason_req` (radio) | `Replacement` \| `Addition` |
| `REPLACEMENT_FOR` | VARCHAR2 | `replace_for` (datalist of supervised employees) | shown when `Replacement` |
| `REASON` | VARCHAR2 | `reason_for` | shown when `Addition` |
| `BUDGETED` | VARCHAR2 | `budget` (radio) | `Y` \| `N` (update default `N`) |
| `BUDGETED_SAL` | NUMBER | `budget_sal` | default `0` |
| `HIGH_SCHOOL` | VARCHAR2 | `highschool` (checkbox) | `Y`/`N`, default `N` |
| `DIPLOMA` | VARCHAR2 | `diploma` | `Y`/`N`, default `N` |
| `HIGHER_DIPLOMA` | VARCHAR2 | `higher_diploma` | `Y`/`N`, default `N` |
| `DEGREE` | VARCHAR2 | `bachelor` | `Y`/`N`, default `N` |
| `MASTER_DEGREE` | VARCHAR2 | `master` | `Y`/`N`, default `N` |
| `GCC_EXP` | VARCHAR2 | `gcc_exp` (radio) | `0 - 2` \| `2 - 5` \| `5 - 10` \| `> 10`, default `0` |
| `WORK_EXP` | VARCHAR2 | `work_exp` (radio) | same enum, default `0` |
| `SKILLS` | VARCHAR2 | `skill` | legacy empty → literal `'null'` string (quirk, §9) |
| `OTHER` | VARCHAR2 | `requirements` | legacy empty → literal `'null'` |
| `REMARK` | VARCHAR2 | `remark` (textarea) | legacy empty → literal `'null'` |
| `TOTAL_PACKAGE` | NUMBER/VARCHAR2 | `total_package` (readonly, "Basic Salary") | filled via `getBudget` AJAX (§8.5) |
| `ATTRIBUTE1` | VARCHAR2 | `tic_status` (select, **HR-only on UI**) | **Ticket Status**: `''` \| `Open` \| `Accepted` ("Offer Accepted") \| `Close`. Listing shows `NVL(ATTRIBUTE1,'Open')` |
| `ATTRIBUTE14` | VARCHAR2 `DD-Mon-YY` | — (derived) | **Offer-Accepted date** — set when ticket status = `Accepted` |
| `ATTRIBUTE15` | VARCHAR2 `DD-Mon-YY` | — (derived) | **Closed date** — set when ticket status = `Close` |
| `CREATION_DATE` | DATE `DD-Mon-YY` | — | audit |
| `CREATED_BY` | NUMBER | — | audit = authenticated user id |
| `LAST_UPDATE_DATE` | DATE `DD-Mon-YY` | — | audit (update only) |
| `LAST_UPDATED_BY` | NUMBER | — | audit (update only) |
| `LAST_UPDATE_LOGIN` | NUMBER | — | audit (update only, = `LAST_UPDATED_BY`) |

> `ATTRIBUTE1` / `ATTRIBUTE14` / `ATTRIBUTE15` are the only `ATTRIBUTE*` columns this module uses.

### 1.2 `xxzp_all_attachments`

| Column | Type | Value |
|---|---|---|
| `HEADER_ID` | NUMBER PK | `NVL(MAX(HEADER_ID)+1, 1)` per row (legacy) |
| `FORM_HEADER_ID` | NUMBER | = `REQUISITION_ID` |
| `FORM_NAME` | VARCHAR2 | literal `'Requisition'` |
| `FILE_NAME` | VARCHAR2 | stored file name (files live under `./attachments/` in legacy) |
| `ATTACHED_ON` | DATE `DD-Mon-YYYY` | upload date |

---

## 2. API Surface

Base path: `/api/v1/hr/requisitions`
Auth: session (`authenticate`); `created_by` / `updated_by` from `req.auth` — never the body.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/hr/requisitions` | **Insert** (header + optional attachments, one transaction) |
| `GET` | `/api/v1/hr/requisitions/:requisitionId` | **Read** one requisition (+ its attachments) |
| `PUT` | `/api/v1/hr/requisitions/:requisitionId` | **Update** (+ optionally append attachments) |
| `DELETE` | `/api/v1/hr/requisitions/:requisitionId` | **Delete** (attachments + header, one transaction) |
| `GET` | `/api/v1/hr/requisitions` | **Listing with filters** + pagination |
| `POST` | `/:requisitionId/attachments` | upload additional attachment(s) (multipart) |
| `DELETE` | `/:requisitionId/attachments/:attachmentId` | remove one attachment (**new capability** — legacy has no attachment delete; see §6) |
| `GET` | `.../lookups/job-titles` | §8.1 |
| `GET` | `.../lookups/requestor` | §8.2 |
| `GET` | `.../lookups/departments` | §8.3 |
| `GET` | `.../lookups/replacement-for` | §8.4 |
| `GET` | `.../lookups/budget?fullName=...` | §8.5 |
| `GET` | `.../lookups/filter-options` | distinct values for the filter dropdowns (§8.6) |

**Universal responses**
```jsonc
{ "success": true, "data": { ... } }              // 200 / 201
{ "success": false, "message": "Requisition not found" }               // 404
{ "success": false, "message": "Validation failed", "errors": ["..."] } // 400
```

---

## 3. INSERT — `POST /api/v1/hr/requisitions`

### 3.1 Key generation

```sql
-- legacy (models/Requisition_model.php:583) — REQUIRED, there is no trigger/sequence:
SELECT NVL(MAX(REQUISITION_ID + 20), 100000) AS ID
FROM XXZPI_PER_REQUISITIONS_ALL;
```
- `REQUISITION_ID` and `REQUISITION_NUMBER` are **the same value**.
- Run inside the insert transaction (concurrency caveat: if parallel users are expected,
  propose an Oracle SEQUENCE — needs owner approval, gate G1).
- Attachment ids: `SELECT NVL(MAX(HEADER_ID)+1, 1) AS ID FROM xxzp_all_attachments;` (per row,
  inside the same transaction) — or upgrade to a sequence with approval.
- Dates: React sends ISO `YYYY-MM-DD`; legacy stores `DD-Mon-YY` (e.g. `25-Oct-26`) for
  `REQUEST_DATE` / `DATE_NEEDED` / `CREATION_DATE` / audit dates; attachments use `DD-Mon-YYYY`.

### 3.2 Payload (JSON)

```jsonc
{
  "requestDate": "2026-10-25",          // REQUEST_DATE (required; usually today)
  "employeeNumber": "12345",             // REQUESTED_BY (from session, not body — server-set)
  "requesterName": "John Manager",       // REQUESTER_NAME (server-set from session profile)
  "jobId": "789",                        // JOB_ID (from job-titles lookup label)
  "jobName": "Machine Operator",         // JOB_NAME (required)
  "deptId": "55",                        // DEPT_ID (from departments lookup)
  "deptName": "Production",              // DEPT_NAME (required)
  "dateNeeded": "2026-11-15",            // DATE_NEEDED (required)
  "reasonOfReq": "Replacement",          // REQUIRED: Replacement | Addition
  "replacementFor": "Ali Staff",         // REPLACEMENT_FOR (when Replacement)
  "reason": null,                        // REASON (when Addition)
  "budgeted": "Y",                       // BUDGETED: Y | N
  "budgetedSal": 8000,                   // BUDGETED_SAL (number, default 0)
  "highSchool": "Y", "diploma": "N",     // checkboxes → Y/N, default N
  "higherDiploma": "N", "degree": "N", "masterDegree": "N",
  "gccExp": "0 - 2",                     // 0 - 2 | 2 - 5 | 5 - 10 | > 10
  "workExp": "5 - 10",                   // same enum
  "skills": "CNC programming",           // SKILLS (nullable)
  "other": "Valid iqama",                // OTHER (nullable)
  "remark": "Urgent",                    // REMARK (nullable)
  "totalPackage": 8000,                  // TOTAL_PACKAGE (from §8.5)
  "ticketStatus": "",                    // ATTRIBUTE1 — HR-only: "" | Open | Accepted | Close
  "files": ["cv.pdf", "cert.pdf"]        // attachment file names (after upload, or multipart)
}
```

### 3.3 SQL — insert in ONE transaction (`withTransaction(POOLS.LOW, ...)`)

```sql
-- 1) HEADER
INSERT INTO XXZPI_PER_REQUISITIONS_ALL
  (REQUISITION_ID, REQUISITION_NUMBER, REQUISITION_STATUS, REQUESTED_BY, REQUESTER_NAME,
   REQUEST_DATE, JOB_ID, JOB_NAME, DEPT_ID, DEPT_NAME, DATE_NEEDED, REASON_OF_REQ,
   REPLACEMENT_FOR, REASON, BUDGETED, BUDGETED_SAL,
   HIGH_SCHOOL, DIPLOMA, HIGHER_DIPLOMA, DEGREE, MASTER_DEGREE,
   GCC_EXP, WORK_EXP, SKILLS, OTHER, REMARK, TOTAL_PACKAGE,
   ATTRIBUTE1, ATTRIBUTE14, ATTRIBUTE15, CREATION_DATE, CREATED_BY)
VALUES
  (:reqId, :reqId, 'Draft', :requestedBy, :requesterName,
   TO_DATE(:requestDate, 'DD-Mon-YY'), :jobId, :jobName, :deptId, :deptName,
   TO_DATE(:dateNeeded, 'DD-Mon-YY'), :reasonOfReq,
   :replacementFor, :reason, NVL(:budgeted, 'N'), NVL(:budgetedSal, 0),
   NVL(:highSchool, 'N'), NVL(:diploma, 'N'), NVL(:higherDiploma, 'N'),
   NVL(:degree, 'N'), NVL(:masterDegree, 'N'),
   NVL(:gccExp, '0 - 2'), NVL(:workExp, '0 - 2'),
   :skills, :other, :remark, :totalPackage,
   NVL(:ticketStatus, ''),
   CASE WHEN :ticketStatus = 'Accepted' THEN :today ELSE '' END,   -- ATTRIBUTE14
   CASE WHEN :ticketStatus = 'Close'    THEN :today ELSE '' END,   -- ATTRIBUTE15
   SYSDATE, :createdBy);
```
```sql
-- 2) ATTACHMENTS (one row per file; legacy loop, models/Requisition_model.php:626-635)
INSERT INTO xxzp_all_attachments
  (HEADER_ID, FORM_HEADER_ID, FORM_NAME, FILE_NAME, ATTACHED_ON)
VALUES
  (:attachmentId, :reqId, 'Requisition', :fileName, SYSDATE);
```

**Order:** `BEGIN` → generate `:reqId` (§3.1) → insert header → insert attachment rows →
`COMMIT`. Any error → `ROLLBACK` → `500`.
**Response `201`:** `{ success: true, data: { requisitionId, requisitionNumber } }`

> **Legacy quirks** (§9): empty `SKILLS`/`OTHER`/`REMARK`/`TOTAL_PACKAGE` were stored as the
> literal string `'null'` — **do not reproduce** unless the owner insists; bind SQL `NULL`.
> Stray value `' $dates'`-style spaces exist in the interview module only, not here.

---

## 4. READ — `GET /api/v1/hr/requisitions/:requisitionId`

```sql
-- 4.1 Header (legacy: getData($id))
SELECT REQUISITION_ID, REQUISITION_NUMBER, REQUISITION_STATUS, REQUESTED_BY, REQUESTER_NAME,
       REQUEST_DATE, JOB_ID, JOB_NAME, DEPT_ID, DEPT_NAME, DATE_NEEDED, REASON_OF_REQ,
       REPLACEMENT_FOR, REASON, BUDGETED, BUDGETED_SAL,
       HIGH_SCHOOL, DIPLOMA, HIGHER_DIPLOMA, DEGREE, MASTER_DEGREE,
       GCC_EXP, WORK_EXP, SKILLS, OTHER, REMARK, TOTAL_PACKAGE,
       ATTRIBUTE1, ATTRIBUTE14, ATTRIBUTE15,
       CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
FROM XXZPI_PER_REQUISITIONS_ALL
WHERE REQUISITION_ID = :requisitionId;
```
```sql
-- 4.2 Attachments (legacy: file_data_by_id($id))
SELECT HEADER_ID, FORM_HEADER_ID, FORM_NAME, FILE_NAME, ATTACHED_ON
FROM xxzp_all_attachments
WHERE FORM_HEADER_ID = :requisitionId
  AND FORM_NAME = 'Requisition'
ORDER BY HEADER_ID;
```
- Header missing → `404`. Return `attachments: []` when none.
- `:requisitionId` travels as a **string** (`/^[1-9][0-9]{0,18}$/`, IDs are `NUMBER(19,0)`).
- **Response:** JSON per §3.2 plus `requisitionStatus`, `createdAt`, `updatedAt`.

---

## 5. UPDATE — `PUT /api/v1/hr/requisitions/:requisitionId`

### 5.0 Pre-checks (legacy parity, `Requisition::update()` lines 124–138)

```sql
-- status gate
SELECT REQUISITION_STATUS FROM XXZPI_PER_REQUISITIONS_ALL WHERE REQUISITION_ID = :requisitionId;
-- HR check (models/Requisition_model.php:856-859)
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId;
```
- Not found → `404`.
- **Non-HR user** and status ∈ {`Inprocess`, `Approved`} → **`409`** with message
  `"Request is InProcess/Approved — cannot update data"` (legacy blocks the save; HR users may
  always save). This reads the status but does **not** perform any workflow transition.

### 5.1 SQL — header update (one transaction with any attachment inserts)

```sql
UPDATE XXZPI_PER_REQUISITIONS_ALL
SET JOB_ID = :jobId,
    JOB_NAME = :jobName,
    DATE_NEEDED = TO_DATE(:dateNeeded, 'DD-Mon-YY'),
    DEPT_ID = :deptId,
    DEPT_NAME = :deptName,
    REASON_OF_REQ = :reasonOfReq,
    REPLACEMENT_FOR = :replacementFor,
    REASON = :reason,
    BUDGETED = NVL(:budgeted, 'N'),
    BUDGETED_SAL = NVL(:budgetedSal, 0),
    HIGH_SCHOOL = NVL(:highSchool, 'N'),
    DIPLOMA = NVL(:diploma, 'N'),
    HIGHER_DIPLOMA = NVL(:higherDiploma, 'N'),
    DEGREE = NVL(:degree, 'N'),
    MASTER_DEGREE = NVL(:masterDegree, 'N'),
    GCC_EXP = NVL(:gccExp, '0 - 2'),
    WORK_EXP = NVL(:workExp, '0 - 2'),
    SKILLS = :skills,
    OTHER = :other,
    REMARK = :remark,
    TOTAL_PACKAGE = :totalPackage,
    ATTRIBUTE1 = NVL(:ticketStatus, ''),
    ATTRIBUTE14 = CASE WHEN :ticketStatus = 'Accepted' THEN :today
                       WHEN :ticketStatus = 'Close'    THEN NVL(:attribute14, :today)
                       ELSE '' END,
    ATTRIBUTE15 = CASE WHEN :ticketStatus = 'Close'    THEN :today
                       WHEN :ticketStatus = 'Accepted' THEN NVL(:attribute15, :today)
                       ELSE '' END,
    LAST_UPDATE_DATE = SYSDATE,
    LAST_UPDATED_BY = :updatedBy,
    LAST_UPDATE_LOGIN = :updatedBy
WHERE REQUISITION_ID = :requisitionId;
```
```sql
-- append attachments if the payload includes new files (legacy: same loop as §3.3)
INSERT INTO xxzp_all_attachments
  (HEADER_ID, FORM_HEADER_ID, FORM_NAME, FILE_NAME, ATTACHED_ON)
VALUES
  (:attachmentId, :requisitionId, 'Requisition', :fileName, SYSDATE);
```

**Rules**
- `REQUISITION_STATUS`, `REQUEST_DATE`, `REQUESTER_NAME`, `REQUESTED_BY`, `REQUISITION_NUMBER`
  are **never** updated (legacy parity).
- ⚠️ **Legacy bug to flag, not silently copy:** legacy *always* rewrites `ATTRIBUTE14`/`ATTRIBUTE15`
  to `''` unless the current `tic_status` is `Accepted`/`Close`, so any save wipes previously
  stored dates. The SQL above preserves the other date when the status is still
  `Accepted`/`Close` — confirm this corrected behaviour with the owner before implementing.
- Audit trio always set; `sqlRowCounts` checked; header + attachments inside ONE
  `withTransaction(POOLS.LOW, ...)`.
- **Response `200`:** `{ success: true, data: { requisitionId } }`

---

## 6. DELETE — `DELETE /api/v1/hr/requisitions/:requisitionId`

> The legacy app has **no delete** (header or attachments). New API deletes attachments first,
> then the header, in one transaction.

```sql
DELETE FROM xxzp_all_attachments
WHERE FORM_HEADER_ID = :requisitionId AND FORM_NAME = 'Requisition';

DELETE FROM XXZPI_PER_REQUISITIONS_ALL
WHERE REQUISITION_ID = :requisitionId;
```

**Rules**
- Load the header first (§4.1) → `404` if absent.
- **Recommended guards (confirm policy with owner):**
  1. Refuse when `REQUISITION_STATUS <> 'Draft'` → `409` (approved requisitions are consumed
     downstream — see §9 contract).
  2. Refuse when referenced by any interview assessment → `409`:
  ```sql
  SELECT COUNT(*) AS CNT
  FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
  WHERE ATTRIBUTE4 = :requisitionNumber;
  ```
- `BEGIN` → deletes → `COMMIT`; header delete `sqlRowCounts = 0` → `404` (rollback).
- **Attachment-only delete** (`DELETE /:requisitionId/attachments/:attachmentId`):
  ```sql
  SELECT FILE_NAME FROM xxzp_all_attachments
  WHERE HEADER_ID = :attachmentId AND FORM_HEADER_ID = :requisitionId AND FORM_NAME = 'Requisition';
  -- then, in one transaction:
  DELETE FROM xxzp_all_attachments
  WHERE HEADER_ID = :attachmentId AND FORM_HEADER_ID = :requisitionId AND FORM_NAME = 'Requisition';
  ```
  Also remove the physical file from storage (new capability — decide storage location with the
  owner; legacy keeps files on disk under `./attachments/` and never deletes them).
- **Response:** `200 { success: true, data: { requisitionId, deleted: true } }`

---

## 7. LISTING WITH FILTERS — `GET /api/v1/hr/requisitions`

Legacy listing (`Requisition::index` + `requisition_list()`) has **real server-side filters**
(§7.1) but the page also renders client-side DataTables on top (`pageLength: 20`, export
buttons). Its SELECT includes **workflow-derived columns** (`PENDING_AT`, `START_DATE`,
`END_DATE`, `DAYS_OPEN`, `NEW_DAYS_OPEN`, `LAST_ACTION`, `TOTAL_ACTIONS`) — **all excluded
here** (§11). Listing view columns we return: Req. No, Status, Requester, Job, Dept, Reason,
Ticket Status, Request/Needed dates, Accepted/Closed dates.

### 7.1 Query parameters

| Param | Type | Maps to (legacy filter) | Notes |
|---|---|---|---|
| `page` / `pageSize` | int (1 / 20, max 100) | — | `FETCH NEXT` |
| `requisitionStatus` | string | `REQUISITION_STATUS` | `Draft` \| `Inprocess` \| `Approved` \| `Rejected` |
| `ticketStatus` | string | `ATTRIBUTE1` | `Open` \| `Accepted` \| `Close` (list displays `NVL(ATTRIBUTE1,'Open')`) |
| `requisitionId` | string | `REQUISITION_ID` | exact |
| `requesterName` | string | `REQUESTER_NAME` | partial match |
| `jobName` | string | `JOB_NAME` | partial match |
| `deptName` | string | `DEPT_NAME` | partial match |
| `reasonOfReq` | string | `REASON_OF_REQ` | `Replacement` \| `Addition` |
| `dateFrom` / `dateTo` | date | `REQUEST_DATE` | `>=` / `< +1 day` (legacy defaults: Jan 1 → end of current month) |
| `search` | string | `REQUESTER_NAME`, `JOB_NAME`, `DEPT_NAME`, `REQUISITION_NUMBER` | optional free-text |
| `createdBy` | number | `CREATED_BY` | scoping override (§7.4) |
| `sortBy` | whitelist | — | `REQUISITION_ID` (default, desc), `REQUEST_DATE`, `DATE_NEEDED`, `REQUESTER_NAME`, `CREATION_DATE` |
| `sortDir` | `asc`\|`desc` | — | default `desc` |

### 7.2 Base query

```sql
SELECT REQUISITION_ID, REQUISITION_NUMBER, REQUISITION_STATUS, REQUESTER_NAME, REQUESTED_BY,
       REQUEST_DATE, DATE_NEEDED, JOB_NAME, DEPT_NAME, REASON_OF_REQ, REPLACEMENT_FOR,
       BUDGETED, TOTAL_PACKAGE,
       NVL(ATTRIBUTE1, 'Open')        AS TICKET_STATUS,
       ATTRIBUTE14                    AS ACCEPTED_DATE,
       ATTRIBUTE15                    AS CLOSED_DATE,
       CREATED_BY, CREATION_DATE, LAST_UPDATE_DATE
FROM XXZPI_PER_REQUISITIONS_ALL
WHERE 1 = 1
  AND (:requisitionStatus IS NULL OR REQUISITION_STATUS = :requisitionStatus)
  AND (:ticketStatus IS NULL OR NVL(ATTRIBUTE1, 'Open') = :ticketStatus)
  AND (:requisitionId IS NULL OR TO_CHAR(REQUISITION_ID) = :requisitionId)
  AND (:requesterName IS NULL OR UPPER(REQUESTER_NAME) LIKE '%'||UPPER(:requesterName)||'%')
  AND (:jobName IS NULL OR UPPER(JOB_NAME) LIKE '%'||UPPER(:jobName)||'%')
  AND (:deptName IS NULL OR UPPER(DEPT_NAME) LIKE '%'||UPPER(:deptName)||'%')
  AND (:reasonOfReq IS NULL OR REASON_OF_REQ = :reasonOfReq)
  AND (:search IS NULL OR UPPER(REQUESTER_NAME) LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(JOB_NAME)       LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(DEPT_NAME)      LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(REQUISITION_NUMBER) LIKE '%'||UPPER(:search)||'%')
  AND (:dateFrom IS NULL OR REQUEST_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
  AND (:dateTo   IS NULL OR REQUEST_DATE <  TO_DATE(:dateTo, 'YYYY-MM-DD') + 1)
  AND <scoping predicate — §7.4>
ORDER BY
  CASE WHEN :sortBy='REQUISITION_ID'  AND UPPER(:sortDir)='DESC' THEN REQUISITION_ID  END DESC,
  CASE WHEN :sortBy='REQUISITION_ID'  AND UPPER(:sortDir)='ASC'  THEN REQUISITION_ID  END ASC,
  CASE WHEN :sortBy='REQUEST_DATE'    AND UPPER(:sortDir)='DESC' THEN REQUEST_DATE    END DESC,
  CASE WHEN :sortBy='REQUEST_DATE'    AND UPPER(:sortDir)='ASC'  THEN REQUEST_DATE    END ASC,
  CASE WHEN :sortBy='DATE_NEEDED'     AND UPPER(:sortDir)='DESC' THEN DATE_NEEDED     END DESC,
  CASE WHEN :sortBy='DATE_NEEDED'     AND UPPER(:sortDir)='ASC'  THEN DATE_NEEDED     END ASC,
  CASE WHEN :sortBy='REQUESTER_NAME'  AND UPPER(:sortDir)='ASC'  THEN REQUESTER_NAME  END ASC,
  CASE WHEN :sortBy='REQUESTER_NAME'  AND UPPER(:sortDir)='DESC' THEN REQUESTER_NAME  END DESC,
  CASE WHEN :sortBy='CREATION_DATE'   AND UPPER(:sortDir)='DESC' THEN CREATION_DATE   END DESC,
  CASE WHEN :sortBy='CREATION_DATE'   AND UPPER(:sortDir)='ASC'  THEN CREATION_DATE   END ASC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```
> Count query: same conditions (incl. scoping) without ORDER BY / OFFSET:
> `SELECT COUNT(*) AS TOTAL FROM XXZPI_PER_REQUISITIONS_ALL WHERE ...`.
> Bind `null` for unused filters (named binds).

### 7.3 Response

```jsonc
{
  "success": true,
  "data": {
    "total": 88,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "requisitionId": "100040",
        "requisitionNumber": "100040",
        "requisitionStatus": "Draft",
        "requesterName": "John Manager",
        "jobName": "Machine Operator",
        "deptName": "Production",
        "reasonOfReq": "Replacement",
        "replacementFor": "Ali Staff",
        "requestDate": "25-Oct-26",
        "dateNeeded": "15-Nov-26",
        "ticketStatus": "Open",
        "acceptedDate": null,
        "closedDate": null,
        "createdBy": 9311,
        "creationDate": "25-Oct-26"
      }
    ]
  }
}
```

### 7.4 Access scoping (HR vs non-HR — server-side, from the actor)

```sql
-- HR probe (same lookup used across modules)
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId;
```
- **HR user** (probe returns rows): no extra predicate → sees **all** requisitions.
- **Non-HR user**: rows created by the user **or their (recursively) supervised employees** —
  legacy builds this with a recursive CTE over `xx_digi_emp_master.SUPERVISOR_NAME` and
  `LISTAGG(USER_ID, ',')`:
  ```sql
  WITH emp AS (
    SELECT FULL_NAME, USER_ID, SUPERVISOR_NAME
    FROM XX_DIGI_EMP_MASTER
    WHERE USER_ID = :userId
    UNION ALL
    SELECT e.FULL_NAME, e.USER_ID, e.SUPERVISOR_NAME
    FROM XX_DIGI_EMP_MASTER e
    JOIN emp p ON e.SUPERVISOR_NAME = p.FULL_NAME
  )
  SELECT LISTAGG(USER_ID, ',') WITHIN GROUP (ORDER BY USER_ID) AS IDS FROM emp;
  ```
  Then append `AND CREATED_BY IN (SELECT ... FROM (CTE))` — **avoid the legacy bug** of emitting
  `IN ()` when the CTE returns no rows (bind an explicit empty-set handling: return `[]` early
  or use `AND 1 = 0`). Prefer a semi-join over a string list.

---

## 8. LOOKUP APIs

### 8.1 Job titles (datalist)
```sql
SELECT DISTINCT JOB_ID, JOB_TITLE AS NAME
FROM XX_DIGI_EMP_MASTER
ORDER BY 1 DESC;
```

### 8.2 Logged-in requestor
```sql
SELECT DISTINCT FULL_NAME, EMAIL_ADDRESS, EMPLOYEE_NUMBER
FROM XX_DIGI_EMP_MASTER
WHERE USER_ID = :userId;
```

### 8.3 Departments (datalist)
```sql
SELECT DISTINCT ORGANIZATION_ID, NAME
FROM XX_DIGI_DEPT_MASTER
ORDER BY 1;
```

### 8.4 Replacement-for candidates (employees supervised by the requestor)
```sql
SELECT FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE SUPERVISOR_NAME IN (
  SELECT FULL_NAME
  FROM XX_DIGI_EMP_MASTER
  WHERE EMPLOYEE_NUMBER = :employeeNumber
);
```

### 8.5 Budget / basic salary (readonly "Basic Salary" field)
```sql
SELECT BASIC_SALARY AS TOTAL_PACKAGE
FROM XX_DIGI_EMP_MASTER
WHERE FULL_NAME = :fullName;
```
*(Legacy also has a commented-out "full package" variant using `xxzpi_hcm_dev_package`
functions — do not enable without owner approval.)*

### 8.6 Filter dropdown options (distinct values)
```sql
SELECT DISTINCT REQUISITION_ID AS ID   FROM XXZPI_PER_REQUISITIONS_ALL;
SELECT DISTINCT REQUESTER_NAME AS NAME FROM XXZPI_PER_REQUISITIONS_ALL;
SELECT DISTINCT JOB_NAME       AS JOB  FROM XXZPI_PER_REQUISITIONS_ALL;
SELECT DISTINCT DEPT_NAME      AS DEPT FROM XXZPI_PER_REQUISITIONS_ALL;
SELECT DISTINCT REASON_OF_REQ  AS ROR  FROM XXZPI_PER_REQUISITIONS_ALL;
```
Combine into one `GET .../lookups/filter-options` returning
`{ requisitionIds: [], requesterNames: [], jobNames: [], deptNames: [], reasons: [] }`
(same scoping rules as §7.4; bounded with `FETCH FIRST 500 ROWS ONLY`).

### 8.7 Downstream contracts — DO NOT BREAK
```sql
-- Interview Assessment requisition dropdown (README_interview_assessment_form.md §8.2):
SELECT DISTINCT REQUISITION_NUMBER, JOB_NAME
FROM XXZPI_PER_REQUISITIONS_ALL
WHERE REQUISITION_STATUS = 'Approved'
ORDER BY 1 DESC;

-- Interview Assessment requester lookup (§8.4):
SELECT FULL_NAME, EMAIL_ADDRESS
FROM XX_DIGI_EMP_MASTER
WHERE EMPLOYEE_NUMBER IN (
  SELECT REQUESTED_BY FROM XXZPI_PER_REQUISITIONS_ALL
  WHERE REQUISITION_NUMBER = :requisitionNo AND JOB_NAME = :positionName
);
```
Both read `REQUESTED_BY`, `REQUISITION_NUMBER`, `JOB_NAME`, `REQUISITION_STATUS` — keep these
columns populated exactly as today.

---

## 9. Validation Rules (API must enforce — legacy had NONE)

| Field | Rule |
|---|---|
| `jobName` | required, max ~200; `jobId` optional number |
| `deptName` | required, max ~200; `deptId` optional number |
| `requestDate`, `dateNeeded` | required, valid dates (ISO in, `DD-Mon-YY` stored) |
| `reasonOfReq` | required: `Replacement` \| `Addition` |
| `replacementFor` | required when `Replacement`; `reason` required when `Addition` (enforce with Joi `when`) |
| `budgeted` | `Y` \| `N` (default `N`) |
| `budgetedSal` | number ≥ 0 (default 0) |
| education checkboxes | `Y` \| `N` (default `N`) |
| `gccExp`, `workExp` | one of `0 - 2`, `2 - 5`, `5 - 10`, `> 10` (default `0 - 2`) |
| `ticketStatus` | `""` \| `Open` \| `Accepted` \| `Close`; **only HR callers may set non-empty** (server-side role check, not a body flag) |
| `skills`, `other`, `remark` | optional strings; **store SQL `NULL` when empty** (not the literal `'null'`) |
| `files` | extension allowlist `jpg jpeg png gif txt doc docx pdf xls xlsx csv html ppt pptx odt` (legacy list), size cap (agree with owner), max count |
| unknown body fields | rejected (Joi default) |
| `requisitionId` | string `/^[1-9][0-9]{0,18}$/` |

---

## 10. Implementation Checklist for the Agent

1. ✅ Feature folder `server/src/modules/hr/requisitions/` with `requisition.routes.js` /
   `.controller.js` / `.service.js` / `.repository.js` / `.validation.js` — factories with
   injectable deps, mirroring `src/modules/users/` and `DEVELOPER-MODULE-GUIDE.md` §4.
2. ✅ 5 core endpoints (§2) + attachment sub-routes + 6 lookups; guards in approved order:
   `authenticate` → `requireCsrfToken` (unsafe) → `authorize('HR.REQUISITIONS', 'ACTION')`
   → `validate({...})`; `Cache-Control: no-store`.
3. ✅ Insert / Update / Delete each inside ONE `withTransaction(POOLS.LOW, ...)`; repositories
   get the connection and never commit/rollback; named bind variables only; `POOLS.LOW` for
   reads and writes.
4. ✅ ID generation exactly as legacy: `NVL(MAX(REQUISITION_ID + 20), 100000)` (§3.1);
   `REQUISITION_NUMBER = REQUISITION_ID`; attachment ids `MAX(HEADER_ID)+1`.
5. ✅ `REQUISITION_STATUS` written **only** as `'Draft'` on insert; never transitioned by this
   API (§11); update gated for non-HR when `Inprocess`/`Approved` (§5.0).
6. ✅ Listing: server-side filters (§7.1), pagination, `total`, allowlisted sort, HR +
   supervisor-scope enforcement from `req.auth` (§7.4) — no workflow columns.
7. ✅ Validation per §9 → `400 VALIDATION_ERROR` with `details[{field,message}]`.
8. ✅ Attachments: multipart upload, DB rows in `xxzp_all_attachments` with
   `FORM_NAME = 'Requisition'`, attachment delete endpoint (new capability), physical file
   cleanup agreed with owner.
9. ✅ Keep exact legacy column names/spellings (`REASON_OF_REQ`, `BUDGETED_SAL`,
   `ATTRIBUTE1/14/15`, `TOTAL_PACKAGE`) — no renames without a DB migration (gate G1).
10. ✅ Document every operation in `server/docs/openapi/openapi.yaml`, add routes to
    `tests/api-docs.test.js`; Supertest tests with doubles: success, 400, 401, 403 (+ DENY),
    404, 409 (update gate / delete guard), pagination bounds, CSRF, rollback. Run
    `cd server; npm run check`.

---

## 11. WORKFLOW — EXPLICITLY OUT OF SCOPE (verified present in legacy; do NOT implement)

The legacy Requisition module is the most workflow-heavy form. **None of the following belongs
in this CRUD API:**

- `Requisition::submitWorkflow()` (`controllers/Requisition.php:392–658`) — SMTP mail, file
  attach to mail, `callXXPHP_WORKFLOW(... 'REQF' ...)`, then `updateRequestStatus(id,'Inprocess')`.
- `Requisition::Workflow()` (lines 180–391) — **dead** (contains `die()`); ignore entirely.
- `REQ_Flow::workflow()` / `workflow1()` (`controllers/REQ_Flow.php`) — approve/reject handlers
  that write `REQUISITION_STATUS = 'Approved' | 'Rejected'` and call `ticketStatus()`.
- `XX_REQ_WF_REC` approver-chain rebuild (`setWorkflowRec`/`getworkflow`/`step`, model
  793–845, including its `DELETE FROM XX_REQ_WF_REC WHERE ...` — the ONLY delete in the
  legacy requisition code, workflow-only).
- `xxphp_workflow` inserts (`models/Workflow_model.php:80–130`), `Data_model` notification
  ids/status close, `Zmailer` REQF mail actions (approve/reject/forward/RFI/delegation),
  delegation `form_code = 1060`.
- **Status transitions:** any API call that sets `REQUISITION_STATUS` to `Inprocess`,
  `Approved` or `Rejected`. Only `'Draft'` is written by this API; the other values are data
  produced elsewhere (workflow) and are simply **read** for filtering/gating.
- **Listing columns that are workflow projections:** `PENDING_AT`, `START_DATE`, `END_DATE`,
  `DAYS_OPEN`, `NEW_DAYS_OPEN`, `LAST_ACTION`, `TOTAL_ACTIONS` — excluded from §7.
- `ticketStatus()` (writes `ATTRIBUTE1='Close'`) is only ever called from `REQ_Flow` — do not
  call it from CRUD code.

**Boundary note (data vs workflow, allowed in CRUD):** `ATTRIBUTE1` (Ticket Status
`Open/Accepted/Close`) plus derived `ATTRIBUTE14`/`ATTRIBUTE15` are **form/HR-owned data** —
they stay in the API (§5.1). The *status gate* in §5.0 only *reads* `REQUISITION_STATUS`.

---

## 12. AGENT PROMPT (copy-paste this to your coding assistant)

```text
You are helping me implement a change in the Zamil Digitalization repository
(GitHub: commonolivesofts-create/zamil-revamp). React 19 + Vite 8 frontend (client/) and
Node.js 24 + Express 5 ES-module backend (server/) over an existing Oracle Autonomous
Database schema. The repository is public.

MY TASK (backend-only — do not touch client/)
Implement the Personal Requisition Form CRUD API, fully specified in
README_personal_requisition_form.md at the repository root. Scope is strictly: INSERT, READ,
UPDATE, DELETE, LISTING WITH FILTERS, attachment handling (upload/list/delete), and the
lookup endpoints defined in that file. The legacy PHP (CodeIgniter 3) implementation exists
only at C:\xampp\htdocs\zpil_codebase (controllers/Requisition.php, models/
Requisition_model.php, views/ZPIL/requisition.php, views/update/requisition.php,
views/ZPIL/requisition_list.php, views/ZPIL/filter.php) — use it ONLY to verify field
behaviour if the README is unclear.

EXPLICIT EXCLUSIONS (README §11 is authoritative)
- NO workflow/approval/email logic of any kind: do NOT read or write XXPHP_WORKFLOW, do NOT
  touch XX_REQ_WF_REC, do NOT implement submit/approve/reject (Requisition::submitWorkflow,
  controllers/REQ_Flow.php, Zmailer), no SMTP, no RFI/forward/delegation. The API writes
  REQUISITION_STATUS only as 'Draft' on insert and NEVER transitions it. Status values
  Inprocess/Approved/Rejected are only read (list filter + non-HR update gate).
- Do NOT add the workflow-derived listing columns (PENDING_AT, START_DATE, END_DATE,
  DAYS_OPEN, LAST_ACTION, TOTAL_ACTIONS).
- No frontend work, no DDL/sequences or schema changes (needs my explicit approval), no new
  dependencies.

READ BEFORE WRITING CODE (base every statement on files you actually read)
1. README_personal_requisition_form.md — the authoritative spec: table + attachments table,
   column↔field mapping, payload, exact SQL per operation, filters, scoping, validation,
   lookups, legacy quirks (literal 'null' values NOT to reproduce, ATTRIBUTE14/15 date-wipe
   bug to flag) — follow it exactly and flag conflicts instead of choosing silently.
2. README_interview_assessment_form.md and README_employment_offer_form.md — ONLY §8.7 of
   the requisition README (downstream contracts) matters here; implement nothing else
   from them.
3. server/CLAUDE.md and server/docs/01-SYSTEM_ARCHITECTURE.md,
   02-API_DEVELOPMENT_STANDARDS.md, 03-ORACLE_DATABASE_ARCHITECTURE.md,
   06-ARCHITECTURE_DECISIONS_GUIDELINES.md (locked ADRs — do not work around them).
4. server/docs/DEVELOPER-MODULE-GUIDE.md — section 4 "Adding a backend module" is your
   step-by-step checklist; mirror the existing src/modules/users/ module end to end.
5. server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md, BACKEND-TESTING.md, and
   docs/FEATURE-DELIVERY-WORKFLOW.md (approval gates).

WHAT TO BUILD
- New feature folder src/modules/hr/requisitions/ with
  requisition.routes.js / .controller.js / .service.js / .repository.js /
  requisition.validation.js (factory functions with injectable dependencies, exactly like
  the users module).
- Endpoints under /api/v1/hr/requisitions:
    POST   /                     insert header + attachment rows in ONE
                                  withTransaction(POOLS.LOW, ...); id from
                                  SELECT NVL(MAX(REQUISITION_ID+20),100000);
                                  REQUISITION_NUMBER = REQUISITION_ID;
                                  REQUISITION_STATUS = 'Draft'
    GET    /                     listing with filters + pagination + total (README §7.1;
                                  allowlisted sortBy/sortOrder; OFFSET/FETCH; HR vs
                                  non-HR + supervisor scoping from req.auth — §7.4;
                                  NO workflow columns)
    GET    /:requisitionId       read header + attachments (404 if absent)
    PUT    /:requisitionId       update (README §5): pre-check status gate for non-HR
                                  (409 when Inprocess/Approved), audit columns, preserve
                                  ATTRIBUTE14/15 per README, optional new attachments,
                                  one transaction; never touch REQUISITION_STATUS/
                                  REQUEST_DATE/REQUESTED_BY/REQUISITION_NUMBER
    DELETE /:requisitionId       delete attachments then header in one transaction;
                                  404 if absent; apply README §6 guards (Draft-only and
                                  referenced-by-interview checks) — confirm policy if
                                  you think it differs
    POST   /:requisitionId/attachments      multipart upload, FORM_NAME='Requisition'
    DELETE /:requisitionId/attachments/:attachmentId   DB row + physical file
    GET    /lookups/job-titles | /requestor | /departments | /replacement-for |
           /budget?fullName= | /filter-options           (README §8 exact SQL)
- Guards in approved order on every route: authenticate → requireCsrfToken (unsafe) →
  authorize('HR.REQUISITIONS', 'ACTION') → validate({ params, query, body });
  Cache-Control: no-store. Controllers thin; SQL ONLY in the repository with named bind
  variables; business rules only in the service; AppError for expected failures;
  sendSuccess / sendPaginated envelopes; requisitionId travels as a string
  (/^[1-9][0-9]{0,18}$/); rows mapped to camelCase; explicit column lists; POOLS.LOW.

RULES I WILL HOLD YOU TO
- Never invent tables, columns, endpoints, permissions or business rules — if the README and
  the real Oracle schema disagree, stop and ask me.
- ticketStatus (ATTRIBUTE1) may only be set by HR callers — enforce server-side from the
  actor's XXZP_HR lookup, never from a body flag.
- Reuse shared infrastructure only (config, logger, validate, AppError, apiResponse,
  withConnection/withTransaction); never read process.env, never console.*, no ORMs, no
  generic base repositories, no parallel helpers.
- Register the router in src/routes/api.routes.js (accepting deps.*Repository and db.* for
  tests), document every operation in server/docs/openapi/openapi.yaml in the same change,
  and add the routes to tests/api-docs.test.js.
- Permission codes (e.g. HR.REQUISITIONS {VIEW, CREATE, EDIT, DELETE, MANAGE_ATTACHMENTS})
  must be registered in the RBAC catalogue — tell me which codes you need and wait for my
  approval before assuming they exist; default-deny otherwise.
- Supertest + node:test tests with injected doubles: success paths, 400 validation, 401,
  403 (missing permission + DENY), 404, 409 (update gate, delete guards), pagination
  bounds, CSRF on changes, and transaction rollback for insert/delete.
- Before writing code, list the exact files you will create/modify with full paths and why.
- Never claim tests pass unless you executed them: run `cd server; npm run check` and show
  the output; otherwise say "not executed".
- No credentials, wallet contents, .env values or real employee data anywhere.

Start by reading the documents above, then summarize your understanding of the spec and the
users module pattern, then propose your file list and endpoint contract before coding.
```
