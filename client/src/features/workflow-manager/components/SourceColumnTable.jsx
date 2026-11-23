import { useState } from 'react'
import { Badge } from '@/features/security-administration/components/AdminUi.jsx'
import { DATA_CLASSES, DATA_CLASS_HINTS, typeLabel } from '../sourceMappingModel.js'
import { PRIVACY_LABELS, kindOf, readableName } from '../smartMappingModel.js'

// Step 1 of the guided setup — "Choose information": one row per piece of information of the
// live source (dictionary facts are read only). Selecting a row makes it available to forms;
// every selected row needs an explicit privacy choice (nothing is pre-classified, nothing is
// selected in bulk). Technical options reveal Oracle types, nullability and "keep for checks
// only" (in the mapping, hidden from forms) — the only way to keep an unsupported column.
// Saved columns that no longer exist in the source are flagged.
export default function SourceColumnTable({
  columns,
  readOnly,
  error,
  unclassified = [],
  onChange,
}) {
  const [filter, setFilter] = useState('')
  const [technical, setTechnical] = useState(false)
  const includedCount = columns.filter((column) => column.included).length
  const term = filter.trim().toLowerCase()
  const shown = term
    ? columns.filter(
        (column) =>
          column.name.toLowerCase().includes(term) ||
          readableName(column.name).toLowerCase().includes(term),
      )
    : columns
  const missingClass = new Set(unclassified)

  return (
    <>
      <div className="zwf-table-head">
        <p className="zwf-table-head__count" role="status">
          {includedCount} of {columns.length} selected
        </p>
        <span className="zwf-row-actions">
          <label className="zwf-inline-field">
            <span className="sr-only">Find information</span>
            <input
              type="search"
              className="ux-input zwf-search"
              placeholder="Find information"
              value={filter}
              maxLength={100}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <label className="zwf-toggle">
            <input
              type="checkbox"
              checked={technical}
              onChange={(event) => setTechnical(event.target.checked)}
            />
            Technical options
          </label>
          {!readOnly && includedCount > 0 && (
            <button
              type="button"
              className="zrv-admin-link"
              onClick={() =>
                columns.forEach((column) =>
                  onChange(column.name, { included: false, exposed: false }),
                )
              }
            >
              Clear selection
            </button>
          )}
        </span>
      </div>
      {error && (
        <p className="zrv-auth-field-error" role="alert" id="zwf-columns-error">
          {error}
        </p>
      )}
      <div className="ux-table-wrap">
        <table
          className="ux-table zrv-admin-table zrv-admin-table--compact zwf-table zwf-columns"
          aria-describedby={error ? 'zwf-columns-error' : undefined}
        >
          <caption className="sr-only">Information of the data source and your selection</caption>
          <thead>
            <tr>
              <th scope="col">Use</th>
              <th scope="col">Information</th>
              <th scope="col">Kind</th>
              <th scope="col">Privacy</th>
              {technical && <th scope="col">Visible to forms</th>}
              {technical && <th scope="col">Oracle type</th>}
              {technical && <th scope="col">Empty values</th>}
            </tr>
          </thead>
          <tbody>
            {!shown.length && (
              <tr>
                <td colSpan={technical ? 7 : 4} className="zrv-admin-state">
                  Nothing matches “{filter}”.
                </td>
              </tr>
            )}
            {shown.map((column) => {
              const label = readableName(column.name)
              const usable = column.supported && !column.missing
              const selectDisabled =
                readOnly || (!column.included && (column.missing || (!usable && !technical)))
              const invalid = column.included && missingClass.has(column.name)
              return (
                <tr key={column.name} className={column.included ? 'is-selected' : 'is-inactive'}>
                  <td>
                    <input
                      type="checkbox"
                      className="zwf-check"
                      checked={column.included}
                      disabled={selectDisabled}
                      aria-label={`Use ${label} (${column.name})`}
                      onChange={(event) =>
                        onChange(
                          column.name,
                          event.target.checked
                            ? { included: true, exposed: usable }
                            : { included: false, exposed: false },
                        )
                      }
                    />
                  </td>
                  <th scope="row">
                    <span className="zwf-info-name">{label}</span>
                    <small className="zrv-admin-sub zwf-code">{column.name}</small>
                    {column.missing && <Badge tone="bad">No longer in the source</Badge>}
                    {!column.missing && !column.supported && (
                      <Badge tone="warn">Cannot be shown to forms</Badge>
                    )}
                    {column.included && !column.exposed && usable && (
                      <Badge tone="neutral">Checks only</Badge>
                    )}
                  </th>
                  <td>{kindOf(column)}</td>
                  <td>
                    <select
                      className="ux-select zwf-class-select"
                      value={column.dataClass}
                      disabled={readOnly || column.missing || !column.included}
                      aria-label={`Privacy of ${label} (${column.name})`}
                      aria-invalid={invalid || undefined}
                      title={DATA_CLASS_HINTS[column.dataClass]}
                      onChange={(event) => onChange(column.name, { dataClass: event.target.value })}
                    >
                      <option value="">{column.included ? 'Choose…' : '—'}</option>
                      {DATA_CLASSES.map((value) => (
                        <option key={value} value={value}>
                          {PRIVACY_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {technical && (
                    <td>
                      <input
                        type="checkbox"
                        className="zwf-check"
                        checked={column.included && column.exposed}
                        disabled={readOnly || column.missing || !column.included || !usable}
                        aria-label={`Show ${column.name} to forms`}
                        onChange={(event) =>
                          onChange(column.name, { exposed: event.target.checked })
                        }
                      />
                    </td>
                  )}
                  {technical && (
                    <td>
                      <span className="zwf-code">{typeLabel(column)}</span>
                      {column.identity && <Badge tone="neutral">IDENTITY {column.identity}</Badge>}
                    </td>
                  )}
                  {technical && <td>{column.nullable ? 'Allowed' : 'Never empty'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <dl className="zwf-legend">
        {DATA_CLASSES.map((value) => (
          <div key={value}>
            <dt>{PRIVACY_LABELS[value]}</dt>
            <dd>{DATA_CLASS_HINTS[value]}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
