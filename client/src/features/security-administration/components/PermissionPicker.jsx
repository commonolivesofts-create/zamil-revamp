import { useState } from 'react'
import { fieldProps } from '../adminForms.js'
import { grantablePermissions } from '../adminModel.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import { Field, ResourceState } from './AdminUi.jsx'

const SHOWN = 50

// Choose one permission from the live catalogue (GET /access-control/catalog,
// PERMISSION_CATALOG:VIEW). Only permissions whose module, resource and action
// are all active are offered, using their backend permission IDs.
export default function PermissionPicker({ selectedId, onSelect, excludeIds = [], disabled = false }) {
  const catalog = useResource('catalog', (signal) => securityAdminService.getCatalog({ signal }))
  const [search, setSearch] = useState('')

  return (
    <div className="zrv-admin-picker">
      <Field id="permission-search" label="Find a permission" hint="Module, resource or action">
        <input {...fieldProps('permission-search', { hint: true })} data-autofocus className="ux-input" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} disabled={disabled} />
      </Field>
      <ResourceState resource={catalog} label="permission catalog" empty="The permission catalog is empty.">
        {(data) => {
          const options = grantablePermissions(data, { excludeIds, search })
          if (!options.length) return <p className="zrv-admin-state" role="status">No available permission matches.</p>
          return (
            <fieldset className="zrv-admin-choices zrv-admin-choices--scroll">
              <legend className="sr-only">Permissions</legend>
              {options.slice(0, SHOWN).map((item) => {
                const id = `permission-${item.permissionId}`
                return (
                  <label key={item.permissionId} htmlFor={id} className="zrv-admin-choice">
                    <input id={id} type="radio" name="permission" checked={selectedId === item.permissionId} onChange={() => onSelect(item)} disabled={disabled} />
                    <span><code>{item.key}</code>{item.description && <small className="zrv-admin-sub">{item.description}</small>}</span>
                  </label>
                )
              })}
              {options.length > SHOWN && <p className="zrv-admin-hint">Showing {SHOWN} of {options.length}. Refine the search to see others.</p>}
            </fieldset>
          )
        }}
      </ResourceState>
    </div>
  )
}
