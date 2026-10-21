import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { safeReturnTo } from '@/config/authRouting.js'
import { formatClockTime } from '@/features/auth/authenticatorQr.js'
import { AuthenticatorSetup, MfaCodeInput } from '@/features/auth/MfaFields.jsx'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

// First-time authenticator enrollment inside a pending MFA challenge. Nothing is
// stored by the backend, and no session exists, until the confirmation code is
// accepted. The setup secret is held only in this page's state.
export default function MfaEnrollmentPage() {
  const { startMfaEnrollment, confirmMfaEnrollment, cancelMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [material, setMaterial] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const focusLater = useFocusWhenEnabled(pending)

  // Strict Mode safe: the first request is aborted and its result ignored.
  useEffect(() => {
    const controller = new AbortController()
    startMfaEnrollment({ signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setMaterial(result) })
      .catch((failure) => {
        if (!controller.signal.aborted && failure?.code !== 'ABORTED') {
          setLoadError(failure?.message || 'Authenticator setup could not be started.')
        }
      })
    return () => controller.abort()
  }, [startMfaEnrollment, attempt])

  const retry = () => {
    setLoadError('')
    setAttempt((value) => value + 1)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code shown in your authenticator app.')
      inputRef.current?.focus()
      return
    }
    setFieldError('')
    setError('')
    setPending(true)
    try {
      await confirmMfaEnrollment(code)
      setMaterial(null)
      navigate(safeReturnTo(location.state?.from), { replace: true })
    } catch (failure) {
      if (failure?.code !== 'ABORTED') {
        setCode('')
        setError(failure?.message || 'The authenticator could not be confirmed.')
        focusLater(inputRef)
      }
    } finally {
      setPending(false)
    }
  }

  const cancel = () => {
    setMaterial(null)
    cancelMfa()
    navigate('/login', { replace: true, state: { from: location.state?.from } })
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]" aria-labelledby="mfa-enroll-title" aria-busy={!material && !loadError}>
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name="shield-check" className="size-6" /></span>
        <h1 id="mfa-enroll-title">Set up your authenticator</h1>
        <p>Your account requires multi-factor authentication. Scan the QR code with an authenticator app, then enter the code it shows. You are not signed in until the code is confirmed.</p>
        {loadError && (
          <>
            <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{loadError}</p>
            <button type="button" className="btn-primary mt-4" onClick={retry}>Try again</button>
          </>
        )}
        {!material && !loadError && <p className="zrv-auth-feedback" role="status">Preparing authenticator setup…</p>}
        {material && (
          <>
            <AuthenticatorSetup material={material} />
            <p className="zrv-mfa-meta">Complete setup before {formatClockTime(material.expiresAt)}.</p>
            {error && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
            <form className="mt-4 text-left" onSubmit={submit} noValidate>
              <MfaCodeInput ref={inputRef} id="mfa-enroll-code" value={code} onChange={setCode} error={fieldError} disabled={pending} />
              <button className="btn-primary mt-4 w-full zrv-auth-submit" type="submit" disabled={pending}>
                <OrvexaIcon name="log-in" className="size-4" /> {pending ? 'Confirming…' : 'Confirm and sign in'}
              </button>
            </form>
          </>
        )}
        <button type="button" className="btn-secondary mt-3" onClick={cancel} disabled={pending}>Use a different account</button>
      </section>
    </main>
  )
}
