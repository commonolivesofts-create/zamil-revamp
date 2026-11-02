# Workflow Manager — Current Development Handoff

**As of 02 November 2026.** The original v3.0 requirements, the repository's `REQUIREMENTS-v3.1-LOCKED.md`, and `REQUIREMENTS-v3.2-LOCKED.md` jointly govern functional scope; v3.2 is the owner's final RFI/comments/FYI/portal clarification. Preserve all. Exactly two functional phases, with the M1–M7 and E1–E7 delivery packages in `DEVELOPMENT-ROADMAP.md`.

Owner-reported TEST ADW structural validation: 21 tables, 50 FKs, 48 valid explicitly named indexes, 16 enabled triggers, one-open-RFI unique index and all required constraints. Runtime smoke/integration tests are still outstanding. GitHub `main` was inspected during the planning task and had v3.1 but not yet v3.2; update via reviewed docs PR.

Current work: documentation-only branch/PR to capture locked v3.2 scope, Orvexa + ITSAZZ UI standard, screen guide matrix, per-form documentation rule, delegated Git operations and roadmap. No app source/Oracle/RBAC changes in documentation PR. Following approved merge, implement M1 as a complete backend/API + UI + tests + screen guide vertical slice after required gates. Never bundle all 14 packages into one PR.

Claude Code may perform owner-delegated routine Git operations in the existing authenticated local shell. It must respect `CONTRIBUTING.md`: short-lived branch, clean worktree, precise diffs, checked and reviewed PR, no force push/main direct writes, no deletion before verified merge, no credential sharing/change and no circumventing G1–G4. GitHub PR reviews still require authorized approval.