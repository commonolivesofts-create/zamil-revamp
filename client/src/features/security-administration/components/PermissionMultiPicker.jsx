import { fieldProps } from '../adminForms.js'
import { Field } from './AdminUi.jsx'

const SHOWN = 100

// Checkbox list of grantable permissions (existing catalogue permission IDs). Permissions the role
// already holds are shown checked and unavailable; revoked grants can be selected again. The
// selection is kept by permission ID, so it survives search changes; selected entries that the
// current search hides are still counted and listed. Native checkboxes keep keyboard and
// screen-reader behaviour.
export default function PermissionMultiPicker({ options, selected, selectedLabels, search, onSearch, onToggle, disabled = false }) {
  const visible = options.slice(0, SHOWN)
  return (
    <div className="zrv-admin-picker">
      <Field id="grant-search" label="Find permissions" hint="Module, resource, permission code or description">
        <input {...fieldProps('grant-search', { hint: true })} data-autofocus className="ux-input" type="search" value={search} maxLength={100} onChange={(event) => onSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} disabled={disabled} />
      </Field>
      <p className="zrv-admin-hint" role="status" aria-live="polite">
        {selected.length ? `${selected.length} selected: ${selectedLabels.join(', ')}` : 'No permission selected.'}
      </p>
      {visible.length ? (
        <fieldset className="zrv-admin-choices zrv-admin-choices--scroll">
          <legend className="sr-only">Grantable permissions</legend>
          {visible.map((item) => {
            const id = `grant-${item.permissionId}`
            const granted = item.grantState === 'granted'
            return (
              <label key={item.permissionId} htmlFor={id} className="zrv-admin-choice">
                <input id={id} type="checkbox" checked={granted || selected.includes(item.permissionId)} onChange={() => onToggle(item.permissionId)} disabled={disabled || granted} />
                <span>
                  <code>{item.key}</code>
                  {granted && <small className="zrv-admin-sub"> — already granted</small>}
                  {item.grantState === 'revoked' && <small className="zrv-admin-sub"> — previously revoked; granting reactivates it</small>}
                  {item.description && <small className="zrv-admin-sub">{item.description}</small>}
                </span>
              </label>
            )
          })}
          {options.length > SHOWN && <p className="zrv-admin-hint">Showing {SHOWN} of {options.length}. Refine the search to see others; selections are kept.</p>}
        </fieldset>
      ) : (
        <p className="zrv-admin-state" role="status">No grantable permission matches.</p>
      )}
    </div>
  )
}
