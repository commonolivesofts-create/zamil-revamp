import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, before, describe, it } from 'node:test';
import { createMfaKeyring } from '../src/modules/auth/mfaSecret.js';
import { hotp, timeStep } from '../src/modules/auth/totp.js';
import { config } from '../src/config/index.js';
import { main, parseArgs } from '../scripts/mfa-test-flow.js';
import {
  addActiveAccount,
  createAuthStore,
  createTestApp,
  TEST_MFA_KEY,
} from './helpers/authFakes.js';

// Drives the operator MFA tool against an in-process API (in-memory repositories) on loopback.
// No Oracle access; proves the procedure before the controlled TEST run.

const PASSWORD = 'Correct-Horse1!';

function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of text) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Fake TTY; an answer may be a function of the output so far (e.g. to read the setup key). */
function createTerminal(answers) {
  const input = new EventEmitter();
  const queue = [...answers];
  let output = '';
  Object.assign(input, {
    isTTY: true,
    setRawMode() {},
    setEncoding() {},
    pause() {},
    resume() {
      const next = queue.shift();
      if (next === undefined) return;
      setImmediate(() =>
        input.emit('data', `${typeof next === 'function' ? next(output) : next}\r`),
      );
    },
  });
  return { io: { input, output: { write: (text) => (output += text) } }, output: () => output };
}

describe('operator MFA test tool', () => {
  let server;
  let port;
  let store;

  before(async () => {
    store = createAuthStore();
    await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'zaid.s', employeeNumber: '2172' },
    });
    const app = createTestApp(store, { mfa: { encryptionKey: TEST_MFA_KEY } });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    port = server.address().port;
  });
  after(() => server.close());

  it('accepts only a port and always targets loopback', () => {
    assert.deepEqual(parseArgs([]), {
      baseUrl: 'http://127.0.0.1:3000/api/v1/auth',
      replace: false,
    });
    assert.deepEqual(parseArgs(['--port=4100', '--replace']), {
      baseUrl: 'http://127.0.0.1:4100/api/v1/auth',
      replace: true,
    });
    assert.throws(() => parseArgs(['--password=x']), /Only --port/);
    assert.throws(() => parseArgs(['--port=3000@evil']), /Only --port/);
  });

  it('enrolls, verifies the session, logs out, then signs in again with /mfa/verify', async () => {
    let secret;
    const enrollmentCode = (output) => {
      secret = base32Decode(/Setup key:\s+([A-Z2-7 ]+)/.exec(output)[1].replaceAll(' ', ''));
      return hotp(secret, timeStep(store.now().getTime()));
    };
    const nextStepCode = () => {
      store.advance(30 * 1000);
      return hotp(secret, timeStep(store.now().getTime()));
    };
    const terminal = createTerminal([
      'zaid.s',
      PASSWORD,
      enrollmentCode,
      'Y',
      'y',
      'zaid.s',
      PASSWORD,
      nextStepCode,
      'Y',
    ]);

    const exitCode = await main({ argv: [`--port=${port}`], io: terminal.io });
    const output = terminal.output();

    assert.equal(exitCode, 0, output);
    assert.match(output, /Authenticator enrolled and MFA-verified session issued/);
    assert.match(output, /MFA verified and session issued/);
    assert.equal(output.match(/mfaVerified=true, idleTimeoutSeconds=900/g).length, 2);
    assert.equal(output.match(/\/csrf: matches the session/g).length, 2);
    assert.equal(output.match(/Logout: HTTP 204/g).length, 2);
    assert.equal(output.match(/after logout: HTTP 401 UNAUTHENTICATED/g).length, 2);
    assert.equal(output.match(/Setup key:/g).length, 1, 'setup key shown only at enrollment');

    assert.ok(!output.includes(PASSWORD), 'password never echoed');
    assert.doesNotMatch(output, /\(hidden\): \S/, 'codes and password never echoed');
    assert.match(output, /Issuer: {7}Zamil Revamp\n {2}Account name: zaid\.s\n/);
    assert.match(output, /Never copy it into a chat/);
    assert.ok(!/zr_session=|zr_mfa=/.test(output), 'cookies never printed');
    const [, second] = store.state.sessions.filter((session) => session.mfaVerifiedAt);
    assert.ok(second, 'two MFA-verified sessions');
    assert.ok(
      store.state.sessions.every((session) => session.revokedAt),
      'all sessions ended',
    );
  });

  it('--replace: replaces the authenticator, revokes sessions, and signs in with the new one', async () => {
    const replaceStore = createAuthStore();
    const { user } = await addActiveAccount(replaceStore, {
      password: PASSWORD,
      employee: { username: 'zaid.s', employeeNumber: '2172' },
    });
    const keyring = createMfaKeyring({ encryptionKey: TEST_MFA_KEY, keyId: config.auth.mfa.keyId });
    const oldSecret = Buffer.alloc(20, 31);
    Object.assign(replaceStore.user(user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(user.userId, oldSecret),
      mfaEnrolledAt: replaceStore.now(),
    });
    const replaceApp = createTestApp(replaceStore, { mfa: { encryptionKey: TEST_MFA_KEY } });
    const replaceServer = await new Promise((resolve) => {
      const listening = replaceApp.listen(0, '127.0.0.1', () => resolve(listening));
    });

    let newSecret;
    const codeFor = (secret) => hotp(secret, timeStep(replaceStore.now().getTime()));
    const terminal = createTerminal([
      'zaid.s',
      PASSWORD,
      () => codeFor(oldSecret),
      (output) => {
        newSecret = base32Decode(/Setup key:\s+([A-Z2-7 ]+)/.exec(output)[1].replaceAll(' ', ''));
        return codeFor(newSecret);
      },
      'zaid.s',
      PASSWORD,
      () => {
        replaceStore.advance(30 * 1000);
        return codeFor(newSecret);
      },
    ]);

    try {
      const exitCode = await main({
        argv: [`--port=${replaceServer.address().port}`, '--replace'],
        io: terminal.io,
      });
      const output = terminal.output();

      assert.equal(exitCode, 0, output);
      assert.match(output, /Authenticator replaced; \d+ session\(s\)\/challenge\(s\) revoked/);
      assert.match(output, /\/me with the old session: HTTP 401 UNAUTHENTICATED/);
      assert.match(output, /mfaVerified=true, idleTimeoutSeconds=900/);
      assert.match(output, /Logout: HTTP 204/);
      assert.match(output, /delete the OLD entry/);
      assert.doesNotMatch(output, /\(hidden\): \S/, 'codes never echoed');
      assert.ok(!output.includes(PASSWORD));

      const stored = replaceStore.user(user.userId).mfaTotpSecretEncrypted;
      assert.deepEqual(keyring.decrypt(user.userId, stored), newSecret);
      assert.ok(!newSecret.equals(oldSecret));
      assert.ok(replaceStore.state.sessions.every((session) => session.revokedAt));
    } finally {
      replaceServer.close();
    }
  });
});
