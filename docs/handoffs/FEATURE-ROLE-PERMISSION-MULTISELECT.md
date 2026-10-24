# Feature handoff — Role-permission multi-select and sidebar access verification (Phase 2C)

## 1. Summary

| Item | Value |
|---|---|
| Feature | Grant several existing permissions to a role with one confirmation (sequential, existing API); verification of the sidebar access chain after grants |
| Release | Zamil Digitalization V 2.1.0 |
| Status | Implemented; automated tests, lint and build pass. No live grants, no Oracle access, no browser driven |
| Approval | Owner-authorized Phase 2C source implementation; no G1/G2/G3 change was needed |

## 2. Source control

| Item | Value |
|---|---|
| Branch | `feat/role-permission-multiselect` (from `main` at `11fa6b8`) |
| Commit | `feat(rbac): grant multiple permissions to a role with per-permission results` |
| Pull Request | Owner reviews and merges |

## 3. Acceptance criteria

| # | Criterion | Verified | Evidence |
|---|---|---|---|
| 1 | Search by module, resource, permission code or description; checkbox multi-select; selection kept across searches; count shown | Yes | `client/tests/roleGrants.test.mjs` |
| 2 | Active grants shown and unselectable; revoked grants selectable (reactivation); inactive chains never offered; existing permission IDs only | Yes | same |
| 3 | One confirmation; existing `PUT /roles/{roleId}/permissions/{permissionId}` sent sequentially; no bulk endpoint; no duplicate IDs | Yes | same (real API client, recorded requests) |
| 4 | GRANTED / ALREADY_GRANTED / FAILED / UNKNOWN_OUTCOME / NOT_SUBMITTED; stop on the first failure or unknown outcome; no retries; partial success never reported as complete | Yes | same |
| 5 | Dialog cannot close while pending; double submission ignored; results shown after it closes; grant list and own effective permissions refreshed | Yes | same + `productionReadiness.test.mjs` |
| 6 | Catalogue (2,000 rows) or grant list (1,000 rows) possibly truncated → granting refused | Yes | same |
| 7 | Dialogs bound to the role they were opened for; unavailable or inactive role cannot receive grants; fresh grants required | Yes | same |
| 8 | Sidebar: allowed/denied, `alsoRequires`, MFA, DENY/inactive (absent from effective permissions), refresh, direct URL = sidebar = palette, no navigation created by permissions | Yes | `client/tests/sidebarAccess.test.mjs` |
| 9 | Backend escalation, protected roles, inactive role/permission, DENY precedence unchanged | Yes (existing suites) | `server/tests/rbac-authorization.test.js`, `security-hardening.test.js` |

## 4. Files

| New / Modified | Path | Purpose |
|---|---|---|
| New | `client/src/features/security-administration/roleGrants.js` | Options, selection, completeness checks, sequential grants, result summary |
| New | `client/src/features/security-administration/components/PermissionMultiPicker.jsx` | Searchable checkbox list of grantable permissions |
| New | `client/src/features/security-administration/components/RoleGrantDialog.jsx` | Loads fresh data, submits once through `useAdminAction`, refreshes access |
| Modified | `client/src/features/security-administration/pages/RolePermissionsPage.jsx` | Uses the dialog; dialogs bound to their role; grant requires a loaded, active role |
| New | `client/tests/roleGrants.test.mjs`, `client/tests/sidebarAccess.test.mjs` | 9 + 7 tests |
| Modified | `client/tests/productionReadiness.test.mjs` | Grant refresh now asserted in `RoleGrantDialog.jsx` |
| New | `docs/ADMIN-GUIDE-ROLE-PERMISSIONS.md` (+ `docs/README.md` index) | Administrator workflow and sidebar troubleshooting |

`PermissionPicker.jsx` (single select) is unchanged and still used by `UserOverridesPage.jsx`.

## 5. Decisions

- **Stop rule:** every explicit refusal stops the sequence (not only authorization, session and
  server failures). A refusal usually applies to the remaining grants too (role protection,
  escalation, inactive role); stopping keeps the outcome simple and never sends more after a problem.
- **Revoke dialog binding:** the revoke dialog now also uses the role it was opened for. Previously,
  browser navigation to another role while the confirmation was open would have revoked the same
  permission ID from the newly selected role.
- **Access refresh:** after any confirmed grant, any unknown outcome, or a `FORBIDDEN` refusal, the
  administrator's own effective permissions are reloaded.

## 6–7. API and Oracle

No API, OpenAPI, backend, schema or data change. Grants go through the existing audited endpoint,
one transaction each.

## 8. Sidebar finding (reported problem)

The decision chain is correct: `GET /access-control/me/permissions` returns only effective
permissions (DENY wins; inactive role, grant, assignment or catalogue chain excluded), and the
sidebar, command palette, dashboard and route guard all use `routeAccess()` /
`authorizedNavigation()`. No code fix was needed. Likely causes of the report, now documented in the
administrator guide: the affected user's open session had not reloaded its permissions (they load at
sign-in); a missing `alsoRequires` permission (`USER_ACCOUNTS:VIEW`, `ROLES:VIEW`); no MFA-verified
session; or a permission for a module without an implemented page (permissions never create pages).

Observation (not changed, shared contract, gate G3): `permissionStore.reload()` ignores a reload
request while a load is in flight. Two changes in quick succession could leave the administrator's
own permissions one change behind until the next refresh. The multi-grant flow reloads once at the
end, so it is not affected.

## 10. Test evidence

See the PR report for executed commands and counts.

## 12. Known limitations

- Not exercised against Oracle TEST or in a browser.
- Other users' sessions see grant changes only after a reload or new sign-in (by design).
- Grants are not atomic; partial results are reported per permission.
