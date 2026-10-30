# Employment Offer Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the Employment Offer Form —
> **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup (dropdown and
> bilingual helper) APIs the form needs. **Workflow / approval / email logic is out of scope**
> (the legacy Employment Offer module has none — see §11) and is intentionally not documented.
> **PDF/print rendering is also out of scope** for this phase (legacy uses mPDF — future task).
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
> - `controllers/Emp_offer.php` (`class emp_offer`; methods: `empOfferForm`, `insertemp`, `addempoffer`, `updateemp`, `index`, `pdf`, `transaleNumberArabic`, `hijridate`)
> - `models/emp_offer_model.php` (all SQL)
> - `views/ZPIL/emp_offer.php` (new offer form), `views/update/empoffer.php` (edit form)
> - `views/ZPIL/emp_offer1.php` (listing page), `views/ZPIL/employee_offer_pdf.php` (mPDF template — out of scope)
>
> **Database:** Oracle, schema/owner `XXZP`. All SQL below uses **bind variables** — never
> string-concatenate user input (the legacy code does; do not copy that habit).
>
> **Related spec:** `README_interview_assessment_form.md` (repository root) — only §8.5 of that
> file (the approved+passed candidates query) is a contract for this module. Everything else in
> that README belongs to the Interview module. **Do not implement workflow from anywhere.**

---

## 1. Data Model

Exactly **2 tables**, keyed by the same `HEADER_ID`. The app always writes **one line per header**
(the line is a single object, not an array).

| # | Table | Relationship |
|---|---|---|
| 1 | `XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T` | Parent (1) |
| 2 | `XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T` | 1:1 with header via `HEADER_ID` |

### 1.1 `XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T`

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `HEADER_ID` | NUMBER PK | hidden `header_id` (edit form) | **DB-generated** (trigger/identity) — see §3.1 |
| `UUID` | VARCHAR2(36) | — | v4 UUID, generated server-side; used to read back the generated `HEADER_ID` |
| `OFFER_DATE` | DATE | `dates` | legacy stores `DD-Mon-YYYY` (e.g. `25-Oct-2026`) |
| `EMPLOYEE_NAME` | VARCHAR2 | `name` (candidate datalist) | required |
| `EMPLOYEE_NAME_AR` | VARCHAR2 | `arabic_name` | Arabic candidate name (optional) |
| `POSITION` | VARCHAR2 | `position` | autofilled from interview `POSITION_NAME` |
| `STATUS` | VARCHAR2 | — | **write-once `'Incomplete'` on insert**; never updated by legacy; plain stored field for us |
| `ATTRIBUTE1` | VARCHAR2 | `division` (select) | **Business unit / report format**: `300000002689294` or `300000002689307` (see §9 caveat) |
| `ATTRIBUTE2` | VARCHAR2 | `applicant` | Applicant signature name; insert default `'-'` |
| `ATTRIBUTE3` | VARCHAR2 | `to` | Mr/Mrs title, English (from lookup `XXZP_TITLE`) |
| `ATTRIBUTE4` | VARCHAR2 | `to_arabic` | Mr/Mrs title, Arabic (lookup `DESCRIPTION`) |
| `ATTRIBUTE10` | VARCHAR2 | `int_no` (hidden) | **Interview number** = `XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T.INT_NO` |
| `ATTRIBUTE11` | NUMBER/VARCHAR2 | `req_no` (hidden) | **Requisition number** = interview header `ATTRIBUTE4`; insert default `0` |
| `CREATED_BY` | NUMBER | session `FormsSession` (employee no.) | → authenticated user id in new API |
| `CREATION_DATE` | DATE | — | legacy stores `DD-Mon-YY` (e.g. `25-Oct-26`); use `SYSDATE` |
| `LAST_UPDATED_BY` | NUMBER | — | |
| `LAST_UPDATE_LOGIN` | NUMBER | — | legacy sets it = updated-by user id |
| `LAST_UPDATE_DATE` | DATE | — | |

### 1.2 `XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T`

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `OFFER_LINE_ID` | NUMBER PK | hidden `line_id` (edit form) | **DB-generated** (trigger/identity) |
| `HEADER_ID` | NUMBER FK | hidden `header_id` | |
| `BASIC_SALARY` | NUMBER | `b_sallary` (sic) | commas stripped before save (`str_replace(',', '', ...)`) |
| `BASIC_SALARY_AR` | VARCHAR2 | `sallary_arabic` (sic) | Arabic words via `CON_NUM_TO_ARABIC` (§8.10) |
| `HOUSING_ALLOWANCE` / `HOUSING_ALLOWANCE_AR` | VARCHAR2 | `housing_allowance` / `housing_arabic` | lookup `XXZP_HOUSING_ALLOWANCE` (MEANING / DESCRIPTION) |
| `TRANSPORTATION` / `TRANSPORTATION_AR` | VARCHAR2 | `trans` / `trans_arabic` | lookup `XXZP_TRANSPORTATION` |
| `ANNUAL_VACATION` / `ANNUAL_VACATION_AR` | VARCHAR2 | `annual_vac` / `annual_arabic` | lookup `XXZP_ANNUAL_VACATION` |
| `TICKET` / `TICKET_AR` | VARCHAR2 | `ticket` / `ticket_arabic` | lookup `XXZP_TICKET` |
| `MEDICAL` / `MEDICAL_AR` | VARCHAR2 | `medical` / `medical_arabic` | lookup `XXZP_MEDICAL` |
| `CONTRACT_PERIOD` / `CONTRACT_PERIOD_AR` | VARCHAR2 | `cont_p` / `cp_arabic` | lookup `XXZP_CONTRACT_PERIOD` |
| `APPROXIMATE_STARTING_DATE` | DATE | `app_date` | legacy stores `DD-Mon-YYYY` |
| `APPROXIMATE_STARTING_DATE_AR` | VARCHAR2 | `app_date_arabic` | Hijri `YYYY/MM/DD` via NLS (§8.11) |
| `PROBATIONARY_PERIOD` | VARCHAR2 | `prob_p` | **hardcoded default:** `3 months with the possibility to be extend to 6 Months.` |
| `PROBATIONARY_PERIOD_AR` | VARCHAR2 | `prob_arabic` | **hardcoded default:** `ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.` |
| `ATTRIBUTE1` | VARCHAR2 | `comment` | Comments field (legacy escapes it) |
| `ATTRIBUTE2` | VARCHAR2 | `sallary_arabic` | **legacy quirk:** duplicate of `BASIC_SALARY_AR`, written on INSERT only, never read/updated — replicate on insert for parity, do not expose as an API field |
| `CREATED_BY`, `CREATION_DATE`, `LAST_UPDATED_BY`, `LAST_UPDATE_LOGIN`, `LAST_UPDATE_DATE` | audit | | |

### 1.3 Primary-key generation (important legacy quirk)

Legacy computes `NVL(MAX(HEADER_ID+1),144)` / `NVL(MAX(OFFER_LINE_ID+1),230)` **but never uses
those values** — both INSERTs **omit the PK columns**, and the header id is read back via:
```js
// legacy: get_column_value(..., ['UUID' => $headerUUID])
```
⇒ IDs are produced by a **DB trigger/identity**. For the API:
- **Primary approach (legacy-compatible):** generate `UUID` in Node (`crypto.randomUUID()`),
  insert **without** the PK columns, read back with `SELECT HEADER_ID WHERE UUID = :uuid`.
- **Alternative (if allowed after verification on Oracle TEST):** `INSERT ... RETURNING HEADER_ID INTO :id`.
- Do **not** hardcode the fallbacks `144`/`230`; they are stale data leftovers.
- No business "offer number" exists — the natural key is `HEADER_ID`.

---

## 2. API Surface

Base path: `/api/v1/hr/employment-offers`
Auth: session (`authenticate`); `created_by` / `updated_by` come from `req.auth` — never the body.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/hr/employment-offers` | **Insert** (header + line, one transaction) |
| `GET` | `/api/v1/hr/employment-offers/:headerId` | **Read** one offer (header + line) |
| `PUT` | `/api/v1/hr/employment-offers/:headerId` | **Update** (header + line, one transaction) |
| `DELETE` | `/api/v1/hr/employment-offers/:headerId` | **Delete** (line + header, one transaction) |
| `GET` | `/api/v1/hr/employment-offers` | **Listing with filters** + pagination |
| `GET` | `.../lookups/candidates` | approved+passed interview candidates (§8.1) |
| `GET` | `.../lookups/titles` | Mr/Mrs titles (§8.2) |
| `GET` | `.../lookups/allowances?type=housing\|transportation\|contract-period\|annual-vacation\|medical\|ticket` | benefit option lists (§8.3–8.8) |
| `GET` | `.../lookups/number-to-arabic?number=1234` | salary in Arabic words (§8.10) |
| `GET` | `.../lookups/hijri-date?date=YYYY-MM-DD` | Gregorian → Hijri date (§8.11) |

**Universal responses**
```jsonc
// 200 / 201
{ "success": true, "data": { ... } }
// 404
{ "success": false, "message": "Employment offer not found" }
// 400
{ "success": false, "message": "Validation failed", "errors": ["employeeName is required"] }
```

---

## 3. INSERT — `POST /api/v1/hr/employment-offers`

### 3.1 Key generation

```sql
-- legacy computed (NOT used by the INSERT; PK comes from trigger/identity):
SELECT NVL(MAX(HEADER_ID + 1), 144) AS ID FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T;
```
Instead: create `UUID` in Node → insert without PK → read back:
```sql
SELECT HEADER_ID FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE UUID = :uuid;
```
Date handling: React sends ISO `YYYY-MM-DD`; convert server-side to legacy `DD-Mon-YYYY`
(e.g. `25-Oct-2026`) for `OFFER_DATE` / `APPROXIMATE_STARTING_DATE` (`TO_DATE(:d,'YYYY-MM-DD')`
is acceptable if NLS format is confirmed). Audit dates = `SYSDATE`.

### 3.2 Payload (JSON)

```jsonc
{
  "offerDate": "2026-10-25",        // OFFER_DATE (required)
  "employeeName": "John Doe",       // EMPLOYEE_NAME (required, from candidates lookup)
  "employeeNameAr": "جون دو",       // EMPLOYEE_NAME_AR (optional)
  "position": "Machine Operator",   // POSITION (required, autofilled from candidate)
  "division": "300000002689294",     // ATTRIBUTE1 (required, BU id — see §9 caveat)
  "to": "Mr",                       // ATTRIBUTE3 (title EN, from XXZP_TITLE)
  "toArabic": "السيد",              // ATTRIBUTE4 (title AR, lookup DESCRIPTION)
  "applicant": "-",                 // ATTRIBUTE2 (signature name, default "-")
  "intNo": "300000003618177-636",   // ATTRIBUTE10 (interview INT_NO, required)
  "reqNo": "REQ-1024",              // ATTRIBUTE11 (requisition no, default 0)

  "line": {
    "basicSalary": 8500,                        // BASIC_SALARY (commas stripped)
    "basicSalaryAr": "ثمانية آلاف...",          // BASIC_SALARY_AR (server may call §8.10)
    "housingAllowance": "25% of basic",         // HOUSING_ALLOWANCE
    "housingAllowanceAr": "...",                // HOUSING_ALLOWANCE_AR
    "transportation": "Transportation",         // TRANSPORTATION
    "transportationAr": "...",                  // TRANSPORTATION_AR
    "annualVacation": "21 days",                // ANNUAL_VACATION
    "annualVacationAr": "...",                  // ANNUAL_VACATION_AR
    "ticket": "1 ticket every 2 years",         // TICKET
    "ticketAr": "...",                          // TICKET_AR
    "medical": "Company medical policy",        // MEDICAL
    "medicalAr": "...",                         // MEDICAL_AR
    "contractPeriod": "3 years",                // CONTRACT_PERIOD
    "contractPeriodAr": "...",                  // CONTRACT_PERIOD_AR
    "approximateStartingDate": "2026-11-01",    // APPROXIMATE_STARTING_DATE (required)
    "approximateStartingDateAr": "1448/03/10",  // APPROXIMATE_STARTING_DATE_AR (Hijri, optional)
    "probationaryPeriod": "3 months with the possibility to be extend to 6 Months.",   // default if absent
    "probationaryPeriodAr": "ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.",              // default if absent
    "comment": "Offer per grade X"              // line ATTRIBUTE1 (optional)
  }
}
```

### 3.3 SQL — both inserts in ONE transaction (`withTransaction(POOLS.LOW, ...)`)

```sql
-- 1) HEADER — note: no PK column in the column list
INSERT INTO XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
  (UUID, OFFER_DATE, EMPLOYEE_NAME, POSITION, STATUS, EMPLOYEE_NAME_AR,
   CREATED_BY, CREATION_DATE, ATTRIBUTE1, ATTRIBUTE2, ATTRIBUTE3, ATTRIBUTE4,
   ATTRIBUTE10, ATTRIBUTE11)
VALUES
  (:uuid, TO_DATE(:offerDate, 'DD-Mon-YYYY'), :employeeName, :position, 'Incomplete',
   :employeeNameAr, :createdBy, SYSDATE, :division, NVL(:applicant, '-'),
   :to, :toArabic, :intNo, NVL(:reqNo, 0));
```
```sql
-- 2) fetch generated key
SELECT HEADER_ID FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE UUID = :uuid;
```
```sql
-- 3) LINE — exactly one row, no PK column
INSERT INTO XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T
  (HEADER_ID, BASIC_SALARY, BASIC_SALARY_AR,
   HOUSING_ALLOWANCE, HOUSING_ALLOWANCE_AR,
   TRANSPORTATION, TRANSPORTATION_AR,
   ANNUAL_VACATION, ANNUAL_VACATION_AR,
   TICKET, TICKET_AR, MEDICAL, MEDICAL_AR,
   CONTRACT_PERIOD, CONTRACT_PERIOD_AR,
   APPROXIMATE_STARTING_DATE, APPROXIMATE_STARTING_DATE_AR,
   PROBATIONARY_PERIOD, PROBATIONARY_PERIOD_AR,
   CREATED_BY, CREATION_DATE, ATTRIBUTE1, ATTRIBUTE2)
VALUES
  (:headerId, NVL(:basicSalary, 0), :basicSalaryAr,
   :housingAllowance, :housingAllowanceAr,
   :transportation, :transportationAr,
   :annualVacation, :annualVacationAr,
   :ticket, :ticketAr, :medical, :medicalAr,
   :contractPeriod, :contractPeriodAr,
   TO_DATE(:approxStartingDate, 'DD-Mon-YYYY'), :approxStartingDateAr,
   NVL(:probationaryPeriod, '3 months with the possibility to be extend to 6 Months.'),
   NVL(:probationaryPeriodAr, 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.'),
   :createdBy, SYSDATE, :comment, :basicSalaryAr);   -- ATTRIBUTE2 = legacy salary-arabic dup
```

**Order of operations:** `BEGIN` → insert header → read back `HEADER_ID` by `UUID` → insert line
→ `COMMIT`. Any error → `ROLLBACK` → `500`.
**Response `201`:** `{ success: true, data: { headerId, uuid } }`

> Legacy quirks kept for parity (do not "fix" silently without asking): empty `applicant` → `'-'`;
> empty `reqNo` → `0`; `STATUS` always `'Incomplete'`. Legacy wrote `' $dates'` (leading space) and
> `'$division '` (trailing space) — **do not reproduce the stray spaces**; bind clean values.

---

## 4. READ — `GET /api/v1/hr/employment-offers/:headerId`

```sql
-- 4.1 Header (legacy: emp_header($id))
SELECT HEADER_ID, UUID, OFFER_DATE, EMPLOYEE_NAME, EMPLOYEE_NAME_AR, POSITION, STATUS,
       ATTRIBUTE1, ATTRIBUTE2, ATTRIBUTE3, ATTRIBUTE4, ATTRIBUTE10, ATTRIBUTE11,
       CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
WHERE HEADER_ID = :headerId;
```
```sql
-- 4.2 Line (legacy: emp_line($id) — single row)
SELECT OFFER_LINE_ID, HEADER_ID, BASIC_SALARY, BASIC_SALARY_AR,
       HOUSING_ALLOWANCE, HOUSING_ALLOWANCE_AR, TRANSPORTATION, TRANSPORTATION_AR,
       ANNUAL_VACATION, ANNUAL_VACATION_AR, TICKET, TICKET_AR, MEDICAL, MEDICAL_AR,
       CONTRACT_PERIOD, CONTRACT_PERIOD_AR, APPROXIMATE_STARTING_DATE,
       APPROXIMATE_STARTING_DATE_AR, PROBATIONARY_PERIOD, PROBATIONARY_PERIOD_AR,
       ATTRIBUTE1
FROM XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T
WHERE HEADER_ID = :headerId;
```
- Header missing → `404`. Line missing (possible if data was partial) → return `line: null`
  rather than failing.
- **Response shape:** JSON per §3.2 plus `headerId`, `status`, `createdAt`, `updatedAt`.
- `:headerId` is a `NUMBER(19,0)` → travel as **string** in the API (`Joi` pattern like the
  `users` module: `/^[1-9][0-9]{0,18}$/`).

---

## 5. UPDATE — `PUT /api/v1/hr/employment-offers/:headerId`

Legacy `updateemp()` = exactly two statements (header, then line), in one flow. Reproduce as
**one transaction**. `STATUS` is **not** touched. Audit trio on every statement:
`LAST_UPDATED_BY = :updatedBy`, `LAST_UPDATE_LOGIN = :updatedBy`, `LAST_UPDATE_DATE = SYSDATE`.

```sql
-- 5.1 Header
UPDATE XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
SET OFFER_DATE = TO_DATE(:offerDate, 'DD-Mon-YYYY'),
    EMPLOYEE_NAME = :employeeName,
    EMPLOYEE_NAME_AR = :employeeNameAr,
    POSITION = :position,
    ATTRIBUTE1 = :division,
    ATTRIBUTE2 = :applicant,
    ATTRIBUTE3 = :to,
    ATTRIBUTE4 = :toArabic,
    ATTRIBUTE10 = :intNo,
    ATTRIBUTE11 = :reqNo,
    LAST_UPDATED_BY = :updatedBy,
    LAST_UPDATE_LOGIN = :updatedBy,
    LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :headerId;
```
```sql
-- 5.2 Line
UPDATE XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T
SET BASIC_SALARY = NVL(:basicSalary, 0),
    BASIC_SALARY_AR = :basicSalaryAr,
    HOUSING_ALLOWANCE = :housingAllowance,
    HOUSING_ALLOWANCE_AR = :housingAllowanceAr,
    TRANSPORTATION = :transportation,
    TRANSPORTATION_AR = :transportationAr,
    ANNUAL_VACATION = :annualVacation,
    ANNUAL_VACATION_AR = :annualVacationAr,
    TICKET = :ticket,
    TICKET_AR = :ticketAr,
    MEDICAL = :medical,
    MEDICAL_AR = :medicalAr,
    CONTRACT_PERIOD = :contractPeriod,
    CONTRACT_PERIOD_AR = :contractPeriodAr,
    APPROXIMATE_STARTING_DATE = TO_DATE(:approxStartingDate, 'DD-Mon-YYYY'),
    APPROXIMATE_STARTING_DATE_AR = :approxStartingDateAr,
    ATTRIBUTE1 = :comment,
    LAST_UPDATED_BY = :updatedBy,
    LAST_UPDATE_LOGIN = :updatedBy,
    LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :headerId;
```

**Rules**
- Verify the header exists first → `404` if not; also check `sqlRowCounts` on both UPDATEs.
- **Legacy behaviour (documented, recommended to keep):** `PROBATIONARY_PERIOD(_AR)` and line
  `ATTRIBUTE2` are **not updated** (insert-only). If the new form allows editing them, say so and
  add the columns to §5.2 explicitly — do not add silently.
- If the line row does not exist yet (header saved without a line), use **MERGE** for §5.2:
  ```sql
  MERGE INTO XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T d
  USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
  ON (d.HEADER_ID = s.HEADER_ID)
  WHEN MATCHED THEN UPDATE SET ...   -- §5.2 assignments (minus PK)
  WHEN NOT MATCHED THEN INSERT (...) VALUES (...);  -- §3.3 line insert incl. CREATED_BY = :updatedBy
  ```
- Run §5.1 and §5.2 in **one** `withTransaction(POOLS.LOW, ...)`; rollback on any failure.
- **Response `200`:** `{ success: true, data: { headerId } }`

---

## 6. DELETE — `DELETE /api/v1/hr/employment-offers/:headerId`

> The legacy PHP app has **no delete** for this form (no DELETE statement, no controller method,
> no UI link). For the new API, deleting must remove **both rows**, line first (FK), in one
> transaction.

```sql
DELETE FROM XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T WHERE HEADER_ID = :headerId;
DELETE FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE HEADER_ID = :headerId;
```

**Rules**
- Select the header first (§4.1) → `404` if absent.
- No other table references these rows (verified — nothing downstream reads offers via FK), so no
  conflict guard is required today. Recommended (optional, confirm with owner): refuse deletion
  when `STATUS <> 'Incomplete'` should the status ever become mutable — currently it is
  write-once, so plain delete is safe.
- `BEGIN` → deletes → `COMMIT`; check row counts (header delete = 0 → `404`); rollback on error.
- **Response:** `200 { success: true, data: { headerId, deleted: true } }`

---

## 7. LISTING WITH FILTERS — `GET /api/v1/hr/employment-offers`

Legacy listing (`emp_list()` + `views/ZPIL/emp_offer1.php`) is **client-side DataTables only**
(`pageLength: 20`, export buttons copy/csv/excel/pdf/print) with **zero server-side WHERE** — and
a bug: the HR probe runs but both branches return the identical query. New API implements real
server-side filters below and applies proper scoping.

### 7.1 Query parameters

| Param | Type | Maps to | Notes |
|---|---|---|---|
| `page` | int (default 1) | — | 1-based |
| `pageSize` | int (default 20, max 100) | — | legacy DataTables default |
| `search` | string | `EMPLOYEE_NAME`, `POSITION`, `EMPLOYEE_NAME_AR`, `ATTRIBUTE10`, `ATTRIBUTE11` | case-insensitive partial |
| `intNo` | string | `ATTRIBUTE10` | exact (interview no) |
| `requisitionNo` | string | `ATTRIBUTE11` | exact |
| `division` | string | `ATTRIBUTE1` | BU id exact |
| `status` | string | `STATUS` | only value today: `Incomplete` |
| `dateFrom` | date | `OFFER_DATE` | `>=` |
| `dateTo` | date | `OFFER_DATE` | `<=` |
| `createdBy` | number | `CREATED_BY` | server-side scoping (§7.4) |
| `sortBy` | whitelist | — | `HEADER_ID` (default), `OFFER_DATE`, `EMPLOYEE_NAME`, `CREATION_DATE` |
| `sortDir` | `asc`\|`desc` | — | default `desc` |

### 7.2 Base query

```sql
SELECT HEADER_ID, OFFER_DATE, EMPLOYEE_NAME, EMPLOYEE_NAME_AR, POSITION, STATUS,
       ATTRIBUTE1  AS DIVISION,
       ATTRIBUTE2  AS APPLICANT,
       ATTRIBUTE10 AS INT_NO,
       ATTRIBUTE11 AS REQUISITION_NO,
       CREATED_BY, CREATION_DATE, LAST_UPDATE_DATE
FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
WHERE 1 = 1
  AND (:search IS NULL OR UPPER(EMPLOYEE_NAME)  LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(POSITION)       LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(EMPLOYEE_NAME_AR) LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(ATTRIBUTE10)    LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(ATTRIBUTE11)    LIKE '%'||UPPER(:search)||'%')
  AND (:intNo IS NULL OR UPPER(ATTRIBUTE10) = UPPER(:intNo))
  AND (:requisitionNo IS NULL OR UPPER(ATTRIBUTE11) = UPPER(:requisitionNo))
  AND (:division IS NULL OR ATTRIBUTE1 = :division)
  AND (:status IS NULL OR UPPER(STATUS) = UPPER(:status))
  AND (:dateFrom IS NULL OR OFFER_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
  AND (:dateTo   IS NULL OR OFFER_DATE <  TO_DATE(:dateTo, 'YYYY-MM-DD') + 1)
  AND (:createdBy IS NULL OR CREATED_BY = :createdBy)
ORDER BY
  CASE WHEN :sortBy = 'HEADER_ID'      AND UPPER(:sortDir)='DESC' THEN HEADER_ID      END DESC,
  CASE WHEN :sortBy = 'HEADER_ID'      AND UPPER(:sortDir)='ASC'  THEN HEADER_ID      END ASC,
  CASE WHEN :sortBy = 'OFFER_DATE'     AND UPPER(:sortDir)='DESC' THEN OFFER_DATE     END DESC,
  CASE WHEN :sortBy = 'OFFER_DATE'     AND UPPER(:sortDir)='ASC'  THEN OFFER_DATE     END ASC,
  CASE WHEN :sortBy = 'EMPLOYEE_NAME'  AND UPPER(:sortDir)='ASC'  THEN EMPLOYEE_NAME  END ASC,
  CASE WHEN :sortBy = 'EMPLOYEE_NAME'  AND UPPER(:sortDir)='DESC' THEN EMPLOYEE_NAME  END DESC,
  CASE WHEN :sortBy = 'CREATION_DATE'  AND UPPER(:sortDir)='DESC' THEN CREATION_DATE  END DESC,
  CASE WHEN :sortBy = 'CREATION_DATE'  AND UPPER(:sortDir)='ASC'  THEN CREATION_DATE  END ASC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY
```

> - Bind `null` for unused filters; named binds (`bindByName`), one bind per distinct param.
> - `offset = (page - 1) * pageSize`.
> - Total count (same conditions, no ORDER BY):
>   ```sql
>   SELECT COUNT(*) AS TOTAL
>   FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
>   WHERE <same dynamic conditions>;
>   ```

### 7.3 Response

```jsonc
{
  "success": true,
  "data": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "headerId": "144",
        "offerDate": "25-Oct-2026",
        "employeeName": "John Doe",
        "employeeNameAr": "جون دو",
        "position": "Machine Operator",
        "division": "300000002689294",
        "applicant": "-",
        "intNo": "300000003618177-636",
        "requisitionNo": "REQ-1024",
        "status": "Incomplete",
        "createdBy": 9311,
        "creationDate": "25-Oct-26",
        "lastUpdateDate": null
      }
    ]
  }
}
```
*(Row order matches legacy report: newest first; `STATUS` was not shown on the legacy list page —
include it in the payload anyway for filtering.)*

### 7.4 Access scoping (who sees which rows)

Legacy probe (both branches effectively return all rows — a bug we fix):
```sql
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR'
  AND TAG = :userId;
```
- **HR user** (rows returned): no extra predicate → sees **all** offers.
- **Non-HR user**: add `AND CREATED_BY = :userId` to §7.2 — enforced **server-side from the
  authenticated actor**, never from a request parameter.

---

## 8. LOOKUP / HELPER APIs

### 8.1 Candidates — approved + passed interviews (form datalist; contract with Interview module)
```sql
SELECT IAHT.HEADER_ID, IAHT.INT_NO, IAHT.CANDIDATE_NAME, IAHT.POSITION_NAME, IAHT.ATTRIBUTE4
FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T IAHT,
     XXZP.XXZP_INTERVIEW_EVAL_T IVT
WHERE IAHT.HEADER_ID = IVT.HEADER_ID
  AND IAHT.STATUS = 'Approved'
  AND IVT.STATUS = 'Passed'
ORDER BY 5 DESC;
```
> Legacy had a **commented-out** dedupe clause (`INT_NO NOT IN (SELECT NVL(ATTRIBUTE10,0) FROM
> XXZP_EMPLOYMENT_OFFER_HEADER_T)`) — i.e., candidates already offered were once excluded. Return
> it as an **optional query param** `?excludeOffered=true` (implement the subquery only when
> provided); default `false` preserves legacy behaviour. Agree the default with the owner.
> `ORDER BY 5` = requisition number (`ATTRIBUTE4`) — keep or move to an explicit alias.

### 8.2 Titles (Mr/Mrs)
```sql
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TITLE';
```

### 8.3 Housing allowance
```sql
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HOUSING_ALLOWANCE'
ORDER BY LOOKUP_CODE;
```

### 8.4 Transportation
```sql
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TRANSPORTATION'
ORDER BY LOOKUP_CODE;
```

### 8.5 Contract period
```sql
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_CONTRACT_PERIOD'
ORDER BY LOOKUP_CODE;
```

### 8.6 Annual vacation
```sql
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_ANNUAL_VACATION'
ORDER BY LOOKUP_CODE;
```

### 8.7 Medical (two-row union — keep exact)
```sql
SELECT MEANING || ' qualified dependents (as per Company policy)' AS MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_MEDICAL' AND LOOKUP_CODE = 1
UNION
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_MEDICAL' AND LOOKUP_CODE = 2;
```

### 8.8 Ticket (four-row union — keep exact)
```sql
SELECT MEANING || ' to point of origin.' AS MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 1
UNION
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 2
UNION
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 3
UNION
SELECT MEANING, DESCRIPTION
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 4;
```

### 8.9 Business units (hardcoded in both legacy views — expose as a constant/lookup)
| Value | Insert-form label | Edit-form label |
|---|---|---|
| `300000002689294` | FPP BU | IPP BU |
| `300000002689307` | IPP BU | FPP BU |
> ⚠️ **Labels are swapped between the two views — data inconsistency. Do NOT invent which is
> right.** Return the raw ids only and ask the owner to confirm the labels before any UI work.

### 8.10 Number → Arabic words (AJAX helper)
```sql
SELECT CON_NUM_TO_ARABIC(:number) AS OUTPUT_STRING FROM DUAL;
```
`GET .../lookups/number-to-arabic?number=8500` → `{ "output": "ثمانية آلاف..." }`. Validate
`number` as a number in Joi before binding.

### 8.11 Gregorian → Hijri date (AJAX helper)
```sql
SELECT TO_CHAR(TO_DATE(:date, 'YYYY-MM-DD'), 'YYYY/MM/DD',
               'NLS_CALENDAR=''Arabic Hijrah''') AS HIJRI
FROM DUAL;
```
`GET .../lookups/hijri-date?date=2026-11-01` → `{ "hijri": "1448/03/10" }`.

---

## 9. Validation Rules (API must enforce — legacy had NONE)

| Field | Rule |
|---|---|
| `offerDate` | required, valid date (ISO in, `DD-Mon-YYYY` stored) |
| `employeeName` | required, max length ~200 |
| `position` | required, max length ~200 |
| `division` | required, must be one of the two BU ids (`300000002689294`, `300000002689307`) — labels per §8.9 caveat |
| `intNo` | required; **recommended:** must match an existing `XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T.INT_NO` (ask owner before enforcing FK-like check) |
| `reqNo` | optional; default `0` (legacy) |
| `to` / `toArabic` | optional; must exist in `XXZP_TITLE` lookup (soft check) |
| `applicant` | optional; default `'-'` |
| `line.basicSalary` | number ≥ 0; strip commas server-side |
| `line.approximateStartingDate` | required, valid date |
| `line.probationaryPeriod(_Ar)` | optional; apply the hardcoded defaults from §1.2 when absent |
| Arabic twin fields | all optional strings |
| `comment` | optional string |
| unknown body fields | **rejected** (Joi default in this repo) |
| `headerId` params | string matching `/^[1-9][0-9]{0,18}$/` (IDs travel as strings) |

---

## 10. Implementation Checklist for the Agent

1. ✅ Feature folder `server/src/modules/hr/employment-offers/` with
   `employmentOffer.routes.js` / `.controller.js` / `.service.js` / `.repository.js` /
   `.validation.js` — factory functions with injectable deps, mirroring `src/modules/users/`
   and the steps in `server/docs/DEVELOPER-MODULE-GUIDE.md` §4.
2. ✅ 5 core endpoints (§2) + lookup endpoints; guards in approved order:
   `authenticate` → `requireCsrfToken` (unsafe) → `authorize('HR.EMPLOYMENT_OFFERS', 'ACTION')`
   → `validate({...})`; `Cache-Control: no-store` on protected responses.
3. ✅ Insert / Update / Delete each inside **one** `withTransaction(POOLS.LOW, ...)`; repositories
   receive the connection and **never** commit/rollback; bind variables only.
4. ✅ PK strategy: UUID server-side → insert without PK → read back `HEADER_ID` by UUID (§3.1).
5. ✅ `created_by` / `updated_by` from `req.auth` — never from the request body.
6. ✅ Listing: server-side filters (§7.1), pagination (`page`, `pageSize` ≤ 100), `total` count,
   allowlisted `sortBy`/`sortOrder`, HR vs non-HR scoping from the actor (§7.4).
7. ✅ Validation per §9 → `400 VALIDATION_ERROR` with `details[{field,message}]`.
8. ✅ Keep exact legacy column spellings and semantics (`b_sallary` → `BASIC_SALARY`,
   `ATTRIBUTE1` = division, `ATTRIBUTE2` = applicant / line salary-arabic dup,
   `PROBATIONARY_PERIOD` not updatable, write-once `STATUS`) — renaming needs a DB migration,
   which is out of scope. Do not reproduce the legacy stray-space values.
9. ✅ Document every operation in `server/docs/openapi/openapi.yaml` + add routes to
   `tests/api-docs.test.js`; Supertest tests with injected doubles: success, 400, 401, 403 (+
   DENY), 404, pagination bounds, CSRF on changes, transaction rollback for both insert and
   delete. Run `cd server; npm run check`.
10. ✅ **No workflow, no XXPHP_WORKFLOW, no email/SMTP, no status transitions, no PDF** in this
    phase — `STATUS` is just a stored field written as `'Incomplete'`.

---

## 11. Workflow / approval — explicitly OUT (verified absent in legacy)

For the record (so nobody "adds it back"): the legacy Employment Offer module contains **zero**
workflow integration — no `callXXPHP_WORKFLOW`, no `Zmailer`, no mail, no approval steps, and no
form code in `wf_form_codes()`. `XXPHP_WORKFLOW` is used only by *other* modules (Requisition,
Interview, Clearance, New-Hire Training) — do not touch them. The requisition lifecycle string
`'OFFER ACCEPTED'` in `Requisition_model.php` belongs to the **Requisition** module and is never
written by this module. Nothing in this API may send email or change any status.

---

## 12. AGENT PROMPT (copy-paste this to your coding assistant)

```text
You are helping me implement a change in the Zamil Digitalization repository
(GitHub: commonolivesofts-create/zamil-revamp). React 19 + Vite 8 frontend (client/) and
Node.js 24 + Express 5 ES-module backend (server/) over an existing Oracle Autonomous
Database schema. The repository is public.

MY TASK (backend-only — do not touch client/)
Implement the Employment Offer Form CRUD API, fully specified in
README_employment_offer_form.md at the repository root. Scope is strictly: INSERT, READ,
UPDATE, DELETE, and LISTING WITH FILTERS, plus the lookup/helper endpoints defined in that
file (candidates, titles, benefit allowances, number-to-arabic, hijri-date).
The legacy PHP (CodeIgniter 3) implementation exists only at C:\xampp\htdocs\zpil_codebase
(controllers/Emp_offer.php, models/emp_offer_model.php, views/ZPIL/emp_offer.php,
views/update/empoffer.php, views/ZPIL/emp_offer1.php) — use it ONLY to verify field
behaviour if the README is unclear.

EXPLICIT EXCLUSIONS
- NO workflow/approval/email logic of any kind: no XXPHP_WORKFLOW, no status transitions,
  no SMTP. STATUS is a write-once stored column set to 'Incomplete' on insert and used only
  as a list filter. (Verified: the legacy offer module has no workflow — see README §11.)
- No PDF/print rendering (legacy mPDF), no frontend work, no DDL/tables/sequences or schema
  changes (needs my explicit approval), no new dependencies.

READ BEFORE WRITING CODE (base every statement on files you actually read)
1. README_employment_offer_form.md — the authoritative spec: 2 tables, full column↔field
   mapping, payload, exact SQL for every operation, filter list, validation rules,
   lookups, known legacy quirks (PK-by-UUID readback, swapped BU labels, insert-only
   columns) — follow it exactly and flag conflicts instead of choosing silently.
2. README_interview_assessment_form.md — ONLY §8.5 (candidates query) is a contract for
   this module; do not implement anything else from it.
3. server/CLAUDE.md and server/docs/01-SYSTEM_ARCHITECTURE.md,
   02-API_DEVELOPMENT_STANDARDS.md, 03-ORACLE_DATABASE_ARCHITECTURE.md,
   06-ARCHITECTURE_DECISIONS_GUIDELINES.md (locked ADRs — do not work around them).
4. server/docs/DEVELOPER-MODULE-GUIDE.md — section 4 "Adding a backend module" is your
   step-by-step checklist; mirror the existing src/modules/users/ module end to end.
5. server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md, BACKEND-TESTING.md, and
   docs/FEATURE-DELIVERY-WORKFLOW.md (approval gates).

WHAT TO BUILD
- New feature folder src/modules/hr/employment-offers/ with
  employmentOffer.routes.js / .controller.js / .service.js / .repository.js /
  employmentOffer.validation.js (factory functions with injectable dependencies, exactly
  like the users module).
- Endpoints under /api/v1/hr/employment-offers:
    POST   /                  insert header + ONE line inside ONE withTransaction(POOLS.LOW):
                               insert header WITHOUT PK columns (UUID generated in Node),
                               read back HEADER_ID by UUID, insert line, commit; rollback on
                               failure. STATUS = 'Incomplete'.
    GET    /                  listing with filters + pagination + total (README §7.1 params;
                              allowlisted sortBy/sortOrder; OFFSET/FETCH; HR vs non-HR
                              scoping enforced server-side from req.auth — README §7.4)
    GET    /:headerId         read (header + single line; line may be null; 404 if no header)
    PUT    /:headerId         update header + line (README §5), one transaction, 404 if
                              absent, sqlRowCounts checked; do NOT update STATUS,
                              PROBATIONARY_PERIOD(_AR) or line ATTRIBUTE2
    DELETE /:headerId         delete line then header in one transaction; 404 if absent
    GET    /lookups/candidates | /titles | /allowances?type=... |
           /number-to-arabic?number= | /hijri-date?date=      (README §8 exact SQL)
- Guards in approved order on every route: authenticate → requireCsrfToken (unsafe) →
  authorize('HR.EMPLOYMENT_OFFERS', 'ACTION') → validate({ params, query, body });
  Cache-Control: no-store. Controllers thin; SQL ONLY in the repository with named bind
  variables; business rules only in the service; AppError for expected failures;
  sendSuccess / sendPaginated envelopes; IDs (NUMBER(19,0)) travel as strings; rows mapped
  to camelCase; explicit column lists (no SELECT *); reads and writes on POOLS.LOW.

RULES I WILL HOLD YOU TO
- Never invent tables, columns, endpoints, permissions or business rules — if the README and
  the real Oracle schema disagree, stop and ask me.
- The BU labels in README §8.9 are contradictory in the legacy views (FPP/IPP swapped):
  expose raw ids only; do not label them until I confirm.
- Reuse shared infrastructure only (config, logger, validate, AppError, apiResponse,
  withConnection/withTransaction); never read process.env, never console.*, no ORMs, no
  generic base repositories, no parallel helpers.
- Register the router in src/routes/api.routes.js (accepting deps.*Repository and db.* for
  tests), document every operation in server/docs/openapi/openapi.yaml in the same change,
  and add the routes to tests/api-docs.test.js.
- Permission codes (e.g. HR.EMPLOYMENT_OFFERS {VIEW, CREATE, EDIT, DELETE}) must be
  registered in the RBAC catalogue — tell me which codes you need and wait for my approval
  before assuming they exist; default-deny otherwise.
- Supertest + node:test tests with injected doubles: success paths, 400 validation, 401,
  403 (missing permission + DENY), 404, pagination bounds, CSRF on changes, and transaction
  rollback for insert and delete.
- Before writing code, list the exact files you will create/modify with full paths and why.
- Never claim tests pass unless you executed them: run `cd server; npm run check` and show
  the output; otherwise say "not executed".
- No credentials, wallet contents, .env values or real employee data anywhere.

Start by reading the documents above, then summarize your understanding of the spec and the
users module pattern, then propose your file list and endpoint contract before coding.
```
