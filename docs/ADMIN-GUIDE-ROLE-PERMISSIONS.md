# Administrator guide — role permissions and sidebar access

For Security Administration users of Zamil Digitalization who grant permissions to roles, and for
anyone checking why a page does not appear in the sidebar.

## Granting several permissions to a role

Requires the effective permissions `ROLE_PERMISSIONS:GRANT` and `PERMISSION_CATALOG:VIEW`, and an
MFA-verified session.

1. Open **Security administration → Role permissions** and select the role in the list. The role
   must be active; an inactive role, or a role opened by link that is not in the list, cannot
   receive permissions.
2. Select **Grant permissions**. The dialog loads the current catalogue and the role's grants.
3. Search by module, resource, permission code (for example `SECURITY_ADMINISTRATION.ROLES:VIEW`)
   or description, and tick every permission you want. Your selection is kept when you change the
   search; the counter shows how many are selected.
   - **Already granted** permissions are ticked and cannot be selected again.
   - **Previously revoked** permissions can be selected: granting reactivates them.
   - Permissions whose module, resource or action is inactive are not offered.
4. Select **Grant N permissions** once. The dialog stays open (and cannot be closed) until every
   request has finished.

### Reading the result

The permissions are granted **one at a time**. Each grant is checked and audited separately by the
server, so the request is not all-or-nothing:

| Result | Meaning |
|---|---|
| granted | The role now holds the permission (new or reactivated) |
| already granted; nothing changed | The role already held it |
| not granted: … | The server refused it (for example only the Super Administrator may grant security permissions, a protected role, an inactive permission, or your own permissions changed). The processing stopped here |
| outcome unknown | No reliable answer (network, timeout or server error). It may or may not have been granted: check the refreshed list before trying again |
| not submitted | Not sent, because an earlier permission failed or had an unknown outcome |

Grants that completed stay in effect even when a later one fails. Nothing is retried automatically.
If the catalogue or the role's grant list is too large to be shown completely, granting is refused
rather than risk duplicates; contact the development team.

## "I granted a permission but the page does not appear in the sidebar"

The sidebar, the command palette, the dashboard and direct links all use the same decision. A page
appears only when **all** of the following are true:

| Check | What to look for |
|---|---|
| The page exists | Permissions never create pages. Only implemented pages are listed: User accounts, Roles, User roles, Role permissions, Permission catalog and Permission overrides (plus Dashboard, Password and Authenticator app for everyone). Granting a permission for a module that has no page (for example a future business module) shows nothing. Security audit is not available yet |
| The user holds the role | The role is assigned to the user (User roles), and the assignment is active and not expired |
| The role and grant are active | The role is active and the grant is not revoked |
| The catalogue chain is active | Module, resource and action are all active (Permission catalog) |
| No DENY override | A DENY override for the user always wins over role grants (Permission overrides) |
| All required permissions | Some pages need two: **User roles** and **Permission overrides** also need `USER_ACCOUNTS:VIEW`; **Role permissions** also needs `ROLES:VIEW` |
| MFA-verified session | Security administration pages require signing in with the authenticator |
| The session has refreshed | Each session loads its permissions at sign-in. Your own permissions refresh automatically after you change grants; **another user must reload the page (F5) or sign in again** to see the change |

## Related

- Developer details: [`docs/handoffs/FEATURE-ROLE-PERMISSION-MULTISELECT.md`](handoffs/FEATURE-ROLE-PERMISSION-MULTISELECT.md)
- Security rules: [Security essentials](SECURITY-ESSENTIALS.md)
