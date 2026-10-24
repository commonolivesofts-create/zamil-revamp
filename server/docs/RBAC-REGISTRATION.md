# RBAC catalogue registration (`db:rbac-register`)

Registers developer-defined modules, resources and permission actions from the code registry
(`client/src/config/registry/index.js`) in the Oracle RBAC catalogue. It is a **maintenance CLI**:
it never runs on backend start-up, deployment, login or frontend loading.

| What it does | What it never does |
|---|---|
| Compares the active registry with `XX_ZRV_APP_MODULES`, `XX_ZRV_RESOURCES`, `XX_ZRV_PERMISSIONS` | UPDATE, DELETE, activate, deactivate or rename existing rows |
| Inserts **missing** business modules, resources and actions after an authorized apply | Grant permissions to roles, assign roles, change overrides or users |
| Writes one `RBAC_CATALOG_CHANGED` audit row per inserted record | Create or change anything in `SECURITY_ADMINISTRATION` (verify only) |
| Reports conflicts and catalogue rows the registry does not define | Change the schema, register `COMMON` (`rbac: false`) or the example file |

## Approval (gate G1)

- **Preview** is read-only, but connects to Oracle: run it only against a target you are authorized
  to read, and for a rollout only when the owner has scheduled it.
- **Apply** writes catalogue data. Every apply needs the owner's explicit authorization **for that
  target and that exact plan fingerprint**. Approving the code is not approval to run it.
- Only `TEST` is an approved target. Adding UAT or production requires a separately approved change
  that adds the verified database identity to `APPROVED_TARGETS` in
  `server/scripts/lib/rbacRegistration.js`.
- A target's identity is its `SERVICE_NAME` pattern **and** its owner-approved `DB_NAME`
  (`SYS_CONTEXT('USERENV', 'DB_NAME')`). The TEST `DB_NAME` is **not configured yet**: the preview
  runs and prints the actual `DB_NAME`, but **apply is refused** (before connecting) until that value
  has been recorded from a preview, approved by the owner and added to `APPROVED_TARGETS.TEST.dbName`
  through a reviewed change. Never guess it.

## Commands (from `server/`)

```powershell
cd server

# 1. Read-only preview
npm run db:rbac-register -- --target=TEST

# 2. Apply the reviewed plan (only with owner authorization; interactive terminal required)
npm run db:rbac-register -- --target=TEST --apply --fingerprint=<64-character fingerprint from step 1>
```

Some npm versions interpret `--target=TEST` as an npm config option even after `--`. If you see `npm warn Unknown cli config \"--target\"` and the CLI reports a missing target, use the same executable directly from `server/`:

```powershell
node --env-file-if-exists=.env .\scripts\rbac-register.js --target=TEST
```

This alternative is still an **Oracle TEST read-only connection**; do not run it without owner approval. Neither preview nor this command grants permission to run `--apply`.

Arguments: `--target=<TARGET>` (required), `--apply`, `--fingerprint=<sha256>` (required with, and
only accepted with, `--apply`). Anything else is refused.

### Preview output

- Target identity: service name, and the actual `DB_NAME` with whether it matches the approved value
  (or that none is configured, in which case apply is disabled).
- One line per entry:

| Status | Meaning |
|---|---|
| `MATCH` | Exists, active, and equal in every field the registry defines |
| `MISSING` | Absent; would be inserted (never inside `SECURITY_ADMINISTRATION`) |
| `CONFLICT` | Inactive, different name/description/display order, under a conflicting parent, or a missing/different `SECURITY_ADMINISTRATION` record. Apply is refused while any conflict exists; an authorized administrator resolves it |
| `UNREGISTERED` | Catalogue rows the registry does not define (for example created manually in the Permission Catalog). Reported only |

- Counts and the **plan fingerprint**: SHA-256 of the target identity (target, `SERVICE_NAME`,
  `DB_NAME`) and the exact records to insert. Matches, conflicts and unregistered rows do not change it.
- Exit codes: `0` nothing to do / plan ready / applied, `1` refused or failed, `2` conflicts or
  failed preconditions, `3` unknown outcome.

Compared fields: module name, description (when the registry defines one) and display order;
resource name and description (when defined); active flags. Permission descriptions are never
compared or changed. New permissions get a generated description, e.g. `APPROVE` on resource
“Sales Budget” → “Approve sales budget”.

### Apply safeguards

1. `NODE_ENV` and `ORACLE_LOW_ALIAS` must match the target; the wallet is validated.
2. The target must have an approved `DB_NAME` (otherwise apply is refused before connecting). The
   database identity must match: `SERVICE_NAME` pattern and exact `DB_NAME`, in the preview and again
   inside the write transaction. Required constraints must be enabled and validated; the deployed
   `CK_ZRV_AUD_EVENT` must accept `RBAC_CATALOG_CHANGED`.
3. The plan must have no conflicts and its fingerprint must equal `--fingerprint`.
4. An interactive terminal and a typed confirmation `REGISTER <TARGET> <count> <first 12 fingerprint characters>`.
5. One LOW transaction: `LOCK TABLE` on the three catalogue tables `IN EXCLUSIVE MODE NOWAIT`, then
   identity, preconditions, catalogue and plan are read again; any change or conflict rolls back.
6. Inserts in module → resource → permission order, each with its audit row, then verification
   (every planned record matches; exactly one audit row per record) before commit.
7. Any failure rolls back. Statements have a 60-second call timeout inside the transaction.

| Message | Meaning and next step |
|---|---|
| `locked by another session (ORA-00054)` | Another catalogue change or registration holds the lock. Nothing was written. Preview again later |
| `created concurrently (ORA-00001)` | Someone created a planned record meanwhile. Rolled back. Preview again; approve the new plan |
| `plan no longer matches the reviewed fingerprint` | The catalogue changed after the review. Rolled back. Preview again |
| `UNKNOWN OUTCOME` | The commit failed or its answer was lost. The message prints the run's **correlation ID**: if the transaction committed, `XX_ZRV_RBAC_AUDIT_LOGS` contains `RBAC_CATALOG_CHANGED` rows with that `CORRELATION_ID`. **Do not re-run apply.** Run the preview to see the actual state and record both in the change log |
| `Refused: The server configuration is invalid…` / `Oracle wallet validation failed…` | Configuration or wallet problem. Raw messages (paths, aliases, settings, values) are deliberately not printed; check `server/.env` and the wallet locally |

The script never retries a write.

## Audit and accountability

Inserted rows have `CREATED_BY = NULL` and are audited with actor type `SYSTEM` (owner decision,
Phase 2B): `RBAC_CATALOG_CHANGED`, reason `MODULE_CREATED` / `RESOURCE_CREATED` /
`PERMISSION_CREATED`, `CORRELATION_ID` = the run's correlation ID, `USER_AGENT` =
`zr-rbac-register`, details `{ source: "REGISTRY_SYNC", target, planFingerprint, codes }`.

The person who ran it is therefore **not** in the database. Record every apply in the change log:

| Field | Example |
|---|---|
| Operator | Name of the person at the terminal |
| Owner approval | Reference to the written authorization |
| Target and identity | `TEST`, service name and `DB_NAME` printed by the preview |
| Plan fingerprint | The 64-character value approved |
| Correlation ID | Printed after commit (`rbac-register-…`) |
| Result | Committed records, or the refusal / unknown-outcome message |

## Ownership policy

- Modules and resources in the registry are **code-owned**; their codes and names come from the
  registry and are inserted only by this script.
- Catalogue rows created manually remain valid. They appear as `UNREGISTERED` and are never changed.
  To adopt one, add an identical definition to the registry (it then shows as `MATCH`).
- Administrators may still add actions in the Permission Catalog; for code-owned resources the
  screen recommends adding them to the registry too.

## Deployment

The CLI imports the registry from `client/src/config/registry/` (plain JavaScript, no
dependencies). A server release package must therefore contain:

- `server/` with its production `node_modules` (including `oracledb`) and scripts;
- `client/package.json` and `client/src/config/registry/**`.

Run from `server/` (where `.env` and the relative wallet path resolve) with Node.js 24, in an
interactive PowerShell or Command Prompt console for apply. No Express server, frontend or browser
is needed. Never commit `.env`, wallets or credentials.

## Tests

`server/tests/rbac-register.test.js` runs every guard and outcome with a mocked Oracle connection
(no database). Code: `scripts/rbac-register.js` (process entry), `scripts/lib/rbacRegisterEntry.js` (start-up order:
arguments, target and environment, and for apply the approved `DB_NAME`, all before the wallet is
validated or the LOW pool is created; errors reported through the dependency-free
`lib/safeErrors.js`), `scripts/lib/rbacRegisterCli.js` (preview and apply flow, repeating the guards) and `scripts/lib/rbacRegistration.js` (targets, SQL, comparison, inserts). `npm run db:verify-auth` parses (never executes) the registration SQL on TEST.
