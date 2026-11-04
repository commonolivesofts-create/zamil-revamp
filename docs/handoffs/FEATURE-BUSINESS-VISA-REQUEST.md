# Feature handoff — Business Visa Request

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Business Visa Request form and report |
| Business purpose | Request a business visa for a visitor coming to the company (visitor, travel, visa type, expenses, passport copy) |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented (new backend module and screens) |
| Replaces CI3 feature | `visa_request` — `controllers/Visa.php`, `models/Visa_model.php`, `views/visa_request/visa.php`, `visa_report.php` (pmform_codebase) |

Not the same form as the existing `/hr/business-visa-letters` API (the outbound embassy letter for an
employee, table `XX_DIGI_BUSINESS_VISA_LETTERS`); that API is unchanged.

## 2. Source control

Not committed.

## 3. Behaviour

- Sidebar: Human resources → **Letters** → Business visa request (`/hr/letters/business-visa`), report at
  `/hr/letters/business-visa/report`, saved request at `/hr/letters/business-visa/:requestId`.
- Steps: Request (division, department, date, request no.; once saved the signature block), Visitor
  (identity, passport, company), Travel & visa (travel, visa type, travel and hotel expenses, "if other"),
  Documents (passport copy and other files).
- Required as in legacy: every field except address and "if other". Added checks: at least one visa type,
  "if other" when an "Others" box is ticked, passport expiry not before issue, and a document on a new
  request (the legacy note "Please attach clear copy of passport").
- Request number as legacy: `<division> - <0000 id>`. Status `DRAFT` on create; drafts and rejected
  requests can be changed, in-process and approved ones are read-only (409), as the other HR forms.
- Documents: one upload per call after the request is saved; legacy file types, up to 24 MB; named after
  the file (legacy "Document name"; unnamed → `Document - n`). Stored on disk under
  `attachments/business-visa-requests/<lineId>_<name>`, as the other modules. Legacy files on the CI3 server
  are listed but not served (no module serves downloads yet).
- Report: search (visitor, request no., passport, company), status, division, department, date range;
  cards for total and requests by month.
- Not built: the approval workflow (`visa_flow.php`, MSG_TYPE `BVF`, DM/DIR/GM/HR columns), which is read
  only (Noted by = `DIR_NAME`, Approved by = `GM_NAME`).

## 4. Backend

`server/src/modules/hr/business-visa-requests/` — `/api/v1/hr/business-visa-requests`, resource
`HR.BUSINESS_VISA_LETTERS` (owner decision 2026-11-04: the existing letters resource, MATCH in the TEST catalogue; VIEW, CREATE, UPDATE — UPDATE also covers documents).

| Method | Path | Permission |
|---|---|---|
| GET | `/` (page, pageSize, q, status, division, dept, dateFrom, dateTo) | VIEW |
| GET | `/lookups/options` (legacy APP_BU_INFO divisions, `XX_DIGI_DEPT_MASTER` names) | VIEW |
| GET | `/:id` (with documents) | VIEW |
| POST | `/` | CREATE + CSRF |
| PUT | `/:id` | UPDATE + CSRF |
| POST | `/:id/documents` (multipart `file`, `name`) | UPDATE + CSRF |
| DELETE | `/:id/documents/:lineId` | UPDATE + CSRF |

Tables `XXZP.XX_BUS_VISA_HEADER` / `XX_BUS_VISA_DOCS` (no DDL): `HEADER_ID` and `LINE_ID` are identity
columns (read-only dictionary check, 2026-11-04). Check boxes keep the legacy literals (`Single`,
`Multiple`, `T_Company`, … or the string `Null`) so legacy reports still read them. Not in the OpenAPI
document yet.

## 7. Open items for the owner

1. The sidebar entry shows for roles granted `HR.BUSINESS_VISA_LETTERS:VIEW`; that permission now also opens
   this form.
2. Production builds need `VITE_FEATURE_HR_BUSINESS_VISA=true`.

## 10. Validation

| Check | Result |
|---|---|
| `cd server; npm run check` | Passes (915 tests: 908 pass, 0 fail, 7 todo) |
| `cd client; npx eslint src tests`, `npm test` | No problems; 463 tests: 459 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Oracle TEST, read-only | Options (2 divisions, 43 departments), list (15 requests) and filters, read with documents; the INSERT/UPDATE/DELETE statements parsed with `DBMS_SQL.PARSE` (not executed) |
| Create / upload on TEST | **Not performed** (no database writes authorized) |
| Browser | **Not performed** |
