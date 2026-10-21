import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { checkSearch, fieldProps } from '../adminForms.js'
import { USER_SORTS, displayName, readUserFilters, userListQuery } from '../adminModel.js'
import { formatInstant } from '../adminFeedback.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import { Badge, Field, Pagination, Panel, ResourceState } from './AdminUi.jsx'

// Application accounts from GET /users (USER_ACCOUNTS:VIEW) with the backend's
// search, filters, sorting and pagination. Filters live in the URL, so the
// browser's back button returns to the same list. `rowLink(user)` is where a
// row leads; `rowAction` labels that link.
export default function UserDirectory({ rowLink, rowAction = 'Open' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readUserFilters(searchParams)
  const [searchText, setSearchText] = useState(filters.search)
  const [searchError, setSearchError] = useState(null)
  const query = userListQuery(filters)
  const users = useResource(`users:${JSON.stringify(query)}`, (signal) => securityAdminService.listUsers(query, { signal }))

  const update = (changes) => {
    const next = { ...filters, page: 1, ...changes }
    const params = new URLSearchParams()
    for (const [name, value] of Object.entries(next)) {
      const defaults = { page: 1, sortBy: 'employeeNumber', sortOrder: 'asc' }
      if (value !== '' && value !== defaults[name]) params.set(name, String(value))
    }
    setSearchParams(params)
  }

  const submitSearch = (event) => {
    event.preventDefault()
    const { term, error } = checkSearch(searchText)
    setSearchError(error)
    if (!error) update({ search: term })
  }

  return (
    <Panel>
      <form className="zrv-admin-toolbar" onSubmit={submitSearch} role="search" aria-label="Search accounts" noValidate>
        <Field id="users-search" label="Search" hint="Employee number, username or name" error={searchError}>
          <input {...fieldProps('users-search', { hint: true, error: searchError })} className="ux-input" type="search" value={searchText} maxLength={100} onChange={(event) => setSearchText(event.target.value)} />
        </Field>
        <Field id="users-status" label="Status">
          <select id="users-status" className="ux-select" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </Field>
        <Field id="users-mfa" label="Authenticator">
          <select id="users-mfa" className="ux-select" value={filters.mfaEnrolled} onChange={(event) => update({ mfaEnrolled: event.target.value })}>
            <option value="">Any</option>
            <option value="true">Enrolled</option>
            <option value="false">Not enrolled</option>
          </select>
        </Field>
        <Field id="users-locked" label="Lockout">
          <select id="users-locked" className="ux-select" value={filters.locked} onChange={(event) => update({ locked: event.target.value })}>
            <option value="">Any</option>
            <option value="true">Locked</option>
            <option value="false">Not locked</option>
          </select>
        </Field>
        <Field id="users-sort" label="Sort by">
          <select id="users-sort" className="ux-select" value={`${filters.sortBy}:${filters.sortOrder}`} onChange={(event) => { const [sortBy, sortOrder] = event.target.value.split(':'); update({ sortBy, sortOrder }) }}>
            {Object.entries(USER_SORTS).flatMap(([value, label]) => [
              <option key={`${value}:asc`} value={`${value}:asc`}>{label} ↑</option>,
              <option key={`${value}:desc`} value={`${value}:desc`}>{label} ↓</option>,
            ])}
          </select>
        </Field>
        <div className="zrv-admin-toolbar__submit">
          <button type="submit" className="btn-primary">Search</button>
        </div>
      </form>

      <ResourceState resource={users} label="accounts" empty="No accounts match these filters." isEmpty={(data) => data.items.length === 0}>
        {({ items, pagination }) => (
          <>
            <div className="ux-table-wrap">
              <table className="ux-table zrv-admin-table" aria-busy={users.refreshing || undefined}>
                <caption className="sr-only">Application accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Username</th>
                    <th scope="col">Department</th>
                    <th scope="col">Status</th>
                    <th scope="col">Authenticator</th>
                    <th scope="col">Last sign-in</th>
                    <th scope="col"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => (
                    <tr key={user.userId}>
                      <td><b>{displayName(user) || 'Name not recorded'}</b><small className="zrv-admin-sub">{user.employeeNumber}</small></td>
                      <td>{user.username || '—'}</td>
                      <td>{user.department || '—'}<small className="zrv-admin-sub">{user.jobTitle || ''}</small></td>
                      <td><Badge>{user.accountStatus}</Badge>{user.locked && <Badge tone="bad">LOCKED</Badge>}</td>
                      <td>{user.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}</td>
                      <td>{formatInstant(user.lastLoginAt)}</td>
                      <td><Link className="zrv-admin-link" to={rowLink(user)}>{rowAction}<span className="sr-only"> {displayName(user) || user.employeeNumber}</span></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPage={(page) => update({ page })} disabled={users.refreshing} label="Account pages" />
          </>
        )}
      </ResourceState>
    </Panel>
  )
}
