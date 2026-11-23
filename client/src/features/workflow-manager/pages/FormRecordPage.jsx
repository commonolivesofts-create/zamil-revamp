import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import {
  AdminPage,
  DetailList,
  Feedback,
  Panel,
  ResourceState,
} from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import FormEditor from '../components/FormEditor.jsx'
import {
  ActivationDialog,
  ActiveBadge,
  FormJourney,
  ReadinessBadge,
  TechnicalDetails,
  VersionTable,
} from '../components/WorkflowUi.jsx'
import { formReadiness } from '../smartMappingModel.js'
import useWorkflowAction from '../useWorkflowAction.js'
import { PATHS, WORKFLOW_ACTIONS, formDraft } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

const ID = /^[1-9][0-9]{0,18}$/

// One registered form (GET /workflow-manager/forms/:formId, FORM_REGISTRY:VIEW): how ready it is
// for workflows, its business details, editing (UPDATE) with optimistic locking, activation
// (ACTIVATE / DEACTIVATE) and its read-only business data versions. Technical identity (form code,
// detail route, record version, fingerprints) is shown to form administrators only.
export default function FormRecordPage() {
  const { formId } = useParams()
  const location = useLocation()
  const { can } = usePermissions()
  const validId = ID.test(formId ?? '')
  const form = useResource(validId ? `wf-form:${formId}` : null, (signal) =>
    workflowManagerService.getForm(formId, { signal }),
  )
  const versions = useResource(validId ? `wf-form-versions:${formId}` : null, (signal) =>
    workflowManagerService.listFormVersions(formId, { signal }),
  )
  const canEdit = can(WORKFLOW_ACTIONS.FORMS_UPDATE)
  const technical = canEdit || can(WORKFLOW_ACTIONS.FORMS_CREATE)
  // Module names for the select; the lookup needs only FORM_REGISTRY:VIEW.
  const modules = useResource(validId ? 'wf-modules' : null, (signal) =>
    workflowManagerService.listModules({ signal }),
  )
  const action = useWorkflowAction()
  const toggleAction = useWorkflowAction()
  const [toggling, setToggling] = useState(false)
  const [notice, setNotice] = useState(location.state?.notice ?? null)
  const [editorKey, setEditorKey] = useState(0)

  const reload = () => {
    action.reset()
    form.reload()
    versions.reload()
    setEditorKey((value) => value + 1)
  }

  if (!validId) {
    return (
      <AdminPage eyebrow="Workflow Manager · Form registry" title="Registered form">
        <Panel>
          <p className="zrv-admin-state" role="status">
            This form address is not valid.{' '}
            <Link className="zrv-admin-link" to={PATHS.forms}>
              Back to the form registry
            </Link>
          </p>
        </Panel>
      </AdminPage>
    )
  }

  return (
    <AdminPage
      eyebrow="Workflow Manager · Form registry"
      title={form.data ? form.data.formName : 'Registered form'}
      description={form.data ? form.data.moduleName || form.data.moduleCode : undefined}
      actions={
        <Link className="btn-secondary" to={PATHS.forms}>
          Back to registry
        </Link>
      }
    >
      {notice && (
        <Feedback
          feedback={{ kind: 'success', message: notice, details: [] }}
          onDismiss={() => setNotice(null)}
        />
      )}
      {!toggling && (
        <Feedback
          feedback={toggleAction.feedback}
          onDismiss={() => toggleAction.setFeedback(null)}
        />
      )}
      {action.feedback?.kind === 'success' && (
        <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
      )}
      <ResourceState
        resource={form}
        label="form"
        notFound="This form is not registered. It may have been entered incorrectly."
        empty="This form is not registered."
      >
        {(record) => {
          const canToggle = can(
            record.isActive ? WORKFLOW_ACTIONS.FORMS_DEACTIVATE : WORKFLOW_ACTIONS.FORMS_ACTIVATE,
          )
          return (
            <>
              <Panel
                title="Readiness for workflows"
                description="What this form still needs before approval workflows can be designed for it."
                actions={<ReadinessBadge readiness={formReadiness(record)} />}
              >
                <FormJourney form={record} />
              </Panel>
              <div className="zrv-admin-split">
                <Panel
                  title="Registration"
                  actions={
                    canToggle && (
                      <button
                        type="button"
                        className={
                          record.isActive
                            ? 'btn-secondary zrv-admin-danger-outline'
                            : 'btn-secondary'
                        }
                        onClick={() => {
                          toggleAction.reset()
                          setToggling(true)
                        }}
                      >
                        {record.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )
                  }
                >
                  <DetailList
                    items={[
                      ['Status', <ActiveBadge key="status" active={record.isActive} />],
                      ['Module', record.moduleName || record.moduleCode],
                      ['Business data versions', String(record.versionCount)],
                      [
                        'Registered',
                        `${formatInstant(record.createdAt)}${record.createdByName ? ` by ${record.createdByName}` : ''}`,
                      ],
                      [
                        'Last updated',
                        `${formatInstant(record.updatedAt)}${record.updatedByName ? ` by ${record.updatedByName}` : ''}`,
                      ],
                    ]}
                  />
                  {technical && (
                    <TechnicalDetails>
                      <DetailList
                        items={[
                          ['Form code', <code key="code">{record.formCode}</code>],
                          ['Module code', <code key="module">{record.moduleCode}</code>],
                          [
                            'Detail route',
                            record.detailRoute ? (
                              <code key="route">{record.detailRoute}</code>
                            ) : (
                              'Not set'
                            ),
                          ],
                          ['Record version', String(record.rowVersion)],
                        ]}
                      />
                    </TechnicalDetails>
                  )}
                </Panel>
                <Panel
                  title={canEdit ? 'Edit details' : 'Details'}
                  description={
                    canEdit
                      ? 'Changes are saved only if nobody else changed the form since you opened it.'
                      : 'You can view this form but not change it.'
                  }
                >
                  <FormEditor
                    key={`${record.formId}:${record.rowVersion}:${editorKey}`}
                    initial={formDraft(record)}
                    create={false}
                    readOnly={!canEdit}
                    technical={technical}
                    modules={modules}
                    action={action}
                    onReload={reload}
                    onSubmit={async (payload) => {
                      const outcome = await action.run(
                        () =>
                          workflowManagerService.updateForm(record.formId, {
                            ...payload,
                            rowVersion: record.rowVersion,
                          }),
                        { success: 'Changes saved.' },
                      )
                      if (outcome.status === 'success' || outcome.status === 'unknown') {
                        setNotice(null)
                        form.reload()
                      }
                    }}
                  />
                </Panel>
              </div>
              {toggling && (
                <ActivationDialog
                  item={record}
                  entity="form"
                  label={record.formName}
                  pending={toggleAction.pending}
                  feedback={toggleAction.feedback}
                  onClose={() => setToggling(false)}
                  onConfirm={async () => {
                    const outcome = await toggleAction.run(
                      () =>
                        workflowManagerService.setFormActive(
                          record.formId,
                          !record.isActive,
                          record.rowVersion,
                        ),
                      {
                        success: (saved) =>
                          `${saved.formName} ${saved.isActive ? 'activated' : 'deactivated'}.`,
                      },
                    )
                    if (outcome.status === 'ignored') return
                    if (outcome.status === 'success') setToggling(false)
                    form.reload()
                  }}
                />
              )}
            </>
          )
        }}
      </ResourceState>

      {form.status === 'ready' && (
        <Panel
          title="Business data versions"
          description="Read only. Each version records which business information of this form workflows may use. Versions are prepared by data administrators and approved before use."
        >
          <ResourceState resource={versions} label="business data versions" isEmpty={() => false}>
            {(items) => (
              <VersionTable
                versions={items}
                caption="Business data versions of this form"
                sourceColumn
                technical={technical}
              />
            )}
          </ResourceState>
        </Panel>
      )}
    </AdminPage>
  )
}
