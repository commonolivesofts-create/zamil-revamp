# Feature Handoff Template

Copy this file to `docs/handoffs/FEATURE-<NAME>.md` (for example
`docs/handoffs/FEATURE-WIDGET-REQUESTS.md`) and fill in every section. Write "None" or "Not
applicable" rather than deleting a section. Record only facts that were verified; mark anything
untested as **not verified**. Do not include credentials, employee data or production records.

---

# Feature handoff — `<Feature name>`

## 1. Summary

| Item | Value |
|---|---|
| Feature name | |
| Business purpose | One or two sentences |
| Business owner | Name or role |
| Developer(s) | |
| Status | Implemented / Partially implemented / Blocked |
| Replaces CI3 feature | Controller/route name, or "New" |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/...` |
| Commit(s) | `abc1234` — description |
| Pull Request | `#NN` (link) |
| Merged into `main` | Yes (commit) / Not yet |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | | Yes / No | Test name, screenshot, command output |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| New | `server/src/modules/...` | |
| Modified | `client/src/config/appNavigation.js` | Route registration |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| | `/...` | `MODULE.RESOURCE:VIEW` | | Yes / No | Yes / No (`nav: false`) |

Buttons and the permission each one requires:

| Button / action | Permission |
|---|---|
| | `MODULE.RESOURCE:ACTION` |

## 6. API endpoints and contracts

| Method | Path | Permission | CSRF | Request | Success response | Documented errors |
|---|---|---|---|---|---|---|
| GET | `/api/v1/...` | `MODULE.RESOURCE:VIEW` | No | query: `page`, `limit`, ... | `200` envelope / paginated | `400`, `401`, `403`, `404` |

OpenAPI updated: Yes (`operationId`s: ...). Listed in `server/tests/api-docs.test.js`: Yes / No.

## 7. Oracle database

| Object | Type | Access (read / write) | Existing or new | Pool |
|---|---|---|---|---|
| `TABLE_NAME` | Table | Read | Existing | LOW |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None / file path and change identifier |
| Approval reference (gate G1/G4) | Who approved, when, reference |
| Applied to TEST | Not applied / applied on date by whom, verification result |
| Transactions | Which service operations use `withTransaction` |

## 8. Authentication and permissions

| Item | Value |
|---|---|
| New permission codes (module.resource:action) | |
| Created in the catalogue by | Administrator / not yet created |
| Record-level / organizational rules | Where enforced (service file) |
| Security approval (gate G2) | Not applicable / reference |

## 9. Shared components and services reused

- Frontend: e.g. `apiClient`, `usePermissions`, `AdminUi.jsx` building blocks, ...
- Backend: e.g. `authorize`, `validate`, `withTransaction`, `sendPaginated`, ...
- New shared code introduced (gate G3): None / description and approval.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed by, date |
|---|---|---|---|
| Backend lint, format, tests | `cd server; npm run check` | e.g. "N/N passed" (actual output) | |
| Frontend lint | `cd client; npm run lint` | | |
| Frontend tests | `cd client; npm test` | | |
| Frontend build + release check | `npm run build; node scripts/verify-production.mjs` | | |
| Browser verification | Steps performed | | |
| Oracle TEST verification | Script or manual steps; read-only or authorized write | Not performed / result | |

## 11. Screenshots

Relevant UI states (list, empty, error, denied, dialog), with fictional or masked data only.

## 12. Known limitations and dependencies

- (none / list each)

## 13. Follow-up work

- (none / list each)

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | |
| Review outcome | Approved / Changes requested |
| Handoff accepted by | |
| Date | |
