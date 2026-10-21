# Developer Module Guide (Backend)

**Responsibility of this layer:** expose the `/api/v1` REST API, enforce authentication,
authorization and business rules, and read/write Oracle ADW safely. This guide explains how the
approved architecture ([01](01-SYSTEM_ARCHITECTURE.md), [02](02-API_DEVELOPMENT_STANDARDS.md),
[03](03-ORACLE_DATABASE_ARCHITECTURE.md)) is implemented in the current source and how to add a
module. Paths are relative to `server/`.

## 1. Runtime structure

```text
src/
├── server.js            Startup: validate config, initialize Oracle pools, listen, graceful shutdown
├── app.js               createApp(): requestId → pino-http → Helmet → JSON body → health → docs → /api/v1 → 404 → errorHandler
├── config/index.js      The only reader of process.env (Joi-validated `config`)
├── database/            oracle.js (pools, withConnection, withTransaction), wallet.js
├── middleware/          authenticate, authorize, csrf (Origin + token), validate, rateLimit, mfaChallenge, requestId, errorHandler
├── routes/              api.routes.js (composes /api/v1), docs.routes.js, health.routes.js
├── shared/              errors/AppError.js, responses/apiResponse.js, logger/, utils/
└── modules/             auth, users, access-control, audit, notifications (foundation modules)
```

Business features follow the **domain-first** layout of [01 §3–4](01-SYSTEM_ARCHITECTURE.md):
`src/modules/<domain>/<feature>/` (for example `modules/hr/employees/`). The foundation modules
above are single-level folders, as listed in 01 §3.

## 2. The flow in a working module — `src/modules/users/`

`GET /api/v1/users/:userId` and `POST /api/v1/users/:userId/disable`, end to end.

### 2.1 Routes — `users.routes.js` (abridged)

The router is a **factory** that receives its dependencies (so tests can inject doubles). Each
route lists its guards in the approved order: authenticate → (CSRF for changes) → authorize → Joi.

```js
const USER_ACCOUNTS = 'SECURITY_ADMINISTRATION.USER_ACCOUNTS';

export function createUsersRouter({ usersService, recoveryService, authorize, authenticate, auditService }) {
  const controller = createUsersController({ usersService, recoveryService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas) => [
    authenticate,
    authorize(USER_ACCOUNTS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas, resource = USER_ACCOUNTS) => [
    authenticate,
    requireCsrfToken,
    authorize(resource, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/:userId', ...read('VIEW', { params: userIdParams }), controller.getUser);
  router.post('/:userId/disable', ...write('DISABLE', { params: userIdParams }), controller.disable);
  return router;
}
```

Authorization runs **before** validation so callers without permission learn nothing about the
input contract. Every protected response is `Cache-Control: no-store`.

### 2.2 Validation — `users.validation.js`

```js
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);   // NUMBER(19,0) IDs travel as strings
export const userIdParams = Joi.object({ userId: id.required() });
export const emptyBodySchema = Joi.object({});           // unknown fields are rejected
```

`validate({ params, query, body })` (`src/middleware/validate.js`) converts values, collects all
errors into `400 VALIDATION_ERROR` with `details[{ field, message }]`, and never echoes input.

### 2.3 Controller — `users.controller.js`

Thin: pass validated input and request context to the service, send the envelope. No SQL, no
try/catch (Express 5 forwards rejected promises to `errorHandler`).

```js
async disable(req, res) {
  sendSuccess(res, await usersService.disable(req.auth, req.params.userId, requestContext(req)));
},
```

`req.auth` is set by `authenticate` (the trusted actor); `requestContext(req)` supplies request ID,
IP and user agent for audit. Lists use `sendPaginated(res, items, { page, limit, total })`.

### 2.4 Service — `users.service.js` (abridged)

Business rules, hierarchy checks, transactions and audit. Factory with injectable dependencies and
production defaults:

```js
export function createUsersService({
  repository = defaultRepository, sessionRepository = defaultSessionRepository,
  auditService, withConnection = defaultWithConnection, withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);
  // ...
  async disable(actor, userId, context) {
    const target = await loadTarget(actor, userId, context);          // 404 / 403 rules
    const result = await withTransaction(POOLS.LOW, async (c) => {     // one connection, one commit
      const changed = await repository.disableUser(c, { userId, actorUserId: actor.userId });
      if (!changed) return { changed: false, sessionsRevoked: 0 };
      const sessionsRevoked = await sessionRepository.revokeUserSessions(c, { userId, actorUserId: actor.userId });
      await auditService.record(c, /* ACCOUNT_DISABLED event */);     // audit row in the same transaction
      return { changed: true, sessionsRevoked };
    });
    return { ...(await toDetail(await loadUser(userId))), ...result };
  },
}
```

Expected failures are thrown as `new AppError(status, CODE, safeMessage, details?)`
(`src/shared/errors/AppError.js`); only `errorHandler` formats them. Unexpected errors become
`500 INTERNAL_ERROR` without internal details.

### 2.5 Repository — `users.repository.js` (abridged)

Verified SQL with bind variables; receives the connection from the service; never commits.

```js
export async function listUsers(connection, { limit, offset, filters = {}, sortBy, sortOrder }) {
  // filter fragments and SORT_COLUMNS come from fixed allowlists; values are always bound
  const result = await rows(connection,
    `SELECT u.user_id, u.employee_number, u.account_status, ...
       FROM xx_zrv_users u ${EMPLOYEE_APPLY} ${where}
      ORDER BY ${column} ${direction} NULLS LAST, u.user_id
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    { USER_ID: ID },                 // fetchInfo: read NUMBER IDs as strings
  );
  return { total, items: result.map(mapListItem) };
}
```

Conventions visible in the repositories: `oracledb.OUT_FORMAT_OBJECT`; named binds (`:userId`);
`fetchInfo` with `{ type: oracledb.STRING }` for IDs; explicit column lists (no `SELECT *`);
row-mapping functions to camelCase API fields; bounded results (`FETCH FIRST n ROWS ONLY` or
pagination); stable `ORDER BY` with a unique tie-breaker.

### 2.6 Registration — `src/routes/api.routes.js` (abridged)

`createApiRouter(appConfig, deps)` builds services from optional test doubles (`deps.*Repository`,
`deps.db`) and mounts the routers:

```js
const usersService = createUsersService({
  repository: deps.usersRepository, sessionRepository: deps.sessionRepository,
  rbacRepository: deps.rbacRepository, auditService,
  withConnection: db.withConnection, withTransaction: db.withTransaction,
});
router.use('/users', createUsersRouter({ usersService, recoveryService, authorize, authenticate, auditService }));
```

`router.use(createOriginCheck(...))` at the top applies the Origin check to every unsafe `/api/v1`
request. `app.js` mounts this router at `/api/v1`.

### 2.7 OpenAPI and tests

- Each operation is documented in `docs/openapi/openapi.yaml` (security scheme, CSRF requirement,
  permission in the description, schemas, errors).
- `tests/api-docs.test.js` validates the spec as OpenAPI 3.1 and lists every route per module;
  add new routes there.
- `tests/users-admin.test.js` exercises the HTTP API with Supertest against in-memory doubles
  (`tests/helpers/*Fakes.js`). See [backend testing](BACKEND-TESTING.md).

## 3. Shared infrastructure — reuse, never duplicate

| Need | Use | File |
|---|---|---|
| Configuration | `config` (add new settings to the Joi schema **and** `.env.example`; gate G3) | `src/config/index.js` |
| Oracle access | `withConnection(POOLS.LOW, fn)`, `withTransaction(POOLS.LOW, fn)` | `src/database/oracle.js` |
| Session | `authenticate` (sets `req.auth`) | `src/middleware/authenticate.js` |
| Permission | `authorize('MODULE.RESOURCE', 'ACTION')` | `src/middleware/authorize.js` |
| CSRF | `createRequireCsrfToken({ auditService })` on unsafe routes; Origin check is global | `src/middleware/csrf.js` |
| Validation | `validate({ params, query, body })` | `src/middleware/validate.js` |
| Errors | `AppError` | `src/shared/errors/AppError.js` |
| Responses | `sendSuccess`, `sendPaginated` (`sendError` is used by `errorHandler`) | `src/shared/responses/apiResponse.js` |
| Logging | `logger` (redacts secrets); request logs are automatic | `src/shared/logger/index.js` |
| Security audit events | `auditService.record(connection, event)` inside the transaction; `recordIndependently(event)` for refusals | `src/modules/audit/securityAudit.service.js` (event catalogue is approved; new codes need gate G2) |
| Request context | `requestContext(req)` | `src/middleware/authenticate.js` |
| Rate limiting | `createRateLimiter` (in-process) | `src/middleware/rateLimit.js` |

Not allowed: reading `process.env` in modules, `console.*`, creating pools, ORMs, generic base
controllers/repositories, per-controller error formatting, cross-module repository imports
(call the owning module's service instead — 01 §4.2).

## 4. Adding a backend module — step by step

> **ILLUSTRATIVE.** `example-domain/widget-requests`, `EXAMPLE_MODULE.WIDGET_REQUESTS` and
> `XX_EXAMPLE_WIDGET_REQUESTS` do not exist.

1. **Inspect and approve.** Verify the CI3 behaviour and the real Oracle objects; agree the
   endpoints, permission codes and pool; pass any [approval gate](../../docs/FEATURE-DELIVERY-WORKFLOW.md#approval-gates).
2. **Create the folder** `src/modules/example-domain/widget-requests/` with
   `widgetRequest.routes.js`, `.controller.js`, `.service.js`, `.repository.js`, `.validation.js`.
3. **Validation:** Joi schemas for params, query (`page`, `limit` ≤ 100, `search`, allowlisted
   `sortBy`/`sortOrder`, typed filters) and body. Reject unknown fields (default).
4. **Repository:** functions `(connection, input)` with bound SQL against the verified objects;
   explicit columns; bounded results; map rows to camelCase; IDs as strings.
5. **Service:** factory `createWidgetRequestService({ repository = defaultRepository,
   withConnection = defaultWithConnection, withTransaction = defaultWithTransaction })`. Reads via
   `withConnection(POOLS.LOW, …)`; writes via one `withTransaction(POOLS.LOW, …)`; enforce
   record/organization scope from `actor` (trusted `req.auth`), never from request fields; throw
   `AppError` for expected failures.
6. **Controller:** call the service; `sendSuccess(res, data, 201)` for creation;
   `sendPaginated` for lists.
7. **Routes:** factory `createWidgetRequestRouter({ widgetRequestService, authenticate, authorize, auditService })`;
   `authenticate`, `requireCsrfToken` (changes), `authorize('EXAMPLE_MODULE.WIDGET_REQUESTS', 'VIEW')`,
   `validate(...)`; `Cache-Control: no-store` for protected data.
8. **Register** in `src/routes/api.routes.js`: construct the service (accepting
   `deps.widgetRequestRepository` and `db.*` for tests) and `router.use('/example-domain/widget-requests', …)`.
9. **OpenAPI:** document every operation in `docs/openapi/openapi.yaml`; add the routes to
   `tests/api-docs.test.js`.
10. **Tests:** Supertest API tests with injected doubles: success, validation, 401, 403 (missing
    permission and explicit DENY), 404, conflicts, pagination bounds, CSRF on changes, transaction
    rollback (see [backend testing](BACKEND-TESTING.md)).
11. **Permissions in the catalogue:** create the module/resource/actions with the catalogue API
    (authorized administrator) or an approved database change (gate G1).
12. **Verify:** `npm run check`; authorized Oracle TEST verification only within an approved plan.
13. **Handoff:** [feature handoff template](../../docs/FEATURE-HANDOFF-TEMPLATE.md).

## 5. Avoid

- Business logic or SQL in routes/controllers; HTTP objects in services.
- Trusting client-supplied roles, owners, organizations or sort columns.
- Commits/rollbacks inside repositories; transactions spanning LOW and HIGH; `Promise.all` on one
  transaction connection; external HTTP calls inside a write transaction.
- Unbounded queries, fetching all rows to paginate in Node, unlimited exports.
- Returning Oracle error text, SQL, stack traces, hashes, secrets or tokens.
- New dependencies, Redis, queues, ORMs, Docker or microservices without approval.
