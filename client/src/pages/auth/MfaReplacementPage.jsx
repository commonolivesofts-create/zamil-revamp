import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { formatClockTime } from '@/features/auth/authenticatorQr.js'
import { AuthenticatorSetup, MfaCodeInput } from '@/features/auth/MfaFields.jsx'
import { RecruitmentHeader } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

// Replaces the enrolled authenticator from a signed-in session. The backend
// decides eligibility (MFA verified on this session within 5 minutes). On
// success it revokes every session, so the user must sign in again.
export default function MfaReplacementPage() {
  const { status, session, startMfaReplacement, confirmMfaReplacement, signOut } = useAuth()
  const inputRef = useRef(null)
  const [material, setMaterial] = useState(null)
  const [starting, setStarting] = useState(false)
  const [pending, setPending] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [fieldError, setFieldError] = useState('')
  const [notice, setNotice] = useState('')
  const preview = status === 'preview'
  const focusLater = useFocusWhenEnabled(pending)

  // Setup material is discarded when its confirmation window closes.
  useEffect(() => {
    if (!material) return undefined
    const timer = window.setTimeout(
      () => {
        setMaterial(null)
        setCode('')
        setNotice('The setup window has closed. Start again to get a new setup key.')
      },
      Math.max(0, Date.parse(material.expiresAt) - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [material])

  useEffect(() => {
    if (material) inputRef.current?.focus()
  }, [material])

  const start = async () => {
    if (starting || pending) return
    setError(null)
    setNotice('')
    setStarting(true)
    try {
      setMaterial(await startMfaReplacement())
    } catch (failure) {
      if (failure?.code !== 'ABORTED') setError(failure)
    } finally {
      setStarting(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code from your new authenticator app.')
      inputRef.current?.focus()
      return
    }
    setFieldError('')
    setError(null)
    setPending(true)
    try {
      // Success signs this browser out; the route guard then shows sign-in.
      await confirmMfaReplacement(code)
    } catch (failure) {
      setCode('')
      if (failure?.code === 'MFA_REPLACEMENT_CONFLICT') setMaterial(null)
      if (failure?.code !== 'ABORTED') setError(failure)
      focusLater(inputRef)
    } finally {
      setPending(false)
    }
  }

  const cancel = () => {
    setMaterial(null)
    setCode('')
    setError(null)
  }

  const needsRecentMfa = error?.code === 'MFA_RECENT_VERIFICATION_REQUIRED'

  return (
    <section
      className="zrv-auth-page zrv-hr zrv-hr--compact zrv-mfa-panel zrv-account-panel zrv-account-panel--authenticator"
      aria-label="Authenticator settings"
    >
      <div className="zrv-hr-form-header">
        <RecruitmentHeader
          title="Authenticator app"
          subtitle="Manage the authenticator app used to verify your sign-in."
          breadcrumb={['Account']}
          rightContent={
            <span className="zrv-account-status zrv-authenticator-header-status">
              <span aria-hidden="true" /> Multi-factor authentication
            </span>
          }
        />
      </div>
      <div className="zrv-authenticator-page-layout zrv-account-layout--authenticator">
        <div className="zrv-authenticator-page-main">
          <div className="ux-panel-body">
            <div className="zrv-account-layout__main">
              {preview ? (
                <p className="zrv-auth-feedback" role="status">
                  Development preview has no authenticated session; authenticator changes are
                  unavailable.
                </p>
              ) : (
                <>
                  {session && !session.mfaVerified && (
                    <div className="zrv-authenticator-warning" role="status">
                      <span className="zrv-authenticator-warning__icon" aria-hidden="true">
                        <OrvexaIcon name="triangle-alert" className="size-5" />
                      </span>
                      <div>
                        <strong>This session was not verified with an authenticator.</strong>
                        <p>
                          For your security, sign in again with an authenticator before continuing.
                        </p>
                      </div>
                    </div>
                  )}
                  {notice && (
                    <p className="zrv-auth-feedback" role="status">
                      {notice}
                    </p>
                  )}
                  {error && (
                    <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">
                      {error.message || 'The request could not be completed.'}
                    </p>
                  )}
                  {needsRecentMfa && (
                    <button
                      type="button"
                      className="btn-secondary mt-3"
                      onClick={() => {
                        void signOut()
                      }}
                    >
                      Sign out and sign in again
                    </button>
                  )}
                  {material ? (
                    <div className="zrv-authenticator-replace-card zrv-authenticator-replace-card--setup">
                      <div className="zrv-authenticator-replace-card__heading">
                        <span>
                          <OrvexaIcon name="qr-code" className="size-6" />
                        </span>
                        <div>
                          <h2>Set up your new authenticator</h2>
                          <p>Scan the QR code, then confirm with a six-digit code.</p>
                        </div>
                      </div>
                      <AuthenticatorSetup material={material} />
                      <p className="zrv-mfa-meta zrv-authenticator-expiry">
                        Confirm before {formatClockTime(material.expiresAt)}. Codes from your
                        current authenticator will stop working.
                      </p>
                      <form className="zrv-mfa-form" onSubmit={submit} noValidate>
                        <MfaCodeInput
                          ref={inputRef}
                          id="mfa-replace-code"
                          value={code}
                          onChange={setCode}
                          error={fieldError}
                          disabled={pending}
                        />
                        <div className="zrv-authenticator-actions">
                          <button
                            className="btn-primary zrv-auth-submit"
                            type="submit"
                            disabled={pending}
                          >
                            <OrvexaIcon name="shield-check" className="size-4" />{' '}
                            {pending ? 'Replacing\u2026' : 'Confirm new authenticator'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={cancel}
                            disabled={pending}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <section
                      className="zrv-authenticator-replace-card"
                      aria-labelledby="replace-authenticator-title"
                    >
                      <span className="zrv-authenticator-replace-card__icon" aria-hidden="true">
                        <OrvexaIcon name="qr-code" className="size-7" />
                      </span>
                      <div className="zrv-authenticator-replace-card__copy">
                        <h2 id="replace-authenticator-title">Replace authenticator</h2>
                        <p>
                          Set up a new authenticator for multi-factor sign-in. This ends all active
                          sessions, and you will sign in again with the new authenticator.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-primary zrv-auth-submit"
                        onClick={start}
                        disabled={starting || status !== 'authenticated'}
                      >
                        <OrvexaIcon name="key-round" className="size-4" />{' '}
                        <span className="zrv-authenticator-replace-card__label">
                          {starting ? 'Starting\u2026' : 'Replace authenticator'}
                        </span>
                        <OrvexaIcon name="arrow-right" className="size-4" />
                      </button>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <aside
          className="zrv-account-aside zrv-authenticator-aside"
          aria-label="Before you replace your authenticator"
        >
          <h2>Before you start</h2>
          <ul className="zrv-authenticator-quick-facts">
            <li>
              <OrvexaIcon name="clock-3" className="size-4" />
              <span>
                <strong>Verify within 5 minutes</strong>
                <small>Use your current authenticator first.</small>
              </span>
            </li>
            <li>
              <OrvexaIcon name="log-out" className="size-4" />
              <span>
                <strong>All sessions will end</strong>
                <small>Sign in again with the new authenticator.</small>
              </span>
            </li>
          </ul>
          <Link className="zrv-account-aside__link" to="/account/password">
            <span className="zrv-account-aside__link-icon">
              <OrvexaIcon name="lock-keyhole" className="size-4" />
            </span>
            <span>
              <strong>Password</strong>
              <small>Review your password settings</small>
            </span>
            <OrvexaIcon name="arrow-up-right" className="size-4" />
          </Link>
        </aside>
      </div>
    </section>
  )
}
