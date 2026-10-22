import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { appConfig } from '@/config/appConfig.js'
import { authConfig } from '@/config/authConfig.js'
import useAuth from '@/features/auth/useAuth.js'
import { isOutcomeUnknown } from '@/services/api/apiClient.js'
import '@/styles/auth.css'

// Must match the backend's own generic 202 message (it never reveals whether an
// account exists or is eligible); used only if the response carries no message.
const GENERIC_ACCEPTED = 'If the account is eligible, instructions have been sent to its registered address.'
const USERNAME_MAX = 100

const modes = {
  PASSWORD_RESET: {
    icon: 'mail-check',
    title: 'Reset your password',
    intro: `Enter your ${appConfig.name} username. If your account can be recovered this way, a reset link is sent to your registered e-mail address. It expires after 30 minutes.`,
    submit: 'Send reset link',
  },
  // Self-service authenticator recovery is limited by the backend to the designated
  // Super Administrator's pinned address; everyone else is recovered by an administrator.
  MFA_RECOVERY: {
    icon: 'key-round',
    title: 'Lost your authenticator app?',
    intro: 'Authenticator recovery is normally handled by your administrator. Only accounts approved for self-service recovery receive a recovery link, which expires after 15 minutes.',
    submit: 'Request recovery link',
  },
}

export default function ForgotPasswordPage() {
  const { requestRecovery } = useAuth()
  const location = useLocation()
  const alertRef = useRef(null)
  const inputRef = useRef(null)
  const [purpose, setPurpose] = useState('PASSWORD_RESET')
  const [username, setUsername] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [accepted, setAccepted] = useState(null)
  const mode = modes[purpose]
  const passwordExpired = location.state?.reason === 'password_expired'

  const showError = (message) => {
    setError(message)
    window.requestAnimationFrame(() => alertRef.current?.focus())
  }

  const switchMode = (next) => {
    setPurpose(next)
    setError('')
    setFieldError('')
    setAccepted(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (!username.trim() || username.trim().length > USERNAME_MAX) {
      setFieldError('Enter your username.')
      inputRef.current?.focus()
      return
    }
    setFieldError('')
    setError('')
    setPending(true)
    try {
      const result = await requestRecovery({ username: username.trim(), purpose })
      setAccepted(result.message || GENERIC_ACCEPTED)
    } catch (failure) {
      // DELIVERY_UNAVAILABLE is uniform for every username; nothing was sent.
      if (isOutcomeUnknown(failure)) showError('We could not confirm that your request was received. Try again.')
      else showError(failure?.message || 'The request could not be completed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]" aria-labelledby="recovery-title">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name={mode.icon} className="size-6" /></span>
        <h1 id="recovery-title">{mode.title}</h1>
        <p>{mode.intro}</p>
        {passwordExpired && purpose === 'PASSWORD_RESET' && !accepted && (
          <p className="zrv-auth-feedback" role="status">Your password has expired. Request a reset link to choose a new one.</p>
        )}
        {!authConfig.configured && <p className="zrv-auth-feedback" role="status">Account recovery requires the {appConfig.name} authentication service.</p>}
        {error && <p ref={alertRef} tabIndex={-1} className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        {accepted ? (
          <p className="zrv-auth-feedback zrv-auth-feedback--success" role="status">{accepted}</p>
        ) : (
          <form className="mt-6 text-left" onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="recovery-username">Username</label>
              <input ref={inputRef} id="recovery-username" className="ux-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX} value={username} onChange={(event) => setUsername(event.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'recovery-username-error' : undefined} disabled={pending} required />
              {fieldError && <small id="recovery-username-error" className="zrv-auth-field-error">{fieldError}</small>}
            </div>
            <button className="btn-primary mt-4 w-full" type="submit" disabled={!authConfig.configured || pending}>{pending ? 'Sending…' : mode.submit}</button>
          </form>
        )}
        {purpose === 'PASSWORD_RESET'
          ? <button type="button" className="zrv-auth-link mt-4" onClick={() => switchMode('MFA_RECOVERY')}>Lost your authenticator app?</button>
          : <button type="button" className="zrv-auth-link mt-4" onClick={() => switchMode('PASSWORD_RESET')}>Reset your password instead</button>}
        <Link className="btn-secondary mt-3" to="/login" state={{ from: location.state?.from }}>Back to sign in</Link>
      </section>
    </main>
  )
}
