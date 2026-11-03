import { useNavigate } from 'react-router'
import { AdminPage, Panel } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import FormEditor from '../components/FormEditor.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import { PATHS, emptyForm } from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

// Register a form (POST /workflow-manager/forms, FORM_REGISTRY:CREATE). On
// success the new record opens; a refused or uncertain result stays here with
// the entered values so nothing is submitted twice unknowingly.
export default function FormRegistrationPage() {
  const navigate = useNavigate()
  const modules = useResource('wf-modules', (signal) => workflowManagerService.listModules({ signal }))
  const action = useWorkflowAction()

  const submit = async (payload) => {
    const outcome = await action.run(() => workflowManagerService.createForm(payload))
    if (outcome.status === 'success') {
      navigate(PATHS.form(outcome.value.formId), { state: { notice: `Form ${outcome.value.formCode} registered.` } })
    }
  }

  return (
    <AdminPage
      eyebrow="Workflow Manager · Form registry"
      title="Register form"
      description="Record an existing business form so its workflow can be configured. Organization scope, fields and statuses are mapped in the form's versioned mapping, not here."
    >
      <Panel title="Form identity">
        <FormEditor initial={emptyForm()} create modules={modules} action={action} onSubmit={submit} />
      </Panel>
    </AdminPage>
  )
}
