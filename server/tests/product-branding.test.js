import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config/index.js';
import { displayVersion, PRODUCT } from '../src/config/product.js';
import { loadOpenApiSpec } from '../src/routes/docs.routes.js';
import { composeMessage } from '../src/modules/notifications/smtpDelivery.js';

const ROOT = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const files = (dir) =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? files(path) : [path];
  });

describe('product identity (Zamil Digitalization V 2.1.0)', () => {
  it('has one authoritative name and machine-readable version matching package.json', () => {
    assert.equal(PRODUCT.name, 'Zamil Digitalization');
    assert.equal(PRODUCT.version, '2.1.0');
    assert.equal(displayVersion(), 'V 2.1.0');
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.version, PRODUCT.version);
    assert.equal(pkg.name, 'zamil-revamp-server', 'technical package name is unchanged');
  });

  it('brands new MFA enrollments and e-mail senders by default', () => {
    const loaded = loadConfig({
      NODE_ENV: 'development',
      ORACLE_USER: 'u',
      ORACLE_PASSWORD: 'p',
      ORACLE_WALLET_DIR: '../secrets/oracle/Wallet_example',
      ORACLE_WALLET_PASSWORD: 'w',
      ORACLE_LOW_ALIAS: 'a_low',
      ORACLE_HIGH_ALIAS: 'a_high',
    });
    assert.equal(loaded.auth.mfa.issuer, 'Zamil Digitalization');
    assert.equal(loaded.smtp.from.name, 'Zamil Digitalization');
    assert.equal(loaded.auth.cookie.name, '__Host-zr_session', 'cookie names are unchanged');
    assert.equal(loaded.auth.mfa.cookieName, '__Host-zr_mfa');
  });

  it('names the application in e-mails without the release version', () => {
    for (const purpose of ['PASSWORD_SETUP', 'PASSWORD_RESET', 'MFA_RECOVERY']) {
      const message = composeMessage({
        purpose,
        link: 'https://app.example.invalid/x#token=t',
        expiresAt: '2026-10-22T10:00:00Z',
        test: false,
      });
      for (const part of [message.subject, message.text, message.html]) {
        assert.ok(part.includes('Zamil Digitalization'), purpose);
        assert.equal(/Revamp|2\.1\.0/.test(part), false, purpose);
      }
    }
  });

  it('titles the API documentation without changing the /api/v1 routes', () => {
    const spec = loadOpenApiSpec();
    assert.equal(spec.info.title, 'Zamil Digitalization API');
    assert.equal(spec.info.version, '2.1.0');
    const apiPaths = Object.keys(spec.paths).filter((path) => path.startsWith('/api/'));
    assert.ok(apiPaths.length > 0);
    assert.ok(
      apiPaths.every((path) => path.startsWith('/api/v1/')),
      'API routes stay on /api/v1',
    );
  });

  it('leaves no former product name in backend source, scripts or examples', () => {
    for (const path of [...files('src'), ...files('scripts'), '.env.example', 'package.json']) {
      assert.equal(read(path).includes('Zamil Revamp'), false, path);
    }
  });
});
