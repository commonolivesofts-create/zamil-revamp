import { useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '../adminForms.js'
import { filterCatalog, flattenCatalog } from '../adminModel.js'
import { catalogMayBeIncomplete, defaultActionDescription, existingActions, isCodeOwnedResource } from '../catalogActions.js'
import { SECURITY_ACTIONS, SECURITY_MODULE_CODE } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'
import { ActiveBadge, AdminPage, ConfirmDialog, Feedback, Field, Panel, ResourceState } from '../components/AdminUi.jsx'
import CatalogFormDialog from '../components/CatalogFormDialog.jsx'

const ENTITY_LABELS = Object.freeze({ module: 'module', resource: 'resource', permission: 'action' })

// The live permission catalogue (GET /access-control/catalog), grouped by
// module, resource and action. With PERMISSION_CATALOG:MANAGE: add modules,
// resources and actions, and activate or deactivate them. The backend never
// lets anyone activate or deactivate security-administration entries, so no
// toggle is offered for them.
export default function PermissionCatalogPage() {
  const { can } = usePermissions()
  const manage = can(SECURITY_ACTIONS.PERMISSION_CATALOG_MANAGE)
  const catalog = useResource('catalog', (signal) => securityAdminService.getCatalog({ signal }))
  const action = useAdminAction()
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(true)
  const [dialog, setDialog] = useState(null)

  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }
  const close = () => setDialog(null)
  const finish = (outcome) => {
    if (outcome.status === 'ignored') return
    if (outcome.status === 'success') close()
    catalog.reload()
  }

  const toggle = (entity, item, moduleCode) => manage && moduleCode !== SECURITY_MODULE_CODE && (
    <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'toggle', entity, item })}>
      {item.isActive ? 'Deactivate' : 'Activate'}<span className="sr-only"> {item.label}</span>
    </button>
  )

  return (
    <AdminPage
      title="Permission catalog"
      description="Every module, resource and action that permissions are made of. Roles and overrides grant these permissions."
      actions={manage && <button type="button" className="btn-primary" onClick={() => open({ type: 'create', kind: 'module' })}><OrvexaIcon name="plus" className="size-4" /> Add module</button>}
    >
      {!dialog && <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />}
      <Panel>
        <div className="zrv-admin-toolbar" role="search" aria-label="Filter the catalog">
          <Field id="catalog-search" label="Search" hint="Module, resource or action code or name">
            <input {...fieldProps('catalog-search', { hint: true })} className="ux-input" type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <label className="zrv-admin-check">
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} /> Include inactive entries
          </label>
        </div>
        <ResourceState resource={catalog} label="permission catalog" empty="The permission catalog is empty.">
          {(data) => {
            const modules = filterCatalog(data, { search, includeInactive })
            const total = flattenCatalog(data).length
            const incomplete = catalogMayBeIncomplete(data)
            return (
              <>
                <p className="zrv-admin-hint" role="status">{total} {total === 1 ? 'permission' : 'permissions'} in {data.length} {data.length === 1 ? 'module' : 'modules'}{search ? ' · filtered' : ''}</p>
                {incomplete && <p className="zrv-admin-state" role="alert">The catalogue reached the server's display limit, so some entries may not be shown. Adding actions is unavailable until the complete catalogue can be loaded.</p>}
                {!modules.length && <p className="zrv-admin-state">No catalog entry matches.</p>}
                <div className="zrv-catalog">
                  {modules.map((module) => {
                    const moduleLabel = `${module.moduleName || module.moduleCode} (${module.moduleCode})`
                    return (
                      <section key={module.moduleId} className="zrv-catalog__module" aria-label={moduleLabel}>
                        <header>
                          <h2>{module.moduleName || module.moduleCode} <code>{module.moduleCode}</code></h2>
                          <ActiveBadge active={module.isActive} />
                          <span className="zrv-admin-actions-row">
                            {manage && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'create', kind: 'resource', parent: { id: module.moduleId, label: module.moduleCode } })}>Add resource</button>}
                            {toggle('module', { id: module.moduleId, isActive: module.isActive, label: module.moduleCode }, module.moduleCode)}
                          </span>
                        </header>
                        {module.moduleCode === SECURITY_MODULE_CODE && manage && <p className="zrv-admin-hint">Security administration entries are protected and cannot be activated or deactivated.</p>}
                        {!module.resources.length && <p className="zrv-admin-state">No resources.</p>}
                        <ul className="zrv-catalog__resources">
                          {module.resources.map((resource) => (
                            <li key={resource.resourceId}>
                              <div className="zrv-catalog__resource">
                                <span><b>{resource.resourceName || resource.resourceCode}</b> <code>{resource.resourceCode}</code></span>
                                <ActiveBadge active={resource.isActive} />
                                <span className="zrv-admin-actions-row">
                                  {manage && <button type="button" className="zrv-admin-link" onClick={() => open({ type: 'create', kind: 'permission', parent: {
                                    id: resource.resourceId,
                                    label: `${module.moduleCode}.${resource.resourceCode}`,
                                    resourceName: resource.resourceName || resource.resourceCode,
                                    existing: existingActions(resource),
                                    codeOwned: isCodeOwnedResource(module.moduleCode, resource.resourceCode),
                                    catalogIncomplete: incomplete,
                                    exampleDescription: defaultActionDescription('VIEW', resource.resourceName || resource.resourceCode),
                                  } })}>Add actions</button>}
                                  {toggle('resource', { id: resource.resourceId, isActive: resource.isActive, label: `${module.moduleCode}.${resource.resourceCode}` }, module.moduleCode)}
                                </span>
                              </div>
                              {resource.permissions.length > 0 && (
                                <ul className="zrv-catalog__actions">
                                  {resource.permissions.map((permission) => (
                                    <li key={permission.permissionId} className={permission.isActive ? undefined : 'is-inactive'}>
                                      <code>{permission.actionCode}</code>
                                      {!permission.isActive && <small> (inactive)</small>}
                                      {permission.description && <small className="zrv-admin-sub">{permission.description}</small>}
                                      {toggle('permission', { id: permission.permissionId, isActive: permission.isActive, label: `${module.moduleCode}.${resource.resourceCode}:${permission.actionCode}` }, module.moduleCode)}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              </>
            )
          }}
        </ResourceState>
      </Panel>

      {dialog?.type === 'create' && <CatalogFormDialog kind={dialog.kind} parent={dialog.parent} action={action} onClose={close} onSaved={finish} />}
      {dialog?.type === 'toggle' && (
        <ConfirmDialog
          danger={dialog.item.isActive}
          title={`${dialog.item.isActive ? 'Deactivate' : 'Activate'} ${ENTITY_LABELS[dialog.entity]} ${dialog.item.label}?`}
          confirmLabel={dialog.item.isActive ? 'Deactivate' : 'Activate'}
          pending={action.pending} feedback={action.feedback} onClose={close}
          description={dialog.item.isActive
            ? 'Permissions under an inactive entry stop applying immediately for every role and override that grants them.'
            : 'Grants under this entry apply again where the rest of the chain is active.'}
          onConfirm={async () => finish(await action.run(() => securityAdminService.setCatalogActive(dialog.entity, dialog.item.id, !dialog.item.isActive), {
            success: (result) => result.changed ? `${dialog.item.label} ${result.isActive ? 'activated' : 'deactivated'}.` : 'Nothing changed; the entry already had that state.',
            refreshAccess: true,
          }))}
        />
      )}
    </AdminPage>
  )
}
