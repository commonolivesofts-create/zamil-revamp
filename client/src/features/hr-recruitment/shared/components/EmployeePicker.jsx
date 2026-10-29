import { useId, useState } from 'react'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { PICKER_TEXT } from '../../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../../hrRecruitmentService.js'
import { initials } from '../hrFormat.js'
import { useSettled } from '../useSettled.js'

// Searchable employee picker (ARIA combobox with a listbox). Arrow keys move
// through the options, Enter picks, Escape closes; results come from the
// employee search service as the user types. `tight` is the denser variant
// (no avatar, list under the input); `cacheKey` separates the cached results
// of search services that return different employee shapes.
export function EmployeePicker({ id, label, required = false, value, onPick, error, describedBy, searchService, tight = false, cacheKey = 'hr-employees' }) {
  const listId = useId()
  const statusId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const search = useSettled(query.trim(), 250)
  const results = useResource(open ? `${cacheKey}:${search.toLowerCase()}` : null,
    (signal) => searchService ? searchService(search, { signal }) : hrRecruitmentServices.employees.search(search, { signal }))
  const matches = results.status === 'ready' ? results.data.items : []
  const status = !open ? '' : results.status === 'loading' ? PICKER_TEXT.searching
    : results.status === 'error' ? PICKER_TEXT.failed : PICKER_TEXT.results(matches.length)

  const pick = (employee) => {
    onPick(employee)
    setQuery('')
    setOpen(false)
  }
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(matches.length - 1, index + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(0, index - 1)) }
    else if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); pick(matches[active]) }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false) }
  }

  return (
    <div className={`zrv-hr-combo${tight ? ' zrv-hr-combo--tight' : ''}${error ? ' zrv-hr-is-bad' : ''}`}>
      <label htmlFor={id}>{label}{required && <i className="zrv-hr-req" aria-hidden="true">*</i>}</label>
      <div className="zrv-hr-combo__in">
        {!tight && <span className="zrv-hr-combo__av" aria-hidden="true">{initials(value?.name)}</span>}
        <input id={id} role="combobox" className="ux-input zrv-hr-input" autoComplete="off" placeholder={PICKER_TEXT.placeholder}
          aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-required={required || undefined}
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].employeeId}` : undefined}
          aria-invalid={Boolean(error)} aria-describedby={[error ? `${id}-error` : null, describedBy, statusId].filter(Boolean).join(' ')}
          value={open ? query : value?.name ?? query}
          onFocus={() => { setOpen(true); setQuery(''); setActive(0) }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0) }}
          onKeyDown={onKeyDown} />
      </div>
      {open && (
        <ul className="zrv-hr-combo__list" id={listId} role="listbox" aria-label={label}>
          {matches.map((employee, index) => (
            <li key={employee.employeeId} id={`${listId}-${employee.employeeId}`} role="option" aria-selected={index === active}
              className={index === active ? 'zrv-hr-is-active' : undefined}
              onMouseDown={(event) => { event.preventDefault(); pick(employee) }}>
              <b>{employee.name}</b><small>{employee.employeeNumber} · {PICKER_TEXT.option(employee)}</small>
            </li>
          ))}
          {results.status === 'ready' && !matches.length && <li className="zrv-hr-combo__none" role="presentation">{PICKER_TEXT.noMatch}</li>}
        </ul>
      )}
      <span id={statusId} className="zrv-hr-sr" role="status" aria-live="polite">{status}</span>
      {error && <small id={`${id}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}
