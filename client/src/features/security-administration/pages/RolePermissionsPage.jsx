import { useState } from 'react'
import { useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '../adminFeedback.js'
import { isRecordId, permissionLabel } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, ConfirmDialog, Feedback, Pagination, Panel, ResourceState } from '../components/AdminUi.jsx'
import RoleGrantDialog from '../components/RoleGrantDialog.jsx'

const ROLE_PAGE_SIZE = 100

// Permissions granted to a role (ROLE_PERMISSIONS). Granting selects one or more
// backend permission IDs from the live catalogue (PERMISSION_CATALOG:VIEW) and
// sends them one at a time (RoleGrantDialog). Grants and revocations are
// idempotent on the server; each result says whether anything changed.
// Escalation and protected-role rules are enforced by the backend. Every dialog
// is bound to the role it was opened for: if the selected role changes
// (for example through browser navigation), that dialog is no longer shown.
export default function RolePermissionsPage() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const roleParam = searchParams.get('role')
  const roleId = isRecordId(roleParam) ? roleParam : null
  const [page, setPage] = useState(1)
  const [showRevoked, setShowRevoked] = useState(false)
  const [dialogState, setDialog] = useState(null)
  const roles = useResource(`roles:${page}:${ROLE_PAGE_SIZE}`, (signal) => securityAdminService.listRoles({ page, limit: ROLE_PAGE_SIZE }, { signal }))
  const grants = useResource(roleId ? `role-grants:${roleId}` : null, (signal) => securityAdminService.listRolePermissions(roleId, { signal }))
  const action = useAdminAction()
  const role = roles.data?.items.find((item) => item.roleId === roleId) ?? null
  const roleLabel = role ? role.roleCode : roleId ? `role ${roleId}` : ''
  const canGrant = can(SECURITY_ACTIONS.ROLE_PERMISSIONS_GRANT) && can(SECURITY_ACTIONS.PERMISSION_CATALOG_VIEW)
  const canRevoke = can(SECURITY_ACTIONS.ROLE_PERMISSIONS_REVOKE)
  const dialog = dialogState?.roleId === roleId ? dialogState : null
  // Granting needs the role itself: loaded from the role list and active.
  const grantBlocked = !role ? 'Select the role from the role list to grant permissions' : !role.isActive ? 'Inactive roles cannot receive permissions' : null

  const select = (id) => {
    action.setFeedback(null)
    setSearchParams(id ? { role: id } : {})
  }
  const open = (next) => {
    action.setFeedback(null)
    setDialog({ ...next, roleId })
  }
  const close = () => setDialog(null)
  const finish = (outcome) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    grants.reload()
  }

  // The grant dialog checks "already granted" against freshly loaded grants.
  const openGrant = () => {
    if (grantBlocked) return
    grants.reload()
    open({ type: 'grant' })
  }
  const grantsFinished = () => {
    close()
    grants.reload()
  }

  return (
    <AdminPage title="Role permissions" description="Choose a role to review, grant or revoke its permissions.">
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      <div className="zrv-admin-split">
        <Panel title="Roles">
          <ResourceState resource={roles} label="roles" empty="No roles are defined.">
            {({ items, pagination }) => (
              <>
                <ul className="zrv-admin-menu" aria-label="Roles">
                  {items.map((item) => (
                    <li key={item.roleId}>
                      <button type="button" aria-pressed={item.roleId === roleId} onClick={() => select(item.roleId)}>
                        <span><b>{item.roleName || item.roleCode}</b><small className="zrv-admin-sub"><code>{item.roleCode}</code></small></span>
                        <ActiveBadge active={item.isActive} />
                      </button>
                    </li>
                  ))}
                </ul>
                <Pagination pagination={pagination} onPage={setPage} disabled={roles.refreshing} label="Role pages" />
              </>
            )}
          </ResourceState>
        </Panel>

        <Panel
          title={roleId ? `Permissions of ${roleLabel}` : 'Permissions'}
          actions={roleId && canGrant && (
            <button type="button" className="btn-primary" onClick={openGrant} disabled={Boolean(grantBlocked)} title={grantBlocked ?? undefined}>
              <OrvexaIcon name="plus" className="size-4" /> Grant permissions
            </button>
          )}
        >
          {!roleId ? <p className="zrv-admin-state">Select a role.</p> : (
            <>
              {role && !role.isActive && <p className="zrv-admin-note" role="note">This role is inactive: its permissions do not apply, and no permission can be granted to it.</p>}
              <label className="zrv-admin-check">
                <input type="checkbox" checked={showRevoked} onChange={(event) => setShowRevoked(event.target.checked)} /> Show revoked grants
              </label>
              <ResourceState resource={grants} label="role permissions" empty={showRevoked ? 'This role has no grants.' : 'This role holds no permissions.'} isEmpty={(data) => !data.some((item) => showRevoked || item.isActive)}>
                {(data) => (
                  <div className="ux-table-wrap">
                    <table className="ux-table zrv-admin-table" aria-busy={grants.refreshing || undefined}>
                      <caption className="sr-only">Permissions of {roleLabel}</caption>
                      <thead><tr><th scope="col">Permission</th><th scope="col">Grant</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                      <tbody>
                        {data.filter((item) => showRevoked || item.isActive).map((item) => (
                          <tr key={item.permissionId}>
                            <td><code>{permissionLabel(item)}</code></td>
                            <td><ActiveBadge active={item.isActive} activeLabel="Granted" inactiveLabel="Revoked" /></td>
                            <td>{formatInstant(item.updatedAt || item.createdAt)}</td>
                            <td>{canRevoke && item.isActive && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'revoke', grant: item })}>Revoke<span className="sr-only"> {permissionLabel(item)}</span></button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ResourceState>
            </>
          )}
        </Panel>
      </div>

      {dialog?.type === 'grant' && role?.isActive && (
        <RoleGrantDialog roleId={dialog.roleId} roleLabel={roleLabel} grants={grants} action={action} onClose={close} onFinished={grantsFinished} />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmDialog
          danger title="Revoke this permission?" confirmLabel="Revoke" pending={action.pending} feedback={action.feedback} onClose={close}
          description={`${permissionLabel(dialog.grant)} is removed from ${roleLabel}. Accounts that hold it only through this role lose it immediately.`}
          onConfirm={async () => finish(await action.run(() => securityAdminService.revokeRolePermission(dialog.roleId, dialog.grant.permissionId), {
            success: (result) => result.changed ? `${permissionLabel(dialog.grant)} revoked from ${roleLabel}.` : 'The permission was already revoked; nothing changed.',
            refreshAccess: true,
          }))}
        />
      )}
    </AdminPage>
  )
}
