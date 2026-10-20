# Phase 02 — MFA (TOTP) Authentication and Authenticator Replacement

**Status:** Complete for the approved scope; merged to `main` via PR #3 (`d0fb338`).
**Written:** retrospectively on 2026-10-20 from the implementation and verification records.
**Scope:** Backend only; locked schema unchanged; no DDL.

## 1. Implemented APIs (`/api/v1/auth`)

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /login` (changed) | Origin check, rate limit | For mandatory-MFA or MFA-enrolled users a correct password returns `authenticated: false` plus a 10-minute MFA challenge (`__Host-zr_mfa` cookie + challenge CSRF token). No session, no audit row. Without the MFA key: `403 MFA_REQUIRED` (fail closed). |
| `POST /mfa/enrollment` | challenge + CSRF | First authenticator only: returns the candidate secret (derived per challenge, nothing stored). |
| `POST /mfa/enrollment/confirm` | challenge + CSRF | Proof of possession, stores the AES-256-GCM-encrypted secret, revokes all other sessions, issues an MFA-verified session. |
| `POST /mfa/verify` | challenge + CSRF | TOTP check (SHA-1, 6 digits, 30 s, ±1 step), atomic replay guard, MFA-verified session. |
| `POST /mfa/replacement` | session + CSRF, MFA verified ≤ 10 min | New candidate secret under a separate derivation purpose. |
| `POST /mfa/replacement/confirm` | session + CSRF, MFA verified ≤ 10 min | Verifies the new code, optimistic replace, revokes every session incl. the current one; new sign-in required. |

Operator tool: `scripts/mfa-test-flow.js` (`npm run auth:mfa-test`, `-- --replace`), loopback only, hidden prompts.

## 2. Security controls and decisions

- Challenge = `XX_ZRV_USER_SESSIONS` row with `MFA_VERIFIED_AT` NULL and ≤ 10-minute lifetime; never accepted as a session (shape check + `MFA_VERIFIED_AT` check).
- Replay: `MFA_LAST_USED_STEP` updated with `WHERE mfa_last_used_step < :step`; enrollment `WHERE secret IS NULL`; replacement `WHERE secret = :current` (optimistic). Concurrent submissions proven to fail one request.
- Wrong/replayed codes share the 5-failure / 15-minute lockout; the counter resets only after completed MFA. A lockout ends the challenge (and, during replacement, every session).
- Key held outside Oracle (`AUTH_MFA_ENCRYPTION_KEY`, 32 bytes), HKDF-separated sub-keys; ciphertext bound to `USER_ID`.
- Audit: `LOGIN_SUCCESS` only when the MFA-verified session exists; failures `LOGIN_FAILED`; replacement `SESSION_REVOKED`/`MFA_REPLACED`; in-session refusals `ACCESS_DENIED`. No secrets, codes or ciphertexts in audit rows or logs.
- Approved: 10-minute challenge; reset failure counter only after MFA; password-only first enrollment **provisionally, for the controlled TEST enrollment of Zaid only**.
- `HTTP_HOST` defaults to `127.0.0.1` in development/test.

## 3. Verification

- `npm run check`: **295/295** (Oracle replaced by in-memory doubles), incl. RFC 4226/6238 vectors, mutation checks of replay, challenge-shape, counter-reset, MFA-flag, concurrency and replacement guards.
- `npm run db:verify-auth`: all checks passed read-only on TEST (new DML parse-only).
- Real Oracle TEST (developer-run): Zaid enrolled, verified, logged out; after the setup key was exposed, the authenticator was replaced through the API. Read-only post-check **18/18 PASS**: new secret stored, enrollment time = replacement time, 0 active sessions/challenges, one `SESSION_REVOKED`/`MFA_REPLACED`, `LOGIN_SUCCESS` 8 = MFA-verified sessions 8, `LOGOUT` 7, no failures, ACTIVE, SUPER_ADMINISTRATOR, MFA required.

## 4. Remaining functionality and production blockers

- Not implemented: voluntary MFA enrollment from an ordinary session; step-up for other sensitive actions; MFA recovery (Zaid e-mail recovery, administrator-authorised recovery — Phase 08); key rotation (a key change makes enrollments unreadable).
- Production policy for first enrollment of privileged users is **not approved** (password-only enrollment was TEST-only).
- Pre-production blockers carried forward: database audit immutability (trigger/grants), shared/gateway rate limiting, production key custody.
