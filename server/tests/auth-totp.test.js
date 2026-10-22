import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMfaKeyring, MfaSecretUnreadable } from '../src/modules/auth/mfaSecret.js';
import { base32Encode, hotp, otpauthUri, timeStep, verifyTotp } from '../src/modules/auth/totp.js';

// Pure cryptography; no database or HTTP involved.

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP primitives', () => {
  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922'];
    expected.forEach((code, counter) => assert.equal(hotp(RFC_SECRET, counter), code));
  });

  it('matches the RFC 6238 SHA-1 TOTP test vectors (8 digits)', () => {
    const vectors = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [seconds, code] of vectors) {
      assert.equal(hotp(RFC_SECRET, timeStep(seconds * 1000), 8), code);
    }
  });

  it('encodes base32 per RFC 4648 without padding', () => {
    assert.equal(base32Encode(Buffer.from('f')), 'MY');
    assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
    assert.equal(base32Encode(Buffer.alloc(20)).length, 32);
  });

  it('accepts the current step and ±1 step, and nothing further', () => {
    const now = 1_800_000_000_000;
    const step = timeStep(now);
    for (const drift of [-1, 0, 1]) {
      assert.deepEqual(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + drift), now, null), {
        status: 'MATCH',
        step: step + drift,
      });
    }
    for (const drift of [-2, 2]) {
      assert.equal(
        verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + drift), now, null).status,
        'INVALID',
      );
    }
    assert.equal(verifyTotp(RFC_SECRET, '000000', now, null).status, 'INVALID');
  });

  it('refuses a step at or before the last accepted step as a replay', () => {
    const now = 1_800_000_000_000;
    const step = timeStep(now);
    const code = hotp(RFC_SECRET, step);

    assert.equal(verifyTotp(RFC_SECRET, code, now, step).status, 'REPLAY');
    assert.equal(verifyTotp(RFC_SECRET, code, now, step + 1).status, 'REPLAY');
    assert.equal(verifyTotp(RFC_SECRET, code, now, step - 1).status, 'MATCH');
  });

  it('builds an otpauth URI in the Key Uri Format', () => {
    const uri = new URL(
      otpauthUri({ issuer: 'Zamil Digitalization', accountName: 'zaid.s', secret: RFC_SECRET }),
    );

    assert.equal(uri.protocol, 'otpauth:');
    assert.equal(uri.host, 'totp');
    // Issuer and account are encoded separately around a literal colon (Key Uri Format).
    assert.ok(
      otpauthUri({
        issuer: 'Zamil Digitalization',
        accountName: 'a:b c',
        secret: RFC_SECRET,
      }).startsWith('otpauth://totp/Zamil%20Digitalization:a%3Ab%20c?'),
    );
    assert.equal(decodeURIComponent(uri.pathname), '/Zamil Digitalization:zaid.s');
    assert.equal(uri.searchParams.get('secret'), base32Encode(RFC_SECRET));
    assert.equal(uri.searchParams.get('issuer'), 'Zamil Digitalization');
    assert.equal(uri.searchParams.get('algorithm'), 'SHA1');
    assert.equal(uri.searchParams.get('digits'), '6');
    assert.equal(uri.searchParams.get('period'), '30');
  });
});

describe('TOTP secret protection', () => {
  const key = Buffer.alloc(32, 3);
  const keyring = createMfaKeyring({ encryptionKey: key, keyId: 'k1' });
  const secret = Buffer.alloc(20, 5);

  it('round-trips with a fresh IV and fits the column', () => {
    const first = keyring.encrypt('1', secret);
    const second = keyring.encrypt('1', secret);

    assert.notEqual(first, second);
    assert.match(first, /^v1\.k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.ok(first.length <= 1024, 'fits MFA_TOTP_SECRET_ENCRYPTED VARCHAR2(1024)');
    assert.ok(!first.includes(base32Encode(secret)) && !first.includes(secret.toString('base64')));
    assert.deepEqual(keyring.decrypt('1', first), secret);
  });

  it('refuses another account, tampering, another key and unknown formats', () => {
    const stored = keyring.encrypt('1', secret);
    const parts = stored.split('.');
    const flip = (part) => (part[0] === 'A' ? 'B' : 'A') + part.slice(1);
    const otherKey = createMfaKeyring({ encryptionKey: Buffer.alloc(32, 4), keyId: 'k1' });
    const otherKeyId = createMfaKeyring({ encryptionKey: key, keyId: 'k2' });

    const attempts = [
      () => keyring.decrypt('2', stored),
      () => keyring.decrypt('1', [...parts.slice(0, 3), flip(parts[3]), parts[4]].join('.')),
      () => keyring.decrypt('1', [...parts.slice(0, 4), flip(parts[4])].join('.')),
      () => otherKey.decrypt('1', stored),
      () => otherKeyId.decrypt('1', stored),
      () => keyring.decrypt('1', 'plain-secret'),
      () => keyring.decrypt('1', null),
    ];
    for (const attempt of attempts) assert.throws(attempt, MfaSecretUnreadable);
  });

  it('derives a stable 20-byte enrollment secret per user and challenge', () => {
    const a = keyring.enrollmentSecret('1', '5000');

    assert.equal(a.length, 20);
    assert.deepEqual(keyring.enrollmentSecret('1', '5000'), a);
    assert.notDeepEqual(keyring.enrollmentSecret('1', '5001'), a);
    assert.notDeepEqual(keyring.enrollmentSecret('2', '5000'), a);
    const otherKey = createMfaKeyring({ encryptionKey: Buffer.alloc(32, 4), keyId: 'k1' });
    assert.notDeepEqual(otherKey.enrollmentSecret('1', '5000'), a);
  });

  it('derives replacement candidates under a separate purpose, bound to session and stored secret', () => {
    const stored = keyring.encrypt('1', secret);
    const candidate = keyring.replacementSecret('1', '5000', stored);

    assert.equal(candidate.length, 20);
    assert.deepEqual(keyring.replacementSecret('1', '5000', stored), candidate);
    assert.notDeepEqual(keyring.enrollmentSecret('1', '5000'), candidate, 'separate purpose');
    assert.notDeepEqual(keyring.replacementSecret('1', '5001', stored), candidate, 'per session');
    assert.notDeepEqual(keyring.replacementSecret('2', '5000', stored), candidate, 'per user');
    assert.notDeepEqual(
      keyring.replacementSecret('1', '5000', keyring.encrypt('1', secret)),
      candidate,
      'changes with the stored ciphertext',
    );
  });

  it('requires a 32-byte key', () => {
    assert.throws(
      () => createMfaKeyring({ encryptionKey: Buffer.alloc(16), keyId: 'k1' }),
      /32 bytes/,
    );
    assert.throws(() => createMfaKeyring({ encryptionKey: null, keyId: 'k1' }), /32 bytes/);
  });
});
