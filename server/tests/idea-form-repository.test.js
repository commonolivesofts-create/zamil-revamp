import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as repository from '../src/modules/hr/ideas/idea form repository.js';

describe('Share an Idea Oracle repository', () => {
  it('uses non-reserved bind names for creation-date filters in both list queries', async () => {
    const calls = [];
    const connection = {
      async execute(sql, binds) {
        calls.push({ sql, binds });
        if (sql.includes('XX_DIGI_LOOKUP_VALUES')) return { rows: [{ CNT: 0 }] };
        if (sql.includes('SELECT COUNT(*) AS CNT FROM XXZP.XXZP_IDEA'))
          return { rows: [{ CNT: 0 }] };
        return { rows: [] };
      },
    };

    const result = await repository.list(connection, '0', {
      page: 1,
      pageSize: 1,
      from: '2026-01-01',
      to: '2026-12-31',
    });

    assert.equal(result.total, 0);
    assert.equal(result.items.length, 0);
    const listQueries = calls.filter(({ sql }) => sql.includes('XXZP.XXZP_IDEA'));
    assert.equal(listQueries.length, 2);
    assert.match(listQueries[1].sql, /TO_CHAR\(I\.CREATION_DATE, 'YYYY-MM-DD'\) AS CREATION_DATE/);
    assert.doesNotMatch(listQueries[1].sql, /I\.TO_CHAR/);
    for (const { sql, binds } of listQueries) {
      assert.doesNotMatch(sql, /:\s*(?:from|to)\b/i);
      assert.match(sql, /:createdFrom/);
      assert.match(sql, /:createdTo/);
      assert.equal(binds.createdFrom, '2026-01-01');
      assert.equal(binds.createdTo, '2026-12-31');
    }
  });
});
