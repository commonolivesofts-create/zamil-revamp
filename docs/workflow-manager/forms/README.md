# Workflow Manager — Per-form Setup Guides

Each verified and onboarded form receives **one standalone user guide**: `forms/<verified-form-code>.md`. Create it from `../FORM-ONBOARDING-GUIDE-TEMPLATE.md`. Do not turn guessed database mappings into a user guide.

The entries below are **frontend-registry discovery candidates**, **not proof that a form is currently workflow-enabled**, nor a complete inventory of legacy PHP and backend-only forms. Names/routes are read from GitHub `main` at planning time (2026-11-02). Every candidate must be checked against the actual form backend, status values, Oracle dictionary and owner decisions.

| Candidate from active frontend registry | Existing route or resource | Workflow mapping status |
|---|---|---|
| Personnel requisition | `/hr/recruitment/requisition` | Not verified/onboarded |
| Interview assessment | `/hr/recruitment/interview` | Not verified/onboarded |
| Employment offer | `/hr/recruitment/offer` | Not verified/onboarded |
| Probation evaluation | `/hr/recruitment/probation-evaluation` | Not verified/onboarded |
| Orientation training | `/hr/recruitment/orientation` | Not verified/onboarded |
| Personal status change | `/hr/employee-services/record-change` | Not verified/onboarded |
| Transfer request | `/hr/employee-services/transfer` | Not verified/onboarded |
| Performance appraisal | `/hr/performance/appraisal` | Not verified/onboarded; its current registry module is session-only (`rbac: false`) |
| Salary certificates, EN/AR | HR resources with no navigation in examined registry | Not verified/onboarded; workflow suitability not assumed |

**M1 status (2026-11-02):** No business form has been onboarded. M1 delivers the Form registry and Data source registry ([guides 02–04](../USER-GUIDE-INDEX.md)); `XX_ZRV_WF_FORMS` and `XX_ZRV_WF_DATA_SOURCES` on TEST held **0 rows** at implementation time and no TEST data was written. Registering a form records only its identity — its keys, statuses and organization scope are verified and mapped in package M2 — so no per-form guide exists yet and none of the candidates above changes status.

Read-only reports such as periodwise employees should **not** automatically be assigned workflow setup guides. Other existing forms and CI3 flows may not yet appear in the examined frontend registry. M1/M2 shall discover and verify the complete form inventory; the owner chooses the form/event cutover, respecting G4 for legacy live workflows.

### Required checklist before a per-form guide is marked complete

- [ ] Source form exists and has an approved form owner.
- [ ] Actual Oracle objects, header/child relationships and scoped record keys verified.
- [ ] Stored status values and authorized status handler verified.
- [ ] Submission and resubmission integration verified.
- [ ] Workflow conditions and every approver level/FYI recipient documented.
- [ ] Allowed actions, comment policy, RFI role, SLA, notification templates approved.
- [ ] Portal form detail route, privacy and actor permissions tested.
- [ ] Simulation, publication and if enabled execution UAT documented.
- [ ] Guide contains screenshots only from authorized non-sensitive test data.
- [ ] Existing CI3 write ownership/cutover reviewed; no dual execution engine.