// Approved initial security catalogue (Phase 01 administrator catalogue decisions, docs/07 §10B).
// This is the security-administration catalogue only, not the future business-permission
// catalogue. Codes satisfy the locked CHECK constraints (^[A-Z][A-Z0-9_]*$, trimmed) and lengths:
// MODULE_CODE 60, RESOURCE_CODE 80, ACTION_CODE 40, ROLE_CODE 60.

export const SECURITY_MODULE = Object.freeze({
  code: 'SECURITY_ADMINISTRATION',
  name: 'Security Administration',
  description: 'User accounts, roles, permissions, recovery and security audit administration.',
  displayOrder: 0,
});

export const SECURITY_RESOURCES = Object.freeze([
  {
    code: 'USER_ACCOUNTS',
    name: 'User Accounts',
    actions: ['VIEW', 'CREATE', 'ACTIVATE', 'DISABLE', 'REVOKE_SESSIONS'],
  },
  { code: 'ROLES', name: 'Roles', actions: ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE'] },
  { code: 'PERMISSION_CATALOG', name: 'Permission Catalog', actions: ['VIEW', 'MANAGE'] },
  { code: 'ROLE_PERMISSIONS', name: 'Role Permissions', actions: ['VIEW', 'GRANT', 'REVOKE'] },
  { code: 'USER_ROLES', name: 'User Roles', actions: ['VIEW', 'ASSIGN', 'REVOKE'] },
  {
    code: 'USER_PERMISSION_OVERRIDES',
    name: 'User Permission Overrides',
    actions: ['VIEW', 'GRANT', 'REVOKE'],
  },
  { code: 'ACCOUNT_RECOVERY', name: 'Account Recovery', actions: ['ISSUE'] },
  { code: 'SECURITY_AUDIT', name: 'Security Audit', actions: ['VIEW', 'EXPORT'] },
]);

export const ADMINISTRATOR_ROLES = Object.freeze({
  SUPER_ADMINISTRATOR: 'SUPER_ADMINISTRATOR',
  MAIN_ADMINISTRATOR: 'MAIN_ADMINISTRATOR',
  ADMINISTRATOR: 'ADMINISTRATOR',
});

export const ADMINISTRATOR_ROLE_DEFINITIONS = Object.freeze([
  {
    code: ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR,
    name: 'Super Administrator',
    description: 'Highest security administrator. Reserved exclusively for Zaid (employee 2172).',
  },
  {
    code: ADMINISTRATOR_ROLES.MAIN_ADMINISTRATOR,
    name: 'Main Administrator',
    description: 'Main security administrator, assigned by the Super Administrator.',
  },
  {
    code: ADMINISTRATOR_ROLES.ADMINISTRATOR,
    name: 'Administrator',
    description: 'Security administrator, assigned by the Super Administrator.',
  },
]);

// Zaid: owner-approved immutable identity of the only Super Administrator (docs/07 §5, §10A).
export const SUPER_ADMINISTRATOR_EMPLOYEE_NUMBER = '2172';
