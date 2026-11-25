import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import {
  AdminPage,
  Panel,
  ResourceState,
} from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { isGlobalDataLoadFailure } from '@/services/api/apiClient.js'
import GlobalErrorScreen from '@/components/feedback/GlobalErrorScreen.jsx'
import { ReadinessBadge } from '../components/WorkflowUi.jsx'
import { formReadiness } from '../smartMappingModel.js'
import { PAGE_SIZE, PATHS, WORKFLOW_ACTIONS } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'
import '@/styles/workflow-manager.css'

const READY_FIRST = { READY: 0, IN_SETUP: 1, NOT_STARTED: 2, INACTIVE: 3 }

function Stat({ icon, label, value, meta, to }) {
  const body = (
    <>
      <span className="zwf-stat__label">
        <OrvexaIcon name={icon} />
        {label}
      </span>
      <span className="zwf-stat__value">{value.toLocaleString()}</span>
      <span className="zwf-stat__meta">{meta}</span>
    </>
  )
  return to ? (
    <Link className="zwf-stat" to={to}>
      {body}
    </Link>
  ) : (
    <div className="zwf-stat">{body}</div>
  )
}

// One active business form and what it still needs before workflows can be designed for it.
function FormCard({ form }) {
  const readiness = formReadiness(form)
  return (
    <li className={`zwf-form-card is-${readiness.state.toLowerCase()}`}>
      <div className="zwf-form-card__head">
        <Link className="zwf-form-card__name" to={PATHS.form(form.formId)}>
          {form.formName}
        </Link>
        <ReadinessBadge readiness={readiness} />
      </div>
      <p className="zwf-form-card__module">{form.moduleName || form.moduleCode}</p>
      <p className="zwf-form-card__detail">{readiness.detail}</p>
      <p className="zwf-form-card__next">
        {readiness.state === 'READY'
          ? 'Next: configure its workflow — the workflow designer arrives in a later release.'
          : 'Next: a data administrator prepares its business data once (onboarding).'}
      </p>
    </li>
  )
}

// Workflow Manager entry page: which business forms are ready for workflows, from real data
// (GET /workflow-manager/forms readiness and /overview counts), and the administration tasks the
// user may perform. No action is offered that the system cannot perform yet.
export default function WorkflowOverviewPage() {
  const { can } = usePermissions()
  const canForms = can(WORKFLOW_ACTIONS.FORMS_VIEW)
  const overview = useResource('workflow-overview', (signal) =>
    workflowManagerService.getOverview({ signal }),
  )
  const forms = useResource(canForms ? 'workflow-overview-forms' : null, (signal) =>
    workflowManagerService.listForms(
      { page: 1, pageSize: PAGE_SIZE, status: 'ACTIVE', sortBy: 'FORM_NAME', sortDir: 'asc' },
      { signal },
    ),
  )
  const failed = (resource) =>
    resource.status === 'error' &&
    (isGlobalDataLoadFailure(resource.error) || resource.error?.code === 'ABORTED')
  const formsFailed = failed(forms)
  const overviewFailed = failed(overview)
  const retryFailedData = () => {
    if (formsFailed) forms.reload()
    if (overviewFailed) overview.reload()
  }

  const tasks = [
    can(WORKFLOW_ACTIONS.FORMS_CREATE) && {
      to: PATHS.newForm,
      icon: 'file-plus',
      title: 'Register a business form',
      text: 'Make an existing Zamil form known to the Workflow Manager.',
    },
    canForms && {
      to: PATHS.forms,
      icon: 'file-stack',
      title: 'All registered forms',
      text: 'Search forms, see their readiness and open their details.',
    },
    can(WORKFLOW_ACTIONS.SOURCES_VIEW) && {
      to: PATHS.sources,
      icon: 'database',
      title: 'Prepare business data',
      text: 'For data administrators: approve which information forms may use (one-time onboarding).',
    },
  ].filter(Boolean)

  return (
    <AdminPage
      eyebrow="Workflow Manager"
      title="Workflow Manager"
      description="Set up approval workflows for Zamil business forms. A form is ready for workflows once its business data has been prepared and approved."
    >
      {formsFailed || overviewFailed ? (
        <div className="zrv-global-error-slot zrv-global-error-slot--card">
          <GlobalErrorScreen inline onRetry={retryFailedData} retryAll={false} />
        </div>
      ) : (
        <>
      {canForms && (
        <Panel
          title="Business forms"
          description="Active forms and how ready they are for workflows. Readiness comes from the approved business data of each form."
          actions={
            <Link className="btn-secondary" to={PATHS.forms}>
              All forms
            </Link>
          }
        >
          <ResourceState
            resource={forms}
            label="business forms"
            empty={
              can(WORKFLOW_ACTIONS.FORMS_CREATE)
                ? 'No active forms yet. Register a business form to begin.'
                : 'No active forms are registered yet.'
            }
          >
            {({ items, pagination }) => (
              <>
                <ul className="zwf-form-cards" aria-busy={forms.refreshing || undefined}>
                  {[...items]
                    .sort(
                      (a, b) =>
                        READY_FIRST[formReadiness(a).state] - READY_FIRST[formReadiness(b).state],
                    )
                    .map((form) => (
                      <FormCard key={form.formId} form={form} />
                    ))}
                </ul>
                {pagination.total > items.length && (
                  <p className="zrv-admin-hint">
                    Showing {items.length} of {pagination.total} active forms.{' '}
                    <Link className="zrv-admin-link" to={PATHS.forms}>
                      See all forms
                    </Link>
                  </p>
                )}
              </>
            )}
          </ResourceState>
        </Panel>
      )}

      <ResourceState resource={overview} label="Workflow Manager overview" isEmpty={() => false}>
        {(data) => (
          <>
            {(data.forms || data.dataSources) && (
              <section className="zwf-stats" aria-label="Registry summary">
                {data.forms && (
                  <Stat
                    icon="file-stack"
                    label="Registered forms"
                    value={data.forms.total}
                    meta={`${data.forms.active} active · ${data.forms.total - data.forms.active} inactive`}
                    to={PATHS.forms}
                  />
                )}
                {data.dataSources && (
                  <Stat
                    icon="database"
                    label="Data sources"
                    value={data.dataSources.total}
                    meta={`${data.dataSources.active} active · ${data.dataSources.total - data.dataSources.active} inactive`}
                    to={PATHS.sources}
                  />
                )}
              </section>
            )}
            {!data.forms && !data.dataSources && (
              <p className="zrv-admin-state" role="status">
                You can open the Workflow Manager, but you have no permission to view its forms or
                data. Ask your administrator for Form registry or Data source registry access.
              </p>
            )}
          </>
        )}
      </ResourceState>
        </>
      )}

      {tasks.length > 0 && (
        <Panel title="What you can do" description="Only tasks your permissions allow are listed.">
          <ul className="zwf-tasks">
            {tasks.map((task) => (
              <li key={task.to}>
                <Link to={task.to}>
                  <OrvexaIcon name={task.icon} />
                  <span>
                    <b>{task.title}</b>
                    <small>{task.text}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="zrv-admin-note" role="note">
        Workflow execution is not active yet: preparing forms and data does not submit requests,
        create approval tasks or send e-mails.
      </p>
    </AdminPage>
  )
}
