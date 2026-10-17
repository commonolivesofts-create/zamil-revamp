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

const env = (overrides = {}) => ({ NODE_ENV: 'development', ...ORACLE_ENV, ...overrides });

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
    assert.equal(config.apiDocs.enabled, true);
  });

  it('disables API docs by default outside development and test', () => {
    assert.equal(loadConfig(env({ NODE_ENV: 'production' })).apiDocs.enabled, false);
    assert.equal(loadConfig(env({ NODE_ENV: 'uat' })).apiDocs.enabled, false);
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
