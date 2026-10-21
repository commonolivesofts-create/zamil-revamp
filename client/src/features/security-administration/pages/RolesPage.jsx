import { useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { canAccessRoute, findAppRoute } from '@/config/appNavigation.js'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '../adminFeedback.js'
import { PAGE_SIZE, permissionLabel } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, ConfirmDialog, DetailList, Feedback, Pagination, Panel, ResourceState } from '../components/AdminUi.jsx'
import RoleFormDialog from '../components/RoleFormDialog.jsx'

// Roles from the backend's role definitions (ROLES). Protected administrator
// roles are not singled out here: the backend refuses changes to them and its
// message is shown.
export default function RolesPage() {
  const access = usePermissions()
  const { can } = access
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [dialog, setDialog] = useState(null)
  const roles = useResource(`roles:${page}`, (signal) => securityAdminService.listRoles({ page, limit: PAGE_SIZE }, { signal }))
  const action = useAdminAction()
  const selected = roles.data?.items.find((role) => role.roleId === selectedId) ?? null
  const showGrants = can(SECURITY_ACTIONS.ROLE_PERMISSIONS_VIEW)
  const grants = useResource(selected && showGrants ? `role-grants:${selected.roleId}` : null, (signal) => securityAdminService.listRolePermissions(selected.roleId, { signal }))
  const manageGrants = canAccessRoute(findAppRoute('/security/role-permissions'), access)

  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }
  const close = () => setDialog(null)
  const finish = (outcome, { select } = {}) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') {
      close()
      if (select) setSelectedId(select)
    }
    roles.reload()
  }

  return (
    <AdminPage
      title="Roles"
      description="Roles group permissions. Assigning a role to an account grants every permission the role holds."
      actions={can(SECURITY_ACTIONS.ROLES_CREATE) && (
        <button type="button" className="btn-primary" onClick={() => open({ type: 'create' })}><OrvexaIcon name="plus" className="size-4" /> Create role</button>
      )}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      <div className="zrv-admin-split">
        <Panel title="All roles">
          <ResourceState resource={roles} label="roles" empty="No roles are defined." isEmpty={(data) => data.items.length === 0}>
            {({ items, pagination }) => (
              <>
                <div className="ux-table-wrap">
                  <table className="ux-table zrv-admin-table zrv-admin-table--compact" aria-busy={roles.refreshing || undefined}>
                    <caption className="sr-only">Roles</caption>
                    <thead><tr><th scope="col">Role</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                    <tbody>
                      {items.map((role) => (
                        <tr key={role.roleId} className={role.roleId === selectedId ? 'is-selected' : undefined}>
                          <td><b>{role.roleName || role.roleCode}</b><small className="zrv-admin-sub"><code>{role.roleCode}</code></small></td>
                          <td><ActiveBadge active={role.isActive} /></td>
                          <td>
                            <button type="button" className="zrv-admin-link" aria-pressed={role.roleId === selectedId} onClick={() => setSelectedId(role.roleId)}>
                              Details<span className="sr-only"> for {role.roleCode}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={pagination} onPage={(next) => { setSelectedId(null); setPage(next) }} disabled={roles.refreshing} label="Role pages" />
              </>
            )}
          </ResourceState>
        </Panel>

        <Panel
          title={selected ? selected.roleName || selected.roleCode : 'Role details'}
          actions={selected && <>
            {can(SECURITY_ACTIONS.ROLES_UPDATE) && <button type="button" className="btn-secondary" onClick={() => open({ type: 'edit' })}>Edit</button>}
            {can(SECURITY_ACTIONS.ROLES_UPDATE) && !selected.isActive && <button type="button" className="btn-secondary" onClick={() => open({ type: 'activate' })}>Activate</button>}
            {can(SECURITY_ACTIONS.ROLES_DEACTIVATE) && selected.isActive && <button type="button" className="btn-secondary zrv-admin-danger-outline" onClick={() => open({ type: 'deactivate' })}>Deactivate</button>}
          </>}
        >
          {!selected ? <p className="zrv-admin-state">Select a role to see its details.</p> : (
            <>
              <DetailList items={[
                ['Code', <code key="c">{selected.roleCode}</code>],
                ['Status', <ActiveBadge key="s" active={selected.isActive} />],
                ['Description', selected.description],
                ['Created', formatInstant(selected.createdAt)],
                ['Updated', selected.updatedAt && formatInstant(selected.updatedAt)],
              ]} />
              {showGrants && (
                <div className="zrv-admin-subsection">
                  <div className="zrv-admin-subsection__head">
                    <h3>Granted permissions</h3>
                    {manageGrants && <Link className="zrv-admin-link" to={`/security/role-permissions?role=${selected.roleId}`}>Manage permissions</Link>}
                  </div>
                  <ResourceState resource={grants} label="role permissions" empty="This role holds no permissions." isEmpty={(data) => !data.some((grant) => grant.isActive)}>
                    {(data) => (
                      <ul className="zrv-admin-chips">
                        {data.filter((grant) => grant.isActive).map((grant) => <li key={grant.permissionId}><code>{permissionLabel(grant)}</code></li>)}
                      </ul>
                    )}
                  </ResourceState>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {dialog?.type === 'create' && <RoleFormDialog action={action} onClose={close} onSaved={(outcome) => finish(outcome, { select: outcome.value?.roleId })} />}
      {dialog?.type === 'edit' && selected && <RoleFormDialog role={selected} action={action} onClose={close} onSaved={finish} />}
      {dialog?.type === 'activate' && selected && (
        <ConfirmDialog
          title={`Activate role ${selected.roleCode}?`} confirmLabel="Activate" pending={action.pending} feedback={action.feedback} onClose={close}
          description="Accounts assigned to this role regain its permissions immediately."
          onConfirm={async () => finish(await action.run(() => securityAdminService.activateRole(selected.roleId), { success: `Role ${selected.roleCode} activated.` }))}
        />
      )}
      {dialog?.type === 'deactivate' && selected && (
        <ConfirmDialog
          danger title={`Deactivate role ${selected.roleCode}?`} confirmLabel="Deactivate" pending={action.pending} feedback={action.feedback} onClose={close}
          description="Accounts assigned to this role lose its permissions immediately. Assignments and grants are kept and apply again if the role is reactivated."
          onConfirm={async () => finish(await action.run(() => securityAdminService.deactivateRole(selected.roleId), { success: `Role ${selected.roleCode} deactivated.` }))}
        />
      )}
    </AdminPage>
  )
}
