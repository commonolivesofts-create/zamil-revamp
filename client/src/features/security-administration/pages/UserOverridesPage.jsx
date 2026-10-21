import { useState } from 'react'
import { Link, useParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import RouteNotice from '@/pages/RouteNotice.jsx'
import { checkJustification, fieldProps, readFutureInstant } from '../adminForms.js'
import { formatInstant } from '../adminFeedback.js'
import { isRecordId, permissionLabel } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import useAccountSubject from '../useAccountSubject.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, Badge, ConfirmDialog, Dialog, DialogActions, Feedback, Field, Panel, ResourceState } from '../components/AdminUi.jsx'
import EffectivePermissions from '../components/EffectivePermissions.jsx'
import PermissionPicker from '../components/PermissionPicker.jsx'

// Setting an override for a permission that already has one replaces that
// record (effect, justification and expiry) on the server.
function OverrideDialog({ userId, subject, active, action, onClose, onDone }) {
  const [choice, setChoice] = useState(null)
  const existing = choice ? active.find((item) => item.permissionId === choice.permissionId) : null
  const [effect, setEffect] = useState('DENY')
  const [justification, setJustification] = useState('')
  const [expiry, setExpiry] = useState('')
  const [errors, setErrors] = useState({})

  const submit = async (event) => {
    event.preventDefault()
    const expiresAt = readFutureInstant(expiry)
    const next = { permission: choice ? null : 'Choose a permission.', justification: checkJustification(justification), expiry: expiresAt.error }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    onDone(await action.run(() => securityAdminService.setUserOverride(userId, choice.permissionId, { effect, justification: justification.trim(), expiresAt: expiresAt.value }), {
      success: `${effect === 'ALLOW' ? 'Allowed' : 'Denied'} ${choice.key} for ${subject}.`,
    }))
  }

  return (
    <Dialog title={`Add an override for ${subject}`} description="An override applies to this account only. DENY always wins over any role grant; ALLOW adds a permission you hold yourself." onClose={onClose} busy={action.pending} wide>
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        <PermissionPicker selectedId={choice?.permissionId} onSelect={setChoice} disabled={action.pending} />
        {errors.permission && <p className="zrv-auth-field-error" role="alert">{errors.permission}</p>}
        {existing && <p className="zrv-admin-note" role="note">This account already has an active {existing.effect} override for {choice.key}. Saving replaces it.</p>}
        <fieldset className="zrv-admin-choices zrv-admin-choices--inline">
          <legend>Effect</legend>
          {['DENY', 'ALLOW'].map((value) => (
            <label key={value} htmlFor={`effect-${value}`} className="zrv-admin-choice">
              <input id={`effect-${value}`} type="radio" name="override-effect" value={value} checked={effect === value} onChange={() => setEffect(value)} disabled={action.pending} />
              <span><b>{value}</b><small className="zrv-admin-sub">{value === 'DENY' ? 'Remove this permission even if a role grants it' : 'Grant this permission directly'}</small></span>
            </label>
          ))}
        </fieldset>
        <Field id="override-justification" label="Justification" hint="Recorded with the override and in the audit trail" error={errors.justification}>
          <textarea {...fieldProps('override-justification', { hint: true, error: errors.justification })} className="ux-textarea" rows={3} maxLength={500} value={justification} onChange={(event) => setJustification(event.target.value)} disabled={action.pending} />
        </Field>
        <Field id="override-expiry" label="Expires (optional)" error={errors.expiry}>
          <input {...fieldProps('override-expiry', { error: errors.expiry })} className="ux-input" type="datetime-local" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={action.pending} />
        </Field>
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmLabel={choice ? `${effect} ${choice.key}` : 'Save override'} pendingLabel="Saving…" />
      </form>
    </Dialog>
  )
}

// Direct permission overrides of one account (USER_PERMISSION_OVERRIDES).
// The override records are shown separately from the account's effective
// access, which only the server resolves (USER_ROLES:VIEW).
export default function UserOverridesPage() {
  const { userId } = useParams()
  const valid = isRecordId(userId)
  const { can } = usePermissions()
  const subject = useAccountSubject(valid ? userId : null)
  const overrides = useResource(valid ? `overrides:${userId}` : null, (signal) => securityAdminService.listUserOverrides(userId, { signal }))
  const action = useAdminAction()
  const [dialog, setDialog] = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [version, setVersion] = useState(0)

  if (!valid) return <RouteNotice eyebrow="Not found" title="This account does not exist" description="The account link is invalid." to="/security/permission-overrides" actionLabel="Back to permission overrides" />

  const canGrant = !subject.isSelf && can(SECURITY_ACTIONS.USER_PERMISSION_OVERRIDES_GRANT) && can(SECURITY_ACTIONS.PERMISSION_CATALOG_VIEW)
  const canRevoke = !subject.isSelf && can(SECURITY_ACTIONS.USER_PERMISSION_OVERRIDES_REVOKE)
  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }
  const close = () => setDialog(null)
  const finish = (outcome) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    overrides.reload()
    setVersion((value) => value + 1)
  }

  return (
    <AdminPage
      eyebrow="Permission overrides"
      title={subject.label}
      description={subject.employeeNumber ? `Employee ${subject.employeeNumber}` : null}
      actions={<>
        {canGrant && <button type="button" className="btn-primary" onClick={() => open({ type: 'set' })}><OrvexaIcon name="plus" className="size-4" /> Add override</button>}
        {subject.canViewAccount && <Link className="btn-secondary" to={`/security/users/${userId}`}>Account</Link>}
        <Link className="btn-secondary" to="/security/permission-overrides"><OrvexaIcon name="arrow-left" className="size-4" /> All accounts</Link>
      </>}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      {subject.isSelf && <p className="zrv-admin-note" role="note">This is your own account. Nobody can change their own overrides.</p>}
      <div className="zrv-admin-grid">
        <Panel title="Override records" description="Assigned directly to this account. A record only changes access while it is active and not expired." className="zrv-admin-grid__wide">
          <label className="zrv-admin-check">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show revoked overrides
          </label>
          <ResourceState resource={overrides} label="overrides" empty={showInactive ? 'This account has no overrides.' : 'This account has no active overrides.'} isEmpty={(data) => !data.some((item) => showInactive || item.isActive)}>
            {(data) => (
              <div className="ux-table-wrap">
                <table className="ux-table zrv-admin-table" aria-busy={overrides.refreshing || undefined}>
                  <caption className="sr-only">Override records</caption>
                  <thead><tr><th scope="col">Permission</th><th scope="col">Effect</th><th scope="col">Justification</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {data.filter((item) => showInactive || item.isActive).map((item) => (
                      <tr key={item.permissionId}>
                        <td><code>{permissionLabel(item)}</code></td>
                        <td><Badge>{item.effect}</Badge></td>
                        <td className="zrv-admin-wrap">{item.justification || '—'}</td>
                        <td><ActiveBadge active={item.isActive} inactiveLabel="Revoked" /></td>
                        <td>{item.expiresAt ? formatInstant(item.expiresAt) : 'No end date'}</td>
                        <td>{canRevoke && item.isActive && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'revoke', override: item })}>Revoke<span className="sr-only"> {permissionLabel(item)}</span></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ResourceState>
        </Panel>
        {can(SECURITY_ACTIONS.USER_ROLES_VIEW)
          ? <EffectivePermissions userId={userId} version={version} />
          : <Panel title="Effective access" className="zrv-admin-grid__wide"><p className="zrv-admin-state">Viewing an account's effective access requires the User roles view permission.</p></Panel>}
      </div>

      {dialog?.type === 'set' && (
        <OverrideDialog
          userId={userId} subject={subject.label} action={action} onClose={close} onDone={finish}
          active={(overrides.data || []).filter((item) => item.isActive)}
        />
      )}
      {dialog?.type === 'revoke' && (
        <ConfirmDialog
          danger title="Revoke this override?" confirmLabel="Revoke override" pending={action.pending} feedback={action.feedback} onClose={close}
          description={dialog.override.effect === 'DENY'
            ? `Removing this DENY restores ${permissionLabel(dialog.override)} if a role grants it.`
            : `${subject.label} loses ${permissionLabel(dialog.override)} unless a role grants it.`}
          onConfirm={async () => finish(await action.run(() => securityAdminService.revokeUserOverride(userId, dialog.override.permissionId), {
            success: (result) => result.changed ? `Override for ${permissionLabel(dialog.override)} revoked.` : 'The override was already revoked; nothing changed.',
          }))}
        />
      )}
    </AdminPage>
  )
}
