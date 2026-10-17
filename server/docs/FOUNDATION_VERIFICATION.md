Zamil Revamp backend: foundation verification handoff
The backend foundation is verified against all six architecture documents and connects to the zpadwtest TEST database on both the LOW and HIGH services. Verification found four defects and one missing foundation component; all are fixed and covered by tests. Lint, Prettier and all 64 automated tests pass.

1. Final folder structure (server/)

src/
  app.js  server.js  shutdown.js
  config/index.js                    # Joi-validated configuration, the only reader of process.env
  database/oracle.js  wallet.js      # LOW/HIGH pools, connections, transactions, readiness; wallet checks
  middleware/errorHandler.js  requestId.js  validate.js
  routes/health.routes.js  docs.routes.js
  shared/errors/AppError.js  shared/logger/index.js  shared/responses/apiResponse.js
scripts/db-status.js
docs/01–06 *.md, docs/openapi/openapi.yaml
tests/ (11 files)
This matches the target layout in Doc 01 §3. modules/ doesn't exist yet because there are no business modules; it gets created with the first feature, not as an empty folder.

Fixed during verification:

Problem	Effect before the fix	Fix
Express 4xx errors were reported as 500	A malformed route parameter returned 500 INTERNAL_ERROR and was logged as a server failure. Every future /:id route would have had this.	These now return 400 BAD_REQUEST with a generic message that never echoes the input.
Logs could include passwords	walletPassword and top-level password fields were not redacted.	Both are now redacted.
Readiness check could run over its deadline	The query got the full timeout again after waiting for a connection, so a check could take about twice the configured limit.	The query now gets only the time remaining.
A wrong wallet password gave a misleading error	The server started anyway and reported 503 indefinitely, logging only generic NJS-040 queue timeouts. The driver's real error (NJS-505) took more than 60 s and ignored connectTimeout.	The wallet key is now decrypted locally at startup (nothing is printed). Startup and db:status fail in about 1 s with "Oracle wallet password does not decrypt ewallet.pem".
Request-validation middleware was missing	ADR-039 and Doc 06 §6 require it as part of the foundation.	Added src/middleware/validate.js: rejects unknown fields, returns VALIDATION_ERROR with a per-field list, never echoes submitted values, and handles Express 5's read-only req.query.
2. Endpoints
Endpoint	Behaviour
GET /health/live	Always 200 and never touches Oracle. Verified with readiness forced to "down".
GET /health/ready	200 when both pools are up, 503 naming only the pool that is down. Each check is time-limited, concurrent requests share one check, and results are reused for 5 s.
GET /api/docs, /api/openapi.json	Swagger UI and the raw spec. Available only in development and test; configuration refuses to start in UAT or production with docs enabled.
The OpenAPI 3.1 spec documents both health endpoints, matches the actual responses, and passes a 3.1 validator.

3. Oracle LOW/HIGH connectivity (real zpadwtest database, Thin mode)
All checks below ran against the TEST database with read-only SQL only. No tables were touched and production was never contacted.

Check	Result
npm run db:status	PASS. LOW and HIGH each completed SELECT 1 FROM DUAL in about 1.6–1.7 s including connection setup.
Routing	LOW reaches the _low service and HIGH reaches _high. Repeated requests reuse the pooled session.
Wait for a free connection (LOW)	Gives up with a 503 after exactly the configured 1000 ms (NJS-040).
Full queue (HIGH)	Rejected immediately with a 503 (NJS-076).
Slow query	Stopped at the per-call timeout (NJS-123); the pool keeps working afterwards.
Transactions	The commit and rollback paths work on a real connection, and no connections leak.
HIGH unreachable	Readiness reports LOW up and HIGH down within the 3 s deadline.
Real server	/health/ready returns 200 with LOW and HIGH both up.
Shutdown	Exits with code 0 and closes both pools.
Secrets	The startup log and responses contain no credentials, wallet path, hosts or SQL.
4. Tests and quality checks
Automated: npm run check passes: ESLint clean, Prettier clean, 64 of 64 tests. The automated tests use stand-ins for the database; the real connectivity results are in section 3.
Git protection: checked in a throwaway repository with the same .gitignore rules. Wallet files and all .env variants are ignored; .env.example and source files are not. The project itself still has no git repository, so nothing can be tracked yet.
5. Remaining issues and configuration requirements
Readiness on the HIGH pool: ORACLE_HIGH_POOL_MIN=0 means the first readiness check after a minute idle opens a new connection, which takes about 1.7 s against a 3 s limit. That margin is thin on slower networks. Recommendation: set ORACLE_HIGH_POOL_MIN=1.
Queue timeouts include connection setup: a request that has to wait for a new connection counts the ~1.7 s setup against queueTimeout. The current values (LOW 10 s, HIGH 30 s) are safe, but never set them below about 3 s.
Pool sizes are development placeholders: the current .env sets LOW to 1–5 and HIGH to 0–5. Production sizing is still an open decision under Doc 03 §10.
Not tested on Windows: OS shutdown signals can't be sent there. The shutdown logic was verified in-process against the real database, but the SIGTERM wiring should be checked on the target host.
Deferred to their own phases:
Rate limiting and login throttling (authentication phase).
Translating Oracle constraint errors (e.g. ORA-00001) into 409 responses (first feature with writes).
CSRF and sessions (authentication phase).
Production documentation access policy.
6. Readiness assessment
The foundation is ready for the authentication/RBAC design phase and for business API development. It provides:

Configuration, logging, request IDs, standard responses, error handling and request validation.
The LOW/HIGH connection and transaction helpers, plus health checks and Swagger.
All of it is centralized, tested and checked against the real TEST database. It is not production-ready: authentication, RBAC, production pool sizing, the hosting decision and the production documentation-access policy are still open, as the architecture documents intend.