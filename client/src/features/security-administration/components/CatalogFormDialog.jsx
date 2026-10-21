import { useState } from 'react'
import { checkCode, checkDescription, checkName, descriptionValue, fieldProps } from '../adminForms.js'
import { securityAdminService } from '../securityAdminService.js'
import { Dialog, DialogActions, Feedback, Field } from './AdminUi.jsx'

// Catalogue additions (PERMISSION_CATALOG:MANAGE), exactly the backend's
// create operations: module (code, name, description, display order),
// resource in a module (code, name, description) and action on a resource
// (code, description). Codes are permanent; there is no rename or delete.
const KINDS = Object.freeze({
  module: { title: 'Add a module', codeLabel: 'Module code', max: 60, named: true },
  resource: { title: 'Add a resource', codeLabel: 'Resource code', max: 80, named: true },
  permission: { title: 'Add an action', codeLabel: 'Action code', max: 40, named: false },
})

export default function CatalogFormDialog({ kind, parent, action, onClose, onSaved }) {
  const config = KINDS[kind]
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [displayOrder, setDisplayOrder] = useState('')
  const [errors, setErrors] = useState({})
  const where = parent ? ` to ${parent.label}` : ''

  const submit = async (event) => {
    event.preventDefault()
    const order = displayOrder === '' ? null : Number(displayOrder)
    const next = {
      code: checkCode(code, config.max, config.codeLabel),
      name: config.named ? checkName(name) : null,
      description: checkDescription(description),
      displayOrder: order !== null && (!Number.isInteger(order) || order < 0 || order > 99999) ? 'Enter a whole number from 0 to 99999.' : null,
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    const text = descriptionValue(description)
    const operation = {
      module: () => securityAdminService.createModule({ moduleCode: code, moduleName: name.trim(), description: text, displayOrder: order ?? undefined }),
      resource: () => securityAdminService.createResource(parent.id, { resourceCode: code, resourceName: name.trim(), description: text }),
      permission: () => securityAdminService.createPermission(parent.id, { actionCode: code, description: text }),
    }[kind]
    onSaved(await action.run(operation, { success: `${config.codeLabel.split(' ')[0]} ${code} added${where}.` }))
  }

  return (
    <Dialog title={`${config.title}${where}`} description="Codes are permanent once created. New entries are active." onClose={onClose} busy={action.pending}>
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        <Field id="catalog-code" label={config.codeLabel} hint="Upper-case letters, digits and underscores" error={errors.code}>
          <input {...fieldProps('catalog-code', { hint: true, error: errors.code })} data-autofocus className="ux-input" autoComplete="off" spellCheck={false} maxLength={config.max} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} disabled={action.pending} />
        </Field>
        {config.named && (
          <Field id="catalog-name" label="Name" error={errors.name}>
            <input {...fieldProps('catalog-name', { error: errors.name })} className="ux-input" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={action.pending} />
          </Field>
        )}
        <Field id="catalog-description" label="Description (optional)" error={errors.description}>
          <textarea {...fieldProps('catalog-description', { error: errors.description })} className="ux-textarea" rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} disabled={action.pending} />
        </Field>
        {kind === 'module' && (
          <Field id="catalog-order" label="Display order (optional)" error={errors.displayOrder}>
            <input {...fieldProps('catalog-order', { error: errors.displayOrder })} className="ux-input" type="number" min={0} max={99999} step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} disabled={action.pending} />
          </Field>
        )}
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmLabel="Add" pendingLabel="Adding…" />
      </form>
    </Dialog>
  )
}
