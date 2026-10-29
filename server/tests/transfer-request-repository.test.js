import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as repository from '../src/modules/hr/transfer-requests/transferRequest.repository.js';

function connection(results = []) {
  const calls = [];
  return {
    calls,
    async execute(sql, binds, options) {
      calls.push({ sql, binds, options });
      return { rows: results.shift() ?? [], rowsAffected: 1 };
    },
  };
}

describe('transfer request Oracle repository', () => {
  it('binds every listing filter, scope, page and search input; uses COUNT and allowlisted ordering', async () => {
    const c = connection([[{ TOTAL: 1 }], [{ HEADER_ID: '1' }]]);
    const search = "%' OR 1=1 --";
    const result = await repository.listRequests(c, {
      filters: {
        search,
        status: 'Draft',
        plant: 'Zamil Plastic Non-Food',
        transferDept: 'Maintenance Department',
        currentDept: 'Production',
        jobTitle: 'Senior Operator',
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      },
      userId: '88',
      isHr: false,
      page: 2,
      pageSize: 10,
      sort: 'headerId',
      order: 'desc',
    });
    assert.equal(result.total, 1);
    assert.equal(c.calls.length, 2);
    assert.match(c.calls[0].sql, /SELECT COUNT\(\*\)/);
    assert.match(c.calls[1].sql, /OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY/);
    assert.match(c.calls[1].sql, /ORDER BY TSF\.HEADER_ID DESC, TSF\.HEADER_ID DESC/);
    assert.equal(c.calls[1].binds.userId, '88');
    assert.equal(c.calls[1].binds.isHr, 0);
    assert.equal(c.calls[1].binds.offset, 10);
    assert.equal(c.calls[1].binds.pageSize, 10);
    assert.equal(c.calls[1].binds.search, `%${search.replace(/[\\%_]/g, (x) => `\\${x}`)}%`);
    assert.doesNotMatch(
      c.calls.map((x) => x.sql).join('\n'),
      /XXPHP_WORKFLOW|PENDING_AT|DAYS_OPEN|LAST_ACTION/,
    );
  });

  it('reads back the database-generated header ID by UUID and seeds Draft without legacy signature junk', async () => {
    const c = connection([[], [{ HEADER_ID: '90071992547409911' }]]);
    const id = await repository.insertRequest(c, { uuid: 'uuid-value', plant: 'plant' });
    assert.equal(id, '90071992547409911');
    assert.match(c.calls[0].sql, /INSERT INTO XXZP\.XXZP_TRANSFER_REQUEST/);
    assert.doesNotMatch(c.calls[0].sql, /HEADER_ID\s*,/);
    assert.match(c.calls[0].sql, /'Draft'.*'Draft'.*'Draft'/s);
    assert.doesNotMatch(c.calls[0].sql, /'Approved'|'SIGNATURE'|'01-Jan-70'/);
    assert.equal(c.calls[0].binds.uuid, 'uuid-value');
    assert.match(c.calls[1].sql, /WHERE UUID=:uuid/);
    assert.equal(c.calls[1].binds.uuid, 'uuid-value');
  });

  it('keeps server-owned and approval columns out of UPDATE and binds header IDs', async () => {
    const c = connection();
    await repository.updateRequest(c, { headerId: '42', plant: 'plant' });
    const { sql, binds } = c.calls[0];
    assert.match(sql, /WHERE HEADER_ID=:headerId/);
    assert.equal(binds.headerId, '42');
    assert.doesNotMatch(
      sql,
      /\b(?:STATUS|CREATED_BY|UUID|SIGNATURE|TRANSFER_DEPT_HEAD|ADMIN_SIGNATURE|PRESIDENT|HR_MANAGER|GENERAL_MANAGER|VP_SS?)\s*=/,
    );
  });
});
