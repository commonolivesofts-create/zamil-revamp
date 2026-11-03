# Workflow Manager — User Guide Index

**This index is the single navigation entry for screen-by-screen Workflow Manager help.**

- [Read the guided Workflow Setup overview](WORKFLOW-SETUP-USER-GUIDE.md) — concept overview, not a substitute for detailed screen guides.
- [Required screen/feature guide matrix](SCREEN-GUIDE-MATRIX.md) — 37 identified feature guides, with implementation package and audience. Mark a guide `Verified/Live` only when the actual UI/API are tested.
- [Form-specific onboarding guides and verified forms](forms/README.md) — one guide for **each onboarded form**, not generic placeholders.
- [Development roadmap](DEVELOPMENT-ROADMAP.md) — M1–M7 and E1–E7 work packages.

**Current status:** Package **M1** (module foundation, Form registry, Data source registry) is implemented on branch `feat/workflow-manager-m1-foundation`. Its screens are verified by automated backend and frontend tests; they become usable on TEST once the owner approves (gate G1) and registers the `WORKFLOW_MANAGER` permission catalogue and grants it to a role. Live browser verification and screenshots follow that registration. All other screens (05–37) are **planned — not yet live**. Every feature PR must add its screen guide and update this index. Operators should use only verified instructions for enabled features.

## Implemented screen guides

| ID | Screen / feature | Guide | Status |
|---|---|---|---|
| 01 | Workflow Manager entry and navigation | [01-workflow-manager-navigation.md](user-guides/01-workflow-manager-navigation.md) | Implemented (M1) — tests verified; live check pending G1 |
| 02 | Form registry list and lookup | [02-form-registry.md](user-guides/02-form-registry.md) | Implemented (M1) — tests verified; live check pending G1 |
| 03 | Register/edit form and organization scope | [03-form-registration.md](user-guides/03-form-registration.md) | Implemented (M1) — tests verified; live check pending G1 |
| 04 | Data source registry | [04-data-source-registry.md](user-guides/04-data-source-registry.md) | Implemented (M1) — tests verified; live check pending G1 |