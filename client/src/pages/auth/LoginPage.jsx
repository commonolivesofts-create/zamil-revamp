import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { safeReturnTo } from '@/config/authRouting.js'
import { appConfig } from '@/config/appConfig.js'
import { authConfig } from '@/config/authConfig.js'
import { PasswordInput } from '@/features/auth/PasswordFields.jsx'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

// Limits from the backend LoginRequest contract.
const USERNAME_MAX = 100
const PASSWORD_MAX = 256

const notices = {
  session_expired: 'Your session has ended. Please sign in again.',
  mfa_expired: 'The verification window has expired. Please sign in again.',
  mfa_invalid: 'Your sign-in has expired or is no longer valid. Please sign in again.',
  mfa_replaced: 'Your authenticator was replaced and all sessions were signed out. Sign in with your password and the new authenticator.',
  password_changed: 'Your password was changed and all sessions were signed out. Sign in with your new password.',
  signout_unconfirmed: 'You were signed out on this device, but the server did not confirm that your session ended. Sign in and sign out again, or close the browser.',
}

export default function LoginPage() {
  const { signIn, notice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [errorReference, setErrorReference] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    const errors = {}
    if (!username.trim() || username.trim().length > USERNAME_MAX) errors.username = 'Enter your username.'
    if (!password || password.length > PASSWORD_MAX) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setError('')
    setErrorCode('')
    setErrorReference('')
    // The fields are still enabled here, so the first invalid one can take focus.
    if (errors.username) return usernameRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()
    setPending(true)
    try {
      const result = await signIn({ username: username.trim(), password })
      setPassword('')
      // An MFA challenge is not a session: GuestOnlyRoute moves to the MFA step.
      if (result === 'authenticated') navigate(safeReturnTo(location.state?.from), { replace: true })
    } catch (failure) {
      setPassword('')
      setError(failure?.message || 'Sign-in could not be completed.')
      setErrorCode(failure?.code || '')
      // A server-side failure shows the backend request ID, which locates its log entry.
      setErrorReference(failure?.status >= 500 && failure?.requestId ? failure.requestId : '')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-shell zrv-auth-page">
      {/* Describes only implemented sign-in behaviour; no product claims or figures. */}
      <section className="auth-visual" aria-label={`About ${appConfig.name}`}>
        <div className="auth-visual-copy">
          <span className="brand-mark-large"><OrvexaIcon name="building-2" className="size-6" /></span>
          <h1>{appConfig.name}</h1>
          <p>Secure access to the {appConfig.name} enterprise application with your company account.</p>
          <div className="auth-points">
            <div className="auth-point"><b>Company username</b><span>Sign in with your employee username</span></div>
            <div className="auth-point"><b>Authenticator app</b><span>Required for administrative access</span></div>
            <div className="auth-point"><b>Self-service recovery</b><span>Reset your password or authenticator by e-mail</span></div>
          </div>
        </div>
      </section>
      <section className="auth-form-wrap" aria-label="Sign in">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="ux-kicker"><OrvexaIcon name="shield-check" className="size-4" /> Secure sign-in</div>
          <h2>Sign in to {appConfig.name}</h2>
          <p>Use your employee username and password.</p>
          {!authConfig.configured && (
            <p className="zrv-auth-feedback" role="status">Authentication backend is not configured. Sign-in requires server endpoints and a secure session.</p>
          )}
          {notice && notices[notice] && <p className="zrv-auth-feedback" role="status">{notices[notice]}</p>}
          {error && (
            <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">
              {error}
              {/* The backend refuses expired passwords; a new one is set through the reset link. */}
              {errorReference && <> Reference: {errorReference}</>}
              {errorCode === 'PASSWORD_EXPIRED' && <> <Link to="/forgot-password" state={{ from: location.state?.from, reason: 'password_expired' }} style={{ color: 'var(--primary-text)', fontWeight: 700 }}>Reset your password</Link></>}
            </p>
          )}
          <div className="field">
            <label htmlFor="auth-username">Username</label>
            <input ref={usernameRef} id="auth-username" className="ux-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX} value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined} required />
            {fieldErrors.username && <small id="auth-username-error" className="zrv-auth-field-error">{fieldErrors.username}</small>}
          </div>
          <PasswordInput
            ref={passwordRef}
            id="auth-password"
            label="Password"
            labelAddon={<Link to="/forgot-password" state={{ from: location.state?.from }} style={{ color: 'var(--primary-text)' }}>Forgot?</Link>}
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            disabled={pending}
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
          />
          <button className="btn-primary mt-5 w-full zrv-auth-submit" type="submit" disabled={pending || !authConfig.configured}>
            <OrvexaIcon name="log-in" className="size-4" /> {pending ? 'Signing in…' : 'Continue securely'}
          </button>
          <p className="auth-note">Accounts protected by multi-factor authentication are asked for an authenticator code after the password. Access is controlled by your organization's authentication service.</p>
          <p className="zrv-app-version">{appConfig.displayVersion}</p>
        </form>
      </section>
    </main>
  )
}
