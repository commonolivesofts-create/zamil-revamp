import { useState } from 'react'
import { Link, useParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import RouteNotice from '@/pages/RouteNotice.jsx'
import { fieldProps, readFutureInstant } from '../adminForms.js'
import { formatInstant } from '../adminFeedback.js'
import { isRecordId } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import useAccountSubject from '../useAccountSubject.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, ConfirmDialog, Dialog, DialogActions, Feedback, Field, Panel, ResourceState } from '../components/AdminUi.jsx'
import EffectivePermissions from '../components/EffectivePermissions.jsx'

function AssignRoleDialog({ userId, subject, assignedIds, action, onClose, onDone }) {
  const roles = useResource('roles:all', (signal) => securityAdminService.listAllRoles({ signal }))
  const [roleId, setRoleId] = useState('')
  const [expiry, setExpiry] = useState('')
  const [error, setError] = useState(null)
  const options = (roles.data?.items || []).filter((role) => role.isActive && !assignedIds.includes(role.roleId))
  const role = options.find((item) => item.roleId === roleId)

  const submit = async (event) => {
    event.preventDefault()
    const expiresAt = readFutureInstant(expiry)
    setError(expiresAt.error || (role ? null : 'Choose a role.'))
    if (expiresAt.error || !role) return
    onDone(await action.run(() => securityAdminService.assignUserRole(userId, role.roleId, { expiresAt: expiresAt.value }), {
      success: (result) => `${role.roleCode} assigned to ${subject}${result.expiresAt ? ` until ${formatInstant(result.expiresAt)}` : ''}.`,
    }))
  }

  return (
    <Dialog title={`Assign a role to ${subject}`} description="The account receives every permission of the role immediately. You can only assign roles whose permissions you hold yourself." onClose={onClose} busy={action.pending}>
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        <ResourceState resource={roles} label="roles" empty="No roles are defined." isEmpty={(data) => data.items.length === 0}>
          {(data) => options.length ? (
            <Field id="assign-role" label="Role" hint={data.complete ? undefined : `Only the first ${data.items.length} roles could be listed.`}>
              <select {...fieldProps('assign-role', { hint: !data.complete })} data-autofocus className="ux-select" value={roleId} onChange={(event) => setRoleId(event.target.value)} disabled={action.pending}>
                <option value="">Choose a role</option>
                {options.map((item) => <option key={item.roleId} value={item.roleId}>{item.roleName || item.roleCode} ({item.roleCode})</option>)}
              </select>
            </Field>
          ) : <p className="zrv-admin-state" role="status">Every active role is already assigned to this account.</p>}
        </ResourceState>
        <Field id="assign-expiry" label="Expires (optional)" hint="Leave empty for an assignment without an end date">
          <input {...fieldProps('assign-expiry', { hint: true })} className="ux-input" type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={action.pending} />
        </Field>
        {error && <p className="zrv-auth-field-error" role="alert">{error}</p>}
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmLabel="Assign role" pendingLabel="Assigning…" confirmDisabled={!role} />
      </form>
    </Dialog>
  )
}

// Role assignments of one account (USER_ROLES). Assigning needs ROLES:VIEW to
// choose a role. The backend refuses protected roles, administrator accounts
// (except for the Super Administrator), self-changes and escalation.
export default function UserRoleAssignmentsPage() {
  const { userId } = useParams()
  const valid = isRecordId(userId)
  const { can } = usePermissions()
  const subject = useAccountSubject(valid ? userId : null)
  const assignments = useResource(valid ? `user-roles:${userId}` : null, (signal) => securityAdminService.listUserRoles(userId, { signal }))
  const action = useAdminAction()
  const [dialog, setDialog] = useState(null)
  const [version, setVersion] = useState(0)

  if (!valid) return <RouteNotice eyebrow="Not found" title="This account does not exist" description="The account link is invalid." to="/security/user-roles" actionLabel="Back to user roles" />

  const canChange = !subject.isSelf
  const canAssign = canChange && can(SECURITY_ACTIONS.USER_ROLES_ASSIGN) && can(SECURITY_ACTIONS.ROLES_VIEW)
  const canRevoke = canChange && can(SECURITY_ACTIONS.USER_ROLES_REVOKE)
  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }
  const close = () => setDialog(null)
  const finish = (outcome) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    assignments.reload()
    setVersion((value) => value + 1)
  }

  return (
    <AdminPage
      eyebrow="User roles"
      title={subject.label}
      description={subject.employeeNumber ? `Employee ${subject.employeeNumber}` : null}
      actions={<>
        {canAssign && <button type="button" className="btn-primary" onClick={() => open({ type: 'assign' })}><OrvexaIcon name="plus" className="size-4" /> Assign role</button>}
        {subject.canViewAccount && <Link className="btn-secondary" to={`/security/users/${userId}`}>Account</Link>}
        <Link className="btn-secondary" to="/security/user-roles"><OrvexaIcon name="arrow-left" className="size-4" /> All accounts</Link>
      </>}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      {subject.isSelf && <p className="zrv-admin-note" role="note">This is your own account. Nobody can change their own roles.</p>}
      <div className="zrv-admin-grid">
        <Panel title="Assigned roles" className="zrv-admin-grid__wide">
          <ResourceState resource={assignments} label="role assignments" empty="No roles are assigned to this account.">
            {(data) => (
              <div className="ux-table-wrap">
                <table className="ux-table zrv-admin-table" aria-busy={assignments.refreshing || undefined}>
                  <caption className="sr-only">Assigned roles</caption>
                  <thead><tr><th scope="col">Role</th><th scope="col">Assignment</th><th scope="col">Role status</th><th scope="col">Expires</th><th scope="col">Effective</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {data.map((item) => (
                      <tr key={item.roleId}>
                        <td><b>{item.roleName || item.roleCode}</b><small className="zrv-admin-sub"><code>{item.roleCode}</code></small></td>
                        <td><ActiveBadge active={item.isActive} activeLabel="Assigned" inactiveLabel="Revoked" /></td>
                        <td><ActiveBadge active={item.roleActive} /></td>
                        <td>{item.expiresAt ? formatInstant(item.expiresAt) : 'No end date'}</td>
                        <td>{item.effective ? 'Yes' : 'No'}</td>
                        <td>{canRevoke && item.isActive && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'revoke', role: item })}>Revoke<span className="sr-only"> {item.roleCode}</span></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ResourceState>
        </Panel>
        <EffectivePermissions userId={userId} version={version} />
      </div>

      {dialog?.type === 'assign' && (
        <AssignRoleDialog
          userId={userId} subject={subject.label} action={action} onClose={close} onDone={finish}
          assignedIds={(assignments.data || []).filter((item) => item.isActive).map((item) => item.roleId)}
        />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmDialog
          danger title={`Revoke ${dialog.role.roleCode}?`} confirmLabel="Revoke role" pending={action.pending} feedback={action.feedback} onClose={close}
          description={`${subject.label} loses every permission held only through this role, immediately.`}
          onConfirm={async () => finish(await action.run(() => securityAdminService.unassignUserRole(userId, dialog.role.roleId), {
            success: (result) => result.changed ? `${dialog.role.roleCode} revoked from ${subject.label}.` : 'The role was already revoked; nothing changed.',
          }))}
        />
      )}
    </AdminPage>
  )
}
