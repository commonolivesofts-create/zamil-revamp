# Feature handoff — Interview Assessment Form CRUD API (HR)

## 1. Summary

| Item     | Value                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature  | Interview Assessment Form CRUD API per `README_interview_assessment_form.md`: INSERT, READ, UPDATE, DELETE, LISTING WITH FILTERS, plus the nationality / approved-requisition / interviewer-employee lookups                                                                                                                                                                                                                          |
| Release  | Zamil Digitalization V 2.1.0                                                                                                                                                                                                                                                                                                                                                                                                          |
| Status   | Implemented backend-only; `npm run check` (lint, format, 572 tests) passes; no browser driven; no Oracle schema change, no new dependency, no workflow/approval logic                                                                                                                                                                                                                                                                 |
| Approval | Owner-approved decisions: permission codes `INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS` × VIEW/CREATE/UPDATE/DELETE (aligned 2026-10-27 to the owner-registered Oracle catalogue: module `INTERVIEW_ASSESSMENTS` instead of `HR`; UPDATE chosen over the README's EDIT so the code exists in the standard vocabulary the admin panel's action picker can register); README-verbatim list params; uniform delete guard (no bypass); row scoping on LIST only; SUPER_ADMINISTRATOR all-access exemption granted then withdrawn by the owner (2026-10-27): deny-by-default applies to every account |

## 2. Source control

| Item         | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Branch       | `backend/hr-forms` (pre-existing)                         |
| Commit       | None yet — all changes are uncommitted working-tree edits |
| Pull Request | Owner creates, reviews and merges                         |

## 3. Requirement and acceptance criteria

| #   | Criterion                                                                                                                                                                                                                                                 | Verified | Evidence                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | INSERT: POST creates header + 3 section rows in ONE `withTransaction(POOLS.LOW, …)`; returns 201 `{headerId, intNo, uuid}`; STATUS only ever written 'Incomplete'                                                                                         | Yes      | `tests/interview-assessments.test.js` POST suite incl. transaction rollback via `failures.interviewInsert` |
| 2   | requisitionNo must be an approved requisition (§9) before any write                                                                                                                                                                                       | Yes      | 400 `VALIDATION_ERROR`, field `requisitionNo`; no header inserted                                          |
| 3   | rate9 / cRating7 recomputed server-side; empty text → `-`, empty numbers → 0; ISO `YYYY-MM-DD` dates stored as `DD-Mon-YY`                                                                                                                                | Yes      | POST/PUT assertions on stored header/section values                                                        |
| 4   | READ: GET /:headerId returns header + approval authority (XX_DIGI_JOB_MASTER) + 3 sections; missing children come back `null`; unknown id → 404 `RESOURCE_NOT_FOUND` "Interview assessment not found"                                                     | Yes      | READ suite                                                                                                 |
| 5   | UPDATE: PUT replaces all four sections in ONE transaction, MERGE-upserts missing rows, recomputes totals, mirrors interviewer/BU columns, never changes STATUS; 404 when absent; strict payload                                                           | Yes      | UPDATE suite                                                                                               |
| 6   | DELETE: children then header in ONE transaction; 409 `CANNOT_DELETE_APPROVED` when STATUS='Approved' AND evaluation='Passed'; 404 when absent; rollback keeps all rows                                                                                    | Yes      | DELETE suite incl. rollback via `failures.interviewDelete`                                                 |
| 7   | LISTING: page/pageSize (default 20, max 100), allowlisted sortBy (HEADER_ID \| INTERVIEW_DATE \| CANDIDATE_NAME \| CREATION_DATE) + sortDir, all §7.1 filters, stable HEADER_ID tie-breaker, standard `sendPaginated` envelope, `Cache-Control: no-store` | Yes      | LISTING suite                                                                                              |
| 8   | Status display: `statusLabel` (Inprocess→InProcess, else Approved/Rejected, otherwise 'Draft'); `evaluationStatus` null unless headerStatus='Approved'                                                                                                    | Yes      | LISTING defaults test                                                                                      |
| 9   | Row scoping (§7.4) on LIST only: HR users (XX_DIGI_LOOKUP_VALUES XXZP_HR) see all rows and may filter by createdBy; non-HR users see only `CREATED_BY = actor.userId`, query value ignored                                                                | Yes      | scoping test (spoofed `createdBy` rejected server-side)                                                    |
| 10  | Guards in order authenticate → requireCsrfToken (changes) → authorize → validate; 401 / 403 NO_GRANT (default deny) / 403 EXPLICIT_DENY / 403 CSRF_REJECTED audited as ACCESS_DENIED                                                                      | Yes      | authorization and CSRF suite                                                                               |
| 11  | Three lookups under VIEW; no query parameters accepted                                                                                                                                                                                                    | Yes      | lookups suite (400 on `?page=2`)                                                                           |
| 12  | Every operation documented in `server/docs/openapi/openapi.yaml` and registered in `tests/api-docs.test.js` in the same change                                                                                                                            | Yes      | `npm run check` (SwaggerParser validation + route-list assertions)                                         |

## 4. Files

| New / Modified | Path                                                                            | Purpose                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New            | `server/src/modules/hr/interview-assessments/interviewAssessment.validation.js` | Joi schemas: `listQuerySchema`, `writeBodySchema` (strict, unknown keys rejected), `headerIdParams`, empty query/body                                            |
| New            | `server/src/modules/hr/interview-assessments/interviewAssessment.repository.js` | All SQL §3–§8; bind variables only; `SORT_COLUMNS` / filter allowlists; 3 lookups; `POOLS.LOW` reads                                                             |
| New            | `server/src/modules/hr/interview-assessments/interviewAssessment.service.js`    | Business rules: one transaction per write, requisition guard, normalization, totals, HR scope, 409 delete guard                                                  |
| New            | `server/src/modules/hr/interview-assessments/interviewAssessment.controller.js` | HTTP adapter; `sendSuccess` / `sendPaginated` envelopes                                                                                                          |
| New            | `server/src/modules/hr/interview-assessments/interviewAssessment.routes.js`     | Mount `/api/v1/hr/interview-assessments`; guard order; `Cache-Control: no-store`; lookups declared before `/:headerId`                                           |
| Modified       | `server/src/routes/api.routes.js`                                               | Builds the service with `deps.interviewAssessmentRepository` + `db.*`, mounts the router                                                                         |
| New            | `server/tests/helpers/interviewAssessmentFakes.js`                              | In-memory repository double over the auth store's `state` (transaction snapshot/rollback), `seedAssessment`, failure flags `interviewInsert` / `interviewDelete` |
| New            | `server/tests/interview-assessments.test.js`                                    | 33 Supertest cases: success paths, 400, 401, 403 (NO_GRANT, EXPLICIT_DENY, CSRF), 404, 409, pagination bounds, filters, scoping, lookups, rollback ×2            |
| Modified       | `server/docs/openapi/openapi.yaml`                                              | `HR Interview Assessments` tag, 8 operations, `HeaderId` parameter, 10 schemas, 409 response                                                                     |
| Modified       | `server/tests/api-docs.test.js`                                                 | Route-list + security + CSRF-parameter assertions for the 8 new operations                                                                                       |

## 5. Implementation decisions

- **Permission key:** `INTERVIEW_ASSESSMENTS.INTERVIEW_ASSESSMENTS` with `VIEW` (list + read +
  lookups), `CREATE`, `UPDATE` (PUT — switched from the README's `EDIT` with owner approval so
  the action is part of the standard vocabulary `config/registry/actions.js` and can be
  registered from the admin panel's Permission Catalog picker), `DELETE`. Key aligned 2026-10-27
  to the owner-registered Oracle catalogue (module `INTERVIEW_ASSESSMENTS` instead of `HR`); the
  catalogue rows exist and are granted to `SUPER_ADMINISTRATOR`. Tests seed the same catalogue
  in memory — default deny for every role, the Super Administrator included.
- **Super-administrator all-access exemption withdrawn (owner decision, 2026-10-27):** an
  exemption that had let an active `SUPER_ADMINISTRATOR` member hold every permission — unknown
  or ungranted — was granted and then withdrawn by the owner the same day, restoring plain
  deny-by-default in `authorization.service.js` / `authorization.repository.js`: every account
  sees only the modules whose permissions are granted to it, and `GET /me/permissions` lists
  role grants and overrides only, so the client's `can()` agrees with the API. The
  `docs/SECURITY-ESSENTIALS.md` "no bypasses" wording and the "default deny for everyone"
  decision hold again; the interview suite now asserts the absence of the exemption (a
  SUPER_ADMINISTRATOR member without grants gets 403 `NO_GRANT` and an empty `/me/permissions`).
- **IDs** (NUMBER(19,0)) travel as decimal strings end to end; rows are mapped to camelCase.
- **Dates:** request bodies and query filters use `YYYY-MM-DD` (validated for calendar
  correctness); the repository binds legacy `DD-Mon-YY` strings and reads them back the same
  way, so responses carry the stored legacy form (documented in the OpenAPI schemas).
- **Strict payload:** PUT takes the same body as POST; unknown fields are rejected (mass-assignment
  guard). `status` accepts only `Incomplete`; the service never updates STATUS.
- **List sort:** allowlisted `SORT_COLUMNS` map instead of `CASE WHEN :sortBy` binds — identical
  semantics, no identifier interpolation, stable HEADER_ID tie-breaker on both directions.
- **No clamping of `page`:** a beyond-range page returns an empty `data` array with exact totals
  (Oracle `OFFSET/FETCH` semantics); the test asserts this explicitly.
- **409 guard is uniform** — no role bypass, matching the owner decision.

## 6–7. API and Oracle

New API surface (all under `/api/v1/hr/interview-assessments`): `GET /`, `POST /`,
`GET /{headerId}`, `PUT /{headerId}`, `DELETE /{headerId}`, `GET /lookups/nationalities`,
`GET /lookups/requisitions`, `GET /lookups/employees`. Documented in
`server/docs/openapi/openapi.yaml`.

No DDL, no schema change, no new dependency. Tables touched at runtime (SQL written per
README §3–§8): `XXZP_INTERVW_ASSESMNT_HEADER_T`, `XXZP_PERSONAL_SPEC_T`,
`XXZP_JOB_COMPETENCY_T`, `XXZP_INTERVIEW_EVAL_T`, reads of `XXZPI_PER_REQUISITIONS_ALL`,
`XXZP_NATIONALITY`, `XX_DIGI_JOB_MASTER`, `XX_DIGI_LOOKUP_VALUES`.

## 8. Authentication and permissions

Session cookie authentication; CSRF token required on POST/PUT/DELETE; authorization
re-evaluated in Oracle per request (deny by default, explicit DENY wins; no super-administrator
exemption — the Super Administrator needs its grants like every other account). No workflow,
approval, email or status-transition logic anywhere — STATUS is plain data (README §6).

## 10. Validation and test evidence

```
cd server; npm run check
> eslint .                       → clean
> prettier --check .             → clean
> node --import ./tests/setup.js --test
  ℹ tests 572   ℹ suites 125   ℹ pass 572   ℹ fail 0   (duration ~54 s)
```

Includes the 33 new `interview-assessments` cases (the authorization suite now asserts the
absence of the super-administrator exemption: without a grant the role is denied with `NO_GRANT`
and `/me/permissions` is empty), the 8 `api-docs` cases (OpenAPI 3.1 validated by SwaggerParser)
and the 36-case `employment-offers` suite that appeared in the working tree concurrently
(untracked; untouched by this change and green).

## 12. Known limitations

- **SQL is not executed against Oracle** in this environment: the repository's statements are
  covered by code review and by the in-memory double only. A read-only verification script
  against TEST (pattern of `scripts/verify-auth-sql.js`) is still recommended before merge.
- **Permission keys aligned to the owner-registered Oracle catalogue (2026-10-27):** module
  `INTERVIEW_ASSESSMENTS`, resource `INTERVIEW_ASSESSMENTS`, VIEW/CREATE/UPDATE/DELETE granted to
  `SUPER_ADMINISTRATOR`. The README's `HR.INTERVIEW_ASSESSMENTS` key is stale — updating the
  README is owner-side. Non-super-admin roles still need their own grants.
- Bugs found and fixed while writing the tests (worth noting for review): Joi's `.isoDate()`
  converted values before the pattern check (no date could ever validate); the three child
  INSERTs did not bind `:headerId` (would have failed with ORA-01008); `evaluation` is now
  required by the write schema because the service reads `evaluation.status`.
- Nothing committed or pushed; `README_interview_assessment_form.md` is still untracked.

## 13. Follow-up (not in this change)

1. Permission catalogue registration — done by the owner as module `INTERVIEW_ASSESSMENTS`
   (resource `INTERVIEW_ASSESSMENTS`, 4 actions, granted to `SUPER_ADMINISTRATOR`); the code was
   aligned to those keys on 2026-10-27. Grant the permission to any non-super-admin role that
   needs it (admin panel: Security Administration → Role permissions).
2. Read-only SQL verification script against TEST.
3. Client UI for the form (separate, explicitly client-side change).
