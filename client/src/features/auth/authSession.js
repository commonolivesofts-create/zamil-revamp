// Framework-free authentication state, bound to React by AuthProvider through
// useSyncExternalStore. Kept outside React so race handling is testable with
// the Node-native test runner.
//
// Statuses: preview | loading | guest | authenticated | mfa_required | error.
// Only a validated `authenticated: true` login, a backend-confirmed MFA
// verification or enrollment, or a restored session (GET /auth/me then GET
// /auth/csrf) becomes `authenticated`. An MFA challenge is `mfa_required`: no
// user, no session, only the challenge CSRF token in memory.
// The challenge token stays in memory until the challenge ends: verification,
// a new sign-in, cancellation, sign-out, a backend MFA_CHALLENGE_INVALID or the
// challenge's own expiresAt. Each challenge has an identity, so a late response
// or timer from an ended challenge never affects a newer challenge or session.
// `notice` explains a transition to guest: 'session_expired', 'mfa_expired',
// 'mfa_invalid', 'mfa_replaced', 'password_changed' or 'signout_unconfirmed'
// (local state cleared but the backend did not confirm).
// MFA setup secrets are returned to the calling page and never kept here.
import { ApiError } from '../../services/api/apiClient.js'
import { LINK_TOKEN_PATTERN, MFA_CODE_PATTERN } from './authContract.js'

const RECOVERY_PURPOSES = new Set(['PASSWORD_RESET', 'MFA_RECOVERY'])

function authState(status, fields = {}) {
  return Object.freeze({ status, user: null, session: null, password: null, mfa: null, notice: null, ...fields })
}

const previewError = () => new ApiError('This action is unavailable in development preview.', { code: 'PREVIEW_MODE' })
const supersededError = () => new ApiError('The request was superseded.', { code: 'ABORTED' })
const inProgressError = () => new ApiError('Verification is already in progress.', { code: 'IN_PROGRESS' })

function assertCode(code) {
  if (typeof code !== 'string' || !MFA_CODE_PATTERN.test(code)) {
    throw new ApiError('Enter the 6-digit code from your authenticator app.', { code: 'VALIDATION_ERROR' })
  }
}

export function createAuthSession({ service, csrfStore, subscribeUnauthorized, preview = false }) {
  let snapshot = authState(preview ? 'preview' : 'loading')
  const listeners = new Set()
  // A late response must never apply after logout, an API 401, or a newer
  // operation. Aborting also handles React Strict Mode effect cleanup.
  let revision = 0
  let active = null
  let unsubscribeUnauthorized = null
  let challengeTimer = null
  let challengeSequence = 0
  let challengeId = 0 // 0 while no challenge is pending.
  let codeSubmission = false
  let passwordSubmission = false

  function clearChallengeTimer() {
    if (challengeTimer !== null) clearTimeout(challengeTimer)
    challengeTimer = null
  }

  // Leaving mfa_required always ends the challenge and its expiry timer.
  function set(next) {
    if (next.status !== 'mfa_required') {
      challengeId = 0
      clearChallengeTimer()
    }
    snapshot = next
    for (const listener of listeners) listener()
  }

  function beginChallenge(mfa, challengeCsrfToken) {
    clearChallengeTimer()
    const id = ++challengeSequence
    csrfStore.setChallengeToken(challengeCsrfToken)
    set(authState('mfa_required', { mfa }))
    challengeId = id
    challengeTimer = setTimeout(() => {
      challengeTimer = null
      if (challengeId === id) endChallenge('mfa_expired')
    }, Math.max(0, Date.parse(mfa.expiresAt) - Date.now()))
  }

  function endChallenge(notice) {
    invalidate()
    csrfStore.clear()
    set(authState('guest', { notice }))
  }

  function invalidate() {
    revision += 1
    active?.abort()
    active = null
    return revision
  }

  function begin() {
    const current = invalidate()
    const controller = new AbortController()
    active = controller
    return { current, controller, isCurrent: () => current === revision && !controller.signal.aborted }
  }

  function finish(controller) {
    if (active === controller) active = null
  }

  async function restore() {
    if (preview) return
    const { controller, isCurrent } = begin()
    csrfStore.clear()
    if (snapshot.status !== 'loading') set(authState('loading'))
    try {
      const current = await service.getCurrentUser({ signal: controller.signal })
      if (!isCurrent()) return
      const token = await service.getCsrfToken({ signal: controller.signal })
      if (!isCurrent()) return
      csrfStore.setSessionToken(token)
      set(authState('authenticated', current))
    } catch (error) {
      if (!isCurrent()) return
      csrfStore.clear()
      // 401 means no valid session; anything else is an unverified state.
      set(authState(error?.status === 401 ? 'guest' : 'error'))
    } finally {
      finish(controller)
    }
  }

  // Resolves to 'authenticated' or 'mfa_required'. The status is not set to
  // loading meanwhile, so the guest-only login route stays mounted.
  async function signIn({ username, password }) {
    if (preview) {
      throw new ApiError('Sign-in is unavailable in development preview.', { code: 'PREVIEW_MODE' })
    }
    const { controller, isCurrent } = begin()
    csrfStore.clear()
    if (snapshot.notice || snapshot.status === 'mfa_required') set(authState('guest'))
    try {
      const result = await service.login({ username, password }, { signal: controller.signal })
      if (!isCurrent()) {
        throw new ApiError('The sign-in request was superseded.', { code: 'ABORTED' })
      }
      if (result.authenticated === true) {
        csrfStore.setSessionToken(result.csrfToken)
        set(authState('authenticated', { user: result.user, session: result.session, password: result.password }))
        return 'authenticated'
      }
      beginChallenge(result.mfa, result.challengeCsrfToken)
      return 'mfa_required'
    } catch (error) {
      if (isCurrent() && snapshot.status !== 'guest') set(authState('guest'))
      throw error
    } finally {
      finish(controller)
    }
  }

  // Never rejects. Protected state is always cleared locally; `serverConfirmed`
  // is true only when the backend ended the session (204) or reported that no
  // valid session remained (401).
  async function signOut() {
    const current = invalidate()
    let outcome
    try {
      await service.logout()
      outcome = Object.freeze({ serverConfirmed: true, error: null })
    } catch (error) {
      outcome = Object.freeze({ serverConfirmed: error?.status === 401, error: error?.status === 401 ? null : error })
    }
    if (current === revision) {
      csrfStore.clear()
      set(authState('guest', { notice: outcome.serverConfirmed ? null : 'signout_unconfirmed' }))
    }
    return outcome
  }

  function cancelMfa() {
    if (snapshot.status !== 'mfa_required') return
    endChallenge(null)
  }

  function requireChallenge() {
    if (preview) throw previewError()
    if (snapshot.status !== 'mfa_required') {
      throw new ApiError('There is no sign-in waiting for verification. Sign in again.', { code: 'MFA_CHALLENGE_INVALID' })
    }
    return challengeId
  }

  // Backend responses that end or redirect the pending challenge.
  function applyChallengeError(error) {
    const { mfa } = snapshot
    if (error?.code === 'MFA_CHALLENGE_INVALID') {
      endChallenge('mfa_invalid')
    } else if (error?.code === 'MFA_ENROLLMENT_REQUIRED' && !mfa.enrollmentRequired) {
      set(authState('mfa_required', { mfa: Object.freeze({ ...mfa, enrollmentRequired: true }) }))
    } else if (error?.code === 'MFA_ALREADY_ENROLLED' && mfa.enrollmentRequired) {
      set(authState('mfa_required', { mfa: Object.freeze({ ...mfa, enrollmentRequired: false }) }))
    }
  }

  // One code submission at a time: a duplicate would spend the same TOTP step
  // and be refused as a replay. Success is applied only to the same challenge.
  async function submitChallengeCode(operation, code) {
    const id = requireChallenge()
    assertCode(code)
    if (codeSubmission) throw inProgressError()
    codeSubmission = true
    const { controller, isCurrent } = begin()
    try {
      const result = await service[operation](code, { signal: controller.signal })
      if (!isCurrent() || challengeId !== id) throw supersededError()
      csrfStore.setSessionToken(result.csrfToken)
      set(authState('authenticated', { user: result.user, session: result.session, password: result.password }))
      return 'authenticated'
    } catch (error) {
      if (isCurrent() && challengeId === id) applyChallengeError(error)
      throw error
    } finally {
      codeSubmission = false
      finish(controller)
    }
  }

  const verifyMfa = (code) => submitChallengeCode('verifyMfa', code)
  const confirmMfaEnrollment = (code) => submitChallengeCode('confirmMfaEnrollment', code)

  // Returns the setup material to the caller only while the same challenge is pending.
  async function startMfaEnrollment({ signal } = {}) {
    const id = requireChallenge()
    try {
      const material = await service.startMfaEnrollment({ signal })
      if (challengeId !== id) throw supersededError()
      return material
    } catch (error) {
      if (challengeId === id) applyChallengeError(error)
      throw error
    }
  }

  function requireSession() {
    if (preview) throw previewError()
    if (snapshot.status !== 'authenticated') {
      throw new ApiError('Sign in to manage your account security.', { code: 'UNAUTHENTICATED', status: 401 })
    }
    return snapshot
  }

  async function startMfaReplacement({ signal } = {}) {
    const current = requireSession()
    const material = await service.startMfaReplacement({ signal })
    if (snapshot !== current) throw supersededError()
    return material
  }

  // The backend revokes every session (including this one) after a replacement,
  // so success always ends the local session and requires a new sign-in.
  async function confirmMfaReplacement(code) {
    const current = requireSession()
    assertCode(code)
    if (codeSubmission) throw inProgressError()
    codeSubmission = true
    try {
      const result = await service.confirmMfaReplacement(code)
      if (snapshot === current) {
        invalidate()
        csrfStore.clear()
        set(authState('guest', { notice: 'mfa_replaced' }))
      }
      return result
    } catch (error) {
      // MFA_VERIFICATION_FAILED is a wrong code; any other 401 means the session ended.
      if (error?.status === 401 && error.code !== 'MFA_VERIFICATION_FAILED') handleUnauthorized()
      throw error
    } finally {
      codeSubmission = false
    }
  }

  // --- Password lifecycle and MFA recovery ---------------------------------

  // Re-checks the session without a loading state; ends it locally only when the
  // backend reports it gone (revoked by a lockout, a reset or an MFA recovery).
  async function verifySessionQuietly() {
    if (snapshot.status !== 'authenticated') return
    const current = snapshot
    try {
      await service.getCurrentUser()
    } catch (error) {
      if (error?.status === 401 && snapshot === current) handleUnauthorized()
    }
  }

  // Confirmed success ends this browser's session (the backend revoked every
  // session). A failure or unknown outcome (network, timeout) leaves it as is.
  async function changePassword({ currentPassword, newPassword }) {
    const current = requireSession()
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !newPassword) {
      throw new ApiError('Enter your current and new password.', { code: 'VALIDATION_ERROR' })
    }
    if (passwordSubmission) throw inProgressError()
    passwordSubmission = true
    try {
      const result = await service.changePassword({ currentPassword, newPassword })
      if (snapshot === current) {
        invalidate()
        csrfStore.clear()
        set(authState('guest', { notice: 'password_changed' }))
      }
      return result
    } catch (error) {
      // A wrong current password counts toward the lockout, which revokes every session.
      if (error?.code === 'CURRENT_PASSWORD_INVALID') void verifySessionQuietly()
      throw error
    } finally {
      passwordSubmission = false
    }
  }

  // Anonymous, token-authorized operations: they never use or change this
  // browser's session state, except that a completed reset or MFA recovery
  // re-checks a signed-in session (the backend revoked that account's sessions).
  function requirePublic() {
    if (preview) throw previewError()
  }

  function assertLinkToken(token) {
    if (typeof token !== 'string' || !LINK_TOKEN_PATTERN.test(token)) {
      throw new ApiError('This link is invalid or has expired. Request a new one.', { code: 'TOKEN_INVALID' })
    }
  }

  async function getPasswordPolicy({ signal } = {}) {
    requirePublic()
    return service.getPasswordPolicy({ signal })
  }

  async function requestRecovery({ username, purpose }, { signal } = {}) {
    requirePublic()
    if (typeof username !== 'string' || !username.trim() || !RECOVERY_PURPOSES.has(purpose)) {
      throw new ApiError('Enter your username.', { code: 'VALIDATION_ERROR' })
    }
    return service.requestRecovery({ username: username.trim(), purpose }, { signal })
  }

  async function completePasswordSetup({ token, newPassword }, { signal } = {}) {
    requirePublic()
    assertLinkToken(token)
    return service.completePasswordSetup({ token, newPassword }, { signal })
  }

  async function completePasswordReset({ token, newPassword }, { signal } = {}) {
    requirePublic()
    assertLinkToken(token)
    const result = await service.completePasswordReset({ token, newPassword }, { signal })
    void verifySessionQuietly()
    return result
  }

  async function startMfaRecovery({ token, password }, { signal } = {}) {
    requirePublic()
    assertLinkToken(token)
    return service.startMfaRecovery({ token, password }, { signal })
  }

  async function confirmMfaRecovery({ token, password, code }, { signal } = {}) {
    requirePublic()
    assertLinkToken(token)
    assertCode(code)
    const result = await service.confirmMfaRecovery({ token, password, code }, { signal })
    void verifySessionQuietly()
    return result
  }

  // Only a 401 from a session-authenticated request reaches this handler, and it
  // only ends an authenticated (or restoring) session. A guest's in-flight login
  // or a pending MFA challenge is unaffected.
  function handleUnauthorized() {
    const { status } = snapshot
    if (status !== 'authenticated' && status !== 'loading') return
    invalidate()
    csrfStore.clear()
    set(authState('guest', { notice: status === 'authenticated' ? 'session_expired' : null }))
  }

  function stop() {
    invalidate()
    clearChallengeTimer()
    unsubscribeUnauthorized?.()
    unsubscribeUnauthorized = null
  }

  function start() {
    unsubscribeUnauthorized ??= subscribeUnauthorized(handleUnauthorized)
    void restore()
    return stop
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start,
    stop,
    restore,
    signIn,
    signOut,
    cancelMfa,
    verifyMfa,
    startMfaEnrollment,
    confirmMfaEnrollment,
    startMfaReplacement,
    confirmMfaReplacement,
    changePassword,
    getPasswordPolicy,
    requestRecovery,
    completePasswordSetup,
    completePasswordReset,
    startMfaRecovery,
    confirmMfaRecovery,
  })
}
