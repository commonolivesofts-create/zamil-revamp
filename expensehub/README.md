# ExpenseHub

Employee expense claims for Zamil Plastic Industries (IPP, FPP, APP). Oracle Fusion remains the system of record; ExpenseHub handles capture, approval and audit, then hands approved claims to Fusion Payables.

## Quick start (Windows, Node.js 24 LTS)

```
npm install
npm run dev
```

Open http://localhost:7386. API runs on http://localhost:7385. The first `npm run dev` creates `.env` from `.env.example`.

For now there is no database and no Fusion connection (D-33): `DATA_MODE=memory`, `FUSION_MODE=mock`.

For the Zamil Test (LAN) host profile, start from PowerShell with `$env:APP_ENV='test'; npm run dev`.
Open `http://<this-PC's-LAN-IP>:7386`; the API on 7385 is proxied by the web app. Set
`APP_BASE_URL` in `.env` to that LAN URL if generated reset or approval links must open from another device.

## Sign-in

When opened on the same hostname as Zamil Revamp, ExpenseHub validates the existing Zamil session
server-side and issues a bounded ExpenseHub session. Signing out revokes the Zamil session too and
redirects to the Zamil `/login` page. Local development redirects to port 7382; if production apps
use different origins, set `VITE_ZAMIL_LOGIN_URL` to the full parent login URL.
Without an active Zamil session, local password sign-in and development quick-login remain
available. By default, SSO checks Zamil at `http://127.0.0.1:7381/api/v1` in both development
and `APP_ENV=test`. Set `ZAMIL_AUTH_API_BASE_URL` if needed, and
keep `ZAMIL_AUTH_SESSION_COOKIE_NAME`, `ZAMIL_AUTH_COOKIE_SECURE` and
`ZAMIL_AUTH_COOKIE_SAMESITE` aligned with Zamil's cookie settings.

## Where to read next

- [AGENTS.md](AGENTS.md): working rules and all commands
- [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md): milestones
- [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)
