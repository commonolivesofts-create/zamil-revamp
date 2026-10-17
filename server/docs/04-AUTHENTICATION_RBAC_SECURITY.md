# Zamil Revamp
## Authentication, RBAC & Application Security Standards

| Document control | Details |
|---|---|
| **Document ID** | ZR-BE-SEC-04 |
| **Version** | 1.0 |
| **Status** | Architecture reference — issued for technical review |
| **Architecture baseline** | V1.0, approved 16 October 2026 |
| **Applies to** | `zamil-revamp/server/` and the related React-to-API security contract |
| **Audience** | Backend and frontend developers, technical leads, QA and application administrators |
| **Related standards** | [01 — System Architecture](./01-SYSTEM_ARCHITECTURE.md), [02 — API Development Standards](./02-API_DEVELOPMENT_STANDARDS.md), [03 — Oracle Database Architecture](./03-ORACLE_DATABASE_ARCHITECTURE.md) |

---

## 1. Purpose and Scope

This document defines the **authentication, authorization and application security architecture** for the Zamil Revamp backend. It describes how a user signs in, how the application protects an authenticated session, how permissions are evaluated, and which security rules apply to every business API.

Zamil Revamp modernizes an existing **PHP CodeIgniter 3 (CI3)** application using a **React browser frontend** and a **Node.js 24 / Express 5 backend**. Existing Oracle ADW business tables and accepted business behavior remain in place unless a change is explicitly approved.

A **new user-management and RBAC design** is part of the new backend, but its actual database tables, columns, keys and session-storage implementation will be designed and approved **after the initial backend foundation setup**. This document defines the rules those structures must support; it is **not a physical database specification**.

Legacy CI3 user-account and password migration is **outside the development scope** and is handled independently by the project owner. Reviewing a legacy feature's business access rules for compatibility is still required when that feature is rebuilt.

**Core rule:** The server makes every security decision. React can show or hide available functionality, but hiding a screen or button is not authorization.

## 2. Security Architecture

The application has one centrally managed identity and authorization foundation. Each business domain uses the same protection mechanisms rather than implementing its own login, permissions or session logic.

```text
                  React browser application
                            |
                    HTTPS + session cookie
                            |
                       Express REST API
                            |
                 Shared request/security controls
         Request ID | HTTPS policy | limits | CSRF | Joi
                            |
                   Session authentication
                            |
                  Resource/action permission
                            |
                       Business service
             Organization / team / record-level scope
                            |
                   Feature-owned repository
                            |
                  Central Oracle database manager
                            |
                  Existing Oracle ADW Serverless

       Security audit events are recorded independently
       of Pino operational logs.
```

**Security responsibilities**

| Component | Responsibility |
|---|---|
| Authentication service | Verify credentials and user/account status; establish authenticated identity. |
| Session service | Create, validate, renew, expire and revoke sessions. |
| Authorization service | Determine effective resource/action permissions. |
| Business service | Enforce organization, team, ownership and record-specific business scope. |
| Express middleware | Enforce common authentication, authorization, validation, CSRF and request protection. |
| React | Display permitted navigation and actions from server-provided permission information. |
| Security audit | Track security-relevant account, session and permission events. |

Security services live in the centralized backend foundation. Business modules invoke them through approved interfaces.

## 3. Authentication and User Accounts

### 3.1 Approved login model

The initial application client is the **React web application only**. Authentication uses **persistent server-managed sessions with secure browser cookies**. A JWT access/refresh-token system is not required for the initial release.

A normal sign-in flow is:

1. The browser submits credentials through the approved HTTPS authentication endpoint.
2. The backend applies request validation, login throttling and generic failure handling.
3. The authentication service verifies the password and confirms the account is active and eligible for login.
4. Privileged accounts must satisfy the approved administrator MFA requirement.
5. After successful authentication, the server creates a fresh session and sets a secure session cookie.
6. The browser uses that cookie for subsequent protected API requests. The backend checks the session and permissions on every relevant request.

The client can retrieve the current user and effective frontend permissions using a protected **current-user** endpoint. The specific endpoint names and payload details belong to the API contract, not this document.

**Account management rules**

- New users and roles are created or maintained only through authorized administrative processes.
- Accounts must support controlled activation, deactivation, lock and session revocation behavior.
- A disabled account must not retain usable access through an earlier session.
- User identities may link to existing employee records when the business requirement calls for it; this does not justify duplicating the existing employee master.
- Normal business operations must not use shared human login accounts or hardcoded credentials.
- Initial privileged administration requires a controlled one-time bootstrap procedure; no permanent default administrator/password is permitted.

### 3.2 Password protection

**Argon2id** is the approved password-hashing algorithm for the new authentication system. Use a unique salt and benchmark hashing parameters on the deployed server. Do not store recoverable passwords, use fast general-purpose hashing (such as plain SHA-256), or log credential values.

Password-policy standards:

| Area | Required approach |
|---|---|
| Minimum length | Apply the approved deployment password policy; **15 characters is the recommended starting point for password-only authentication**, subject to policy finalization. |
| Long passwords | Allow passphrases and a practical maximum of at least 64 characters. |
| Character requirements | Avoid arbitrary uppercase/digit/symbol composition rules. |
| Weak passwords | Screen against common or compromised password values where practicable. |
| Password changes | Require change after a verified compromise or user action, not arbitrary periodic rotation. |
| Failure feedback | Do not reveal whether a username exists, is inactive or has a wrong password. |

Login attempts must have account-aware throttling and reasonable network-level rate limits. Thresholds and lock duration will be configured and tested, not hardcoded as architectural constants.

### 3.3 Reset and recovery

Password-reset requests must return a consistent public response whether or not the account exists. Reset credentials must be high-entropy, expiring and single-use; store only a secure verifier when persistence is needed. Do not send passwords by email, expose reset credentials in logs or URLs captured by internal logging, or change an account before a valid reset request is completed. Successful reset must trigger appropriate session invalidation and a security notification.

MFA recovery is a separate privileged operation and must not become an easier path to bypass MFA.

## 4. Session Management

The browser holds an **opaque session identifier**, not a reusable application credential stored in JavaScript. The backend retains and verifies the session state.

### 4.1 Cookie and session requirements

| Control | Standard |
|---|---|
| Transport | HTTPS for production and other nonlocal protected environments. |
| Cookie | `Secure`, `HttpOnly`, explicit `SameSite=Lax` as the initial recommendation. |
| Cookie scope | Host-only and narrowest practical scope; prefer a `__Host-` prefix when compatible with the final deployment. |
| Identifier | Cryptographically unpredictable opaque value, generated and accepted only through the approved session mechanism. |
| Browser storage | Do not store authentication tokens or raw session IDs in `localStorage` or `sessionStorage`. |
| Regeneration | Issue a fresh session identifier after login and relevant privilege-level changes. |
| Expiration | Enforce both idle and absolute expiration **on the server**. |
| Revocation | Invalidate on logout, password/security changes and account deactivation as appropriate. |
| Production storage | Shared persistent storage; in-process memory alone is not an acceptable production session store. |

**Proposed policy values, not yet locked:** 30-minute idle timeout and eight-hour absolute lifetime. Exact values, session renewal intervals, the cookie name, and the physical session store remain implementation decisions requiring approval.

Oracle ADW accessed through the **LOW** pool is a session-store candidate, not an approved session-table design. Its lookup and write workload must be evaluated before the storage decision. Do not add Redis or a new Oracle session table without a specific approved need.

Revoke sessions server-side. Deleting the browser cookie alone is not sufficient. Permission and role changes must not leave stale privileges usable in a previously issued session; use timely re-evaluation or a properly invalidated permission cache.

## 5. Authorization: Resources, Actions and Roles

The approved authorization model is **resource-and-action RBAC**, with separately enforced business-data scope.

```text
User account
    |
Assigned active roles
    |
Role-to-permission grants
    |
Resource + Action permission
    |
Organization / team / record-level policy
    |
Permit or deny requested operation
```

### 5.1 Resource design

The RBAC model must accommodate **business modules, submodules, forms, reports, dashboards, widgets, workflows and important business actions**. A resource does not need every possible action.

| Resource example | Illustrative actions |
|---|---|
| HR Employee Management | View, create, update, deactivate |
| Leave Request | View, create, approve, reject, cancel |
| Production Work Order | View, create, update, release, complete |
| Production Report | View, export |
| Dashboard or widget | View |
| User / Role Administration | View, create, update, assign permissions |

These names and actions are **logical examples**, not confirmed existing resources or database codes. The exact permission catalog will be defined during the new RBAC feature design.

An API endpoint declares the permission required for its operation. There is no need to create one database permission for every technical route when multiple routes represent the same business capability. Separate permissions are appropriate when an operation is genuinely sensitive or distinct (for example, `export`, `approve` or `complete`).

### 5.2 Permission evaluation rules

- **Deny by default.** Missing permission, inactive role, unavailable user context or failed scope evaluation means access is denied.
- Evaluate permissions on every protected backend request. Do not trust React-provided roles, permission names, organization IDs or hidden controls as proof of authority.
- Multiple valid roles may contribute permissions additively; the effective grant remains subject to business-data scope and explicit policy constraints.
- Authorization checks must happen before protected data is returned, changed, downloaded or exported.
- Highly privileged permission assignment must be restricted; ordinary administrators may not grant themselves or others privileges beyond their authorized authority.
- Business modules must not duplicate permission logic or access another module's private permission tables directly.

### 5.3 Organizational and record-level scope

A resource permission answers **what** an account may do; a scope policy answers **which records** it may affect.

| Conceptual scope | Meaning |
|---|---|
| `OWN` | Only the user's eligible records. |
| `TEAM` | Eligible subordinate or assigned team records. |
| `ORGANIZATION` | Records in the user's authorized organization(s) or divisions. |
| `ALL` | Eligible records across the business subject to further safeguards. |

For example, a manager with permission to view work orders in **IPP** must not automatically receive access to **FPP** work orders. Filters provided by the frontend are never a substitute for server-enforced scope predicates. Object IDs in URL paths require record-level authorization even when the user possesses the general `view` or `update` permission.

The actual organization and hierarchy relationships must be verified against existing business data during feature implementation. The conceptual scopes are **not a new schema definition**.

### 5.4 React and Express responsibilities

| React frontend | Express backend |
|---|---|
| Uses current-user/permission information to show permitted screens and actions. | Validates session and active account status. |
| May disable unauthorized buttons for usability. | Enforces required resource/action permission. |
| Requests records within the selected division or search filter. | Applies trusted organization/record-level restrictions independently. |
| Handles `401` and `403` responses appropriately. | Returns standardized safe errors without leaking protected resources. |

No feature can be considered secure because its React menu or button is hidden.

## 6. Role and Permission Administration

RBAC management is a sensitive administrative capability and must use the same central authorization mechanisms as other protected features.

| Administrative operation | Control |
|---|---|
| Create or change a role | Require a dedicated administrative permission and audit entry. |
| Assign or revoke a role | Verify administrator authority, target account and allowable role. |
| Change permission grants | Prevent unauthorized privilege escalation; invalidate stale effective permissions. |
| Change own roles/privileges | Block ordinary self-elevation and require an approved privileged workflow. |
| Disable an account | Prevent access, revoke existing sessions and record the change. |
| Remove last effective administrator | Block unsafe lockout of administrative access. |

Complex user-level *deny* overrides and numerous one-off exceptions are not part of the initial RBAC architecture. They require a distinct business justification and approval.

## 7. Centralized API Security Controls

Common security controls belong in shared Express infrastructure and must be applied consistently across business domains.

| Control | Backend standard |
|---|---|
| HTTPS and headers | Enforce HTTPS; use appropriate security headers and an approved Content Security Policy. |
| CSRF | Protect cookie-authenticated state-changing operations with a server-validated CSRF mechanism and Origin checks where appropriate. |
| CORS | Prefer same-origin React/API deployment; otherwise allow only specific trusted origins with deliberate credential settings. |
| Joi validation | Validate request body, route parameters and query fields; reject unauthorized write fields. |
| SQL injection | Use Oracle bind variables and approved identifier allowlists; follow Document 03. |
| Request limits | Set body-size, rate, timeout and concurrency limits appropriate to each endpoint. |
| Browser output | Encode untrusted output where appropriate; do not render untrusted HTML without a proven safe process. |
| External services | Restrict destinations and credentials; apply timeouts, safe error handling and idempotency for supported workflows. |
| File handling | Allow uploads only through approved validation, storage and scanning controls when the feature requires them. |

**CSRF detail:** `HttpOnly` and `SameSite` cookies alone do not complete CSRF protection. A synchronizer-token design is a suitable candidate for the stateful session model; its specific issuance, request-header contract and Express integration must be finalized during authentication implementation. `GET` requests must not mutate business state.

**Response behavior:** Use the standardized response contract from Document 02. `401` applies to unauthenticated requests, `403` to insufficient access, and `404` may be used where a protected resource must not be disclosed. Security errors must not expose database details, permission-table structures or internal policy calculations.

### Swagger UI and API specifications

The approved **OpenAPI 3.1 + Swagger UI** setup documents each endpoint's authentication requirement, necessary business permission, record scope and relevant CSRF behavior. The OpenAPI `security` scheme describes authentication; it does **not** enforce RBAC itself.

Interactive Swagger requests must pass the real security checks. Enable developer testing only in approved environments; production documentation access must follow the selected hosting and security policy. No sample should contain real credentials, production session cookies or sensitive business records. Detailed Swagger conventions are maintained in [Document 02](./02-API_DEVELOPMENT_STANDARDS.md).

## 8. Administrator MFA and Sensitive Actions

**MFA is required for privileged administrator accounts.** The initial mechanism (such as TOTP or a phishing-resistant option), enrollment, recovery and enforcement policy remain to be finalized at implementation design. The absence of an MFA implementation must never be represented as a completed production security control.

Sensitive operations may require recent reauthentication, an additional approval or a fresh MFA challenge based on risk. Examples include permission elevation, resetting another administrator's factor, and changes to security-sensitive configuration.

Recovery mechanisms must be rate-limited, logged and at least as carefully protected as the related authentication flow. Avoid security-question-based recovery.

## 9. Audit Logging and Operational Logging

**Security/business audit records** and **Pino operational logs** serve different purposes.

| Security and business audit | Operational logs |
|---|---|
| Login success/failure, logout, lockout, password/reset actions | Request processing, application errors and latency |
| Role or permission assignment changes | Oracle connectivity, query timing and pool health |
| User activation/deactivation | Integration failures and retry diagnostics |
| Sensitive exports and administrative actions | Runtime warnings, exceptions and operational metrics |

A security event should identify the event time, actor or attempted identity where appropriate, action, affected target, outcome and request correlation ID. The actual audit persistence structure will be approved during relevant feature/database design. Audit records need restricted read access and an approved retention policy.

Never log passwords, complete reset tokens, session cookies, raw session IDs, Oracle wallet material, private keys or unnecessary personal data. Logs must be redacted and protected from unauthorized modification or access. Request correlation IDs help connect the API response, operational logs and business audit event without disclosing secrets.

## 10. Implementation Sequence and Verification

The initial backend foundation establishes the shared framework and security interfaces **without inventing new RBAC tables**. After that, the new RBAC schema is designed and approved, followed by the authentication and authorization implementation. Protected business APIs cannot be released with placeholder `allow-all` middleware or hardcoded users.

**Security acceptance checklist**

| Scenario | Required verification |
|---|---|
| Unauthorized request | Missing session returns a safe `401`; no protected data is returned. |
| Permission denial | Authenticated user without the action receives `403` or appropriate concealment behavior. |
| Record-level access | User cannot access another organization/team/user's prohibited records by changing an ID or filter. |
| Session expiry/revocation | Expired, logged-out and deactivated sessions no longer authorize requests. |
| Login security | Password verification, throttling and generic failure responses work as specified. |
| CSRF | Protected state-changing requests fail without a valid approved CSRF proof. |
| Role updates | Revoked permissions stop working without requiring an unsafe delay. |
| Administrator safeguards | Self-elevation and last-administrator removal are prevented. |
| Audit | Security events are recorded without exposing secrets. |
| Swagger UI | Interactive requests cannot bypass authentication, permissions or CSRF controls. |

Document-specific **open implementation decisions**:

- Physical new RBAC entities, keys, relationships and permission catalog.
- Session storage technology, session/cookie names and actual timeouts.
- Final administrator MFA method, enrollment, recovery and step-up policies.
- Password-reset delivery method, hashing cost parameters and rate-limit thresholds.
- Audit storage, retention periods and production Swagger access policy.

These are intentionally **not presumed complete** by the approved logical architecture.

## 11. Related Documents and Security References

| Document | Responsibility |
|---|---|
| [01-SYSTEM_ARCHITECTURE.md](./01-SYSTEM_ARCHITECTURE.md) | System-level architecture, feature boundaries and request lifecycle. |
| [02-API_DEVELOPMENT_STANDARDS.md](./02-API_DEVELOPMENT_STANDARDS.md) | API contracts, Joi validation, error responses and Swagger/OpenAPI. |
| [03-ORACLE_DATABASE_ARCHITECTURE.md](./03-ORACLE_DATABASE_ARCHITECTURE.md) | Oracle driver, LOW/HIGH pools, SQL, transaction handling and schema preservation. |
| **04-AUTHENTICATION_RBAC_SECURITY.md** | Authentication, logical RBAC, scope policy, API protections and security audit (this document). |
| `05-CONFIGURATION_OPERATIONS.md` | Secrets, environments, operational logging, monitoring and deployment. |
| `06-ARCHITECTURE_DECISIONS_GUIDELINES.md` | Consolidated approved ADRs, development governance and deferred items. |

Supporting security guidance:

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST SP 800-63B-4 — Password and Authenticator Guidance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)

---

*Document end — ZR-BE-SEC-04 · Version 1.0*
