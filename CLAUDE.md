# Zamil Digitalization — Claude Code Project Instructions

**Project:** Existing Zamil Digitalization enterprise application modernization.
**Current scope:** Node.js backend authentication, authorization, user administration, and RBAC APIs.
**Frontend:** Explicitly deferred. Do **not** inspect or modify `client/` in this workstream.
**Current phase:** Phase 01 implemented; Oracle TEST bootstrap completed. Git review pending. Ordinary-user Oracle integration testing remains pending. See server/docs/08-IMPLEMENTATION_STATUS.md.
**Git:** Developer has already checked out `feat/auth-foundation`. Verify it read-only before coding.

## Read this small navigation file first, then only relevant references

1. `server/docs/08-IMPLEMENTATION_STATUS.md` — current stage, completed work, blockers and next action.
2. `server/docs/07-AUTHENTICATION_RBAC_LOCKED_REQUIREMENTS.md` — approved post-architecture decisions and Phase 01 requirements. **Required before authentication/RBAC development.**
3. `server/docs/01-SYSTEM_ARCHITECTURE.md` through `06-ARCHITECTURE_DECISIONS_GUIDELINES.md` — six approved architecture documents; inspect relevant sections, not entire unrelated application.
4. `server/docs/handoffs/PHASE-00-READINESS.md` — verified read-only preimplementation observations.
5. Relevant previous feature handoff, if one exists. Do not reread all past handoffs without need.

**Authority rule:** The owner's later, explicitly locked decisions documented in 07 prevail over contradictory historical *behavioral policy* statements in 01–06. The deployed Oracle dictionary is authoritative for **actual physical columns, constraints and datatypes**. If physical schema cannot support an approved behavior, STOP that affected change and ask; do not invent DDL. Do not silently edit the original six approved documents.

## Technical baseline

- Node.js 24, Express 5, JavaScript ES Modules, modular monolith with feature-first Controller → Service → Repository.
- Oracle Autonomous Database Serverless; reuse current LOW/HIGH pools, helpers, transactions, bind variables and UTC event-time conventions.
- REST `/api/v1`, Joi, Pino, existing standardized API envelopes, Swagger/OpenAPI 3.1, Node native tests and Supertest.
- **Login:** `XX_DIGI_EMP_MASTER.USER_NAME` → `EMPLOYEE_NUMBER` → `XX_ZRV_USERS.PASSWORD_HASH` (Argon2id).
- All 11 existing Oracle RBAC tables / 122 approved columns are LOCKED. No DDL or seeded rows without explicit owner authorization.
- Password/session/MFA, administrator hierarchy, override DENY precedence, audits and recovery policies: see 07.

## Operating boundaries

- Work ONLY in the currently authorized feature scope and branch. First inspect code, relevant docs and read-only Oracle dictionary as required.
- Do not modify `client/`, unrelated business features, Oracle wallet, `secrets/`, real `.env` credentials, CI/CD, or locked Oracle schema.
- Do not perform Git writes: no checkout/switch, fetch/pull, commit, push, merge, rebase, reset or Git config changes. **Developer handles Git.** Read-only `git status`, `git branch --show-current`, `git diff` are permitted.
- No new production dependency without approval. Do not run database writes, even TEST data seeding, without explicit authorization.
- Never print secrets, hashes, raw tokens, wallet bytes or real employee records in reports/logs.
- Keep implementation targeted and testable. Distinguish mocked tests from real Oracle integration tests; do not claim unexecuted tests passed.

## Mandatory per-feature handoff discipline

During a feature: update `server/docs/08-IMPLEMENTATION_STATUS.md` to reflect **actual** progress only. For each completed major feature, create `server/docs/handoffs/PHASE-XX-<FEATURE>.md` with summary, actual routes/contracts, code files, Oracle tables/columns used, security controls, tests run/results, limitations, dependencies, and suggested commit message. Do not invent completion status. **Do not commit or push**; report outcomes to the developer for review. The developer will commit these docs with the corresponding feature after approval.

**Current immediate action:** Once the developer authorizes Phase 01, follow the provided Phase 01 implementation prompt; do not implement Phase 02 or the frontend. If prerequisite documents conflict, describe only the material blocker instead of restarting broad architecture design.
