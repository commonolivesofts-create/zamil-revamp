# HR recruitment forms (1060, 1061, 1062)

The three forms are under **Human resources**:

| Form | Route | Record route | Data source |
|---|---|---|---|
| Personnel Requisition (1060) | `/hr/recruitment/requisition` | `/hr/recruitment/requisition/:requisitionId` | Live `/api/v1/hr/requisitions` API |
| Interview Assessment (1061) | `/hr/recruitment/interview` | `/hr/recruitment/interview/:assessmentId` | Existing in-memory demo adapter |
| Employment Offer (1062) | `/hr/recruitment/offer` | `/hr/recruitment/offer/:offerId` | Existing in-memory demo adapter |

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

## Other recruitment forms

Interview Assessment and Employment Offer still use `demo/demoClient.js` and `demo/demoData.js`
while their backend APIs are developed. `VITE_HR_RECRUITMENT_DEMO` continues to select that client
for those forms only. Their demo badge remains visible; the live Personnel Requisition page does
not show a demo label.

## Permissions and follow-up

The requisition routes use the existing `REQUISITIONS.REQUISITIONS:VIEW` permission. Save and
inline attachment upload controls check `CREATE` or `UPDATE` for the current record. The backend
continues to authorize every request, and its standalone attachment endpoints use
`MANAGE_ATTACHMENTS`. Interview Assessment and Employment Offer remain session-only until their
integrations are implemented.

Follow-up work for forms 1061 and 1062 includes implementing their backend API contracts, removing
their demo adapter/data, and verifying both forms against those APIs.
