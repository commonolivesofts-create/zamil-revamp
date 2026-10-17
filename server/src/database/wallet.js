import { createPrivateKey } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TNS_ALIAS = /^([A-Za-z0-9_.-]+)\s*=/gm;
const ENCRYPTED_KEY =
  /-----BEGIN ENCRYPTED PRIVATE KEY-----[\s\S]+?-----END ENCRYPTED PRIVATE KEY-----/;

/**
 * Verifies that a wallet directory is usable by node-oracledb Thin mode, defines the
 * required aliases and can be decrypted with the configured wallet password. Errors
 * name the failing item only; wallet contents are never echoed.
 */
export function validateWallet(walletDir, aliases, walletPassword) {
  if (!walletDir || !existsSync(walletDir) || !statSync(walletDir).isDirectory()) {
    throw new Error(`Oracle wallet directory not found: ${walletDir}`);
  }

  const tnsnamesPath = join(walletDir, 'tnsnames.ora');
  if (!existsSync(tnsnamesPath)) {
    throw new Error('Oracle wallet is missing tnsnames.ora');
  }

  const pemPath = join(walletDir, 'ewallet.pem');
  if (!existsSync(pemPath)) {
    const hint = existsSync(join(walletDir, 'cwallet.sso'))
      ? '; cwallet.sso is present but is not a Thin-mode wallet format'
      : '';
    throw new Error(`Oracle wallet is missing ewallet.pem required by Thin mode${hint}`);
  }

  const defined = new Set(
    [...readFileSync(tnsnamesPath, 'utf8').matchAll(TNS_ALIAS)].map(([, alias]) =>
      alias.toLowerCase(),
    ),
  );
  const missing = aliases.filter((alias) => !defined.has(alias.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Oracle aliases not defined in tnsnames.ora: ${missing.join(', ')}`);
  }

  // A wrong wallet password makes Thin-mode TLS stall well past connectTimeout before
  // failing (NJS-505), so it is detected locally instead.
  const encryptedKey = readFileSync(pemPath, 'utf8').match(ENCRYPTED_KEY)?.[0];
  if (encryptedKey) {
    try {
      createPrivateKey({ key: encryptedKey, passphrase: walletPassword ?? '' });
    } catch {
      throw new Error('Oracle wallet password does not decrypt ewallet.pem');
    }
  }
}
