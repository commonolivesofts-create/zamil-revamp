import { useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { AuthenticatorSetup, MfaCodeInput } from '@/features/auth/MfaFields.jsx'
import { PasswordInput } from '@/features/auth/PasswordFields.jsx'
import useFocusWhenEnabled from '@/features/auth/focusWhenEnabled.js'
import useAuth from '@/features/auth/useAuth.js'
import useLinkToken from '@/features/auth/useLinkToken.js'
import { isOutcomeUnknown } from '@/services/api/apiClient.js'
import '@/styles/auth.css'

const PASSWORD_INPUT_MAX = 256

// Authenticator recovery opened from an authorized recovery e-mail
// (/mfa/recovery#token=…). The backend decides who may recover; this page only
// completes a recovery the backend already authorized. The existing
// authenticator stays valid until the backend confirms the new one. Token,
// password and setup key live only in this page's memory. Each captured link
// gets a fresh flow, so no response for an earlier link can update it.
export default function MfaRecoveryPage() {
  const link = useLinkToken()
  return <MfaRecoveryFlow key={link.linkKey} link={link} />
}

function MfaRecoveryFlow({ link }) {
  const { startMfaRecovery, confirmMfaRecovery } = useAuth()
  const { token, hadFragment } = link
  const clearToken = () => link.clearToken(token)
  const alertRef = useRef(null)
  const passwordRef = useRef(null)
  const codeRef = useRef(null)
  const [password, setPassword] = useState('')
  const [material, setMaterial] = useState(null)
  const [code, setCode] = useState('')
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

  // Discards every sensitive value held by this page.
  const forget = () => {
    setPassword('')
    setMaterial(null)
    setCode('')
  }

  const endWithTokenError = (message) => {
    forget()
    clearToken()
    setTokenError(message)
  }

  const start = async (event) => {
    event.preventDefault()
    if (pending || !token) return
    if (!password) {
      setFieldErrors({ password: 'Enter your current password.' })
      passwordRef.current?.focus()
      return
    }
    setFieldErrors({})
    setError('')
    setPending(true)
    try {
      setMaterial(await startMfaRecovery({ token, password }))
      focusLater(codeRef)
    } catch (failure) {
      if (failure?.code === 'TOKEN_INVALID') endWithTokenError(failure.message)
      else if (failure?.code === 'RECOVERY_FAILED') {
        setPassword('')
        showError(`${failure.message} Check your password. If the link has expired or was already used, ask for a new recovery link.`)
      } else if (isOutcomeUnknown(failure)) showError('We could not reach the recovery service. Try again.')
      else showError(failure?.message || 'The recovery could not be started.')
    } finally {
      setPending(false)
    }
  }

  const confirm = async (event) => {
    event.preventDefault()
    if (pending || !token || !material) return
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors({ code: 'Enter the 6-digit code from your new authenticator app.' })
      codeRef.current?.focus()
      return
    }
    setFieldErrors({})
    setError('')
    setPending(true)
    try {
      await confirmMfaRecovery({ token, password, code })
      forget()
      clearToken()
      setDone(true)
    } catch (failure) {
      setCode('')
      if (failure?.code === 'MFA_VERIFICATION_FAILED') {
        setFieldErrors({ code: failure.message })
        focusLater(codeRef)
      } else if (failure?.code === 'TOKEN_INVALID') endWithTokenError(failure.message)
      else if (failure?.code === 'RECOVERY_FAILED') {
        // The password, token or account check no longer passes: start over.
        forget()
        showError(`${failure.message} Enter your password to try again, or ask for a new recovery link.`)
      } else if (isOutcomeUnknown(failure)) {
        showError('We could not confirm whether your authenticator was replaced. Try signing in with the new authenticator; if that does not work, your previous authenticator is still valid.')
      } else showError(failure?.message || 'The recovery could not be completed.')
    } finally {
      setPending(false)
    }
  }

  const cancel = () => {
    forget()
    clearToken()
  }

  let body
  if (done) {
    body = (
      <>
        <p className="zrv-auth-feedback zrv-auth-feedback--success" role="status">Your new authenticator is set up and every session of your account was signed out. Sign in with your password and a code from the new authenticator app.</p>
        <Link className="btn-primary mt-4 w-full zrv-auth-submit" to="/login" replace><OrvexaIcon name="log-in" className="size-4" /> Go to sign in</Link>
      </>
    )
  } else if (!token) {
    body = (
      <p className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">
        {tokenError || (hadFragment ? 'This recovery link is invalid or incomplete.' : 'Open this page from the link in your recovery e-mail.')} Recovery links are issued only for approved accounts; contact your administrator if you need help.
      </p>
    )
  } else if (!material) {
    body = (
      <>
        {error && <p ref={alertRef} tabIndex={-1} className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        <form className="mt-6 text-left" onSubmit={start} noValidate>
          <PasswordInput ref={passwordRef} id="recovery-password" label="Current password" value={password} onChange={setPassword} error={fieldErrors.password} disabled={pending} autoComplete="current-password" maxLength={PASSWORD_INPUT_MAX} />
          <button className="btn-primary mt-4 w-full zrv-auth-submit" type="submit" disabled={pending}>
            <OrvexaIcon name="shield-check" className="size-4" /> {pending ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </>
    )
  } else {
    body = (
      <>
        <AuthenticatorSetup material={material} />
        <p className="zrv-mfa-meta">Your previous authenticator keeps working until this step is confirmed.</p>
        {error && <p ref={alertRef} tabIndex={-1} className="zrv-auth-feedback zrv-auth-feedback--error" role="alert">{error}</p>}
        <form className="mt-4 text-left" onSubmit={confirm} noValidate>
          <MfaCodeInput ref={codeRef} id="recovery-code" value={code} onChange={setCode} error={fieldErrors.code} disabled={pending} />
          <button className="btn-primary mt-4 w-full zrv-auth-submit" type="submit" disabled={pending}>
            <OrvexaIcon name="shield-check" className="size-4" /> {pending ? 'Confirming…' : 'Confirm new authenticator'}
          </button>
        </form>
      </>
    )
  }

  return (
    <main className="system-state zrv-auth-page">
      <section className="system-card !max-w-[520px]" aria-labelledby="mfa-recovery-title">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in srgb,var(--primary) 11%,transparent)', color: 'var(--primary-text)' }}><OrvexaIcon name="key-round" className="size-6" /></span>
        <h1 id="mfa-recovery-title">{done ? 'Authenticator recovered' : 'Recover your authenticator'}</h1>
        {!done && <p>Confirm your password, then set up a new authenticator app for your Zamil Revamp account. This link works once and expires 15 minutes after it was sent.</p>}
        {body}
        {!done && <Link className="btn-secondary mt-3" to="/login" replace onClick={cancel}>Back to sign in</Link>}
      </section>
    </main>
  )
}
