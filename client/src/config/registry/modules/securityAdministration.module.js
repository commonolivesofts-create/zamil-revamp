// Security Administration: the existing security catalogue. Module, resource
// and action codes are identical to the backend catalogue
// (server/src/modules/access-control/securityCatalog.js); a test keeps them equal.
// Every page requires an MFA-verified session (the backend requires one for
// every SECURITY_ADMINISTRATION permission), except under the backend's
// local-development exception, which routeAccess() honours.
// `hidden: true`: a detail page reached from its list page (path parameter).
// `implemented: false`: approved but not built (no audit retrieval API yet);
// never routed, listed or searchable.
import { defineModule } from '../defineModule.js'

const page = (entry) => ({ group: 'security', requiresMfa: true, ...entry })

export default defineModule({
  code: 'SECURITY_ADMINISTRATION',
  name: 'Security Administration',
  description: 'User accounts, roles, permissions, recovery and security audit administration.',
  displayOrder: 0,
  resources: [
    {
      code: 'USER_ACCOUNTS',
      name: 'User Accounts',
      actions: ['VIEW', 'CREATE', 'ACTIVATE', 'DISABLE', 'REVOKE_SESSIONS'],
      navigation: [
        page({ id: 'user-accounts', path: '/security/users', title: 'User accounts', icon: 'users', order: 10 }),
        page({ id: 'user-account', path: '/security/users/:userId', title: 'User account', icon: 'user-round', order: 11, hidden: true }),
      ],
    },
    {
      code: 'ROLES',
      name: 'Roles',
      actions: ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE'],
      navigation: [
        page({ id: 'roles', path: '/security/roles', title: 'Roles', icon: 'user-cog', order: 20 }),
      ],
    },
    {
      code: 'PERMISSION_CATALOG',
      name: 'Permission Catalog',
      actions: ['VIEW', 'MANAGE'],
      navigation: [
        page({ id: 'permission-catalog', path: '/security/permission-catalog', title: 'Permission catalog', icon: 'list-tree', order: 50 }),
      ],
    },
    {
      code: 'ROLE_PERMISSIONS',
      name: 'Role Permissions',
      actions: ['VIEW', 'GRANT', 'REVOKE'],
      navigation: [
        // The role picker reads the role list.
        page({ id: 'role-permissions', path: '/security/role-permissions', title: 'Role permissions', icon: 'key-round', order: 40, alsoRequires: ['ROLES:VIEW'] }),
      ],
    },
    {
      code: 'USER_ROLES',
      name: 'User Roles',
      actions: ['VIEW', 'ASSIGN', 'REVOKE'],
      navigation: [
        // The account picker reads the account list.
        page({ id: 'user-roles', path: '/security/user-roles', title: 'User roles', icon: 'user-check', order: 30, alsoRequires: ['USER_ACCOUNTS:VIEW'] }),
        page({ id: 'user-role-assignments', path: '/security/user-roles/:userId', title: 'User roles', icon: 'user-check', order: 31, hidden: true }),
      ],
    },
    {
      code: 'USER_PERMISSION_OVERRIDES',
      name: 'User Permission Overrides',
      actions: ['VIEW', 'GRANT', 'REVOKE'],
      navigation: [
        page({ id: 'permission-overrides', path: '/security/permission-overrides', title: 'Permission overrides', icon: 'shield-half', order: 60, alsoRequires: ['USER_ACCOUNTS:VIEW'] }),
        page({ id: 'user-permission-overrides', path: '/security/permission-overrides/:userId', title: 'Permission overrides', icon: 'shield-half', order: 61, hidden: true }),
      ],
    },
    // Issued from the user account pages; no page of its own.
    { code: 'ACCOUNT_RECOVERY', name: 'Account Recovery', actions: ['ISSUE'] },
    {
      code: 'SECURITY_AUDIT',
      name: 'Security Audit',
      actions: ['VIEW', 'EXPORT'],
      navigation: [
        page({ id: 'security-audit', path: '/security/audit', title: 'Security audit', icon: 'file-search', order: 70, implemented: false }),
      ],
    },
  ],
})
