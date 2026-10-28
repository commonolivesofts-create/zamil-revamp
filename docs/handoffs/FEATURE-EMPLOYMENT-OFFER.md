# Feature handoff — Employment Offer Form CRUD API (HR)

## 1. Summary

| Item     | Value                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Feature  | Employment Offer Form CRUD API per `README_employment_offer_form.md`: INSERT, READ, UPDATE, DELETE, LISTING WITH FILTERS, plus the approved-candidate / title / allowance / business-unit / number-to-Arabic / Hijri-date lookups                                                                                                                                          |
| Release  | Zamil Digitalization V 2.1.0                                                                                                                                                                                                                                                                                                                                             |
| Status   | Implemented backend-only; `npm run check` (lint, format, 572 tests) passes; no browser driven; no Oracle schema change, no new dependency, no workflow/SMTP/status-transition/PDF logic                                                                                                                                                                                    |
| Approval | Owner-approved decisions: permission codes `EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS` × VIEW/CREATE/UPDATE/DELETE (aligned 2026-10-27 to the owner-registered Oracle catalogue: module `EMPLOYMENT_OFFERS`, action `UPDATE` replacing the README's `EDIT`; granted to `SUPER_ADMINISTRATOR`); README §7.1 list params incl. `sortDir`; ISO `YYYY-MM-DD` dates everywhere in responses; `GET /lookups/business-units` returns raw ids only                                              |

## 2. Source control

| Item         | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Branch       | `backend/hr-forms` (pre-existing)                         |
| Commit       | None yet — all changes are uncommitted working-tree edits |
| Pull Request | Owner creates, reviews and merges                         |

## 3. Requirement and acceptance criteria

| #   | Criterion                                                                                                                                                                                                                                                                       | Verified | Evidence                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| 1   | INSERT: POST inserts the header WITHOUT primary-key columns, reads `HEADER_ID` back by a Node-generated UUID, then inserts the single line — all in ONE `withTransaction(POOLS.LOW, …)`; returns 201 `{headerId, uuid}`; STATUS only ever written 'Incomplete'                       | Yes      | `tests/employment-offers.test.js` POST suite incl. rollback via `failures.offerInsert`            |
| 2   | Legacy insert defaults: empty `applicant` → `-`, empty/absent `reqNo` → 0, absent probationary text → the hardcoded §1.2 defaults (NVL in SQL), comma salary `"8,500"` stripped to a number, ISO dates stored as `DD-Mon-YYYY`                                                       | Yes      | POST assertions on the stored header/line rows                                                    |
| 3   | READ: GET /:headerId returns header + single line with ISO `YYYY-MM-DD` business dates and raw audit timestamps; a header saved without a line returns `line: null`; unknown id → 404 `RESOURCE_NOT_FOUND` "Employment offer not found"; line `ATTRIBUTE2` never exposed            | Yes      | READ suite (`'attribute2' in body.line === false`)                                                |
| 4   | UPDATE: PUT runs the §5.1 header `UPDATE` (row count checked → 404) and the §5.2 line `MERGE` (creates a missing line) in ONE transaction; never touches STATUS, `CREATED_BY`/`CREATION_DATE`, `PROBATIONARY_PERIOD(_AR)` or line `ATTRIBUTE2`; strict payload (no `status` key)     | Yes      | UPDATE suite incl. insert-only-column assertions                                                  |
| 5   | DELETE: line first (FK) then header in ONE transaction; 404 when absent; a failed transaction rolls back BOTH rows; no conflict guard while STATUS is write-once                                                                                                                   | Yes      | DELETE suite incl. rollback via `failures.offerDelete`                                            |
| 6   | LISTING: page/pageSize (default 20, max 100), allowlisted sortBy (`HEADER_ID` \| `OFFER_DATE` \| `EMPLOYEE_NAME` \| `CREATION_DATE`) + sortDir, all §7.1 filters (search, intNo, requisitionNo, division, status, dateFrom/dateTo, createdBy), stable HEADER_ID tie-breaker, `sendPaginated` envelope | Yes      | LISTING suite (filters, sorts, pagination, 400s)                                                  |
| 7   | Row scoping (§7.4) on LIST: HR users (`XX_DIGI_LOOKUP_VALUES` `XXZP_HR`) see all rows and may narrow by `createdBy`; non-HR users only see `CREATED_BY = actor.userId` — the query value is ignored, never trusted                       | Yes      | scoping test (spoofed `createdBy` returns only the actor's own row)                               |
| 8   | Guards in order authenticate → requireCsrfToken (changes) → authorize → validate; 401 / 403 NO_GRANT (default deny) / 403 EXPLICIT_DENY / 403 CSRF_REJECTED audited as ACCESS_DENIED; `Cache-Control: no-store` on every response                                                  | Yes      | authorization and CSRF suite                                                                      |
| 9   | Six lookups/helpers under VIEW; `excludeOffered` defaults to `false` (legacy behaviour); `medical`/`ticket` UNIONs kept verbatim; titles/business-units accept no query parameters                                | Yes      | lookups suite (incl. `?page=2` → 400, `excludeOffered=true` dedupe)                               |
| 10  | Every operation documented in `server/docs/openapi/openapi.yaml` and registered in `tests/api-docs.test.js` in the same change                                                                                                                                                    | Yes      | `npm run check` (SwaggerParser validation + route-list assertions)                                |

## 4. Files

| New / Modified | Path                                                                         | Purpose                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New            | `server/src/modules/hr/employment-offers/employmentOffer.validation.js`      | Joi schemas: `listQuerySchema`, strict `writeBodySchema` (single `line` object required), `headerIdParams`, lookup query schemas, empty query/body, `BU_VALUES`      |
| New            | `server/src/modules/hr/employment-offers/employmentOffer.repository.js`      | All SQL §3–§8; bind variables only; `SORT_COLUMNS` / `FILTERS` allowlists; UUID readback; §5.2 MERGE; 6 lookups; `POOLS.LOW` reads                                   |
| New            | `server/src/modules/hr/employment-offers/employmentOffer.service.js`         | Business rules: one transaction per write, UUID/legacy-date/defaults normalization, HR scope, exact 404 message, business-units constant                            |
| New            | `server/src/modules/hr/employment-offers/employmentOffer.controller.js`      | HTTP adapter; `sendSuccess` / `sendPaginated` envelopes                                                                                                             |
| New            | `server/src/modules/hr/employment-offers/employmentOffer.routes.js`          | Mount `/api/v1/hr/employment-offers`; guard order; `Cache-Control: no-store`; lookups declared before `/:headerId`                                                  |
| Modified       | `server/src/routes/api.routes.js`                                            | Builds the service with `deps.employmentOfferRepository` + `db.*`, mounts the router                                                                                |
| New            | `server/tests/helpers/employmentOfferFakes.js`                               | In-memory repository double over the auth store's `state` (transaction snapshot/rollback), `seedOffer` helper, failure flags `offerInsert` / `offerDelete`          |
| New            | `server/tests/employment-offers.test.js`                                     | 36 Supertest cases: success paths, 400, 401, 403 (NO_GRANT, EXPLICIT_DENY, CSRF), 404, pagination, filters, sorts, scoping, 6 lookups, rollback ×2                 |
| Modified       | `server/docs/openapi/openapi.yaml`                                           | `Employment Offers` tag, 11 operations (list/create/6 lookups/get/put/delete), 12 schemas, `404` on get/put/delete                                                   |
| Modified       | `server/tests/api-docs.test.js`                                              | Route-list + security + CSRF-parameter assertions for the 11 new operations                                                                                        |

## 5. Implementation decisions

- **Permission key:** `EMPLOYMENT_OFFERS.EMPLOYMENT_OFFERS` with `VIEW` (list + read + lookups),
  `CREATE`, `UPDATE` (PUT), `DELETE` — aligned 2026-10-27 with the owner-registered Oracle
  catalogue (module `EMPLOYMENT_OFFERS`, resource `EMPLOYMENT_OFFERS`; `UPDATE` replaces the
  README's `EDIT`, which is also outside the client registry's standard action vocabulary).
  The catalogue rows exist and are granted to `SUPER_ADMINISTRATOR`; tests seed the same
  catalogue in memory. Default deny for every other role.
- **PK strategy (README §1.3, §3.1):** `randomUUID()` in Node, header/line inserts omit all PK
  columns, `HEADER_ID` is read back by UUID inside the caller's transaction; the stale legacy
  fallback ids (144/230) are never used.
- **IDs** (NUMBER) travel as decimal strings end to end; rows map to camelCase. Legacy column
  spellings stay internal: header `division=ATTRIBUTE1`, `applicant=ATTRIBUTE2`, `to=ATTRIBUTE3`,
  `toArabic=ATTRIBUTE4`, `intNo=ATTRIBUTE10`, `reqNo=ATTRIBUTE11`; line `comment=ATTRIBUTE1`,
  salary-arabic duplicate `ATTRIBUTE2` (insert-only, never read back).
- **Dates:** every response carries ISO `YYYY-MM-DD` (listing date-only columns via `TO_CHAR`,
  detail business dates likewise; `createdAt`/`updatedAt` are raw timestamps). The repository
  binds legacy `DD-Mon-YYYY` strings for the `TO_DATE(..., 'DD-Mon-YYYY')` matches of §3.1;
  filter dates are ISO. `.isoDate()` is deliberately not used because it rewrites the value into
  a full timestamp — the shape and calendar validity are checked explicitly instead.
- **STATUS:** write-once 'Incomplete' on insert, never updated, accepted only as a free bounded
  string (≤30) list filter — the column has exactly one value today, so no enum was invented.
- **Search:** upper-cased contains-pattern with `LIKE … ESCAPE '\'` (interview precedent; the
  README shows the raw `'%'||UPPER(:search)||'%'` form). `HEADER_ID` ASC tie-breaker on every
  sort keeps pages stable (docs/02 §7).
- **Salary:** accepts a number ≥ 0 or a comma string that is stripped server-side
  (README §9 legacy behaviour); stored 0 when absent (SQL NVL).
- **Strict payload:** PUT takes the same body as POST; unknown fields (incl. `status`) rejected
  as a mass-assignment guard. Text length caps were chosen where the README gave none (it
  specified only `employeeName`/`position` ~200): titles 50, applicant/intNo 100,
  employeeNameAr 200, basicSalaryAr 1000, allowance/probation and their Arabic twins 500,
  approximateStartingDateAr 100, comment 4000.
- **Business units (README §8.9):** the insert and edit views label the two ids inconsistently
  (FPP/IPP swapped), so `GET /lookups/business-units` and every other exchange use raw ids only
  — never labels — until the owner resolves the contradiction.
- **No FK check on `intNo`, no lookup consistency check on `to`/`toArabic`:** README §9 defers
  both to the owner ("ask before adding"), so neither is enforced yet.

## 6–7. API and Oracle

New API surface (all under `/api/v1/hr/employment-offers`): `GET /` (filtered listing),
`POST /`, `GET /{headerId}`, `PUT /{headerId}`, `DELETE /{headerId}`, `GET /lookups/candidates`,
`GET /lookups/titles`, `GET /lookups/allowances?type=…`, `GET /lookups/business-units`,
`GET /lookups/number-to-arabic?number=…`, `GET /lookups/hijri-date?date=…`. Documented in
`server/docs/openapi/openapi.yaml`.

No DDL, no schema change, no new dependency. Tables touched at runtime (SQL written per
README §3–§8): `XXZP_EMPLOYMENT_OFFER_HEADER_T`, `XXZP_EMPLOYMENT_OFFER_LINES_T`, reads of
`XXZP_INTERVW_ASSESMNT_HEADER_T` + `XXZP_INTERVIEW_EVAL_T` (candidates dedupe),
`XX_DIGI_LOOKUP_VALUES` (titles, allowances, `XXZP_HR` tag), and `DUAL`
(`CON_NUM_TO_ARABIC`, NLS Arabic Hijrah date conversion).

## 8. Authentication and permissions

Session cookie authentication; CSRF token required on POST/PUT/DELETE; authorization
re-evaluated in Oracle per request (deny by default, explicit DENY wins). No workflow,
approval, e-mail or status-transition logic anywhere: STATUS is write-once data and only a
list filter (README §11 keeps workflow/PDF out of scope).

## 10. Validation and test evidence

```
cd server; npm run check
> eslint .                       → clean
> prettier --check .             → "All matched files use Prettier code style!"
> node --import ./tests/setup.js --test
  ℹ tests 572   ℹ suites 125   ℹ pass 572   ℹ fail 0   ℹ skipped 0   (duration_ms 54161.9771)
```

Includes the 36 new `employment-offers` cases (8 suites: authorization/CSRF, INSERT, READ,
UPDATE, DELETE, LISTING, lookups) and the `api-docs` employment-offer block, plus SwaggerParser
validation of the OpenAPI 3.1 document (`documents every employment-offer route with session
security and CSRF on changes` ✓).

## 12. Known limitations

- **SQL is not executed against Oracle** in this environment: the repository statements follow
  the README verbatim (§3–§8) and are covered only by code review and the in-memory double.
  One known unverifiable detail: the header binds `:to` / `:toArabic` exactly as written in
  README §3.3 — a keyword-shaped bind name that was never checked against a real Oracle
  instance. A read-only verification script against TEST (pattern of `scripts/verify-auth-sql.js`)
  is still recommended before merge.
- **Permission keys aligned to the owner-registered Oracle catalogue (2026-10-27):** module
  `EMPLOYMENT_OFFERS`, resource `EMPLOYMENT_OFFERS`, VIEW/CREATE/UPDATE/DELETE, all granted to
  `SUPER_ADMINISTRATOR`. The README's `HR.EMPLOYMENT_OFFERS` … `EDIT` example (§7, "RULES") is
  now stale — updating the README is owner-side. Non-super-admin roles still need their own
  grants.
- **`EDIT` dropped for `UPDATE`** — the action now exists in the standard vocabulary the admin
  panel can register; no client-registry change is needed for it.
- **README-vs-schema conflicts deliberately not resolved here:** contradictory BU labels
  (§8.9 FPP/IPP swapped), and the two owner-deferred checks of §9 (`intNo` existence,
  `to`/`toArabic` lookup consistency).
- **No delete conflict guard** while STATUS stays write-once; if future statuses arrive, the
  DELETE path needs a 409 rule revisit.
- Nothing committed or pushed; `README_employment_offer_form.md` is still untracked.

## 13. Follow-up (not in this change)

1. Permission catalogue registration — done by the owner as module `EMPLOYMENT_OFFERS`
   (resource `EMPLOYMENT_OFFERS`, VIEW/CREATE/UPDATE/DELETE, granted to `SUPER_ADMINISTRATOR`);
   the code was aligned to those keys on 2026-10-27. Grant the permission to any non-super-admin
   role that needs it (admin panel: Security Administration → Role permissions).
2. Read-only SQL verification script against TEST (would also settle the `:to` bind question).
3. Owner decision on the BU label contradiction and on the §9 `intNo`/title consistency checks.
4. Done — switched to the standard `UPDATE` (2026-10-27); no client-registry change needed.
5. Client UI for the form (separate, explicitly client-side change).
