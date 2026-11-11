// Navigation groups (sidebar sections), in display order. Frontend metadata
// only: groups are not RBAC data and are never registered in Oracle.
// `standalone`: each entry is a top-level link instead of a collapsible group.
// `subgroups`: optional, in display order. An entry with `subgroup` is listed
// in that sub-group's flyout instead of directly in the section; ids are unique
// across all groups.
const subgroup = (id, label, icon, description) => Object.freeze({ id, label, icon, description })

export const NAVIGATION_GROUPS = Object.freeze([
  Object.freeze({ id: 'workspace', label: 'Workspace', icon: 'layout-dashboard', standalone: true }),
  Object.freeze({
    id: 'human-resources', label: 'Human resources', icon: 'users-round',
    subgroups: Object.freeze([
      subgroup('hr-recruitment', 'Recruitment', 'user-plus', 'From requisition to probation'),
      subgroup('hr-employee-services', 'Talent Management', 'layers', 'Changes, leave and recognition'),
      subgroup('hr-employee-services-canonical', 'Employee Services', 'layers', 'Personal status change, sick leave, share an idea'),
      subgroup('hr-letters', 'Letters', 'mail', 'Salary certificates and letters'),
      subgroup('hr-reports', 'Reports', 'chart-column', 'HR reports'),
    ]),
  }),
  Object.freeze({ id: 'finance', label: 'Finance', icon: 'wallet-cards' }),
  Object.freeze({ id: 'workflow-manager', label: 'Workflow Manager', icon: 'workflow' }),
  Object.freeze({
    id: 'security', label: 'Security administration', icon: 'shield-check',
    subgroups: Object.freeze([
      subgroup('security-admin', 'Security administration', 'shield-check', 'Accounts, roles and permissions'),
    ]),
  }),
  Object.freeze({
    id: 'account', label: 'My account', icon: 'user-round',
    subgroups: Object.freeze([
      subgroup('account-settings', 'My account', 'user-round', 'Password and authentication'),
    ]),
  }),
])
