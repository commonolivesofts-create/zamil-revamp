// Action permissions of the security-administration catalogue (backend
// securityCatalog.js). Buttons are shown only for the matching effective
// permission; the backend still authorizes, and enforces the administrator
// hierarchy on, every request.
const key = (resource, action) => `SECURITY_ADMINISTRATION.${resource}:${action}`

export const SECURITY_ACTIONS = Object.freeze({
  USER_ACCOUNTS_VIEW: key('USER_ACCOUNTS', 'VIEW'),
  USER_ACCOUNTS_CREATE: key('USER_ACCOUNTS', 'CREATE'),
  USER_ACCOUNTS_ACTIVATE: key('USER_ACCOUNTS', 'ACTIVATE'),
  USER_ACCOUNTS_DISABLE: key('USER_ACCOUNTS', 'DISABLE'),
  USER_ACCOUNTS_REVOKE_SESSIONS: key('USER_ACCOUNTS', 'REVOKE_SESSIONS'),
  ROLES_VIEW: key('ROLES', 'VIEW'),
  ROLES_CREATE: key('ROLES', 'CREATE'),
  ROLES_UPDATE: key('ROLES', 'UPDATE'),
  ROLES_DEACTIVATE: key('ROLES', 'DEACTIVATE'),
  PERMISSION_CATALOG_VIEW: key('PERMISSION_CATALOG', 'VIEW'),
  PERMISSION_CATALOG_MANAGE: key('PERMISSION_CATALOG', 'MANAGE'),
  ROLE_PERMISSIONS_VIEW: key('ROLE_PERMISSIONS', 'VIEW'),
  ROLE_PERMISSIONS_GRANT: key('ROLE_PERMISSIONS', 'GRANT'),
  ROLE_PERMISSIONS_REVOKE: key('ROLE_PERMISSIONS', 'REVOKE'),
  USER_ROLES_VIEW: key('USER_ROLES', 'VIEW'),
  USER_ROLES_ASSIGN: key('USER_ROLES', 'ASSIGN'),
  USER_ROLES_REVOKE: key('USER_ROLES', 'REVOKE'),
  USER_PERMISSION_OVERRIDES_VIEW: key('USER_PERMISSION_OVERRIDES', 'VIEW'),
  USER_PERMISSION_OVERRIDES_GRANT: key('USER_PERMISSION_OVERRIDES', 'GRANT'),
  USER_PERMISSION_OVERRIDES_REVOKE: key('USER_PERMISSION_OVERRIDES', 'REVOKE'),
  ACCOUNT_RECOVERY_ISSUE: key('ACCOUNT_RECOVERY', 'ISSUE'),
})

// The catalogue module whose entries the backend never lets anyone activate
// or deactivate (PROTECTED_CATALOG), so no such toggle is offered for it.
export const SECURITY_MODULE_CODE = 'SECURITY_ADMINISTRATION'
