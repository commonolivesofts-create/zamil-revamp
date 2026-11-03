import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { AdminPage, Panel, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { PATHS, WORKFLOW_ACTIONS } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'
import '@/styles/workflow-manager.css'

function Stat({ icon, label, value, meta, to }) {
  const body = (
    <>
      <span className="zwf-stat__label"><OrvexaIcon name={icon} />{label}</span>
      <span className="zwf-stat__value">{value.toLocaleString()}</span>
      <span className="zwf-stat__meta">{meta}</span>
    </>
  )
  return to ? <Link className="zwf-stat" to={to}>{body}</Link> : <div className="zwf-stat">{body}</div>
}

// Workflow Manager entry page (GET /workflow-manager/overview): live registry
// counts for the registries the user may view, and links to the operations the
// user is permitted to perform. Workflow runtime is not active in Phase 1.
export default function WorkflowOverviewPage() {
  const { can } = usePermissions()
  const overview = useResource('workflow-overview', (signal) => workflowManagerService.getOverview({ signal }))

  const tasks = [
    can(WORKFLOW_ACTIONS.FORMS_VIEW) && { to: PATHS.forms, icon: 'file-stack', title: 'Form registry', text: 'Search registered forms, open a form and review its mapping versions.' },
    can(WORKFLOW_ACTIONS.FORMS_CREATE) && { to: PATHS.newForm, icon: 'file-plus', title: 'Register a form', text: 'Add an existing business form so workflows can be configured for it.' },
    can(WORKFLOW_ACTIONS.SOURCES_VIEW) && { to: PATHS.sources, icon: 'database', title: 'Data source registry', text: 'Review and register the approved tables, views and handlers forms read from.' },
  ].filter(Boolean)

  return (
    <AdminPage
      eyebrow="Workflow Manager"
      title="Workflow Manager"
      description="Configure approval workflows for Zamil business forms. Start by registering the forms and the approved data sources they use."
    >
      <ResourceState resource={overview} label="Workflow Manager overview" isEmpty={() => false}>
        {(data) => (
          <>
            {(data.forms || data.dataSources) && (
              <section className="zwf-stats" aria-label="Registry summary">
                {data.forms && (
                  <Stat icon="file-stack" label="Registered forms" value={data.forms.total} meta={`${data.forms.active} active · ${data.forms.total - data.forms.active} inactive`} to={PATHS.forms} />
                )}
                {data.dataSources && (
                  <>
                    <Stat icon="database" label="Data sources" value={data.dataSources.total} meta={`${data.dataSources.active} active · ${data.dataSources.total - data.dataSources.active} inactive`} to={PATHS.sources} />
                    <Stat icon="table" label="Tables and views" value={data.dataSources.byKind.TABLE.total + data.dataSources.byKind.VIEW.total} meta={`${data.dataSources.byKind.TABLE.total} tables · ${data.dataSources.byKind.VIEW.total} views`} />
                  </>
                )}
              </section>
            )}
            {!data.forms && !data.dataSources && (
              <p className="zrv-admin-state" role="status">You can open the Workflow Manager, but you have no permission to view its registries. Ask your administrator for Form registry or Data source registry access.</p>
            )}
          </>
        )}
      </ResourceState>

      {tasks.length > 0 && (
        <Panel title="Available to you" description="Only the operations your permissions allow are listed.">
          <ul className="zwf-tasks">
            {tasks.map((task) => (
              <li key={task.to}>
                <Link to={task.to}>
                  <OrvexaIcon name={task.icon} />
                  <span><b>{task.title}</b><small>{task.text}</small></span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="zrv-admin-note" role="note">
        Workflow execution is not active: registering forms and data sources does not submit requests, create approval tasks or send e-mails.
      </p>
    </AdminPage>
  )
}
