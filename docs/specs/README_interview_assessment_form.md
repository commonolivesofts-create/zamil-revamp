# Interview Assessment Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the Interview Assessment Form —
> **Insert, Read, Update, Delete, and Listing with filters**, plus the lookup (dropdown) APIs the form needs.
> Workflow / approval-process details are **out of scope** and intentionally not documented here.
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
> - `controllers/Interview.php`
> - `models/Interview_model.php`
> - `views/ZPIL/interview_ass.php` (new form), `views/update/interview_as.php` (edit form, 4 tabs)
> - `views/ZPIL/interview_list.php` (listing page)
>
> **Database:** Oracle, schema/owner `XXZP`. All SQL below uses **bind variables** — never string-concatenate user input (the legacy code does; do not copy that habit).

---

## 1. Data Model

The form persists into **4 tables**, always keyed by the same `HEADER_ID`:

| # | Table | Relationship |
|---|---|---|
| 1 | `XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T` | Parent (1) |
| 2 | `XXZP.XXZP_PERSONAL_SPEC_T` | 1:1 with header via `HEADER_ID` |
| 3 | `XXZP.XXZP_JOB_COMPETENCY_T` | 1:1 with header via `HEADER_ID` |
| 4 | `XXZP.XXZP_INTERVIEW_EVAL_T` | 1:1 with header via `HEADER_ID` |

### 1.1 `XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T` (main/header)

| Column | Type (inferred) | Legacy form field | Notes |
|---|---|---|---|
| `HEADER_ID` | NUMBER PK | — | Generated: `NVL(MAX(HEADER_ID+1), 636)` (see §3.1) |
| `UUID` | VARCHAR2(45) | — | v4 UUID, generated server-side; used to re-fetch generated `HEADER_ID` |
| `INT_NO` | VARCHAR2(50) | `int_ass_no` (readonly) | `${ATTRIBUTE3}-${LPAD(HEADER_ID,3,'0')}` e.g. `300000003618177-636` |
| `CANDIDATE_NAME` | VARCHAR2(200) | `name` | required |
| `POSITION_NAME` | VARCHAR2(200) | `designation` | = requisition `JOB_NAME` / `XX_DIGI_JOB_MASTER.NAME` |
| `ATTRIBUTE4` | VARCHAR2(100) | `requisition_no` | **Requisition Number** (`XXZPI_PER_REQUISITIONS_ALL.REQUISITION_NUMBER`) |
| `ATTRIBUTE3` | VARCHAR2(100) | `payroll` (select) | BU / payroll id from `APP_BU_INFO`: `300000003618177` (IPP), `300000003618190` (FPP) |
| `NATIONALITY` | VARCHAR2(100) | `nationality` | from lookup `ES_NATIONALITY` |
| `MARITAL_STATUS` | VARCHAR2(30) | `material_status` (sic) | `Single` / `Married` |
| `AGE` | NUMBER | `age` | default `0`; must be > 0 |
| `INTERVIEW_DATE` | DATE | `date` | legacy stores format `DD-Mon-YY` (e.g. `25-Oct-2026`) |
| `INTERVIEW_TIME` | VARCHAR2(20) | `time` | optional |
| `INTERVIEW_TYPE` | VARCHAR2(30) | `type` | `Personal` / `Online` |
| `SECONDARY_EDUCATION` | VARCHAR2(100) | `education1` | `Secondary Education` / `Diploma` / `Degree` / `Masters Degree` |
| `SECONDARY_EDUCATION_CHK` | VARCHAR2(10) | `sec_education` | `Yes` / `No`, optional |
| `LAST_POSITION_HELD` | VARCHAR2(200) | `lst_pos_held` | |
| `COMPANY_NAME` | VARCHAR2(200) | `company` | |
| `RELEVANT_YEARS_EXPERIENCE` | NUMBER | `relevant_yr_exp` | default `0` |
| `LOCATION` | VARCHAR2(100) | `location` | |
| `CURR_EMPLOYER` | VARCHAR2(200) | `current_employer` | |
| `JOINING` | DATE | `joining` | expected joining date |
| `MAJOR` | VARCHAR2(100) | `major` | |
| `DIVISION` | VARCHAR2(30) | `division` | `Food` / `Non-Food` |
| `CUR_SAL_BASIC` | NUMBER | `cur_sal_basic` | |
| `EXP_SAL_BASIC` | NUMBER | `exp_sal_basic` | |
| `CUR_SAL_TOTAL` | NUMBER | `cur_sal_total` | |
| `EXP_SAL_TOTAL` | NUMBER | `exp_sal_total` | |
| `INTERVIEWED_BY` | VARCHAR2(200) | `interviewed_by` | employee full name |
| `INTERVIEWEDBY2` | VARCHAR2(200) | `interviewed_by1` | |
| `INTERVIEWEDBY3` | VARCHAR2(200) | `interviewed_by2` | |
| `PERSONAL_SPEC_TOTAL` | NUMBER | `rate9` | auto-sum of rate1..rate8; default `0` |
| `PERSONAL_SPEC_RESULT` | VARCHAR2(500) | `remarks` | overall remark |
| `JOB_COMPETENCY_TOTAL` | NUMBER | `c_rating7` | auto-sum of c_rating1..c_rating6; default `0` |
| `JOB_COMPETENCY_RESULT` | VARCHAR2(500) | `c_remarks` | overall remark |
| `STATUS` | VARCHAR2(30) | `status` (readonly) | data field: `Incomplete` on insert; later `Inprocess`/`Approved`/`Rejected` |
| `CREATED_BY` | NUMBER | session user id | legacy: session `FormsSession` |
| `CREATION_DATE` | DATE | — | server time |
| `LAST_UPDATED_BY` | NUMBER | — | |
| `LAST_UPDATE_LOGIN` | NUMBER | — | legacy sets it = updated-by user id |
| `LAST_UPDATE_DATE` | DATE | — | |

### 1.2 `XXZP.XXZP_PERSONAL_SPEC_T` (Tab 2 — 8 parameters)

| Columns | Legacy fields | Notes |
|---|---|---|
| `PERSONAL_SPEC_ID` (PK, NUMBER) | — | generated (`max+1`) in old code; keep if column exists |
| `HEADER_ID` (FK) | hidden `headers_id_personal` | |
| `SELF_CONFIDANCE_RATING` / `SELF_CONFIDANCE_REMARK` | `rate1` / `remark1` | |
| `ATTITUDE_RATING` / `ATTITUDE_REMARK` | `rate2` / `remark2` | |
| `GENERAL_KNOWLEDGE_RATING` / `GENERAL_KNOWLEDGE_REMARK` | `rate3` / `remark3` | |
| `EXPERIENCE_RATING` / `EXPERIENCE_REMARK` | `rate4` / `remark4` | |
| `LANGUAGE_FLUENCY_RATING` / `LANGUAGE_FLUENCY_REMARK` | `rate5` / `remark5` | |
| `COMMUNICATION_SKILL_RATING` / `COMMUNICATION_SKILL_REMARK` | `rate6` / `remark6` | |
| `SAFTY_AWARENESS_RATING` / `SAFTY_AWARENESS_REMARK` | `rate7` / `remark7` | (sic: SAFTY) |
| `PHYSICAL_HEALTH_RATING` / `PHYSICAL_HEALTH_REMARK` | `rate8` / `remark8` | |
| `CREATED_BY`, `CREATION_DATE`, `LAST_UPDATED_BY`, `LAST_UPDATE_LOGIN`, `LAST_UPDATE_DATE` | audit | |

**Rating values:** `"1"`, `"2"`, `"3"`, `"4"`, `"5"` or `"N/A"` (string). Empty → store `"-"`.
**Total:** sum of the numeric ratings only (skip `N/A`/empty) → header `PERSONAL_SPEC_TOTAL`. Range legend: 0–19 Poor, 20+ Good, 35+ Outstanding.

### 1.3 `XXZP.XXZP_JOB_COMPETENCY_T` (Tab 3 — 6 parameters)

| Columns | Legacy fields |
|---|---|
| `JOB_COMPETENCY_ID` (PK) | — |
| `HEADER_ID` (FK) | hidden `headers_id_competency` |
| `JOB_KNOWLEDGE_RATING` / `JOB_KNOWLEDGE_REMARK` | `c_rating1` / `c_remark1` |
| `LEADERSHIP_SKILLS_RATING` / `LEADERSHIP_SKILLS_REMARK` | `c_rating2` / `c_remark2` |
| `WORK_UNDER_PRESSURE_RATING` / `WORK_UNDER_PRESSURE_REMARK` | `c_rating3` / `c_remark3` |
| `NATION_CONFIRT_RATING` / `NATION_CONFIRT_REMARK` | `c_rating4` / `c_remark4` (sic: CONFIRT) |
| `SHIFTS_CONFIRT_RATING` / `SHIFTS_CONFIRT_REMARK` | `c_rating5` / `c_remark5` |
| `OVERTIME_CONFIRT_RATING` / `OVERTIME_CONFIRT_REMARK` | `c_rating6` / `c_remark6` |
| `STRENGTHS_SUMMARY` | `sum_strength` (textarea) |
| `WEAKNESSES_SUMMARY` | `sum_weekness` (textarea, sic) |
| audit columns | same as above |

**Total:** sum of c_rating1..c_rating6 → header `JOB_COMPETENCY_TOTAL`. Range legend: 0–14 Poor, 15+ Good, 25+ Outstanding.

### 1.4 `XXZP.XXZP_INTERVIEW_EVAL_T` (Tab 4 — Evaluation)

| Column | Legacy field | Notes |
|---|---|---|
| `EVALUATION_ID` (PK) | — | generated in old code |
| `HEADER_ID` (FK) | hidden `headers_id_evaluation` | |
| `STATUS` | radio `evaluation` | **required**, enum: `Passed` / `Hold` / `Failed` |
| `INTERVIEWED_BY` | `interviewed_by` | |
| `ADMIN_MANAGER` | `admin_mgr` | readonly on UI |
| `MANAGNING_DIRECTOR` | — (field removed from UI) | (sic: MANAGNING) |
| `HR_REP` | `hr_mgr` | |
| `ATTRIBUTE1` | `comment` | HR comment (free text) |
| `DEPT_REP` | `dept_rep` | |
| audit columns | | |

> Saving evaluation also mirrors into header: `INTERVIEWED_BY`, `INTERVIEWEDBY2`, `INTERVIEWEDBY3`, `ATTRIBUTE3`.

### 1.5 Related tables used by lookups / listing

- `XXZPI_PER_REQUISITIONS_ALL` — requisition dropdown (`REQUISITION_NUMBER`, `JOB_NAME`, `REQUISITION_STATUS='Approved'`, `REQUESTED_BY`)
- `XX_DIGI_JOB_MASTER` — `NAME` → `APPROVAL_AUTHORITY`
- `XX_DIGI_LOOKUP_VALUES` — `ES_NATIONALITY` (nationalities), `XXZP_HR` (HR user ids in `tag`)
- `XX_DIGI_EMP_MASTER` — employee full names (interviewer dropdowns), `REQUESTED_BY` → name/email

---

## 2. API Surface

Base path: `/api/interview-assessments`
Auth: bearer/session — `created_by` / `updated_by` come from the authenticated user (legacy used session `FormsSession`).

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/interview-assessments` | **Insert** (header + personal spec + competency + evaluation, one transaction) |
| `GET` | `/api/interview-assessments/:id` | **Read** one full record (4 tables) |
| `PUT` | `/api/interview-assessments/:id` | **Update** full record (all 4 tables) |
| `DELETE` | `/api/interview-assessments/:id` | **Delete** record (4 tables, one transaction) |
| `GET` | `/api/interview-assessments` | **List with filters** + pagination |
| `GET` | `/api/interview-assessments/lookups/nationalities` | nationality dropdown |
| `GET` | `/api/interview-assessments/lookups/requisitions` | requisition dropdown |
| `GET` | `/api/interview-assessments/lookups/employees` | interviewer dropdown |

Optional (mirrors the legacy tab-wise saves — only add if the frontend needs partial saves):

| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/api/interview-assessments/:id/hr` | update Tab 1 (header candidate info) |
| `PATCH` | `/api/interview-assessments/:id/personal-spec` | update Tab 2 |
| `PATCH` | `/api/interview-assessments/:id/competency` | update Tab 3 |
| `PATCH` | `/api/interview-assessments/:id/evaluation` | update Tab 4 |

**Universal responses**

```jsonc
// 200/201 success
{ "success": true, "data": { ... } }
// 404
{ "success": false, "message": "Interview assessment not found" }
// 400 validation
{ "success": false, "message": "Validation failed", "errors": ["candidateName is required"] }
```

---

## 3. INSERT — `POST /api/interview-assessments`

### 3.1 Generate the key

```sql
-- HEADER_ID (legacy behaviour: max+1, starting fallback 636)
SELECT NVL(MAX(HEADER_ID + 1), 636) AS ID
FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T;
```

- Run this **inside the same transaction** as the inserts (legacy concurrency caveat — if parallel users are expected, create an Oracle SEQUENCE and use it instead).
- Generate `UUID` in Node: `crypto.randomUUID()`.
- Generate `INT_NO`: `` `${attribute3}-${String(headerId).padStart(3, '0')}` `` (legacy: `$payroll . "-" . sprintf("%03d", $header_id)`).
- Date/time: `INTERVIEW_DATE`, `JOINING`, `CREATION_DATE` legacy format `'DD-Mon-YY'` — bind with the correct format (`TO_DATE(:interviewDate, 'DD-Mon-YY')` or set the session NLS format); `CREATION_DATE = SYSDATE`.

### 3.2 Payload (JSON)

```jsonc
{
  "candidateName": "John Doe",              // CANDIDATE_NAME (required)
  "requisitionNo": "REQ-1024",              // ATTRIBUTE4 (required)
  "positionName": "Machine Operator",       // POSITION_NAME (required)
  "attribute3": "300000003618177",           // ATTRIBUTE3 / payroll BU (required)
  "nationality": "Saudi",                   // NATIONALITY
  "materialStatus": "Single",               // MARITAL_STATUS: Single|Married (keep legacy typo at DB level)
  "age": 28,                                // AGE
  "interviewDate": "25-Oct-2026",           // INTERVIEW_DATE (DD-Mon-YY)
  "interviewTime": "10:00",                 // INTERVIEW_TIME (optional)
  "interviewType": "Online",                // INTERVIEW_TYPE: Personal|Online
  "secondaryEducation": "Degree",           // SECONDARY_EDUCATION
  "secondaryEducationChk": "Yes",           // SECONDARY_EDUCATION_CHK (optional)
  "lastPositionHeld": "Operator",           // LAST_POSITION_HELD
  "companyName": "Acme Co",                 // COMPANY_NAME
  "relevantYearsExperience": 4,             // RELEVANT_YEARS_EXPERIENCE
  "location": "Riyadh",                     // LOCATION
  "currentEmployer": "Acme Co",             // CURR_EMPLOYER
  "joining": "01-Nov-2026",                 // JOINING
  "major": "Mechanical",                    // MAJOR
  "division": "Food",                       // DIVISION: Food|Non-Food
  "curSalBasic": 5000, "expSalBasic": 7000, // salaries
  "curSalTotal": 6000, "expSalTotal": 8500,
  "interviewedBy": "Ali Smith",             // INTERVIEWED_BY
  "interviewedBy2": "Sara Khan",            // INTERVIEWEDBY2
  "interviewedBy3": "Omar Ali",             // INTERVIEWEDBY3
  "status": "Incomplete",                   // STATUS (default on insert)

  "personalSpec": {
    "rate1": "4", "remark1": "Good",        // SELF_CONFIDANCE_RATING/REMARK
    "rate2": "3", "remark2": "-",           // ATTITUDE_*
    "rate3": "N/A", "remark3": "-",         // GENERAL_KNOWLEDGE_*
    "rate4": "5", "remark4": "Strong",      // EXPERIENCE_*
    "rate5": "4", "remark5": "-",           // LANGUAGE_FLUENCY_*
    "rate6": "3", "remark6": "-",           // COMMUNICATION_SKILL_*
    "rate7": "2", "remark7": "-",           // SAFTY_AWARENESS_*
    "rate8": "5", "remark8": "-",           // PHYSICAL_HEALTH_*
    "rate9": 26,                            // → header PERSONAL_SPEC_TOTAL (server may recompute)
    "remarks": "Overall good"               // → header PERSONAL_SPEC_RESULT
  },

  "jobCompetency": {
    "cRating1": "4", "cRemark1": "-",       // JOB_KNOWLEDGE_*
    "cRating2": "3", "cRemark2": "-",       // LEADERSHIP_SKILLS_*
    "cRating3": "5", "cRemark3": "-",       // WORK_UNDER_PRESSURE_*
    "cRating4": "2", "cRemark4": "-",       // NATION_CONFIRT_*
    "cRating5": "4", "cRemark5": "-",       // SHIFTS_CONFIRT_*
    "cRating6": "3", "cRemark6": "-",       // OVERTIME_CONFIRT_*
    "cRating7": 21,                         // → header JOB_COMPETENCY_TOTAL
    "cRemarks": "Solid",                    // → header JOB_COMPETENCY_RESULT
    "sumStrength": "Team player",           // STRENGTHS_SUMMARY
    "sumWeekness": "None"                   // WEAKNESSES_SUMMARY (keep legacy spelling at DB level)
  },

  "evaluation": {
    "status": "Passed",                     // STATUS: Passed|Hold|Failed (required)
    "interviewedBy": "Ali Smith",           // INTERVIEWED_BY
    "adminManager": "Saad Al Essa",         // ADMIN_MANAGER
    "hrRep": "HR Manager",                  // HR_REP
    "deptRep": "Dept Rep",                  // DEPT_REP
    "comment": "Fit for role",              // ATTRIBUTE1 (HR comment)
    "managningDirector": null               // MANAGNING_DIRECTOR (not on UI)
  }
}
```

### 3.3 SQL — all four inserts, one transaction (`BEGIN … COMMIT`)

```sql
-- 1) HEADER
INSERT INTO XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
  (UUID, HEADER_ID, CANDIDATE_NAME, POSITION_NAME, NATIONALITY, MARITAL_STATUS, AGE,
   INTERVIEW_DATE, INTERVIEW_TIME, INTERVIEW_TYPE, SECONDARY_EDUCATION, SECONDARY_EDUCATION_CHK,
   LAST_POSITION_HELD, COMPANY_NAME, RELEVANT_YEARS_EXPERIENCE, INTERVIEWED_BY,
   PERSONAL_SPEC_TOTAL, PERSONAL_SPEC_RESULT, JOB_COMPETENCY_TOTAL, JOB_COMPETENCY_RESULT,
   CREATED_BY, CREATION_DATE, ATTRIBUTE3, ATTRIBUTE4, STATUS,
   INTERVIEWEDBY2, INTERVIEWEDBY3, INT_NO, LOCATION, CURR_EMPLOYER, JOINING, MAJOR, DIVISION,
   CUR_SAL_BASIC, EXP_SAL_BASIC, CUR_SAL_TOTAL, EXP_SAL_TOTAL)
VALUES
  (:uuid, :headerId, :candidateName, :positionName, :nationality, :maritalStatus, NVL(:age, 0),
   TO_DATE(:interviewDate, 'DD-Mon-YY'), :interviewTime, :interviewType, :secondaryEducation, :secondaryEducationChk,
   :lastPositionHeld, :companyName, NVL(:relevantYearsExperience, 0), :interviewedBy,
   NVL(:personalSpecTotal, 0), :personalSpecResult, NVL(:jobCompetencyTotal, 0), :jobCompetencyResult,
   :createdBy, SYSDATE, :attribute3, :requisitionNo, :status,
   :interviewedBy2, :interviewedBy3, :intNo, :location, :currentEmployer,
   TO_DATE(:joining, 'DD-Mon-YY'), :major, :division,
   :curSalBasic, :expSalBasic, :curSalTotal, :expSalTotal);
```

```sql
-- 2) PERSONAL SPEC
INSERT INTO XXZP.XXZP_PERSONAL_SPEC_T
  (HEADER_ID, SELF_CONFIDANCE_RATING, SELF_CONFIDANCE_REMARK,
   ATTITUDE_RATING, ATTITUDE_REMARK,
   GENERAL_KNOWLEDGE_RATING, GENERAL_KNOWLEDGE_REMARK,
   EXPERIENCE_RATING, EXPERIENCE_REMARK,
   LANGUAGE_FLUENCY_RATING, LANGUAGE_FLUENCY_REMARK,
   COMMUNICATION_SKILL_RATING, COMMUNICATION_SKILL_REMARK,
   SAFTY_AWARENESS_RATING, SAFTY_AWARENESS_REMARK,
   PHYSICAL_HEALTH_RATING, PHYSICAL_HEALTH_REMARK,
   CREATED_BY, CREATION_DATE)
VALUES
  (:headerId, :rate1, :remark1, :rate2, :remark2, :rate3, :remark3,
   :rate4, :remark4, :rate5, :remark5, :rate6, :remark6,
   :rate7, :remark7, :rate8, :remark8, :createdBy, SYSDATE);
```

```sql
-- 3) JOB COMPETENCY
INSERT INTO XXZP.XXZP_JOB_COMPETENCY_T
  (HEADER_ID, JOB_KNOWLEDGE_RATING, JOB_KNOWLEDGE_REMARK,
   LEADERSHIP_SKILLS_RATING, LEADERSHIP_SKILLS_REMARK,
   WORK_UNDER_PRESSURE_RATING, WORK_UNDER_PRESSURE_REMARK,
   NATION_CONFIRT_RATING, NATION_CONFIRT_REMARK,
   SHIFTS_CONFIRT_RATING, SHIFTS_CONFIRT_REMARK,
   OVERTIME_CONFIRT_RATING, OVERTIME_CONFIRT_REMARK,
   STRENGTHS_SUMMARY, WEAKNESSES_SUMMARY, CREATED_BY, CREATION_DATE)
VALUES
  (:headerId, :cRating1, :cRemark1, :cRating2, :cRemark2, :cRating3, :cRemark3,
   :cRating4, :cRemark4, :cRating5, :cRemark5, :cRating6, :cRemark6,
   :sumStrength, :sumWeekness, :createdBy, SYSDATE);
```

```sql
-- 4) EVALUATION
INSERT INTO XXZP.XXZP_INTERVIEW_EVAL_T
  (HEADER_ID, STATUS, INTERVIEWED_BY, ADMIN_MANAGER, MANAGNING_DIRECTOR,
   HR_REP, ATTRIBUTE1, DEPT_REP, CREATED_BY, CREATION_DATE)
VALUES
  (:headerId, :evalStatus, :evalInterviewedBy, :adminManager, :managningDirector,
   :hrRep, :comment, :deptRep, :createdBy, SYSDATE);
```

**Order of operations**
1. `BEGIN TRANSACTION`
2. Generate `HEADER_ID` (§3.1), `UUID`, `INT_NO`
3. Insert header → insert personal spec → insert competency → insert evaluation
4. `COMMIT`; on any error `ROLLBACK` and return 500.
5. **Response `201`:** `{ success: true, data: { headerId, intNo, uuid } }`

> Text defaults (legacy): empty string → `'-'` for text, `0` for numbers. Optional columns may be omitted if `NULL` is acceptable.

---

## 4. READ — `GET /api/interview-assessments/:id`

Returns header + all three child records combined into one object.

```sql
-- 4.1 Header
SELECT DISTINCT INT.*,
       (SELECT APPROVAL_AUTHORITY FROM XX_DIGI_JOB_MASTER WHERE NAME = INT.POSITION_NAME)
           AS APPROVAL_AUTHORITY
FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T INT
WHERE INT.HEADER_ID = :id;
```

```sql
-- 4.2 Personal spec
SELECT * FROM XXZP.XXZP_PERSONAL_SPEC_T
WHERE HEADER_ID = :id;
```

```sql
-- 4.3 Job competency
SELECT * FROM XXZP.XXZP_JOB_COMPETENCY_T
WHERE HEADER_ID = :id;
```

```sql
-- 4.4 Evaluation
SELECT * FROM XXZP.XXZP_INTERVIEW_EVAL_T
WHERE HEADER_ID = :id;
```

- If the header row is missing → `404`. Child rows may legitimately be missing (legacy forms could save header only) — return `null` for that section.
- **Response shape:** the same JSON payload as §3.2 plus `headerId`, `intNo`, `status`, `createdAt`, `updatedAt`.

---

## 5. UPDATE — `PUT /api/interview-assessments/:id`

Full update (equivalent of legacy `common_update`, which the edit form actually calls). All statements in **one transaction**. Every update sets the audit trio: `LAST_UPDATED_BY = :updatedBy`, `LAST_UPDATE_LOGIN = :updatedBy`, `LAST_UPDATE_DATE = SYSDATE`.

```sql
-- 5.1 Header / HR section (Tab 1)
UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
SET CANDIDATE_NAME = :candidateName,
    POSITION_NAME = :positionName,
    NATIONALITY = :nationality,
    MARITAL_STATUS = :maritalStatus,
    AGE = NVL(:age, 0),
    INTERVIEW_DATE = TO_DATE(:interviewDate, 'DD-Mon-YY'),
    INTERVIEW_TIME = :interviewTime,
    INTERVIEW_TYPE = :interviewType,
    SECONDARY_EDUCATION = :secondaryEducation,
    SECONDARY_EDUCATION_CHK = :secondaryEducationChk,
    LAST_POSITION_HELD = :lastPositionHeld,
    COMPANY_NAME = :companyName,
    RELEVANT_YEARS_EXPERIENCE = NVL(:relevantYearsExperience, 0),
    ATTRIBUTE4 = :requisitionNo,
    LOCATION = :location,
    CURR_EMPLOYER = :currentEmployer,
    JOINING = TO_DATE(:joining, 'DD-Mon-YY'),
    MAJOR = :major,
    DIVISION = :division,
    CUR_SAL_BASIC = :curSalBasic,
    EXP_SAL_BASIC = :expSalBasic,
    CUR_SAL_TOTAL = :curSalTotal,
    EXP_SAL_TOTAL = :expSalTotal,
    LAST_UPDATED_BY = :updatedBy,
    LAST_UPDATE_LOGIN = :updatedBy,
    LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;
```

```sql
-- 5.2 Personal spec (Tab 2)
UPDATE XXZP.XXZP_PERSONAL_SPEC_T
SET SELF_CONFIDANCE_RATING = :rate1,      SELF_CONFIDANCE_REMARK = :remark1,
    ATTITUDE_RATING = :rate2,             ATTITUDE_REMARK = :remark2,
    GENERAL_KNOWLEDGE_RATING = :rate3,    GENERAL_KNOWLEDGE_REMARK = :remark3,
    EXPERIENCE_RATING = :rate4,           EXPERIENCE_REMARK = :remark4,
    LANGUAGE_FLUENCY_RATING = :rate5,     LANGUAGE_FLUENCY_REMARK = :remark5,
    COMMUNICATION_SKILL_RATING = :rate6,  COMMUNICATION_SKILL_REMARK = :remark6,
    SAFTY_AWARENESS_RATING = :rate7,      SAFTY_AWARENESS_REMARK = :remark7,
    PHYSICAL_HEALTH_RATING = :rate8,      PHYSICAL_HEALTH_REMARK = :remark8,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;

-- totals live on the header:
UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
SET PERSONAL_SPEC_TOTAL = NVL(:personalSpecTotal, 0),
    PERSONAL_SPEC_RESULT = :personalSpecResult,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;
```

```sql
-- 5.3 Job competency (Tab 3)
UPDATE XXZP.XXZP_JOB_COMPETENCY_T
SET JOB_KNOWLEDGE_RATING = :cRating1,         JOB_KNOWLEDGE_REMARK = :cRemark1,
    LEADERSHIP_SKILLS_RATING = :cRating2,     LEADERSHIP_SKILLS_REMARK = :cRemark2,
    WORK_UNDER_PRESSURE_RATING = :cRating3,   WORK_UNDER_PRESSURE_REMARK = :cRemark3,
    NATION_CONFIRT_RATING = :cRating4,        NATION_CONFIRT_REMARK = :cRemark4,
    SHIFTS_CONFIRT_RATING = :cRating5,        SHIFTS_CONFIRT_REMARK = :cRemark5,
    OVERTIME_CONFIRT_RATING = :cRating6,      OVERTIME_CONFIRT_REMARK = :cRemark6,
    STRENGTHS_SUMMARY = :sumStrength,
    WEAKNESSES_SUMMARY = :sumWeekness,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;

UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
SET JOB_COMPETENCY_TOTAL = NVL(:jobCompetencyTotal, 0),
    JOB_COMPETENCY_RESULT = :jobCompetencyResult,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;
```

```sql
-- 5.4 Evaluation (Tab 4)
UPDATE XXZP.XXZP_INTERVIEW_EVAL_T
SET STATUS = :evalStatus,
    INTERVIEWED_BY = :evalInterviewedBy,
    ADMIN_MANAGER = :adminManager,
    MANAGNING_DIRECTOR = :managningDirector,
    HR_REP = :hrRep,
    ATTRIBUTE1 = :comment,
    DEPT_REP = :deptRep,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;

-- mirror interviewers + BU onto the header:
UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
SET INTERVIEWED_BY = :evalInterviewedBy,
    INTERVIEWEDBY2 = :interviewedBy2,
    INTERVIEWEDBY3 = :interviewedBy3,
    ATTRIBUTE3 = :attribute3,
    LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
WHERE HEADER_ID = :id;
```

**Rules**
- First verify existence: `SELECT HEADER_ID FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = :id` → else `404`.
- If a child row doesn't exist yet for that `HEADER_ID`, use **MERGE/INSERT** instead of UPDATE (legacy always assumed it exists):
  ```sql
  MERGE INTO XXZP.XXZP_PERSONAL_SPEC_T d
  USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
  ON (d.HEADER_ID = s.HEADER_ID)
  WHEN MATCHED THEN UPDATE SET ... (same assignments as §5.2, minus audit on no-op)
  WHEN NOT MATCHED THEN INSERT (columns...) VALUES (...);
  ```
  Repeat for `XXZP_JOB_COMPETENCY_T` and `XXZP_INTERVIEW_EVAL_T`.
- Run all statements in one transaction; check `sqlRowCounts` — if a header UPDATE affected 0 rows → `404`.
- **Response `200`:** `{ success: true, data: { headerId } }`

---

## 6. DELETE — `DELETE /api/interview-assessments/:id`

> The legacy PHP app has **no delete** for this form (it only deleted legacy workflow-receiver rows). For the new API, deleting must remove **all 4 rows** in one transaction.

```sql
DELETE FROM XXZP.XXZP_INTERVIEW_EVAL_T       WHERE HEADER_ID = :id;
DELETE FROM XXZP.XXZP_JOB_COMPETENCY_T       WHERE HEADER_ID = :id;
DELETE FROM XXZP.XXZP_PERSONAL_SPEC_T        WHERE HEADER_ID = :id;
DELETE FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = :id;
```

**Rules**
- Before deleting, select the header (§4.1) to confirm it exists → `404` if not.
- Recommended guard: **refuse to delete when the record matters downstream** — the Employment Offer form consumes rows with `STATUS = 'Approved'` and evaluation `Passed` (§8.3). Return `409 { message: "Cannot delete an approved interview assessment" }` for such records (unless the caller is an admin — decide policy with the team).
- `BEGIN` → deletes → `COMMIT`; rollback on error.
- **Response:** `200 { success: true, data: { headerId, deleted: true } }`

---

## 7. LISTING WITH FILTERS — `GET /api/interview-assessments`

### 7.1 Query parameters

| Param | Type | Maps to | Notes |
|---|---|---|---|
| `page` | int (default 1) | — | 1-based |
| `pageSize` | int (default 20, max 100) | — | legacy DataTables default `pageLength: 20` |
| `search` | string | `CANDIDATE_NAME`, `INT_NO`, `POSITION_NAME` | case-insensitive partial match |
| `status` | string | `INV.STATUS` | `Incomplete` \| `Inprocess` \| `Approved` \| `Rejected` |
| `evaluationStatus` | string | `EVAL.STATUS` | `Passed` \| `Hold` \| `Failed` |
| `requisitionNo` | string | `INV.ATTRIBUTE4` | exact |
| `positionName` | string | `INV.POSITION_NAME` | exact or partial |
| `division` | string | `INV.DIVISION` | `Food` \| `Non-Food` |
| `interviewType` | string | `INV.INTERVIEW_TYPE` | `Personal` \| `Online` |
| `dateFrom` | date | `INV.INTERVIEW_DATE` | `>=` |
| `dateTo` | date | `INV.INTERVIEW_DATE` | `<=` |
| `createdBy` | number | `INV.CREATED_BY` | server-side scoping (§7.4) |
| `sortBy` | string | whitelist | `HEADER_ID` (default, desc), `INTERVIEW_DATE`, `CANDIDATE_NAME`, `CREATION_DATE` |
| `sortDir` | `asc`\|`desc` | — | default `desc` |

### 7.2 Base query (filters are appended as `AND` clauses)

```sql
SELECT DISTINCT
       INV.HEADER_ID,
       INV.CANDIDATE_NAME,
       INV.POSITION_NAME,
       INV.NATIONALITY,
       INV.INTERVIEW_DATE,
       INV.INT_NO,
       INV.ATTRIBUTE4                 AS REQUISITION_NO,
       INV.DIVISION,
       INV.INTERVIEW_TYPE,
       INV.CREATED_BY,
       INV.CREATION_DATE,
       INV.STATUS                     AS HEADER_STATUS,
       EVAL.STATUS                    AS EVALUATION_STATUS
FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T INV
JOIN XXZP.XXZP_INTERVIEW_EVAL_T EVAL
  ON EVAL.HEADER_ID = INV.HEADER_ID
WHERE 1 = 1
  /* --- dynamic filters --- */
  AND (:search IS NULL OR UPPER(INV.CANDIDATE_NAME) LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(INV.INT_NO)        LIKE '%'||UPPER(:search)||'%'
                       OR UPPER(INV.POSITION_NAME) LIKE '%'||UPPER(:search)||'%')
  AND (:status IS NULL OR UPPER(INV.STATUS) = UPPER(:status))
  AND (:evaluationStatus IS NULL OR UPPER(EVAL.STATUS) = UPPER(:evaluationStatus))
  AND (:requisitionNo IS NULL OR UPPER(INV.ATTRIBUTE4) = UPPER(:requisitionNo))
  AND (:positionName IS NULL OR UPPER(INV.POSITION_NAME) LIKE '%'||UPPER(:positionName)||'%')
  AND (:division IS NULL OR UPPER(INV.DIVISION) = UPPER(:division))
  AND (:interviewType IS NULL OR UPPER(INV.INTERVIEW_TYPE) = UPPER(:interviewType))
  AND (:dateFrom IS NULL OR INV.INTERVIEW_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD'))
  AND (:dateTo   IS NULL OR INV.INTERVIEW_DATE <  TO_DATE(:dateTo, 'YYYY-MM-DD') + 1)
  AND (:createdBy IS NULL OR INV.CREATED_BY = :createdBy)
ORDER BY
  CASE WHEN :sortBy = 'HEADER_ID'       AND UPPER(:sortDir)='DESC' THEN INV.HEADER_ID       END DESC,
  CASE WHEN :sortBy = 'HEADER_ID'       AND UPPER(:sortDir)='ASC'  THEN INV.HEADER_ID       END ASC,
  CASE WHEN :sortBy = 'INTERVIEW_DATE'  AND UPPER(:sortDir)='DESC' THEN INV.INTERVIEW_DATE  END DESC,
  CASE WHEN :sortBy = 'INTERVIEW_DATE'  AND UPPER(:sortDir)='ASC'  THEN INV.INTERVIEW_DATE  END ASC,
  CASE WHEN :sortBy = 'CANDIDATE_NAME'  AND UPPER(:sortDir)='ASC'  THEN INV.CANDIDATE_NAME  END ASC,
  CASE WHEN :sortBy = 'CANDIDATE_NAME'  AND UPPER(:sortDir)='DESC' THEN INV.CANDIDATE_NAME  END DESC,
  CASE WHEN :sortBy = 'CREATION_DATE'   AND UPPER(:sortDir)='DESC' THEN INV.CREATION_DATE   END DESC,
  CASE WHEN :sortBy = 'CREATION_DATE'   AND UPPER(:sortDir)='ASC'  THEN INV.CREATION_DATE   END ASC
```

> Implementation tips:
> - In `oracledb` (Node), use **one named bind per distinct param name** and bind `null` for unused filters — the `IS NULL` guards work with `bindByName: true`.
> - For pagination use Oracle 12c+ `OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY` after `ORDER BY` (or `ROWNUM` wrapping for older DBs). `offset = (page - 1) * pageSize`.
> - Also run a count query for the total:
>   ```sql
>   SELECT COUNT(DISTINCT INV.HEADER_ID) AS TOTAL
>   FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T INV
>   JOIN XXZP.XXZP_INTERVIEW_EVAL_T EVAL ON EVAL.HEADER_ID = INV.HEADER_ID
>   WHERE <same dynamic conditions as above, without ORDER BY>;
>   ```

### 7.3 Response

```jsonc
{
  "success": true,
  "data": {
    "total": 137,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "headerId": 636,
        "intNo": "300000003618177-636",
        "candidateName": "John Doe",
        "positionName": "Machine Operator",
        "nationality": "Saudi",
        "interviewDate": "25-Oct-2026",
        "requisitionNo": "REQ-1024",
        "division": "Food",
        "interviewType": "Online",
        "headerStatus": "Inprocess",
        "statusLabel": "InProcess",        // display mapping below
        "evaluationStatus": null,          // filled only when headerStatus === 'Approved' (legacy UI behaviour)
        "createdBy": 9311,
        "creationDate": "2026-10-20"
      }
    ]
  }
}
```

**Status display mapping (legacy `interview_list.php`):**

| DB `STATUS` | `statusLabel` |
|---|---|
| `Inprocess` | `InProcess` |
| `Approved` | `Approved` |
| `Rejected` | `Rejected` |
| anything else (incl. `Incomplete`) | `Draft` |

### 7.4 Access scoping (who sees which rows)

Legacy listing scopes rows by HR membership (query against `XX_DIGI_LOOKUP_VALUES`):

```sql
-- returns rows if the user is an HR user:
SELECT LOOKUP_CODE, MEANING, DESCRIPTION, TAG
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'XXZP_HR'
  AND TAG = :userId;
```

- **HR user** (rows returned): no extra predicate → sees **all** records.
- **Non-HR user**: add `AND INV.CREATED_BY = :userId` to §7.2 (even if the caller didn't pass `createdBy` — enforce server-side, never trust the query param alone).

---

## 8. LOOKUP APIs (needed by the form & listing filters)

### 8.1 Nationalities
```sql
SELECT DISTINCT MEANING
FROM XX_DIGI_LOOKUP_VALUES
WHERE LOOKUP_TYPE = 'ES_NATIONALITY'
  AND LANGUAGE = 'US'
ORDER BY MEANING;
```

### 8.2 Approved requisitions (with position)
```sql
SELECT DISTINCT REQUISITION_NUMBER, JOB_NAME
FROM XXZPI_PER_REQUISITIONS_ALL
WHERE REQUISITION_STATUS = 'Approved'
ORDER BY 1 DESC;
```

### 8.3 Employee names (interviewer datalists)
```sql
SELECT DISTINCT FULL_NAME
FROM XX_DIGI_EMP_MASTER
WHERE CURRENT_EMP_FLAG = 'Y'
  AND TRUNC(SYSDATE) BETWEEN PAAF_EFFECTIVE_START_DATE AND PAAF_EFFECTIVE_END_DATE
ORDER BY 1;
```

### 8.4 Requisition requester (if the form needs it)
```sql
SELECT FULL_NAME, EMAIL_ADDRESS
FROM XX_DIGI_EMP_MASTER
WHERE EMPLOYEE_NUMBER IN (
  SELECT REQUESTED_BY
  FROM XXZPI_PER_REQUISITIONS_ALL REQ
  WHERE REQUISITION_NUMBER = :requisitionNo
    AND JOB_NAME = :positionName
);
```

### 8.5 Approved + Passed candidates (consumed by the Employment Offer form — keep this query working; do not break it)
```sql
SELECT IAHT.HEADER_ID, IAHT.INT_NO, IAHT.CANDIDATE_NAME, IAHT.POSITION_NAME, IAHT.ATTRIBUTE4
FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T IAHT,
     XXZP.XXZP_INTERVIEW_EVAL_T IVT
WHERE IAHT.HEADER_ID = IVT.HEADER_ID
  AND IAHT.STATUS = 'Approved'
  AND IVT.STATUS = 'Passed'
ORDER BY 5 DESC;
```

---

## 9. Validation Rules (API must enforce — legacy mostly didn't)

| Field | Rule |
|---|---|
| `candidateName` | required, string, max 200 |
| `requisitionNo` | required, must exist in `XXZPI_PER_REQUISITIONS_ALL` with `REQUISITION_STATUS='Approved'` |
| `positionName` | required, max 200 |
| `attribute3` (payroll) | required, one of `APP_BU_INFO` values (`300000003618177`, `300000003618190`) |
| `age` | integer ≥ 0 (legacy UI blocked `<= 0`; DB default `0`) |
| `interviewDate`, `joining` | valid date, format `DD-Mon-YY` at DB level (accept ISO `YYYY-MM-DD` from React and convert) |
| `materialStatus` | `Single` \| `Married` |
| `interviewType` | `Personal` \| `Online` |
| `division` | `Food` \| `Non-Food` |
| `secondaryEducation` | `Secondary Education` \| `Diploma` \| `Degree` \| `Masters Degree` |
| ratings `rate1..8`, `cRating1..6` | `1`–`5` or `N/A` |
| `rate9`, `cRating7` | number; **recompute server-side** as sum of numeric ratings (ignore `N/A`) |
| `evaluation.status` | required on insert: `Passed` \| `Hold` \| `Failed` |
| all strings | trim; empty text → `'-'`, empty numbers → `0` (legacy defaults) |

---

## 10. Implementation Checklist for the Agent

1. ✅ Oracle connection (`oracledb`), **bind variables everywhere**, autoCommit off for multi-statement operations.
2. ✅ 5 core endpoints: `POST`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /` (list) + 3 lookup endpoints.
3. ✅ Insert & Update & Delete each run inside a **single transaction** covering all 4 tables; rollback on any failure.
4. ✅ Generate `HEADER_ID` (max+1 / sequence), `UUID` (crypto.randomUUID), `INT_NO` (`${attribute3}-${padded id}`).
5. ✅ `created_by` / `updated_by` from authenticated user (not request body).
6. ✅ List endpoint: server-side filters from §7.1, pagination, `total` count, status label mapping, HR/non-HR scoping.
7. ✅ Validation per §9 returning `400` with an `errors` array.
8. ✅ Keep exact legacy column spellings (`MARITAL_STATUS` field `material_status`, `SAFTY_AWARENESS_*`, `NATION_CONFIRT_*`, `WEAKNESSES_SUMMARY` from `sumWeekness`, `MANAGNING_DIRECTOR`) — renaming requires a DB migration, which is out of scope.
9. ✅ Do **not** add workflow/approval logic in this phase — `STATUS` is just a stored field you write (`Incomplete` on insert) and filter on.
10. ✅ Preserve query §8.5 behaviour (downstream Employment Offer form reads approved+passed candidates).
