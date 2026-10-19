import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkPasswordPolicy,
  hashPassword,
  parseArgon2idHash,
  verifyPassword,
} from '../src/modules/auth/password.js';
import { TEST_ARGON2_COST } from './helpers/authFakes.js';

// Produced by PHP 8.2 password_hash(..., PASSWORD_ARGON2ID) for the synthetic password below,
// proving interoperability with an independent Argon2id implementation. Not a real credential.
const INTEROP_PASSWORD = 'Interop-Test-Pass1!';
const PHP_HASHES = [
  '$argon2id$v=19$m=19456,t=2,p=1$RnVWSjZPcXR4SmxqZWlhUg$Nmzrv0vGcc+VOb4WcqfCrHT6Lo3+2RQFewM72+nOLBM',
  '$argon2id$v=19$m=65536,t=4,p=1$U2tmTktNYkR3NmJGYjJocw$T5QZoWwmk7WPpYrd/9XrsCYrFKBFn8rNNR79cxCQ2/M',
];

describe('Argon2id password hashing', () => {
  it('produces a PHC string with the configured cost and a random salt', async () => {
    const cost = { memoryKiB: 19456, passes: 2, parallelism: 1 };
    const first = await hashPassword('Correct-Horse1!', cost);
    const second = await hashPassword('Correct-Horse1!', cost);

    assert.match(
      first,
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    assert.notEqual(first, second);
    assert.ok(first.length <= 255, 'fits XX_ZRV_USERS.PASSWORD_HASH VARCHAR2(255)');
  });

  it('verifies the correct password and rejects others', async () => {
    const hash = await hashPassword('Correct-Horse1!', TEST_ARGON2_COST);

    assert.equal(await verifyPassword('Correct-Horse1!', hash), 'MATCH');
    assert.equal(await verifyPassword('correct-horse1!', hash), 'MISMATCH');
    assert.equal(await verifyPassword('Correct-Horse1! ', hash), 'MISMATCH');
  });

  it('verifies hashes produced by PHP password_hash (PASSWORD_ARGON2ID)', async () => {
    for (const hash of PHP_HASHES) {
      assert.equal(await verifyPassword(INTEROP_PASSWORD, hash), 'MATCH');
      assert.equal(await verifyPassword('Interop-Test-Pass1?', hash), 'MISMATCH');
    }
  });

  it('fails closed on unsupported or out-of-bounds stored values', async () => {
    const valid = await hashPassword('x', TEST_ARGON2_COST);
    const unreadable = [
      null,
      '',
      'plaintext-password',
      '$2y$10$abcdefghijklmnopqrstuuJ0nD8bP7lRvx7E3h8q9cW0o1yQ2r3s',
      valid.replace('$argon2id$', '$argon2i$'),
      valid.replace('v=19', 'v=16'),
      valid.replace('m=19456', 'm=4194304'),
      valid.replace('t=2', 't=100'),
      // 4-byte salt, below the 8-byte minimum.
      valid.replace(/\$[^$]+\$([^$]+)$/, (_match, hash) => `$c2FsdA$${hash}`),
      `${valid}$extra`,
    ];

    for (const value of unreadable) {
      assert.equal(parseArgon2idHash(value), null, String(value));
      assert.equal(await verifyPassword('x', value), 'UNREADABLE', String(value));
    }
  });
});

describe('Argon2id approved minimum (Decision 05)', () => {
  const b64 = (bytes) => Buffer.alloc(bytes, 1).toString('base64').replace(/=+$/, '');

  it('creates hashes with a 16-byte salt and a 32-byte tag at the approved cost', async () => {
    const parsed = parseArgon2idHash(await hashPassword('Correct-Horse1!', TEST_ARGON2_COST));

    assert.equal(parsed.salt.length, 16);
    assert.equal(parsed.hash.length, 32);
    assert.equal(parsed.memoryKiB, 19456);
    assert.equal(parsed.passes, 2);
    assert.equal(parsed.parallelism, 1);
  });

  it('refuses to create a hash below the approved cost', async () => {
    const below = [
      { memoryKiB: 19455, passes: 2, parallelism: 1 },
      { memoryKiB: 19456, passes: 1, parallelism: 1 },
      { memoryKiB: 19456, passes: 2, parallelism: 0 },
    ];
    for (const cost of below) {
      await assert.rejects(hashPassword('Correct-Horse1!', cost), /below the approved minimum/);
    }
  });

  it('refuses to verify stored hashes below any minimum, without deriving', async () => {
    const weak = [
      `$argon2id$v=19$m=19455,t=2,p=1$${b64(16)}$${b64(32)}`,
      `$argon2id$v=19$m=19456,t=1,p=1$${b64(16)}$${b64(32)}`,
      `$argon2id$v=19$m=19456,t=2,p=1$${b64(8)}$${b64(32)}`,
      `$argon2id$v=19$m=19456,t=2,p=1$${b64(16)}$${b64(16)}`,
    ];
    for (const value of weak) {
      assert.notEqual(parseArgon2idHash(value), null, 'well-formed');
      assert.equal(await verifyPassword('x', value), 'BELOW_MINIMUM', value);
    }
  });

  it('accepts stronger stored hashes without requiring the configured cost', async () => {
    // PHP default: m=65536, t=4.
    assert.equal(await verifyPassword(INTEROP_PASSWORD, PHP_HASHES[1]), 'MATCH');
  });
});

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    assert.deepEqual(checkPasswordPolicy('Abcdef1!'), []);
    assert.deepEqual(checkPasswordPolicy('Ünïcödé pass 9'), []);
  });

  it('reports each unmet rule', () => {
    assert.deepEqual(checkPasswordPolicy('Ab1!'), ['MIN_LENGTH']);
    assert.deepEqual(checkPasswordPolicy('abcdefg1!'), ['UPPERCASE']);
    assert.deepEqual(checkPasswordPolicy('ABCDEFG1!'), ['LOWERCASE']);
    assert.deepEqual(checkPasswordPolicy('Abcdefgh!'), ['DIGIT']);
    assert.deepEqual(checkPasswordPolicy('Abcdefgh1'), ['SPECIAL_CHARACTER']);
    assert.ok(checkPasswordPolicy(`Aa1!${'x'.repeat(125)}`).includes('MAX_LENGTH'));
    assert.equal(checkPasswordPolicy(undefined).length, 5);
  });
});
