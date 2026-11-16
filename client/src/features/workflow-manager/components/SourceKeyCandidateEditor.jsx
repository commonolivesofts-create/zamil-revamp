import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { formatInstant } from '@/features/security-administration/adminFeedback.js'
import { Badge, Field } from '@/features/security-administration/components/AdminUi.jsx'
import {
  ASSURANCE_BASES, ASSURANCE_LABELS, MAX_KEY_COLUMNS, MAX_KEYS, emptyKey, previewEnforcement,
} from '../sourceMappingModel.js'

function SavedEvidence({ saved }) {
  if (!saved) return null
  return (
    <dl className="zwf-evidence">
      <div>
        <dt>Saved as</dt>
        <dd>{saved.enforcement === 'DATABASE_ENFORCED' ? `Database-enforced by ${saved.enforcedBy?.name}` : 'Declared (provisional)'}</dd>
      </div>
      {saved.observation && (
        <div>
          <dt>Uniqueness observation</dt>
          <dd>
            {saved.observation.rowCount} rows · {saved.observation.nullKeyRows} with a null key · {saved.observation.duplicateKeyGroups} duplicated key values
            <small className="zrv-admin-sub">Observed {formatInstant(saved.observation.observedAt)} — evidence, not a guarantee</small>
          </dd>
        </div>
      )}
      {saved.assurance && (
        <div>
          <dt>Attested</dt>
          <dd>{formatInstant(saved.assurance.attestedAt)} by user {saved.assurance.attestedBy}</dd>
        </div>
      )}
    </dl>
  )
}

// Key candidates (single or composite). The database decides enforcement: a validated primary
// key / unique constraint or unique index makes a key DATABASE_ENFORCED; any other key is
// DECLARED — provisional — and needs a documented assurance basis, evidence and rationale.
// The badge previews the server's rule; the server re-checks on save.
export default function SourceKeyCandidateEditor({ keys, columns, snapshot, readOnly, errors = {}, onChange }) {
  const candidates = columns.filter((column) => column.included && column.exposed && column.keyEligible && !column.missing)
  const update = (uid, patch) => onChange(keys.map((key) => (key.uid === uid ? { ...key, ...patch } : key)))
  const toggleColumn = (key, name, checked) =>
    update(key.uid, { columns: checked ? [...key.columns, name] : key.columns.filter((item) => item !== name) })

  return (
    <div className="zwf-keys">
      {!keys.length && (
        <p className="zrv-admin-state" role="status">
          No key candidates. A key identifies one record of this source; add one if forms will read records of it by key.
        </p>
      )}
      {keys.map((key, index) => {
        const preview = previewEnforcement(key.columns, snapshot)
        const declared = preview.enforcement === 'DECLARED'
        const e = errors[key.uid] ?? {}
        const base = `zwf-key-${key.uid}`
        return (
          <fieldset key={key.uid} className="zwf-key-card" aria-describedby={`${base}-status`}>
            <legend className="sr-only">Key candidate {index + 1}</legend>
            <div className="zwf-key-card__head">
              <Field id={`${base}-code`} label="Key code" hint="Upper-case letters, digits and underscores" error={e.code}>
                <input
                  {...fieldProps(`${base}-code`, { hint: true, error: e.code })}
                  className="ux-input zwf-code-input"
                  value={key.code}
                  maxLength={80}
                  readOnly={readOnly}
                  onChange={(event) => update(key.uid, { code: event.target.value.toUpperCase() })}
                />
              </Field>
              <p id={`${base}-status`} className="zwf-key-card__status">
                {key.columns.length === 0
                  ? <Badge tone="neutral">Choose columns</Badge>
                  : declared
                    ? <Badge tone="warn">Declared — provisional</Badge>
                    : <Badge tone="good">Database-enforced · {preview.enforcedBy}</Badge>}
              </p>
              {!readOnly && (
                <button type="button" className="zrv-admin-link zwf-key-card__remove" onClick={() => onChange(keys.filter((item) => item.uid !== key.uid))}>
                  <OrvexaIcon name="trash-2" className="size-4" /> Remove<span className="sr-only"> key {key.code || index + 1}</span>
                </button>
              )}
            </div>

            <fieldset className="zwf-key-columns" aria-describedby={e.columns ? `${base}-columns-error` : `${base}-columns-hint`}>
              <legend>Key columns {key.columns.length > 1 && <span className="zrv-admin-hint">(composite, in this order: {key.columns.join(', ')})</span>}</legend>
              {candidates.length === 0 && !key.columns.length && (
                <p className="zrv-admin-hint" id={`${base}-columns-hint`}>Expose a column of a key-eligible type first (not CLOB, BLOB or LONG).</p>
              )}
              <div className="zwf-chips">
                {[...new Set([...key.columns, ...candidates.map((column) => column.name)])].map((name) => (
                  <label key={name} className="zwf-chip">
                    <input
                      type="checkbox"
                      checked={key.columns.includes(name)}
                      disabled={readOnly || (!key.columns.includes(name) && key.columns.length >= MAX_KEY_COLUMNS)}
                      onChange={(event) => toggleColumn(key, name, event.target.checked)}
                    />
                    <span className="zwf-code">{name}</span>
                  </label>
                ))}
              </div>
              {e.columns && <small id={`${base}-columns-error`} className="zrv-auth-field-error">{e.columns}</small>}
            </fieldset>

            {declared && key.columns.length > 0 && (
              <div className="zwf-key-assurance">
                <p className="zrv-admin-hint">
                  Oracle does not enforce this key, so duplicates are possible. Document why it is unique; on save the server also counts null and duplicate key values (counts only — no records are read back).
                </p>
                <Field id={`${base}-basis`} label="Assurance basis" error={e.basis}>
                  <select {...fieldProps(`${base}-basis`, { error: e.basis })} className="ux-select" value={key.basis} disabled={readOnly} onChange={(event) => update(key.uid, { basis: event.target.value })}>
                    <option value="">Choose…</option>
                    {ASSURANCE_BASES.map((basis) => <option key={basis} value={basis}>{ASSURANCE_LABELS[basis]}</option>)}
                  </select>
                </Field>
                <Field id={`${base}-evidence`} label="Evidence reference" hint="Design note, ticket or document that shows the key is unique" error={e.evidenceRef}>
                  <input {...fieldProps(`${base}-evidence`, { hint: true, error: e.evidenceRef })} className="ux-input" value={key.evidenceRef} maxLength={500} readOnly={readOnly} onChange={(event) => update(key.uid, { evidenceRef: event.target.value })} />
                </Field>
                <Field id={`${base}-rationale`} label="Rationale" error={e.rationale}>
                  <textarea {...fieldProps(`${base}-rationale`, { error: e.rationale })} className="ux-input zwf-textarea" rows={2} value={key.rationale} maxLength={1000} readOnly={readOnly} onChange={(event) => update(key.uid, { rationale: event.target.value })} />
                </Field>
              </div>
            )}
            <SavedEvidence saved={key.saved} />
          </fieldset>
        )
      })}
      {!readOnly && (
        <button type="button" className="btn-secondary zwf-add-key" disabled={keys.length >= MAX_KEYS} onClick={() => onChange([...keys, emptyKey()])}>
          <OrvexaIcon name="plus" className="size-4" /> Add key candidate
        </button>
      )}
    </div>
  )
}
