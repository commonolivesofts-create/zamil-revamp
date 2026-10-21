import { useState } from 'react'
import { checkCode, checkDescription, checkName, descriptionValue, fieldProps } from '../adminForms.js'
import { securityAdminService } from '../securityAdminService.js'
import { Dialog, DialogActions, Feedback, Field } from './AdminUi.jsx'

// Create a role (ROLES:CREATE: code, name, description) or update the
// properties the backend lets change (ROLES:UPDATE: name, description).
// The role code is fixed once created.
export default function RoleFormDialog({ role = null, action, onClose, onSaved }) {
  const editing = Boolean(role)
  const [roleCode, setRoleCode] = useState('')
  const [roleName, setRoleName] = useState(role?.roleName ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [errors, setErrors] = useState({})

  const submit = async (event) => {
    event.preventDefault()
    const next = {
      roleCode: editing ? null : checkCode(roleCode, 60, 'Role code'),
      roleName: checkName(roleName, 'Role name'),
      description: checkDescription(description),
    }
    const changes = {}
    if (editing) {
      if (roleName.trim() !== (role.roleName ?? '')) changes.roleName = roleName.trim()
      if (descriptionValue(description) !== (role.description ?? null)) changes.description = descriptionValue(description)
      if (!Object.keys(changes).length) next.form = 'Nothing has changed.'
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    const outcome = await action.run(
      () => editing
        ? securityAdminService.updateRole(role.roleId, changes)
        : securityAdminService.createRole({ roleCode, roleName: roleName.trim(), description: descriptionValue(description) }),
      { success: (saved) => editing ? `Role ${saved.roleCode} updated.` : `Role ${saved.roleCode} created. It has no permissions until they are granted.` },
    )
    onSaved(outcome)
  }

  return (
    <Dialog title={editing ? `Edit role ${role.roleCode}` : 'Create a role'} onClose={onClose} busy={action.pending}>
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        {!editing && (
          <Field id="role-code" label="Role code" hint="Upper-case letters, digits and underscores; cannot be changed later" error={errors.roleCode}>
            <input {...fieldProps('role-code', { hint: true, error: errors.roleCode })} data-autofocus className="ux-input" autoComplete="off" spellCheck={false} maxLength={60} value={roleCode} onChange={(event) => setRoleCode(event.target.value.toUpperCase())} disabled={action.pending} />
          </Field>
        )}
        <Field id="role-name" label="Role name" error={errors.roleName}>
          <input {...fieldProps('role-name', { error: errors.roleName })} data-autofocus={editing || undefined} className="ux-input" maxLength={120} value={roleName} onChange={(event) => setRoleName(event.target.value)} disabled={action.pending} />
        </Field>
        <Field id="role-description" label="Description (optional)" error={errors.description}>
          <textarea {...fieldProps('role-description', { error: errors.description })} className="ux-textarea" rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} disabled={action.pending} />
        </Field>
        {errors.form && <p className="zrv-auth-field-error" role="alert">{errors.form}</p>}
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmLabel={editing ? 'Save changes' : 'Create role'} pendingLabel="Saving…" />
      </form>
    </Dialog>
  )
}
