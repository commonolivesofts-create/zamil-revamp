# Form and UX quality standard

For all new Zamil Digitalization business screens, and for **named existing forms only after owner approval**. Preserve existing theme, security and workflows.

## Before implementation

Record the business purpose, target users, CI3/current behavior, agreed fields and validations, a screenshot or wireframe, desktop/mobile needs, exact API contract and permission rules. Avoid undocumented fields or redesigning unrelated forms.

## Acceptance checklist

1. Clear title, grouped inputs, readable labels, hints, units, required indicators and one obvious primary action.
2. Accessible labels, inline errors, keyboard navigation and focus management; announce loading, errors and results.
3. Consistent theme tokens, spacing, icons, light/dark mode and responsive layouts; avoid hard-coded styles and new UI frameworks.
4. Preserve non-secret unsaved input on error; prevent duplicate writes and never retry uncertain POST/PUT/DELETE automatically.
5. Show empty, loading, permission-denied, validation, timeout, partial-success and unknown-outcome states. Use meaningful confirmation for destructive actions.
6. Keep data tables paginated with readable headers, filters only where supported, and useful small-screen overflow.
7. Respect KSA business time, Oracle UTC event storage, quantity/UOM precision and approved currency rules.
8. Reuse existing apiClient, permission store, registry, route guards and shared UI contracts. Backend Joi/RBAC/MFA/CSRF/audit remain authoritative.
9. Measure route load, large-data table performance, Oracle/API latency and form responsiveness with representative records; optimize measured issues.
10. Run lint/test/build, real browser and mobile/keyboard checks. Capture sanitized screenshots of normal, error and completion states.

## Existing basic forms

The owner plans improvements, but has **not yet selected individual redesign targets** in this handover. Create a separate scoped PR for each approved form or small set of related forms, with before/after screenshots, unchanged business rules, accessible error states and visual approval. Shared-component redesign or new dependencies require G3 approval.

See client/docs/SHARED-COMPONENTS-AND-PATTERNS.md and docs/FEATURE-DELIVERY-WORKFLOW.md.
