import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { checkSearch, fieldProps } from '@/features/security-administration/adminForms.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { AdminPage, Feedback, Field, Pagination, Panel, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { ActivationDialog, ActiveBadge } from '../components/WorkflowUi.jsx'
import useWorkflowAction from '../useWorkflowAction.js'
import {
  FORM_FILTER_DEFAULTS, FORM_SORTS, PAGE_SIZE, PATHS, WORKFLOW_ACTIONS, filterParams, readFormFilters,
} from '../workflowManagerModel.js'
import { workflowManagerService } from '../workflowManagerService.js'

// Registered forms (GET /workflow-manager/forms, FORM_REGISTRY:VIEW) with the
// backend's search, module/status filters, sorting and pagination. Filters
// live in the URL. Register (CREATE), open, activate (ACTIVATE) and deactivate
// (DEACTIVATE) appear only with the matching permission.
export default function FormRegistryPage() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readFormFilters(searchParams)
  const [searchText, setSearchText] = useState(filters.search)
  const [searchError, setSearchError] = useState(null)
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchText(filters.search)
    setSearchError(null)
  }
  const query = { ...filters, pageSize: PAGE_SIZE }
  const forms = useResource(`wf-forms:${JSON.stringify(query)}`, (signal) => workflowManagerService.listForms(query, { signal }))
  const modules = useResource('wf-modules', (signal) => workflowManagerService.listModules({ signal }))
  const action = useWorkflowAction()
  const [toggle, setToggle] = useState(null)

  const update = (changes) => setSearchParams(filterParams({ ...filters, page: 1, ...changes }, FORM_FILTER_DEFAULTS))
  const submitSearch = (event) => {
    event.preventDefault()
    const { term, error } = checkSearch(searchText)
    setSearchError(error)
    if (!error) update({ search: term })
  }
  const canToggle = (form) => can(form.isActive ? WORKFLOW_ACTIONS.FORMS_DEACTIVATE : WORKFLOW_ACTIONS.FORMS_ACTIVATE)
  const confirmToggle = async () => {
    const form = toggle
    const outcome = await action.run(() => workflowManagerService.setFormActive(form.formId, !form.isActive, form.rowVersion), {
      success: (saved) => `${saved.formCode} ${saved.isActive ? 'activated' : 'deactivated'}.`,
    })
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') setToggle(null)
    forms.reload()
  }

  return (
    <AdminPage
      eyebrow="Workflow Manager"
      title="Form registry"
      description="Business forms registered for workflow configuration. Registration records the form's identity and owning module; field and status mapping is configured separately."
      actions={can(WORKFLOW_ACTIONS.FORMS_CREATE) && <Link className="btn-primary" to={PATHS.newForm}><OrvexaIcon name="plus" className="size-4" /> Register form</Link>}
    >
      {!toggle && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      <Panel>
        <form className="zrv-admin-toolbar" onSubmit={submitSearch} role="search" aria-label="Search registered forms" noValidate>
          <Field id="wf-forms-search" label="Search" hint="Form code, name or module code" error={searchError}>
            <input {...fieldProps('wf-forms-search', { hint: true, error: searchError })} className="ux-input" type="search" value={searchText} maxLength={100} onChange={(event) => setSearchText(event.target.value)} />
          </Field>
          <Field id="wf-forms-module" label="Module">
            <select id="wf-forms-module" className="ux-select" value={filters.moduleCode} onChange={(event) => update({ moduleCode: event.target.value })} disabled={modules.status === 'loading'}>
              <option value="">All modules</option>
              {(modules.data || []).map((module) => <option key={module.moduleCode} value={module.moduleCode}>{module.moduleName || module.moduleCode}</option>)}
              {filters.moduleCode && modules.data && !modules.data.some((module) => module.moduleCode === filters.moduleCode) && <option value={filters.moduleCode}>{filters.moduleCode}</option>}
            </select>
          </Field>
          <Field id="wf-forms-status" label="Status">
            <select id="wf-forms-status" className="ux-select" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
          <Field id="wf-forms-sort" label="Sort by">
            <select id="wf-forms-sort" className="ux-select" value={`${filters.sortBy}:${filters.sortDir}`} onChange={(event) => { const [sortBy, sortDir] = event.target.value.split(':'); update({ sortBy, sortDir }) }}>
              {Object.entries(FORM_SORTS).flatMap(([value, label]) => [
                <option key={`${value}:asc`} value={`${value}:asc`}>{label} ↑</option>,
                <option key={`${value}:desc`} value={`${value}:desc`}>{label} ↓</option>,
              ])}
            </select>
          </Field>
          <div className="zrv-admin-toolbar__submit">
            <button type="submit" className="btn-primary">Search</button>
          </div>
        </form>
        {modules.status === 'error' && <p className="zrv-admin-hint" role="alert">The module list could not be loaded; the module filter shows only the current selection.</p>}

        <ResourceState
          resource={forms}
          label="registered forms"
          empty={filters.search || filters.moduleCode || filters.status ? 'No registered form matches these filters.' : 'No forms are registered yet.'}
        >
          {({ items, pagination }) => (
            <>
              <div className="ux-table-wrap">
                <table className="ux-table zrv-admin-table zwf-table" aria-busy={forms.refreshing || undefined}>
                  <caption className="sr-only">Registered forms</caption>
                  <thead>
                    <tr>
                      <th scope="col">Form</th>
                      <th scope="col">Module</th>
                      <th scope="col">Detail route</th>
                      <th scope="col">Versions</th>
                      <th scope="col">Status</th>
                      <th scope="col">Last updated</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {!items.length && <tr><td colSpan={7} className="zrv-admin-state">No forms on this page. Use Previous to go back.</td></tr>}
                    {items.map((form) => (
                      <tr key={form.formId} className={form.isActive ? undefined : 'is-inactive'}>
                        <td><b>{form.formName}</b><small className="zrv-admin-sub zwf-code">{form.formCode}</small></td>
                        <td>{form.moduleName || form.moduleCode}<small className="zrv-admin-sub zwf-code">{form.moduleCode}</small></td>
                        <td>{form.detailRoute ? <span className="zwf-code">{form.detailRoute}</span> : '—'}</td>
                        <td>{form.versionCount}</td>
                        <td><ActiveBadge active={form.isActive} /></td>
                        <td>{formatInstant(form.updatedAt)}</td>
                        <td>
                          <span className="zwf-row-actions">
                            <Link className="zrv-admin-link" to={PATHS.form(form.formId)}>Open<span className="sr-only"> {form.formCode}</span></Link>
                            {canToggle(form) && (
                              <button type="button" className="zrv-admin-link" onClick={() => { action.reset(); setToggle(form) }}>
                                {form.isActive ? 'Deactivate' : 'Activate'}<span className="sr-only"> {form.formCode}</span>
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={pagination} onPage={(page) => update({ page })} disabled={forms.refreshing} label="Form registry pages" />
            </>
          )}
        </ResourceState>
      </Panel>

      {toggle && (
        <ActivationDialog
          item={toggle}
          entity="form"
          label={toggle.formCode}
          pending={action.pending}
          feedback={action.feedback}
          onClose={() => setToggle(null)}
          onConfirm={confirmToggle}
        />
      )}
    </AdminPage>
  )
}
