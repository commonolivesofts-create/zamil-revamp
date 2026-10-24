import { useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { describeFailure } from '../adminFeedback.js'
import { grantDataProblem, grantOptions, grantPermissionsSequentially, summarizeGrantResults, toggleGrant, validSelection } from '../roleGrants.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import { Dialog, DialogActions, Feedback, ResourceState } from './AdminUi.jsx'
import PermissionMultiPicker from './PermissionMultiPicker.jsx'

// Grant several existing permissions to one role with a single confirmation. `roleId` is fixed
// when the dialog opens; the grants are sent one at a time through the existing single-grant
// API, each its own audited backend transaction (never all-or-nothing, never retried). Granting
// waits until the catalogue and the role's grants are freshly loaded and known to be complete.
export default function RoleGrantDialog({ roleId, roleLabel, grants, action, onClose, onFinished }) {
  const { reload: reloadPermissions } = usePermissions()
  const catalog = useResource('catalog', (signal) => securityAdminService.getCatalog({ signal }))
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')

  const fresh = catalog.status === 'ready' && !catalog.refreshing && grants.status === 'ready' && !grants.refreshing
  const data = fresh ? { catalog: catalog.data, grants: grants.data } : null
  const problem = data && grantDataProblem(data)
  const usable = data && !problem
  // Only IDs that are still selectable against the current data are counted and submitted.
  const chosen = usable ? validSelection(selected, data) : []
  const labels = new Map(usable ? grantOptions(data.catalog, data.grants).map((item) => [item.permissionId, item.key]) : [])
  const labelOf = (id) => labels.get(id) ?? `permission ${id}`

  const submit = async () => {
    if (!usable || !chosen.length) return
    const permissionIds = [...chosen]
    const outcome = await action.run(() => grantPermissionsSequentially({
      roleId,
      permissionIds,
      grant: (role, permission) => securityAdminService.grantRolePermission(role, permission),
    }))
    if (outcome.status !== 'success') return
    const result = outcome.value
    if (result.accessMayHaveChanged || result.results.some((item) => describeFailure(item.error).permissionChanged)) reloadPermissions()
    action.setFeedback(summarizeGrantResults(result, { describeFailure, labelOf, roleLabel }))
    onFinished()
  }

  return (
    <Dialog title={`Grant permissions to ${roleLabel}`} description="Every account assigned to this role receives the granted permissions immediately. Each permission is granted separately." onClose={onClose} busy={action.pending} wide>
      <ResourceState resource={catalog} label="permission catalog" empty="The permission catalog is empty.">
        {() => !data ? (
          <p className="zrv-admin-state" role="status">Loading the role's current grants…</p>
        ) : problem ? (
          <p className="zrv-admin-state" role="alert">{problem}</p>
        ) : (
          <PermissionMultiPicker
            options={grantOptions(data.catalog, data.grants, search)}
            selected={chosen}
            selectedLabels={chosen.map(labelOf)}
            search={search}
            onSearch={setSearch}
            onToggle={(id) => setSelected((current) => toggleGrant(validSelection(current, data), id, data))}
            disabled={action.pending}
          />
        )}
      </ResourceState>
      <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
      <DialogActions
        onCancel={onClose}
        pending={action.pending}
        confirmLabel={chosen.length ? `Grant ${chosen.length} ${chosen.length === 1 ? 'permission' : 'permissions'}` : 'Grant'}
        pendingLabel="Granting…"
        confirmDisabled={!usable || !chosen.length}
        onConfirm={submit}
      />
    </Dialog>
  )
}
