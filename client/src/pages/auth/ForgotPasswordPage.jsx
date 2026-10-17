import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { authConfig } from '@/config/authConfig.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const { recoverPassword } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [completed, setCompleted] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (!emailPattern.test(email.trim())) {
      setFieldError('Enter a valid work email.')
      return
    }
    setFieldError('')
    setError('')
    setPending(true)
    try {
      await recoverPassword(email.trim())
      setCompleted(true)
    } catch (failure) {
      setError(failure?.message || 'Recovery could not be requested.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name="mail-check" className="size-6" /></span>
        <h1>Recover admin access</h1>
        <p>Enter your administrator email address to request recovery instructions.</p>
        {!authConfig.configured && <p className="zrv-auth-feedback" role="status">Password recovery requires a configured authentication backend.</p>}
        {error && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        {completed ? (
          <p className="zrv-auth-feedback zrv-auth-feedback--success" role="status">If the account is eligible, recovery instructions will be sent to the address provided.</p>
        ) : (
          <form className="mt-6 text-left" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="recovery-email">Work email</label>
              <input id="recovery-email" className="ux-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'recovery-email-error' : undefined} disabled={pending} required />
              {fieldError && <small id="recovery-email-error" className="zrv-auth-field-error">{fieldError}</small>}
            </div>
            <button className="btn-primary mt-4 w-full" type="submit" disabled={!authConfig.configured || pending}>{pending ? 'Sending…' : 'Send recovery instructions'}</button>
          </form>
        )}
        <Link className="btn-secondary mt-3" to="/login" state={{ from: location.state?.from }}>Back to sign in</Link>
      </section>
    </main>
  )
}
