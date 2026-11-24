import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import '@/styles/security-role-permissions.css'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import HorizontalTableScroll from '@/components/ui/HorizontalTableScroll.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import GlobalErrorScreen from '@/components/feedback/GlobalErrorScreen.jsx'
import { isGlobalDataLoadFailure } from '@/services/api/apiClient.js'

import { formatInstant } from '../adminFeedback.js'
import { isRecordId, permissionLabel } from '../adminModel.js'
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

import RoleGrantDialog from '../components/RoleGrantDialog.jsx'
import { dialogForRole } from '../roleGrants.js'

const ROLE_PAGE_SIZE = 100

const readable = (value) =>
  String(value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

function StatCard({ title, value, subtitle, icon, amber = false }) {
  return (
    <article className={`zrv-rp-stat${amber ? ' is-amber' : ''}`}>
      <div className="zrv-rp-stat__icon">
        <OrvexaIcon name={icon} />
      </div>

      <div className="zrv-rp-stat__content">
        <span className="zrv-rp-stat__title">{title}</span>

        <strong className="zrv-rp-stat__value">{value}</strong>

        <small className="zrv-rp-stat__subtitle">{subtitle}</small>
      </div>

      <svg
        className="zrv-rp-stat__wave"
        viewBox="0 0 180 54"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 48 L35 45 L65 40 L98 43 L128 25 L150 32 L180 10 L180 54 L0 54 Z"
          fill="currentColor"
        />
      </svg>
    </article>
  )
}

// Organize actual grants returned by the existing API.
// No permission codes or records are hardcoded.
function groupGrants(data, search, showRevoked) {
  const modules = new Map()
  const term = search.trim().toLowerCase()

  for (const grant of data ?? []) {
    if (!showRevoked && !grant.isActive) continue

    const moduleCode = grant.moduleCode || 'OTHER'
    const moduleLabel = readable(moduleCode)

    const matches =
      !term ||
      [moduleCode, moduleLabel, grant.resourceCode, grant.actionCode, permissionLabel(grant)].some(
        (value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(term),
      )

    if (!matches) continue

    if (!modules.has(moduleCode)) {
      modules.set(moduleCode, {
        code: moduleCode,
        label: moduleLabel,
        grants: [],
      })
    }

    modules.get(moduleCode).grants.push(grant)
  }

  return [...modules.values()]
    .map((module) => ({
      ...module,
      grants: module.grants.sort((a, b) => {
        const left = `${a.resourceCode}:${a.actionCode}`
        const right = `${b.resourceCode}:${b.actionCode}`
        return left.localeCompare(right)
      }),
      activeCount: module.grants.filter((grant) => grant.isActive).length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export default function RolePermissionsPage() {
  const { can } = usePermissions()

  const [searchParams, setSearchParams] = useSearchParams()

  const roleParam = searchParams.get('role')
  const roleId = isRecordId(roleParam) ? roleParam : null

  const [page, setPage] = useState(1)
  const [showRevoked, setShowRevoked] = useState(false)
  const [dialogState, setDialog] = useState(null)

  const [roleSearch, setRoleSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [permissionSearch, setPermissionSearch] = useState('')
  const [expandedModules, setExpandedModules] = useState({})

  const roles = useResource(`roles:${page}:${ROLE_PAGE_SIZE}`, (signal) =>
    securityAdminService.listRoles({ page, limit: ROLE_PAGE_SIZE }, { signal }),
  )

  const grants = useResource(roleId ? `role-grants:${roleId}` : null, (signal) =>
    securityAdminService.listRolePermissions(roleId, { signal }),
  )
  const rolesGlobalError =
    roles.status === 'error' &&
    (isGlobalDataLoadFailure(roles.error) || roles.error?.code === 'ABORTED')
  const grantsGlobalError =
    grants.status === 'error' &&
    (isGlobalDataLoadFailure(grants.error) || grants.error?.code === 'ABORTED')
  const pageGlobalError = rolesGlobalError || grantsGlobalError
  const retryFailedData = () => {
    if (rolesGlobalError) roles.reload()
    if (grantsGlobalError) grants.reload()
  }

  const action = useAdminAction()

  const roleItems = useMemo(() => roles.data?.items ?? [], [roles.data?.items])

  const role = roleItems.find((item) => item.roleId === roleId) ?? null

  const roleLabel = role ? role.roleCode : roleId ? `role ${roleId}` : ''

  const canGrant =
    can(SECURITY_ACTIONS.ROLE_PERMISSIONS_GRANT) && can(SECURITY_ACTIONS.PERMISSION_CATALOG_VIEW)

  const canRevoke = can(SECURITY_ACTIONS.ROLE_PERMISSIONS_REVOKE)

  const dialog = dialogForRole(dialogState, roleId)

  const grantBlocked = !role
    ? 'Select the role from the role list to grant permissions'
    : !role.isActive
      ? 'Inactive roles cannot receive permissions'
      : null

  const visibleRoles = useMemo(() => {
    const term = roleSearch.trim().toLowerCase()

    return roleItems.filter((item) => {
      const matchesSearch =
        !term ||
        [item.roleName, item.roleCode].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(term),
        )

      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? item.isActive : !item.isActive)

      return matchesSearch && matchesStatus
    })
  }, [roleItems, roleSearch, statusFilter])

  const selectedGrants = grants.status === 'ready' ? grants.data : null

  const activeGrants = selectedGrants ? selectedGrants.filter((grant) => grant.isActive) : []

  const selectedModules = new Set(activeGrants.map((grant) => grant.moduleCode))

  const groupedPermissions = useMemo(
    () => groupGrants(selectedGrants, permissionSearch, showRevoked),
    [selectedGrants, permissionSearch, showRevoked],
  )

  const select = (id) => {
    action.setFeedback(null)
    setPermissionSearch('')
    setExpandedModules({})
    setShowRevoked(false)
    setSearchParams(id ? { role: id } : {})
  }

  const open = (next) => {
    action.setFeedback(null)
    setDialog({ ...next, roleId })
  }

  const close = () => setDialog(null)

  const finish = (outcome) => {
    if (outcome.status === 'ignored') return

    if (outcome.status === 'success') {
      close()
    }

    grants.reload()
  }

  const openGrant = () => {
    if (grantBlocked) return

    // Preserve the existing fresh-grants verification.
    grants.reload()
    open({ type: 'grant' })
  }

  const grantsFinished = () => {
    close()
    grants.reload()
  }

  return (
    <div className="zrv-role-permissions-page">
      <AdminPage
        eyebrow="Security Administration / Role Permissions"
        title="Role Permissions"
        description="Choose a role to review, grant or revoke its permissions."
      >
        {!dialog && (
          <Feedback feedback={action.feedback} onDismiss={() => action.setFeedback(null)} />
        )}

        {pageGlobalError ? (
          <div className="zrv-rp-error-state">
            <div className="zrv-global-error-slot zrv-global-error-slot--card">
              <GlobalErrorScreen inline onRetry={retryFailedData} retryAll={false} />
            </div>
          </div>
        ) : (
          <>
        {/* SUMMARY CARDS */}

        <section className="zrv-rp-stats" aria-label="Role permission overview">
          <StatCard
            title="Total Roles"
            icon="users-round"
            value={roles.status === 'ready' ? roles.data.pagination.total : '—'}
            subtitle="All registered roles"
          />

          <StatCard
            title="Active Roles"
            icon="circle-check"
            value={
              roles.status === 'ready' ? roleItems.filter((item) => item.isActive).length : '—'
            }
            subtitle="On the current page"
          />

          <StatCard
            title="Granted Permissions"
            icon="key-round"
            value={selectedGrants ? activeGrants.length : '—'}
            subtitle="For selected role"
          />

          <StatCard
            title="Permission Modules"
            icon="layout-grid"
            value={selectedGrants ? selectedModules.size : '—'}
            subtitle="For selected role"
          />
        </section>

        {/* MAIN TWO-COLUMN LAYOUT */}

        <div className="zrv-admin-split zrv-rp-layout">
          {/* LEFT PANEL */}

          <Panel title="All Roles" className="zrv-rp-roles-panel">
            <div className="zrv-rp-filters">
              <label className="zrv-rp-search">
                <OrvexaIcon name="search" />

                <span className="sr-only">Search roles</span>

                <input
                  type="search"
                  placeholder="Search roles..."
                  value={roleSearch}
                  onChange={(event) => setRoleSearch(event.target.value)}
                />
              </label>

              <label className="zrv-rp-filter">
                <OrvexaIcon name="filter" />

                <span className="sr-only">Filter roles by status</span>

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
                  <div className="zrv-rp-role-list">
                    {visibleRoles.length === 0 && (
                      <p className="zrv-admin-state">No roles match your search on this page.</p>
                    )}

                    {visibleRoles.map((item) => (
                      <button
                        type="button"
                        key={item.roleId}
                        className={`zrv-rp-role${item.roleId === roleId ? ' is-selected' : ''}`}
                        aria-pressed={item.roleId === roleId}
                        onClick={() => select(item.roleId)}
                      >
                        <span className="zrv-rp-role__copy">
                          <strong>{item.roleName || item.roleCode}</strong>

                          <small>{item.roleCode}</small>
                        </span>

                        <ActiveBadge active={item.isActive} />

                        <OrvexaIcon name="chevron-right" />
                      </button>
                    ))}
                  </div>

                  <div className="zrv-rp-role-footer">
                    <span>{visibleRoles.length} shown on this page</span>

                    <Pagination
                      pagination={pagination}
                      onPage={setPage}
                      disabled={roles.refreshing}
                      label="Role pages"
                    />
                  </div>
                </>
              )}
            </ResourceState>
          </Panel>

          {/* RIGHT PANEL */}

          <Panel
            title="Permissions"
            className="zrv-rp-permissions-panel"
            actions={
              roleId &&
              canGrant && (
                <button
                  type="button"
                  className="btn-primary zrv-rp-grant"
                  onClick={openGrant}
                  disabled={Boolean(grantBlocked)}
                  title={grantBlocked ?? undefined}
                >
                  <OrvexaIcon name="plus" />
                  Grant Permissions
                </button>
              )
            }
          >
            {!roleId ? (
              <div className="zrv-rp-empty">
                <span className="zrv-rp-empty__icon">
                  <OrvexaIcon name="shield-check" />
                </span>

                <h3>Select a role</h3>

                <p>Select a role from the left panel to review and manage its permissions.</p>
              </div>
            ) : (
              <>
                {/* SELECTED ROLE */}

                <div className="zrv-rp-selected">
                  <div>
                    <span className="zrv-rp-selected__label">Selected Role</span>

                    <h3>{role?.roleName || roleLabel}</h3>

                    <small>{roleLabel}</small>
                  </div>

                  {role && <ActiveBadge active={role.isActive} />}
                </div>

                {role && !role.isActive && (
                  <p className="zrv-admin-note" role="note">
                    This role is inactive: its permissions do not apply, and no permission can be
                    granted to it.
                  </p>
                )}

                {/* PERMISSION SEARCH AND FILTERS */}

                <div className="zrv-rp-permission-toolbar">
                  <label className="zrv-rp-search">
                    <OrvexaIcon name="search" />

                    <span className="sr-only">Search permissions</span>

                    <input
                      type="search"
                      value={permissionSearch}
                      placeholder="Search permissions..."
                      onChange={(event) => setPermissionSearch(event.target.value)}
                    />
                  </label>

                  <label className="zrv-rp-show-revoked">
                    <input
                      type="checkbox"
                      checked={showRevoked}
                      onChange={(event) => setShowRevoked(event.target.checked)}
                    />
                    Show revoked grants
                  </label>
                </div>

                {/* MODULE-WISE PERMISSIONS */}

                <ResourceState
                  resource={grants}
                  label="role permissions"
                  empty={
                    showRevoked ? 'This role has no grants.' : 'This role holds no permissions.'
                  }
                  isEmpty={(data) => !data.some((item) => showRevoked || item.isActive)}
                >
                  {() =>
                    groupedPermissions.length ? (
                      <div className="zrv-rp-module-list">
                        {groupedPermissions.map((module, index) => {
                          const expanded = expandedModules[module.code] ?? index === 0

                          return (
                            <section className="zrv-rp-module" key={module.code}>
                              <button
                                type="button"
                                className="zrv-rp-module__header"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedModules((previous) => ({
                                    ...previous,
                                    [module.code]: !expanded,
                                  }))
                                }
                              >
                                <OrvexaIcon name="layers" className="zrv-rp-module__icon" />

                                <strong>{module.label}</strong>

                                <span className="zrv-rp-module__count">
                                  {module.activeCount} Granted
                                </span>

                                <OrvexaIcon
                                  name={expanded ? 'chevron-up' : 'chevron-down'}
                                  className="zrv-rp-module__chevron"
                                />
                              </button>

                              {expanded && (
                                <HorizontalTableScroll className="zrv-security-table-scroll zrv-rp-table-wrap">
                                  <table className="zrv-rp-table zrv-security-table">
                                    <caption className="sr-only">
                                      Permissions for {module.label}
                                    </caption>

                                    <thead>
                                      <tr>
                                        <th scope="col">Resource</th>
                                        <th scope="col">Action</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Updated</th>
                                        <th scope="col">
                                          <span className="sr-only">Manage</span>
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {module.grants.map((grant) => (
                                        <tr key={grant.permissionId}>
                                          <td>
                                            <strong>{readable(grant.resourceCode)}</strong>

                                            <small>{grant.resourceCode}</small>
                                          </td>

                                          <td>
                                            <span className="zrv-rp-action-label">
                                              {readable(grant.actionCode)}
                                            </span>
                                          </td>

                                          <td>
                                            <ActiveBadge
                                              active={grant.isActive}
                                              activeLabel="Granted"
                                              inactiveLabel="Revoked"
                                            />
                                          </td>

                                          <td>
                                            {formatInstant(grant.updatedAt || grant.createdAt)}
                                          </td>

                                          <td>
                                            {canRevoke && grant.isActive && (
                                              <button
                                                type="button"
                                                className="zrv-rp-revoke"
                                                onClick={() =>
                                                  open({
                                                    type: 'revoke',
                                                    grant,
                                                  })
                                                }
                                              >
                                                Revoke
                                                <span className="sr-only">
                                                  {' '}
                                                  {permissionLabel(grant)}
                                                </span>
                                              </button>
                                            )}
                                          </td>
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
                  }
                </ResourceState>
              </>
            )}
          </Panel>
        </div>
          </>
        )}

        {/* EXISTING GRANT DIALOG */}

        {dialog?.type === 'grant' && role?.isActive && (
          <RoleGrantDialog
            roleId={dialog.roleId}
            roleLabel={roleLabel}
            grants={grants}
            action={action}
            onClose={close}
            onFinished={grantsFinished}
          />
        )}

        {/* EXISTING REVOKE CONFIRMATION */}

        {dialog?.type === 'revoke' && (
          <ConfirmDialog
            danger
            title="Revoke this permission?"
            confirmLabel="Revoke"
            pending={action.pending}
            feedback={action.feedback}
            onClose={close}
            description={`${permissionLabel(dialog.grant)} is removed from ${roleLabel}. Accounts that hold it only through this role lose it immediately.`}
            onConfirm={async () =>
              finish(
                await action.run(
                  () =>
                    securityAdminService.revokeRolePermission(
                      dialog.roleId,
                      dialog.grant.permissionId,
                    ),
                  {
                    success: (result) =>
                      result.changed
                        ? `${permissionLabel(dialog.grant)} revoked from ${roleLabel}.`
                        : 'The permission was already revoked; nothing changed.',
                    refreshAccess: true,
                  },
                ),
              )
            }
          />
        )}
      </AdminPage>
    </div>
  )
}
