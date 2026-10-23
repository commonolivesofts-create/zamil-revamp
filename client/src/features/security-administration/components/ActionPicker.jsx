import { useState } from 'react'
import { fieldProps } from '../adminForms.js'
import { actionOptions } from '../catalogActions.js'
import { Field } from './AdminUi.jsx'

// Searchable multi-select of the standard action codes (config/registry/actions.js). Actions the
// resource already has (active or inactive) are shown checked and unavailable, so they can never
// be selected or submitted again. Native checkboxes keep keyboard and screen-reader behaviour.
export default function ActionPicker({ existing, selected, onToggle, disabled = false }) {
  const [search, setSearch] = useState('')
  const options = actionOptions(existing, search)

  return (
    <div className="zrv-admin-picker">
      <Field id="action-search" label="Find actions" hint="Code, name, category or description">
        <input {...fieldProps('action-search', { hint: true })} data-autofocus className="ux-input" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} disabled={disabled} />
      </Field>
      <p className="zrv-admin-hint" role="status" aria-live="polite">
        {selected.length ? `${selected.length} selected: ${selected.join(', ')}` : 'No action selected.'}
      </p>
      {options.length ? (
        <fieldset className="zrv-admin-choices zrv-admin-choices--scroll">
          <legend className="sr-only">Standard actions</legend>
          {options.map((option) => {
            const id = `action-${option.code}`
            const present = option.existing !== null
            return (
              <label key={option.code} htmlFor={id} className="zrv-admin-choice">
                <input
                  id={id}
                  type="checkbox"
                  checked={present || selected.includes(option.code)}
                  onChange={() => onToggle(option.code)}
                  disabled={disabled || present}
                  aria-describedby={`${id}-description`}
                />
                <span>
                  <code>{option.code}</code> {option.name} <small className="zrv-admin-sub">· {option.categoryLabel}</small>
                  {present && <small className="zrv-admin-sub"> — {option.existing === 'active' ? 'already exists' : 'already exists but is inactive (grants nothing until activated)'}</small>}
                  <small id={`${id}-description`} className="zrv-admin-sub">{option.description}</small>
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <p className="zrv-admin-state" role="status">No standard action matches.</p>
      )}
    </div>
  )
}
