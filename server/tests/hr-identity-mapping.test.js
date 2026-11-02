import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as employeeClearance from '../src/modules/hr/employee-clearance/employee_clearance_repository.js';
import * as employeeOfTheMonth from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.repository.js';
import * as employmentOffer from '../src/modules/hr/employment-offers/employmentOffer.repository.js';
import * as idea from '../src/modules/hr/ideas/idea form repository.js';
import * as interviewAssessment from '../src/modules/hr/interview-assessments/interviewAssessment.repository.js';
import * as orientationTraining from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import * as performanceAppraisal from '../src/modules/hr/performance-appraisals/performanceAppraisal.repository.js';
import * as requisition from '../src/modules/hr/requisitions/requisition.repository.js';
import * as transferRequest from '../src/modules/hr/transfer-requests/transferRequest.repository.js';

function fakeConnection() {
  const statements = [];
  return {
    statements,
    async execute(sql, binds) {
      statements.push({ sql, binds });
      return { rows: [] };
    },
  };
}

// The XXZP_HR lookup's TAG holds the legacy EBS user ID (XX_DIGI_EMP_MASTER.USER_ID), and employee
// clearance resolves the actor row; both map this application's user ID through
// XX_ZRV_USERS.EMPLOYEE_NUMBER.
const hrChecks = [
  ['employee clearance actor', (c) => employeeClearance.actor(c, '9')],
  ['employee of the month HR check', (c) => employeeOfTheMonth.isHrUser(c, '9')],
  ['employment offer HR check', (c) => employmentOffer.isHrUser(c, '9')],
  ['idea HR check', (c) => idea.isHr(c, '9')],
  ['interview assessment HR check', (c) => interviewAssessment.isHrUser(c, '9')],
  ['orientation HR check', (c) => orientationTraining.isHrUser(c, '9')],
  ['performance appraisal HR check', (c) => performanceAppraisal.isHrUser(c, '9')],
  ['requisition HR check', (c) => requisition.isHrUser(c, '9')],
  ['transfer request HR check', (c) => transferRequest.isHrUser(c, '9')],
];

describe('HR checks map the application user ID to the legacy user through XX_ZRV_USERS', () => {
  for (const [name, run] of hrChecks) {
    it(name, async () => {
      const connection = fakeConnection();
      await run(connection).catch(() => {});
      const [{ sql, binds }] = connection.statements;
      assert.doesNotMatch(sql, /TAG\s*=\s*:userId/);
      assert.doesNotMatch(sql, /XX_DIGI_EMP_MASTER\s+WHERE USER_ID = :userId/);
      assert.match(sql, /XX_ZRV_USERS/);
      assert.match(sql, /USER_ID = :userId/);
      assert.equal(String(binds.userId), '9');
    });
  }
});
