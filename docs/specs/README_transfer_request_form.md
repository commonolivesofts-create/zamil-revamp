# Transfer Request Form — Backend API README (React + Node.js Revamp)

> **Scope of this document:** Only the CRUD APIs for the **Transfer Request Form** (document
> control `ZPI.TCN.FM.01`; workflow form code `TSF`) — **Insert, Read, Update, Delete, and Listing
> with filters**, plus the lookup (dropdown / auto-fill) APIs and the **form flow** (conditional
> visibility rules — §7). **Workflow / approval / email logic is explicitly OUT of scope** — this
> module has workflow (`controllers/TransferFlow.php`, `XXPHP_WORKFLOW`, Zmailer approve/reject
> links); everything workflow-related is catalogued in §9 and must NOT be implemented. **Print is
> out of scope** (the legacy form only calls `window.print()`).
>
> **Legacy source of truth (PHP/CodeIgniter, for reference only):**
>
> - `controllers/Transferform.php` (`class Transferform`; methods: `index`, `inserttransferform`,
>   `editTransferRequest`, `updatetransferform`, `transferreport`, `getDepartmentFromTitle`, `zamil_training`)
> - `models/transfer_model.php` (all SQL: `insertTransferForm`, `updatetransferform`,
>   `getTransferRequestsDataForReport`, `getTransformRecordbyID`, `ifExistTransferRequest`,
>   `getAllLovForTransferForm`, `getEmp`, `getRequestedBy`, `getFormUserDetails`, `getHeaderIDfortransfer`, …)
> - `views/Transfer_form/trans_form.php` (create form), `views/Transfer_form/editTransferForm.php`
>   (edit form), `views/Transfer_form/trans_report.php` (listing/report page)
> - `controllers/Data.php` + `Data_model.getEmpDetails2()` — the **employee auto-fill endpoint** the form calls
> - `controllers/TransferFlow.php` (workflow engine — excluded), `views/Transfer_form/wf_temp.php`
>   and `wf_first_history.php` (workflow email partials — excluded)
> - Legacy duplicates **not** loaded by the current module: `views/editTransferForm.php` +
>   `views/transferRequestReport.php` (rendered from `Welcome.php`), `Data.php::inserttransferform`
>   (old insert-with-emails path)
>
> **Database:** Oracle, schema `XXZP`; the table is `XXZP.XXZP_TRANSFER_REQUEST` (legacy writes it
> lowercase: `XXZP.xxzp_transfer_request`). Lookups come from `XX_DIGI_EMP_MASTER` and
> `XX_DIGI_LOOKUP_VALUES` on the default connection. All SQL below uses **bind variables** — never
> string-concatenate user input (the legacy code does; do not copy that habit).
>
> **Related specs (repository root):** `README_personal_status_change_form.md`,
> `README_orientation_training_form.md`, `README_employee_report_form.md` — same structure and
> conventions. Do not implement workflow from anywhere.

---

## 1. Data Model

**One writable table** for the whole form (header = the form). All lookups are read-only.

| #   | Table                             | Role                                                        |
| --- | --------------------------------- | ----------------------------------------------------------- |
| 1   | `XXZP.XXZP_TRANSFER_REQUEST`      | The transfer request (1 row per request)                    |
| 2   | `XX_DIGI_EMP_MASTER`              | Employee/job/section/department/director lookups + auto-fill |
| 3   | `XX_DIGI_LOOKUP_VALUES`           | `BLOOD_TYPE` LOV and the `XXZP_HR` scoping tag (§3.1)        |

### 1.1 `XXZP.XXZP_TRANSFER_REQUEST`

Union of the create form (`trans_form.php`), the edit form (`editTransferForm.php`), and the model
SQL (`insertTransferForm`, `updatetransferform`, `getTransferRequestsDataForReport`). Types are
inferred — confirm against the real table before coding.

| Column                | Type (inferred) | Legacy form field    | Notes                                                                |
| --------------------- | --------------- | -------------------- | -------------------------------------------------------------------- |
| `HEADER_ID`           | NUMBER PK       | hidden `header_hidden` | **DB-generated** — the INSERT omits it entirely (§5.3); read back by `UUID` |
| `UUID`                | VARCHAR2(36)    | —                    | v4, generated in PHP (`uuid_v4()`)                                   |
| `PLANT`               | VARCHAR2        | `drpSP` (select)     | `'Zamil Plastic Non-Food'` (default) \| `'Zamil Plastic Food'`       |
| `REQUESTED_BY`        | VARCHAR2        | `request_by`         | prefilled from session user's `FULL_NAME`; readonly on edit          |
| `DEPT_MGR_NO`         | NUMBER          | `emp_no`             | session user's `EMPLOYEE_NUMBER`; readonly on edit                   |
| `SIGNATURE`           | VARCHAR2        | `signature` (Approval box) | **write-only garbage:** `'Approved'` on insert, literal `'SIGNATURE'` on update (§8.4) |
| `MGR_DATE`            | DATE `DD-MON-RR`| `mdate`              | request date, defaults to today (editable)                           |
| `C_EMP_NO`            | NUMBER          | `cemp_no`            | auto-filled from employee dropdown                                   |
| `C_EMPLOYEE_NAME`     | VARCHAR2        | `emp_name` (select)  | dropdown of **all** `FULL_NAME` values in the master                 |
| `C_DATE_OF_JOINING`   | DATE `DD-MON-RR`| `doj`                | auto-filled (`START_DATE`); insert default `'01-Jan-2000'` when empty |
| `C_JOB_TITLE`         | VARCHAR2        | `j_title`            | auto-filled (`JOB_TITLE`)                                            |
| `C_DEPT`              | VARCHAR2        | `dept`               | auto-filled = org name with `Section` stripped                       |
| `C_SECTION`           | VARCHAR2        | `section`            | auto-filled = full org name                                          |
| `T_JOB_TITLE`         | VARCHAR2        | `cj_title_name`      | **required** (create), datalist from jobs LOV                        |
| `T_DEPT`              | VARCHAR2        | `j_dept_name`        | **required** (create), datalist from a **hardcoded PHP array** of 11 departments (§6.5) |
| `T_SECTION`           | VARCHAR2        | `esection_name`      | **required** (create), datalist from sections LOV (edit form: plain text input) |
| `T_EFFECTIVE_DATE`    | DATE `DD-MON-RR`| `edate`              | **required** (create only — edit has no `required`)                  |
| `T_BLOOD_TYPE`        | VARCHAR2        | `b_type_name`        | **required** (create), datalist `BLOOD_TYPE` (edit: text + datalist) |
| `T_DIRECT_SUPERIOR_NO`| NUMBER          | `dse_no`             | readonly; = selected director's `EMPLOYEE_NUMBER`                    |
| `T_DIRECT_SUPERIOR_NAME` | VARCHAR2     | `ds_name_hidden`     | hidden; = selected director's display name                           |
| `T_CHANGE_SALARY`     | VARCHAR2        | `salary` (radio)     | `'Yes'` \| `'No'`, **required** on create                            |
| `T_BUDGET_SALARY`     | VARCHAR2        | `b_salary` (radio)   | `'Yes'` \| `'No'`, **required** on create                            |
| `TRANSFER_DEPT_HEAD`  | VARCHAR2        | — (approval cell)    | workflow cell "Transferred Department Head New"; `'Draft'` on insert |
| `ADMIN_SIGNATURE`     | VARCHAR2        | **both** `a_manager` input **and** approval cell "Transferred Department Head Old" | **double-booked column** (§7.8, §8.5) |
| `PRESIDENT`           | VARCHAR2        | — (approval cell)    | workflow cell "Director of Transfer Department New"; `'Draft'` on insert |
| `HR_MANAGER`          | VARCHAR2        | — (approval cell)    | workflow cell "HR & Admin Manager"; `'Draft'` on insert              |
| `GENERAL_MANAGER`     | VARCHAR2        | — (approval cell)    | workflow cell "General Manager"; `'Draft'` on insert                 |
| `VP`                  | VARCHAR2        | — (approval cell)    | workflow cell "Finance & Shared Services VP" — **removed from the UI** (commented "Remove Khaled VP") |
| `VP_SS`               | VARCHAR2        | —                    | written `'Draft'` on insert, **never displayed anywhere** (orphan)   |
| `HR_SIGNATURE`        | VARCHAR2        | `hr_signature`       | "For IT & HR Department Use Only" — manually typed approval          |
| `IT_SIGNATURE`        | VARCHAR2        | `it_manger`          | same section                                                        |
| `ADMIN_SIGNATURE` (input use) | (see above) | `a_manager`      | same section — shares its column with the approval cell             |
| `HR_DATE`             | DATE `DD-MON-RR`| `fdate`              | empty → `NULL` on insert, `'01-Jan-70'` on update (§8.6)             |
| `IT_DATE`             | DATE `DD-MON-RR`| `it_date`            | same                                                                 |
| `ADMIN_DATE`          | DATE `DD-MON-RR`| `adate`              | same                                                                 |
| `CREATED_BY`          | NUMBER          | —                    | audit = authenticated user id (session `FormsSession`)               |
| `STATUS`              | VARCHAR2        | —                    | **server-owned**; `'Draft'` on insert; workflow writes `Inprocess` / `Approved` / `Rejected` / `Accepted` |

**No `UPDATED_BY` / `UPDATED_AT` audit columns exist** — the update path writes only form fields.
The API should add them only if the DBA agrees (flagged in §5.6).

---

## 2. API Surface

Base path: `/api/v1/hr/transfer-requests`
Auth: session (`authenticate`); `created_by` from `req.auth` — never the body.

| Method   | Endpoint                                      | Permission Code                         | Purpose                                                     |
| -------- | --------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `POST`   | `/api/v1/hr/transfer-requests`                | `HR.TRANSFER_REQUESTS.CREATE`           | **Insert** one request (server owns id/uuid/status/audit)   |
| `GET`    | `/api/v1/hr/transfer-requests/:headerId`      | `HR.TRANSFER_REQUESTS.VIEW`             | **Read** one request (full form record)                     |
| `PUT`    | `/api/v1/hr/transfer-requests/:headerId`      | `HR.TRANSFER_REQUESTS.UPDATE`           | **Update** one request (guard per §5.6)                     |
| `DELETE` | `/api/v1/hr/transfer-requests/:headerId`      | `HR.TRANSFER_REQUESTS.DELETE`           | **Delete** the row (hard delete; legacy has none — §4.2)    |
| `GET`    | `/api/v1/hr/transfer-requests`                | `HR.TRANSFER_REQUESTS.VIEW`             | **Listing with filters** + pagination + HR scoping (§3)     |
| `GET`    | `.../lookups/employees`                       | `HR.TRANSFER_REQUESTS.VIEW`             | employee-name dropdown (§6.1)                               |
| `GET`    | `.../lookups/employees/:name`                 | `HR.TRANSFER_REQUESTS.VIEW`             | **auto-fill payload** (§6.2)                                |
| `GET`    | `.../lookups/jobs` / `sections` / `departments` / `directors` / `blood-types` | `HR.TRANSFER_REQUESTS.VIEW` | form dropdowns (§6.3–§6.6)              |
| `GET`    | `.../lookups/requestor`                       | `HR.TRANSFER_REQUESTS.VIEW`             | session user's name + employee number (§6.7)                |

**Route order:** register `/lookups/...` routes **before** `/:headerId`.

**Universal responses**

```jsonc
{ "success": true, "data": { ... } }                          // 200 / 201
{ "success": false, "message": "Transfer request not found" } // 404
{ "success": false, "message": "Validation failed", "errors": [...] } // 400
{ "success": false, "message": "Cannot update request while it is In Process" } // 409
```

---

## 3. `GET /api/v1/hr/transfer-requests` — Listing with filters

The legacy report (`trans_report.php` + `getTransferRequestsDataForReport()`) selects rows (with
built-in **HR/non-HR scoping**) and lets DataTables filter client-side. Row click navigates to
`Transferform/editTransferRequest/:headerId`.

### 3.1 Scoping (this module HAS a legacy rule — implement it)

```sql
-- is the current user tagged HR?
SELECT TAG FROM XX_DIGI_LOOKUP_VALUES WHERE LOOKUP_TYPE = 'XXZP_HR'
```

- **HR user** (`user id` matches a `TAG` row) → sees **all** requests.
- **Everyone else** → sees only `CREATED_BY = <session user id>`.
- Legacy also hardcodes one bypass user (`$allowed_users = ['300000004800434']`) — **do not port
  the magic number**; if a service/bypass account is needed, make it configuration (§8.11).

### 3.2 Filters (query parameters)

| Param        | Type            | Matches                                        | Legacy source                 |
| ------------ | --------------- | ---------------------------------------------- | ----------------------------- |
| `search`     | string          | `REQUESTED_BY`, `C_EMPLOYEE_NAME`, `C_EMP_NO`, `T_JOB_TITLE` (case-insensitive `LIKE`) | DataTables global search |
| `status`     | string          | `STATUS` (exact, case-insensitive)             | Status column                 |
| `plant`      | enum            | `PLANT` (exact)                                | header plant select           |
| `transferDept` | string        | `T_DEPT` (exact)                               | "Transfer Department" column  |
| `currentDept`  | string        | `C_DEPT` (exact)                               | "Current Department" column   |
| `jobTitle`   | string          | `T_JOB_TITLE` (exact)                          | "Transfer Job Title" column   |
| `date_from`  | `YYYY-MM-DD`    | `MGR_DATE >= date_from` (inclusive)            | new (was client-side sorting) |
| `date_to`    | `YYYY-MM-DD`    | `MGR_DATE <= date_to` (inclusive)              | new                            |
| `page`       | number ≥ 1      | default 1                                      | DataTables paging             |
| `pageSize`   | number 1–100    | default 25                                     | `pageLength` default          |
| `sort`       | enum            | `headerId \| requestedBy \| empName \| currentJob \| transferJob \| status \| mgrDate` | click-to-sort headers |
| `order`      | `asc` \| `desc` | default `desc` (legacy `ORDER BY 1 DESC`)      |                                |

### 3.3 Listing SQL (bind variables; scope predicate added server-side)

```sql
SELECT TSF.HEADER_ID,
       TSF.PLANT,
       TSF.REQUESTED_BY,
       TSF.MGR_DATE,
       TSF.C_EMPLOYEE_NAME,
       TSF.C_EMP_NO,
       TSF.C_JOB_TITLE,
       TSF.C_DEPT,
       TSF.T_JOB_TITLE,
       TSF.T_DEPT,
       TSF.T_EFFECTIVE_DATE,
       TSF.T_DIRECT_SUPERIOR_NAME,
       TSF.STATUS,
       TSF.CREATED_BY
  FROM XXZP.XXZP_TRANSFER_REQUEST TSF
 WHERE (UPPER(TSF.REQUESTED_BY)     LIKE UPPER(:search) OR
        UPPER(TSF.C_EMPLOYEE_NAME)  LIKE UPPER(:search) OR
        UPPER(TSF.T_JOB_TITLE)      LIKE UPPER(:search) OR
        TO_CHAR(TSF.C_EMP_NO)       LIKE :search)
   AND (UPPER(TSF.STATUS) = UPPER(:status)     OR :status IS NULL)
   AND (TSF.PLANT = :plant                     OR :plant IS NULL)
   AND (TSF.T_DEPT = :transferDept             OR :transferDept IS NULL)
   AND (TSF.C_DEPT = :currentDept              OR :currentDept IS NULL)
   AND (TSF.T_JOB_TITLE = :jobTitle            OR :jobTitle IS NULL)
   AND (TSF.MGR_DATE >= TO_DATE(:date_from, 'YYYY-MM-DD') OR :date_from IS NULL)
   AND (TSF.MGR_DATE <= TO_DATE(:date_to,   'YYYY-MM-DD') OR :date_to IS NULL)
   AND (:is_hr = 1 OR TSF.CREATED_BY = :user_id)          -- §3.1
 ORDER BY :sort :order, TSF.HEADER_ID DESC
OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY;

-- total count: same predicates, no ORDER BY / OFFSET
SELECT COUNT(*) FROM XXZP.XXZP_TRANSFER_REQUEST TSF WHERE ...;
```

**Do not** reproduce the legacy report's `DAYS_OPEN`, `LAST_ACTION` or `PENDING_AT` subqueries —
they read `XXPHP_WORKFLOW` (workflow, §9).

### 3.4 Response shape

```jsonc
{
  "success": true,
  "data": {
    "meta": { "page": 1, "pageSize": 25, "total": 64, "sort": "headerId", "order": "desc" },
    "rows": [
      {
        "headerId": 412, "plant": "Zamil Plastic Non-Food",
        "requestedBy": "KHALED, ALI", "mgrDate": "2026-10-29",
        "empName": "AHMED, SAMI", "empNo": 4321,
        "currentJob": "Machine Operator", "currentDept": "Production Department",
        "transferJob": "Senior Operator", "transferDept": "Maintenance Department",
        "effectiveDate": "2026-11-15", "superiorName": "KHALID, OMAR",
        "status": "Draft"
      }
    ]
  }
}
```

---

## 4. Read and Delete

### 4.1 Read — `GET /api/v1/hr/transfer-requests/:headerId`

Legacy: `editTransferRequest($id)` → `getTransformRecordbyID($id)`
(`SELECT * FROM XXZP.xxzp_transfer_request WHERE HEADER_ID = ?`). The API returns the full row
mapped to the form:

```jsonc
{ "success": true, "data": {
    "headerId": 412, "uuid": "…", "plant": "Zamil Plastic Non-Food",
    "requestedBy": "KHALED, ALI", "deptMgrNo": 88, "mgrDate": "2026-10-29",
    "current": { "empNo": 4321, "empName": "AHMED, SAMI", "dateOfJoining": "2018-04-01",
                  "jobTitle": "Machine Operator", "dept": "Production", "section": "Production Section" },
    "transfer": { "jobTitle": "Senior Operator", "dept": "Maintenance Department",
                   "section": "Maintenance Section", "effectiveDate": "2026-11-15",
                   "bloodType": "O+", "superiorNo": 2280, "superiorName": "KHALID, OMAR",
                   "changeSalary": "Yes", "budgetedSalary": "No" },
    "approvals": { "transferDeptHead": "Draft", "adminSignature": "Draft", "president": "Draft",
                    "hrManager": "Draft", "vp": null, "generalManager": "Draft" },
    "itHr": { "hrSignature": null, "hrDate": null, "itSignature": null, "itDate": null,
               "adminSignature": null, "adminDate": null },
    "status": "Draft", "createdBy": 88
} }
```

> The `approvals.adminSignature` and `itHr.adminSignature` keys both read `ADMIN_SIGNATURE` today
> (§7.8) — the API must expose them as one value with a documented meaning until the column split is
> decided (open decision §5.6).

Unknown id → `404 { "success": false, "message": "Transfer request not found" }`.

### 4.2 Delete — `DELETE /api/v1/hr/transfer-requests/:headerId`

**The legacy module has no delete** for records (its only `delete`-like behaviour is workflow
rejection). Implement a hard delete:

```sql
DELETE FROM XXZP.XXZP_TRANSFER_REQUEST WHERE HEADER_ID = :headerId;
```

- `404` if no row matched; success returns `{ "success": true, "data": { "headerId": 412 } }`.
- **Open decision (recommended):** block delete when `STATUS` is `Inprocess`/`Approved` →
  `409 { message: "Cannot delete a request that is not Draft or Rejected" }`.

---

## 5. Write endpoints

Legacy splits create and update into two controller methods that both post full forms:
`Transferform/inserttransferform` (plain form POST) and `Transferform/updatetransferform`.

### 5.1 Payload (create and update share the shape)

```jsonc
{
  "plant": "Zamil Plastic Non-Food",
  "requestedBy": "KHALED, ALI",          // optional; server defaults to the session user
  "mgrDate": "2026-10-29",               // request date, default today
  "current": { "empNo": 4321, "empName": "AHMED, SAMI", "dateOfJoining": "2018-04-01",
                "jobTitle": "Machine Operator", "dept": "Production", "section": "Production Section" },
  "transfer": { "jobTitle": "Senior Operator", "dept": "Maintenance Department",
                 "section": "Maintenance Section", "effectiveDate": "2026-11-15",
                 "bloodType": "O+", "superiorNo": 2280, "superiorName": "KHALID, OMAR",
                 "changeSalary": "Yes", "budgetedSalary": "No" },
  "itHr": { "hrSignature": "", "hrDate": null, "itSignature": "", "itDate": null,
             "adminSignature": "", "adminDate": null }
}
```

**Never accepted from the body:** `headerId`/`uuid` (on create), `status`, `createdBy`, and the
`approvals.*` cells (workflow-owned, §9).

### 5.2 Validation

| Field                            | Rule                                       | Failure                     |
| -------------------------------- | ------------------------------------------ | --------------------------- |
| `plant`                          | required, one of the two plant values      | `400 PLANT_INVALID`         |
| `current.empName`                | required; must resolve in §6.2 lookup      | `400 EMP_NOT_FOUND`         |
| `transfer.jobTitle`              | required, in jobs LOV (§6.3)               | `400 JOB_TITLE_INVALID`     |
| `transfer.dept`                  | required, in departments list (§6.5)       | `400 DEPT_INVALID`          |
| `transfer.section`               | required, in sections LOV (§6.4)           | `400 SECTION_INVALID`       |
| `transfer.effectiveDate`         | required, valid `YYYY-MM-DD`               | `400 EFFECTIVE_DATE_REQUIRED` |
| `transfer.bloodType`             | required, in `BLOOD_TYPE` LOV (§6.6)       | `400 BLOOD_TYPE_INVALID`    |
| `transfer.superiorNo`            | required, numeric, must be a director (§6.4) | `400 SUPERIOR_INVALID`    |
| `transfer.changeSalary` / `budgetedSalary` | required, `Yes` \| `No`           | `400 SALARY_FLAG_INVALID`   |
| `mgrDate`                        | optional, default today                    | —                           |
| `itHr.*Date`                     | optional; `null` when absent (never `'01-Jan-70'`) | —                    |

Mirrors the create form: `required` on the four transfer dropdowns + effective date + both radios;
the edit form drops `required` entirely (§7.11) — the API enforces the same rules on both.

### 5.3 ID generation

- The INSERT **omits `HEADER_ID`** — the database generates it (trigger/identity; the legacy
  `NVL(MAX(HEADER_ID)+1,1)` code is commented out).
- Generate `UUID` in Node (`crypto.randomUUID()`), insert, then read the id back:
  `SELECT HEADER_ID FROM XXZP.XXZP_TRANSFER_REQUEST WHERE UUID = :uuid`
  (alternative if allowed: `INSERT ... RETURNING HEADER_ID INTO :id`).
- **Do not** trust the legacy posted `header_hidden` (= `MAX(HEADER_ID)+1` predicted before insert)
  — it is a guess and the redirect built from it can land on the wrong row (§8.3).

### 5.4 SQL — create

```sql
INSERT INTO XXZP.XXZP_TRANSFER_REQUEST
  (UUID, PLANT, REQUESTED_BY, DEPT_MGR_NO, SIGNATURE, MGR_DATE,
   C_EMP_NO, C_EMPLOYEE_NAME, C_DATE_OF_JOINING, C_JOB_TITLE, C_DEPT, C_SECTION,
   T_JOB_TITLE, T_DEPT, T_SECTION, T_EFFECTIVE_DATE, T_BLOOD_TYPE,
   T_DIRECT_SUPERIOR_NO, T_DIRECT_SUPERIOR_NAME, T_CHANGE_SALARY, T_BUDGET_SALARY,
   TRANSFER_DEPT_HEAD, ADMIN_SIGNATURE, PRESIDENT, HR_MANAGER, GENERAL_MANAGER, VP, VP_SS,
   HR_SIGNATURE, IT_SIGNATURE, HR_DATE, IT_DATE, ADMIN_DATE,
   CREATED_BY, STATUS)
VALUES
  (:uuid, :plant, :requestedBy, :deptMgrNo, NULL, TO_DATE(:mgrDate,'YYYY-MM-DD'),
   :cEmpNo, :cEmpName, TO_DATE(:cDateOfJoining,'YYYY-MM-DD'), :cJobTitle, :cDept, :cSection,
   :tJobTitle, :tDept, :tSection, TO_DATE(:tEffectiveDate,'YYYY-MM-DD'), :tBloodType,
   :tSuperiorNo, :tSuperiorName, :tChangeSalary, :tBudgetSalary,
   'Draft', 'Draft', 'Draft', 'Draft', 'Draft', 'Draft', 'Draft',
   :hrSignature, :itSignature,
   :hrDate, :itDate, :adminDate,
   :createdBy, 'Draft')
RETURNING HEADER_ID INTO :headerId;   -- or read back by UUID (§5.3)
```

Notes: the approval cells are seeded `'Draft'` (legacy `update_status_cols` does the same); the
`SIGNATURE` column is **not** written with junk (§8.4); `ADMIN_SIGNATURE` gets `itHr.adminSignature`
only if the column-split decision (§5.6) says so — otherwise leave the cell `'Draft'` and store the
typed signature in a new column.

### 5.5 SQL — update

```sql
UPDATE XXZP.XXZP_TRANSFER_REQUEST
   SET PLANT               = :plant,
       REQUESTED_BY        = :requestedBy,
       MGR_DATE            = TO_DATE(:mgrDate,'YYYY-MM-DD'),
       C_EMP_NO            = :cEmpNo,
       C_EMPLOYEE_NAME     = :cEmpName,
       C_DATE_OF_JOINING   = TO_DATE(:cDateOfJoining,'YYYY-MM-DD'),
       C_JOB_TITLE         = :cJobTitle,
       C_DEPT              = :cDept,
       C_SECTION           = :cSection,
       T_JOB_TITLE         = :tJobTitle,
       T_DEPT              = :tDept,
       T_SECTION           = :tSection,
       T_EFFECTIVE_DATE    = TO_DATE(:tEffectiveDate,'YYYY-MM-DD'),
       T_BLOOD_TYPE        = :tBloodType,
       T_DIRECT_SUPERIOR_NO  = :tSuperiorNo,
       T_DIRECT_SUPERIOR_NAME = :tSuperiorName,
       T_CHANGE_SALARY     = :tChangeSalary,
       T_BUDGET_SALARY     = :tBudgetSalary,
       HR_SIGNATURE        = :hrSignature,
       IT_SIGNATURE        = :itSignature,
       HR_DATE             = :hrDate,
       IT_DATE             = :itDate,
       ADMIN_DATE          = :adminDate
 WHERE HEADER_ID = :headerId;
```

- Never touches `STATUS`, `CREATED_BY`, the approval cells, `UUID` or `HEADER_ID`.
- 0 rows affected → `404`.
- Legacy date quirk: empty signature dates become `NULL` on insert but `'01-Jan-70'` on update —
  the API always writes `NULL` (§8.6).

### 5.6 Update guard + open decisions

Legacy guard (`updatetransferform` controller): if `STATUS == 'Inprocess'` → flash
*"Cannot Update Request is In Process"* and abort. The API returns
`409 { "success": false, "message": "Cannot update request while it is In Process" }`.

**Open decisions (confirm before coding):**

1. **Guard breadth** — legacy blocks only `Inprocess`, so an **Approved** request is still
   editable. Recommended: block `Inprocess` **and** `Approved`.
2. **`ADMIN_SIGNATURE` split** — the column is both the workflow cell "Transferred Department Head
   Old" and the form's "Admin. Manager Approval" input (§7.8). Recommended: add
   `IT_HR_ADMIN_SIGNATURE` for the typed input and keep `ADMIN_SIGNATURE` for the workflow cell.
3. **Audit columns** — table has no `UPDATED_BY`/`UPDATED_AT`; recommend adding them.

---

## 6. Lookup APIs

### 6.1 `GET .../lookups/employees` — employee-name dropdown

```sql
SELECT DISTINCT FULL_NAME AS name FROM XX_DIGI_EMP_MASTER ORDER BY 1;
```

Legacy `getEmp($userID)` **ignores its argument** and returns every employee in the master (§8.10).

### 6.2 `GET .../lookups/employees/:name` — auto-fill payload

Legacy `POST Data/getEmpDetails` → `Data_model.getEmpDetails2($emp_name)` — four queries against
the master, current-employee only:

```sql
-- ids
SELECT PERSON_ID, EMPLOYEE_NUMBER
  FROM XX_DIGI_EMP_MASTER
 WHERE FULL_NAME = :name
   AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
   AND CURRENT_EMP_FLAG = 'Y';

-- hire
SELECT JOINING_DATE AS START_DATE FROM XX_DIGI_EMP_MASTER
 WHERE PERSON_ID = :personId
   AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
   AND CURRENT_EMP_FLAG = 'Y';

-- job
SELECT JOB_TITLE AS NAME, JOB_ID FROM XX_DIGI_EMP_MASTER
 WHERE PERSON_ID = :personId
   AND SYSDATE BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE;

-- dept/section
SELECT DISTINCT ORGANIZATION_ID, ORGANIZATION_NAME AS NAME
  FROM XX_DIGI_EMP_MASTER
 WHERE PERSON_ID = :personId
   AND TRUNC(SYSDATE) BETWEEN PAPF_EFFECTIVE_START_DATE AND PAPF_EFFECTIVE_END_DATE
   AND TRUNC(SYSDATE) BETWEEN PAAF_EFFECTIVE_START_DATE AND PAAF_EFFECTIVE_END_DATE
   AND CURRENT_EMP_FLAG = 'Y';
```

Response (flattened; the JS reads `ids`, `hire`, `job`, `dept` only):

```jsonc
{ "success": true, "data": {
    "empNo": 4321, "personId": 123456,
    "dateOfJoining": "2018-04-01", "jobTitle": "Machine Operator",
    "deptName": "Production Section"
} }
```

- `dept` (form "Department") = `deptName.replace("Section", "")`; `section` = `deptName` as-is.
- No match → legacy client writes `undefined` into the fields (no error handling at all) — the API
  must return `404 { message: "Employee not found" }` instead (§8.9).
- The legacy response also carries `sup`, `pos_year_detail`, `years_in_companay` — unused by this
  form; do not include them.

### 6.3 `GET .../lookups/jobs` and `GET .../lookups/sections`

```sql
-- jobs
SELECT DISTINCT JOB_TITLE AS name FROM XX_DIGI_EMP_MASTER ORDER BY 1;
-- sections
SELECT DISTINCT ORGANIZATION_NAME AS name
  FROM XX_DIGI_EMP_MASTER
 WHERE ORGANIZATION_NAME LIKE '%Section%' ORDER BY 1;
```

(The model also computes a "departments" query — `REPLACE(ORGANIZATION_NAME,'Section','Department')`
— but the create form **does not use it**; the department datalist comes from the hardcoded list
in §6.5.)

### 6.4 `GET .../lookups/directors` — "Director Superior" dropdown

```sql
SELECT DISTINCT FULL_NAME AS name, EMPLOYEE_NUMBER AS empNo
  FROM XX_DIGI_EMP_MASTER
 WHERE PERSON_ID IN (SELECT DISTINCT SUPERVISOR_ID FROM XX_DIGI_EMP_MASTER
                      WHERE ASSIGNMENT_STATUS_TYPE_ID IN (1,3))
 ORDER BY EMPLOYEE_NUMBER;
```

### 6.5 Departments — **hardcoded in the controller, not a query**

```php
['Sales Department', 'Planning Department', 'Warehouse Department', 'Production Department',
 'Maintenance Department', 'Technical Department', 'Quality Department', 'HR Department',
 'Finance Department', 'IT Department', 'Purchasing Department']
```

Serve this list from the API (config constant or a `lookups/departments` endpoint) so the frontend
matches legacy exactly; changing it is a product decision, not an implementation detail.

### 6.6 `GET .../lookups/blood-types`

```sql
SELECT LOOKUP_CODE AS code FROM XX_DIGI_LOOKUP_VALUES
 WHERE LOOKUP_TYPE = 'BLOOD_TYPE' ORDER BY 1;
```

### 6.7 `GET .../lookups/requestor` — session prefill

```sql
SELECT DISTINCT EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS
  FROM XX_DIGI_EMP_MASTER
 WHERE EMPLOYEE_NUMBER IN (SELECT EMPLOYEE_NUMBER FROM XX_DIGI_EMP_MASTER
                            WHERE USER_ID = :userId);
```

Returns the logged-in user's name + employee number used to prefill `requestedBy` / `empNo` on the
create form (§7.2).

> **Legacy-only endpoint:** `POST Transferform/getDepartmentFromTitle` (`title_name`) resolves
> job → department + section through EBS `PER_JOBS_TL`/`HR_ALL_POSITIONS_F`/
> `PER_POSITION_DEFINITIONS`. No current view calls it; keep it out of the new API unless the
> frontend asks for it.

---

## 7. Form flow — conditional behaviour (what the React screen must reproduce)

### 7.1 New form vs. edit form

| Condition                   | Behaviour                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `GET /transfer-requests` (create) | `Transferform/index` — session-checked; **no Submit button**; Save posts to insert |
| `GET /transfer-requests/:id` (edit) | `Transferform/editTransferRequest/:id` — session-checked; **Submit + Save** in navbar |
| Report page                 | `Transferform/transferreport` — **no session check** (§8.2); nav links only |
| On successful insert        | legacy redirects to `editTransferRequest/{predicted id}` (§8.3)           |
| On successful update        | redirect back to `editTransferRequest/:id` with flash "Request Updated Successfully" |
| On update while Inprocess   | flash "Cannot Update Request is In Process", nothing saved (§5.6)         |
| Flash message               | shown for 2 s then faded (`#alertrow`)                                    |

### 7.2 Session prefill (create form)

- `Requested By` and `Employee No.` are prefilled from the logged-in user (`lookups/requestor`),
  both **editable** inputs on create; on edit `Requested By` is **readonly** (`REQUESTED_BY`) and
  the Employee No. box shows **`CREATED_BY`** — not `DEPT_MGR_NO` (a mismatch, §8.7).
- Hidden inputs: `header_hidden` (predicted id — server must ignore, §5.3), `hidden_name` (requestor
  full name — unused by insert; drop it).

### 7.3 Employee dropdown → auto-fill (the main conditional)

When the user picks a name from `Employee Name` (change event):

1. Call `lookups/employees/:name` (§6.2).
2. Fill: `cemp_no` ← `empNo`, `j_title` ← `jobTitle`, `section` ← `deptName`,
   `dept` ← `deptName` with the first `"Section"` removed, `doj` ← `dateOfJoining`.
3. **No employee found** → legacy writes `undefined`/blank; the API returns 404 and the frontend
   clears the current-info fields (§8.9).
4. Re-selecting a name **re-runs the auto-fill and overwrites** any manual edits in the
   current-info block (those inputs stay editable — see §7.5).
5. The current-info fields are **not** readonly — the user can hand-correct them after auto-fill.

### 7.4 Director Superior select → hidden + readonly pair

- `Director Superior Name` is a `<select>` whose option **value = `EMPLOYEE_NUMBER`** and label =
  full name.
- On change: `dse_no` (readonly input) ← selected value; `ds_name_hidden` (hidden input) ← selected
  option's text. Both are what the API stores as `superiorNo` / `superiorName`.
- Edit form preselects the option whose `EMPLOYEE_NUMBER == T_DIRECT_SUPERIOR_NO`
  (legacy comparison has an operator-precedence bug — `$a ?? $b ?? $c == $d` — so preselection only
  works by accident; do it correctly).

### 7.5 Editability matrix

| Field                                            | Create            | Edit                |
| ------------------------------------------------ | ----------------- | ------------------- |
| `request_by` (Requested By)                      | editable (prefilled) | **readonly**     |
| `emp_no` (Employee No., dept-manager box)        | editable (prefilled) | **readonly**, shows `CREATED_BY` |
| `mdate` (Date)                                   | editable, defaults today | editable, **defaults today — not the stored date** |
| `signature` (Approval box)                       | empty input       | hardcoded `'Approved'` value |
| `emp_name` + all current-info fields             | editable          | editable            |
| `drpSP` (Plant)                                  | default `Zamil Plastic Non-Food` | value kept, **selection logic buggy (§8.8)** |
| Transfer block (job/dept/section/effective/blood) | editable, `required` | editable, **no `required`** |
| `T_SECTION` input                                | datalist          | **plain text input (no datalist)** |
| Radios `salary` / `b_salary`                     | editable, `required` | checked = value, **defaults to `No`** when value ≠ `'Yes'` |
| `dse_no` (director id)                           | readonly (auto)   | readonly (auto)     |
| IT & HR signature/date inputs                    | editable          | editable            |
| Approval cells                                   | static "Draft" text | workflow-status colored text |

### 7.6 Auto-computed / prefilled values

| Value            | Where        | Behaviour                                            |
| ---------------- | ------------ | ---------------------------------------------------- |
| `mdate`          | client       | defaults to today on **both** create and edit        |
| Issue Date cell  | client       | `date('d-M-Y')` — display only, not submitted        |
| `header_hidden`  | server→client| `MAX(HEADER_ID)+1` prediction — **server must ignore** |
| Plant            | client       | `'Zamil Plastic Non-Food'` preselected on create     |
| Approval box     | client       | `'Approved'` on edit                                 |
| Radio defaults   | server render| `No` checked whenever stored value ≠ `'Yes'`         |
| Signature dates  | server       | empty → `NULL` (never `01-Jan-70`, §8.6)             |

### 7.7 Department Approval block (workflow display)

- **Create form:** five static `Draft` cells — `Transferred Department Head New`,
  `Transferred Department Head Old`, `Director of Transfer Department New`, `HR & Admin Manager`,
  `General Manager`. The **`Finance & Shared Services VP` column is removed** (commented
  "Remove Khaled VP"); the `VP`/`VP_SS` columns still exist in the table but must not be rendered.
- **Edit form:** same five cells rendered from `TRANSFER_DEPT_HEAD`, `ADMIN_SIGNATURE`,
  `PRESIDENT`, `HR_MANAGER`, `GENERAL_MANAGER` via `workflow_status()`:

| Stored value                  | Rendered              |
| ----------------------------- | --------------------- |
| `''` / `null`                 | `Draft` (blue)        |
| `Inprocess` / `INPROCESS`     | info (cyan)           |
| `Rejected` / `REJECTED`       | danger (red)          |
| `Approved` / `APPROVED`      | success (green)       |
| anything else                 | plain blue            |

- **Column conflict:** `ADMIN_SIGNATURE` is displayed here *as the workflow cell* **and** used as
  the stored value of the `Admin. Manager Approval` text input (§5.6 decision 2). The frontend must
  render one field per cell until the split is made — do not invent a second source of truth.

### 7.8 "For IT & Human Resources Department Use Only" section

Three editable signature + date pairs: `HR Supervisor Approval` (`hr_signature`/`fdate`),
`IT Approval` (`it_manger`/`it_date`), `Admin. Manager Approval` (`a_manager`/`adate`). On edit,
stored dates equal to `01-JAN-70` are rendered as empty. All six values are ordinary form fields
(workflow does not own them).

### 7.9 Submit button (edit form only)

- Visible **unconditionally** on the edit form (no status check in the navbar — unlike the
  Permission Status Change module). Click → `confirm("Do You want to send Request in Workflow ?")`
  → `GET TransferFlow/submitWorkflow?header-id=:id`.
- Client reaction to the response: `"Approved"`/`"Inprocess"` → `alert("Request is " + data)`;
  `"fail"` → `alert("Failed to Send an Email")`; anything else → alert the raw text.
- **The endpoint itself is workflow and is OUT of scope (§9)** — the React app keeps the button
  hidden or wires it to the future workflow API; the CRUD API does not change `STATUS`.

### 7.10 Report page behaviour

- Columns: `#`, `Requested By`, `Employee Name`, `Employee Number`, `Current Job Title`,
  `Current Department`, `Transfer Job Title`, `Transfer Department`, `Superior Name`, `Status`,
  `DAYS OPEN`, `LAST ACTION`, `Pending AT` — the last three are workflow (§9) and are **dropped**
  from the new listing.
- Client-side DataTables only; row click → `Transferform/editTransferRequest/:headerId`.

### 7.11 Client-side validation summary

- Create form: `required` on `cj_title_name`, `j_dept_name`, `esection_name`, `edate`,
  `b_type_name`, both radios, and (`ds_name_hidden` has `required` but lives in a hidden input —
  browsers skip hidden fields, so it never actually blocks).
- Edit form: **no `required` attributes at all** — server-side validation is the only backstop
  (§5.2).
- No JS numeric/format validation anywhere on this form.

---

## 8. Legacy bugs — do not reproduce

1. **SQL injection everywhere.** The insert is fully string-concatenated; `updatetransferform`,
   `getTransformRecordbyID`, `ifExistTransferRequest`, `getEmpDetails2`, `getDepartmentFromTitle`
   and the report's `created_by = $id` scope all interpolate input. Bind variables only.
2. **Missing auth checks.** `inserttransferform`, `updatetransferform`, `transferreport` and
   `getDepartmentFromTitle` run without a session check (only `index` / `editTransferRequest`
   check). Every new endpoint requires session + permission code.
3. **Predicted header id.** Create posts `header_hidden = MAX(HEADER_ID)+1`, the INSERT ignores it
   (DB generates the real id) and success redirects to the *predicted* id — racy and can land on
   the wrong record. Read the id back by `UUID` (§5.3).
4. **`SIGNATURE` junk.** Insert writes the literal `'Approved'`; update writes the literal
   `'SIGNATURE'`. The field is display-only — store what the user typed or don't store it at all.
5. **`ADMIN_SIGNATURE` double-booked** — workflow approval cell "Transferred Department Head Old"
   *and* the typed Admin. Manager Approval input share one column (§5.6 decision 2).
6. **`01-Jan-70` dates.** Update runs `date('d-M-Y', strtotime(''))` on empty signature dates →
   epoch; the edit view then has to filter `01-JAN-70`. Write `NULL`.
7. **Update guard too narrow** — only `Inprocess` is blocked, so `Approved` requests can still be
   edited (§5.6 decision 1).
8. **Plant selection precedence bug** — `($record['PLANT'] ?? "" == "ZPI")` parses as
   `$record['PLANT'] ?? ("" == "ZPI")`, so *any* non-empty plant renders as selected-ZPI, and the
   values don't even match (`'Z3P'` vs `'Zamil Plastic Food'`). Compare against the real values.
9. **No auto-fill error handling** — an unknown employee makes the JS write `undefined` into five
   fields. Return/handle 404 (§6.2).
10. **Edit form's Employee No. box shows `CREATED_BY`** (a user id) where the create form shows the
    session user's `EMPLOYEE_NUMBER` (`DEPT_MGR_NO`) — pick one meaning.
11. **Hardcoded bypass user** in the report scope (`$allowed_users = ['300000004800434']`) — use
    configuration, not literals (§3.1).
12. **`getEmp()` ignores its parameter** and returns the entire master table as the dropdown.
13. **Operator-precedence bugs** in `??`/`==` comparisons (plant select, director preselection,
    `HR_DATE ?? "" == "01-JAN-70"`) — parenthesis them explicitly.
14. **Missing `required` on the edit form** and a stray literal `f` printed inside the edit
    form's jobs datalist.
15. **No server-side validation at all** and unescaped output (XSS) in datalist options/flash text.
16. **Duplicate legacy paths** — `Welcome.php::transferreport/editTransferRequest` and
    `Data.php::inserttransferform` implement the same flows against `Data_model`; dead weight, do
    not port.

---

## 9. Out of scope (do not implement)

- **Workflow / approval / email.** `controllers/TransferFlow.php` (`submitWorkflow`, `workflow`),
  `Workflow_model`, `XXPHP_WORKFLOW`, `Zmailer` approve/reject/forward/reassign/RFI links,
  phpmailer SMTP sends, `views/Transfer_form/wf_temp.php` + `wf_first_history.php` (email bodies),
  and the model's workflow column writers: `update_status_cols`, `update_workflow_status`,
  `updatetrfStatusFlag`, `updateRequestStats`, `getMaxGroupID`, `getMaxNotificationID`,
  `getTransferFormDepHead`, `getuserODFromEmpNo`, `direct_manager_from_user_id`.
- **Report workflow columns:** `DAYS_OPEN`, `LAST_ACTION`, `PENDING_AT` (all `XXPHP_WORKFLOW`
  subqueries).
- **Approval cells** — the API only *returns* `approvals.*`; it never writes them (except the
  `'Draft'` seeding on insert, §5.4).
- **Print** — `window.print()` only; no server rendering.
- **Legacy duplicates** — `views/editTransferForm.php`, `views/transferRequestReport.php`,
  `Welcome.php` variants, `Data.php::inserttransferform` (old insert-with-emails).
- **`zamil_training`** (hardcoded redirect to `10.10.2.116/training/`) and
  `getDepartmentFromTitle` (unused EBS lookup).

---

## 10. Legacy → new endpoint map

| Legacy (PHP)                                                     | New API                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET Transferform/index` (create form, session prefill)          | `POST /api/v1/hr/transfer-requests` (payload prefill via lookups)   |
| `POST Transferform/inserttransferform`                           | `POST /api/v1/hr/transfer-requests`                                 |
| `GET Transferform/editTransferRequest/:id` (`getTransformRecordbyID`) | `GET /api/v1/hr/transfer-requests/:headerId`                    |
| `POST Transferform/updatetransferform` (+ `ifExistTransferRequest` guard) | `PUT /api/v1/hr/transfer-requests/:headerId`               |
| `POST Data/getEmpDetails` (`getEmpDetails2`)                     | `GET .../lookups/employees/:name`                                   |
| `getAllLovForTransferForm()` → jobs / sections / directors / bloods | `GET .../lookups/jobs`, `/sections`, `/directors`, `/blood-types`  |
| hardcoded `$departments` array                                   | `GET .../lookups/departments`                                       |
| `getEmp()` employee-name dropdown                                | `GET .../lookups/employees`                                         |
| `getRequestedBy()` / `getFormUserDetails()`                      | `GET .../lookups/requestor`                                         |
| `Transferform/transferreport` (scoped listing + DataTables)      | `GET /api/v1/hr/transfer-requests` (§3)                             |
| `TransferFlow/submitWorkflow`, `workflow`, Zmailer links         | — (workflow — §9)                                                   |
| `getDepartmentFromTitle`, `zamil_training`                       | — (unused — §9)                                                     |
| `window.print()`                                                 | — (browser print)                                                   |
| — (no legacy delete)                                             | `DELETE /api/v1/hr/transfer-requests/:headerId`                     |

---

## 11. Acceptance checklist

- [ ] **T-01** `POST` returns `201` with `headerId` + `uuid` read back from the DB; body cannot set
      `headerId`, `status`, `createdBy` or any `approvals.*` cell.
- [ ] **T-02** `POST` with a missing/invalid value for each required field (§5.2) → the documented
      `400` code.
- [ ] **T-03** `POST` seeds all approval cells + `STATUS` to `'Draft'` and writes `NULL` (never
      `01-Jan-70` / `'Approved'` / `'SIGNATURE'`) into the signature fields.
- [ ] **T-04** `GET :id` returns the nested `current` / `transfer` / `approvals` / `itHr` groups;
      unknown id → `404`.
- [ ] **T-05** `PUT :id` updates form fields only — `STATUS`, `CREATED_BY`, `UUID`, approval cells
      unchanged; 0 rows → `404`.
- [ ] **T-06** `PUT` on an `Inprocess` request → `409` with the legacy wording (and, if the
      decision is taken, on `Approved` too).
- [ ] **T-07** `DELETE :id` removes the row; second delete → `404`.
- [ ] **T-08** Listing honours §3.1: an HR-tagged user sees all rows, a non-HR user sees only their
      own (`CREATED_BY`), and no hardcoded user id appears in the code.
- [ ] **T-09** `meta.total` is a real `COUNT(*)`; default order `HEADER_ID DESC`; page ≤ `pageSize`.
- [ ] **T-10** Each filter (`search`, `status`, `plant`, `transferDept`, `currentDept`, `jobTitle`,
      `date_from`, `date_to`) narrows results alone and combined.
- [ ] **T-11** Listing response contains **no** workflow fields (`DAYS_OPEN`, `LAST_ACTION`,
      `PENDING_AT`) and no `XXPHP_WORKFLOW` reads anywhere.
- [ ] **T-12** `lookups/employees/:name` returns `empNo/dateOfJoining/jobTitle/deptName` for a
      current employee; unknown name → `404`.
- [ ] **T-13** The frontend reproduces §7.3: choosing an employee fills all five current-info
      fields, with `dept = deptName.replace("Section","")` and `section = deptName`.
- [ ] **T-14** The frontend reproduces §7.5 editability (readonly `requestedBy`/`empNo` on edit,
      editable current-info block, radios defaulting to `No`).
- [ ] **T-15** Approval block renders five cells with `workflow_status()` colours per §7.7 and
      **no VP column**; empty/null shows `Draft`.
- [ ] **T-16** `lookups/jobs|sections|departments|directors|blood-types|employees|requestor` match
      §6 exactly (departments = the hardcoded 11 values).
- [ ] **T-17** Every SQL statement uses bind variables — a `search` value of `%' OR 1=1 --` returns
      0 rows; unauthenticated calls get `401`.
- [ ] **T-18** All endpoints require the session + the matching `HR.TRANSFER_REQUESTS.*`
      permission code (UPDATE, never EDIT).

---

## 12. Implementation prompt (copy-ready)

> Copy everything in this block into your agent's task prompt together with this file.
>
> ```
> Implement the backend for the TRANSFER REQUEST FORM in this repository, following
> README_transfer_request_form.md as the authoritative spec. Spec-driven: do not invent behaviour
> the README does not describe, and do not read behaviour from the legacy PHP beyond what it
> documents.
>
> GOAL
> - CRUD + listing for ONE table: XXZP.XXZP_TRANSFER_REQUEST.
> - Endpoints (base /api/v1/hr/transfer-requests):
>     POST   /                 create  (HR.TRANSFER_REQUESTS.CREATE)
>     GET    /:headerId        read    (HR.TRANSFER_REQUESTS.VIEW)
>     PUT    /:headerId        update  (HR.TRANSFER_REQUESTS.UPDATE)
>     DELETE /:headerId        delete  (HR.TRANSFER_REQUESTS.DELETE)
>     GET    /                 listing with filters + pagination + HR scoping (VIEW)
>     GET    /lookups/employees | /lookups/employees/:name | /lookups/jobs | /lookups/sections |
>            /lookups/departments | /lookups/directors | /lookups/blood-types | /lookups/requestor
>   Register /lookups/* BEFORE /:headerId. Permission codes use UPDATE, never EDIT.
>
> NON-GOALS (do not build)
> - No workflow/approval/email: no TransferFlow, XXPHP_WORKFLOW, Zmailer, status transitions, or
>   writes to the approval cells (TRANSFER_DEPT_HEAD, ADMIN_SIGNATURE, PRESIDENT, HR_MANAGER,
>   GENERAL_MANAGER, VP, VP_SS). STATUS is server-owned ('Draft' on insert, read-only after).
> - No print/PDF, no attachments, no legacy duplicates (Welcome.php / Data.php variants), no
>   getDepartmentFromTitle, no zamil_training.
>
> DATA RULES
> - Oracle; bind variables everywhere, never string concatenation.
> - HEADER_ID is DB-generated: insert with a Node-generated UUID, read the id back by UUID (or
>   INSERT ... RETURNING). Never trust a client-sent header id.
> - Server-owned: HEADER_ID, UUID, STATUS, CREATED_BY, approvals.*. Ignore them in the body.
> - Dates: accept/return YYYY-MM-DD, bind with TO_DATE(...,'YYYY-MM-DD'); legacy DD-MON-RR strings
>   are display-only. Signature dates are NULL when absent — never '01-Jan-70'.
> - Listing scoping is part of the spec (§3.1): XXZP_HR tag match => all rows, else CREATED_BY =
>   session user. No hardcoded bypass user ids.
>
> FORM FLOW (README §7) — the frontend contract
> - Auto-fill: GET /lookups/employees/:name drives the five current-info fields; dept = deptName
>   minus "Section", section = deptName; unknown employee => 404 (never undefined).
> - Create vs edit differences, editability matrix (§7.5), approval-cell colours (§7.7), the removed
>   VP column, and the IT/HR signature section are frontend rules; the API only supplies data.
>
> RULES
> 1. Read README_transfer_request_form.md fully before coding; its SQL blocks are the reference
>    queries — port them with bind variables.
> 2. Fix, never copy, the legacy bugs in §8 (SQL injection, missing auth, predicted-id redirect,
>    SIGNATURE junk, 01-Jan-70 dates, narrow update guard).
> 3. Validate per §5.2 with the documented error codes; guard updates per §5.6.
> 4. Filter building per §3.2; response envelope { success, data } per §2; meta.total is a real
>    COUNT(*).
> 5. Before coding, resolve the THREE OPEN DECISIONS with me: (a) update guard breadth (block
>    Approved too?), (b) splitting ADMIN_SIGNATURE into workflow cell vs typed signature,
>    (c) adding UPDATED_BY/UPDATED_AT. Do not decide these yourself.
>
> DONE WHEN
> - T-01…T-18 in README §11 are covered by tests that exercise the real endpoints.
> - The project's typecheck/lint/test suite passes with no new suppressions.
> - You report which checks you ran, which failed, and anything you could not verify.
> ```

---

*Generated for the Zamil Plastic HR revamp. Legacy of record: `pmform_codebase` (CodeIgniter) —
`Transferform` module. The full specification is README_transfer_request_form.md in the repository
root.*
