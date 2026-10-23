import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { buildLink } from '../src/modules/notifications/smtpDelivery.js';

// E-mailed links use AUTH_FRONTEND_BASE_URL verbatim; the approved development frontend is
// http://localhost:5199 (client/vite.config.js DEV_PORT, strictPort).
describe('frontend link origin', () => {
  it('builds links on the configured frontend origin and port', () => {
    const links = { baseUrl: 'http://localhost:5199', PASSWORD_SETUP: '/password/setup' };
    const link = new URL(buildLink(links, 'PASSWORD_SETUP', 'abc'));
    assert.equal(link.origin, 'http://localhost:5199');
    assert.equal(link.pathname, '/password/setup');
  });

  it('documents the development frontend as http://localhost:5199 and never another dev port', async () => {
    const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
    assert.match(example, /Local development: http:\/\/localhost:5199/);
    assert.doesNotMatch(example, /localhost:5173|127\.0\.0\.1:5173/);
  });
});
