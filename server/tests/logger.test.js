import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

// The shared logger reads its level at import, so it runs in a child process at `info`.
const PROBE = `
const { logger } = await import('./src/shared/logger/index.js');
logger.info(
  { password: 'p0', walletPassword: 'w0', database: { password: 'p1', walletPassword: 'w1' } },
  'redaction probe',
);
`;

describe('logger redaction', () => {
  it('redacts database and wallet passwords at the top level and one level deep', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', PROBE], {
      cwd: import.meta.dirname + '/..',
      env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'info' },
      encoding: 'utf8',
    });

    assert.match(output, /redaction probe/);
    assert.doesNotMatch(output, /"(p0|p1|w0|w1)"/);
    assert.equal(output.match(/\[REDACTED\]/g).length, 4);
  });

  it('redacts authentication secrets', () => {
    const probe = `
const { logger } = await import('./src/shared/logger/index.js');
logger.info({
  passwordHash: 's1', token: 's2', sessionToken: 's3', csrfToken: 's4', tokenHash: 's5',
  body: { password: 's6', currentPassword: 's7', newPassword: 's8', passwordHash: 's9' },
  req: { headers: { cookie: 's10', 'x-csrf-token': 's11' } },
}, 'auth redaction probe');
`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: import.meta.dirname + '/..',
      env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'info' },
      encoding: 'utf8',
    });

    assert.match(output, /auth redaction probe/);
    assert.doesNotMatch(output, /"s\d+"/);
    assert.equal(output.match(/\[REDACTED\]/g).length, 11);
  });
});
