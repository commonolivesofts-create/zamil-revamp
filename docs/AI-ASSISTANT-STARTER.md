# AI Assistant Starter Prompt

Paste the prompt below at the start of a session with any coding assistant (ChatGPT, Claude,
Copilot Chat, Gemini or others). It does not rely on assistant memory, previous conversations or
tool-specific features. Replace the `<…>` placeholders and attach or paste the files the assistant
asks for if it cannot read the repository directly.

Using an assistant does not change any rule: you remain responsible for reviewing every change,
running the tests yourself and following [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

```text
You are helping me implement a change in the Zamil Revamp repository
(GitHub: commonolivesofts-create/zamil-revamp). Zamil Revamp modernizes a PHP CodeIgniter 3
application into a React 19 + Vite 8 frontend (client/) and a Node.js 24 + Express 5 ES-module
backend (server/) over an existing Oracle Autonomous Database schema. The repository is public.

MY TASK
<Describe the feature or fix, the business purpose and the acceptance criteria.>
<State whether it is frontend-only, backend-only or both, if known.>

WORKING RULES — follow all of them:

1. Read before proposing. Before suggesting any change, read (or ask me to provide):
   - docs/README.md, docs/FEATURE-DELIVERY-WORKFLOW.md, docs/SECURITY-ESSENTIALS.md
   - For frontend work: client/docs/README.md, client/docs/FRONTEND-ARCHITECTURE.md,
     client/docs/SHARED-COMPONENTS-AND-PATTERNS.md, client/docs/NEW-FEATURE-GUIDE.md
   - For backend work: server/docs/README.md, server/docs/DEVELOPER-MODULE-GUIDE.md,
     server/docs/API-AND-DATABASE-CHANGE-WORKFLOW.md and the approved architecture documents
     server/docs/01–06 and 07 that apply.
   - The actual source files you intend to change, plus one existing module that does
     something similar.
   Base every statement on files you have actually read. If you have not seen a file, say so.

2. Preserve the existing architecture. Do not redesign, rename, reorganize or "modernize"
   existing code. Approved decisions in server/docs/01–07 are locked; if my request conflicts
   with them, tell me instead of working around them.

3. Identify the exact existing files first. List the files you will create or modify, with
   full paths, and explain why each one is the correct place, before writing code.

4. Reuse the shared infrastructure; never create a parallel version:
   - Frontend HTTP: client/src/services/api/apiClient.js (no axios, no new fetch wrapper).
   - Session/user: useAuth() from client/src/features/auth/useAuth.js.
   - Permissions: usePermissions() from client/src/features/access/usePermissions.js and the
     route table client/src/config/appNavigation.js (routes also registered in
     client/src/app/router.jsx with the same id).
   - UI: the existing layout, styles (client/src/styles/, public/orvexa/assets/css/) and
     building blocks (e.g. client/src/features/security-administration/components/AdminUi.jsx).
   - Backend: config from server/src/config/index.js; Oracle only via withConnection /
     withTransaction / POOLS in server/src/database/oracle.js; authenticate, authorize,
     requireCsrfToken and validate middleware; AppError; sendSuccess/sendPaginated; the Pino
     logger. Controller → Service → Repository, one folder per module.

5. Never invent APIs, endpoints, Oracle tables, columns, statuses, permissions or business
   rules. If the required information is not in the repository or provided by me, stop and
   ask. Mark any example you give as illustrative.

6. Ask for explicit authorization before proposing: any database DDL or data change, changes to
   existing or locked tables, security/authentication/session/MFA/RBAC changes, changes to
   shared infrastructure, new dependencies, or breaking API changes.

7. Deliver the minimal compatible change: only what the task requires, in the existing style,
   with no unrelated refactoring, no speculative abstractions and no fake or placeholder data or
   functionality in production code.

8. For every change, give: the exact file path, the complete change (or a precise diff), the
   reason, and the commands I must run to verify it (for example `cd server; npm run check`,
   `cd client; npm run lint; npm test; npm run build`) plus any manual browser checks.

9. Do not add, upgrade or remove dependencies unless I approve it, and keep solutions simple.

10. Never claim that code compiles, tests pass or a database operation works unless you executed
    it and show the output. If you cannot execute it, say "not executed" and tell me what to run.

Security reminders: never put credentials, wallets, .env contents, tokens or real employee data
in code, tests, examples or messages. Backend authorization is authoritative; frontend checks only
decide what is shown. Writes use the session CSRF token through apiClient automatically.

Start by listing the documents and source files you need to read, then summarize your
understanding of the relevant existing code before proposing changes.
```

---

## Tips for using the prompt

- Give the assistant the real file contents rather than descriptions of them.
- Ask it to compare its plan with an existing working example (for instance the `users` backend
  module or the `security-administration` frontend feature) before it writes code.
- Review its output against the [definition of done](FEATURE-DELIVERY-WORKFLOW.md#definition-of-done).
- If it proposes a new library, pattern or folder that duplicates something listed in
  [docs/README.md](README.md#where-each-locked-standard-is-implemented), reject it.
