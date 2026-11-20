import { useState } from 'react'
import { Link } from 'react-router'
import '@/styles/security-roles.css'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import HorizontalTableScroll from '@/components/ui/HorizontalTableScroll.jsx'
import { canAccessRoute, findAppRoute } from '@/config/appNavigation.js'
import usePermissions from '@/features/access/usePermissions.js'

import { formatInstant } from '../adminFeedback.js'
import { PAGE_SIZE } from '../adminModel.js'
import { SECURITY_ACTIONS } from '../securityActions.js'
import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'

import {
  ActiveBadge,
  AdminPage,
  ConfirmDialog,
  Feedback,
  Pagination,
  Panel,
  ResourceState,
} from '../components/AdminUi.jsx'

import RoleFormDialog from '../components/RoleFormDialog.jsx'

// Convert Oracle codes to readable UI labels.
const humanize = (value) =>
  String(value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase())

// Group existing RBAC permissions by module and resource.
// All permissions are derived from API data.
function groupPermissions(grants) {
  const modules = new Map()

  for (const grant of grants ?? []) {
    if (!grant.isActive) continue

    const moduleCode = grant.moduleCode
    const resourceCode = grant.resourceCode

    if (!modules.has(moduleCode)) {
      modules.set(moduleCode, new Map())
    }

    const resources = modules.get(moduleCode)

    if (!resources.has(resourceCode)) {
      resources.set(resourceCode, new Set())
    }

    resources.get(resourceCode).add(grant.actionCode)
  }

  return [...modules.entries()]
    .map(([code, resources]) => {
      const rows = [...resources.entries()].map(([resourceCode, actions]) => ({
        code: resourceCode,
        label: humanize(resourceCode),
        actions,
      }))

      const actionCodes = [...new Set(rows.flatMap((row) => [...row.actions]))]

      const priority = ['VIEW', 'CREATE', 'UPDATE', 'DELETE']

      actionCodes.sort((a, b) => {
        const ai = priority.indexOf(a)
        const bi = priority.indexOf(b)

        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? 100 : ai) - (bi === -1 ? 100 : bi)
        }

        return a.localeCompare(b)
      })

      return {
        code,
        label: humanize(code),
        rows,
        actionCodes,
        count: rows.reduce((sum, row) => sum + row.actions.size, 0),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export default function RolesPage() {
  const access = usePermissions()
  const { can } = access

  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [dialog, setDialog] = useState(null)

  const [roleSearch, setRoleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [permissionSearch, setPermissionSearch] = useState('')
  const [expandedModules, setExpandedModules] = useState({})

  const roles = useResource(`roles:${page}`, (signal) =>
    securityAdminService.listRoles({ page, limit: PAGE_SIZE }, { signal }),
  )

  const action = useAdminAction()

  const items = roles.data?.items ?? []

  // Automatically select the first role when the
  // user has not selected a specific role.
  const effectiveSelectedId = selectedId ?? items[0]?.roleId

  const selected = items.find((role) => role.roleId === effectiveSelectedId) ?? null

  // Search and status filter for the loaded page.
  const visibleRoles = items.filter((role) => {
    const term = roleSearch.trim().toLowerCase()

    const matchesText =
      !term ||
      [role.roleName, role.roleCode].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(term),
      )

    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'active' ? role.isActive : !role.isActive)

    return matchesText && matchesStatus
  })

  const showGrants = can(SECURITY_ACTIONS.ROLE_PERMISSIONS_VIEW)

  const grants = useResource(
    selected && showGrants ? `role-grants:${selected.roleId}` : null,
    (signal) => securityAdminService.listRolePermissions(selected.roleId, { signal }),
  )

  const manageGrants = canAccessRoute(findAppRoute('/security/role-permissions'), access)

  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }

  const close = () => setDialog(null)

  const finish = (outcome, { select } = {}) => {
    if (outcome.status === 'ignored') return

    if (outcome.status === 'success') {
      close()

      if (select) {
        setSelectedId(select)
      }
    }

    roles.reload()
  }

  return (
    <div className="zrv-roles-page">
      <AdminPage
        eyebrow="Security Administration / Role Management"
        title="Roles"
        description="Manage roles and their permissions across the system."
        actions={
          can(SECURITY_ACTIONS.ROLES_CREATE) && (
            <button
              type="button"
              className="btn-primary zrv-roles-create"
              onClick={() => open({ type: 'create' })}
            >
              <OrvexaIcon name="plus" />
              Create Role
            </button>
          )
        }
      >
        {!dialog && (
          <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
        )}

        <div className="zrv-admin-split zrv-roles-layout">
          {/* LEFT PANEL - ALL ROLES */}

          <Panel title="All Roles" className="zrv-roles-list-panel">
            <div className="zrv-roles-filters">
              <label className="zrv-roles-search">
                <OrvexaIcon name="search" />

                <span className="sr-only">Search roles on this page</span>

                <input
                  type="search"
                  placeholder="Search roles..."
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                />
              </label>

              <label className="zrv-roles-status-filter">
                <OrvexaIcon name="filter" />

                <span className="sr-only">Filter role status</span>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>

            <ResourceState resource={roles} label="roles" empty="No roles are defined.">
              {({ pagination }) => (
                <>
                  <div
                    className="zrv-roles-list"
                    role="list"
                    aria-busy={roles.refreshing || undefined}
                  >
                    {visibleRoles.length === 0 && (
                      <p className="zrv-admin-state">
                        No roles match the current filters on this page.
                      </p>
                    )}

                    {visibleRoles.map((role) => (
                      <div className="zrv-roles-list-item" role="listitem" key={role.roleId}>
                        <button
                          type="button"
                          className={`zrv-roles-item-button${
                            role.roleId === effectiveSelectedId ? ' is-selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedId(role.roleId)
                            setPermissionSearch('')
                            setExpandedModules({})
                          }}
                          aria-pressed={role.roleId === effectiveSelectedId}
                        >
                          <span className="zrv-roles-item-copy">
                            <strong>{role.roleName || role.roleCode}</strong>

                            <small>{role.roleCode}</small>
                          </span>

                          <ActiveBadge active={role.isActive} />

                          <OrvexaIcon name="chevron-right" className="zrv-roles-item-chevron" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="zrv-roles-list-footer">
                    <span>
                      Showing {visibleRoles.length} of {items.length} roles on this page
                    </span>

                    <Pagination
                      pagination={pagination}
                      onPage={(next) => {
                        setSelectedId(null)
                        setPermissionSearch('')
                        setExpandedModules({})
                        setPage(next)
                      }}
                      disabled={roles.refreshing}
                      label="Role pages"
                    />
                  </div>
                </>
              )}
            </ResourceState>
          </Panel>

          {/* RIGHT PANEL - ROLE DETAILS */}

          <Panel
            className="zrv-roles-detail-panel"
            title="Role Details"
            actions={
              selected && (
                <>
                  {can(SECURITY_ACTIONS.ROLES_UPDATE) && (
                    <button
                      type="button"
                      className="btn-secondary zrv-roles-edit"
                      onClick={() => open({ type: 'edit' })}
                    >
                      <OrvexaIcon name="pencil" />
                      Edit
                    </button>
                  )}

                  {can(SECURITY_ACTIONS.ROLES_UPDATE) && !selected.isActive && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => open({ type: 'activate' })}
                    >
                      Activate
                    </button>
                  )}

                  {can(SECURITY_ACTIONS.ROLES_DEACTIVATE) && selected.isActive && (
                    <button
                      type="button"
                      className="btn-secondary zrv-admin-danger-outline"
                      onClick={() => open({ type: 'deactivate' })}
                    >
                      <OrvexaIcon name="pause-circle" />
                      Deactivate
                    </button>
                  )}
                </>
              )
            }
          >
            {!selected ? (
              <p className="zrv-admin-state">Select a role to see its details.</p>
            ) : (
              <>
                {/* ROLE INFORMATION */}

                <div className="zrv-roles-info">
                  <div className="zrv-roles-info-column">
                    <div className="zrv-roles-info-field">
                      <span>Role Name</span>
                      <strong>{selected.roleName || selected.roleCode}</strong>
                    </div>

                    <div className="zrv-roles-info-field">
                      <span>Role Code</span>
                      <strong>{selected.roleCode}</strong>
                    </div>

                    <div className="zrv-roles-info-field">
                      <span>Status</span>
                      <ActiveBadge active={selected.isActive} />
                    </div>
                  </div>

                  <div className="zrv-roles-info-column">
                    <div className="zrv-roles-info-field">
                      <span>Description</span>
                      <strong>{selected.description || '—'}</strong>
                    </div>

                    <div className="zrv-roles-info-field">
                      <span>Created Date</span>
                      <strong>{formatInstant(selected.createdAt)}</strong>
                    </div>

                    <div className="zrv-roles-info-field">
                      <span>Updated Date</span>
                      <strong>
                        {selected.updatedAt ? formatInstant(selected.updatedAt) : '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* GRANTED PERMISSIONS */}

                {showGrants && (
                  <section className="zrv-roles-permissions" aria-label="Granted permissions">
                    <div className="zrv-roles-permissions-header">
                      <h3>
                        <OrvexaIcon name="wrench" />
                        Granted Permissions
                      </h3>

                      <div className="zrv-roles-permissions-actions">
                        <label className="zrv-roles-search">
                          <OrvexaIcon name="search" />

                          <span className="sr-only">Search granted permissions</span>

                          <input
                            type="search"
                            placeholder="Search permissions..."
                            value={permissionSearch}
                            onChange={(event) => setPermissionSearch(event.target.value)}
                          />
                        </label>

                        {manageGrants && (
                          <Link
                            className="zrv-roles-manage"
                            to={`/security/role-permissions?role=${selected.roleId}`}
                          >
                            <OrvexaIcon name="settings" />
                            Manage Permissions
                          </Link>
                        )}
                      </div>
                    </div>

                    <ResourceState
                      resource={grants}
                      label="role permissions"
                      empty="This role holds no permissions."
                      isEmpty={(data) => !data.some((grant) => grant.isActive)}
                    >
                      {(data) => {
                        const term = permissionSearch.trim().toLowerCase()

                        const groups = groupPermissions(data)
                          .map((module) => ({
                            ...module,
                            rows: module.rows.filter(
                              (row) =>
                                !term ||
                                [
                                  module.label,
                                  module.code,
                                  row.label,
                                  row.code,
                                  ...row.actions,
                                ].some((part) => String(part).toLowerCase().includes(term)),
                            ),
                          }))
                          .filter((module) => module.rows.length)

                        return groups.length ? (
                          <div className="zrv-roles-permission-groups">
                            {groups.map((module, index) => {
                              const expanded = expandedModules[module.code] ?? index === 0

                              return (
                                <section className="zrv-roles-permission-group" key={module.code}>
                                  <button
                                    type="button"
                                    className="zrv-roles-permission-toggle"
                                    aria-expanded={expanded}
                                    onClick={() =>
                                      setExpandedModules((previous) => ({
                                        ...previous,
                                        [module.code]: !expanded,
                                      }))
                                    }
                                  >
                                    <OrvexaIcon
                                      name="chevron-down"
                                      className={expanded ? 'is-expanded' : ''}
                                    />

                                    <strong>{module.label}</strong>

                                    <span className="zrv-roles-permission-count">
                                      {module.count} Permissions
                                    </span>

                                    <OrvexaIcon
                                      name="chevron-down"
                                      className={`zrv-roles-toggle-end${
                                        expanded ? ' is-expanded' : ''
                                      }`}
                                    />
                                  </button>

                                  {expanded && (
                                    <HorizontalTableScroll className="zrv-security-table-scroll zrv-roles-permission-table-wrap">
                                      <table className="zrv-roles-permission-table zrv-security-table">
                                        <thead>
                                          <tr>
                                            <th scope="col">Resource</th>

                                            {module.actionCodes.map((code) => (
                                              <th scope="col" key={code}>
                                                {humanize(code)}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>

                                        <tbody>
                                          {module.rows.map((row) => (
                                            <tr key={row.code}>
                                              <th scope="row">{row.label}</th>

                                              {module.actionCodes.map((code) => (
                                                <td key={code}>
                                                  {row.actions.has(code) ? (
                                                    <OrvexaIcon
                                                      name="check-square"
                                                      className="zrv-roles-granted"
                                                    />
                                                  ) : (
                                                    <span aria-label="Not granted">—</span>
                                                  )}
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </HorizontalTableScroll>
                                  )}
                                </section>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="zrv-admin-state">No permissions match your search.</p>
                        )
                      }}
                    </ResourceState>
                  </section>
                )}
              </>
            )}
          </Panel>
        </div>

        {/* EXISTING CREATE ROLE DIALOG */}

        {dialog?.type === 'create' && (
          <RoleFormDialog
            action={action}
            onClose={close}
            onSaved={(outcome) =>
              finish(outcome, {
                select: outcome.value?.roleId,
              })
            }
          />
        )}

        {/* EXISTING EDIT ROLE DIALOG */}

        {dialog?.type === 'edit' && selected && (
          <RoleFormDialog role={selected} action={action} onClose={close} onSaved={finish} />
        )}

        {/* EXISTING ACTIVATE CONFIRMATION */}

        {dialog?.type === 'activate' && selected && (
          <ConfirmDialog
            title={`Activate role ${selected.roleCode}?`}
            confirmLabel="Activate"
            pending={action.pending}
            feedback={action.feedback}
            onClose={close}
            description="Accounts assigned to this role regain its permissions immediately."
            onConfirm={async () =>
              finish(
                await action.run(() => securityAdminService.activateRole(selected.roleId), {
                  success: `Role ${selected.roleCode} activated.`,
                  refreshAccess: true,
                }),
              )
            }
          />
        )}

        {/* EXISTING DEACTIVATE CONFIRMATION */}

        {dialog?.type === 'deactivate' && selected && (
          <ConfirmDialog
            danger
            title={`Deactivate role ${selected.roleCode}?`}
            confirmLabel="Deactivate"
            pending={action.pending}
            feedback={action.feedback}
            onClose={close}
            description="Accounts assigned to this role lose its permissions immediately. Assignments and grants are kept and apply again if the role is reactivated."
            onConfirm={async () =>
              finish(
                await action.run(() => securityAdminService.deactivateRole(selected.roleId), {
                  success: `Role ${selected.roleCode} deactivated.`,
                  refreshAccess: true,
                }),
              )
            }
          />
        )}
      </AdminPage>
    </div>
  )
}
