import { useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import {
  AdminPage,
  Badge,
  ConfirmDialog,
  DetailList,
  Feedback,
  Pagination,
  Panel,
  ResourceState,
} from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { ActiveBadge, ReadinessBadge, TechnicalDetails } from '../components/WorkflowUi.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import { LIFECYCLE_LABELS } from '../sourceMappingModel.js'
import { SOURCE_KIND_LABELS, sourceReadiness } from '../smartMappingModel.js'
import {
  LIFECYCLE_TONES,
  PAGE_SIZE,
  PATHS,
  WORKFLOW_ACTIONS,
  sourceObjectLabel,
} from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const ID = /^[1-9][0-9]{0,18}$/

const readPage = (params) => {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1
}

const READINESS_TEXT = Object.freeze({
  READY: 'An approved field list is in use. Changes are made in a new draft and approved again.',
  IN_SETUP:
    'A field list is being prepared. It is not approved yet, so forms cannot use it. Approval is a later governance step.',
  NOT_STARTED:
    'No field list has been prepared yet. Start one to choose the information forms may use.',
  INACTIVE: 'The data source is deactivated. Drafts can still be prepared but cannot be approved.',
})

// Field lists (source versions) of one data source (GET /data-sources/:sourceId/mapping-versions,
// SOURCE_MAPPING:VIEW + DATA_SOURCE_REGISTRY:VIEW), newest first, paginated in the URL. One
// primary action: continue the newest draft, or start a new version (CREATE). Deleting a draft
// needs DELETE; starting a draft from another version is offered on the version page.
// Approval is a later governance step and is not offered here.
export default function SourceVersionListPage() {
  const { sourceId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = usePermissions()
  const validId = ID.test(sourceId ?? '')
  const page = readPage(searchParams)
  const source = useResource(validId ? `wf-source:${sourceId}` : null, (signal) =>
    workflowManagerService.getSource(sourceId, { signal }),
  )
  const versions = useResource(
    validId ? `wf-source-mappings:${sourceId}:${page}` : null,
    (signal) =>
      workflowManagerService.listSourceMappingVersions(
        sourceId,
        { page, pageSize: PAGE_SIZE },
        { signal },
      ),
  )
  const action = useWorkflowAction()
  const [confirm, setConfirm] = useState(null)
  const [notice, setNotice] = useState(location.state?.notice ?? null)
  const canCreate = can(WORKFLOW_ACTIONS.MAPPING_CREATE)
  const canUpdate = can(WORKFLOW_ACTIONS.MAPPING_UPDATE)
  const canDelete = can(WORKFLOW_ACTIONS.MAPPING_DELETE)

  if (!validId) {
    return (
      <AdminPage eyebrow="Workflow Manager · Data source fields" title="Field versions">
        <Panel>
          <p className="zrv-admin-state" role="status">
            This data source address is not valid.{' '}
            <Link className="zrv-admin-link" to={PATHS.sources}>
              Back to the data source registry
            </Link>
          </p>
        </Panel>
      </AdminPage>
    )
  }

  const runDelete = async (version) => {
    const outcome = await action.run(
      () =>
        workflowManagerService.deleteSourceMappingVersion(
          sourceId,
          version.sourceVersionId,
          version.rowVersion,
        ),
      { success: `Draft version ${version.versionNo} deleted.` },
    )
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') setConfirm(null)
    versions.reload()
  }

  const data = source.data
  // The newest draft on the first page is the one to continue (versions are newest first).
  const openDraft =
    page === 1 ? (versions.data?.items ?? []).find((version) => version.editable) : null
  const primary =
    openDraft && canUpdate ? (
      <Link className="btn-primary" to={PATHS.sourceVersion(sourceId, openDraft.sourceVersionId)}>
        <OrvexaIcon name="arrow-right" className="size-4" /> Continue draft version{' '}
        {openDraft.versionNo}
      </Link>
    ) : canCreate && data ? (
      <Link className="btn-primary" to={PATHS.newSourceVersion(sourceId)}>
        <OrvexaIcon name="plus" className="size-4" /> Start a new version
      </Link>
    ) : null

  return (
    <AdminPage
      eyebrow="Workflow Manager · Data source fields"
      title={data ? `Fields of ${data.sourceName}` : 'Field versions'}
      description="Choose once which information of this data source business forms may use, how private each piece is, and how a record is identified. Each saved choice is a version; drafts can be changed, other versions are read-only."
      actions={
        <>
          <Link className="btn-secondary" to={PATHS.sources}>
            Back to registry
          </Link>
          {primary}
        </>
      }
    >
      {notice && (
        <Feedback
          feedback={{ kind: 'success', message: notice, details: [] }}
          onDismiss={() => setNotice(null)}
        />
      )}
      {!confirm && (
        <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
      )}

      <ResourceState
        resource={source}
        label="data source"
        notFound="This data source is not registered."
        empty="This data source is not registered."
      >
        {(record) => {
          const readiness = sourceReadiness(record)
          return (
            <Panel
              title="Readiness"
              actions={<ReadinessBadge readiness={readiness} />}
              className="zwf-context"
            >
              <p className="zwf-readiness-text">{READINESS_TEXT[readiness.state]}</p>
              <DetailList
                items={[
                  ['Status', <ActiveBadge key="status" active={record.isActive} />],
                  ['Versions', String(record.versionCount)],
                ]}
              />
              <TechnicalDetails>
                <DetailList
                  items={[
                    ['Kind', SOURCE_KIND_LABELS[record.sourceKind]],
                    [
                      'Database object',
                      <span key="o" className="zwf-code">
                        {sourceObjectLabel(record)}
                      </span>,
                    ],
                    ['Source code', <code key="c">{record.sourceCode}</code>],
                  ]}
                />
              </TechnicalDetails>
            </Panel>
          )
        }}
      </ResourceState>

      {source.status === 'ready' && (
        <Panel title="History">
          <ResourceState
            resource={versions}
            label="field versions"
            empty={
              canCreate
                ? 'No versions yet. Use Start a new version to choose the information forms may use.'
                : 'No versions yet.'
            }
          >
            {({ items, pagination }) => (
              <>
                <div className="ux-table-wrap">
                  <table
                    className="ux-table zrv-admin-table zwf-table"
                    aria-busy={versions.refreshing || undefined}
                  >
                    <caption className="sr-only">Versions of the field list</caption>
                    <thead>
                      <tr>
                        <th scope="col">Version</th>
                        <th scope="col">Status</th>
                        <th scope="col">Last checked</th>
                        <th scope="col">Last updated</th>
                        <th scope="col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {!items.length && (
                        <tr>
                          <td colSpan={5} className="zrv-admin-state">
                            No versions on this page. Use Previous to go back.
                          </td>
                        </tr>
                      )}
                      {items.map((version) => (
                        <tr key={version.sourceVersionId}>
                          <th scope="row">
                            <Link
                              className="zrv-admin-link"
                              to={PATHS.sourceVersion(sourceId, version.sourceVersionId)}
                            >
                              <b>Version {version.versionNo}</b>
                            </Link>
                            {version.isDefault && <Badge tone="good">In use</Badge>}
                          </th>
                          <td>
                            <Badge tone={LIFECYCLE_TONES[version.lifecycleState]}>
                              {LIFECYCLE_LABELS[version.lifecycleState]}
                            </Badge>
                          </td>
                          <td>{formatInstant(version.validatedAt)}</td>
                          <td>{formatInstant(version.updatedAt)}</td>
                          <td>
                            <span className="zwf-row-actions">
                              <Link
                                className="zrv-admin-link"
                                to={PATHS.sourceVersion(sourceId, version.sourceVersionId)}
                              >
                                {version.editable && canUpdate ? 'Edit' : 'Open'}
                                <span className="sr-only"> version {version.versionNo}</span>
                              </Link>
                              {canDelete && version.editable && (
                                <button
                                  type="button"
                                  className="zrv-admin-link zrv-admin-danger-text"
                                  onClick={() => {
                                    action.reset()
                                    setConfirm({ type: 'delete', version })
                                  }}
                                >
                                  Delete
                                  <span className="sr-only">
                                    {' '}
                                    draft version {version.versionNo}
                                  </span>
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  pagination={pagination}
                  onPage={(next) => setSearchParams(next > 1 ? { page: String(next) } : {})}
                  disabled={versions.refreshing}
                  label="Field version pages"
                />
              </>
            )}
          </ResourceState>
        </Panel>
      )}

      {confirm?.type === 'delete' && (
        <ConfirmDialog
          danger
          title={`Delete draft version ${confirm.version.versionNo}?`}
          description="The draft is removed permanently. This is refused if any form uses it, or if it changed since you loaded this list. Approved and other non-draft versions can never be deleted."
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
