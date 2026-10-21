import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { formatClockTime } from '@/features/auth/authenticatorQr.js'
import { AuthenticatorSetup, MfaCodeInput } from '@/features/auth/MfaFields.jsx'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

// Replaces the enrolled authenticator from a signed-in session. The backend
// decides eligibility (MFA verified on this session within 10 minutes). On
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
    const timer = window.setTimeout(() => {
      setMaterial(null)
      setCode('')
      setNotice('The setup window has closed. Start again to get a new setup key.')
    }, Math.max(0, Date.parse(material.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [material])

  useEffect(() => { if (material) inputRef.current?.focus() }, [material])

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
    <section className="ux-panel zrv-auth-page zrv-mfa-panel" aria-labelledby="mfa-replace-title">
      <div className="ux-panel-head">
        <div>
          <h1 id="mfa-replace-title">Authenticator app</h1>
          <p>Replace the authenticator used for multi-factor sign-in.</p>
        </div>
        <span className="ux-badge"><OrvexaIcon name="shield-check" className="size-3.5" /> MFA</span>
      </div>
      <div className="ux-panel-body">
        {preview ? (
          <p className="zrv-auth-feedback" role="status">Development preview has no authenticated session; authenticator changes are unavailable.</p>
        ) : (
          <>
            <p className="zrv-mfa-meta">For your protection this is only allowed within 10 minutes of signing in with your current authenticator. After the replacement, every session of your account ends, including this one, and you sign in again with the new authenticator.</p>
            {session && !session.mfaVerified && (
              <p className="zrv-auth-feedback" role="status">This session was not verified with an authenticator, so the server will ask you to sign in again first.</p>
            )}
            {notice && <p className="zrv-auth-feedback" role="status">{notice}</p>}
            {error && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error.message || 'The request could not be completed.'}</p>}
            {needsRecentMfa && (
              <button type="button" className="btn-secondary mt-3" onClick={() => { void signOut() }}>Sign out and sign in again</button>
            )}
            {material ? (
              <>
                <AuthenticatorSetup material={material} />
                <p className="zrv-mfa-meta">Confirm before {formatClockTime(material.expiresAt)}. Codes from your current authenticator will stop working.</p>
                <form className="mt-4 zrv-mfa-form" onSubmit={submit} noValidate>
                  <MfaCodeInput ref={inputRef} id="mfa-replace-code" value={code} onChange={setCode} error={fieldError} disabled={pending} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="btn-primary zrv-auth-submit" type="submit" disabled={pending}>
                      <OrvexaIcon name="shield-check" className="size-4" /> {pending ? 'Replacing…' : 'Confirm new authenticator'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={cancel} disabled={pending}>Cancel</button>
                  </div>
                </form>
              </>
            ) : (
              <button type="button" className="btn-primary mt-4 zrv-auth-submit" onClick={start} disabled={starting || status !== 'authenticated'}>
                <OrvexaIcon name="key-round" className="size-4" /> {starting ? 'Starting…' : 'Replace authenticator'}
              </button>
            )}
          </>
        )}
        <Link className="btn-secondary mt-4" to="/account/password"><OrvexaIcon name="lock-keyhole" className="size-4" /> Password</Link>
      </div>
    </section>
  )
}
