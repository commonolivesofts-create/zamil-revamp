import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { validateWallet } from '../src/database/wallet.js';

// Synthetic wallet contents only; no real wallet material is used in tests.
const TNSNAMES = `app_low = (description= (address=(protocol=tcps)(port=1522)(host=example.invalid)))
APP_HIGH = (description= (address=(protocol=tcps)(port=1522)(host=example.invalid)))
`;

// Synthetic encrypted key generated per run, mirroring the ADW ewallet.pem layout.
function encryptedPem(passphrase) {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return privateKey;
}

describe('Oracle wallet validation', () => {
  let walletDir;

  beforeEach(() => {
    walletDir = mkdtempSync(join(tmpdir(), 'zr-wallet-'));
  });

  afterEach(() => {
    rmSync(walletDir, { recursive: true, force: true });
  });

  function writeWallet({ tnsnames = TNSNAMES, pem = true, sso = false } = {}) {
    if (tnsnames !== null) writeFileSync(join(walletDir, 'tnsnames.ora'), tnsnames);
    if (pem) writeFileSync(join(walletDir, 'ewallet.pem'), 'synthetic');
    if (sso) writeFileSync(join(walletDir, 'cwallet.sso'), 'synthetic');
  }

  it('accepts a complete Thin-mode wallet with case-insensitive aliases', () => {
    writeWallet();

    assert.doesNotThrow(() => validateWallet(walletDir, ['APP_LOW', 'app_high']));
  });

  it('rejects a missing wallet directory', () => {
    assert.throws(
      () => validateWallet(join(walletDir, 'absent'), ['app_low']),
      /wallet directory not found/,
    );
  });

  it('rejects a wallet without tnsnames.ora', () => {
    writeWallet({ tnsnames: null });

    assert.throws(() => validateWallet(walletDir, ['app_low']), /missing tnsnames\.ora/);
  });

  it('rejects an SSO-only wallet with an explicit Thin-mode explanation', () => {
    writeWallet({ pem: false, sso: true });

    assert.throws(
      () => validateWallet(walletDir, ['app_low']),
      /missing ewallet\.pem.*cwallet\.sso is present but is not a Thin-mode wallet format/,
    );
  });

  it('accepts an encrypted ewallet.pem with the correct wallet password', () => {
    writeWallet({ pem: false });
    writeFileSync(join(walletDir, 'ewallet.pem'), encryptedPem('right-password'));

    assert.doesNotThrow(() => validateWallet(walletDir, ['app_low'], 'right-password'));
  });

  it('rejects a wallet password that does not decrypt ewallet.pem', () => {
    writeWallet({ pem: false });
    writeFileSync(join(walletDir, 'ewallet.pem'), encryptedPem('right-password'));

    assert.throws(
      () => validateWallet(walletDir, ['app_low'], 'wrong-password'),
      /^Error: Oracle wallet password does not decrypt ewallet.pem$/,
    );
  });

  it('reports aliases that tnsnames.ora does not define', () => {
    writeWallet();

    assert.throws(
      () => validateWallet(walletDir, ['app_low', 'app_medium']),
      /aliases not defined in tnsnames\.ora: app_medium$/,
    );
  });
});
