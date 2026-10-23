# Feature handoff — Module/resource registry and navigation refactor (Phase 2A)

## 1. Summary

| Item | Value |
|---|---|
| Feature | Developer-controlled module/resource registry; existing navigation migrated onto it; standard action vocabulary; internal/external navigation; validation; one example |
| Release | Zamil Digitalization V 2.1.0 |
| Status | Implemented; automated tests, lint and build pass; no browser driven; no backend or Oracle change |
| Approval | Owner approved the Phase 2A plan with refinements (gate G3, shared navigation architecture) |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/module-registry` (from `main` at `4f2733f`) |
| Commit | `feat(navigation): add developer-controlled module registry` |
| Pull Request | Owner creates, reviews and merges |

## 3. Requirement and acceptance criteria

| # | Criterion | Verified | Evidence |
|---|---|---|---|
| 1 | Navigation identical: 13 entries (ids, paths, labels, icons, sections, permissions, `alsoRequires`, MFA, `implemented`, `nav`, field order), 3 sections, `PERMISSIONS` | Yes | `client/tests/registry.test.mjs` (pre-registry snapshot) + all existing navigation tests unchanged |
| 2 | Registry routes ↔ React Router routes, both directions; unimplemented pages never routed | Yes | same |
| 3 | Security Administration = backend catalogue: module, 8 resources, 23 permissions; `SECURITY_ACTIONS` all registered | Yes | same (imports `server/src/modules/access-control/securityCatalog.js`) |
| 4 | Common links need authentication only; security pages keep permission, `alsoRequires`, MFA and the development MFA exception | Yes | same + `navigation`, `adminMfaPolicy` suites |
| 5 | `type` optional (default internal); only `external` is external; unknown types fail | Yes | same |
| 6 | External: https only (host or IP), no credentials; unresolved/invalid hidden; permission-filtered; new tab `noopener noreferrer`; never routed/matched | Yes | same |
| 7 | Duplicate module/resource/action/id/path/order, unknown action/group/field, unresolved `alsoRequires` fail | Yes | same |
| 8 | Exactly one example; valid; never imported or registered | Yes | same |
| 9 | Registry data is plain JavaScript usable by Node.js tooling | Yes | source check + import from `server/` verified |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| New | `client/src/config/registry/actions.js` | Standard action-code catalogue (44 codes, 13 existing) |
| New | `client/src/config/registry/navigationGroups.js` | The 3 existing sidebar sections |
| New | `client/src/config/registry/defineModule.js` | `defineModule`, `buildRegistry`, `validateExternalUrl`, `RegistryError` |
| New | `client/src/config/registry/modules/common.module.js` | Dashboard, Password, Authenticator app (session-only, `rbac: false`) |
| New | `client/src/config/registry/modules/securityAdministration.module.js` | `SECURITY_ADMINISTRATION`: 8 resources, existing pages |
| New | `client/src/config/registry/index.js` | `registeredModules` (the only registration list), `registry` |
| New | `client/src/config/registry/module-registry.example.js` | The single developer example (never imported) |
| New | `client/src/config/externalDestinations.js` | Browser resolution of external URLs (`VITE_EXTERNAL_*`) and new-tab constants |
| New | `client/src/components/navigation/ExternalNavigationLink.jsx` | External link (`target="_blank"`, `rel="noopener noreferrer"`, screen-reader hint) |
| Modified | `client/src/config/appNavigation.js` | Data derived from the registry; helpers unchanged; `navigationEntries`; palette commands for external entries |
| Modified | `client/src/components/layout/Sidebar.jsx`, `Header.jsx`, `CommandPalette.jsx`, `client/src/features/dashboard/DashboardPage.jsx` | External branch only; internal markup unchanged |
| New | `client/tests/registry.test.mjs` | 11 regression and validation tests |
| Modified | `client/docs/NEW-FEATURE-GUIDE.md`, `SHARED-COMPONENTS-AND-PATTERNS.md`, `FRONTEND-ARCHITECTURE.md`, `docs/FEATURE-DELIVERY-WORKFLOW.md` | Registration through the registry |

## 5. Implementation decisions

- **Location:** `client/src/config/registry/`, plain ESM with relative imports only (no React, Vite,
  `import.meta` or `@/`). A Node.js script under `server/` can import `registry/index.js` directly
  (verified), so Phase 2B needs no duplicated definitions. Browser-only work (environment
  resolution, links) stays outside the registry.
- **Compatibility:** `appNavigation.js` remains the interface every consumer and guard uses; its
  derived data equals the previous literal table. No parallel authorization: `routeAccess` is
  unchanged and decides internal and external entries alike.
- **Internal vs external:** `appRoutes`, `implementedRoutes` and `findAppRoute` contain internal
  routes only. External entries live only in `navigationEntries` (sidebar, header account menu,
  dashboard, palette) and are hidden when their URL does not resolve.
- **Common module** (`rbac: false`) has no permissions and must be skipped by Phase 2B registration.
- **`requiresMfa`** is explicit on every permission-guarded entry (as the existing tests require).
- **Literal external URLs** that are invalid fail validation (developer error); environment-supplied
  URLs that are missing or invalid hide the entry at runtime.
- Sign Out remains a header session action, not a registry entry.

## 6–7. API and Oracle

No API, backend or Oracle change. No permission was created, granted or modified.

## 8. Authentication and permissions

Unchanged: backend-authoritative authorization, deny by default, MFA for every
`SECURITY_ADMINISTRATION` page (with the development-only exception reported by the backend),
`alsoRequires`, hidden detail pages, unimplemented Security audit. External destinations add
visibility only; the destination system authorizes its own users.

## 10. Validation and test evidence

See the PR report for the executed commands and counts. No browser was driven; rendering of the
four navigation surfaces is covered by source checks and the unchanged existing suites.

## 12. Known limitations

- No external destination is active; external rendering is verified by unit and source tests only.
- `securityActions.js` still lists action keys by hand (now checked against the registry).
- Adding a real external destination requires a security review (gate G2).

## 13. Follow-up (Phase 2B, not in this branch)

Oracle registration script reading `registry/index.js` (skipping `rbac: false` modules); Permission
Catalog multi-select UI.
