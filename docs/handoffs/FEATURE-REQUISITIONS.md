# Feature handoff — Personal Requisition Form CRUD API (HR)

## 1. Summary

| Item     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature  | Personal Requisition Form CRUD API per `README_personal_requisition_form.md`: INSERT, READ, UPDATE, DELETE, LISTING WITH FILTERS, attachment sub-routes, plus the job-title / requestor / department / replacement-for / budget / filter-option lookups                                                                                                                                             |
| Release  | Zamil Digitalization V 2.1.0                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Status   | Implemented backend-only; `npm run check` (lint, format, 609 tests) passes; no browser driven; no Oracle schema change, no sequences, no DDL; one new dependency (`multer`, owner-approved); no workflow/approval logic                                                                                                                                    |
| Approval | Owner approved every recommendation on 2026-10-27/28 ("keep recommended response as all my answer"): permission key `HR.REQUISITIONS` × `VIEW, CREATE, UPDATE, DELETE, MANAGE_ATTACHMENTS` (UPDATE chosen over the README's EDIT for the standard action vocabulary); multipart via `multer`; disk attachment storage; uniform delete guards with no bypass; house response envelopes over the README's sample shapes                       |

## 2. Source control

| Item         | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Branch       | `backend/hr-forms` (pre-existing)                         |
| Commit       | None yet — all changes are uncommitted working-tree edits |
| Pull Request | Owner creates, reviews and merges                         |

## 3. Requirement and acceptance criteria

| #   | Criterion                                                                                                                                                                                                                                                                      | Verified | Evidence                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | INSERT: POST `/` creates the header in ONE `withTransaction(POOLS.LOW, …)`; REQUISITION_ID = `NVL(MAX(REQUISITION_ID + 20), 100000)`, REQUISITION_NUMBER = REQUISITION_ID (§3.1); REQUISITION_STATUS only ever written 'Draft'; REQUESTED_BY / REQUESTER_NAME server-set from the employee master, rejected when taken from the body | Yes      | `tests/requisitions.test.js` insert suite, incl. transaction rollback via `requisitionStorage.failures.save` (Nth-save injection) |
| 2   | Conditional payload (§3.2): `replacementFor` required for reasonOfReq 'Replacement', `reason` for 'Addition'; unknown fields and invalid enums rejected; dates accepted as ISO `YYYY-MM-DD`, stored as `DD-Mon-YY`                                                              | Yes      | insert suite (400 with field detail)                                                                         |
| 3   | READ: GET `/{requisitionId}` returns the header + its attachment rows (xxzp_all_attachments, FORM_NAME 'Requisition'); business dates out in the stored legacy 'DD-Mon-YY' form                                                                                                 | Yes      | read suite                                                                                                   |
| 4   | UPDATE: PUT full-replaces the business fields in ONE transaction; REQUEST_DATE / REQUISITION_STATUS / REQUISITION_NUMBER / REQUESTER_NAME / REQUESTED_BY frozen (requestDate rejected as unknown field); non-HR callers get 409 `CANNOT_UPDATE_STATUS` on Inprocess/Approved (HR may always save)                                                | Yes      | update suite incl. 409 gate and HR override                                                                  |
| 5   | ticketStatus (ATTRIBUTE1) set only by HR (server-side XXZP_HR probe); non-HR sending a non-empty value → 400; absent on update preserves ATTRIBUTE1/14/15; explicit `''` clears them; Accepted/Close dates survive a re-save (corrected §5.1 wiping bug)                                                                                         | Yes      | HR ticketStatus test + multipart-append test asserting the surviving dates                                    |
| 6   | DELETE: header + attachment rows in ONE transaction, then the physical files; two uniform guards (no bypass, HR included): 409 `CANNOT_DELETE_STATUS` (non-Draft) and 409 `REQUISITION_IN_USE` (interview ATTRIBUTE4 reference)                                                                                                                 | Yes      | delete suite incl. both 409s and rollback via `failures.requisitionDelete`                                   |
| 7   | LISTING: page/pageSize (default 20, max 100), allowlisted sortBy (REQUISITION_ID \| REQUEST_DATE \| DATE_NEEDED \| REQUESTER_NAME \| CREATION_DATE) + sortDir, all §7.2 filters (`ticketStatus` NVL(ATTRIBUTE1,'Open')), standard `sendPaginated` envelope, `Cache-Control: no-store`                                                        | Yes      | listing suite (pagination bounds, each filter, sort stability)                                               |
| 8   | Row scoping (§7.4): HR users (XX_DIGI_LOOKUP_VALUES 'XXZP_HR') see every row and may narrow by createdBy; other users see their own rows plus those of recursively supervised employees, whatever they pass; out-of-scope by-id records are indistinguishable from missing ones (404)                                                             | Yes      | scoping tests on list, get, update, delete and both attachment routes (spoofed createdBy ignored)             |
| 9   | Guards in order authenticate → requireCsrfToken (unsafe verbs) → authorize → validate (multer runs after authorize, before validate); 401 / 403 `NO_GRANT` (default deny) / 403 `EXPLICIT_DENY` / 403 `CSRF_REJECTED`, all audited as ACCESS_DENIED with reasonCode               | Yes      | access-control suite                                                                                         |
| 10  | Attachments: POST `/{requisitionId}/attachments` multipart-only, ≥1 file, max 10 files, 10 MB each, §9 extension allowlist, rows + bytes in ONE transaction compensated on failure; DELETE `/{requisitionId}/attachments/{attachmentId}` removes the row then the file (missing file = no-op)                                                   | Yes      | attachments suite (upload, remove, empty-body 400, extension/count 400s, mid-transaction rollback)            |
| 11  | Six lookups under VIEW; no query parameters accepted except `fullName` (required) on budget; 404 when the session account has no employee record (requestor / replacement-for) or no employee matches (budget)                                                                                                                                  | Yes      | lookups suite                                                                                                |
| 12  | Every operation documented in `server/docs/openapi/openapi.yaml` and registered in `tests/api-docs.test.js` in the same change                                                                                                                                                   | Yes      | `npm run check` (SwaggerParser 3.1 validation + 13-operation route-list assertions)                          |

## 4. Files

| New / Modified | Path                                                                            | Purpose                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New            | `server/src/modules/hr/requisitions/requisition.validation.js`                  | Joi schemas: `createBodySchema` / `updateBodySchema` (strict, unknown keys rejected), `listQuerySchema`, `requisitionIdParams` / `attachmentIdParams`, empty query |
| New            | `server/src/modules/hr/requisitions/requisition.repository.js`                  | All SQL (§3–§8); named bind variables only; `SORT_COLUMNS` / filter allowlists; the six lookups; `POOLS.LOW` reads                                                 |
| New            | `server/src/modules/hr/requisitions/requisition.storage.js`                     | `createDiskStorage({ root: 'attachments' })`: files named `${attachmentId}_${sanitisedFileName}`; save/remove with missing-file no-op                               |
| New            | `server/src/modules/hr/requisitions/requisition.service.js`                     | Business rules: one transaction per write, scope (§7.4), ID seeding, ticketStatus HR gate, 409s, storage compensation                                              |
| New            | `server/src/modules/hr/requisitions/requisition.controller.js`                  | HTTP adapter (`req.files` = multer array); `sendSuccess` / `sendPaginated` envelopes                                                                               |
| New            | `server/src/modules/hr/requisitions/requisition.routes.js`                      | Mount `/api/v1/hr/requisitions`; guard order; `Cache-Control: no-store`; lookups declared before `/{requisitionId}`                                                 |
| Modified       | `server/src/routes/api.routes.js`                                               | Builds the service with `deps.requisitionRepository` / `deps.requisitionStorage ?? createDiskStorage()` and `db.*`, mounts the router                               |
| Modified       | `server/package.json` (+ lock)                                                  | New dependency `multer` (memory storage; no temp files)                                                                                                            |
| Modified       | `.gitignore`                                                                    | `/server/attachments/` — physical uploads are runtime data, never committed                                                                                        |
| New            | `server/tests/helpers/requisitionFakes.js`                                      | In-memory repository double (transaction snapshot/rollback) + memory storage double with 1-based `failures.save` Nth-save injection and `seedRequisition`          |
| New            | `server/tests/requisitions.test.js`                                             | 36 Supertest cases: success paths, 400, 401, 403 (NO_GRANT, EXPLICIT_DENY, CSRF), 404 (incl. scope), 409 ×3 codes, pagination, filters, lookups, rollbacks ×3    |
| Modified       | `server/docs/openapi/openapi.yaml`                                              | `HR Requisitions` tag, 13 operations, `RequisitionId` / `AttachmentId` parameters, 12 schemas, `RequisitionUpdateConflict` / `RequisitionDeleteConflict` responses |
| Modified       | `server/tests/api-docs.test.js`                                                 | Route-list + security + CSRF-parameter assertions for the 13 new operations                                                                                       |

## 5. Implementation decisions

- **Permission key:** `HR.REQUISITIONS` with `VIEW` (list + read + the six lookups), `CREATE`,
  `UPDATE` (PUT — the owner-approved switch from the README's EDIT, aligning with the standard
  action vocabulary), `DELETE`, `MANAGE_ATTACHMENTS` (the attachment sub-routes). Oracle
  catalogue registration is the owner's step; until then every account is denied with `NO_GRANT`.
- **Multipart via `multer`** (owner-approved dependency): memory storage, `upload.array('files', 10)`,
  10 MB per file; `MulterError` and size-limit errors surface as 400 `VALIDATION_ERROR`. POST `/`
  and PUT accept JSON (no attachments) or multipart (flat form fields + `files` parts); the
  attachment upload route is multipart-only. Repeated multipart fields parse as arrays and are
  rejected by Joi ("must be a string") — form fields are single-valued.
- **Physical storage:** disk under `server/attachments/` (git-ignored), files named
  `${attachmentId}_${sanitisedFileName}`; the row is authoritative — deleting a missing file is a
  no-op. Storage is an injected dependency, so tests exercise rollback with an in-memory double.
- **§5.1 correction:** ATTRIBUTE14/15 are updated by a non-wiping expression, so re-saving an
  Accepted/Close request keeps the previously stored date; `:today` from the README is played by
  `TO_CHAR(SYSDATE,'DD-Mon-YY')` inside the SQL — no client-supplied "today" exists.
- **ticketStatus:** HR-only (server-side XXZP_HR probe, never a body flag). On update: absent
  preserves ATTRIBUTE1/14/15; explicit `''` clears the group; non-HR sending a non-empty value
  gets 400. The list filter matches NVL(ATTRIBUTE1,'Open').
- **§7.4 scope on every by-id route:** out-of-scope records 404 on GET/PUT/DELETE and both
  attachment routes (indistinguishable from missing); the `createdBy` filter is honoured only for
  HR callers.
- **Delete guards are uniform** (no bypass, HR included): 409 `CANNOT_DELETE_STATUS` for non-Draft
  and 409 `REQUISITION_IN_USE` when an interview assessment references the number in ATTRIBUTE4.
- **Dates:** bodies/queries take ISO `YYYY-MM-DD`; responses return the stored legacy `DD-Mon-YY`
  form (ATTACHED_ON as `DD-Mon-YYYY`). IDs travel as decimal strings (`/^[1-9][0-9]{0,18}$/`).
- **House envelopes over the README's sample shapes:** `sendSuccess`/`sendPaginated` with
  `meta.requestId`; 403 body is `FORBIDDEN` with an ACCESS_DENIED audit `reasonCode`; CSRF code is
  `CSRF_REJECTED`. No SUPER_ADMINISTRATOR exemption — deny-by-default for every account.

## 6–7. API and Oracle

New API surface (all under `/api/v1/hr/requisitions`): `GET /` (list), `POST /`,
`GET /lookups/job-titles`, `GET /lookups/requestor`, `GET /lookups/departments`,
`GET /lookups/replacement-for`, `GET /lookups/budget`, `GET /lookups/filter-options`,
`GET /{requisitionId}`, `PUT /{requisitionId}`, `DELETE /{requisitionId}`,
`POST /{requisitionId}/attachments`, `DELETE /{requisitionId}/attachments/{attachmentId}`.
Documented in `server/docs/openapi/openapi.yaml`.

No DDL, no schema change, no sequences. Tables touched at runtime: `XXZPI_PER_REQUISITIONS_ALL`
(header; inserts take REQUISITION_ID from `NVL(MAX(REQUISITION_ID + 20), 100000)` — no sequence,
per README §11), `xxzp_all_attachments` (attachment rows), reads of `XX_DIGI_EMP_MASTER`,
`XX_DIGI_DEPT_MASTER`, `XX_DIGI_LOOKUP_VALUES` ('XXZP_HR'), `XXZP_INTERVW_ASSESMNT_HEADER_T`
(delete guard count only). No `XXPHP_WORKFLOW` / `XX_REQ_WF_REC` access anywhere.

## 8. Authentication and permissions

Session cookie authentication; CSRF token required on POST/PUT/DELETE; authorization
re-evaluated in Oracle per request (deny by default, explicit DENY wins; no super-administrator
exemption). `ticketStatus` and the HR `createdBy` filter consult the server-side XXZP_HR lookup,
never a client claim. No workflow, approval, email or status-transition logic — REQUISITION_STATUS
is plain data written 'Draft' on insert and never transitioned (README §11).

## 10. Validation and test evidence

```
cd server; npm run check
> eslint .                       → clean
> prettier --check .             → clean
> node --import ./tests/setup.js --test
  ℹ tests 609   ℹ suites 134   ℹ pass 609   ℹ fail 0   (duration ~79 s)
```

Includes the 36 new `requisitions` cases (transaction rollbacks via the Nth-save storage failure
and the delete failure flag, both 409 codes, scope-404 on every by-id route, the ticketStatus
date-survival correction) and the 10 `api-docs` cases (the 13 new operations; OpenAPI 3.1
validated by SwaggerParser).

## 12. Known limitations

- **SQL is not executed against Oracle** in this environment: repository statements are covered
  by code review and by the in-memory double only. A read-only verification script against TEST
  (pattern of `scripts/verify-auth-sql.js`) is still recommended before merge.
- **Permission catalogue registration is owner-side:** module `HR`, resource `REQUISITIONS`,
  actions VIEW/CREATE/UPDATE/DELETE/MANAGE_ATTACHMENTS. Until the rows exist and are granted,
  every caller receives 403 `NO_GRANT` (by design).
- Bugs found and fixed while writing the tests (worth noting for review): Joi's `.isoDate()`
  normalises date-only query values to full ISO instants (`2026-10-20` →
  `2026-10-20T00:00:00.000Z`), which would have raised ORA-01861 against
  `TO_DATE(:dateFrom,'YYYY-MM-DD')` — the service now slices filter dates back to the date-only
  form; `multer.array('files')` puts uploads directly on `req.files` (not `req.files.files`);
  repeated multipart fields become arrays and must be rejected, not joined.
- Nothing committed or pushed; `README_personal_requisition_form.md` is still untracked.

## 13. Follow-up (not in this change)

1. Permission catalogue registration — owner registers `HR.REQUISITIONS` (5 actions) and grants it
   to the roles that need it (admin panel: Security Administration → Role permissions).
2. Read-only SQL verification script against TEST (list filters, ID seeding arithmetic, the
   ATTRIBUTE14/15 non-wiping MERGE).
3. Client UI for the form (separate, explicitly client-side change).
