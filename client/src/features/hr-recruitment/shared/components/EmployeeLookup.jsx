import { useId, useState } from 'react'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { PICKER_TEXT } from '../../hrRecruitmentText.js'
import { useSettled } from '../useSettled.js'
import { HrField, SearchableLookup } from './RecruitmentInputs.jsx'

// Uses the same portal and keyboard controls as the recruitment lookups, with
// server searches so each form retains its own employee eligibility rules.
export function EmployeeLookup({ id, label, value, onPick, searchService, cacheKey, required = false, error, disabled = false }) {
  const statusId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = useSettled(query.trim(), 250)
  const results = useResource(open ? `${cacheKey}:${search.toLowerCase()}` : null,
    (signal) => searchService(search, { signal }))
  const pending = open && (search !== query.trim() || ['idle', 'loading'].includes(results.status))
  const items = !pending && results.status === 'ready' ? results.data.items : []
  const status = pending ? PICKER_TEXT.searching : results.status === 'error' ? PICKER_TEXT.failed : PICKER_TEXT.results(items.length)
  return <HrField id={id} label={label} required={required} error={error}>
    <SearchableLookup id={id} required={required} error={error} disabled={disabled}
      value={value?.employeeNumber || value?.employeeId || value?.name || ''} customValue={value?.name || ''}
      options={items.map((employee) => ({
        code: employee.employeeNumber || employee.employeeId || employee.name,
        name: employee.name,
        description: [employee.employeeNumber, employee.position, employee.section || employee.departmentName].filter(Boolean).join(' · '),
        employee,
      }))}
      onChange={(option) => onPick(option.employee)} onSearch={setQuery} onOpenChange={setOpen}
      searchPending={pending} maxLength={100} describedBy={statusId} placeholder={PICKER_TEXT.placeholder}
      noResults={pending || results.status === 'error' ? status : PICKER_TEXT.noMatch} />
    <span id={statusId} className="zrv-hr-sr" role="status" aria-live="polite">{open ? status : ''}</span>
  </HrField>
}
