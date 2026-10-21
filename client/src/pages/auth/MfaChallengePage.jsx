import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { safeReturnTo } from '@/config/authRouting.js'
import { formatClockTime } from '@/features/auth/authenticatorQr.js'
import { MfaCodeInput } from '@/features/auth/MfaFields.jsx'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import '@/styles/auth.css'

// Reached only while an MFA challenge is pending (MfaChallengeRoute). The
// session exists only after the backend verifies the code.
export default function MfaChallengePage() {
  const { mfa, verifyMfa, cancelMfa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const focusLater = useFocusWhenEnabled(pending)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    if (!/^\d{6}$/.test(code)) {
      setFieldError('Enter the 6-digit code from your authenticator app.')
      inputRef.current?.focus()
      return
    }
    setFieldError('')
    setError('')
    setPending(true)
    try {
      await verifyMfa(code)
      navigate(safeReturnTo(location.state?.from), { replace: true })
    } catch (failure) {
      // An ended challenge redirects to sign-in; ABORTED means this page is leaving.
      if (failure?.code !== 'ABORTED') {
        setCode('')
        setError(failure?.message || 'Verification could not be completed.')
        focusLater(inputRef)
      }
    } finally {
      setPending(false)
    }
  }

  const cancel = () => {
    cancelMfa()
    navigate('/login', { replace: true, state: { from: location.state?.from } })
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]" aria-labelledby="mfa-verify-title">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name="key-round" className="size-6" /></span>
        <h1 id="mfa-verify-title">Verify your sign-in</h1>
        <p>Enter the current 6-digit code from your authenticator app. You are not signed in until the code is verified.</p>
        {mfa?.expiresAt && <p className="zrv-mfa-meta">Complete verification before {formatClockTime(mfa.expiresAt)}.</p>}
        {error && <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        <form className="mt-6 text-left" onSubmit={submit} noValidate>
          <MfaCodeInput ref={inputRef} id="mfa-verify-code" value={code} onChange={setCode} error={fieldError} disabled={pending} />
          <button className="btn-primary mt-4 w-full zrv-auth-submit" type="submit" disabled={pending}>
            <OrvexaIcon name="shield-check" className="size-4" /> {pending ? 'Verifying…' : 'Verify and sign in'}
          </button>
        </form>
        <button type="button" className="btn-secondary mt-3" onClick={cancel} disabled={pending}>Use a different account</button>
      </section>
    </main>
  )
}
