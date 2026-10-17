import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { safeReturnTo } from '@/config/authRouting.js'
import { authConfig } from '@/config/authConfig.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [trustBrowser, setTrustBrowser] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    const errors = {}
    if (!emailPattern.test(email.trim())) errors.email = 'Enter a valid work email.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    setError('')
    if (Object.keys(errors).length) return
    setPending(true)
    try {
      await signIn({ email: email.trim(), password, trustBrowser })
      setPassword('')
      navigate(safeReturnTo(location.state?.from), { replace: true })
    } catch (failure) {
      setPassword('')
      setError(failure?.message || 'Sign-in could not be completed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-shell zrv-auth-page">
      <section className="auth-visual" aria-label="About Orvexa">
        <div className="auth-visual-copy">
          <span className="brand-mark-large"><OrvexaIcon name="sparkles" className="size-6" /></span>
          <h1>Operate production AI with evidence, not guesswork.</h1>
          <p>Orvexa is an admin control plane for applications, models, agents, knowledge, safety, quality, reliability and spend.</p>
          <div className="auth-points">
            <div className="auth-point"><b>37+ admin surfaces</b><span>Connected operational workflows</span></div>
            <div className="auth-point"><b>Dark + light + RTL</b><span>Flexible workspace modes</span></div>
            <div className="auth-point"><b>Enterprise-ready</b><span>Backend integration required</span></div>
          </div>
        </div>
      </section>
      <section className="auth-form-wrap" aria-label="Sign in">
        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="ux-kicker"><OrvexaIcon name="shield-check" className="size-4" /> Administrator access</div>
          <h2>Sign in to Orvexa</h2>
          <p>Use your organization-issued administrator credentials.</p>
          <button type="button" className="auth-provider mt-6" disabled aria-label="Enterprise single sign-on is not configured" title="Enterprise SSO requires backend configuration">
            <OrvexaIcon name="building-2" className="size-4" /> Continue with enterprise SSO
          </button>
          <div className="auth-divider">OR USE ADMIN CREDENTIALS</div>
          {!authConfig.configured && (
            <p className="zrv-auth-feedback" role="status">Authentication backend is not configured. Sign-in requires server endpoints and a secure session.</p>
          )}
          {error && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
          <div className="field">
            <label htmlFor="auth-email">Work email</label>
            <input id="auth-email" className="ux-input" type="email" inputMode="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined} required />
            {fieldErrors.email && <small id="auth-email-error" className="zrv-auth-field-error">{fieldErrors.email}</small>}
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password <Link to="/forgot-password" state={{ from: location.state?.from }} style={{ color: 'var(--primary-text)' }}>Forgot?</Link></label>
            <input id="auth-password" className="ux-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined} required />
            {fieldErrors.password && <small id="auth-password-error" className="zrv-auth-field-error">{fieldErrors.password}</small>}
          </div>
          <div className="check-row mt-4">
            <div><b>Trust this browser</b><small>Subject to workspace session policy</small></div>
            <button type="button" className={`ux-switch ${trustBrowser ? 'is-on' : ''}`} role="switch" aria-label="Trust this browser" aria-checked={trustBrowser} disabled={pending} onClick={() => setTrustBrowser((value) => !value)} />
          </div>
          <button className="btn-primary mt-5 w-full zrv-auth-submit" type="submit" disabled={pending || !authConfig.configured}>
            <OrvexaIcon name="log-in" className="size-4" /> {pending ? 'Signing in…' : 'Continue securely'}
          </button>
          <button type="button" className="btn-secondary mt-2 w-full zrv-auth-submit" disabled title="MFA will be configured with your authentication provider">
            <OrvexaIcon name="key-round" className="size-4" /> Multi-factor authentication
          </button>
          <p className="auth-note">High-impact administrator actions may require step-up verification. Access is controlled by your organization's authentication service.</p>
        </form>
      </section>
    </main>
  )
}
