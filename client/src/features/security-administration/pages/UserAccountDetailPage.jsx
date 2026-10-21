import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import RouteNotice from '@/pages/RouteNotice.jsx'
import { describeReason, formatInstant } from '../adminFeedback.js'
import { accountActions, displayName, isRecordId } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, Badge, ConfirmDialog, DetailList, Feedback, Panel, ResourceState } from '../components/AdminUi.jsx'
import AccountLinkDialog from '../components/AccountLinkDialog.jsx'

const yesNo = (value) => (value === null || value === undefined ? null : value ? 'Yes' : 'No')
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function AccountNotices({ user, isSelf }) {
  const { classification } = user
  if (isSelf) return <p className="zrv-admin-note" role="note">This is your own account. Your own account cannot be changed here; use My account for your password and authenticator.</p>
  if (classification.protectedSuperAdministrator) {
    return <p className="zrv-admin-note" role="note">This is the protected Super Administrator account. It cannot be changed by anyone here and is recovered only through its verified self-service recovery.</p>
  }
  if (classification.privilegedRoleMember || classification.securityAdministration) {
    return <p className="zrv-admin-note" role="note">This is an administrator account. Only the Super Administrator can change it or authorize its recovery; other requests are refused by the server.</p>
  }
  return null
}

export default function UserAccountDetailPage() {
  const { userId } = useParams()
  const location = useLocation()
  const { user: me } = useAuth()
  const { can } = usePermissions()
  const valid = isRecordId(userId)
  const detail = useResource(valid ? `user:${userId}` : null, (signal) => securityAdminService.getUser(userId, { signal }))
  const action = useAdminAction()
  const [dialog, setDialog] = useState(null)

  if (!valid) return <RouteNotice eyebrow="Not found" title="This account does not exist" description="The account link is invalid." to="/security/users" actionLabel="Back to user accounts" />

  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }
  const close = () => setDialog(null)

  // Confirmed changes close the dialog; every completed request reloads the
  // account so the page shows the backend's current state (also after an
  // unknown outcome, which is never reported as success).
  const perform = async (operation, success) => {
    const outcome = await action.run(operation, { success })
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    detail.reload()
  }

  const user = detail.data
  const isSelf = Boolean(user && me?.id === user.userId)
  const allowed = user ? accountActions(user, { can, selfId: me?.id }) : null

  return (
    <AdminPage
      eyebrow="User account"
      title={user ? displayName(user) || `Employee ${user.employeeNumber}` : 'User account'}
      description={user ? `Employee ${user.employeeNumber}` : null}
      actions={<>
        {can(SECURITY_ACTIONS.USER_ROLES_VIEW) && <Link className="btn-secondary" to={`/security/user-roles/${userId}`}><OrvexaIcon name="user-check" className="size-4" /> Roles</Link>}
        {can(SECURITY_ACTIONS.USER_PERMISSION_OVERRIDES_VIEW) && <Link className="btn-secondary" to={`/security/permission-overrides/${userId}`}><OrvexaIcon name="shield-half" className="size-4" /> Overrides</Link>}
        <Link className="btn-secondary" to="/security/users"><OrvexaIcon name="arrow-left" className="size-4" /> All accounts</Link>
      </>}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      {!dialog && !action.feedback && location.state?.provisioned && (
        <Feedback feedback={{ kind: 'success', message: 'Account created. It stays pending until the employee sets a password and the account is activated.' }} />
      )}
      <ResourceState resource={detail} label="account" empty="The account was not found.">
        {(account) => (
          <>
            <AccountNotices user={account} isSelf={isSelf} />
            <div className="zrv-admin-grid">
              <Panel title="Account">
                <DetailList items={[
                  ['Status', <Badge key="s">{account.account.status}</Badge>],
                  ['Locked', account.account.locked ? `Until ${formatInstant(account.account.lockedUntil)}` : 'No'],
                  ['Failed sign-in attempts', account.account.failedLoginAttempts ?? null],
                  ['Last failed sign-in', account.account.lastFailedLoginAt && formatInstant(account.account.lastFailedLoginAt)],
                  ['Last sign-in', account.account.lastLoginAt && formatInstant(account.account.lastLoginAt)],
                  ['Created', formatInstant(account.account.createdAt)],
                  ['Updated', account.account.updatedAt && formatInstant(account.account.updatedAt)],
                ]} />
              </Panel>

              <Panel title="Employee" description="From the employee master">
                {account.employee ? (
                  <DetailList items={[
                    ['Username', account.employee.username],
                    ['Full name', account.employee.fullName],
                    ['Email', account.employee.email],
                    ['Job title', account.employee.jobTitle],
                    ['Department', account.employee.department],
                    ['Current employee flag', account.employee.currentEmployeeFlag],
                    ['Termination status', account.employee.terminationStatus],
                    ['Eligibility', account.eligibility.eligible ? 'Eligible' : describeReason(account.eligibility.reason)],
                  ]} />
                ) : <p className="zrv-admin-state">No employee-master record was found for this account.</p>}
              </Panel>

              <Panel title="Sign-in security">
                <DetailList items={[
                  ['Password set', yesNo(account.password.set)],
                  ['Password changed', account.password.changedAt && formatInstant(account.password.changedAt)],
                  ['Password expires', account.password.expiresAt && formatInstant(account.password.expiresAt)],
                  ['Password expired', yesNo(account.password.expired)],
                  ['Authenticator enrolled', account.mfa.enrolled ? `Yes${account.mfa.enrolledAt ? `, ${formatInstant(account.mfa.enrolledAt)}` : ''}` : 'No'],
                  ['Authenticator required', yesNo(account.classification.mfaRequired)],
                ]} />
              </Panel>

              <Panel title="Activation">
                {account.account.status === 'ACTIVE'
                  ? <p className="zrv-admin-state">The account is active.</p>
                  : account.activation.ready
                    ? <p className="zrv-admin-state">All activation prerequisites are met.</p>
                    : (
                      <>
                        <p className="zrv-admin-state">The account cannot be activated yet:</p>
                        <ul className="zrv-admin-list">{account.activation.unmetPrerequisites.map((reason) => <li key={reason}>{describeReason(reason)}</li>)}</ul>
                      </>
                    )}
              </Panel>

              <Panel title="Roles" description="Role memberships recorded for this account" className="zrv-admin-grid__wide">
                {account.roles.length ? (
                  <ul className="zrv-admin-list">
                    {account.roles.map((role) => (
                      <li key={role.roleId}>
                        <b>{role.roleName || role.roleCode}</b> <code>{role.roleCode}</code>{' '}
                        <ActiveBadge active={role.effective} activeLabel="Effective" inactiveLabel="Not effective" />
                        {role.expiresAt && <small className="zrv-admin-sub">Expires {formatInstant(role.expiresAt)}</small>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="zrv-admin-state">No roles are assigned.</p>}
              </Panel>

              <Panel
                title="Active sessions"
                className="zrv-admin-grid__wide"
                actions={allowed.revokeSessions && account.activeSessions.length > 0 && (
                  <button type="button" className="btn-secondary" onClick={() => open({ type: 'revoke-all' })}>Sign out all sessions</button>
                )}
              >
                {account.activeSessions.length ? (
                  <div className="ux-table-wrap">
                    <table className="ux-table zrv-admin-table">
                      <caption className="sr-only">Active sessions</caption>
                      <thead><tr><th scope="col">Started</th><th scope="col">Last activity</th><th scope="col">Expires</th><th scope="col">Verified</th><th scope="col">IP address</th><th scope="col">Browser</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                      <tbody>
                        {account.activeSessions.map((session) => (
                          <tr key={session.sessionId}>
                            <td>{formatInstant(session.createdAt)}</td>
                            <td>{formatInstant(session.lastActivityAt)}</td>
                            <td>{formatInstant(session.expiresAt)}</td>
                            <td>{session.mfaVerified ? 'Authenticator' : 'Password only'}</td>
                            <td>{session.ipAddress || '—'}</td>
                            <td className="zrv-admin-truncate" title={session.userAgent || undefined}>{session.userAgent || '—'}</td>
                            <td>{allowed.revokeSessions && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'revoke-one', session })}>Sign out</button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="zrv-admin-state">The account has no active sessions.</p>}
              </Panel>

              {(allowed.activate || allowed.disable || allowed.passwordSetup || allowed.recovery) && (
                <Panel title="Manage account" className="zrv-admin-grid__wide">
                  <div className="zrv-admin-actions-row">
                    {allowed.activate && (
                      <button type="button" className="btn-primary" disabled={!account.activation.ready} onClick={() => open({ type: 'activate' })}>
                        <OrvexaIcon name="circle-check" className="size-4" /> Activate
                      </button>
                    )}
                    {allowed.passwordSetup && <button type="button" className="btn-secondary" onClick={() => open({ type: 'setup' })}><OrvexaIcon name="mail" className="size-4" /> Send password setup link</button>}
                    {allowed.recovery && <button type="button" className="btn-secondary" onClick={() => open({ type: 'recovery' })}><OrvexaIcon name="life-buoy" className="size-4" /> Send recovery link</button>}
                    {allowed.disable && <button type="button" className="btn-secondary zrv-admin-danger-outline" onClick={() => open({ type: 'disable' })}><OrvexaIcon name="ban" className="size-4" /> Disable</button>}
                  </div>
                  {allowed.activate && !account.activation.ready && <p className="zrv-admin-hint">Activation becomes available once the prerequisites above are met.</p>}
                </Panel>
              )}
            </div>

            {dialog?.type === 'activate' && (
              <ConfirmDialog
                title="Activate this account?" confirmLabel="Activate" pending={action.pending} feedback={action.feedback} onClose={close}
                description={`${displayName(account) || account.employeeNumber} will be able to sign in. Roles are not assigned automatically.`}
                onConfirm={() => perform(() => securityAdminService.activateUser(account.userId), (result) => result.changed ? 'Account activated.' : 'The account was already active; nothing changed.')}
              />
            )}
            {dialog?.type === 'disable' && (
              <ConfirmDialog
                danger title="Disable this account?" confirmLabel="Disable account" pending={action.pending} feedback={action.feedback} onClose={close}
                description="The employee is signed out of every session immediately, outstanding setup and recovery links stop working, and the account can no longer sign in."
                onConfirm={() => perform(() => securityAdminService.disableUser(account.userId), (result) => result.changed
                  ? `Account disabled. ${plural(result.sessionsRevoked ?? 0, 'session')} signed out.`
                  : 'The account was already disabled; nothing changed.')}
              />
            )}
            {dialog?.type === 'revoke-all' && (
              <ConfirmDialog
                danger title="Sign out every session?" confirmLabel="Sign out all" pending={action.pending} feedback={action.feedback} onClose={close}
                description="All active sessions of this account end immediately. The employee can sign in again."
                onConfirm={() => perform(() => securityAdminService.revokeUserSessions(account.userId), (result) => `${plural(result.sessionsRevoked, 'session')} signed out.`)}
              />
            )}
            {dialog?.type === 'revoke-one' && (
              <ConfirmDialog
                danger title="Sign out this session?" confirmLabel="Sign out session" pending={action.pending} feedback={action.feedback} onClose={close}
                description={`The session started ${formatInstant(dialog.session.createdAt)} ends immediately.`}
                onConfirm={() => perform(() => securityAdminService.revokeUserSession(account.userId, dialog.session.sessionId), (result) => result.changed ? 'Session signed out.' : 'The session had already ended.')}
              />
            )}
            {(dialog?.type === 'setup' || dialog?.type === 'recovery') && (
              <AccountLinkDialog
                mode={dialog.type} user={account} action={action} onClose={close}
                onIssued={(outcome) => {
                  if (outcome.status === 'ignored') return
                  if (outcome.status === 'success') close()
                  detail.reload()
                }}
              />
            )}
          </>
        )}
      </ResourceState>
    </AdminPage>
  )
}
