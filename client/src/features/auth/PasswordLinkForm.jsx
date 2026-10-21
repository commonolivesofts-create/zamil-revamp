import { useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { isOutcomeUnknown } from '@/services/api/apiClient.js'
import { PasswordInput, PasswordPolicyChecklist } from './PasswordFields.jsx'
import useFocusWhenEnabled from './focusWhenEnabled.js'
import { describeUnmetRules, validateNewPassword, violatedRules } from './passwordPolicy.js'
import useAuth from './useAuth.js'
import useLinkToken from './useLinkToken.js'
import usePasswordPolicy from './usePasswordPolicy.js'
import '@/styles/auth.css'

// Backend request field limit; policy length is checked in code points separately.
const PASSWORD_INPUT_MAX = 256

const copy = {
  setup: {
    icon: 'key-round',
    title: 'Set up your password',
    intro: 'Choose a password for your new Zamil Revamp account. This link works once and expires 24 hours after it was sent.',
    submit: 'Set password',
    pending: 'Setting password…',
    successTitle: 'Your password is set',
    success: 'Your Zamil Revamp account is active. Sign in with your username and new password.',
    invalidHelp: 'Ask your administrator to send a new password setup link.',
  },
  reset: {
    icon: 'lock-keyhole',
    title: 'Choose a new password',
    intro: 'Enter a new password for your Zamil Revamp account. This link works once and expires 30 minutes after it was sent.',
    submit: 'Reset password',
    pending: 'Resetting password…',
    successTitle: 'Your password was reset',
    success: 'All existing sessions of your account were signed out. Sign in with your new password; multi-factor verification is still required if your account uses it.',
    invalidHelp: 'Request a new reset link.',
  },
}

// Shared by the password setup and reset pages opened from e-mailed links. The
// token comes from the URL fragment only and is held in memory; the employee
// is never signed in automatically. Each captured link gets a fresh form.
export default function PasswordLinkForm({ kind }) {
  const link = useLinkToken()
  return <PasswordLinkFlow key={link.linkKey} kind={kind} link={link} />
}

function PasswordLinkFlow({ kind, link }) {
  const text = copy[kind]
  const { completePasswordSetup, completePasswordReset } = useAuth()
  const { token, hadFragment } = link
  const clearToken = () => link.clearToken(token)
  const { policy, error: policyError, loading: policyLoading, retry: retryPolicy } = usePasswordPolicy()
  const alertRef = useRef(null)
  const newPasswordRef = useRef(null)
  const confirmRef = useRef(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const focusLater = useFocusWhenEnabled(pending)

  const showError = (message) => {
    setError(message)
    window.requestAnimationFrame(() => alertRef.current?.focus())
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending || !policy || !token) return
    const errors = validateNewPassword({ newPassword, confirmPassword }, policy)
    setFieldErrors(errors)
    setError('')
    if (errors.newPassword) return newPasswordRef.current?.focus()
    if (errors.confirmPassword) return confirmRef.current?.focus()
    setPending(true)
    try {
      const complete = kind === 'setup' ? completePasswordSetup : completePasswordReset
      await complete({ token, newPassword })
      clearToken()
      setNewPassword('')
      setConfirmPassword('')
      setDone(true)
    } catch (failure) {
      if (failure?.code === 'TOKEN_INVALID' || failure?.code === 'ACCOUNT_NOT_ELIGIBLE') {
        clearToken()
        setNewPassword('')
        setConfirmPassword('')
        setTokenError(failure.message)
      } else if (failure?.code === 'PASSWORD_POLICY_VIOLATION') {
        setFieldErrors({ newPassword: describeUnmetRules(violatedRules(failure)) })
        focusLater(newPasswordRef)
      } else if (failure?.code === 'PASSWORD_REUSED') {
        setFieldErrors({ newPassword: failure.message })
        focusLater(newPasswordRef)
      } else if (isOutcomeUnknown(failure)) {
        showError('We could not confirm whether your password was saved. Try signing in with the new password; if that does not work, try again or request a new link.')
      } else {
        showError(failure?.message || 'The password could not be saved.')
      }
    } finally {
      setPending(false)
    }
  }

  let body
  if (done) {
    body = (
      <>
        <p className="zrv-auth-feedback zrv-auth-feedback--success" role="status">{text.success}</p>
        <Link className="btn-primary mt-4 w-full zrv-auth-submit" to="/login" replace>
          <OrvexaIcon name="log-in" className="size-4" /> Go to sign in
        </Link>
      </>
    )
  } else if (!token) {
    body = (
      <>
        <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">
          {tokenError || (hadFragment ? 'This link is invalid or incomplete.' : 'Open this page from the link in your e-mail.')} {text.invalidHelp}
        </p>
        {kind === 'reset' && <Link className="btn-primary mt-4 w-full zrv-auth-submit" to="/forgot-password" replace>Request a new link</Link>}
      </>
    )
  } else {
    body = (
      <>
        {policyLoading && <p className="zrv-auth-feedback" role="status">Loading the password requirements…</p>}
        {policyError && (
          <>
            <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">The password requirements could not be loaded, so a new password cannot be checked yet. {policyError.message}</p>
            <button type="button" className="btn-secondary mt-3" onClick={retryPolicy}>Try again</button>
          </>
        )}
        {error && <p ref={alertRef} tabIndex={-1} className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        {policy && (
          <form className="mt-6 text-left" onSubmit={submit} noValidate>
            <PasswordInput ref={newPasswordRef} id={`${kind}-new-password`} label="New password" value={newPassword} onChange={setNewPassword} error={fieldErrors.newPassword} disabled={pending} autoComplete="new-password" maxLength={PASSWORD_INPUT_MAX} describedBy={`${kind}-policy`} />
            <PasswordPolicyChecklist id={`${kind}-policy`} policy={policy} password={newPassword} />
            <PasswordInput ref={confirmRef} id={`${kind}-confirm-password`} label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} error={fieldErrors.confirmPassword} disabled={pending} autoComplete="new-password" maxLength={PASSWORD_INPUT_MAX} />
            <button className="btn-primary mt-4 w-full zrv-auth-submit" type="submit" disabled={pending}>
              <OrvexaIcon name="shield-check" className="size-4" /> {pending ? text.pending : text.submit}
            </button>
          </form>
        )}
      </>
    )
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]" aria-labelledby={`${kind}-title`}>
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name={text.icon} className="size-6" /></span>
        <h1 id={`${kind}-title`}>{done ? text.successTitle : text.title}</h1>
        {!done && <p>{text.intro}</p>}
        {body}
        {!done && <Link className="btn-secondary mt-3" to="/login" replace>Back to sign in</Link>}
      </section>
    </main>
  )
}
