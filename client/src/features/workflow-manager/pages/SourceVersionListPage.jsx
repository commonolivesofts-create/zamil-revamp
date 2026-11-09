import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { AdminPage, Badge, ConfirmDialog, Feedback, Pagination, Panel, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { ActiveBadge } from '../components/WorkflowUi.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import { LIFECYCLE_LABELS } from '../sourceMappingModel.js'
import { LIFECYCLE_TONES, PAGE_SIZE, PATHS, WORKFLOW_ACTIONS, sourceObjectLabel } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const ID = /^[1-9][0-9]{0,18}$/

const readPage = (params) => {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1
}

// Versions of one data source's mapping (GET /data-sources/:sourceId/mapping-versions,
// SOURCE_MAPPING:VIEW + DATA_SOURCE_REGISTRY:VIEW), newest first, paginated in the URL.
// New version (CREATE), clone (CREATE) and delete of a draft (DELETE) appear only with the
// permission. Publication is a later governance step and is not offered here.
export default function SourceVersionListPage() {
  const { sourceId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = usePermissions()
  const validId = ID.test(sourceId ?? '')
  const page = readPage(searchParams)
  const source = useResource(validId ? `wf-source:${sourceId}` : null, (signal) => workflowManagerService.getSource(sourceId, { signal }))
  const versions = useResource(
    validId ? `wf-source-mappings:${sourceId}:${page}` : null,
    (signal) => workflowManagerService.listSourceMappingVersions(sourceId, { page, pageSize: PAGE_SIZE }, { signal }),
  )
  const action = useWorkflowAction()
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(location.state?.notice ?? null)
  const canCreate = can(WORKFLOW_ACTIONS.MAPPING_CREATE)
  const canDelete = can(WORKFLOW_ACTIONS.MAPPING_DELETE)

  if (!validId) {
    return (
      <AdminPage eyebrow="Workflow Manager · Source mapping" title="Source versions">
        <Panel><p className="zrv-admin-state" role="status">This data source address is not valid. <Link className="zrv-admin-link" to={PATHS.sources}>Back to the data source registry</Link></p></Panel>
      </AdminPage>
    )
  }

  const runClone = async (version) => {
    const outcome = await action.run(
      () => workflowManagerService.cloneSourceMappingVersion(sourceId, version.sourceVersionId),
      { success: (saved) => `Version ${version.versionNo} cloned into draft version ${saved.version.versionNo}.` },
    )
    if (outcome.status === 'success') {
      navigate(PATHS.sourceVersion(sourceId, outcome.value.version.sourceVersionId), {
        state: { notice: `Draft version ${outcome.value.version.versionNo} created from version ${version.versionNo}.`, validation: outcome.value.validation },
      })
      return
    }
    if (outcome.status !== 'ignored') {
      setConfirm(null)
      versions.reload()
    }
  }

  const runDelete = async (version) => {
    const outcome = await action.run(
      () => workflowManagerService.deleteSourceMappingVersion(sourceId, version.sourceVersionId, version.rowVersion),
      { success: `Draft version ${version.versionNo} deleted.` },
    )
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') setConfirm(null)
    versions.reload()
  }

  const data = source.data
  return (
    <AdminPage
      eyebrow="Workflow Manager · Source mapping"
      title={data ? `Source versions · ${data.sourceCode}` : 'Source versions'}
      description="Each version records which columns of the source are exposed to forms, how each is classified, and which columns identify a record. Drafts can be edited; other versions are read-only and can be cloned into a new draft."
      actions={(
        <>
          <Link className="btn-secondary" to={PATHS.sources}>Back to registry</Link>
          {canCreate && data && (
            <Link className="btn-primary" to={PATHS.newSourceVersion(sourceId)}>
              <OrvexaIcon name="plus" className="size-4" /> New version
            </Link>
          )}
        </>
      )}
    >
      {notice && <Feedback feedback={{ kind: 'success', message: notice, details: [] }} onDismiss={() => setNotice(null)} />}
      {!confirm && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}

      <ResourceState resource={source} label="data source" notFound="This data source is not registered." empty="This data source is not registered.">
        {(record) => (
          <Panel className="zwf-context">
            <dl className="zwf-context__list">
              <div><dt>Source</dt><dd><b>{record.sourceName}</b></dd></div>
              <div><dt>Object</dt><dd><span className="zwf-code">{sourceObjectLabel(record)}</span> <Badge tone="neutral">{record.sourceKind}</Badge></dd></div>
              <div><dt>Status</dt><dd><ActiveBadge active={record.isActive} /></dd></div>
              <div><dt>Versions</dt><dd>{record.versionCount}</dd></div>
            </dl>
          </Panel>
        )}
      </ResourceState>

      {source.status === 'ready' && (
        <Panel title="Versions">
          <ResourceState
            resource={versions}
            label="source versions"
            empty={canCreate ? 'No versions yet. Use New version to map the columns of this source.' : 'No versions yet.'}
          >
            {({ items, pagination }) => (
              <>
                <div className="ux-table-wrap">
                  <table className="ux-table zrv-admin-table zwf-table" aria-busy={versions.refreshing || undefined}>
                    <caption className="sr-only">Versions of the source mapping</caption>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">State</th>
                        <th scope="col">Validated</th>
                        <th scope="col">Last updated</th>
                        <th scope="col">Fingerprint</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {!items.length && <tr><td colSpan={6} className="zrv-admin-state">No versions on this page. Use Previous to go back.</td></tr>}
                      {items.map((version) => (
                        <tr key={version.sourceVersionId}>
                          <th scope="row">
                            <Link className="zrv-admin-link" to={PATHS.sourceVersion(sourceId, version.sourceVersionId)}><b>Version {version.versionNo}</b></Link>
                            {version.isDefault && <Badge tone="good">DEFAULT</Badge>}
                          </th>
                          <td><Badge tone={LIFECYCLE_TONES[version.lifecycleState]}>{LIFECYCLE_LABELS[version.lifecycleState]}</Badge></td>
                          <td>{formatInstant(version.validatedAt)}</td>
                          <td>{formatInstant(version.updatedAt)}</td>
                          <td><span className="zwf-code" title={version.configSha256}>{version.configSha256.slice(0, 12)}…</span></td>
                          <td>
                            <span className="zwf-row-actions">
                              <Link className="zrv-admin-link" to={PATHS.sourceVersion(sourceId, version.sourceVersionId)}>
                                {version.editable && can(WORKFLOW_ACTIONS.MAPPING_UPDATE) ? 'Edit' : 'View'}<span className="sr-only"> version {version.versionNo}</span>
                              </Link>
                              {canCreate && (
                                <button type="button" className="zrv-admin-link" onClick={() => { action.reset(); setConfirm({ type: 'clone', version }) }}>
                                  Clone<span className="sr-only"> version {version.versionNo}</span>
                                </button>
                              )}
                              {canDelete && version.editable && (
                                <button type="button" className="zrv-admin-link zrv-admin-danger-text" onClick={() => { action.reset(); setConfirm({ type: 'delete', version }) }}>
                                  Delete<span className="sr-only"> draft version {version.versionNo}</span>
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={pagination} onPage={(next) => setSearchParams(next > 1 ? { page: String(next) } : {})} disabled={versions.refreshing} label="Source version pages" />
              </>
            )}
          </ResourceState>
        </Panel>
      )}

      {confirm?.type === 'clone' && (
        <ConfirmDialog
          title={`Clone version ${confirm.version.versionNo}?`}
          description="A new draft is created with the same column choices and keys. It is validated again against the live source, and declared keys are attested by you. The original version does not change."
          confirmLabel="Clone into new draft"
          pending={action.pending}
          feedback={action.feedback}
          onClose={() => setConfirm(null)}
          onConfirm={() => runClone(confirm.version)}
        />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmDialog
          danger
          title={`Delete draft version ${confirm.version.versionNo}?`}
          description="The draft is removed permanently. This is refused if any form mapping uses it, or if it changed since you loaded this list. Published and other non-draft versions can never be deleted."
          confirmLabel="Delete draft"
          pending={action.pending}
          feedback={action.feedback}
          onClose={() => setConfirm(null)}
          onConfirm={() => runDelete(confirm.version)}
        />
      )}
    </AdminPage>
  )
}
