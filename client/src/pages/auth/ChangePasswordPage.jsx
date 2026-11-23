import { useRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { appConfig } from '@/config/appConfig.js'
import AnimatedSecurityShield from '@/features/auth/AnimatedSecurityShield.jsx'
import { PasswordInput, PasswordPolicyChecklist } from '@/features/auth/PasswordFields.jsx'
import {
  describeUnmetRules,
  policyRules,
  validateNewPassword,
  violatedRules,
} from '@/features/auth/passwordPolicy.js'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import usePasswordPolicy from '@/features/auth/usePasswordPolicy.js'
import { isOutcomeUnknown } from '@/services/api/apiClient.js'
import { RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import '@/styles/auth.css'

const PASSWORD_INPUT_MAX = 256

// Signed-in password change. A confirmed change ends every session (the backend
// revokes them), so the route guard then shows sign-in with an explanation.
export default function ChangePasswordPage() {
  const { status, password, changePassword } = useAuth()
  const {
    policy,
    error: policyError,
    loading: policyLoading,
    retry: retryPolicy,
  } = usePasswordPolicy()
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
  const rules = policy ? policyRules(policy) : []
  const metRules = rules.filter((rule) => rule.met(newPassword)).length
  const requirementProgress = rules.length ? Math.round((metRules / rules.length) * 100) : 0
  const animationRequirements = [
    'MIN_LENGTH',
    'UPPERCASE',
    'LOWERCASE',
    'DIGIT',
    'SPECIAL_CHARACTER',
  ].map((code) => ({
    code,
    met: rules.find((rule) => rule.code === code)?.met(newPassword) ?? null,
  }))
  const strengthLabel = !newPassword
    ? 'Not entered'
    : requirementProgress === 100
      ? 'Strong'
      : requirementProgress >= 60
        ? 'Medium'
        : 'Weak'

  const updatePasswordField =
    (key, setter, alsoClear = []) =>
    (value) => {
      setter(value)
      setFieldErrors((current) => {
        const next = { ...current }
        delete next[key]
        alsoClear.forEach((field) => delete next[field])
        return next
      })
    }

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
        showError(
          'We could not confirm whether your password was changed, so you are still signed in here. If you are signed out later, sign in with the new password; otherwise try again.',
        )
      } else if (failure?.code !== 'ABORTED') {
        showError(failure?.message || 'Your password could not be changed.')
      }
    } finally {
      setPending(false)
    }
  }

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setFieldErrors({})
    setError('')
  }

  return (
    <div className="zrv-hr zrv-hr--compact zrv-hr--password-page">
      <div className="zrv-hr-form-header">
        <RecruitmentHeader
          title="Password"
          subtitle="Update your password to keep your account secure."
          breadcrumb={['Account']}
        />
      </div>
      <div className="zrv-password-layout">
        <section className="zrv-password-form-card zrv-hr-stage" aria-label="Change password">
          {preview ? (
            <p className="zrv-auth-feedback" role="status">
              Development preview has no authenticated session; password changes are unavailable.
            </p>
          ) : (
            <>
              {password?.expired && (
                <p className="zrv-auth-feedback zrv-auth-feedback--error" role="status">
                  Your password has expired. Change it now; you cannot sign in again with the
                  expired password.
                </p>
              )}
              {policyLoading && (
                <p className="zrv-auth-feedback" role="status">
                  Loading password requirements…
                </p>
              )}
              {policyError && (
                <>
                  <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">
                    The password requirements could not be loaded, so a new password cannot be
                    checked yet. {policyError.message}
                  </p>
                  <button type="button" className="btn-secondary mt-3" onClick={retryPolicy}>
                    Try again
                  </button>
                </>
              )}
              {error && (
                <p
                  ref={alertRef}
                  tabIndex={-1}
                  className="zrv-auth-feedback zrv-auth-feedback--error"
                  role="alert"
                >
                  {error}
                </p>
              )}
              {policy && (
                <form className="zrv-password-form" onSubmit={submit} noValidate>
                  <PasswordInput
                    ref={currentRef}
                    id="change-current-password"
                    label="Current password"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={updatePasswordField('currentPassword', setCurrentPassword)}
                    error={fieldErrors.currentPassword}
                    disabled={pending}
                    autoComplete="current-password"
                    maxLength={PASSWORD_INPUT_MAX}
                    inputClassName="ux-input zrv-hr-input"
                  />
                  <PasswordInput
                    ref={newRef}
                    id="change-new-password"
                    label="New password"
                    placeholder="Enter a new password"
                    value={newPassword}
                    onChange={updatePasswordField('newPassword', setNewPassword, [
                      'confirmPassword',
                    ])}
                    error={fieldErrors.newPassword}
                    disabled={pending}
                    autoComplete="new-password"
                    maxLength={PASSWORD_INPUT_MAX}
                    describedBy="change-policy"
                    inputClassName="ux-input zrv-hr-input"
                  />
                  <PasswordInput
                    ref={confirmRef}
                    id="change-confirm-password"
                    label="Confirm new password"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={updatePasswordField('confirmPassword', setConfirmPassword)}
                    error={fieldErrors.confirmPassword}
                    disabled={pending}
                    autoComplete="new-password"
                    maxLength={PASSWORD_INPUT_MAX}
                    inputClassName="ux-input zrv-hr-input"
                  />
                  <div className="sr-only">
                    <p>
                      Password strength: {newPassword ? requirementProgress : 0} percent,{' '}
                      {strengthLabel}.
                    </p>
                    <PasswordPolicyChecklist
                      id="change-policy"
                      policy={policy}
                      password={newPassword}
                    />
                  </div>
                  <div className="zrv-password-form__actions">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={resetForm}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary zrv-auth-submit"
                      type="submit"
                      disabled={pending || status !== 'authenticated'}
                    >
                      <OrvexaIcon name="lock-keyhole" className="size-4" />{' '}
                      <span className="zrv-password-submit-label">
                        {pending ? 'Updating password…' : 'Update password'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
        <aside className="zrv-password-side" aria-label={`Password security for ${appConfig.name}`}>
          <AnimatedSecurityShield
            strength={newPassword ? requirementProgress : 0}
            requirements={animationRequirements}
            hasInput={Boolean(newPassword)}
          />
          <div className="zrv-password-session-strip" role="note">
            <span>
              <OrvexaIcon name="shield-check" className="size-5" />
            </span>
            <div>
              <strong>Keep your account protected</strong>
              <p>
                Changing your password ends all active sessions. You’ll sign in again with your new
                password.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
