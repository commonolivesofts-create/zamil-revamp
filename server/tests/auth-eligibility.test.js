import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateEmployeeEligibility,
  evaluateMfaRequirement,
  evaluatePasswordExpiry,
} from '../src/modules/auth/auth.eligibility.js';
import { PRIVILEGE_CLASSIFICATION } from '../src/modules/auth/auth.policy.js';
import { DAY_MS, riyadhDate, terminationStatus } from './helpers/authFakes.js';

// Pure decision functions; no database involved.

const employee = (overrides) => ({
  currentEmployeeFlag: 'Y',
  terminationStatus: 'NONE',
  employeeRowCount: 1,
  ...overrides,
});

describe('employee eligibility (Decision 01)', () => {
  it('allows CURRENT_EMP_FLAG Y with no or a future termination date', () => {
    assert.deepEqual(evaluateEmployeeEligibility(employee()), { eligible: true });
    assert.deepEqual(evaluateEmployeeEligibility(employee({ terminationStatus: 'FUTURE' })), {
      eligible: true,
    });
  });

  it('refuses a termination date of today or earlier, any non-Y flag and ambiguity', () => {
    const cases = [
      [employee({ terminationStatus: 'ENDED' }), 'EMPLOYEE_TERMINATED'],
      [employee({ terminationStatus: undefined }), 'EMPLOYEE_TERMINATED'],
      [employee({ currentEmployeeFlag: 'N' }), 'EMPLOYEE_NOT_CURRENT'],
      [employee({ currentEmployeeFlag: 'y' }), 'EMPLOYEE_NOT_CURRENT'],
      [employee({ currentEmployeeFlag: null }), 'EMPLOYEE_NOT_CURRENT'],
      [employee({ employeeRowCount: 2 }), 'EMPLOYEE_AMBIGUOUS'],
      [null, 'EMPLOYEE_NOT_FOUND'],
    ];
    for (const [input, reason] of cases) {
      assert.deepEqual(evaluateEmployeeEligibility(input), { eligible: false, reason });
    }
  });

  it('the test double classifies dates by the Asia/Riyadh calendar day', () => {
    const lateUtc = new Date('2026-10-19T21:30:00Z'); // 2026-10-20 00:30 in KSA
    assert.equal(riyadhDate(lateUtc), '2026-10-20');
    assert.equal(terminationStatus(null, lateUtc), 'NONE');
    assert.equal(terminationStatus('2026-10-19', lateUtc), 'ENDED');
    assert.equal(terminationStatus('2026-10-20', lateUtc), 'ENDED');
    assert.equal(terminationStatus('2026-10-21', lateUtc), 'FUTURE');
  });
});

describe('mandatory MFA classification (Decision 02, approved catalogue)', () => {
  // An ordinary business-role holder: the Oracle classification columns are both 0.
  const ordinary = {
    employeeNumber: 'E1',
    mfaEnrolled: false,
    isPrivilegedRoleMember: false,
    hasSecurityAdministration: false,
  };

  it('uses the approved protected roles and security module', () => {
    assert.deepEqual(PRIVILEGE_CLASSIFICATION, {
      protectedEmployeeNumbers: ['2172'],
      privilegedRoleCodes: ['SUPER_ADMINISTRATOR', 'MAIN_ADMINISTRATOR', 'ADMINISTRATOR'],
      securityAdministrationModuleCodes: ['SECURITY_ADMINISTRATION'],
    });
    assert.ok(Object.isFrozen(PRIVILEGE_CLASSIFICATION));
    assert.ok(Object.isFrozen(PRIVILEGE_CLASSIFICATION.privilegedRoleCodes));
  });

  it('always requires MFA for Zaid (2172), even with no role or permission', () => {
    assert.deepEqual(evaluateMfaRequirement({ ...ordinary, employeeNumber: '2172' }), {
      required: true,
      privileged: true,
      basis: 'PROTECTED_ADMINISTRATOR',
    });
    assert.equal(evaluateMfaRequirement({ ...ordinary, employeeNumber: '21720' }).required, false);
  });

  it('requires MFA for protected administrator role members', () => {
    assert.deepEqual(evaluateMfaRequirement({ ...ordinary, isPrivilegedRoleMember: true }), {
      required: true,
      privileged: true,
      basis: 'PRIVILEGED_ROLE',
    });
  });

  it('requires MFA for any effective security-administration permission', () => {
    assert.deepEqual(evaluateMfaRequirement({ ...ordinary, hasSecurityAdministration: true }), {
      required: true,
      privileged: true,
      basis: 'SECURITY_ADMINISTRATION_PERMISSION',
    });
  });

  it('does not require MFA for ordinary business-role holders', () => {
    assert.deepEqual(evaluateMfaRequirement(ordinary), { required: false, privileged: false });
  });

  it('requires voluntarily enrolled MFA without the privileged idle timeout', () => {
    assert.deepEqual(evaluateMfaRequirement({ ...ordinary, mfaEnrolled: true }), {
      required: true,
      privileged: false,
      basis: 'MFA_ENROLLED',
    });
  });

  it('privileged classes take precedence over voluntary enrolment', () => {
    const both = { ...ordinary, mfaEnrolled: true, isPrivilegedRoleMember: true };
    assert.equal(evaluateMfaRequirement(both).privileged, true);
  });
});

describe('password-change timestamp (Decision 04)', () => {
  const now = new Date('2026-10-19T08:00:00Z');

  it('blocks a NULL PASSWORD_CHANGED_AT', () => {
    assert.deepEqual(evaluatePasswordExpiry(null, now), {
      expired: true,
      missing: true,
      expiresAt: null,
    });
  });

  it('expires at exactly 90 days', () => {
    const changed = new Date(now.getTime() - 90 * DAY_MS);
    assert.equal(evaluatePasswordExpiry(changed, now).expired, true);
    assert.equal(evaluatePasswordExpiry(new Date(changed.getTime() + 1), now).expired, false);
  });
});
