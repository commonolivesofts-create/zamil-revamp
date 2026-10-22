import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

// server.js runs at import, so its startup order is checked on the source: the listener must not
// wait for the Oracle readiness probe (which only logs), or the port stays closed for seconds after
// every start and the development proxy answers 502 to session checks and sign-ins.
describe('server startup order', () => {
  it('creates the pools, then listens, then probes readiness', async () => {
    const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
    const init = source.indexOf('await initializeDatabase()');
    const listen = source.indexOf('.listen(config.port');
    const probe = source.indexOf('await checkDatabaseReadiness()');
    assert.ok(init > 0 && listen > 0 && probe > 0);
    assert.ok(init < listen, 'invalid wallet or pool configuration still stops startup first');
    assert.ok(listen < probe, 'the readiness probe does not delay the listener');
  });
});
