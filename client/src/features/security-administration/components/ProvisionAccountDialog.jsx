import { useState } from 'react'
import { checkSearch, fieldProps } from '../adminForms.js'
import { describeReason } from '../adminFeedback.js'
import { securityAdminService } from '../securityAdminService.js'
import { useResource } from '../useAdminData.js'
import { Badge, Dialog, DialogActions, Feedback, Field, Pagination, ResourceState } from './AdminUi.jsx'

// Provisioning (USER_ACCOUNTS:CREATE): search the employee master
// (GET /users/candidates), pick an eligible employee, confirm, then
// POST /users. The account is created PENDING without a password; the
// backend decides eligibility and refuses duplicates.
export default function ProvisionAccountDialog({ action, onClose, onProvisioned }) {
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState({ term: '', page: 1 })
  const [searchError, setSearchError] = useState(null)
  const [selected, setSelected] = useState(null)
  const candidates = useResource(
    search.term ? `candidates:${search.term}:${search.page}` : null,
    (signal) => securityAdminService.listCandidates({ search: search.term, page: search.page, limit: 10, hasAccount: false }, { signal }),
  )

  const submitSearch = (event) => {
    event.preventDefault()
    const { term, error } = checkSearch(searchText)
    setSearchError(error || (term ? null : 'Enter at least 2 characters.'))
    if (!error && term) {
      setSelected(null)
      setSearch({ term, page: 1 })
    }
  }

  const provision = async () => {
    if (!selected) return
    const outcome = await action.run(() => securityAdminService.provisionUser(selected.employeeNumber), {
      success: (user) => `Account created for employee ${user.employeeNumber}. It stays pending until a password is set and it is activated.`,
    })
    if (outcome.status === 'success') onProvisioned(outcome.value)
    else if (outcome.status !== 'ignored') candidates.reload()
  }

  return (
    <Dialog title="Provision an account" description="Search the employee master for an employee without an application account. Nothing is granted automatically: the account starts pending, without roles." onClose={onClose} busy={action.pending} wide>
      <form className="zrv-admin-toolbar" onSubmit={submitSearch} role="search" aria-label="Search employees" noValidate>
        <Field id="candidate-search" label="Employee" hint="Employee number, username or name" error={searchError}>
          <input {...fieldProps('candidate-search', { hint: true, error: searchError })} data-autofocus className="ux-input" type="search" value={searchText} maxLength={100} onChange={(event) => setSearchText(event.target.value)} disabled={action.pending} />
        </Field>
        <div className="zrv-admin-toolbar__submit"><button type="submit" className="btn-secondary" disabled={action.pending}>Search</button></div>
      </form>

      <ResourceState resource={candidates} label="employees" empty="No employees without an account match this search." isEmpty={(data) => data.items.length === 0}>
        {({ items, pagination }) => (
          <fieldset className="zrv-admin-choices">
            <legend className="sr-only">Employees</legend>
            {items.map((candidate) => {
              const id = `candidate-${candidate.employeeNumber}`
              return (
                <label key={candidate.employeeNumber} htmlFor={id} className={`zrv-admin-choice ${candidate.provisionable ? '' : 'is-disabled'}`.trim()}>
                  <input id={id} type="radio" name="candidate" checked={selected?.employeeNumber === candidate.employeeNumber} disabled={!candidate.provisionable || action.pending} onChange={() => setSelected(candidate)} />
                  <span>
                    <b>{candidate.fullName || 'Name not recorded'}</b> · {candidate.employeeNumber}
                    <small className="zrv-admin-sub">{[candidate.username, candidate.jobTitle, candidate.department].filter(Boolean).join(' · ')}</small>
                    {!candidate.provisionable && <small className="zrv-admin-sub">{candidate.userId ? `Already has an account (${candidate.accountStatus})` : describeReason(candidate.ineligibilityReason)}</small>}
                  </span>
                  {candidate.provisionable ? <Badge tone="good">Eligible</Badge> : <Badge tone="neutral">Not eligible</Badge>}
                </label>
              )
            })}
            <Pagination pagination={pagination} onPage={(page) => setSearch((current) => ({ ...current, page }))} disabled={candidates.refreshing} label="Employee pages" />
          </fieldset>
        )}
      </ResourceState>

      {selected && (
        <p className="zrv-admin-confirm" role="status">
          Create a pending account for <b>{selected.fullName || selected.employeeNumber}</b> (employee {selected.employeeNumber})?
        </p>
      )}
      <Feedback feedback={action.feedback?.kind === 'success' ? null : action.feedback} />
      <DialogActions onCancel={onClose} pending={action.pending} confirmLabel="Create pending account" pendingLabel="Creating…" confirmDisabled={!selected} onConfirm={provision} />
    </Dialog>
  )
}
