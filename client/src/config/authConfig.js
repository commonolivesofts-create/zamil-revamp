// Authentication endpoints are fixed by the backend contract
// (server/docs/openapi/openapi.yaml) and are relative to apiConfig.baseUrl.
// `import.meta.env` is absent under plain Node, which the native tests use.
const env = import.meta.env ?? {}

export const authEndpoints = Object.freeze({
  login: '/auth/login',
  currentUser: '/auth/me',
  csrf: '/auth/csrf',
  logout: '/auth/logout',
  mfaVerify: '/auth/mfa/verify',
  mfaEnrollment: '/auth/mfa/enrollment',
  mfaEnrollmentConfirm: '/auth/mfa/enrollment/confirm',
  mfaReplacement: '/auth/mfa/replacement',
  mfaReplacementConfirm: '/auth/mfa/replacement/confirm',
  passwordPolicy: '/auth/password/policy',
  recoveryRequest: '/auth/recovery/request',
  passwordSetup: '/auth/password/setup',
  passwordReset: '/auth/password/reset',
  passwordChange: '/auth/password/change',
  mfaRecoveryStart: '/auth/mfa/recovery/start',
  mfaRecoveryConfirm: '/auth/mfa/recovery/confirm',
})

// Frontend pages opened from backend e-mail links (`<path>#token=<token>`); they
// match the backend defaults AUTH_PASSWORD_SETUP_PATH, AUTH_PASSWORD_RESET_PATH
// and AUTH_MFA_RECOVERY_PATH.
export const linkPages = Object.freeze({
  passwordSetup: '/password/setup',
  passwordReset: '/password/reset',
  mfaRecovery: '/mfa/recovery',
})

// Explicit opt-in for isolated template/layout work ONLY. Production builds
// replace DEV with false, so preview can never be enabled there. Preview never
// contacts the backend and is never treated as an authenticated session.
const developmentPreview = Boolean(env.DEV && env.VITE_AUTH_DEV_PREVIEW === 'true')

export const authConfig = Object.freeze({
  configured: !developmentPreview,
  developmentPreview,
  endpoints: authEndpoints,
})
