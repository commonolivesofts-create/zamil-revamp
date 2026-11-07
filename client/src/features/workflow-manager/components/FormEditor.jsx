import { useState } from 'react'
import { Link } from 'react-router'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { Feedback, Field } from '@/features/security-administration/components/AdminUi.jsx'
import { PATHS, validateForm } from '../workflowManagerModel.js'

// The registration / edit fields of XX_ZRV_WF_FORMS. `initial` is the draft
// to start from; `create` adds the (then immutable) form code. `onSubmit`
// receives the validated payload and returns the action outcome. Server field
// errors (`action.fieldErrors`) are shown next to their fields.
export default function FormEditor({ initial, create, modules, action, onSubmit, onReload, readOnly = false }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const shown = { ...errors, ...action.fieldErrors }
  const disabled = readOnly || action.pending
  const set = (name) => (event) => setDraft((current) => ({ ...current, [name]: name === 'formCode' ? event.target.value.toUpperCase() : event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const { errors: next, valid, payload } = validateForm(draft, { create })
    setErrors(next)
    if (!valid || !dirty) return
    await onSubmit(payload)
  }

  const moduleChoices = modules.data || []
  const currentModuleMissing = draft.moduleCode && modules.data && !moduleChoices.some((module) => module.moduleCode === draft.moduleCode)

  return (
    <form onSubmit={submit} noValidate className="zrv-admin-form" aria-label={create ? 'Register form' : 'Form details'}>
      <div className="zrv-admin-grid">
        <Field id="wf-form-code" label="Form code" hint={create ? 'Upper-case letters, digits and underscores. Cannot be changed after registration.' : 'Permanent identity of the form.'} error={shown.formCode}>
          <input {...fieldProps('wf-form-code', { hint: true, error: shown.formCode })} className="ux-input zwf-code" data-autofocus={create || undefined} autoComplete="off" spellCheck={false} maxLength={80} value={draft.formCode} onChange={set('formCode')} readOnly={!create} disabled={create && disabled} required />
        </Field>
        <Field id="wf-form-name" label="Form name" error={shown.formName}>
          <input {...fieldProps('wf-form-name', { error: shown.formName })} className="ux-input" data-autofocus={!create || undefined} maxLength={200} value={draft.formName} onChange={set('formName')} disabled={disabled} required />
        </Field>
        <Field id="wf-form-module" label="Owning module" hint="Active modules of the permission catalog." error={shown.moduleCode}>
          <select {...fieldProps('wf-form-module', { hint: true, error: shown.moduleCode })} className="ux-select" value={draft.moduleCode} onChange={set('moduleCode')} disabled={disabled || modules.status === 'loading'} required>
            <option value="">{modules.status === 'loading' ? 'Loading modules…' : 'Select a module'}</option>
            {moduleChoices.map((module) => <option key={module.moduleCode} value={module.moduleCode}>{module.moduleName ? `${module.moduleName} (${module.moduleCode})` : module.moduleCode}</option>)}
            {currentModuleMissing && <option value={draft.moduleCode}>{draft.moduleCode} (not an active module)</option>}
          </select>
        </Field>
        <Field id="wf-form-route" label="Detail route (optional)" hint="Application page of one record, e.g. /hr/talent-management/sick-leave/:leaveId" error={shown.detailRoute}>
          <input {...fieldProps('wf-form-route', { hint: true, error: shown.detailRoute })} className="ux-input zwf-code" autoComplete="off" spellCheck={false} maxLength={500} value={draft.detailRoute} onChange={set('detailRoute')} disabled={disabled} />
        </Field>
        <div className="zrv-admin-grid__wide">
          <Field id="wf-form-description" label="Description (optional)" error={shown.description}>
            <textarea {...fieldProps('wf-form-description', { error: shown.description })} className="ux-textarea" rows={3} maxLength={1000} value={draft.description} onChange={set('description')} disabled={disabled} />
          </Field>
        </div>
      </div>
      {modules.status === 'error' && <p className="zrv-admin-hint" role="alert">The module list could not be loaded. <button type="button" className="zrv-admin-link" onClick={modules.reload}>Retry</button></p>}

      {action.feedback?.kind !== 'success' && <Feedback feedback={action.feedback} />}
      {action.feedback?.stale && onReload && (
        <p className="zrv-admin-hint"><button type="button" className="btn-secondary" onClick={onReload}>Reload the current values</button></p>
      )}

      {!readOnly && (
        <div className="zwf-form-actions">
          {dirty && !action.pending && <span className="zwf-dirty" role="status">Unsaved changes</span>}
          {create
            ? <Link className="btn-secondary" to={PATHS.forms}>Cancel</Link>
            : <button type="button" className="btn-secondary" onClick={() => { setDraft(initial); setErrors({}); action.reset() }} disabled={!dirty || action.pending}>Discard changes</button>}
          <button type="submit" className="btn-primary" disabled={action.pending || !dirty}>
            {action.pending ? (create ? 'Registering…' : 'Saving…') : (create ? 'Register form' : 'Save changes')}
          </button>
        </div>
      )}
    </form>
  )
}
