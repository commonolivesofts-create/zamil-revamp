# Workflow Manager — User Guide Index

**This index is the single navigation entry for screen-by-screen Workflow Manager help.**

- [Read the guided Workflow Setup overview](WORKFLOW-SETUP-USER-GUIDE.md) — concept overview, not a substitute for detailed screen guides.
- [Required screen/feature guide matrix](SCREEN-GUIDE-MATRIX.md) — 37 identified feature guides, with implementation package and audience. Mark a guide `Verified/Live` only when the actual UI/API are tested.
- [Form-specific onboarding guides and verified forms](forms/README.md) — one guide for **each onboarded form**, not generic placeholders.
- [Development roadmap](DEVELOPMENT-ROADMAP.md) — M1–M7 and E1–E7 work packages.

**Current status:** Package **M1** (module foundation, Form registry, Data source registry) is merged (PR #56); its `WORKFLOW_MANAGER` catalogue was registered on TEST and the owner-executed functional acceptance passed on 7 November 2026 (see `CURRENT-HANDOFF.md`; the guide status lines below still need their live-verification update). Package **M2-0** (PR #74) is a backend library without screens. Package **M2-A** adds guide 05 (data source fields); `WORKFLOW_MANAGER.SOURCE_MAPPING` is registered on TEST and granted to `SUPER_ADMINISTRATOR` (G1 complete), owner TEST acceptance pending. The **Smart Mapping UX** package (branch `feat/workflow-manager-smart-mapping-ux`) redesigns screens 01–05 business-first (form readiness, guided three-step data setup, plain-language results, technical details on request) and adds the backend `zrv.wf.form/2` relationship-graph foundation (no new screen); guides 01–05 describe the redesigned screens, verified by automated tests, live check pending. All other screens (06–37) are **planned — not yet live**. Every feature PR must add its screen guide and update this index. Operators should use only verified instructions for enabled features.

## Implemented screen guides

| ID | Screen / feature | Guide | Status |
|---|---|---|---|
| 01 | Workflow Manager entry and navigation | [01-workflow-manager-navigation.md](user-guides/01-workflow-manager-navigation.md) | Implemented (M1, accepted on TEST); business-first Overview with form readiness (Smart Mapping UX) — tests verified, live check pending |
| 02 | Form registry list and lookup | [02-form-registry.md](user-guides/02-form-registry.md) | Implemented (M1, accepted on TEST); readiness column (Smart Mapping UX) — tests verified, live check pending |
| 03 | Register/edit form and organization scope | [03-form-registration.md](user-guides/03-form-registration.md) | Implemented (M1, accepted on TEST); readiness panel, technical identity for administrators (Smart Mapping UX) — tests verified, live check pending |
| 04 | Data source registry | [04-data-source-registry.md](user-guides/04-data-source-registry.md) | Implemented (M1, accepted on TEST); approved-fields column (Smart Mapping UX) — tests verified, live check pending |
| 05 | Data source fields — guided setup (versions and approved allowlist) | [05-data-source-version.md](user-guides/05-data-source-version.md) | Implemented (M2-A) with the guided setup (Smart Mapping UX) — tests verified; `SOURCE_MAPPING` registered and granted on TEST; owner TEST acceptance pending |