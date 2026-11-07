# Employee Clearance (1063) — Legacy CI3 vs New Form Comparison

The CI3 form is the source of truth for fields, flow and UI; the security rules of `CLAUDE.md` /
`docs/SECURITY-ESSENTIALS.md` still win (bind variables, CSRF, RBAC, server-owned values). The
backend (`server/src/modules/hr/employee-clearance/`) already existed; this round adds the React
screens and one presenter fix.

## 1. Files

### 1.1 Legacy (`php-ci3-old-app/zamil_old_codebase/zpil_codebase/`, not modified)

| File | Role |
|---|---|
| `views/ZPIL/empclearance.php` | Create screen |
| `views/update/empClearance.php` | Edit screen |
| `views/ZPIL/empclearance_list.php` | Report |
| `views/ZPIL/empclearance_list_hr.php` | HR report (hardcoded approvers) |
| `controllers/Empclearance.php`, `models/Empclearance_model.php` | CRUD and lookups |
| `README_employee_clearance_form.md` | Field, flow and bug catalogue used for this comparison |

### 1.2 New

| File | Role |
|---|---|
| `client/src/features/hr-employee-services/clearance/ClearancePage.jsx` | Create and edit form |
| `client/src/features/hr-employee-services/clearance/ClearanceReportPage.jsx` | Report |
| `client/src/features/hr-employee-services/clearance/clearanceModel.js` | Rules and validation |
| `client/src/features/hr-employee-services/clearance/clearanceContract.js` | Response readers, request body |
| `client/src/features/hr-employee-services/clearance/clearanceService.js` | API calls |
| `client/src/styles/hr-employee-clearance.css` | IT rows, department tabs, side summary |
| `client/src/config/registry/modules/hrForms.module.js` | Permission resource and navigation |
| `server/src/modules/hr/employee-clearance/employee_clearance_service.js` | Read now returns `computerSignature` |

## 2. Field matrix

| Legacy field | New control (step) | Behaviour |
|---|---|---|
| Emp No (`emp_no` select of self + reports) | Employee picker (Employee) | `lookups/employees?scope=scoped`; picking fills the rest via `lookups/employees/:empNo` |
| Name, Job Title, Department | Read-only (Employee) | Filled from the employee; the server re-reads them on save |
| Reference No | Read-only (Employee, ticket) | Server-generated `{division}/{yy}/{NNN}` on first save |
| Status (`Draft`) | Read-only (Employee, ticket) | Server-owned |
| Vacation start / end | Date inputs (Employee) | Optional; end not before start (client + server) |
| Contact # (required) | Text (Employee) | Required, ≤ 100 |
| Purpose of clearance (required) | Textarea (Employee) | Required, ≤ 1000 |
| IT matrix: 5 rows × 7 radios | 5 rows of action chips (IT access) | One action required per row (legacy `required` radio) |
| `access_to{i}` (date for "Disabled Untill", else name datalist) | "Access to" input (IT access) | Date for Disabled Untill, else text with employee-name suggestions; switching kind clears it |
| Final-exit note | Note above the IT rows | Same wording |
| Department Manager (required datalist) + Date + Signature | Picker over `lookups/approvers?section=department`, date, signature (Sign-off) | Must match exactly one manager name (server rule) |
| IT Manager (free text) + Date + Signature | Text, date, signature (Sign-off) | Free text, as legacy |
| Computer/Laptop (Recieved by) (required) + Signature | Picker over `lookups/computer-destinations` incl. IT / No Computer (Sign-off) | Required |
| 5 tabs: checkboxes, Comments, Cost, Approver (read-only), App sig | Department tabs (Clearance) | Same items and labels per tab (12/4/2/2/9); Admin has Visa Expire and App. Date, no cost |
| Emp Department approver = employee's `SUPERVISOR_NAME` | Read-only | From `directManager` of the employee lookup |
| Quality / Warehouse / Accounts / Admin approver | Read-only | First row of the section's approver lookup (legacy `row_array`) |

## 3. Dependency matrix

| Trigger | Legacy | New |
|---|---|---|
| Employee changes | 5 AJAX calls (details, supervisor id, 4 section approvers) | 1 details call; approvers loaded once with the form |
| IT action changes | Injects a date or text input | Same kinds; value cleared when the kind changes |
| Department manager pick | Resolves `dept_mng_no` client-side by name | Server resolves the number; ambiguous names are refused |

## 4. Flow comparison

| Step | Legacy | New |
|---|---|---|
| Create | Save posts; tabs and signatures **disabled** | Same: tabs and signatures disabled until the first save |
| After save | Redirect to edit screen with flash message | Moves to `/clearance/:id` with a success message |
| Edit (Draft / Rejected) | Everything editable | Same |
| Edit (InProcess / Approved) | Legacy editable; backend did not block | Read-only; backend answers 409 |
| Submit | `submitWorkflow` (edit screen) | **Not built** (workflow out of scope) |
| Print | Browser print (create) / mPDF (edit) | Browser print |
| Report | Unfiltered DataTable, row click opens the form | Server-filtered, paged report with status / monthly cards; row opens the form |

## 5. Changes made

- Client: new form, report, registry module, routes and tests (`client/tests/hrEmployeeClearance.test.mjs`);
  the pinned route lists in five existing tests now include the three clearance routes.
- Server: `GET /hr/employee-clearance/:id` now returns `computerSignature` (`COM_SIG`). Without it the
  edit form could not show the stored value and a save would have blanked it. OpenAPI
  `EmployeeClearanceDetail` and `server/tests/employee-clearance.test.js` updated.
- Server: `ATTRIBUTE2` (`computerReturned`) is now `0` for both `IT` and `No Computer` and `99` for an
  employee receiver, matching the legacy `getComputer()` ids `0001`/`0002` and §1.1 of the legacy
  README (previously only `IT` produced `0`).
- Server: each tab's `*_MGR_USERID` now stores the first approver of its lookup (legacy
  `row_array()` and the approved name both use the first row) instead of being left `NULL` whenever
  the lookup returned more than one row.
- Server: the list scope now also includes `CREATED_BY = me` (legacy `empclearnce_list()` creator
  scope), so a requester still sees a request whose subject has since left their team.

## 6. Verification

Mocked tests only (recording client for the API, mocked repository on the server). **No Oracle TEST
verification was performed** and the screens were **not checked in a browser** against a running
backend in this round.

## 7. Deviations and decisions for the owner

1. **Submit / workflow** — not available; the request stays a draft (as with the other employee
   services forms).
2. **Delete** — the backend has `DELETE` for drafts; the legacy UI has none, so no button was added.
3. **HR report** (`empclearance_list_hr.php`, seven hardcoded approvers) — not ported.
4. **Report columns** — legacy "Vacation Start / End" showed the division and the computer flag
   (legacy bug); the new report shows the real vacation dates. Pending At, workflow start/end and
   Last Action are not shown (they need the workflow).
5. **Scope** — the backend limits employees, computer receivers and "access to" suggestions to the
   user and direct reports unless the user holds `HR.EMPLOYEE_CLEARANCE:VIEW_ALL`
   (legacy listed every employee for the last two). Free text stays allowed for "access to".
   The list shows requests the user created, requests about them, and requests about their direct
   reports; legacy showed only requests they created, so a subject now also sees a request raised
   for them by their manager.
6. **Department manager list** — the backend uses `APPROVAL_AUTHORITY` 5–9, not the legacy
   hardcoded job ids / employee numbers.

## 8. Open questions

- Are the `HR.EMPLOYEE_CLEARANCE` permissions (VIEW, CREATE, UPDATE, DELETE,
  VIEW_ALL) present in the Oracle permission catalogue and granted to the right roles? Not verified.
- Should requesters be able to set the approver signatures on a draft (legacy allows it on the edit
  screen; kept for parity), or should these wait for the workflow?
