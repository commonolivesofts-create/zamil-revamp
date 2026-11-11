import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as employeeClearance from '../src/modules/hr/employee-clearance/employee_clearance_repository.js';
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

// Fail closed: TAG is compared with a scalar subquery that yields a value only when the
// application user maps to exactly one non-blank legacy user ID on current rows. Otherwise it
// yields no row (NULL), and TAG = NULL is never true. The same SQL was run on Oracle against
// synthetic rows for each case below (docs/testing/hr-identity-mapping.md).
const hrOnly = hrChecks.filter(([name]) => name.endsWith('HR check'));
const sqlOf = async (run) => {
  const statements = [];
  const connection = {
    async execute(sql, binds) {
      statements.push({ sql, binds });
      return { rows: sql.includes('COUNT(*) AS CNT') ? [{ CNT: 0 }] : [] };
    },
  };
  return { result: await run(connection), sql: statements[0].sql };
};

describe('HR checks fail closed', () => {
  for (const [name, run] of hrOnly) {
    describe(name, () => {
      it('is not HR without an employee number (inner join on XX_ZRV_USERS.EMPLOYEE_NUMBER)', async () => {
        const { sql } = await sqlOf(run);
        assert.match(sql, /JOIN XX_ZRV_USERS U ON U\.EMPLOYEE_NUMBER = E\.EMPLOYEE_NUMBER/);
        assert.match(sql, /WHERE U\.USER_ID = :userId AND E\.CURRENT_EMP_FLAG = 'Y'/);
      });

      it('is not HR without an old-system user ID (blank IDs are counted, TAG = NULL never matches)', async () => {
        const { sql } = await sqlOf(run);
        assert.match(sql, /TAG = \(SELECT TO_CHAR\(MAX\(E\.USER_ID\)\) FROM XX_DIGI_EMP_MASTER E/);
        assert.match(sql, /COUNT\(\*\) = COUNT\(E\.USER_ID\)/);
        assert.doesNotMatch(sql, /TAG IN/);
      });

      it('is not HR when the employee maps to more than one old-system user ID', async () => {
        const { sql } = await sqlOf(run);
        assert.match(sql, /HAVING COUNT\(DISTINCT E\.USER_ID\) = 1/);
      });

      it('returns false when nothing matches', async () => {
        const { result } = await sqlOf(run);
        assert.equal(result, false);
      });
    });
  }
});
