import { Badge } from '@/features/security-administration/components/AdminUi.jsx'
import { DATA_CLASSES, DATA_CLASS_HINTS, DATA_CLASS_LABELS, typeLabel } from '../sourceMappingModel.js'

// The column allowlist: one row per column of the live source (dictionary facts are read
// only), with "include in mapping", "expose to forms" and the data class the author chooses.
// Columns of unsupported types (for example BLOB) can be included and classified, never
// exposed. Saved columns that no longer exist in the source are flagged.
export default function SourceColumnTable({ columns, readOnly, error, onChange }) {
  const includedCount = columns.filter((column) => column.included).length
  const exposedCount = columns.filter((column) => column.included && column.exposed).length
  const bulk = (patch) => columns.forEach((column) => !column.missing && column.supported && onChange(column.name, patch))
  return (
    <>
      <div className="zwf-table-head">
        <p className="zwf-table-head__count" role="status">
          {includedCount} of {columns.length} columns in the mapping · {exposedCount} exposed
        </p>
        {!readOnly && (
          <span className="zwf-row-actions">
            <button type="button" className="zrv-admin-link" onClick={() => bulk({ included: true })}>Include all supported</button>
            <button type="button" className="zrv-admin-link" onClick={() => columns.forEach((column) => onChange(column.name, { included: false, exposed: false }))}>Clear</button>
          </span>
        )}
      </div>
      {error && <p className="zrv-auth-field-error" role="alert" id="zwf-columns-error">{error}</p>}
      <div className="ux-table-wrap">
        <table className="ux-table zrv-admin-table zrv-admin-table--compact zwf-table zwf-columns" aria-describedby={error ? 'zwf-columns-error' : undefined}>
          <caption className="sr-only">Columns of the source and their mapping</caption>
          <thead>
            <tr>
              <th scope="col">In mapping</th>
              <th scope="col">Column</th>
              <th scope="col">Oracle type</th>
              <th scope="col">Nulls</th>
              <th scope="col">Exposed</th>
              <th scope="col">Data class</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => {
              const disabled = readOnly || column.missing
              return (
                <tr key={column.name} className={column.included ? 'is-selected' : 'is-inactive'}>
                  <td>
                    <input
                      type="checkbox"
                      className="zwf-check"
                      checked={column.included}
                      disabled={readOnly || (column.missing && !column.included)}
                      aria-label={`Include ${column.name} in the mapping`}
                      onChange={(event) => onChange(column.name, event.target.checked ? { included: true } : { included: false, exposed: false })}
                    />
                  </td>
                  <th scope="row">
                    <span className="zwf-code">{column.name}</span>
                    {column.identity && <Badge tone="neutral">IDENTITY {column.identity}</Badge>}
                    {column.missing && <Badge tone="bad">NOT IN SOURCE</Badge>}
                    {!column.missing && !column.supported && <Badge tone="warn">CANNOT BE EXPOSED</Badge>}
                  </th>
                  <td><span className="zwf-code">{typeLabel(column)}</span></td>
                  <td>{column.nullable ? 'Allowed' : 'Not null'}</td>
                  <td>
                    <input
                      type="checkbox"
                      className="zwf-check"
                      checked={column.included && column.exposed}
                      disabled={disabled || !column.included || !column.supported}
                      aria-label={`Expose ${column.name} to forms`}
                      onChange={(event) => onChange(column.name, { exposed: event.target.checked })}
                    />
                  </td>
                  <td>
                    <select
                      className="ux-select zwf-class-select"
                      value={column.dataClass}
                      disabled={disabled || !column.included}
                      aria-label={`Data class of ${column.name}`}
                      title={DATA_CLASS_HINTS[column.dataClass]}
                      onChange={(event) => onChange(column.name, { dataClass: event.target.value })}
                    >
                      {DATA_CLASSES.map((value) => <option key={value} value={value}>{DATA_CLASS_LABELS[value]}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <dl className="zwf-legend">
        {DATA_CLASSES.map((value) => (
          <div key={value}><dt>{DATA_CLASS_LABELS[value]}</dt><dd>{DATA_CLASS_HINTS[value]}</dd></div>
        ))}
      </dl>
    </>
  )
}
