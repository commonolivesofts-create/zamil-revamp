# Zamil Digitalization — Git & GitHub Contribution Guidelines

**Status:** Approved

**Applies to:** All Zamil Digitalization developers

**Repository:** [commonolivesofts-create/zamil-revamp](https://github.com/commonolivesofts-create/zamil-revamp)

**Default branch:** `main`

---

## 1. Purpose

This document defines the approved Git and GitHub development workflow for the Zamil Digitalization enterprise application.

All developers working on frontend, backend, documentation, database integration, or maintenance tasks must follow these guidelines.

The primary objectives are to maintain production stability, protect sensitive information, support collaboration, and ensure that only reviewed and verified changes reach production.

## 2. Repository Architecture

Zamil Digitalization uses a single Git repository (monorepo).

| Directory | Responsibility |
|---|---|
| `client/` | React.js / Vite frontend |
| `server/` | Node.js / Express backend |
| `server/docs/` | Approved backend architecture documentation and backend developer guides |
| `client/docs/` | Frontend developer guides |
| `docs/` | Team-wide developer guides: onboarding, feature delivery, security, handoffs |
| `secrets/` | Local Oracle ADW wallets and sensitive credentials; never committed |
| `.gitignore` | Git exclusion rules |
| `CONTRIBUTING.md` | Repository-wide developer contribution guidelines |

Frontend and backend development happen in the same repository, but they may be built, tested, and deployed independently.

Do not create separate frontend or backend Git repositories without architecture approval.

## 3. Repository Access and Git Identity

- The repository is **public** on GitHub: everything committed, including history, can be read by anyone. Never commit credentials, wallets, `.env` files, employee data or production records (see §7 and [`docs/SECURITY-ESSENTIALS.md`](docs/SECURITY-ESSENTIALS.md)).
- Developers must have authorized GitHub access before contributing.
- Each developer should use their own authorized GitHub identity and SSH key or other approved authentication method.
- Never share SSH private keys, access tokens, passwords, or credentials.
- Do not copy another developer's local SSH configuration.
- Do not change machine-wide or global Git configuration unnecessarily.
- Use the approved repository remote and project-specific Git configuration.

All Git commands must be executed from the local `zamil-revamp` project root, regardless of where each developer has cloned the repository.

## 4. Git Branching Strategy

### 4.1 Production Branch

`main` is the official production branch.

Rules:

- Always keep `main` stable and production-ready.
- Never develop directly on `main`.
- Never commit or push feature, fix, or documentation changes directly to `main`.
- All changes must reach `main` through an approved Pull Request.
- Do not force-push or rewrite `main` history.
- Production deployments must use an approved state of `main`.

### 4.2 Working Branches

Create a dedicated short-lived branch for each logical development task.

| Change type | Branch prefix | Example |
|---|---|---|
| New functionality | `feat/` | `feat/user-management` |
| Bug fix | `fix/` | `fix/login-validation` |
| Urgent production correction | `hotfix/` | `hotfix/session-expiry` |
| Documentation | `docs/` | `docs/rbac-architecture` |
| Refactoring | `refactor/` | `refactor/auth-service` |
| Maintenance | `chore/` | `chore/eslint-config` |
| Test improvements | `test/` | `test/auth-integration` |

Branch names should be lowercase, descriptive, and hyphen-separated.

Do not create a new branch for every minor edit within the same logical task.

Each new working branch must start from an updated `main` branch.

## 5. Standard Development Workflow

All developers must follow this sequence:

1. Navigate to the project root.
2. Check the current working tree using `git status -sb`.
3. Ensure there are no uncommitted changes before changing branches.
4. Switch to `main` using `git switch main`.
5. Update the local production branch using `git pull --ff-only origin main`.
6. Create a new task branch using `git switch -c <branch-name>`.
7. Implement the assigned changes only within the approved scope.
8. Run the relevant validation, linting, and tests.
9. Review modified files using `git status` and `git diff`.
10. Stage only the intended files using `git add <specific-files>`.
11. Review staged changes using `git diff --cached`, `git diff --cached --check`, and `git diff --cached --stat`.
12. Commit verified work using a meaningful conventional commit message.
13. Push the working branch after authorization.
14. Open a Pull Request targeting `main`.
15. Obtain required review and approval.
16. Merge the Pull Request only after verification.
17. Confirm the change exists on `main`.
18. Delete the completed working branch when no longer needed.

Do not merge untested or unapproved changes into `main`.

## 6. Commit Message Standards

Use conventional commit messages.

Format: `type: short meaningful description`

Examples:

- `feat: implement role-based access control`
- `fix: correct user session validation`
- `docs: update Oracle database guidelines`
- `refactor: simplify work order service`
- `test: add authentication integration tests`
- `chore: update development tooling`

Commit messages must clearly describe the completed logical change.

Do not automatically create a commit after every small edit. Commit when the work is reviewed and reaches a meaningful, verified checkpoint.

## 7. Security and Sensitive Files

The following must never be committed:

- Oracle Autonomous Database wallet files and the entire `secrets/` directory.
- Real `.env` files, including `.env.local` and environment-specific secrets.
- Database passwords and connection credentials.
- GitHub tokens, API keys, SSH private keys, and certificates containing private keys.
- `node_modules/`.
- Generated build files, caches, coverage results, and logs.
- Sensitive production data or exported database records.

Safe `.env.example` files may be committed only when they contain placeholders and no actual secrets.

Always respect the existing root and project-specific `.gitignore` files.

Never use `git add -f` to bypass security exclusions.

Never assume an ignored file is safe if it has already been tracked by Git.

Before every commit, verify the staged file list and inspect the staged diff.

If a secret is accidentally committed or exposed, stop the push or deployment process and immediately report the incident. Repository history cleanup and credential rotation must be handled through the approved security process.

## 8. Code Quality and Architecture

All contributions must follow the six approved architecture documents located in `server/docs/`:

1. `01-SYSTEM_ARCHITECTURE.md`
2. `02-API_DEVELOPMENT_STANDARDS.md`
3. `03-ORACLE_DATABASE_ARCHITECTURE.md`
4. `04-AUTHENTICATION_RBAC_SECURITY.md`
5. `05-CONFIGURATION_OPERATIONS.md`
6. `06-ARCHITECTURE_DECISIONS_GUIDELINES.md`

The developer guides in [`docs/`](docs/README.md), [`client/docs/`](client/docs/README.md) and [`server/docs/README.md`](server/docs/README.md) explain how these standards are implemented and how to deliver a feature; they do not change the approved documents.

Additional requirements:

- Preserve existing business functionality and Oracle schema compatibility unless changes are approved.
- Follow the approved React, Node.js, Express, Oracle, and security architecture.
- Reuse existing shared components and established patterns.
- Avoid unnecessary abstractions and overengineering.
- Verify that frontend changes do not unintentionally break backend integrations, and vice versa.
- Use relevant automated tests and manual verification as appropriate.

## 9. Pull Request Standards

Every Pull Request must target `main` and include:

- A clear title describing the change.
- The purpose and scope of the work.
- A summary of files, modules, or functionality affected.
- Validation and testing performed.
- Any database, configuration, compatibility, or deployment impact.
- Screenshots for relevant user-interface changes, where useful.
- Any known limitations or follow-up work.

Before merging:

- Confirm the Pull Request targets the correct branch.
- Review the complete file diff.
- Confirm that no secrets or unrelated files are included.
- Ensure relevant tests and checks pass.
- Obtain the required project approval.
- Resolve blocking review comments.

Prefer **Squash and merge** for a Pull Request representing one logical change, subject to project approval and repository settings.

Never bypass the approved review process, including for urgent hotfixes.

## 10. Branch Cleanup

After a Pull Request is successfully merged:

1. Confirm the Pull Request shows **Merged** on GitHub.
2. Update the local `main` branch.
3. Confirm the expected changes are present.
4. Delete the merged remote working branch.
5. Delete the local working branch.
6. Verify repository status.

Do not delete branches that contain unmerged or still-required changes.

Squash merges may require manual local branch deletion after confirming that the work has been incorporated into `main`.

## 11. Incremental Releases and Deployment

Zamil Digitalization will release its 300+ business forms and reports incrementally according to approved priorities.

- Keep `main` production-ready.
- Integrate tested changes through reviewed Pull Requests.
- Maintain backward compatibility wherever practical.
- Evaluate frontend and backend deployment impacts separately.
- Document database changes and any required deployment steps.
- Ensure that urgent production fixes also follow the branch and Pull Request process.

Frontend and backend will eventually have independent CI/CD workflows within the same repository.

**CI/CD and Docker deployment configuration are deferred to their approved implementation phases.**

Until then, no developer should introduce or modify deployment automation without authorization.

## 12. Developer Responsibilities

Every contributor is responsible for:

- Working on an appropriately named branch.
- Protecting repository credentials and company information.
- Following the approved architecture and coding standards.
- Keeping changes limited to the intended scope.
- Testing changes before proposing a merge.
- Reviewing staged files before committing.
- Requesting approval before remote-changing operations when required by project policy.
- Keeping `main` stable.
- Deleting obsolete branches only after successful merge verification.
- Communicating changes that affect shared APIs, database behavior, security, or deployment.

## 13. Policy Changes

Changes to this document require an approved documentation branch and Pull Request.

The branching, repository, security, and deployment policies must not be changed unilaterally.

---

**Zamil Digitalization — Approved Git & GitHub Development Policy**

**Golden Rule:** Develop on a dedicated branch, verify your work, review through a Pull Request, merge approved changes into `main`, and keep secrets out of Git.