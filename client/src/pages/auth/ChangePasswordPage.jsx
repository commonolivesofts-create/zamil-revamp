import { useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { PasswordInput, PasswordPolicyChecklist } from '@/features/auth/PasswordFields.jsx'
import { describeUnmetRules, validateNewPassword, violatedRules } from '@/features/auth/passwordPolicy.js'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import usePasswordPolicy from '@/features/auth/usePasswordPolicy.js'
import { isOutcomeUnknown } from '@/services/api/apiClient.js'
import '@/styles/auth.css'

const PASSWORD_INPUT_MAX = 256
const formatDate = (iso) => new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })

// Signed-in password change. A confirmed change ends every session (the backend
// revokes them), so the route guard then shows sign-in with an explanation.
export default function ChangePasswordPage() {
  const { status, password, changePassword } = useAuth()
  const { policy, error: policyError, loading: policyLoading, retry: retryPolicy } = usePasswordPolicy()
  const alertRef = useRef(null)
  const currentRef = useRef(null)
  const newRef = useRef(null)
  const confirmRef = useRef(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const preview = status === 'preview'
  const focusLater = useFocusWhenEnabled(pending)

  const showError = (message) => {
    setError(message)
    window.requestAnimationFrame(() => alertRef.current?.focus())
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending || !policy) return
    const errors = validateNewPassword({ newPassword, confirmPassword }, policy)
    if (!currentPassword) errors.currentPassword = 'Enter your current password.'
    else if (newPassword && newPassword === currentPassword && !errors.newPassword) {
      errors.newPassword = 'Choose a password different from the current one.'
    }
    setFieldErrors(errors)
    setError('')
    if (errors.currentPassword) return currentRef.current?.focus()
    if (errors.newPassword) return newRef.current?.focus()
    if (errors.confirmPassword) return confirmRef.current?.focus()
    setPending(true)
    try {
      // Success signs this browser out; the route guard then shows sign-in.
      await changePassword({ currentPassword, newPassword })
    } catch (failure) {
      if (failure?.code === 'CURRENT_PASSWORD_INVALID') {
        setCurrentPassword('')
        setFieldErrors({ currentPassword: failure.message })
        focusLater(currentRef)
      } else if (failure?.code === 'PASSWORD_POLICY_VIOLATION') {
        setFieldErrors({ newPassword: describeUnmetRules(violatedRules(failure)) })
        focusLater(newRef)
      } else if (failure?.code === 'PASSWORD_REUSED') {
        setFieldErrors({ newPassword: failure.message })
        focusLater(newRef)
      } else if (isOutcomeUnknown(failure)) {
        showError('We could not confirm whether your password was changed, so you are still signed in here. If you are signed out later, sign in with the new password; otherwise try again.')
      } else if (failure?.code !== 'ABORTED') {
        showError(failure?.message || 'Your password could not be changed.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="ux-panel zrv-auth-page zrv-mfa-panel" aria-labelledby="password-change-title">
      <div className="ux-panel-head">
        <div>
          <h1 id="password-change-title">Password</h1>
          <p>Change the password you use to sign in to Zamil Revamp.</p>
        </div>
        <span className="ux-badge"><OrvexaIcon name="lock-keyhole" className="size-3.5" /> Security</span>
      </div>
      <div className="ux-panel-body">
        {preview ? (
          <p className="zrv-auth-feedback" role="status">Development preview has no authenticated session; password changes are unavailable.</p>
        ) : (
          <>
            <p className="zrv-mfa-meta">Changing your password signs out every session of your account, including this one. You then sign in again with the new password.</p>
            {password?.expired && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="status">Your password has expired. Change it now; you cannot sign in again with the expired password.</p>}
            {!password?.expired && password?.expiresAt && <p className="zrv-mfa-meta">Your current password expires on {formatDate(password.expiresAt)}.</p>}
            {policyLoading && <p className="zrv-auth-feedback" role="status">Loading the password requirements…</p>}
            {policyError && (
              <>
                <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">The password requirements could not be loaded, so a new password cannot be checked yet. {policyError.message}</p>
                <button type="button" className="btn-secondary mt-3" onClick={retryPolicy}>Try again</button>
              </>
            )}
            {error && <p ref={alertRef} tabIndex={-1} className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
            {policy && (
              <form className="mt-4 zrv-mfa-form" onSubmit={submit} noValidate>
                <PasswordInput ref={currentRef} id="change-current-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} error={fieldErrors.currentPassword} disabled={pending} autoComplete="current-password" maxLength={PASSWORD_INPUT_MAX} />
                <PasswordInput ref={newRef} id="change-new-password" label="New password" value={newPassword} onChange={setNewPassword} error={fieldErrors.newPassword} disabled={pending} autoComplete="new-password" maxLength={PASSWORD_INPUT_MAX} describedBy="change-policy" />
                <PasswordPolicyChecklist id="change-policy" policy={policy} password={newPassword} />
                <PasswordInput ref={confirmRef} id="change-confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} error={fieldErrors.confirmPassword} disabled={pending} autoComplete="new-password" maxLength={PASSWORD_INPUT_MAX} />
                <button className="btn-primary mt-4 zrv-auth-submit" type="submit" disabled={pending || status !== 'authenticated'}>
                  <OrvexaIcon name="shield-check" className="size-4" /> {pending ? 'Changing password…' : 'Change password'}
                </button>
              </form>
            )}
          </>
        )}
        <Link className="btn-secondary mt-4" to="/account/authenticator"><OrvexaIcon name="key-round" className="size-4" /> Authenticator app</Link>
      </div>
    </section>
  )
}
