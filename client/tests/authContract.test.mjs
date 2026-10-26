import test from 'node:test'
import assert from 'node:assert/strict'
import { readCsrfToken, readCurrentUser, readLoginResult } from '../src/features/auth/authContract.js'
import {
  CHALLENGE_TOKEN, SESSION_TOKEN, authUser, currentUser, loginResult, mfaChallenge,
} from './helpers/http.mjs'

test('a successful login contract yields an authenticated result with the session CSRF token', () => {
  const result = readLoginResult(loginResult({ user: { ...authUser, passwordHash: 'x', role: 'ADMIN' } }))
  assert.equal(result.authenticated, true)
  assert.equal(result.csrfToken, SESSION_TOKEN)
  assert.deepEqual(result.user, authUser, 'undocumented fields are dropped')
  assert.equal(result.session.idleTimeoutSeconds, 1800)
  assert.equal(result.password.expired, false)
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.user))
})

test('an MFA challenge never yields a user, session or session token', () => {
  const result = readLoginResult(mfaChallenge({ user: authUser, session: {} }))
  assert.equal(result.authenticated, false)
  assert.deepEqual(result.mfa, { enrollmentRequired: false, expiresAt: '2026-10-21T08:10:00.000Z' })
  assert.equal(result.challengeCsrfToken, CHALLENGE_TOKEN)
  assert.equal('user' in result, false)
  assert.equal('session' in result, false)
  assert.equal('csrfToken' in result, false)
})

test('ambiguous or malformed login responses are rejected', () => {
  for (const data of [
    null,
    {},
    loginResult({ authenticated: 'true' }),
    loginResult({ authenticated: 1 }),
    loginResult({ csrf: undefined }),
    loginResult({ csrf: { token: SESSION_TOKEN, headerName: 'X-XSRF-Token' } }),
    loginResult({ csrf: { token: 'has space', headerName: 'X-CSRF-Token' } }),
    loginResult({ csrf: { token: 'line\nbreak', headerName: 'X-CSRF-Token' } }),
    loginResult({ user: { ...authUser, id: 105 } }),
    loginResult({ session: { expiresAt: 'soon', idleTimeoutSeconds: 1800, mfaVerified: false } }),
    mfaChallenge({ mfa: { required: false, enrollmentRequired: false, expiresAt: '2026-10-21T08:10:00Z' } }),
    mfaChallenge({ csrf: undefined }),
  ]) {
    assert.throws(() => readLoginResult(data), { code: 'INVALID_RESPONSE' }, JSON.stringify(data))
  }
})

test('current-user and CSRF contracts are validated', () => {
  assert.deepEqual(readCurrentUser(currentUser()).user, authUser)
  assert.throws(() => readCurrentUser({ authenticated: true, user: authUser }), { code: 'INVALID_RESPONSE' })
  assert.equal(readCsrfToken({ token: 'abc', headerName: 'X-CSRF-Token' }), 'abc')
  assert.throws(() => readCsrfToken({ token: '', headerName: 'X-CSRF-Token' }), { code: 'INVALID_RESPONSE' })
})

test('an optional avatar path is kept only when it is same-origin', () => {
  const withAvatar = (avatarUrl) => readCurrentUser({
    ...currentUser(),
    user: { ...authUser, avatarUrl },
  }).user

  assert.equal(withAvatar('/avatars/2502.png').avatarUrl, '/avatars/2502.png')
  assert.equal(withAvatar('/api/v1/users/2502/avatar?v=2').avatarUrl,
    '/api/v1/users/2502/avatar?v=2')
  assert.equal('avatarUrl' in readCurrentUser(currentUser()).user, false)
  for (const avatarUrl of [
    'javascript:alert(1)',
    'https://cdn.example.com/avatars/2502.png',
    'http://cdn.example.com/avatars/2502.png',
    '//cdn.example.com/avatars/2502.png',
    'data:image/png;base64,AAAA',
    'C:\\avatars\\2502.png',
    '',
    null,
    42,
  ]) {
    assert.equal('avatarUrl' in withAvatar(avatarUrl), false, String(avatarUrl))
  }
})
