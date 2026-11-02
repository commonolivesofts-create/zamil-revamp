import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as employeeOfTheMonth from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.repository.js';
import * as orientationTraining from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import * as performanceAppraisal from '../src/modules/hr/performance-appraisals/performanceAppraisal.repository.js';
import * as projectCharter from '../src/modules/hr/project-charter/projectCharter.repository.js';
import * as requisition from '../src/modules/hr/requisitions/requisition.repository.js';
import * as transferRequest from '../src/modules/hr/transfer-requests/transferRequest.repository.js';

// XX_DIGI_EMP_MASTER.USER_ID is the legacy EBS user ID; the session's userId is this application's
// XX_ZRV_USERS user ID. Matching one against the other found nobody, so the signed-in user is
// resolved by EMPLOYEE_NUMBER instead.
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

const lookups = [
  ['employee of the month requestor', (c) => employeeOfTheMonth.requestor(c, 'E-0100')],
  ['orientation actor name', (c) => orientationTraining.findActorName(c, 'E-0100')],
  ['performance appraisal requestor', (c) => performanceAppraisal.findRequestor(c, 'E-0100')],
  [
    'performance appraisal employees',
    (c) => performanceAppraisal.listEmployees(c, 'E-0100', '2026'),
  ],
  [
    'performance appraisal employee',
    (c) => performanceAppraisal.findEmployee(c, 'Sample', 'E-0100'),
  ],
  ['project charter actor profile', (c) => projectCharter.findActorProfile(c, 'E-0100')],
  ['requisition requestor', (c) => requisition.findRequestor(c, 'E-0100')],
  ['transfer request requestor', (c) => transferRequest.findRequestor(c, 'E-0100')],
];

describe('HR lookups resolve the signed-in user by employee number', () => {
  for (const [name, run] of lookups) {
    it(name, async () => {
      const connection = fakeConnection();
      await run(connection);
      const [{ sql, binds }] = connection.statements;
      assert.doesNotMatch(sql, /USER_ID\s*=\s*:userId/);
      assert.match(sql, /EMPLOYEE_NUMBER = :employeeNumber AND CURRENT_EMP_FLAG = 'Y'/);
      assert.equal(binds.employeeNumber, 'E-0100');
      assert.equal('userId' in binds, false);
    });
  }
});
