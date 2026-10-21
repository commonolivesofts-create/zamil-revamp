// Memory-only CSRF tokens. They are never written to cookies, any browser
// storage or the DOM; a page reload restores the session token through
// GET /auth/csrf. The session token protects authenticated state-changing
// requests; the MFA challenge token is only valid for the MFA endpoints of a
// pending login and must never be used as (or mistaken for) a session token.
export function createCsrfStore() {
  let sessionToken = null
  let challengeToken = null

  return Object.freeze({
    getSessionToken: () => sessionToken,
    getChallengeToken: () => challengeToken,
    setSessionToken(token) {
      sessionToken = token
      challengeToken = null
    },
    setChallengeToken(token) {
      challengeToken = token
      sessionToken = null
    },
    clearSession() { sessionToken = null },
    clearChallenge() { challengeToken = null },
    clear() {
      sessionToken = null
      challengeToken = null
    },
  })
}

export const csrfStore = createCsrfStore()
