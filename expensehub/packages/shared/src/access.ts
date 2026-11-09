// Implements: TRD §5 roles, PRD §2. Capabilities = what the signed-in user may do; the API
// enforces them and the web builds its menu from the same list (UI-UX §3: no role switcher).
import { ASSIGNABLE_ROLES, type AssignableRole } from './reference';

/** EMPLOYEE is implicit; LINE_MANAGER comes from the HCM hierarchy (has active reports). */
export const CAPABILITIES = ['EMPLOYEE', 'LINE_MANAGER', ...ASSIGNABLE_ROLES] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Roles that hold approval steps (OQ-01 / OQ-03 proposal: the Accountant step is one). */
export const APPROVER_ROLES = [
  'APPROVER_HR',
  'APPROVER_FIN_MGR',
  'APPROVER_CEO',
  'ACCOUNTANT',
] as const satisfies readonly AssignableRole[];

/** API §1 "Fin": Finance users see claims of their business units. */
export const FINANCE_ROLES = [
  'FINANCE_AP',
  'ACCOUNTANT',
] as const satisfies readonly AssignableRole[];

export function deriveCapabilities(
  roles: readonly { role: AssignableRole }[],
  isLineManager: boolean,
): Capability[] {
  const caps = new Set<Capability>(['EMPLOYEE']);
  if (isLineManager) caps.add('LINE_MANAGER');
  for (const { role } of roles) caps.add(role);
  return CAPABILITIES.filter((c) => caps.has(c));
}

export function isApprover(capabilities: readonly Capability[]): boolean {
  return (
    capabilities.includes('LINE_MANAGER') ||
    APPROVER_ROLES.some((role) => capabilities.includes(role))
  );
}

export function hasAnyCapability(
  capabilities: readonly Capability[],
  required: readonly Capability[],
): boolean {
  return required.some((c) => capabilities.includes(c));
}
