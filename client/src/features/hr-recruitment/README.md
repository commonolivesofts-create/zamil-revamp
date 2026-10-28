# HR recruitment forms (1060, 1061, 1062)

The three forms are under **Human resources**:

| Form | Route | Record route | Data source |
|---|---|---|---|
| Personnel Requisition (1060) | `/hr/recruitment/requisition` | `/hr/recruitment/requisition/:requisitionId` | Live `/api/v1/hr/requisitions` API |
| Interview Assessment (1061) | `/hr/recruitment/interview` | `/hr/recruitment/interview/:assessmentId` | Live `/api/v1/hr/interview-assessments` API |
| Employment Offer (1062) | `/hr/recruitment/offer` | `/hr/recruitment/offer/:offerId` | Live `/api/v1/hr/employment-offers` API |

## Personnel Requisition API

This form always uses the shared authenticated `apiClient`, including in development. It does not
read seeded/sample requisitions. A new form starts blank; its request date is supplied as the
current business date when the user first saves because the backend requires `requestDate` on
insert. The backend supplies requester details, record number and status.

The frontend maps its form values to the existing backend contract:

| Frontend value | Backend field/value |
|---|---|
| Job title and department selections | `jobId`/`jobName`, `deptId`/`deptName` |
| Needed date | `dateNeeded` (`YYYY-MM-DD`) |
| Replacement / addition choice | `reasonOfReq`: `Replacement` / `Addition` |
| Replacement person / addition explanation | `replacementFor` / `reason` |
| Budget and education answers | `Y` / `N` values (`budgeted`, `highSchool`, `diploma`, `higherDiploma`, `degree`, `masterDegree`) |
| Experience | `gccExp`, `workExp`: `0 - 2`, `2 - 5`, `5 - 10`, `> 10` |
| Skills, other requirements, remarks, package | `skills`, `other`, `remark`, `totalPackage` |

Lookups come from `GET /hr/requisitions/lookups/{job-titles,departments,requestor,replacement-for}`;
the replacement salary uses `GET /hr/requisitions/lookups/budget?fullName=...`. Records use `GET`
list/detail, `POST` create and `PUT` update. Save responses contain an ID, so the frontend loads
the saved record with `GET /:requisitionId`. Lists use `pageSize` and the backend's actual
requisition filters. Uploads use multipart `files` parts on create/update; saved attachments can be
removed through the existing attachment route. The shared client handles `FormData` without
setting a JSON content type. Drafts can be deleted through the backend delete route. Ticket-status
changes are optional and HR-only; the frontend sends them only when explicitly changed, and the
backend's existing role check remains authoritative.

The existing backend only creates and updates requisitions. It has no submit or approval action;
statuses are `Draft`, `Inprocess`, `Approved` and `Rejected`. The frontend therefore saves drafts
and honors the backend's read-only states (`Inprocess` and `Approved`) instead of calling a
nonexistent submit route. The backend's ticket status is HR-only and remains server-controlled by
its existing authorization and validation rules.

## Interview Assessment API

This form uses the shared authenticated API client in every environment. It loads nationalities,
approved requisitions and interviewers from the backend lookup routes, and maps the existing form
to the backend's `requisitionNo`, `positionName`, `attribute3`, candidate fields, rating sections
and evaluation object. The two allowed `attribute3` business-unit codes are provided as a select
because the backend exposes no friendly labels. Rating rows support 1–5 and `N/A`.

Records use `GET /hr/interview-assessments` and `GET /:headerId`, `POST /` to create, `PUT /:headerId`
to update and `DELETE /:headerId` to delete. The form preserves backend-owned evaluation fields
when loading and saving existing records. The backend has no submit or approval action, so the
last form action saves the assessment; the backend controls its status.

## Employment Offer API

This form uses the shared authenticated API client in every environment. It loads approved and
passed interview candidates, titles, business-unit IDs and benefit allowances from the backend.
Candidate selection fills the interview number, requisition number and position. The form maps its
bilingual package rows to the backend's single `line` object and uses the number-to-Arabic and
Hijri-date helpers for basic salary and starting date. Business-unit values remain raw IDs because
the backend deliberately does not provide labels.

Records use `GET /hr/employment-offers` and `GET /:headerId`, `POST /` to create, `PUT /:headerId`
to update and `DELETE /:headerId` to delete. The backend only supports CRUD: status is always
`Incomplete`, and there is no issue, signature or acceptance action. The form therefore saves the
offer record and does not present a workflow action that the API cannot perform.

## Permissions and follow-up

The requisition routes use the existing `REQUISITIONS.REQUISITIONS:VIEW` permission. Save and
inline attachment upload controls check `CREATE` or `UPDATE` for the current record. The backend
continues to authorize every request, and its standalone attachment endpoints use
`MANAGE_ATTACHMENTS`. Interview Assessment uses the backend's `INTERVIEW_ASSESSMENTS` resource;
Employment Offer uses `EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS`. Both check view, create, update and
delete permissions.

All three recruitment forms are connected to their existing backend APIs; only the unused demo
adapter remains as development scaffolding.
