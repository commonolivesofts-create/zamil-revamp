# Feature handoff — Controlled RBAC catalogue registration and action picker (Phase 2B)

## 1. Summary

| Item | Value |
|---|---|
| Feature | Oracle registration CLI for code-defined modules/resources/actions; standard-action multi-select in the Permission Catalog |
| Release | Zamil Digitalization V 2.1.0 |
| Status | Implemented; mocked tests, lint and builds pass. **Not run against any Oracle database** (no preview, no apply) |
| Approval | Owner approved the Phase 2B plan with decisions: SYSTEM audit attribution, warn-only coexistence, standard actions only in the picker, sequential existing API |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/rbac-catalog-registration` (from `main` at `bfda550`) |
| Commit | `feat(rbac): add controlled catalogue registration and action picker` |
| Pull Request | Owner creates, reviews and merges |

## 3. Acceptance criteria

| # | Criterion | Verified | Evidence |
|---|---|---|---|
| 1 | Preview is default and read-only; `--target` required; TEST only; unknown arguments refused | Yes (mocked) | `server/tests/rbac-register.test.js` |
| 2 | Environment, LOW alias, wallet, database identity, constraints and audit-event check enforced | Yes (mocked) | same |
| 3 | Active registry only; `COMMON` skipped; example never imported | Yes | same + `client/tests/registry.test.mjs` |
| 4 | Security Administration (8 resources, 23 permissions) verified; any difference is a conflict, never written | Yes (mocked) | same |
| 5 | MATCH / MISSING / CONFLICT / UNREGISTERED, counts, identity, deterministic SHA-256 fingerprint | Yes (mocked) | same |
| 6 | Apply: TTY, fingerprint, typed confirmation, NOWAIT lock, recheck under lock, ordered inserts, audit, verification, rollback | Yes (mocked) | same |
| 7 | ORA-00054, ORA-00001, connection failure, verification failure, unknown commit outcome; no retry | Yes (mocked) | same |
| 8 | Only INSERTs into the three catalogue tables and the audit log; no UPDATE/DELETE, roles, users or overrides | Yes (mocked) | same |
| 9 | SYSTEM audit attribution (`CREATED_BY` NULL), `RBAC_CATALOG_CHANGED`, existing reason codes, source + correlation ID | Yes (mocked) | same |
| 10 | Picker: 44 actions, search, multi-select, existing active/inactive unavailable, no duplicates, accessible | Yes | `client/tests/catalogActions.test.mjs` |
| 11 | Sequential single-action API; CREATED / ALREADY EXISTS (verified) / FAILED / UNKNOWN / not submitted; no retry | Yes | same |
| 12 | 2,000-row catalogue limit: adding actions refused when the catalogue may be truncated; 409 never confirmed from possibly truncated data | Yes | same |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| New | `server/scripts/rbac-register.js` | Guarded CLI entry (`main` with injected dependencies) |
| New | `server/scripts/lib/rbacRegistration.js` | Targets, labelled SQL, definitions check, comparison, fingerprint, inserts, verification |
| New | `server/tests/rbac-register.test.js` | 20 tests with a stateful mocked Oracle connection |
| Modified | `server/package.json` | `db:rbac-register` script (no dependency change) |
| Modified | `server/scripts/verify-auth-sql.js` | Parses (never executes) the registration SQL on TEST |
| New | `server/docs/RBAC-REGISTRATION.md` | Runbook: commands, safeguards, audit, change log, deployment |
| Modified | `server/docs/README.md`, `server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md`, `docs/FEATURE-DELIVERY-WORKFLOW.md`, `client/docs/NEW-FEATURE-GUIDE.md` | Registration path and approval rules |
| New | `client/src/features/security-administration/catalogActions.js` | Picker model, completeness check, sequential creation, result summary |
| New | `client/src/features/security-administration/components/ActionPicker.jsx` | Searchable checkbox list of standard actions |
| Modified | `client/src/features/security-administration/components/CatalogFormDialog.jsx` | Action creation through the picker; module/resource creation unchanged |
| Modified | `client/src/features/security-administration/pages/PermissionCatalogPage.jsx` | Passes existing actions, code ownership and completeness; truncation notice |
| New | `client/tests/catalogActions.test.mjs` | 8 tests |

## 5. Decisions and deviations

- **Database identity:** verified by `SERVICE_NAME` against the approved TEST pattern (the same check
  the approved bootstrap uses). `DB_NAME` is read and displayed but not pinned, because the TEST
  `DB_NAME` value has not been confirmed.
- **Confirmation mechanism:** the reviewed fingerprint is passed as `--fingerprint` (recorded in the
  change log; not a secret) and the operator types `REGISTER <TARGET> <count> <fingerprint prefix>`.
- **Compared fields:** only fields the registry defines (module name/description/display order,
  resource name/description when defined, active flags). Permission descriptions are never compared.
- **Code variants:** the locked CHECK constraints keep codes upper-case and trimmed, so codes are
  matched exactly.
- **2,000-row limit:** solved within the existing API: the frontend counts the joined rows and, at
  the limit, refuses to add actions (and never treats a 409 as verified from such data).
- **Super Administrator rule:** unchanged; for non-Super Administrators the backend refuses actions
  on security resources and the picker reports the refusal and stops.
- `server/scripts/rbac-register.js` reuses `promptLine` from the bootstrap script.

## 6–7. API and Oracle

No API, OpenAPI, schema, grant or data change. Oracle tables written by an **authorized** apply:
`XX_ZRV_APP_MODULES`, `XX_ZRV_RESOURCES`, `XX_ZRV_PERMISSIONS` (INSERT only, `IS_ACTIVE = 1`,
`CREATED_BY` NULL) and `XX_ZRV_RBAC_AUDIT_LOGS` (INSERT only, SYSTEM actor).

## 8. Security

`PERMISSION_CATALOG:MANAGE`, MFA and the Super Administrator rule for `SECURITY_ADMINISTRATION` are
unchanged. The CLI never grants permissions and never writes inside `SECURITY_ADMINISTRATION`. No
credentials, wallets or private data are in the repository.

## 10. Test evidence

See the PR report for executed commands and counts. All Oracle behaviour is mocked; no live database
was contacted.

## 12. Known limitations and risks

- Untested against real Oracle: the first owner-scheduled TEST **preview** (and `db:verify-auth`
  parse of the new SQL) is the next verification step.
- SYSTEM attribution: the operator is identified only in the change log.
- The NOWAIT lock briefly blocks concurrent catalogue writes (they fail and can be retried manually).
- Release packages must include `client/package.json` and `client/src/config/registry/**`.
- UAT/production targets are not configured (separate approval).
- The registry defines only Security Administration today, so the CLI's expected first result is
  "No changes needed".
