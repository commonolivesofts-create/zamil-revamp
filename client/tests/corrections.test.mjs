// Regression tests for the Stage 1 audit corrections #1–#5.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { MFA_CODE_PATTERN, sanitizeMfaCode } from '../src/features/auth/authContract.js'
import { createDeferredFocus } from '../src/features/auth/focusWhenEnabled.js'
import { captureLink, forgetToken, isNewLink, readLinkToken } from '../src/features/auth/linkToken.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
// Test-only tokens in the backend format (43 URL-safe characters).
const TOKEN_A = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE'
const TOKEN_B = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-ZyXwV'

// ------------------------------------------------------------ #1 focus after API errors

const fakeElement = (disabled = false) => ({ disabled, focused: 0, focus() { this.focused += 1 } })

test('#1 a focus request made while the form is pending runs once it is enabled', () => {
  const field = fakeElement(true)
  const deferred = createDeferredFocus()
  deferred.request({ current: field })
  assert.equal(deferred.flush(true), false, 'still pending: nothing focused')
  field.disabled = false
  assert.equal(deferred.flush(false), true)
  assert.equal(field.focused, 1)
  assert.equal(deferred.flush(false), false, 'a request is used only once')
  assert.equal(field.focused, 1)
})

test('#1 deferred focus skips fields that are gone or still disabled', () => {
  const deferred = createDeferredFocus()
  deferred.request({ current: null }) // unmounted / step changed
  assert.equal(deferred.flush(false), false)
  const stillDisabled = fakeElement(true)
  deferred.request({ current: stillDisabled })
  assert.equal(deferred.flush(false), false)
  assert.equal(stillDisabled.focused, 0)
  assert.equal(createDeferredFocus().flush(false), false, 'no request, no focus')
})

test('#1 the six forms no longer focus a disabled field inside a catch block', async () => {
  for (const file of [
    '../src/pages/auth/MfaChallengePage.jsx', '../src/pages/auth/MfaEnrollmentPage.jsx',
    '../src/pages/auth/MfaReplacementPage.jsx', '../src/pages/auth/ChangePasswordPage.jsx',
    '../src/features/auth/PasswordLinkForm.jsx', '../src/pages/auth/MfaRecoveryPage.jsx',
  ]) {
    const source = await read(file)
    assert.match(source, /const focusLater = useFocusWhenEnabled\(pending\)/, file)
    const catchBlocks = [...source.matchAll(/catch \(failure\) \{([\s\S]*?)\} finally \{/g)].map((m) => m[1])
    assert.ok(catchBlocks.length > 0, file)
    for (const block of catchBlocks) {
      assert.equal(/Ref\.current\?\.focus\(\)/.test(block), false, `${file} focuses directly in catch`)
    }
    assert.equal(/requestAnimationFrame\(\(\) => (?!alertRef)/.test(source), false, `${file} uses a timer to focus a field`)
  }
})

// ------------------------------------------------------------ #2 MFA code paste

test('#2 pasted and typed MFA codes are sanitised whole, then limited to six digits', () => {
  for (const [input, expected] of [
    ['012345', '012345'],
    ['123 456', '123456'],
    ['a0b1c2d3e4f5g6', '012345'],
    ['12345678', '123456'],
    ['000000', '000000'],
    [' 0 1-2 3.4 5 ', '012345'],
    ['١٢٣٤٥٦', ''], // only ASCII digits are accepted, as by the backend
    ['abc', ''],
    ['', ''],
  ]) {
    assert.equal(sanitizeMfaCode(input), expected, JSON.stringify(input))
  }
  assert.equal(MFA_CODE_PATTERN.test(sanitizeMfaCode('12 34')), false, 'fewer than six digits still fails validation')
})

test('#2 the code input no longer truncates before sanitising', async () => {
  const fields = await read('../src/features/auth/MfaFields.jsx')
  assert.equal(/maxLength=\{6\}/.test(fields), false)
  assert.match(fields, /onChange=\{\(event\) => onChange\(sanitizeMfaCode\(event\.target\.value\)\)\}/)
  assert.match(fields, /inputMode="numeric"/)
  assert.match(fields, /autoComplete="one-time-code"/)
})

// ------------------------------------------------------------ #3 same-tab link navigation

test('#3 a second link opened in the same tab is captured; fragment removal is not', () => {
  const first = captureLink({ key: 'default', hash: `#token=${TOKEN_A}` })
  assert.equal(first.token, TOKEN_A)
  assert.equal(isNewLink(first, { key: 'default', hash: `#token=${TOKEN_A}` }), false, 'same navigation')
  assert.equal(isNewLink(first, { key: 'k2', hash: '' }), false, 'fragment removal (replace) is not a new link')
  const second = { key: 'k3', hash: `#token=${TOKEN_B}` }
  assert.equal(isNewLink(first, second), true)
  assert.equal(captureLink(second).token, TOKEN_B)
  assert.notEqual(captureLink(second).id, first.id, 'a new link gets a new form key')
})

test('#3 a fragment-only navigation with the router\'s same "default" key is still a new link', () => {
  // Found in the browser: an entry created by a fragment navigation has no
  // history state, so React Router reports key "default" for it as well.
  const opened = captureLink({ key: 'default', hash: '' })
  assert.equal(isNewLink(opened, { key: 'default', hash: `#token=${TOKEN_A}` }), true)
  const a = captureLink({ key: 'default', hash: `#token=${TOKEN_A}` })
  assert.equal(isNewLink(a, { key: 'default', hash: `#token=${TOKEN_B}` }), true)
  assert.equal(isNewLink(a, { key: 'default', hash: `#token=${TOKEN_A}` }), false, 'no loop on re-render')
  assert.equal(isNewLink(a, { key: 'x1', hash: '' }), false, 'fragment removal')
})

test('#3 malformed fragments, refreshes and stale clears', () => {
  const malformed = captureLink({ key: 'k1', hash: '#token=abc' })
  assert.deepEqual([malformed.token, malformed.hadFragment], [null, true])
  const refreshed = captureLink({ key: 'default', hash: '' })
  assert.deepEqual([refreshed.token, refreshed.hadFragment], [null, false], 'refresh after removal: no token')
  assert.deepEqual(readLinkToken(`#token=${TOKEN_A}&token=${TOKEN_B}`), { token: null, hadFragment: true })

  const current = captureLink({ key: 'k3', hash: `#token=${TOKEN_B}` })
  assert.equal(forgetToken(current, TOKEN_A), current, 'a late response for link A cannot clear link B')
  assert.equal(forgetToken(current, TOKEN_B).token, null)
  assert.equal(forgetToken(forgetToken(current, TOKEN_B), null).token, null)
})

test('#3 link pages key their flow on the captured link and clear only their own token', async () => {
  const hook = await read('../src/features/auth/useLinkToken.js')
  assert.match(hook, /if \(isNewLink\(captured, location\)\) setCaptured\(captureLink\(location\)\)/)
  assert.match(hook, /navigate\(\{ pathname: location\.pathname, search: location\.search \}, \{ replace: true, state: null \}\)/)
  for (const file of ['../src/features/auth/PasswordLinkForm.jsx', '../src/pages/auth/MfaRecoveryPage.jsx']) {
    const source = await read(file)
    assert.match(source, /key=\{link\.linkKey\}/, file)
    assert.match(source, /const clearToken = \(\) => link\.clearToken\(token\)/, file)
  }
})

// ------------------------------------------------------------ #4 login focus and visibility

test('#4 login focuses the first invalid field and reuses the shared password input', async () => {
  const login = await read('../src/pages/auth/LoginPage.jsx')
  assert.match(login, /if \(errors\.username\) return usernameRef\.current\?\.focus\(\)\s*\n\s*if \(errors\.password\) return passwordRef\.current\?\.focus\(\)/)
  assert.match(login, /<input ref=\{usernameRef\} id="auth-username"/)
  assert.match(login, /<PasswordInput\s+ref=\{passwordRef\}\s+id="auth-password"\s+label="Password"/)
  assert.match(login, /autoComplete="current-password"/)
  assert.match(login, /signIn\(\{ username: username\.trim\(\), password \}\)/, 'payload unchanged; password not trimmed')
  const fields = await read('../src/features/auth/PasswordFields.jsx')
  assert.match(fields, /\{label\}\{labelAddon && <> \{labelAddon\}<\/>\}/)
})

// ------------------------------------------------------------ #5 panel spacing

test('#5 account panels space consecutive fields like the login form, not the first one', async () => {
  const css = await read('../src/styles/auth.css')
  assert.match(css, /\.zrv-mfa-panel \.field\+\.field,\.zrv-mfa-panel \.zrv-policy-list\+\.field\{margin-top:16px\}/)
  assert.equal(/\.zrv-mfa-panel \.field\{/.test(css), false, 'no spacing before the first field')
})
