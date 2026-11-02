import { useEffect, useState } from 'react'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { Dialog, DialogActions, Feedback, Field } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { emptySource, sameSourceIdentity, sourceDraft, validateSource } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const KIND_LABELS = Object.freeze({ TABLE: 'Table', VIEW: 'View', HANDLER: 'Server handler' })
const SUGGEST_DELAY_MS = 300

// Register (DATA_SOURCE_REGISTRY:CREATE) or edit (UPDATE) a data source. The
// allowlist policy comes from the backend; object-name suggestions are VALID
// dictionary objects of the allowlisted owner (names only). The backend
// verifies the identity again on save. Once a source has versions its kind
// and object are locked; only the name can change.
export default function SourceFormDialog({ source, policy, action, onClose, onSaved }) {
  const create = !source
  const [draft, setDraft] = useState(() => (source ? sourceDraft(source) : { ...emptySource(), ownerName: policy.allowedOwners[0] ?? '' }))
  const [errors, setErrors] = useState({})
  const [suggestTerm, setSuggestTerm] = useState('')
  const identityLocked = Boolean(source && source.versionCount > 0)
  const handler = draft.sourceKind === 'HANDLER'
  const handlersAvailable = policy.handlers.length > 0
  const shown = { ...errors, ...action.fieldErrors }
  const disabled = action.pending

  // Debounced dictionary lookup for the object name (TABLE/VIEW only).
  useEffect(() => {
    if (handler || identityLocked) return undefined
    const term = draft.objectName.trim().toUpperCase()
    const timer = setTimeout(() => setSuggestTerm(/^[A-Z0-9_$#]{2,128}$/.test(term) ? term : ''), SUGGEST_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft.objectName, handler, identityLocked])
  const suggestions = useResource(
    !handler && !identityLocked && suggestTerm ? `wf-objects:${draft.sourceKind}:${suggestTerm}` : null,
    (signal) => workflowManagerService.listSourceObjects({ objectType: draft.sourceKind, search: suggestTerm }, { signal }),
  )

  const set = (name, transform = (value) => value) => (event) => setDraft((current) => ({ ...current, [name]: transform(event.target.value) }))
  const unchanged = source && sameSourceIdentity(source, draft) && draft.sourceName.trim() === source.sourceName

  const submit = async (event) => {
    event.preventDefault()
    const { errors: next, valid, payload } = validateSource(draft, { create })
    setErrors(next)
    if (!valid || unchanged) return
    const outcome = await action.run(
      () => (create ? workflowManagerService.createSource(payload) : workflowManagerService.updateSource(source.sourceId, { ...payload, rowVersion: source.rowVersion })),
      { success: (saved) => `Data source ${saved.sourceCode} ${create ? 'registered' : 'saved'}.` },
    )
    onSaved(outcome)
  }

  const listId = 'wf-source-object-options'
  return (
    <Dialog
      title={create ? 'Register data source' : `Edit data source ${source.sourceCode}`}
      description="A data source names one approved table, view or server handler. Only its identity is stored; no data is read and no SQL is accepted."
      onClose={onClose}
      busy={action.pending}
      wide
    >
      <form onSubmit={submit} noValidate className="zrv-admin-form">
        <div className="zrv-admin-grid">
          <Field id="wf-source-code" label="Source code" hint={create ? 'Upper-case letters, digits and underscores. Permanent.' : 'Permanent identity of the source.'} error={shown.sourceCode}>
            <input {...fieldProps('wf-source-code', { hint: true, error: shown.sourceCode })} className="ux-input zwf-code" data-autofocus={create || undefined} autoComplete="off" spellCheck={false} maxLength={80} value={draft.sourceCode} onChange={set('sourceCode', (value) => value.toUpperCase())} readOnly={!create} disabled={create && disabled} />
          </Field>
          <Field id="wf-source-name" label="Source name" error={shown.sourceName}>
            <input {...fieldProps('wf-source-name', { error: shown.sourceName })} className="ux-input" data-autofocus={!create || undefined} maxLength={200} value={draft.sourceName} onChange={set('sourceName')} disabled={disabled} />
          </Field>
          <div className="zrv-admin-grid__wide">
            <fieldset className="zwf-kinds" disabled={identityLocked || disabled}>
              <legend>Source kind</legend>
              {policy.sourceKinds.map((kind) => (
                <label key={kind} className="zwf-kind">
                  <input type="radio" name="wf-source-kind" value={kind} checked={draft.sourceKind === kind} disabled={kind === 'HANDLER' && !handlersAvailable && draft.sourceKind !== 'HANDLER'} onChange={() => setDraft((current) => ({ ...current, sourceKind: kind }))} />
                  {KIND_LABELS[kind]}
                </label>
              ))}
            </fieldset>
            {!handlersAvailable && <small className="zrv-admin-hint">No server handlers are registered in this release, so only tables and views can be registered.</small>}
            {identityLocked && <small className="zrv-admin-hint" role="note">This source already has {source.versionCount} version(s): its kind and object are locked. Register a new data source to use a different object.</small>}
          </div>
          {handler ? (
            <Field id="wf-source-handler" label="Handler" error={shown.handlerCode}>
              <select {...fieldProps('wf-source-handler', { error: shown.handlerCode })} className="ux-select" value={draft.handlerCode} onChange={set('handlerCode')} disabled={identityLocked || disabled}>
                <option value="">Select a handler</option>
                {policy.handlers.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field id="wf-source-owner" label="Owner (schema)" hint="Only approved schemas are accepted." error={shown.ownerName}>
                <select {...fieldProps('wf-source-owner', { hint: true, error: shown.ownerName })} className="ux-select" value={draft.ownerName} onChange={set('ownerName')} disabled={identityLocked || disabled}>
                  {policy.allowedOwners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
                  {draft.ownerName && !policy.allowedOwners.includes(draft.ownerName) && <option value={draft.ownerName}>{draft.ownerName} (not allowlisted)</option>}
                </select>
              </Field>
              <Field id="wf-source-object" label={draft.sourceKind === 'VIEW' ? 'View name' : 'Table name'} hint={`Type at least 2 characters for suggestions. Names starting with ${policy.protectedObjectPrefixes.join(', ')} are not allowed.`} error={shown.objectName}>
                <input {...fieldProps('wf-source-object', { hint: true, error: shown.objectName })} className="ux-input zwf-code" list={listId} autoComplete="off" spellCheck={false} maxLength={128} value={draft.objectName} onChange={set('objectName', (value) => value.toUpperCase())} readOnly={identityLocked} disabled={disabled} />
                <datalist id={listId}>
                  {(suggestions.data || []).map((item) => <option key={`${item.ownerName}.${item.objectName}`} value={item.objectName}>{item.ownerName}.{item.objectName}</option>)}
                </datalist>
              </Field>
              {suggestions.status === 'loading' && <p className="zrv-admin-hint zrv-admin-grid__wide" role="status">Looking up matching {draft.sourceKind === 'VIEW' ? 'views' : 'tables'}…</p>}
              {suggestions.status === 'ready' && suggestions.data.length === 0 && <p className="zrv-admin-hint zrv-admin-grid__wide" role="status">No approved {draft.sourceKind === 'VIEW' ? 'view' : 'table'} name contains “{suggestTerm}”.</p>}
              {suggestions.status === 'error' && <p className="zrv-admin-hint zrv-admin-grid__wide" role="status">Suggestions are unavailable; the name is still verified when you save.</p>}
            </>
          )}
        </div>
        <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
        {unchanged && <p className="zrv-admin-hint" role="status">No changes to save.</p>}
        <DialogActions submit onCancel={onClose} pending={action.pending} confirmDisabled={Boolean(unchanged)} confirmLabel={create ? 'Register' : 'Save changes'} pendingLabel={create ? 'Registering…' : 'Saving…'} />
      </form>
    </Dialog>
  )
}
