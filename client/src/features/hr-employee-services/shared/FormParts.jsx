// A rating on the legacy A / AS / BS / CS scale (Reward Nomination): native
// radios styled as chips in a labelled radio group (Tab enters the group,
// arrow keys move the choice). `scale`: [{ code, label }] from the criteria
// lookup, shown in RATING_ORDER (above → below standard).
import { RATING_ORDER, RATING_TONE } from '../reward/rewardModel.js'

export function RatingChips({ name, labelledBy, scale, value, onChange, error }) {
  const options = RATING_ORDER.map((code) => scale.find((item) => item.code === code)).filter(Boolean)
  return (
    <div className={error ? 'zrv-hr-is-bad' : undefined}>
      <div className="zrv-hr-esf-chips" role="radiogroup" aria-labelledby={labelledBy} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}>
        {options.map((item) => (
          <label key={item.code} className={`zrv-hr-esf-chip zrv-hr-is-${RATING_TONE[item.code]}${value === item.code ? ' zrv-hr-is-on' : ''}`}>
            <input type="radio" name={name} value={item.code} checked={value === item.code} onChange={() => onChange(item.code)} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      {error && <small id={`${name}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}
