
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import HorizontalTableScroll from '@/components/ui/HorizontalTableScroll.jsx'

import { checkSearch, fieldProps } from '../adminForms.js'

import {
  USER_SORTS,
  displayName,
  readUserFilters,
  userListQuery,
} from '../adminModel.js'

import { formatInstant } from '../adminFeedback.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import '@/styles/report-table.css'

import {
  downloadCsv,
  loadAllRows,
} from '@/features/hr-recruitment/shared/reportExport.js'

import {
  Badge,
  Field,
  Pagination,
  Panel,
  ResourceState,
} from './AdminUi.jsx'

// ======================================================
// SUMMARY QUERIES
// ======================================================

const SUMMARY_QUERIES = Object.freeze([
  {},
  { status: 'ACTIVE' },
  { mfaEnrolled: 'true' },
  { locked: 'true' },
])

// ======================================================
// EXPORT COLUMNS
// ======================================================

const EXPORT_COLUMNS = Object.freeze([
  {
    label: 'Employee',
    value: (u) =>
      displayName(u) || 'Name not recorded',
  },
  {
    label: 'Employee number',
    value: (u) => u.employeeNumber || '',
  },
  {
    label: 'Username',
    value: (u) => u.username || '',
  },
  {
    label: 'Department',
    value: (u) => u.department || '',
  },
  {
    label: 'Job title',
    value: (u) => u.jobTitle || '',
  },
  {
    label: 'Status',
    value: (u) => u.accountStatus || '',
  },
  {
    label: 'Locked',
    value: (u) => (u.locked ? 'Yes' : 'No'),
  },
  {
    label: 'Authenticator',
    value: (u) =>
      u.mfaEnrolled ? 'Enrolled' : 'Not enrolled',
  },
  {
    label: 'Last sign-in',
    value: (u) => formatInstant(u.lastLoginAt),
  },
])

// ======================================================
// SUMMARY CARDS
// ======================================================

const SUMMARY_CARDS = Object.freeze([
  {
    label: 'Total accounts',
    icon: 'users',
    className: 'total',
  },
  {
    label: 'Active accounts',
    icon: 'circle-check',
    className: 'active',
  },
  {
    label: 'Authenticator enrolled',
    icon: 'shield-check',
    className: 'mfa',
  },
  {
    label: 'Locked accounts',
    icon: 'lock-keyhole',
    className: 'locked',
  },
])

const formatCount = (value) =>
  typeof value === 'number'
    ? value.toLocaleString('en-US')
    : '—'

// ======================================================
// PDF EXPORT HELPERS
// ======================================================

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch]
  )

function writePdfView(view, rows) {
  const head = EXPORT_COLUMNS.map(
    (column) =>
      `<th>${escapeHtml(column.label)}</th>`
  ).join('')

  const body = rows
    .map(
      (row) =>
        `<tr>${EXPORT_COLUMNS.map(
          (column) =>
            `<td>${escapeHtml(
              column.value(row)
            )}</td>`
        ).join('')}</tr>`
    )
    .join('')

  view.document.open()

  view.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>User accounts</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 12mm;
    }

    body {
      font: 11px/1.4 system-ui, Arial, sans-serif;
      color: #18231d;
    }

    h1 {
      font-size: 17px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border: 1px solid #ccdcd1;
      padding: 5px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #e8f5ec;
    }

    thead {
      display: table-header-group;
    }

    tr {
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <h1>User accounts</h1>
  <p>${rows.length} filtered accounts</p>
  <table>
    <thead>
      <tr>${head}</tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>
  `)

  view.document.close()
  view.focus()
  view.print()
}

// ======================================================
// MAIN USER DIRECTORY
// ======================================================

export default function UserDirectory({
  rowLink,
  rowAction = 'Open',
  dashboard = false,
  compactReportTable = false,
  provisionAction = null,

  // NEW:
  // Enable horizontal scroll arrows on selected directory pages.
  horizontalScrollControls = false,
}) {
  const [searchParams, setSearchParams] =
    useSearchParams()

  const filters = readUserFilters(searchParams)

  const [searchText, setSearchText] = useState(
    filters.search
  )

  const [searchError, setSearchError] =
    useState(null)

  const [syncedSearch, setSyncedSearch] =
    useState(filters.search)

  const [filtersOpen, setFiltersOpen] =
    useState(false)

  const [refreshKey, setRefreshKey] =
    useState(0)

  const [exporting, setExporting] =
    useState(false)

  const [exportError, setExportError] =
    useState('')

  const [updatedAt, setUpdatedAt] =
    useState(() => new Date())

  // ====================================================
  // KEEP SEARCH STATE SYNCHRONIZED
  // ====================================================

  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    setSearchText(filters.search)
    setSearchError(null)
  }

  const query = userListQuery(filters)

  // ====================================================
  // EXISTING ACCOUNTS RESOURCE
  // ====================================================

  const users = useResource(
    `users:${JSON.stringify(query)}:${
      dashboard ? refreshKey : 0
    }`,
    (signal) =>
      securityAdminService.listUsers(query, {
        signal,
      })
  )

  // ====================================================
  // EXISTING SUMMARY RESOURCE
  // ====================================================

  const summary = useResource(
    dashboard
      ? `users:summary:${refreshKey}`
      : null,

    async (signal) => {
      const result = await Promise.allSettled(
        SUMMARY_QUERIES.map((extra) =>
          securityAdminService.listUsers(
            {
              page: 1,
              limit: 1,
              sortBy: 'employeeNumber',
              sortOrder: 'asc',
              ...extra,
            },
            { signal }
          )
        )
      )

      const totals = result.map((entry) => {
        if (entry.status !== 'fulfilled') {
          return null
        }

        const total = Number(
          entry.value?.pagination?.total
        )

        return Number.isFinite(total)
          ? total
          : null
      })

      if (
        totals.every((value) => value === null)
      ) {
        throw new Error(
          'Unable to load account summary.'
        )
      }

      return totals
    }
  )

  // ====================================================
  // NEW: HORIZONTAL SCROLL MODE
  // ====================================================

  // Keep the accounts dashboard table within its panel; other directories
  // can opt into the horizontal controls when their data requires them.
  const useHorizontalScroll =
    !dashboard && !compactReportTable && horizontalScrollControls

  // ====================================================
  // UPDATE FILTERS
  // ====================================================

  const update = (changes) => {
    const next = {
      ...filters,
      page: 1,
      ...changes,
    }

    const params = new URLSearchParams()

    for (const [name, value] of Object.entries(next)) {
      const defaults = {
        page: 1,
        sortBy: 'employeeNumber',
        sortOrder: 'asc',
      }

      if (
        value !== '' &&
        value !== defaults[name]
      ) {
        params.set(name, String(value))
      }
    }

    setSearchParams(params)
  }

  const sortByColumn = (sortBy) => {
    update({
      sortBy,
      sortOrder:
        filters.sortBy === sortBy && filters.sortOrder === 'asc'
          ? 'desc'
          : 'asc',
    })
  }

  const sortHeader = (sortBy, label) => {
    const active = filters.sortBy === sortBy
    const order = active ? filters.sortOrder : null

    return (
      <th
        scope="col"
        aria-sort={
          order === 'asc'
            ? 'ascending'
            : order === 'desc'
              ? 'descending'
              : 'none'
        }
      >
        <button
          type="button"
          onClick={() => sortByColumn(sortBy)}
          aria-label={`${label}, ${active ? `sorted ${order === 'asc' ? 'ascending' : 'descending'}` : 'not sorted'}; activate to sort ${active && order === 'asc' ? 'descending' : 'ascending'}`}
        >
          <span>{label}</span>
          <OrvexaIcon
            name={
              !active
                ? 'chevrons-up-down'
                : order === 'asc'
                  ? 'chevron-up'
                  : 'chevron-down'
            }
            size={13}
            aria-hidden="true"
          />
        </button>
      </th>
    )
  }

  // ====================================================
  // SEARCH
  // ====================================================

  const submitSearch = (event) => {
    event.preventDefault()

    const { term, error } =
      checkSearch(searchText)

    setSearchError(error)

    if (!error) {
      update({ search: term })
    }
  }

  // ====================================================
  // CSV / PDF EXPORT
  // ====================================================

  const exportList = async (kind) => {
    if (exporting) return

    const pdfView =
      kind === 'pdf'
        ? window.open('', '_blank')
        : null

    if (kind === 'pdf' && !pdfView) {
      setExportError(
        'Allow popups to export the accounts PDF.'
      )
      return
    }

    if (pdfView) {
      pdfView.document.title =
        'Preparing user accounts PDF'

      pdfView.document.body.textContent =
        'Preparing user accounts PDF…'
    }

    setExporting(true)
    setExportError('')

    try {
      const rows = await loadAllRows(
        (params) =>
          securityAdminService.listUsers(params),
        query
      )

      if (kind === 'csv') {
        downloadCsv(
          rows,
          EXPORT_COLUMNS,
          'user_accounts'
        )
      } else {
        writePdfView(pdfView, rows)
      }
    } catch (error) {
      if (pdfView && !pdfView.closed) {
        pdfView.close()
      }

      setExportError(
        error?.message ||
          'Unable to export accounts. Please retry.'
      )
    } finally {
      setExporting(false)
    }
  }

  // ====================================================
  // SEARCH AND FILTER FORM
  // ====================================================

  const filtersForm = (
    <form
      className={`zrv-admin-toolbar ${
        dashboard ? 'zrv-ua-filters' : ''
      }`}
      onSubmit={submitSearch}
      role="search"
      aria-label="Search accounts"
      noValidate
    >
      {/* Search */}

      <Field
        id="users-search"
        label="Search"
        hint={
          dashboard
            ? undefined
            : 'Employee number, username or name'
        }
        error={searchError}
      >
        <input
          {...fieldProps('users-search', {
            hint: !dashboard,
            error: searchError,
          })}
          className="ux-input"
          type="search"
          placeholder={
            dashboard
              ? 'Employee number, username or name'
              : undefined
          }
          value={searchText}
          maxLength={100}
          onChange={(event) =>
            setSearchText(event.target.value)
          }
        />
      </Field>

      {/* Account status */}

      <Field
        id="users-status"
        label="Status"
      >
        <select
          id="users-status"
          className="ux-select"
          value={filters.status}
          onChange={(event) =>
            update({
              status: event.target.value,
            })
          }
        >
          <option value="">
            All statuses
          </option>

          <option value="PENDING">
            Pending
          </option>

          <option value="ACTIVE">
            Active
          </option>

          <option value="DISABLED">
            Disabled
          </option>
        </select>
      </Field>

      {/* Authenticator */}

      <Field
        id="users-mfa"
        label="Authenticator"
      >
        <select
          id="users-mfa"
          className="ux-select"
          value={filters.mfaEnrolled}
          onChange={(event) =>
            update({
              mfaEnrolled: event.target.value,
            })
          }
        >
          <option value="">Any</option>
          <option value="true">Enrolled</option>
          <option value="false">
            Not enrolled
          </option>
        </select>
      </Field>

      {/* Lockout */}

      <Field
        id="users-locked"
        label="Lockout"
      >
        <select
          id="users-locked"
          className="ux-select"
          value={filters.locked}
          onChange={(event) =>
            update({
              locked: event.target.value,
            })
          }
        >
          <option value="">Any</option>
          <option value="true">Locked</option>
          <option value="false">
            Not locked
          </option>
        </select>
      </Field>

      {/* Sort */}

      <Field
        id="users-sort"
        label="Sort by"
      >
        <select
          id="users-sort"
          className="ux-select"
          value={
            `${filters.sortBy}:${filters.sortOrder}`
          }
          onChange={(event) => {
            const [sortBy, sortOrder] =
              event.target.value.split(':')

            update({
              sortBy,
              sortOrder,
            })
          }}
        >
          {Object.entries(USER_SORTS).flatMap(
            ([value, label]) => [
              <option
                key={`${value}:asc`}
                value={`${value}:asc`}
              >
                {label} ↑
              </option>,

              <option
                key={`${value}:desc`}
                value={`${value}:desc`}
              >
                {label} ↓
              </option>,
            ]
          )}
        </select>
      </Field>

      {/* Search button */}

      <div className="zrv-admin-toolbar__submit">
        <button
          type="submit"
          className="btn-primary zrv-ua-white-text"
        >
          Search
        </button>
      </div>
    </form>
  )

  // ====================================================
  // ACCOUNTS TABLE CONTENT
  // ====================================================

  // Keep the actual table separate from its scroll
  // wrapper so the existing rows and functionality
  // are not duplicated.

  const renderAccountsTable = (items) => (
    <table
      className={`zrv-report-table zrv-security-table ${
        dashboard
          ? 'ux-table zrv-admin-table zrv-ua-table'
          : compactReportTable
            ? 'zrv-directory-report-table'
            : 'ux-table zrv-admin-table'
      }`}
      aria-busy={
        users.refreshing || undefined
      }
    >
      <caption className="sr-only">
        Application accounts
      </caption>

      {/* ==================================
          TABLE HEADER
         ================================== */}

      <thead>
        <tr>
          {dashboard ? (
            <>
              <th scope="col">Employee Name</th>

              {sortHeader('employeeNumber', 'Employee Number')}

              <th scope="col">
                Department
              </th>

              <th scope="col">
                Position
              </th>

              {sortHeader('username', 'Username')}

              <th scope="col">
                Status
              </th>

              <th scope="col">
                Authenticator
              </th>

              {sortHeader('lastLoginAt', 'Last sign-in')}
            </>
          ) : (
            <>
              {sortHeader('employeeNumber', 'Employee')}

              {sortHeader('username', 'Username')}

              <th scope="col">
                Department
              </th>

              <th scope="col">
                Status
              </th>

              <th scope="col">
                Authenticator
              </th>

              {sortHeader('lastLoginAt', 'Last sign-in')}
            </>
          )}

          <th scope="col">
            <span
              className={
                dashboard
                  ? ''
                  : 'sr-only'
              }
            >
              Action
            </span>
          </th>
        </tr>
      </thead>

      {/* ==================================
          TABLE BODY
         ================================== */}

      <tbody>
        {!items.length && (
          <tr>
            <td
              colSpan={dashboard ? 9 : 7}
              className="zrv-admin-state"
            >
              No accounts on this page.
              Use Previous to go back.
            </td>
          </tr>
        )}

        {items.map((user) => (
          <tr key={user.userId}>
            {dashboard ? (
              <>
                {/* Employee name */}

                <td className="zrv-ua-employee-name">
                  <b>
                    {displayName(user) ||
                      'Name not recorded'}
                  </b>
                </td>

                {/* Employee number */}

                <td className="zrv-ua-employee-number">
                  {user.employeeNumber || '—'}
                </td>

                {/* Department */}

                <td className="zrv-ua-department">
                  {user.department || '—'}
                </td>

                {/* Position */}

                <td className="zrv-ua-position">
                  {user.jobTitle || '—'}
                </td>

                {/* Username */}

                <td>
                  {user.username || '—'}
                </td>
              </>
            ) : (
              <>
                {/* Employee and number */}

                <td>
                  <b>
                    {displayName(user) ||
                      'Name not recorded'}
                  </b>

                  <small className="zrv-admin-sub">
                    {user.employeeNumber}
                  </small>
                </td>

                {/* Username */}

                <td>
                  {user.username || '—'}
                </td>

                {/* Department and position */}

                <td>
                  {user.department || '—'}

                  <small className="zrv-admin-sub">
                    {user.jobTitle || ''}
                  </small>
                </td>
              </>
            )}

            {/* Account status */}

            <td>
              <Badge>
                {user.accountStatus}
              </Badge>

              {user.locked && (
                <Badge tone="bad">
                  LOCKED
                </Badge>
              )}
            </td>

            {/* Authenticator */}

            <td>
              {user.mfaEnrolled
                ? 'Enrolled'
                : 'Not enrolled'}
            </td>

            {/* Last sign-in */}

            <td>
              {formatInstant(
                user.lastLoginAt
              )}
            </td>

            {/* Existing row action */}

            <td>
              <Link
                className="zrv-admin-link"
                to={rowLink(user)}
              >
                {rowAction}

                <span className="sr-only">
                  {' '}
                  {displayName(user) ||
                    user.employeeNumber}
                </span>
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  // ====================================================
  // RESOURCE STATE + HORIZONTAL SCROLL
  // ====================================================

  const accountsTable = (
    <ResourceState
      resource={users}
      label="accounts"
      empty="No accounts match these filters."
    >
      {({ items, pagination }) => (
        <>
          {/* ==================================
              HORIZONTAL TABLE SCROLL
             ================================== */}

          {useHorizontalScroll ? (
            <HorizontalTableScroll
              className={
                dashboard
                  ? 'zrv-ua-horizontal-scroll'
                  : 'zrv-user-roles-horizontal-scroll'
              } zrv-security-table-scroll
            >
              {renderAccountsTable(items)}
            </HorizontalTableScroll>
          ) : (
            <div className={dashboard ? 'zrv-ua-table-wrap' : compactReportTable ? 'zrv-report-table-wrap' : 'ux-table-wrap'}>
              {renderAccountsTable(items)}
            </div>
          )}

          {/* ==================================
              EXISTING PAGINATION
             ================================== */}

          {dashboard &&
            pagination.totalPages === 1 && (
              <p className="zrv-ua-onepage">
                Page {pagination.page} of{' '}
                {pagination.totalPages} ·{' '}
                {pagination.total} total
              </p>
            )}

          {(!dashboard ||
            pagination.totalPages !== 1) && (
            <Pagination
              pagination={pagination}
              onPage={(page) =>
                update({ page })
              }
              disabled={users.refreshing}
              label="Account pages"
            />
          )}
        </>
      )}
    </ResourceState>
  )

  // ====================================================
  // NORMAL DIRECTORY MODE
  // USER ROLES / PERMISSION OVERRIDES
  // ====================================================

  if (!dashboard) {
    return (
      <Panel>
        {filtersForm}
        {accountsTable}
      </Panel>
    )
  }

  // ====================================================
  // USER MANAGEMENT DASHBOARD MODE
  // ====================================================

  return (
    <>
      {/* ======================================
          PAGE HEADER
         ====================================== */}

      <header className="zrv-ua-header">
        <div className="zrv-ua-heading">
          <div className="zrv-ua-breadcrumb">
            <span className="zrv-ua-dot" />

            SECURITY ADMINISTRATION

            <span className="zrv-ua-slash">
              /
            </span>

            USER MANAGEMENT
          </div>

          <h1>
            User accounts
          </h1>

          <p>
            Manage employee accounts,
            authentication and access.
          </p>
        </div>

        {/* ==================================
            HEADER ACTIONS
           ================================== */}

        <div className="zrv-ua-actions">
          {/* Last updated */}

          <span className="zrv-ua-updated">
            <span className="zrv-ua-dot" />

            Updated{' '}

            {updatedAt.toLocaleTimeString(
              'en-GB',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )}
          </span>

          {/* Filters */}

          <button
            className="zrv-ua-button"
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="zrv-ua-filter-region"
            onClick={() =>
              setFiltersOpen(
                (value) => !value
              )
            }
          >
            <OrvexaIcon
              name="sliders-horizontal"
            />
            Filters
          </button>

          {/* Refresh */}

          <button
            className="zrv-ua-button"
            type="button"
            disabled={users.refreshing}
            onClick={() => {
              setRefreshKey(
                (value) => value + 1
              )

              setUpdatedAt(new Date())
            }}
          >
            <OrvexaIcon
              name="refresh-cw"
            />
            Refresh
          </button>

          {/* CSV export */}

          <button
            className="zrv-ua-button"
            type="button"
            disabled={
              exporting ||
              users.status !== 'ready'
            }
            onClick={() =>
              exportList('csv')
            }
            title="Export all filtered accounts"
          >
            <OrvexaIcon name="download" />
            CSV
          </button>

          {/* PDF export */}

          <button
            className="zrv-ua-button"
            type="button"
            disabled={
              exporting ||
              users.status !== 'ready'
            }
            onClick={() =>
              exportList('pdf')
            }
            title="Open PDF export of filtered accounts"
          >
            <OrvexaIcon name="file-text" />
            PDF
          </button>

          {provisionAction}
        </div>
      </header>

      {/* ======================================
          ACCOUNT SUMMARY CARDS
         ====================================== */}

      <section
        className="zrv-ua-metrics"
        aria-label="Account overview"
      >
        {SUMMARY_CARDS.map(
          (card, index) => {
            const value =
              summary.status === 'ready'
                ? summary.data[index]
                : null

            const total =
              summary.status === 'ready'
                ? summary.data[0]
                : 0

            const percentage =
              index && total
                ? `${(
                    (value / total) *
                    100
                  ).toFixed(1)}%`
                : null

            return (
              <div
                className={`zrv-ua-card zrv-ua-card--${card.className}`}
                key={card.label}
              >
                <span className="zrv-ua-card__icon">
                  <OrvexaIcon
                    name={card.icon}
                  />
                </span>

                <div className="zrv-ua-card__text">
                  <span className="zrv-ua-card__label">
                    {card.label}
                  </span>

                  <div className="zrv-ua-card__value">
                    {formatCount(value)}

                    {percentage && (
                      <span className="zrv-ua-card__percent">
                        {percentage}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className="zrv-ua-card__wave"
                  aria-hidden="true"
                />
              </div>
            )
          }
        )}
      </section>

      {/* Summary loading error */}

      {summary.status === 'error' && (
        <p
          className="zrv-ua-notice"
          role="alert"
        >
          Account summary is unavailable.

          <button
            type="button"
            className="zrv-admin-link"
            onClick={summary.reload}
          >
            Retry summary
          </button>
        </p>
      )}

      {/* Export error */}

      {exportError && (
        <div
          className="zrv-ua-notice"
          role="alert"
        >
          {exportError}

          <button
            type="button"
            className="zrv-admin-link"
            onClick={() =>
              setExportError('')
            }
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ======================================
          ACCOUNTS TABLE PANEL
         ====================================== */}

      <Panel
        title="Accounts"
        className="zrv-ua-panel"
      >
        {/* Existing filters */}

        <div
          id="zrv-ua-filter-region"
          hidden={!filtersOpen}
        >
          {filtersForm}
        </div>

        {/* Table with horizontal arrows and
            mouse-wheel scrolling enabled */}

        {accountsTable}
      </Panel>
    </>
  )
}
