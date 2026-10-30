# Developer Onboarding

How to prepare your own authorized development environment, run Zamil Digitalization locally and verify
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

### Line endings (Windows)

The repository uses **LF** line endings for all text files. The root
[`.gitattributes`](../.gitattributes) is the authoritative policy (`* text=auto eol=lf`; `.png` and
`.ico` are binary). It overrides your personal `core.autocrlf` setting, so a checkout on Windows
also gets LF, which the backend Prettier check (`endOfLine: lf`) requires.

- Do not convert source files to CRLF, and do not change the Prettier configuration or skip
  `npm run check` to work around line endings.
- Do not run `npm run format` over the whole project to "fix" line endings; it rewrites unrelated
  files. Format only the files you changed.
- Check line endings with `git ls-files --eol <path>`: you should see `i/lf w/lf` for text files
  (`i/` = repository, `w/` = your working copy).

**Older checkouts** created before `.gitattributes` existed may still contain CRLF or mixed copies
(`i/lf w/crlf`, `i/lf w/mixed`); Git does not rewrite them on its own. Refresh them **only when
`git status --short` prints nothing**: each affected working copy is deleted and restored from the
repository, which would discard uncommitted edits to it.

```powershell
# PowerShell, from the repository root, with a clean working tree
if (@(git status --short).Count -ne 0) { throw 'Commit or stash your changes first.' }
git ls-files --eol | Where-Object { $_ -match '^i/lf\s+w/(crlf|mixed)' } | ForEach-Object {
  $path = $_.Split("`t")[1]; Remove-Item -LiteralPath $path; git checkout -- $path }
git ls-files --eol | Select-String 'w/(crlf|mixed)'   # should print nothing
```

```bash
# Git Bash equivalent (clean working tree only)
git ls-files --eol | grep -E '^i/lf[[:space:]]+w/(crlf|mixed)' | cut -f2 |
  while IFS= read -r path; do rm -- "$path" && git checkout -- "$path"; done
```

A plain `git checkout -- <file>` is not enough: Git skips files it considers unchanged.

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
   `http://localhost:7382` so e-mailed links open the local frontend (outside development/test it
   must be `https`).
7. **Administrator MFA (`AUTH_ADMIN_MFA_REQUIRED`).** Keep the default `true`. On your **own
   machine only**, you may set `AUTH_ADMIN_MFA_REQUIRED=false` to sign in as an administrator with
   username and password, without enrolling an authenticator. The server refuses to start with
   `false` unless `NODE_ENV=development`, `HTTP_HOST` is loopback (`127.0.0.1` or `::1`) and
   `TRUST_PROXY_HOPS=0`, and logs
   `WARNING: Administrator MFA requirement is disabled for local development.` at startup.
   Password, account, eligibility, lockout, expiry and RBAC checks still apply, sessions are never
   marked MFA-verified, and actions that need a recent authenticator verification (replacing an
   authenticator, authorizing recovery of an administrator account) stay unavailable. Setting it
   back to `true` ends those sessions on their next request. Never use `false` in UAT, production
   or any shared or reachable environment.

Configuration is validated at startup by `server/src/config/index.js`; a missing or invalid value
stops the server with a clear message. Never read `process.env` anywhere else.

## 5. Configure the frontend (optional)

The frontend works without a local environment file. If you need to change a public setting, copy
`client/.env.example` to `client/.env.local`. Every `VITE_` value is compiled into the browser
bundle, so it must never contain a secret.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_APP_NAME` | `Zamil Digitalization` | Display name (the official name; an older `.env.local` may still override it with the former name — update or remove that line) |
| `VITE_API_BASE_URL` | empty → `/api/v1` | Keep empty: the API must be same-origin |
| `VITE_AUTH_DEV_PREVIEW` | `false` | Development-only layout preview with **no** authentication; keep `false` for real integration |

## 6. Run locally

Start the backend first, then the frontend, in two terminals:

```powershell
cd server; npm run dev        # http://127.0.0.1:7381 (watch mode)
cd client; npm run dev        # http://localhost:7382
```

Open **http://localhost:7382**.

### The same-origin `/api` proxy

The browser only ever talks to `http://localhost:7382`. Vite forwards every request under `/api`
to the backend on `http://127.0.0.1:7381` (`client/vite.config.js`, `apiProxy`, with
`changeOrigin: false`). The target is the backend's development listener address (`HTTP_HOST`
defaults to `127.0.0.1`); `localhost` resolves to IPv6 `::1` first on Windows. This matters because:

- the backend sends **no CORS headers** — a cross-origin API is not supported;
- the session cookie is an HttpOnly, `Secure`, `__Host-` cookie scoped to the page's origin;
- the backend's Origin check accepts state-changing requests whose `Origin` equals its own origin
  as seen through the `Host` header, which the proxy preserves.

Do not point the frontend directly at `http://localhost:7381`, and do not add CORS to the backend.

### Useful local URLs

| URL | What |
|---|---|
| `http://localhost:7382` | Application |
| `http://127.0.0.1:7381/health/live`, `/health/ready` | Backend liveness / Oracle readiness |
| `http://127.0.0.1:7381/api/docs` | Swagger UI (only when `API_DOCS_ENABLED=true`, development/test) |
| `http://127.0.0.1:7381/api/openapi.json` | The OpenAPI document served to Swagger UI |

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
| `client/` | `npm run preview` | Serves `dist/` on port 7382 with the same `/api` proxy |

Details: [frontend testing](../client/docs/FRONTEND-TESTING.md),
[backend testing](../server/docs/BACKEND-TESTING.md).

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm run dev` in `client/` fails with "Port 7382 is in use" | Another process holds the port. `strictPort` is intentional (e-mailed links target 7382); stop the other process. |
| The app shows "Session check unavailable", or sign-in says "The application server could not be reached" | The proxy got no answer from the backend (Vite logs `http proxy error`): it is not running, failed at startup (check its terminal, e.g. missing `server/.env`), or is restarting after a file change. `npm run dev` restarts on every saved backend file and the port is closed for about one second; the session check retries this automatically twice, a sign-in is never resent, so submit it again. Otherwise start `server` on port 3000, then retry. |
| E-mailed setup/reset/recovery links open port 5173 (or `127.0.0.1`) | `AUTH_FRONTEND_BASE_URL` in your `server/.env` is wrong; set it to `http://localhost:7382` and restart the backend. |
| Sign-in says "The service is temporarily unavailable" with a Reference | The backend answered `503 SERVICE_UNAVAILABLE`: it could not obtain an Oracle connection in time. Search the backend log for the Reference (request ID) to see the Oracle cause. |
| Login fails with `CSRF_REJECTED` or a 403 on every change | You are not using the same origin. Open `http://localhost:7382`, not `127.0.0.1` or the backend port. |
| `/health/ready` reports the database as unavailable | Wallet path, wallet password, aliases or credentials are wrong, or the network blocks ADW. Run `npm run db:status` for a safe diagnostic. |
| Accounts that require MFA cannot finish sign-in | `AUTH_MFA_ENCRYPTION_KEY` is missing. For local administrator testing without an authenticator, see `AUTH_ADMIN_MFA_REQUIRED` in §4. |
| The backend refuses to start: `"AUTH_ADMIN_MFA_REQUIRED" may be false only when …` | The local MFA exception is only for `NODE_ENV=development` on a loopback `HTTP_HOST` with `TRUST_PROXY_HOPS=0`. Fix those values or set it back to `true`. |
| `npm run check` in `server/` fails at Prettier although you changed nothing | Your checkout has CRLF copies of LF files (`git ls-files --eol` shows `i/lf w/crlf`). Follow [Line endings (Windows)](#line-endings-windows) to refresh them. |
| The app still shows the former product name | Your `client/.env.local` sets `VITE_APP_NAME`; change it to `Zamil Digitalization` or remove the line, then restart Vite. |
| Password setup/reset or MFA recovery returns `DELIVERY_UNAVAILABLE` | Expected while `SMTP_ENABLED=false`. |
| Security Administration pages show "access denied" asking for authenticator verification | Those pages require an MFA-verified session; sign in with your authenticator. |
| The dashboard shows "Development preview — not authenticated" | `VITE_AUTH_DEV_PREVIEW=true` in `client/.env.local`; set it to `false` and restart Vite. |

## 9. Next steps

Read the [feature delivery workflow](FEATURE-DELIVERY-WORKFLOW.md) and
[security essentials](SECURITY-ESSENTIALS.md), then the frontend or backend guides for your work.
