import { useId } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import '@/styles/animated-security-shield.css'

const PASSWORD_REQUIREMENTS = [
  { code: 'MIN_LENGTH', label: 'At least 8 characters', position: 'top-left' },
  { code: 'UPPERCASE', label: 'An uppercase letter', position: 'top-right' },
  { code: 'LOWERCASE', label: 'A lowercase letter', position: 'middle-left' },
  { code: 'DIGIT', label: 'A number', position: 'middle-right' },
  { code: 'SPECIAL_CHARACTER', label: 'A symbol (not a letter or number)', position: 'bottom-left' },
]

const strengthColor = (strength, hasInput) => {
  if (!hasInput) return '#789184'
  if (strength >= 100) return '#075d3b'
  if (strength >= 60) return '#e3b52d'
  return '#c94747'
}

export default function AnimatedSecurityShield({
  strength = 0,
  requirements = [],
  hasInput = false,
  success = false,
}) {
  const gradientId = `security-shield-${useId().replaceAll(':', '')}`
  const activeRings = strength >= 100 ? 3 : strength >= 70 ? 2 : strength >= 40 ? 1 : 0
  const requirementState = new Map(requirements.map(({ code, met }) => [code, met]))
  const sceneColor = success ? '#075d3b' : strengthColor(strength, hasInput)

  return (
    <div
      className={`zrv-security-scene${success ? ' is-success' : ''}`}
      data-active-rings={success ? 3 : activeRings}
      data-has-input={hasInput || success}
      style={{
        '--security-strength-color': sceneColor,
        '--security-strength': strength,
        '--security-lock-scale': 0.96 + strength / 500,
        '--security-lock-rotation': `${strength * 0.04}deg`,
        '--security-lock-lift': `${Math.min(strength, 100) * -0.12}px`,
      }}
      aria-hidden={success ? undefined : true}
    >
      <span className="zrv-security-scene__ambient" />
      <svg className="zrv-security-orbits" viewBox="0 0 400 250" aria-hidden="true" focusable="false">
        <g className="zrv-security-orbit zrv-security-orbit--back">
          <ellipse cx="200" cy="125" rx="143" ry="52" />
          <circle cx="61" cy="112" r="3" />
        </g>
        <g className="zrv-security-orbit zrv-security-orbit--front">
          <ellipse cx="200" cy="125" rx="124" ry="73" />
          <circle cx="315" cy="79" r="3" />
        </g>
        <g className="zrv-security-orbit zrv-security-orbit--slow">
          <ellipse cx="200" cy="125" rx="102" ry="88" />
        </g>
      </svg>

      <div className="zrv-security-platform">
        <span />
        <span />
        <span />
      </div>

      <div className={`zrv-security-shield${success ? ' zrv-security-shield--success' : ''}`}>
        <svg viewBox="0 0 128 148" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop className="zrv-security-shield__gradient-start" offset="0" />
              <stop className="zrv-security-shield__gradient-middle" offset="0.5" />
              <stop className="zrv-security-shield__gradient-end" offset="1" />
            </linearGradient>
          </defs>
          <path
            className="zrv-security-shield__edge"
            d="M64 5 116 25v39c0 34-20 61-52 78C32 125 12 98 12 64V25L64 5Z"
          />
          <path
            className="zrv-security-shield__body"
            fill={`url(#${gradientId})`}
            d="M64 8 113 27v37c0 32-19 57-49 74C34 121 15 96 15 64V27L64 8Z"
          />
          <path
            className="zrv-security-shield__shine"
            d="M64 17 23 33v30c0 23 12 43 31 57-7-15-11-32-11-50V33l21-8 21 8v-8L64 17Z"
          />
        </svg>
        <span className="zrv-security-shield__lock">
          <OrvexaIcon name={success ? 'unlock-keyhole' : 'lock-keyhole'} size={35} />
        </span>
      </div>

      {!success && PASSWORD_REQUIREMENTS.map(({ code, label, position }, index) => {
        const met = requirementState.get(code)
        const state = met === true ? 'met' : met === false ? 'unmet' : 'unknown'
        return (
          <div
            className={`zrv-security-card zrv-security-card--${position} is-${state}`}
            style={{ '--security-card-delay': `${index * -0.8}s` }}
            key={code}
          >
            <b>{label}</b>
            <span className="zrv-security-card__state"><i /></span>
          </div>
        )
      })}

      {!success && (
        <div className="zrv-security-meter" aria-hidden="true">
          <span>Password strength</span>
          <b>{hasInput ? strength : 0}%</b>
        </div>
      )}

      {success && (
        <div className="zrv-security-success" role="status">
          <strong>Password updated successfully</strong>
          <span>All devices are signed out. Sign in again with your new password.</span>
        </div>
      )}

      <span className="zrv-security-particle zrv-security-particle--one" />
      <span className="zrv-security-particle zrv-security-particle--two" />
      <span className="zrv-security-particle zrv-security-particle--three" />
      <span className="zrv-security-particle zrv-security-particle--four" />
    </div>
  )
}
