# Feature handoff — Workflow Manager M2-0: universal mapping foundation

## 1. Summary

| Item | Value |
|---|---|
| Feature name | Master Workflow Manager — package M2-0 (Phase 1, first part of M2 *Versioned form and data source mapping*) |
| Business purpose | A form-independent backend foundation that M2-A (source mapping), M2-B (form mapping), M2-C (secure preview), M6 (governance) and E1 (execution) build on: canonical fingerprints and record keys, precise Oracle values, mapping contracts, key assurance, read-only dictionary verification and form-owned integration contracts. |
| Business owner | Project owner (Zamil Digitalization) |
| Developer(s) | Claude Code (owner-delegated) |
| Status | **Merged** into `main` via PR #74 (`1e99898`) — backend library only; no routes, screens, database writes or RBAC changes. Consumed by M2-A (`FEATURE-WORKFLOW-MANAGER-M2-A.md`). |
| Replaces CI3 feature | New |
| Approval | G3, owner-approved 7 November 2026, limited to the four items in §8 |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/workflow-manager-m2-0-foundation` (from `main` `e2971db`) |
| Commit(s) | Squash commit `1e99898` on `main` |
| Pull Request | [#74](https://github.com/commonolivesofts-create/zamil-revamp/pull/74) |
| Merged into `main` | Yes — PR #74, commit `1e99898` |

## 3. Requirement and acceptance criteria

| # | Criterion (approved M2-0 specification + three safeguards) | Verified? | Evidence |
|---|---|---|---|
| 1 | Deterministic canonical JSON with server SHA-256; ambiguous values rejected, never dropped | Yes | `workflow-mapping-values.test.js` › canonical JSON (fixed vector) |
| 2 | Single and composite canonical record keys; unsupported types fail closed | Yes | › canonical record keys (3 fixed vectors) |
| 3 | **Safeguard A** — extensible key types: NUMBER, VARCHAR2/NVARCHAR2, CHAR/NCHAR, DATE, TIMESTAMP, TIMESTAMP WITH TIME ZONE, RAW, with fixed vectors | Yes | values tests; Oracle TEST round trip (§10) |
| 4 | **Safeguard B** — no floating point for Oracle numbers; high-precision and edge values exact | Yes | › precise Oracle values; TEST `TM9` round trip incl. `1E-120`, `9.99E+125` |
| 5 | **Safeguard C** — M1 unchanged (`SOURCE_HANDLERS` name, shape, frozen; all M1 exports and tests) | Yes | M1 suite unchanged and passing; compatibility test |
| 6 | Source contract: registered identity, verified object/owner, dictionary snapshot, allowlisted typed and classified columns, key candidates with evidence, drift, no SQL | Yes | `workflow-mapping-contracts.test.js` › source mapping contract |
| 7 | Form contract: header/key, lines and composite joins, scope, generic person attributes, typed fields, status/transitions, events, deep link, record-access requirements, publication blockers | Yes | › form mapping contract |
| 8 | Non-enforced keys provisional; observation ≠ guarantee; duplicates/nulls refused; reads by key fail closed | Yes | › key assurance; `assertSingleRecord` tests |
| 9 | Keyless detail rows preserved (no de-duplication) and restricted | Yes | › keeps keyless detail rows as they are |
| 10 | Record access: form-owned, non-downgradable, missing provider = unavailable, cross-organization only via provider | Yes | `workflow-mapping-security.test.js` › form-owned record access |
| 11 | No business-table writes, no form-specific hardcoding, approved imports only | Yes | › architecture boundaries (static) |
| 12 | No M4 resolver library, no live preview, no M2-A/B/C/M6/E functionality | Yes | Scope review; no routes added |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| New | `server/src/modules/workflow-manager/mapping/canonicalJson.js` | Canonical JSON + SHA-256 fingerprints |
| New | `…/mapping/recordKey.js` | Canonical record keys, key fetch expressions, fail-closed single-record rule |
| New | `…/mapping/identifiers.js` | Oracle identifier validation and quoting |
| New | `…/mapping/typeCompatibility.js` | Oracle type families, field types, precise canonical values |
| New | `…/mapping/keyAssurance.js` | Key enforcement levels, assurance, observations, attestation |
| New | `…/mapping/findings.js` | Shared findings and frozen publication blockers |
| New | `…/mapping/sourceContract.js` | `zrv.wf.source/1` |
| New | `…/mapping/formContract.js` | `zrv.wf.form/1` |
| New | `…/mapping/dictionary.repository.js` | Read-only dictionary queries |
| New | `…/mapping/dictionary.service.js` | Snapshots, drift, key evidence, allowlist, read-only transaction |
| New | `…/mapping/recordAccess.js` | Form-owned RecordAccessProvider contract + registry |
| New | `…/mapping/sourceHandlers.js` | Form-owned SourceHandler contract + registry |
| New | `server/src/modules/workflow-manager/integrations/index.js` | The single reviewed composition point (empty) |
| Modified | `server/src/modules/workflow-manager/workflowManager.catalog.js` | `SOURCE_HANDLERS` now derived from the registry (compatible) |
| New | `server/tests/workflow-mapping-{values,contracts,security}.test.js`, `server/tests/helpers/workflowMappingFixtures.js` | 63 tests, synthetic fixtures |

No frontend, OpenAPI, route, RBAC, configuration, database or business-module file changed.

## 5. Frontend routes and navigation

None (backend library only).

## 6. API endpoints and contracts

No endpoints. Library contracts:

### 6.1 Canonical JSON (`canonicalJson.js`)

UTF-8; object keys sorted by Unicode code point; no whitespace; values null, booleans,
well-formed strings (unchanged), arrays, plain objects; numbers only as safe integers (decimals and
large integers travel as strings). Rejected, never dropped or coerced: `undefined`, functions,
symbols, bigint, `Date`, `Map`, class instances, sparse arrays, lone surrogates, `NaN`, `±Infinity`,
`-0`, unsafe integers, nesting deeper than 64. `fingerprint(value)` → `{ json, sha256, bytes }`;
output is valid for `IS JSON STRICT WITH UNIQUE KEYS`.

### 6.2 Precise values (`typeCompatibility.js`)

| Oracle type | Canonical text | Notes |
|---|---|---|
| NUMBER, FLOAT | exact decimal: no `+`, no leading/trailing zeros, no exponent, `0` for zero | String arithmetic only; accepts `TM9` output (`.5`, `1E-120`); ≤ 40 significant digits; Oracle range; JS non-safe-integer numbers → `PRECISION_RISK` |
| VARCHAR2, NVARCHAR2 | exact string | `''` is NULL in Oracle → refused for keys |
| CHAR, NCHAR | trailing blanks removed | Oracle compares CHAR blank-padded, so no distinct values merge |
| DATE | `YYYY-MM-DDTHH:MM:SS` | Field type DATE → `YYYY-MM-DD`, non-midnight refused |
| TIMESTAMP(n) | `YYYY-MM-DDTHH:MM:SS.fffffffff` | Always 9 fraction digits; more digits than *n* refused |
| TIMESTAMP(n) WITH TIME ZONE | `…fffffffffZ` exact UTC | Offset converted with integer arithmetic; regional zones via `SYS_EXTRACT_UTC` at fetch |
| RAW | upper-case hex | |
| CLOB/NCLOB | text fields only | Not key-eligible |
| TIMESTAMP WITH LOCAL TIME ZONE, BINARY_FLOAT/DOUBLE, BLOB, LONG, ROWID, XMLTYPE, … | — | Fail closed (`KEY_TYPE_*`, `COLUMN_TYPE_UNSUPPORTED`) |

Field types: `TEXT, INTEGER, DECIMAL, DATE, DATETIME, TIMESTAMP_TZ, BOOLEAN` (explicit stored-value
mapping), `REFERENCE` (`EMPLOYEE_NUMBER_REF, USER_ID_REF, PERSON_ID_REF, ORGANIZATION_REF,
DEPARTMENT_REF, OPAQUE`). `canonicalFieldValue` defines the typed value contract for future
conditions and execution. Years 0001–9999.

### 6.3 Record keys (`recordKey.js`, format `zrv.wf.recordKey/1`)

`RECORD_KEY_JSON` = canonical JSON `{ "<COLUMN>": "<canonical text>" }`; `RECORD_KEY_SHA256` =
its SHA-256. 1–32 columns, column order irrelevant. `keyFetchExpression()` fetches key columns
session-independently (`TO_CHAR(…,'TM9','NLS_NUMERIC_CHARACTERS=''.,''')`, `SYS_EXTRACT_UTC`,
`RAWTOHEX`). `assertSingleRecord(rows)` with `SINGLE_RECORD_FETCH_LIMIT = 2`: exactly one row,
`RECORD_NOT_FOUND`, or `DUPLICATE_RECORD_KEY` — never the first row. E1 must reuse this module.

`verifyRecordKey(recordKey, keyColumns)` checks a key received from elsewhere with the same
implementation (no second format): it rebuilds the key from the parts in `json` with
`buildRecordKey()` and requires byte-identical canonical JSON, `sha256` equal to its lower-case hex
SHA-256, and `value` canonicalizing to the same JSON. Failures: `RECORD_KEY_MALFORMED`,
`RECORD_KEY_FORMAT_UNSUPPORTED`, `RECORD_KEY_HASH_INVALID`, `RECORD_KEY_COLUMNS_INVALID`,
`RECORD_KEY_VALUE_INVALID`, `RECORD_KEY_NONCANONICAL` (spacing, order, typing, number/date
representation, duplicate properties), `RECORD_KEY_HASH_MISMATCH`, `RECORD_KEY_VALUE_MISMATCH`.

### 6.4 Key assurance (`keyAssurance.js`)

`DATABASE_ENFORCED`: ENABLED + VALIDATED PK/unique constraint or VALID non-function-based unique
index on the key columns (or a subset); unique constraints/indexes only with all key columns NOT
NULL. `DECLARED`: everything else (including identity columns) — always provisional; requires
`assurance { basis (GENERATED_ALWAYS_IDENTITY | GENERATED_BY_DEFAULT_IDENTITY |
APPLICATION_GENERATED | OWNER_ATTESTED, checked against the dictionary), evidenceRef, rationale }`;
`attestedBy/attestedAt` set by the server; a clean uniqueness observation is dated evidence only;
duplicates or nulls observed are errors; blocker `PROVISIONAL_KEY` for M6.

### 6.5 Source mapping `zrv.wf.source/1` (`sourceContract.js`)

Author supplies only `columns[{ name, exposed, dataClass }]` and `keyCandidates[{ code, columns,
assurance }]`; unknown properties are rejected. The server derives datatypes, the dictionary
snapshot (`objectType, status, capturedAt, columnsSha256`) or handler contract, key enforcement,
observations and attestation. `prepareSourceVersion()` → `{ valid, findings, publicationBlockers,
schemaVersion: 1, config, configJson, configSha256 }` (≤ 256 KB). `checkSourceDrift()` reports
`COLUMN_MISSING`, `COLUMN_CHANGED`, `OBJECT_TYPE_CHANGED`, `OBJECT_INVALID`.

### 6.6 Form mapping `zrv.wf.form/1` (`formContract.js`)

`header`, `lines`, `fields`, `attributes`, `orgScope`, `status`, `events`, `deepLink`,
`recordAccess` as specified; no SQL/expression/operator properties exist. Key rules: references
resolve to exposed columns; type compatibility; joins without implicit conversion; fixed filters
are constant equality stored canonically; field sensitivity may not be lower than the column data
class; person attributes and `RESOLVER_REQUIRED` scope are recorded, not resolved (M4); status
writer is `NONE` only; deep-link parameters come from the header key; `recordAccess` only adds
permissions. Keyless lines: `lineKey null`, `rowIdentity NONE`, explicit acknowledgement, usage
`DISPLAY`/`TEMPLATE` only, not `ONE`, rows never de-duplicated. Publication blockers (frozen, ordered):
`FORM_INACTIVE, KEYLESS_LINE_RESTRICTED_USE, NO_RECORD_ACCESS_PROVIDER, PROVISIONAL_EVENT,
PROVISIONAL_KEY, PROVISIONAL_LINE_KEY, PROVISIONAL_ORG_SCOPE, PROVISIONAL_STATUS,
PROVISIONAL_TRANSITION, RESOLVER_UNBOUND, SOURCE_INACTIVE, SOURCE_VERSION_NOT_PUBLISHED`.

### 6.7 Form-owned integrations (`recordAccess.js`, `sourceHandlers.js`, `integrations/index.js`)

- **RecordAccessProvider v1** `{ formCode, contractVersion: 1, canView(ctx) → { decision, basis,
  crossOrganization, contractVersion } }`. `authorizeRecordAccess({ …, recordKey, keyColumns,
  requiredPermissions })` returns ALLOW only if: the purpose and actor are valid; the record key
  passes `verifyRecordKey()` against the mapping's key columns (checked **before** any provider is
  called; the provider receives only the verified, rebuilt key); a provider is registered; the
  purpose's **mandatory** permissions are held — `MAPPING_PREVIEW` always requires
  `WORKFLOW_MANAGER.FORM_MAPPING:RUN`, checked first, and it cannot be removed by omitting, emptying
  or replacing `requiredPermissions` (a non-array is `PERMISSION_INVALID`); every additional
  `requiredPermissions` entry is held (additive, duplicates checked once); and the provider returns
  a valid ALLOW within 5 s. Missing provider, error, timeout, malformed or version-mismatched
  answers → DENY. The registry exposes only `has()`; providers are unreachable except through this
  function.
- **SourceHandler v1** `{ code, name, description?, contractVersion: 1, fields[] }`; validated at
  startup; functions are never invoked in M2-0.
- **`integrations/index.js`** is the only place providers/handlers are composed (explicit imports,
  no self-registration). Empty in M2-0.

## 7. Oracle database

| Object | Access | Pool |
|---|---|---|
| `ALL_OBJECTS`, `ALL_TAB_COLUMNS`, `ALL_TAB_IDENTITY_COLS`, `ALL_CONSTRAINTS`, `ALL_CONS_COLUMNS`, `ALL_INDEXES`, `ALL_IND_COLUMNS` | Read (dictionary) | LOW |
| An allowlisted source object (owner `XXZP`, not `XX_ZRV_*`) | Aggregate read only (uniqueness counts), after dictionary verification | LOW |

| Item | Value |
|---|---|
| SQL changes (DDL/DML scripts) | None |
| Approval reference (G1/G4) | Not applicable — no catalogue, data or CI3 change |
| Applied to TEST | Nothing written. Read-only verification only (§10) |
| Transactions | Every dictionary-service call: `SET TRANSACTION READ ONLY`, call timeout (15 s), rollback |

## 8. Authentication, permissions and G3 scope

| Item | Value |
|---|---|
| New permission codes | None |
| G3 (approved 7 Nov 2026) | (1) RecordAccessProvider contract + explicit registry; (2) SourceHandler contract + explicit registry; (3) `integrations/index.js` composition without self-registration; (4) `canonicalJson.js`/`recordKey.js` as the shared contracts for later packages |
| Not changed | Authorization evaluator, authentication/MFA/CSRF/sessions, middleware, response formats, navigation/RBAC behaviour, Oracle connection infrastructure, business modules, dependencies |
| Security approval (G2) | Not required for M2-0; M2-C preview remains subject to G2 |

## 9. Shared components and services reused

`withConnection` (LOW), `parsePermission`, Joi, `oracledb`, the M1 catalog allowlist
(`ALLOWED_SOURCE_OWNERS`, `PROTECTED_OBJECT_PREFIXES`, `isProtectedObjectName`). New shared code:
the G3 items above only.

## 10. Validation and test evidence

| Check | Command / method | Result | Date |
|---|---|---|---|
| Backend lint + format + tests | `cd server; npm run check` | Lint and Prettier clean; 1,015 tests: 1,008 passed, 0 failed, 7 pre-existing `todo` (none in M2-0) | 2026-11-07 |
| New M2-0 tests | `workflow-mapping-{values,contracts,security}.test.js` | 63 passed (incl. the PR #74 review fixes: mandatory `FORM_MAPPING:RUN`, record-key integrity) | 2026-11-07 |
| Mutation check of the review fixes | Temporarily removed the mandatory permission, then the key verification | Each removal made the new tests fail (1 and 2 failures); file restored byte-identical | 2026-11-07 |
| M1 regression | `workflow-manager.test.js`, `rbac-register.test.js` within the suite | Passed, unchanged | 2026-11-07 |
| Frontend tests | `cd client; npm test` (no client change) | 511 tests: 508 passed, 0 failed, 3 pre-existing `todo` | 2026-11-07 |
| Oracle TEST, read-only | Repository/service against Workflow Manager tables and `XXZP.XX_DIGI_EMP_MASTER` (dictionary + aggregate counts); key fetch expressions on `DUAL` literals | 25/25 passed: identity and function-based index detection, PK → DATABASE_ENFORCED, protected-object refusal, unknown-column refusal, `ORA-01456` proves the read-only guard blocks writes, NUMBER/DATE/TIMESTAMP/TZ (offset and region)/RAW round trips, NLS independence | 2026-11-07 |
| Browser verification | — | Not applicable (no screens) | — |

## 11. Screenshots

Not applicable.

## 12. Known limitations and dependencies

- Preview of any real form requires that form's own `RecordAccessProvider`, added in a separately
  authorized change to the form's module and composed in `integrations/index.js`.
- `RESOLVER_REQUIRED` organization scopes stay provisional until M4 resolvers exist and M6 binds them.
- The canonical key format is frozen (`zrv.wf.recordKey/1`); changing it would change every
  `RECORD_KEY_SHA256` and needs a new format version.
- Uniqueness observations read aggregate counts from the source object; large objects may need
  a longer timeout in M2-A.

## 13. Follow-up work

- **M2-A** source mapping API + UI (guide 05); RBAC `SOURCE_MAPPING` registration (G1).
- **M2-B** form mapping API + UI (guides 06–07); RBAC `FORM_MAPPING` (G1).
- **M2-C** secure read-only preview using `authorizeRecordAccess` + `assertSingleRecord` (G2).
- **M6** maker/checker, publication, retirement, blocker enforcement, permission model.

## 14. Review and handoff

| Item | Value |
|---|---|
| Reviewer(s) | Project owner |
| Review outcome | Merged via PR #74 |
| Handoff accepted by | Pending |
| Date | 2026-11-07 |
