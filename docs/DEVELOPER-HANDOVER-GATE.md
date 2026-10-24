# Pre-module handover audit — Zamil Digitalization

**Source baseline:** main at bd5a8f5449b172806d43975f3ea47cd1d88e7444 (24 October 2026).
**Scope:** GitHub inventory of 413 tracked paths and focused static review of architecture, authentication, RBAC, Oracle integration, tests, deployment configuration and developer documentation. This review **did not** run npm tests, npm audit, browser/UAT testing, Oracle operations or penetration testing.

## Decision

**Ready for controlled business module development once this handover PR and its CI checks pass. Not certified production secure or deployment-ready.** Approved backend architecture, central registry, existing permission evaluator, frontend API client, theme and developer workflow must be reused.

Phase 2A (PR #18), 2B (PR #19), and 2C (PR #20) are merged. Oracle TEST Phase 2B read-only preview reported 32 MATCH, zero MISSING and zero CONFLICT; no apply was needed or authorized. The only active developer-owned modules are COMMON (non-RBAC) and SECURITY_ADMINISTRATION. Future business modules are added only with approved business requirements.

## Findings and required follow-up

| ID | Severity | Finding | Action |
|---|---|---|---|
| H01 | High, developer-process | No GitHub Actions workflow existed at the audited baseline; reported manual checks were not enforced on PRs. | This handover adds source-only CI. The repository owner must configure required checks, PR approval and branch protection; workflow existence alone does not block merges. |
| H02 | High, production security (G1/G2) | Existing status report says database-enforced audit immutability and least-privilege separation remain incomplete. | Before production, approve and verify DB protections; no Oracle DDL/DML is authorized by this review. |
| H03 | High, production security (G2/G3) | Login rate limiter is per-process memory and resets on restart. | Add approved shared or gateway rate limiting for scaled/public deployment, retaining per-account lockout. |
| H04 | Medium, documentation | Backend status document contains historical uncommitted branch states, former branding and earlier MFA timeframes. | Preserve historical phase evidence but mark it explicitly superseded by current baseline, with links to current handoffs. |
| H05 | Medium, documentation | server/.env.example described a 10-minute login challenge; auth.policy.js actually enforces five minutes. | Correct the active example text. |
| H06 | Medium, developer tools | One developer npm environment swallowed --target=TEST from db:rbac-register. | Provide a direct Node CLI fallback; this is not authorization to connect to Oracle. |
| H07 | Medium, security/reliability design (G2/G3) | Recovery token delivery occurs through SMTP within an Oracle transaction before commit; slow delivery retains a connection, and an email might be delivered before a later commit failure. | Test and review before production, consider a transactional outbox only after approval; do not redesign authentication under this handover. |
| H08 | Medium, QA | Frontend tests are primarily Node tests and static JSX assertions, not real browser or accessibility tests. | Verify forms, dialogs, keyboard, mobile and dark mode in a browser under an authorized test plan. |
| H09 | Medium, performance | Frontend production verifier warns on JS chunks over 500 KiB without enforcing a performance budget. | Measure actual route payloads, query latency and representative workflows; fix proven bottlenecks. |
| H10 | High, production readiness | Prior backend handoff lists SMTP OAuth2 migration, privileged MFA onboarding, recovery mailbox ownership, privileged recovery delivery and reminder scheduling as outstanding. | Treat as deployment security/operational gates, not blockers to isolated business-module coding. |
| H11 | Medium, UX | Several existing forms are basic by owner report, but no list of approved redesign targets is recorded. | New features follow FORM-UX-QUALITY.md; existing screens get separate scoped approvals and visual acceptance tests. |

No confirmed exploitable vulnerability is asserted from this review. Static review does not prove vulnerability absence. Historical documents are evidence of what was true at their original date, not the current working branch.

## Locked principles for every developer

- Follow CLAUDE.md, CONTRIBUTING.md, docs/FEATURE-DELIVERY-WORKFLOW.md, docs/SECURITY-ESSENTIALS.md and relevant frontend/backend module guides.
- Source-of-truth for actual Oracle names and constraints is the approved Oracle schema/data dictionary; do not invent tables, columns, transaction statuses or APIs.
- Define modules/resources/actions using client/src/config/registry/. Permissions never auto-grant roles and navigation exists only for implemented routes.
- Enforce permissions and MFA at backend endpoints (UI only mirrors), Joi validation, CSRF and audit requirements, guarded write transactions and no blind mutation retries.
- Follow owner approval gates G1 (database/live operations), G2 (security), G3 (shared contracts), G4 (CI3 coexistence); source merge never authorizes database writes.
- One short-lived branch and reviewed PR per feature, preserve approved app behavior, add API/OpenAPI changes and tests, and document a handoff with exact test evidence.
- Do not commit wallets, passwords, employee data, production records or private logs. Do not change protected administrative roles or MFA policy.
- Use docs/FORM-UX-QUALITY.md for new business forms and approved improvements of named existing screens.

## Evidence still required before sign-off

**Before developer handoff:** CI jobs pass; required GitHub checks/reviews enabled; onboarding and feature guide reviewed; owner chooses first module and supplies its business contract.

**Before UAT:** owner-approved environment and Oracle operations only, browser and accessibility checks, representative workflows, error/partial outcomes, performance measurement and deployment/rollback rehearsal.

**Before production:** resolve H02, H03, H07, H10 with the appropriate approvals; real dependency audit, threat-model/security testing, HTTPS gateway/trusted proxy/cookie/origin configuration, DB least privilege, monitoring and backup/rollback verification.

No live Oracle, MFA operation, grant or recovery email was performed during this handover.
