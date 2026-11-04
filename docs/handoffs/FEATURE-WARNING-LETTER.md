# Feature handoff — Warning Letter

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Warning Letter form and report |
| Business purpose | Issue a warning letter to an employee for the ticked reasons, with the action taken |
| Business owner | HR (project owner) |
| Developer(s) | Nauman Mirza, with Claude Code |
| Status | Implemented (screens over the existing backend) |
| Replaces CI3 feature | `Warning_letter` — `controllers/Warning_letter.php`, `models/Warning_letter_model.php`, `views/warning/` (pmform_codebase) |

## 2. Source control

Not committed.

## 3. Behaviour

- Sidebar: Human resources → **Letters** → Warning letter (`/hr/letters/warning-letter`), report at
  `/hr/letters/warning-letter/report`, saved letter at `/hr/letters/warning-letter/:letterId`.
- Steps: Employee (warning date, ref. no. and warning no. from the server; employee search by number or
  name, at least two characters; full name, division and position from the master), Reasons (the five legacy
  reasons in English and Arabic, Others in English and Arabic), Action (action in English and Arabic; the
  warning letter and other letter boxes, each with its comment).
- Rules (the backend's): a ticked reason or an Others text; a comment for each ticked letter. The employee
  is fixed once saved. As legacy, letters stay editable and there is no delete on screen.
- Report: the legacy columns (ref. no., warning no., employee, division, position, date) plus the reasons;
  search, reason, division and date filters; total and by-month cards.
- Permission `HR.WARNING_LETTERS` (VIEW opens; CREATE / UPDATE save). The registry name now matches the TEST
  catalogue ("Warning Letter"): RESOURCE and all four permissions MATCH. Switch `VITE_FEATURE_HR_WARNING_LETTER`.

## 4. Backend

`/api/v1/hr/warning-letters` unchanged. Checked read-only on TEST: list (with every filter and `limit=0`),
employee search and details, read and print all succeed.

## 10. Validation

| Check | Result |
|---|---|
| `cd client; npx eslint src tests`, `npm test` | No problems; 468 tests: 464 pass, 0 fail, 4 todo |
| `cd client; npx vite build` (temporary directory) | Built |
| Oracle TEST, read-only | As §4 |
| Create / update on TEST | **Not performed** (no database writes authorized) |
| Browser | **Not performed** |
