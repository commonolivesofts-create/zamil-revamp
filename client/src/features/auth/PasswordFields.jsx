import { forwardRef, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { policyRules } from './passwordPolicy.js'

// Password input with a visibility toggle. The value is never trimmed.
// `labelAddon` renders after the label text (the login page's "Forgot?" link).
export const PasswordInput = forwardRef(function PasswordInput({
  id, label, value, onChange, error, disabled, autoComplete, maxLength, describedBy, labelAddon,
}, ref) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  const described = [error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}{labelAddon && <> {labelAddon}</>}</label>
      <div className="zrv-password-input">
        <input
          ref={ref}
          id={id}
          className="ux-input"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={maxLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={described}
          required
        />
        <button type="button" className="zrv-password-toggle" onClick={() => setVisible((current) => !current)} disabled={disabled} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={id}>
          <OrvexaIcon name={visible ? 'eye-off' : 'eye'} className="size-4" />
        </button>
      </div>
      {error && <small id={errorId} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
})

// Live checklist of the backend policy. Without a loaded policy nothing is
// claimed: the caller shows the loading or unavailable state instead.
export function PasswordPolicyChecklist({ id, policy, password }) {
  return (
    <ul id={id} className="zrv-policy-list" aria-label="Password requirements">
      {policyRules(policy).filter((rule) => rule.code !== 'MAX_LENGTH' || password).map((rule) => {
        const met = Boolean(password) && rule.met(password)
        return (
          <li key={rule.code} className={met ? 'is-met' : undefined}>
            <OrvexaIcon name={met ? 'circle-check' : 'circle'} className="size-3.5" />
            <span>{rule.label}<span className="sr-only">{met ? ' (met)' : ' (not met)'}</span></span>
          </li>
        )
      })}
    </ul>
  )
}
