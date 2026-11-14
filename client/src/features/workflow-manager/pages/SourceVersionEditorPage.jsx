import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { AdminPage, Badge, ConfirmDialog, DetailList, Feedback, Panel, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import SourceColumnTable from '../components/SourceColumnTable.jsx'
import SourceKeyCandidateEditor from '../components/SourceKeyCandidateEditor.jsx'
import SourceValidationPanel from '../components/SourceValidationPanel.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import {
  LIFECYCLE_LABELS, draftOrder, editorState, findingsFromError, samePayload, storedDraft, validateEditor,
} from '../sourceMappingModel.js'
import { LIFECYCLE_TONES, PATHS, WORKFLOW_ACTIONS, sourceObjectLabel } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const ID = /^[1-9][0-9]{0,18}$/

// The newer of two reads of the same version (ROW_VERSION only grows).
const newest = (a, b) => (!a ? b : !b ? a : a.version.rowVersion >= b.version.rowVersion ? a : b)

// Columns to edit: the live dictionary (or handler contract). When the source cannot be read,
// the stored columns are shown read-only so the saved mapping stays visible.
function liveColumnsOf(dictionary, config) {
  if (dictionary?.available) return dictionary.snapshot?.columns ?? dictionary.handler?.fields ?? []
  return (config?.columns ?? []).map((column) => ({ ...column, supported: true, keyEligible: true }))
}

// Create (/mapping-versions/new, SOURCE_MAPPING:CREATE) or open one source version
// (/mapping-versions/:versionId, SOURCE_MAPPING:VIEW). Drafts are edited with optimistic
// locking (UPDATE), re-validated (UPDATE), cloned (CREATE) and deleted (DELETE); other
// lifecycle states are read-only. All facts come from the live dictionary via the API.
// Each navigation (new → saved draft, clone → new draft) starts with fresh editor state.
export default function SourceVersionEditorPage() {
  const location = useLocation()
  return <SourceVersionEditor key={location.key} />
}

function SourceVersionEditor() {
  const { sourceId, versionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const isNew = versionId === undefined
  const validIds = ID.test(sourceId ?? '') && (isNew || ID.test(versionId ?? ''))

  const dictionary = useResource(validIds ? `wf-source-dictionary:${sourceId}` : null, (signal) => workflowManagerService.getSourceDictionary(sourceId, { signal }))
  const detail = useResource(validIds && !isNew ? `wf-source-mapping:${sourceId}:${versionId}` : null, (signal) => workflowManagerService.getSourceMappingVersion(sourceId, versionId, { signal }))
  const save = useWorkflowAction()
  const check = useWorkflowAction()
  const dialogAction = useWorkflowAction()

  const [latest, setLatest] = useState(null)
  const [seed, setSeed] = useState(0)
  const [editor, setEditor] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const [result, setResult] = useState(location.state?.validation ? { ...location.state.validation, source: 'saved', order: location.state.order ?? null } : null)
  const [drift, setDrift] = useState(null)
  const [notice, setNotice] = useState(location.state?.notice ?? null)
  const [confirm, setConfirm] = useState(null)

  const current = isNew ? null : newest(latest, detail.data)
  const config = current?.version.config ?? null
  const ready = dictionary.status === 'ready' && (isNew || Boolean(current))
  const initKey = ready ? `${versionId ?? 'new'}#${seed}` : null
  if (initKey && editor?.initKey !== initKey) {
    setEditor({ initKey, state: editorState({ liveColumns: liveColumnsOf(dictionary.data, config), config }) })
  }

  if (!validIds) {
    return (
      <AdminPage eyebrow="Workflow Manager · Source mapping" title="Source version">
        <Panel><p className="zrv-admin-state" role="status">This address is not valid. <Link className="zrv-admin-link" to={PATHS.sources}>Back to the data source registry</Link></p></Panel>
      </AdminPage>
    )
  }

  const source = dictionary.data?.source ?? current?.source ?? null
  const version = current?.version ?? null
  const available = Boolean(dictionary.data?.available)
  const snapshot = dictionary.data?.snapshot ?? null
  const editable = isNew ? can(WORKFLOW_ACTIONS.MAPPING_CREATE) : Boolean(version?.editable) && can(WORKFLOW_ACTIONS.MAPPING_UPDATE)
  const readOnly = !editable || !available
  const state = editor?.state
  const checked = state ? validateEditor(state, snapshot) : null
  const baseline = isNew ? { columns: [], keyCandidates: [] } : storedDraft(config)
  const dirty = Boolean(checked) && !samePayload(checked.payload, baseline)
  const busy = save.pending || check.pending || dialogAction.pending

  const setState = (next) => setEditor((value) => ({ ...value, state: typeof next === 'function' ? next(value.state) : next }))
  const changeColumn = (name, patch) => setState((s) => ({ ...s, columns: s.columns.map((column) => (column.name === name ? { ...column, ...patch } : column)) }))
  const changeKeys = (keys) => setState((s) => ({ ...s, keys }))

  // Discards unsaved input and reloads the stored version and the live dictionary.
  const reloadLatest = () => {
    save.reset()
    check.reset()
    setLatest(null)
    setResult(null)
    setShowErrors(false)
    dictionary.reload()
    detail.reload()
    setSeed((value) => value + 1)
  }

  const applySaved = (saved, message, order) => {
    setLatest(saved)
    setResult({ ...saved.validation, source: 'saved', order: order ?? draftOrder(storedDraft(saved.version.config)) })
    setEditor((value) => ({ ...value, state: editorState({ liveColumns: liveColumnsOf(dictionary.data, saved.version.config), config: saved.version.config }) }))
    setShowErrors(false)
    setNotice(message)
  }

  const refused = (error, order) => {
    const findings = findingsFromError(error)
    if (findings.length) setResult({ valid: false, findings, publicationBlockers: [], source: 'refused', order })
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!checked || readOnly) return
    setNotice(null)
    if (!checked.valid) {
      setShowErrors(true)
      return
    }
    const order = draftOrder(checked.payload)
    if (isNew) {
      const outcome = await save.run(() => workflowManagerService.createSourceMappingVersion(sourceId, checked.payload))
      if (outcome.status === 'success') {
        navigate(PATHS.sourceVersion(sourceId, outcome.value.version.sourceVersionId), {
          replace: true,
          state: { notice: `Draft version ${outcome.value.version.versionNo} saved.`, validation: outcome.value.validation, order },
        })
      } else if (outcome.status === 'unknown') {
        // The draft may or may not exist: reconcile on the version list instead of retrying.
        navigate(PATHS.sourceVersions(sourceId), { state: { notice: 'The server did not confirm the save. Check the list below before creating the version again.' } })
      } else if (outcome.status === 'failed') {
        refused(outcome.error, order)
      }
      return
    }
    const outcome = await save.run(() => workflowManagerService.updateSourceMappingVersion(sourceId, version.sourceVersionId, { rowVersion: version.rowVersion, draft: checked.payload }))
    if (outcome.status === 'success') applySaved(outcome.value, `Draft version ${outcome.value.version.versionNo} saved.`, order)
    else if (outcome.status === 'failed') refused(outcome.error, order)
    // Unknown outcome: keep the input and reload the stored metadata to reconcile.
    else if (outcome.status === 'unknown') detail.reload()
  }

  const revalidate = async () => {
    setNotice(null)
    const order = draftOrder(storedDraft(config))
    const outcome = await check.run(() => workflowManagerService.revalidateSourceMappingVersion(sourceId, version.sourceVersionId, version.rowVersion))
    if (outcome.status === 'success') applySaved(outcome.value, 'The draft is still valid. Its evidence and validation time were refreshed.', order)
    else if (outcome.status === 'failed') refused(outcome.error, order)
    else if (outcome.status === 'unknown') detail.reload()
  }

  const checkDrift = async () => {
    setNotice(null)
    const outcome = await check.run(() => workflowManagerService.getSourceMappingDrift(sourceId, version.sourceVersionId))
    if (outcome.status === 'success') setDrift(outcome.value)
  }

  const runClone = async () => {
    const outcome = await dialogAction.run(() => workflowManagerService.cloneSourceMappingVersion(sourceId, version.sourceVersionId))
    if (outcome.status === 'success') {
      setConfirm(null)
      navigate(PATHS.sourceVersion(sourceId, outcome.value.version.sourceVersionId), {
        state: { notice: `Draft version ${outcome.value.version.versionNo} created from version ${version.versionNo}.`, validation: outcome.value.validation },
      })
    } else if (outcome.status === 'unknown') {
      navigate(PATHS.sourceVersions(sourceId), { state: { notice: 'The server did not confirm the clone. Check the list below before cloning again.' } })
    } else if (outcome.status === 'failed') {
      refused(outcome.error, draftOrder(storedDraft(config)))
    }
  }

  const runDelete = async () => {
    const outcome = await dialogAction.run(() => workflowManagerService.deleteSourceMappingVersion(sourceId, version.sourceVersionId, version.rowVersion))
    if (outcome.status === 'success') {
      navigate(PATHS.sourceVersions(sourceId), { replace: true, state: { notice: `Draft version ${version.versionNo} deleted.` } })
    } else if (outcome.status === 'unknown') {
      navigate(PATHS.sourceVersions(sourceId), { state: { notice: 'The server did not confirm the delete. Check the list below.' } })
    }
  }

  const failure = save.feedback?.kind !== 'success' ? save.feedback : null
  const checkFailure = check.feedback?.kind !== 'success' ? check.feedback : null
  // Finding paths index the draft they were computed from: a save's findings follow the order
  // that was submitted; drift and the stored blockers follow the stored configuration (sorted).
  const storedOrder = draftOrder(storedDraft(config))
  const resultOrder = result?.order ?? storedOrder
  const fromResult = Boolean(result?.publicationBlockers?.length)
  const blockers = fromResult ? result.publicationBlockers : version?.publicationBlockers ?? []
  const title = isNew ? 'New source version' : version ? `Source version ${version.versionNo}` : 'Source version'

  return (
    <AdminPage
      eyebrow={`Workflow Manager · Source mapping${source ? ` · ${source.sourceCode}` : ''}`}
      title={title}
      description={isNew
        ? 'Choose which columns of the source are part of the mapping, which are exposed to forms, how each is classified, and which columns identify a record. Saving validates against the live database dictionary and stores a draft.'
        : undefined}
      actions={<Link className="btn-secondary" to={PATHS.sourceVersions(sourceId)}>All versions</Link>}
    >
      {notice && <Feedback feedback={{ kind: 'success', message: notice, details: [] }} onDismiss={() => setNotice(null)} />}
      {[failure, checkFailure].filter(Boolean).map((item, index) => (
        <div key={index} className="zwf-feedback-row">
          <Feedback feedback={item} onDismiss={() => (item === failure ? save : check).setFeedback(null)} />
          {item.stale && (
            <button type="button" className="btn-secondary" onClick={reloadLatest}>
              <OrvexaIcon name="refresh-cw" className="size-4" /> Reload latest (discards your changes)
            </button>
          )}
        </div>
      ))}

      <ResourceState resource={dictionary} label="source dictionary" notFound="This data source is not registered." empty="This data source is not registered.">
        {() => (isNew ? null : (
          <ResourceState resource={detail} label="source version" notFound="This version does not exist for this data source. It may have been deleted." empty="This version does not exist.">
            {() => null}
          </ResourceState>
        ))}
      </ResourceState>

      {ready && state && (
        <form onSubmit={submit} noValidate aria-busy={busy || undefined}>
          <div className="zwf-editor">
            <Panel title="Source and version" className="zwf-editor__context">
              <DetailList items={[
                ['Source', source ? <span key="s"><b>{source.sourceName ?? source.sourceCode}</b> <span className="zwf-code">{sourceObjectLabel(source)}</span></span> : null],
                ['Source status', source ? (source.isActive ? 'Active' : 'Inactive — drafts can be saved; publication will be blocked') : null],
                ['Version', version ? <span key="v"><b>{version.versionNo}</b> <Badge tone={LIFECYCLE_TONES[version.lifecycleState]}>{LIFECYCLE_LABELS[version.lifecycleState]}</Badge></span> : 'New draft (number assigned on save)'],
                version && ['Validated', `${formatInstant(version.validatedAt)}${version.validatedByName ? ` by ${version.validatedByName}` : ''}`],
                version && ['Last updated', `${formatInstant(version.updatedAt)}${version.updatedByName ? ` by ${version.updatedByName}` : ''}`],
                version && ['Fingerprint', <span key="f" className="zwf-code" title={version.configSha256}>{version.configSha256.slice(0, 16)}… {version.configIntegrity !== 'VERIFIED' && <Badge tone="bad">{version.configIntegrity}</Badge>}</span>],
                version && ['Record version', String(version.rowVersion)],
                ['Dictionary', snapshot ? `${snapshot.objectType} ${snapshot.status}, read ${formatInstant(snapshot.capturedAt)}` : available ? 'Handler contract' : 'Unavailable'],
              ]} />
              {!available && (
                <div className="zrv-admin-state zrv-admin-state--error" role="alert">
                  <p>The live source cannot be read, so the mapping cannot be validated or changed: {dictionary.data.findings.map((f) => f.message).join('; ') || 'unknown reason'}.</p>
                  <button type="button" className="btn-secondary" onClick={dictionary.reload}>Retry</button>
                </div>
              )}
              {version && !version.editable && (
                <p className="zwf-readonly-note" role="note">
                  <OrvexaIcon name="lock" className="size-4" /> {LIFECYCLE_LABELS[version.lifecycleState]} versions are read-only. Clone this version to start a new draft.
                </p>
              )}
              {version?.editable && !can(WORKFLOW_ACTIONS.MAPPING_UPDATE) && (
                <p className="zwf-readonly-note" role="note"><OrvexaIcon name="eye" className="size-4" /> You can view this draft but not change it.</p>
              )}
            </Panel>

            <Panel title="Columns" description="Only columns in the mapping can ever be used by forms; only exposed columns are shown. Types and nullability come from the database dictionary.">
              <SourceColumnTable columns={state.columns} readOnly={readOnly} error={showErrors ? checked.errors.columns : null} onChange={changeColumn} />
            </Panel>

            <Panel title="Key candidates" description="Columns that identify exactly one record, alone or together (composite).">
              <SourceKeyCandidateEditor keys={state.keys} columns={state.columns} snapshot={snapshot} readOnly={readOnly} errors={showErrors ? checked.errors.keys : {}} onChange={changeKeys} />
            </Panel>

            <Panel title="Validation" description="Errors stop a save. Warnings and publication blockers are recorded with the draft.">
              <SourceValidationPanel validation={result} blockers={blockers} drift={drift} order={resultOrder} blockerOrder={fromResult ? resultOrder : storedOrder} driftOrder={storedOrder} pending={busy} />
            </Panel>
          </div>

          <div className="zwf-actionbar" role="group" aria-label="Version actions">
            <span className="zwf-actionbar__status" role="status">
              {dirty && !readOnly ? <span className="zwf-dirty">Unsaved changes</span> : null}
              {showErrors && checked && !checked.valid ? <span className="zrv-auth-field-error"> Correct the highlighted fields.</span> : null}
            </span>
            {!isNew && version && can(WORKFLOW_ACTIONS.MAPPING_DELETE) && version.editable && (
              <button type="button" className="btn-secondary zrv-admin-danger-outline" disabled={busy} onClick={() => { dialogAction.reset(); setConfirm('delete') }}>Delete draft</button>
            )}
            {!isNew && version && can(WORKFLOW_ACTIONS.MAPPING_CREATE) && (
              <button type="button" className="btn-secondary" disabled={busy || version.configIntegrity !== 'VERIFIED'} onClick={() => { dialogAction.reset(); setConfirm('clone') }}>Clone</button>
            )}
            {!isNew && version && (
              <button type="button" className="btn-secondary" disabled={busy || !config} onClick={checkDrift}>{check.pending ? 'Checking…' : 'Check drift'}</button>
            )}
            {!isNew && version?.editable && can(WORKFLOW_ACTIONS.MAPPING_UPDATE) && (
              <button type="button" className="btn-secondary" disabled={busy || dirty || !available} title={dirty ? 'Save or discard your changes first' : undefined} onClick={revalidate}>Re-validate</button>
            )}
            {!readOnly && (
              <button type="submit" className="btn-primary" disabled={busy || (!isNew && !dirty)}>
                {save.pending ? 'Validating…' : isNew ? 'Validate and save draft' : 'Validate and save'}
              </button>
            )}
          </div>
        </form>
      )}

      {confirm === 'clone' && (
        <ConfirmDialog
          title={`Clone version ${version.versionNo}?`}
          description={`A new draft is created from the saved choices of version ${version.versionNo}${dirty ? ' (your unsaved changes are not included)' : ''}. It is validated again against the live source and declared keys are attested by you. This version does not change.`}
          confirmLabel="Clone into new draft"
          pending={dialogAction.pending}
          feedback={dialogAction.feedback}
          onClose={() => setConfirm(null)}
          onConfirm={runClone}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmDialog
          danger
          title={`Delete draft version ${version.versionNo}?`}
          description="The draft is removed permanently. This is refused if a form mapping uses it or if it changed since you opened it."
          confirmLabel="Delete draft"
          pending={dialogAction.pending}
          feedback={dialogAction.feedback}
          onClose={() => setConfirm(null)}
          onConfirm={runDelete}
        />
      )}
    </AdminPage>
  )
}
