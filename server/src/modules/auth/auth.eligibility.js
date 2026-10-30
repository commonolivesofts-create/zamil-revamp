import { PASSWORD_POLICY, PRIVILEGE_CLASSIFICATION } from './auth.policy.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fusion employment eligibility (Phase 01 security review, Decision 01): `CURRENT_EMP_FLAG = 'Y'`
 * and `TERMINATION_DATE` either NULL or a future date in Asia/Riyadh. The date comparison is done
 * in Oracle (see TERMINATION_STATUS_SQL), which reports `NONE`, `FUTURE` or `ENDED`; a termination
 * date equal to the current KSA business date is `ENDED`. Account status is checked separately.
 * Unknown values and duplicate employee-master rows fail closed.
 */
export function evaluateEmployeeEligibility(employee) {
  if (!employee) return { eligible: false, reason: 'EMPLOYEE_NOT_FOUND' };
  if (employee.employeeRowCount !== 1) return { eligible: false, reason: 'EMPLOYEE_AMBIGUOUS' };
  if (employee.currentEmployeeFlag !== 'Y') {
    return { eligible: false, reason: 'EMPLOYEE_NOT_CURRENT' };
  }
  if (employee.terminationStatus === 'NONE' || employee.terminationStatus === 'FUTURE') {
    return { eligible: true };
  }
  return { eligible: false, reason: 'EMPLOYEE_TERMINATED' };
}

/**
 * Mandatory-MFA classification (Decision 02, approved catalogue docs/07 §10B). The role and
 * security-permission flags are computed in Oracle by PRIVILEGE_COLUMNS (auth.repository.js).
 * `privileged` selects the 15-minute idle timeout. Phase 01 cannot verify MFA, so `required`
 * always means "no session".
 *
 * `adminMfaRequired: false` is the local-development or explicit Test-profile exception
 * (AUTH_ADMIN_MFA_REQUIRED, validated in config/index.js): privileged accounts are still classified as privileged (15-minute idle
 * timeout, administrator hierarchy) but are not required to pass MFA, and the result says so with
 * `exempted: true`. It never marks anything as verified. Voluntarily enrolled ordinary users keep
 * their MFA requirement.
 *
 * @param {{ employeeNumber: string, mfaEnrolled: boolean, isPrivilegedRoleMember: boolean,
 *   hasSecurityAdministration: boolean }} account
 * @param {{ adminMfaRequired?: boolean, classification?: typeof PRIVILEGE_CLASSIFICATION }} [policy]
 */
export function evaluateMfaRequirement(
  account,
  { adminMfaRequired = true, classification = PRIVILEGE_CLASSIFICATION } = {},
) {
  const privileged = (basis) =>
    adminMfaRequired === false
      ? { required: false, privileged: true, basis, exempted: true }
      : { required: true, privileged: true, basis };

  if (classification.protectedEmployeeNumbers.includes(account.employeeNumber)) {
    return privileged('PROTECTED_ADMINISTRATOR');
  }
  if (account.isPrivilegedRoleMember) return privileged('PRIVILEGED_ROLE');
  if (account.hasSecurityAdministration) return privileged('SECURITY_ADMINISTRATION_PERMISSION');

  // Voluntarily enrolled MFA is mandatory too, but does not make the user privileged.
  if (account.mfaEnrolled) return { required: true, privileged: false, basis: 'MFA_ENROLLED' };
  return { required: false, privileged: false };
}

/**
 * Password expiry from PASSWORD_CHANGED_AT using the database clock (Decision 04). A NULL change
 * time blocks a new login (`missing: true`); it cannot be shown to be within 90 days.
 */
export function evaluatePasswordExpiry(passwordChangedAt, dbNow) {
  if (!(passwordChangedAt instanceof Date)) {
    return { expired: true, missing: true, expiresAt: null };
  }

  const expiresAt = new Date(passwordChangedAt.getTime() + PASSWORD_POLICY.expiryDays * DAY_MS);
  return { expired: dbNow.getTime() >= expiresAt.getTime(), missing: false, expiresAt };
}
