# Developer Onboarding

How to prepare your own authorized development environment, run Zamil Revamp locally and verify
your work. Nothing in this guide contains or replaces real credentials: you obtain those through
the project's authorized channel.

## 1. Prerequisites

| Item | Requirement |
|---|---|
| Node.js | **24** (the backend declares `"engines": { "node": ">=24" }`); npm is included |
| Git | Any current version; SSH or other approved GitHub authentication |
| GitHub access | Authorized access to `commonolivesofts-create/zamil-revamp` under **your own** identity |
| Oracle access | Only if you will run the backend against the database: the TEST database user, password, wallet and wallet password, issued to you by the project owner |
| Browser | A current Chromium, Firefox or Edge (the session cookie is a `Secure` `__Host-` cookie, accepted on `http://localhost`) |

Your Git identity must be your own (see [`CONTRIBUTING.md` §3](../CONTRIBUTING.md)). Set it for this
repository only, without changing global configuration:

```powershell
git config user.name  "<your name>"
git config user.email "<email linked to your GitHub account>"
```

## 2. Repository layout

```text
zamil-revamp/
├── client/            React 19 + Vite 8 frontend          → client/docs/README.md
├── server/            Node.js 24 + Express 5 backend      → server/docs/README.md
├── docs/              Team-wide guides (this folder)
├── secrets/           Local Oracle wallets — git-ignored, never committed
├── CONTRIBUTING.md    Approved Git & GitHub policy
└── README.md
```

## 3. Install

```powershell
git clone <repository SSH or HTTPS URL> zamil-revamp
cd zamil-revamp
cd server; npm install; cd ..
cd client; npm install; cd ..
```

Use `npm install` (or `npm ci` for a clean install from the lockfiles). Do not add, upgrade or
remove dependencies as part of a feature without approval.

## 4. Configure the backend (`server/.env`)

1. Copy `server/.env.example` to `server/.env`. The example lists every supported variable with
   safe defaults and comments; never commit `.env` (it is git-ignored).
2. Place the Oracle wallet you were issued under `secrets/` at the repository root (for example
   `secrets/oracle/<wallet folder>/`) and point `ORACLE_WALLET_DIR` at it (relative paths resolve
   against `server/`). The folder must contain `tnsnames.ora` and `ewallet.pem`.
3. Fill in `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_WALLET_PASSWORD` and the LOW/HIGH service
   aliases from the wallet's `tnsnames.ora`. Local development uses the **TEST** database only.
4. For sign-ins that require MFA, set `AUTH_MFA_ENCRYPTION_KEY` (and `AUTH_MFA_KEY_ID`) to the
   values issued to you. Without the key, accounts that must use MFA cannot complete sign-in.
5. Leave `SMTP_ENABLED=false` unless you are authorized to send e-mail. With delivery disabled,
   e-mail-dependent flows (password setup/reset, MFA recovery) fail closed with
   `503 DELIVERY_UNAVAILABLE`; that is expected.
6. Only if you are authorized to enable SMTP: `AUTH_FRONTEND_BASE_URL` becomes required; set it to
   `http://localhost:5199` so e-mailed links open the local frontend (outside development/test it
   must be `https`).

Configuration is validated at startup by `server/src/config/index.js`; a missing or invalid value
stops the server with a clear message. Never read `process.env` anywhere else.

## 5. Configure the frontend (optional)

The frontend works without a local environment file. If you need to change a public setting, copy
`client/.env.example` to `client/.env.local`. Every `VITE_` value is compiled into the browser
bundle, so it must never contain a secret.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_APP_NAME` | `Zamil Revamp` | Display name |
| `VITE_API_BASE_URL` | empty → `/api/v1` | Keep empty: the API must be same-origin |
| `VITE_AUTH_DEV_PREVIEW` | `false` | Development-only layout preview with **no** authentication; keep `false` for real integration |

## 6. Run locally

Start the backend first, then the frontend, in two terminals:

```powershell
cd server; npm run dev        # http://localhost:3000 (watch mode)
cd client; npm run dev        # http://localhost:5199
```

Open **http://localhost:5199**.

### The same-origin `/api` proxy

The browser only ever talks to `http://localhost:5199`. Vite forwards every request under `/api`
to the backend on `http://localhost:3000` (`client/vite.config.js`, `apiProxy`, with
`changeOrigin: false`). This matters because:

- the backend sends **no CORS headers** — a cross-origin API is not supported;
- the session cookie is an HttpOnly, `Secure`, `__Host-` cookie scoped to the page's origin;
- the backend's Origin check accepts state-changing requests whose `Origin` equals its own origin
  as seen through the `Host` header, which the proxy preserves.

Do not point the frontend directly at `http://localhost:3000`, and do not add CORS to the backend.

### Useful local URLs

| URL | What |
|---|---|
| `http://localhost:5199` | Application |
| `http://localhost:3000/health/live`, `/health/ready` | Backend liveness / Oracle readiness |
| `http://localhost:3000/api/docs` | Swagger UI (only when `API_DOCS_ENABLED=true`, development/test) |
| `http://localhost:3000/api/openapi.json` | The OpenAPI document served to Swagger UI |

Signing in against TEST writes real audit, session and user-state rows. Use only the account you
were authorized to use.

## 7. Verify your work

| Where | Command | What it does |
|---|---|---|
| `server/` | `npm run check` | ESLint + Prettier check + all backend tests (Oracle replaced by test doubles) |
| `server/` | `npm test` | Backend tests only |
| `server/` | `npm run db:status` | Read-only LOW/HIGH connectivity check against your configured database |
| `client/` | `npm run lint` | ESLint |
| `client/` | `npm test` | Frontend tests (`node --test "tests/*.test.mjs"`, mocked transport) |
| `client/` | `npm run build` | Production build into `client/dist/` |
| `client/` | `node scripts/verify-production.mjs` | Static release checks on `dist/` (run after a build) |
| `client/` | `npm run preview` | Serves `dist/` on port 5199 with the same `/api` proxy |

Details: [frontend testing](../client/docs/FRONTEND-TESTING.md),
[backend testing](../server/docs/BACKEND-TESTING.md).

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm run dev` in `client/` fails with "Port 5199 is in use" | Another process holds the port. `strictPort` is intentional (e-mailed links target 5199); stop the other process. |
| The app shows "Session check unavailable" | The backend is not running or not reachable through the proxy. Start `server` on port 3000. |
| Login fails with `CSRF_REJECTED` or a 403 on every change | You are not using the same origin. Open `http://localhost:5199`, not `127.0.0.1` or the backend port. |
| `/health/ready` reports the database as unavailable | Wallet path, wallet password, aliases or credentials are wrong, or the network blocks ADW. Run `npm run db:status` for a safe diagnostic. |
| Accounts that require MFA cannot finish sign-in | `AUTH_MFA_ENCRYPTION_KEY` is missing. |
| Password setup/reset or MFA recovery returns `DELIVERY_UNAVAILABLE` | Expected while `SMTP_ENABLED=false`. |
| Security Administration pages show "access denied" asking for authenticator verification | Those pages require an MFA-verified session; sign in with your authenticator. |
| The dashboard shows "Development preview — not authenticated" | `VITE_AUTH_DEV_PREVIEW=true` in `client/.env.local`; set it to `false` and restart Vite. |

## 9. Next steps

Read the [feature delivery workflow](FEATURE-DELIVERY-WORKFLOW.md) and
[security essentials](SECURITY-ESSENTIALS.md), then the frontend or backend guides for your work.
