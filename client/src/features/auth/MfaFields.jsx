import { forwardRef, useMemo } from 'react'
import { sanitizeMfaCode } from './authContract.js'
import { authenticatorQr, formatSetupKey } from './authenticatorQr.js'

// Six-digit authenticator code. The value stays a string so leading zeros are kept.
// No maxLength: a pasted code such as "123 456" must be sanitised whole before
// it is limited to six digits.
export const MfaCodeInput = forwardRef(function MfaCodeInput({ id, value, onChange, error, disabled }, ref) {
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>Authentication code</label>
      <input
        ref={ref}
        id={id}
        className="ux-input zrv-mfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(sanitizeMfaCode(event.target.value))}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        required
      />
      {error && <small id={errorId} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
})

// QR code (encoded locally) plus the manual setup key. Setup material lives
// only in the calling page's state and is discarded when that page unmounts.
export function AuthenticatorSetup({ material }) {
  const qr = useMemo(() => authenticatorQr(material.otpauthUri), [material.otpauthUri])
  return (
    <div className="mt-4">
      {qr && (
        <svg className="zrv-mfa-qr" viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} role="img" aria-label="QR code for setting up your authenticator app" shapeRendering="crispEdges">
          <rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" />
          <path d={qr.path} fill="#000" />
        </svg>
      )}
      <p className="zrv-mfa-meta">Can’t scan? Add the account <b>{material.issuer}</b> · <b>{material.accountName}</b> manually with this setup key (time-based, 6 digits):</p>
      <code className="zrv-mfa-key" translate="no" aria-label="Setup key">{formatSetupKey(material.secret)}</code>
    </div>
  )
}
