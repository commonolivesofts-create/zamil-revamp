
import { useMemo, useState } from 'react'
import '@/styles/security-permission-catalog.css'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import HorizontalTableScroll from '@/components/ui/HorizontalTableScroll.jsx'
import usePermissions from '@/features/access/usePermissions.js'

import { fieldProps } from '../adminForms.js'
import { filterCatalog, flattenCatalog } from '../adminModel.js'

import {
  catalogMayBeIncomplete,
  defaultActionDescription,
  existingActions,
  isCodeOwnedResource,
} from '../catalogActions.js'

import {
  SECURITY_ACTIONS,
  SECURITY_MODULE_CODE,
} from '../securityActions.js'

import { securityAdminService } from '../securityAdminService.js'
import { useAdminAction, useResource } from '../useAdminData.js'

import {
  ActiveBadge,
  AdminPage,
  ConfirmDialog,
  Feedback,
  ResourceState,
} from '../components/AdminUi.jsx'

import CatalogFormDialog from '../components/CatalogFormDialog.jsx'

const ENTITY_LABELS = Object.freeze({
  module: 'module',
  resource: 'resource',
  permission: 'action',
})

const SUMMARY_CARDS = [
  {
    id: 'permissions',
    title: 'Total Permissions',
    icon: 'key-round',
    color: 'green',
  },
  {
    id: 'modules',
    title: 'Total Modules',
    icon: 'boxes',
    color: 'green',
  },
  {
    id: 'active',
    title: 'Active Permissions',
    icon: 'shield-check',
    color: 'green',
  },
  {
    id: 'inactive',
    title: 'Inactive Permissions',
    icon: 'shield-alert',
    color: 'amber',
  },
]

function CatalogSummaryCard({
  title,
  icon,
  value,
  color = 'green',
}) {
  return (
    <article
      className={`zrv-pc-stat zrv-pc-stat--${color}`}
    >
      <div className="zrv-pc-stat__icon">
        <OrvexaIcon name={icon} />
      </div>

      <div className="zrv-pc-stat__body">
        <span className="zrv-pc-stat__title">
          {title}
        </span>

        <strong className="zrv-pc-stat__number">
          {value}
        </strong>
      </div>

      <svg
        className="zrv-pc-stat__wave"
        viewBox="0 0 180 54"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M0 48 L35 45 L65 40 L98 43 L128 25 L150 32 L180 10 L180 54 L0 54 Z"
          fill="currentColor"
        />
      </svg>
    </article>
  )
}

function getCatalogStatistics(data) {
  if (!Array.isArray(data)) {
    return null
  }

  const permissions = flattenCatalog(data)

  // This counts the permission's own active state.
  // A separate inactive module or resource can still
  // prevent an active permission from being grantable.
  const active = data.reduce(
    (count, module) =>
      count +
      module.resources.reduce(
        (resourceCount, resource) =>
          resourceCount +
          resource.permissions.filter(
            (permission) => permission.isActive
          ).length,
        0
      ),
    0
  )

  return {
    permissions: permissions.length,
    modules: data.length,
    active,
    inactive: permissions.length - active,
  }
}

export default function PermissionCatalogPage() {
  const { can } = usePermissions()

  const manage = can(SECURITY_ACTIONS.PERMISSION_CATALOG_MANAGE)

  const catalog = useResource(
    'catalog',
    (signal) =>
      securityAdminService.getCatalog({ signal })
  )

  const action = useAdminAction()

  // Existing search and inactive filtering.
  const [search, setSearch] = useState('')
  const [includeInactive, setIncludeInactive] =
    useState(true)

  // New presentation-only controls.
  const [statusFilter, setStatusFilter] =
    useState('all')

  const [expandedModules, setExpandedModules] =
    useState({})

  const [expandedResources, setExpandedResources] =
    useState({})

  const [dialog, setDialog] = useState(null)

  const statistics = useMemo(
    () => getCatalogStatistics(catalog.data),
    [catalog.data]
  )

  const modules = useMemo(() => {
    if (!Array.isArray(catalog.data)) {
      return []
    }

    const filtered = filterCatalog(catalog.data, {
      search,
      includeInactive,
    })

    if (statusFilter === 'all') {
      return filtered
    }

    const desired = statusFilter === 'active'

    return filtered.filter(
      (module) => module.isActive === desired
    )
  }, [
    catalog.data,
    search,
    includeInactive,
    statusFilter,
  ])

  const incomplete = Array.isArray(catalog.data)
    ? catalogMayBeIncomplete(catalog.data)
    : false

  const open = (next) => {
    action.setFeedback(null)
    setDialog(next)
  }

  const close = () => setDialog(null)

  const finish = (outcome) => {
    if (outcome.status === 'ignored') {
      return
    }

    if (outcome.status === 'success') {
      close()
    }

    catalog.reload()
  }

  const toggle = (entity, item, moduleCode) => {
    // Preserve backend security protections.
    if (
      !manage ||
      moduleCode === SECURITY_MODULE_CODE
    ) {
      return null
    }

    return (
      <button
        type="button"
        className={`zrv-pc-text-action ${
          item.isActive
            ? 'zrv-pc-text-action--danger'
            : 'zrv-pc-text-action--success'
        }`}
        onClick={() =>
          open({
            type: 'toggle',
            entity,
            item,
          })
        }
      >
        {item.isActive
          ? 'Deactivate'
          : 'Activate'}

        <span className="sr-only">
          {' '}
          {item.label}
        </span>
      </button>
    )
  }

  const toggleModuleExpanded = (moduleId) => {
    setExpandedModules((previous) => ({
      ...previous,
      [moduleId]:
        previous[moduleId] === undefined
          ? false
          : !previous[moduleId],
    }))
  }

  const toggleResourceExpanded = (resourceId) => {
    setExpandedResources((previous) => ({
      ...previous,
      [resourceId]:
        previous[resourceId] === undefined
          ? false
          : !previous[resourceId],
    }))
  }

  return (
    <div className="zrv-permission-catalog-page">
      <AdminPage
        eyebrow="Security Administration"
        title="Permission catalog"
        description="Every module, resource and action that permissions are made of. Roles and overrides grant these permissions."
        actions={
          manage && (
            <button
              type="button"
              className="btn-primary zrv-pc-add-module"
              onClick={() =>
                open({
                  type: 'create',
                  kind: 'module',
                })
              }
            >
              <OrvexaIcon name="plus" />
              Add Module
            </button>
          )
        }
      >
        {!dialog && (
          <Feedback
            feedback={action.feedback}
            onDismiss={() =>
              action.setFeedback(null)
            }
          />
        )}

        {/* FOUR SUMMARY CARDS */}

        <section
          className="zrv-pc-summary"
          aria-label="Permission catalog statistics"
        >
          {SUMMARY_CARDS.map((card) => (
            <CatalogSummaryCard
              key={card.id}
              title={card.title}
              icon={card.icon}
              color={card.color}
              value={
                statistics
                  ? statistics[card.id]
                  : '—'
              }
            />
          ))}
        </section>

        {/* CATALOG CONTENT */}

        <section className="zrv-pc-panel">
          <div className="zrv-pc-panel__head">
            <div className="zrv-pc-panel__heading">
              <OrvexaIcon name="shield-check" />

              <h2>
                Permission Catalog
              </h2>
            </div>

            <span className="zrv-pc-module-count">
              {statistics
                ? `${statistics.modules} Modules`
                : 'Loading...'}
            </span>
          </div>

          {/* SEARCH AND FILTER TOOLBAR */}

          <div
            className="zrv-pc-toolbar"
            role="search"
            aria-label="Filter the catalog"
          >
            <label
              className="zrv-pc-search"
              htmlFor="catalog-search"
            >
              <OrvexaIcon name="search" />

              <input
                {...fieldProps('catalog-search', {
                  hint: true,
                })}
                id="catalog-search"
                type="search"
                value={search}
                maxLength={100}
                placeholder="Search module, resource or action..."
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </label>

            <label className="zrv-pc-status-filter">
              <OrvexaIcon name="filter" />

              <span className="sr-only">
                Module status
              </span>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value)
                }
              >
                <option value="all">
                  All Module Statuses
                </option>

                <option value="active">
                  Active Modules
                </option>

                <option value="inactive">
                  Inactive Modules
                </option>
              </select>
            </label>

            <label className="zrv-pc-inactive-check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) =>
                  setIncludeInactive(
                    event.target.checked
                  )
                }
              />

              Include inactive entries
            </label>
          </div>

          {/* LIVE CATALOG */}

          <ResourceState
            resource={catalog}
            label="permission catalog"
            empty="The permission catalog is empty."
          >
          {() => (
              <>
                <div className="zrv-pc-results-info">
                  <span>
                    {statistics?.permissions ?? 0}{' '}
                    permissions in{' '}
                    {statistics?.modules ?? 0} modules
                  </span>

                  {(search ||
                    statusFilter !== 'all' ||
                    !includeInactive) && (
                    <span>
                      {modules.length} matching modules
                    </span>
                  )}
                </div>

                {incomplete && (
                  <p
                    className="zrv-admin-state"
                    role="alert"
                  >
                    The catalogue reached the server's
                    display limit, so some entries may
                    not be shown. Adding actions is
                    unavailable until the complete
                    catalogue can be loaded.
                  </p>
                )}

                {!modules.length && (
                  <div className="zrv-pc-empty">
                    <OrvexaIcon name="search-x" />

                    <p>
                      No catalog entry matches your
                      search or filters.
                    </p>
                  </div>
                )}

                <div className="zrv-pc-modules">
                  {modules.map((module) => {
                    const moduleLabel =
                      module.moduleName ||
                      module.moduleCode

                    const isExpanded =
                      expandedModules[
                        module.moduleId
                      ] ?? true

                    const protectedModule =
                      module.moduleCode ===
                      SECURITY_MODULE_CODE

                    return (
                      <section
                        key={module.moduleId}
                        className="zrv-pc-module"
                        aria-label={`${moduleLabel} (${module.moduleCode})`}
                      >
                        {/* MODULE HEADER */}

                        <div className="zrv-pc-module__head">
                          <button
                            type="button"
                            className="zrv-pc-module__toggle"
                            aria-expanded={
                              isExpanded
                            }
                            onClick={() =>
                              toggleModuleExpanded(
                                module.moduleId
                              )
                            }
                          >
                            <OrvexaIcon
                              name={
                                isExpanded
                                  ? 'chevron-down'
                                  : 'chevron-right'
                              }
                            />

                            <span className="zrv-pc-module__icon">
                              <OrvexaIcon name="boxes" />
                            </span>

                            <span className="zrv-pc-module__title">
                              <strong>
                                {moduleLabel}
                              </strong>

                              <code>
                                {module.moduleCode}
                              </code>
                            </span>
                          </button>

                          <ActiveBadge
                            active={module.isActive}
                          />

                          <span className="zrv-pc-module__count">
                            {module.resources.length}{' '}
                            Resources
                          </span>

                          <div className="zrv-pc-actions">
                            {manage && (
                              <button
                                type="button"
                                className="zrv-pc-text-action"
                                onClick={() =>
                                  open({
                                    type: 'create',
                                    kind: 'resource',
                                    parent: {
                                      id: module.moduleId,
                                      label:
                                        module.moduleCode,
                                    },
                                  })
                                }
                              >
                                <OrvexaIcon
                                  name="plus"
                                />
                                Add Resource
                              </button>
                            )}

                            {toggle(
                              'module',
                              {
                                id: module.moduleId,
                                isActive:
                                  module.isActive,
                                label:
                                  module.moduleCode,
                              },
                              module.moduleCode
                            )}
                          </div>
                        </div>

                        {/* MODULE CONTENT */}

                        {isExpanded && (
                          <div className="zrv-pc-module__body">
                            {protectedModule &&
                              manage && (
                              <p className="zrv-pc-protected">
                                <OrvexaIcon
                                  name="shield-alert"
                                />

                                Security administration
                                entries are protected and
                                cannot be activated or
                                deactivated.
                              </p>
                            )}

                            {!module.resources.length && (
                              <p className="zrv-pc-empty-resource">
                                No resources available.
                              </p>
                            )}

                            <div className="zrv-pc-resources">
                              {module.resources.map(
                                (resource) => {
                                  const resourceLabel =
                                    resource.resourceName ||
                                    resource.resourceCode

                                  const resourceExpanded =
                                    expandedResources[
                                      resource.resourceId
                                    ] ?? true

                                  return (
                                    <section
                                      className="zrv-pc-resource"
                                      key={
                                        resource.resourceId
                                      }
                                    >
                                      {/* RESOURCE HEADER */}

                                      <div className="zrv-pc-resource__head">
                                        <button
                                          type="button"
                                          className="zrv-pc-resource__toggle"
                                          aria-expanded={
                                            resourceExpanded
                                          }
                                          onClick={() =>
                                            toggleResourceExpanded(
                                              resource.resourceId
                                            )
                                          }
                                        >
                                          <OrvexaIcon
                                            name={
                                              resourceExpanded
                                                ? 'chevron-down'
                                                : 'chevron-right'
                                            }
                                          />

                                          <span>
                                            <strong>
                                              {resourceLabel}
                                            </strong>

                                            <code>
                                              {resource.resourceCode}
                                            </code>
                                          </span>
                                        </button>

                                        <ActiveBadge
                                          active={
                                            resource.isActive
                                          }
                                        />

                                        <div className="zrv-pc-actions">
                                          {manage && (
                                            <button
                                              type="button"
                                              className="zrv-pc-text-action"
                                              onClick={() =>
                                                open({
                                                  type: 'create',
                                                  kind: 'permission',
                                                  parent: {
                                                    id: resource.resourceId,
                                                    label:
                                                      `${module.moduleCode}.${resource.resourceCode}`,
                                                    resourceName:
                                                      resourceLabel,
                                                    existing: existingActions(resource),
                                                    codeOwned: isCodeOwnedResource(module.moduleCode, resource.resourceCode),
                                                    catalogIncomplete:
                                                      incomplete,
                                                    exampleDescription:
                                                      defaultActionDescription(
                                                        'VIEW',
                                                        resourceLabel
                                                      ),
                                                  },
                                                })
                                              }
                                            >
                                              <OrvexaIcon
                                                name="plus"
                                              />
                                              Add Actions
                                            </button>
                                          )}

                                          {toggle(
                                            'resource',
                                            {
                                              id: resource.resourceId,
                                              isActive:
                                                resource.isActive,
                                              label:
                                                `${module.moduleCode}.${resource.resourceCode}`,
                                            },
                                            module.moduleCode
                                          )}
                                        </div>
                                      </div>

                                      {/* RESOURCE PERMISSIONS */}

                                      {resourceExpanded &&
                                        resource.permissions.length >
                                          0 && (
                                          <HorizontalTableScroll className="zrv-security-table-scroll zrv-pc-table-wrap">
                                            <table className="zrv-pc-table zrv-security-table">
                                              <thead>
                                                <tr>
                                                  <th scope="col">
                                                    Action
                                                  </th>

                                                  <th scope="col">
                                                    Description
                                                  </th>

                                                  <th scope="col">
                                                    Status
                                                  </th>

                                                  <th scope="col">
                                                    Manage
                                                  </th>
                                                </tr>
                                              </thead>

                                              <tbody>
                                                {resource.permissions.map(
                                                  (
                                                    permission
                                                  ) => (
                                                    <tr
                                                      key={
                                                        permission.permissionId
                                                      }
                                                      className={
                                                        !permission.isActive
                                                          ? 'is-inactive'
                                                          : ''
                                                      }
                                                    >
                                                      <td>
                                                        <code className="zrv-pc-action-code">
                                                          {permission.actionCode}
                                                        </code>
                                                      </td>

                                                      <td>
                                                        {permission.description ||
                                                          '—'}
                                                      </td>

                                                      <td>
                                                        <ActiveBadge
                                                          active={
                                                            permission.isActive
                                                          }
                                                        />
                                                      </td>

                                                      <td>
                                                        {toggle(
                                                          'permission',
                                                          {
                                                            id: permission.permissionId,
                                                            isActive:
                                                              permission.isActive,
                                                            label:
                                                              `${module.moduleCode}.${resource.resourceCode}:${permission.actionCode}`,
                                                          },
                                                          module.moduleCode
                                                        )}
                                                      </td>
                                                    </tr>
                                                  )
                                                )}
                                              </tbody>
                                            </table>
                                          </HorizontalTableScroll>
                                        )}
                                    </section>
                                  )
                                }
                              )}
                            </div>
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              </>
            )}
          </ResourceState>
        </section>

        {/* EXISTING CREATE DIALOG */}

        {dialog?.type === 'create' && (
          <CatalogFormDialog
            kind={dialog.kind}
            parent={dialog.parent}
            action={action}
            onClose={close}
            onSaved={finish}
          />
        )}

        {/* EXISTING ACTIVATE / DEACTIVATE DIALOG */}

        {dialog?.type === 'toggle' && (
          <ConfirmDialog
            danger={dialog.item.isActive}
            title={`${
              dialog.item.isActive
                ? 'Deactivate'
                : 'Activate'
            } ${ENTITY_LABELS[dialog.entity]} ${
              dialog.item.label
            }?`}
            confirmLabel={
              dialog.item.isActive
                ? 'Deactivate'
                : 'Activate'
            }
            pending={action.pending}
            feedback={action.feedback}
            onClose={close}
            description={
              dialog.item.isActive
                ? 'Permissions under an inactive entry stop applying immediately for every role and override that grants them.'
                : 'Grants under this entry apply again where the rest of the chain is active.'
            }
            onConfirm={async () =>
              finish(
                await action.run(
                  () =>
                    securityAdminService.setCatalogActive(
                      dialog.entity,
                      dialog.item.id,
                      !dialog.item.isActive
                    ),
                  {
                    success: (result) =>
                      result.changed
                        ? `${
                            dialog.item.label
                          } ${
                            result.isActive
                              ? 'activated'
                              : 'deactivated'
                          }.`
                        : 'Nothing changed; the entry already had that state.',
                    refreshAccess: true,
                  }
                )
              )
            }
          />
        )}
      </AdminPage>
    </div>
  )
}
