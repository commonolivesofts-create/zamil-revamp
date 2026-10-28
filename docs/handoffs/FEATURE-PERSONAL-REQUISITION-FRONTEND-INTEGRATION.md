# Feature handoff — Personnel Requisition frontend integration

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Personnel Requisition (form 1060) frontend integration |
| Business purpose | Connect the existing form to the implemented requisition API and remove sample requisition data from this page. |
| Business owner | Project owner (HR forms) |
| Developer(s) | Codex |
| Status | Implemented; live API/runtime behavior not verified against Oracle |
| Replaces CI3 feature | Existing Personal Requisition Form API implementation; no CI3 code changed |

## 2. Source control

| Item | Value |
|---|---|
| Branch | Current task branch (not changed) |
| Commit(s) | None |
| Pull Request | Not opened |
| Merged into `main` | No |

## 3. Requirement and acceptance criteria

| # | Acceptance criterion | Verified? | Evidence |
|---|---|---|---|
| 1 | Personnel Requisition calls the existing `/api/v1/hr/requisitions` backend and lookup routes. | Not runtime verified | Frontend service paths and request mappings reviewed against backend routes, validation and service code. |
| 2 | New requisition values begin blank; requester, number and status come from the backend. | Code reviewed | Blank form model and authenticated requestor lookup; request date is supplied on first save as required by create validation. |
| 3 | Frontend fields and values match backend field names, enums, date format and statuses. | Code reviewed | Mapping reviewed against `requisition.validation.js`, `requisition.service.js` and repository response fields. |
| 4 | Save uses backend draft create/update behavior; no unsupported submit/approval route is called. | Code reviewed | `POST`/`PUT` followed by `GET`; no submit control or route call. |
| 5 | Requisition routes and actions use backend permission identities. | Code reviewed | Registry uses `REQUISITIONS.REQUISITIONS` with VIEW/CREATE/UPDATE/MANAGE_ATTACHMENTS. |

## 4. Files

| New / Modified / Deleted | Path | Purpose |
|---|---|---|
| Modified | `client/src/features/hr-recruitment/hrRecruitmentService.js` | Uses live lookup, CRUD, list, budget, and multipart upload endpoints for requisitions. |
| Modified | `client/src/features/hr-recruitment/requisition/requisitionModel.js` | Blank initial values and backend-compatible field/value mapping. |
| Modified | `client/src/features/hr-recruitment/requisition/RequisitionPage.jsx` | Uses live lookups, honors backend statuses and permissions, saves without an unsupported submit action. |
| Modified | `client/src/features/hr-recruitment/shared/components/RecruitmentLoader.jsx` | Allows the requisition page to load its own backend lookups. |
| Modified | `client/src/features/hr-recruitment/shared/components/RecruitmentShell.jsx` | Hides demo status on the live requisition page and honors action disabled state. |
| Modified | `client/src/features/hr-recruitment/shared/components/RecruitmentInputs.jsx` | Sends selected attachment file objects as uploads. |
| Modified | `client/src/features/hr-recruitment/shared/useRecruitmentForm.js` | Adds saved-form reset handling after attachment deletion. |
| Modified | `client/src/features/hr-recruitment/hrRecruitmentText.js` | Removes incorrect requisition submission and demo wording. |
| Modified | `client/src/features/hr-recruitment/interview/interviewModel.js` | Recognizes backend-approved requisitions when linking a requisition number. |
| Modified | `client/src/features/hr-recruitment/hrRecruitmentActions.js` | Matches requisition actions to backend permission keys. |
| Modified | `client/src/config/registry/actions.js`, `client/src/config/registry/index.js`, `client/src/config/registry/modules/hrRecruitment.module.js` | Registers the existing attachment action and separates live requisition access from the two remaining demo forms. |
| New | `client/src/config/registry/modules/requisitions.module.js` | RBAC navigation metadata matching the backend `REQUISITIONS.REQUISITIONS` resource. |
| Modified | `client/src/features/hr-recruitment/README.md` | Documents actual requisition endpoints and remaining demo scope. |

## 5. Frontend routes and navigation

| Route id | Path | Permission | `alsoRequires` | MFA | In sidebar? |
|---|---|---|---|---|---|
| `hr-requisition` | `/hr/recruitment/requisition` | `REQUISITIONS.REQUISITIONS:VIEW` | None | No (API enforces policy) | Yes |
| `hr-requisition-record` | `/hr/recruitment/requisition/:requisitionId` | `REQUISITIONS.REQUISITIONS:VIEW` | None | No (API enforces policy) | No |

The backend checks CREATE/UPDATE on save (including inline multipart uploads) and
MANAGE_ATTACHMENTS on its standalone attachment routes. Delete is supported by the API but no
delete-record UI is exposed here.

## 6. API endpoints and contracts

| Method | Path | Permission | CSRF | Request / response |
|---|---|---|---|---|
| GET | `/api/v1/hr/requisitions` | VIEW | No | Query uses `page`, `pageSize` and backend filters; paginated backend fields mapped for the report. |
| GET | `/api/v1/hr/requisitions/:requisitionId` | VIEW | No | Reads the backend record and attachments. |
| POST | `/api/v1/hr/requisitions` | CREATE | Yes | Sends required `requestDate` plus backend `jobName`, `deptName`, `dateNeeded`, `reasonOfReq` and supported optional fields. Multipart `files` accepted. |
| PUT | `/api/v1/hr/requisitions/:requisitionId` | UPDATE | Yes | Updates the backend's allowed editable fields; `requestDate` is omitted. Multipart `files` accepted. |
| DELETE | `/api/v1/hr/requisitions/:requisitionId` | DELETE | Yes | Removes a backend-eligible draft. |
| DELETE | `/api/v1/hr/requisitions/:requisitionId/attachments/:attachmentId` | MANAGE_ATTACHMENTS | Yes | Removes one saved attachment. |
| GET | `/api/v1/hr/requisitions/lookups/job-titles` | VIEW | No | Job IDs and names. |
| GET | `/api/v1/hr/requisitions/lookups/departments` | VIEW | No | Department IDs and names. |
| GET | `/api/v1/hr/requisitions/lookups/requestor` | VIEW | No | Authenticated requestor details. |
| GET | `/api/v1/hr/requisitions/lookups/replacement-for` | VIEW | No | Replacement candidate names. |
| GET | `/api/v1/hr/requisitions/lookups/budget?fullName=...` | VIEW | No | Salary/package lookup for the selected replacement. |

No backend files, OpenAPI documents, Oracle schema objects, or permission rows were changed.

## 7. Oracle database

No database changes or writes were made during this task. At runtime, existing backend create/update
requests write through its existing service transaction.

## 8. Authentication and permissions

Frontend navigation and action permissions use the backend module/resource identity
`REQUISITIONS.REQUISITIONS`. The backend remains authoritative for all API calls and record scope.
The new frontend registry metadata does not create or grant any Oracle permissions.

## 9. Shared components and services reused

- Frontend: shared `apiClient`, API CSRF handling, `useResource`, `useRecruitmentForm`, `usePermissions`, existing form shell and input components.
- Backend: existing `/hr/requisitions` routes and lookup endpoints; no backend code changed.
- New shared architecture: None.

## 10. Validation and test evidence

| Check | Command / method | Result | Executed |
|---|---|---|---|
| Frontend lint | `cd client; npm.cmd run lint` | Passed (exit 0) | 28 Oct 2026 |
| Tests | Not run | Not requested | 28 Oct 2026 |
| Build | Not run | Not verified | 28 Oct 2026 |
| Browser / Oracle runtime | Not run | Not verified | 28 Oct 2026 |

## 11. Screenshots

None captured.

## 12. Known limitations and dependencies

- Requisition API behavior has not been exercised against a running server or Oracle instance.
- Existing backend has no submit/approval route; this UI saves requisitions in the backend's existing statuses.
- Ticket status can only be changed by HR users; the backend enforces this and may reject changes by other users.
- Existing backend returns attachments as metadata; this UI supports upload during save and removal of saved attachments.
- Interview Assessment and Employment Offer continue to use their existing demo adapter.
- Frontend permission gates depend on the owner's existing Oracle catalogue grants; the frontend registry does not grant access.

## 13. Follow-up work

- Verify permitted create/update/read/upload flows against a configured backend with approved test data.
- Integrate Interview Assessment and Employment Offer with their backend endpoints in follow-up work.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Pending |
| Review outcome | Pending |
| Handoff accepted by | Pending |
| Date | 28 Oct 2026 |
