// Warning Letter (legacy Warning_letter): the create defaults, the safe
// warning numbering and the current-employee filters. Mocked: no Oracle.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { repository } from '../src/modules/hr/warning-letters/warning-letter.repository.js';
import { normalizeBody } from '../src/modules/hr/warning-letters/warning-letter.validation.js';

const connection = (rows) => ({
  statements: [],
  execute: async function execute(sql, binds = {}) {
    this.statements.push({ sql, binds });
    return { rows };
  },
});

describe('Warning Letter create defaults', () => {
  it('defaults the warning date to today in Riyadh when it is omitted', () => {
    const result = normalizeBody({ emp_no: '100', irregular_flag: true }, true);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    assert.equal(result.war_date, today);
  });

  it('clears a comment whose letter is not ticked', () => {
    const result = normalizeBody(
      { emp_no: '100', irregular_flag: true, warning_letter_comment: 'x' },
      true,
    );

    assert.equal(result.warning_letter_comment, null);
  });
});

describe('Warning Letter numbering', () => {
  it('uses MAX + 1 and ignores non-numeric legacy values', async () => {
    const c = connection([{ N: 4 }]);
    const next = await repository.nextWarning(c, '100');

    assert.equal(next, 4);
    assert.match(c.statements[0].sql, /NVL\(MAX\(/);
    assert.match(c.statements[0].sql, /REGEXP_LIKE\(TRIM\(WARNING_NO\)/);
    assert.deepEqual(c.statements[0].binds, { empNo: '100' });
  });
});

describe('Warning Letter employee lookups', () => {
  it('only resolves current employees', async () => {
    const c = connection([]);
    await repository.employee(c, '100');

    assert.match(c.statements[0].sql, /CURRENT_EMP_FLAG/);
  });

  it('only lists current employees, with and without a search term', async () => {
    const c = connection([]);
    await repository.employees(c, '');
    await repository.employees(c, '100');

    assert.match(c.statements[0].sql, /CURRENT_EMP_FLAG/);
    assert.doesNotMatch(c.statements[0].sql, /:term/);
    assert.match(c.statements[1].sql, /CURRENT_EMP_FLAG/);
    assert.match(c.statements[1].sql, /:term/);
  });
});
