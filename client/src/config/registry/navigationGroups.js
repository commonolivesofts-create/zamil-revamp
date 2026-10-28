// Navigation groups (sidebar sections), in display order. Frontend metadata
// only: groups are not RBAC data and are never registered in Oracle.
// `standalone`: each entry is a top-level link instead of a collapsible group.
export const NAVIGATION_GROUPS = Object.freeze([
  Object.freeze({ id: 'workspace', label: 'Workspace', icon: 'layout-dashboard', standalone: true }),
  Object.freeze({ id: 'human-resources', label: 'Human resources', icon: 'users-round' }),
  Object.freeze({ id: 'security', label: 'Security administration', icon: 'shield-check' }),
  Object.freeze({ id: 'account', label: 'My account', icon: 'user-round' }),
])
