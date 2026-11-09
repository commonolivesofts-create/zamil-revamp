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
  const { signIn, notice, status, retrySession } = useAuth()
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
    <main className="auth-shell zrv-auth-page" aria-label={`About ${appConfig.name}`}>
      <svg className="zrv-login-ribbons" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d="M0 100C280 160 520 190 760 165S1200 50 1440 35v165H0Z" fill="#05382a" fillOpacity=".65" />
        <path d="M0 155c290-15 480 40 760 20s490-90 680-95v130H0Z" fill="#067a45" fillOpacity=".38" />
        <path d="M0 125c280 65 500 85 770 55s500-100 670-108" fill="none" stroke="#39d879" strokeOpacity=".7" strokeWidth="3" />
        <path d="M0 170c285-15 485 35 765 16s495-88 675-94" fill="none" stroke="#159c5a" strokeOpacity=".6" strokeWidth="10" />
      </svg>
      <section className="auth-form-wrap" aria-label="Sign in">
        <header className="zrv-login-brand" aria-label={appConfig.name}>
          <span className="zrv-login-brand-mark" aria-hidden="true" />
          <span className="zrv-login-brand-copy">
            <h1>{appConfig.name}</h1>
            <span>Enterprise Business Application Platform</span>
          </span>
        </header>
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="ux-kicker"><OrvexaIcon name="shield-check" className="size-4" /> SECURE SIGN-IN</div>
          <h2>Sign in to {appConfig.name}</h2>
          <p>Use your employee username and password.</p>
          {!authConfig.configured && (
            <p className="zrv-auth-feedback" role="status">Authentication backend is not configured. Sign-in requires server endpoints and a secure session.</p>
          )}
          {notice && notices[notice] && <p className="zrv-auth-feedback" role="status">{notices[notice]}</p>}
          {status === 'error' && (
            <p className="zrv-auth-feedback" role="status">
              The authentication server could not be reached to check for an existing session. You can still sign in.{' '}
              {/* A session check would abort a pending sign-in request, so it waits for that request. */}
              <button type="button" onClick={() => { if (!pending) retrySession() }} disabled={pending} style={{ color: 'var(--primary-text)', fontWeight: 700, background: 'none', border: 0, padding: 0, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1 }}>Retry session check</button>
            </p>
          )}
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
            <div className="zrv-login-input">
              <OrvexaIcon name="user-round" className="zrv-auth-leading-icon" />
              <input ref={usernameRef} id="auth-username" className="ux-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX} placeholder="Enter your employee username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined} required />
            </div>
            {fieldErrors.username && <small id="auth-username-error" className="zrv-auth-field-error">{fieldErrors.username}</small>}
          </div>
          <PasswordInput
            ref={passwordRef}
            id="auth-password"
            label="Password"
            labelAddon={<Link to="/forgot-password" state={{ from: location.state?.from }} style={{ color: 'var(--primary-text)' }}>Forgot password?</Link>}
            leadingIcon="lock-keyhole"
            placeholder="Enter your password"
            value={password}
            onChange={setPassword}
            error={fieldErrors.password}
            disabled={pending}
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
          />
          <button className="btn-primary mt-5 w-full zrv-auth-submit" type="submit" disabled={pending || !authConfig.configured}>
            <OrvexaIcon name="log-in" className="size-4" /> {pending ? 'Signing in…' : 'Continue Securely'}
          </button>
          <div className="zrv-login-indicators" aria-label="Security information">
            <div className="zrv-login-indicator">
              <OrvexaIcon name="shield-check" className="size-5" />
              <span>Company<br />Username</span>
            </div>
            <div className="zrv-login-indicator">
              <OrvexaIcon name="smartphone" className="size-5" />
              <span>Authenticator<br />App</span>
            </div>
            <div className="zrv-login-indicator">
              <OrvexaIcon name="refresh-cw" className="size-5" />
              <span>Self-Service<br />Recovery</span>
            </div>
          </div>
          <div className="zrv-version-footer"><span aria-hidden="true" /><p className="zrv-app-version">{appConfig.displayVersion}</p><span aria-hidden="true" /></div>
        </form>
      </section>
    </main>
  )
}
