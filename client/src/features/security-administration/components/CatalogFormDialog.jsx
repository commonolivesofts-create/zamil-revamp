import { useState } from 'react'
import usePermissions from '@/features/access/usePermissions.js'
import { checkCode, checkDescription, checkName, descriptionValue, fieldProps } from '../adminForms.js'
import { describeFailure } from '../adminFeedback.js'
import { CATALOG_ROW_LIMIT, createActionsSequentially, summarizeActionResults, toggleAction } from '../catalogActions.js'
import { securityAdminService } from '../securityAdminService.js'
import ActionPicker from './ActionPicker.jsx'
import { Dialog, DialogActions, Feedback, Field } from './AdminUi.jsx'

// Catalogue additions (PERMISSION_CATALOG:MANAGE), exactly the backend's
// create operations: module (code, name, description, display order),
// resource in a module (code, name, description) and actions on a resource
// (standard codes from config/registry/actions.js, created one at a time).
// Codes are permanent; there is no rename or delete. Nothing is granted to a
// role or user.
const KINDS = Object.freeze({
  module: { title: 'Add a module', codeLabel: 'Module code', max: 60, named: true },
  resource: { title: 'Add a resource', codeLabel: 'Resource code', max: 80, named: true },
  permission: { title: 'Add actions', codeLabel: 'Action code', max: 40, named: false },
})

export default function CatalogFormDialog({ kind, parent, action, onClose, onSaved }) {
  const config = KINDS[kind]
  const { reload: reloadPermissions } = usePermissions()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [displayOrder, setDisplayOrder] = useState('')
  const [selected, setSelected] = useState([])
  const [errors, setErrors] = useState({})
  const where = parent ? ` to ${parent.label}` : ''
  const actions = kind === 'permission'
  // Adding actions relies on the catalogue to show and verify existing actions.
  const blocked = actions && parent.catalogIncomplete
  const describe = !actions || selected.length === 1

  const submitActions = async () => {
    const next = {
      selection: selected.length ? null : 'Select at least one action.',
      description: describe ? checkDescription(description) : null,
    }
    setErrors(next)
    if (blocked || Object.values(next).some(Boolean)) return
    const outcome = await action.run(() => createActionsSequentially({
      resourceId: parent.id,
      resourceName: parent.resourceName,
      codes: selected,
      customDescription: selected.length === 1 ? descriptionValue(description) : null,
      createPermission: (resourceId, input) => securityAdminService.createPermission(resourceId, input),
      loadCatalog: () => securityAdminService.getCatalog(),
    }))
    if (outcome.status !== 'success') return onSaved(outcome)
    if (outcome.value.results.some((result) => describeFailure(result.error).permissionChanged)) reloadPermissions()
    action.setFeedback(summarizeActionResults(outcome.value, describeFailure, parent.label))
    onSaved({ status: 'success' })
  }

  const submit = async (event) => {
    event.preventDefault()
    if (actions) return submitActions()
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
    }[kind]
    onSaved(await action.run(operation, { success: `${config.codeLabel.split(' ')[0]} ${code} added${where}.` }))
  }

  return (
    <Dialog title={`${config.title}${where}`} description={actions ? 'Action codes are permanent once created. New actions are active and granted to no one.' : 'Codes are permanent once created. New entries are active.'} onClose={onClose} busy={action.pending} wide={actions}>
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        {actions ? (
          <>
            {parent.codeOwned && (
              <p className="zrv-admin-hint" role="note">This resource is defined in the developer module registry. Add new actions to its registry definition as well, otherwise the registration check reports them as unregistered.</p>
            )}
            {blocked ? (
              <p className="zrv-admin-state" role="alert">The catalogue reached its {CATALOG_ROW_LIMIT.toLocaleString('en')}-row display limit, so the existing actions of this resource cannot be confirmed. Adding actions here is unavailable; ask a developer to register them.</p>
            ) : (
              <>
                <ActionPicker existing={parent.existing} selected={selected} onToggle={(value) => setSelected((current) => toggleAction(current, value, parent.existing))} disabled={action.pending} />
                {errors.selection && <p className="zrv-auth-field-error" role="alert">{errors.selection}</p>}
              </>
            )}
          </>
        ) : (
          <>
            <Field id="catalog-code" label={config.codeLabel} hint="Upper-case letters, digits and underscores" error={errors.code}>
              <input {...fieldProps('catalog-code', { hint: true, error: errors.code })} data-autofocus className="ux-input" autoComplete="off" spellCheck={false} maxLength={config.max} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} disabled={action.pending} />
            </Field>
            {config.named && (
              <Field id="catalog-name" label="Name" error={errors.name}>
                <input {...fieldProps('catalog-name', { error: errors.name })} className="ux-input" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={action.pending} />
              </Field>
            )}
          </>
        )}
        {describe && !blocked && (
          <Field id="catalog-description" label="Description (optional)" hint={actions ? 'Leave empty to use the standard description.' : undefined} error={errors.description}>
            <textarea {...fieldProps('catalog-description', { hint: actions, error: errors.description })} className="ux-textarea" rows={2} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} disabled={action.pending} />
          </Field>
        )}
        {actions && selected.length > 1 && <p className="zrv-admin-hint">Each action gets its standard description, for example “{parent.exampleDescription}”.</p>}
        {kind === 'module' && (
          <Field id="catalog-order" label="Display order (optional)" error={errors.displayOrder}>
            <input {...fieldProps('catalog-order', { error: errors.displayOrder })} className="ux-input" type="number" min={0} max={99999} step={1} value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} disabled={action.pending} />
          </Field>
        )}
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmDisabled={blocked} confirmLabel={actions && selected.length > 1 ? `Add ${selected.length} actions` : 'Add'} pendingLabel="Adding…" />
      </form>
    </Dialog>
  )
}
