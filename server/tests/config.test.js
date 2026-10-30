import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config/index.js';

const SERVER_ROOT = resolve(import.meta.dirname, '..');

// Synthetic values only; never real credentials.
const ORACLE_ENV = {
  ORACLE_USER: 'app_user',
  ORACLE_PASSWORD: 'db-secret',
  ORACLE_WALLET_DIR: '../secrets/oracle/Wallet_example',
  ORACLE_WALLET_PASSWORD: 'wallet-secret',
  ORACLE_LOW_ALIAS: 'example_low',
  ORACLE_HIGH_ALIAS: 'example_high',
};

// Synthetic MFA key: required outside development and test.
const MFA_KEY = Buffer.alloc(32, 7).toString('base64');

const env = (overrides = {}) => ({
  NODE_ENV: 'development',
  ...ORACLE_ENV,
  AUTH_MFA_ENCRYPTION_KEY: MFA_KEY,
  ...overrides,
});

describe('configuration', () => {
  it('fails fast when NODE_ENV is missing', () => {
    assert.throws(() => loadConfig({}), /NODE_ENV/);
  });

  it('rejects invalid values', () => {
    assert.throws(() => loadConfig(env({ PORT: 'abc' })), /PORT/);
  });

  it('applies safe defaults for optional settings', () => {
    const config = loadConfig(env());

    assert.equal(config.port, 3000);
    assert.equal(config.http.bodyLimit, '100kb');
    assert.equal(config.http.trustProxyHops, 0);
    assert.equal(config.http.host, '127.0.0.1', 'loopback in development');
    assert.equal(loadConfig(env({ NODE_ENV: 'production' })).http.host, '0.0.0.0');
    assert.throws(() => loadConfig(env({ HTTP_HOST: 'not-an-ip' })), /HTTP_HOST/);
    assert.equal(config.apiDocs.enabled, true);
  });

  it('maps APP_ENV profiles to the requested local, LAN test and production listeners', () => {
    const development = loadConfig(env({ APP_ENV: 'development' }));
    assert.equal(development.env, 'development');
    assert.equal(development.port, 7381);
    assert.equal(development.http.host, '127.0.0.1');
    assert.equal(development.links.baseUrl, 'http://localhost:7382');

    const sharedTest = loadConfig(env({ APP_ENV: 'Test' }));
    assert.equal(sharedTest.env, 'test');
    assert.equal(sharedTest.port, 7381);
    assert.equal(sharedTest.http.host, '0.0.0.0');
    assert.deepEqual(sharedTest.auth.cookie, {
      name: 'zr_session',
      secure: false,
      sameSite: 'lax',
    });
    assert.equal(sharedTest.auth.mfa.cookieName, 'zr_mfa');
    assert.equal(sharedTest.auth.adminMfaRequired, true);
    assert.equal(sharedTest.links.baseUrl, 'http://10.10.2.160:7382');

    const production = loadConfig(env({ APP_ENV: '' }));
    assert.equal(production.env, 'production');
    assert.equal(production.auth.cookie.secure, true);
  });

  it('disables API docs by default outside development and test', () => {
    assert.equal(loadConfig(env({ NODE_ENV: 'production' })).apiDocs.enabled, false);
    assert.equal(loadConfig(env({ NODE_ENV: 'uat' })).apiDocs.enabled, false);
  });

  it('applies secure authentication defaults', () => {
    const { auth } = loadConfig(env());

    assert.deepEqual(auth.cookie, { name: '__Host-zr_session', secure: true, sameSite: 'lax' });
    assert.deepEqual(auth.allowedOrigins, []);
    assert.deepEqual(auth.argon2, { memoryKiB: 19456, passes: 2, parallelism: 1 });
    assert.equal(auth.sessionTouchIntervalMs, 60000);
    assert.deepEqual(auth.loginRateLimit, { max: 60, windowMs: 60000 });
  });

  it('refuses insecure session cookies outside development and test', () => {
    assert.throws(
      () => loadConfig(env({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' })),
      /AUTH_COOKIE_SECURE/,
    );
  });

  it('refuses a __Host- cookie name without the Secure attribute', () => {
    assert.throws(() => loadConfig(env({ AUTH_COOKIE_SECURE: 'false' })), /__Host-/);
    const insecureDev = loadConfig(
      env({
        AUTH_COOKIE_SECURE: 'false',
        AUTH_SESSION_COOKIE_NAME: 'zr_session',
        AUTH_MFA_COOKIE_NAME: 'zr_mfa',
      }),
    );
    assert.equal(insecureDev.auth.cookie.secure, false);
  });

  it('parses and validates allowed origins', () => {
    const parsed = loadConfig(
      env({ AUTH_ALLOWED_ORIGINS: 'https://app.example, http://localhost:5173' }),
    );
    assert.deepEqual(parsed.auth.allowedOrigins, ['https://app.example', 'http://localhost:5173']);

    assert.throws(() => loadConfig(env({ AUTH_ALLOWED_ORIGINS: 'not a url' })), /origin/);
    assert.throws(
      () => loadConfig(env({ AUTH_ALLOWED_ORIGINS: 'https://app.example/path' })),
      /bare origins/,
    );
  });

  it('validates the MFA encryption key and requires it outside development and test', () => {
    assert.ok(loadConfig(env()).auth.mfa.encryptionKey.equals(Buffer.alloc(32, 7)));
    assert.equal(
      loadConfig(env({ AUTH_MFA_ENCRYPTION_KEY: undefined })).auth.mfa.encryptionKey,
      null,
    );
    for (const bad of [
      Buffer.alloc(16).toString('base64'),
      'not base64!',
      Buffer.alloc(33).toString('base64'),
    ]) {
      assert.throws(
        () => loadConfig(env({ AUTH_MFA_ENCRYPTION_KEY: bad })),
        /AUTH_MFA_ENCRYPTION_KEY/,
      );
    }
    for (const NODE_ENV of ['uat', 'production']) {
      assert.throws(
        () => loadConfig(env({ NODE_ENV, AUTH_MFA_ENCRYPTION_KEY: undefined })),
        /AUTH_MFA_ENCRYPTION_KEY/,
      );
    }
    assert.throws(
      () => loadConfig(env({ AUTH_MFA_COOKIE_NAME: '__Host-zr_session' })),
      /AUTH_MFA_COOKIE_NAME/,
    );
  });

  it('refuses Argon2id costs below the OWASP minimum', () => {
    assert.throws(() => loadConfig(env({ AUTH_ARGON2_MEMORY_KIB: '4096' })), /MEMORY/);
    assert.throws(() => loadConfig(env({ AUTH_ARGON2_PASSES: '1' })), /PASSES/);
  });

  it('refuses to enable API docs in production', () => {
    assert.throws(
      () => loadConfig(env({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' })),
      /API_DOCS_ENABLED/,
    );
  });
});

describe('Oracle configuration', () => {
  it('requires credentials, wallet settings and aliases outside test', () => {
    for (const key of Object.keys(ORACLE_ENV)) {
      assert.throws(() => loadConfig(env({ [key]: undefined })), new RegExp(key));
    }
  });

  it('rejects empty credentials', () => {
    assert.throws(() => loadConfig(env({ ORACLE_PASSWORD: '' })), /ORACLE_PASSWORD/);
  });

  it('does not require Oracle settings in the test environment', () => {
    assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'test' }));
  });

  it('resolves a relative wallet directory against the server root', () => {
    const { database } = loadConfig(env());

    assert.equal(database.walletDir, join(SERVER_ROOT, '../secrets/oracle/Wallet_example'));
  });

  it('keeps an absolute wallet directory unchanged', () => {
    const absolute = resolve('/wallets/example');

    assert.equal(loadConfig(env({ ORACLE_WALLET_DIR: absolute })).database.walletDir, absolute);
  });

  it('builds independent, bounded LOW and HIGH pool settings', () => {
    const { pools } = loadConfig(env({ ORACLE_HIGH_POOL_MAX: '3' })).database;

    assert.deepEqual(pools.LOW, {
      alias: 'example_low',
      poolMin: 1,
      poolMax: 4,
      queueMax: 50,
      queueTimeout: 10000,
    });
    assert.equal(pools.HIGH.alias, 'example_high');
    assert.equal(pools.HIGH.poolMax, 3);
  });

  it('rejects a pool whose maximum is below its minimum', () => {
    assert.throws(
      () => loadConfig(env({ ORACLE_LOW_POOL_MIN: '5', ORACLE_LOW_POOL_MAX: '2' })),
      /ORACLE_LOW_POOL_MAX/,
    );
  });

  it('rejects identical LOW and HIGH aliases', () => {
    assert.throws(() => loadConfig(env({ ORACLE_HIGH_ALIAS: 'example_low' })), /ORACLE_HIGH_ALIAS/);
  });
});
