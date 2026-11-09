import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { checkSearch, fieldProps } from '@/features/security-administration/adminForms.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { AdminPage, Badge, Dialog, Feedback, Field, Pagination, Panel, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import SourceFormDialog from '../components/SourceFormDialog.jsx'
import { ActivationDialog, ActiveBadge, VersionTable } from '../components/WorkflowUi.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import {
  PAGE_SIZE, PATHS, SOURCE_FILTER_DEFAULTS, SOURCE_SORTS, WORKFLOW_ACTIONS, filterParams, readSourceFilters, sourceObjectLabel,
} from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const KIND_TONES = Object.freeze({ TABLE: 'neutral', VIEW: 'neutral', HANDLER: 'warn' })

function VersionsDialog({ source, onClose }) {
  const versions = useResource(`wf-source-versions:${source.sourceId}`, (signal) => workflowManagerService.listSourceVersions(source.sourceId, { signal }))
  return (
    <Dialog title={`Versions of ${source.sourceCode}`} description="Read only. Source versions record the validated allowlist of this source." onClose={onClose} wide>
      <ResourceState resource={versions} label="source versions" isEmpty={() => false}>
        {(items) => <VersionTable versions={items} caption={`Versions of ${source.sourceCode}`} />}
      </ResourceState>
      <div className="zrv-dialog__actions"><button type="button" className="btn-secondary" onClick={onClose}>Close</button></div>
    </Dialog>
  )
}

// Registered data sources (GET /workflow-manager/data-sources,
// DATA_SOURCE_REGISTRY:VIEW) with search, kind/status filters, sorting and
// pagination in the URL. Register (CREATE), edit (UPDATE), activate
// (ACTIVATE) and deactivate (DEACTIVATE) appear only with the permission.
export default function DataSourceRegistryPage() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readSourceFilters(searchParams)
  const [searchText, setSearchText] = useState(filters.search)
  const [searchError, setSearchError] = useState(null)
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchText(filters.search)
    setSearchError(null)
  }
  const query = { ...filters, pageSize: PAGE_SIZE }
  const sources = useResource(`wf-sources:${JSON.stringify(query)}`, (signal) => workflowManagerService.listSources(query, { signal }))
  const canWrite = can(WORKFLOW_ACTIONS.SOURCES_CREATE) || can(WORKFLOW_ACTIONS.SOURCES_UPDATE)
  const policy = useResource(canWrite ? 'wf-source-policy' : null, (signal) => workflowManagerService.getSourcePolicy({ signal }))
  const action = useWorkflowAction()
  const [dialog, setDialog] = useState(null)

  const update = (changes) => setSearchParams(filterParams({ ...filters, page: 1, ...changes }, SOURCE_FILTER_DEFAULTS))
  const submitSearch = (event) => {
    event.preventDefault()
    const { term, error } = checkSearch(searchText)
    setSearchError(error)
    if (!error) update({ search: term })
  }
  const open = (next) => {
    action.reset()
    setDialog(next)
  }
  const close = () => setDialog(null)
  const finish = (outcome) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    sources.reload()
  }
  const canToggle = (source) => can(source.isActive ? WORKFLOW_ACTIONS.SOURCES_DEACTIVATE : WORKFLOW_ACTIONS.SOURCES_ACTIVATE)
  const policyReady = policy.status === 'ready'

  return (
    <AdminPage
      eyebrow="Workflow Manager"
      title="Data source registry"
      description="Approved tables, views and server handlers that registered forms may read from. Each entry is verified against the database dictionary and the source allowlist."
      actions={can(WORKFLOW_ACTIONS.SOURCES_CREATE) && (
        <button type="button" className="btn-primary" disabled={!policyReady} onClick={() => open({ type: 'edit', source: null })}>
          <OrvexaIcon name="plus" className="size-4" /> Register data source
        </button>
      )}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      {canWrite && policy.status === 'error' && (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>The source allowlist policy could not be loaded, so registering and editing are unavailable.</p>
          <button type="button" className="btn-secondary" onClick={policy.reload}>Retry</button>
        </div>
      )}
      <Panel>
        <form className="zrv-admin-toolbar" onSubmit={submitSearch} role="search" aria-label="Search data sources" noValidate>
          <Field id="wf-sources-search" label="Search" hint="Source code, name, object or handler" error={searchError}>
            <input {...fieldProps('wf-sources-search', { hint: true, error: searchError })} className="ux-input" type="search" value={searchText} maxLength={100} onChange={(event) => setSearchText(event.target.value)} />
          </Field>
          <Field id="wf-sources-kind" label="Kind">
            <select id="wf-sources-kind" className="ux-select" value={filters.sourceKind} onChange={(event) => update({ sourceKind: event.target.value })}>
              <option value="">All kinds</option>
              <option value="TABLE">Tables</option>
              <option value="VIEW">Views</option>
              <option value="HANDLER">Server handlers</option>
            </select>
          </Field>
          <Field id="wf-sources-status" label="Status">
            <select id="wf-sources-status" className="ux-select" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
          <Field id="wf-sources-sort" label="Sort by">
            <select id="wf-sources-sort" className="ux-select" value={`${filters.sortBy}:${filters.sortDir}`} onChange={(event) => { const [sortBy, sortDir] = event.target.value.split(':'); update({ sortBy, sortDir }) }}>
              {Object.entries(SOURCE_SORTS).flatMap(([value, label]) => [
                <option key={`${value}:asc`} value={`${value}:asc`}>{label} ↑</option>,
                <option key={`${value}:desc`} value={`${value}:desc`}>{label} ↓</option>,
              ])}
            </select>
          </Field>
          <div className="zrv-admin-toolbar__submit">
            <button type="submit" className="btn-primary">Search</button>
          </div>
        </form>

        <ResourceState
          resource={sources}
          label="data sources"
          empty={filters.search || filters.sourceKind || filters.status ? 'No data source matches these filters.' : 'No data sources are registered yet.'}
        >
          {({ items, pagination }) => (
            <>
              <div className="ux-table-wrap">
                <table className="ux-table zrv-admin-table zwf-table" aria-busy={sources.refreshing || undefined}>
                  <caption className="sr-only">Registered data sources</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Object or handler</th>
                      <th scope="col">Versions</th>
                      <th scope="col">Status</th>
                      <th scope="col">Last updated</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!items.length && <tr><td colSpan={7} className="zrv-admin-state">No data sources on this page. Use Previous to go back.</td></tr>}
                    {items.map((source) => (
                      <tr key={source.sourceId} className={source.isActive ? undefined : 'is-inactive'}>
                        <td><b>{source.sourceName}</b><small className="zrv-admin-sub zwf-code">{source.sourceCode}</small></td>
                        <td><Badge tone={KIND_TONES[source.sourceKind]}>{source.sourceKind}</Badge></td>
                        <td><span className="zwf-code">{sourceObjectLabel(source)}</span></td>
                        <td>{source.versionCount}</td>
                        <td><ActiveBadge active={source.isActive} /></td>
                        <td>{formatInstant(source.updatedAt)}</td>
                        <td>
                          <span className="zwf-row-actions">
                            {can(WORKFLOW_ACTIONS.MAPPING_VIEW)
                              ? <Link className="zrv-admin-link" to={PATHS.sourceVersions(source.sourceId)}>Manage mapping<span className="sr-only"> of {source.sourceCode}</span></Link>
                              : <button type="button" className="zrv-admin-link" onClick={() => setDialog({ type: 'versions', source })}>Versions<span className="sr-only"> of {source.sourceCode}</span></button>}
                            {can(WORKFLOW_ACTIONS.SOURCES_UPDATE) && policyReady && (
                              <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'edit', source })}>Edit<span className="sr-only"> {source.sourceCode}</span></button>
                            )}
                            {canToggle(source) && (
                              <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'toggle', source })}>
                                {source.isActive ? 'Deactivate' : 'Activate'}<span className="sr-only"> {source.sourceCode}</span>
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} onPage={(page) => update({ page })} disabled={sources.refreshing} label="Data source pages" />
            </>
          )}
        </ResourceState>
      </Panel>

      {dialog?.type === 'edit' && policyReady && (
        <SourceFormDialog source={dialog.source} policy={policy.data} action={action} onClose={close} onSaved={finish} />
      )}
      {dialog?.type === 'versions' && <VersionsDialog source={dialog.source} onClose={close} />}
      {dialog?.type === 'toggle' && (
        <ActivationDialog
          item={dialog.source}
          entity="data source"
          label={dialog.source.sourceCode}
          pending={action.pending}
          feedback={action.feedback}
          onClose={close}
          onConfirm={async () => finish(await action.run(
            () => workflowManagerService.setSourceActive(dialog.source.sourceId, !dialog.source.isActive, dialog.source.rowVersion),
            { success: (saved) => `${saved.sourceCode} ${saved.isActive ? 'activated' : 'deactivated'}.` },
          ))}
        />
      )}
    </AdminPage>
  )
}
