import { useId, useState } from 'react'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Field } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { COMMON_TEXT, REQUISITION_TEXT } from '../../hrRecruitmentText.js'

// The shared <Field> (label, hint, linked error) in the recruitment grid.
// `wide` spans the whole row; `required` adds the visual marker (inputs carry
// aria-required themselves).
export function HrField({ id, label, required = false, hint, error, wide = false, children }) {
  return (
    <div className={`zrv-hr-field${wide ? ' zrv-hr-is-wide' : ''}${error ? ' zrv-hr-is-bad' : ''}`}>
      <Field id={id} label={<>{label}{required && <i className="zrv-hr-req" aria-hidden="true">*</i>}</>} hint={hint} error={error}>
        {children}
      </Field>
    </div>
  )
}

// Large single-choice cards (aria-pressed buttons in a labelled group).
// Choosing the selected card again clears it.
export function ChoiceCards({ label, options, value, onChange, compact = false, error }) {
  const id = useId()
  return (
    <div className={error ? 'zrv-hr-is-bad' : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>{label}</span>
      <div className={`zrv-hr-choices${compact ? ' zrv-hr-is-compact' : ''}`} role="group" aria-labelledby={`${id}-label`}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
        {options.map((option) => (
          <button key={option.value} type="button" className={`zrv-hr-choice${option.tone ? ` zrv-hr-is-${option.tone}` : ''}`} aria-pressed={value === option.value}
            onClick={() => onChange(value === option.value ? '' : option.value)}>
            <span className="zrv-hr-bubble"><OrvexaIcon name={option.icon} size={18} /></span>
            <span><b>{option.title}</b>{option.desc && <small>{option.desc}</small>}</span>
            <span className="zrv-hr-choice__tick"><OrvexaIcon name="check" size={13} /></span>
          </button>
        ))}
      </div>
      {error && <small id={`${id}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}

// Multiple choice tiles with a level meter.
export function MultiTiles({ label, options, value, onChange, error }) {
  const id = useId()
  return (
    <div className={error ? 'zrv-hr-is-bad' : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>{label}</span>
      <div className="zrv-hr-tiles" role="group" aria-labelledby={`${id}-label`} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
        {options.map((option) => {
          const on = value.includes(option.code)
          return (
            <button key={option.code} type="button" className="zrv-hr-tile" aria-pressed={on}
              onClick={() => onChange(on ? value.filter((code) => code !== option.code) : [...value, option.code])}>
              <span className="zrv-hr-tile__lvl" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= option.level ? 'zrv-hr-is-on' : ''} />)}</span>
              <b>{option.name}</b>
            </button>
          )
        })}
      </div>
      {error && <small id={`${id}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}

// Ordered experience bands on a rail.
export function ExpTrack({ label, options, value, onChange, error }) {
  const id = useId()
  const index = options.findIndex((option) => option.code === value)
  return (
    <div className={`zrv-hr-exp${error ? ' zrv-hr-is-bad' : ''}`} role="group" aria-labelledby={`${id}-label`}
      aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>{label}</span>
      <div className="zrv-hr-exp__track" style={{ '--n': options.length }}>
        <div className="zrv-hr-exp__rail"><i style={{ width: index < 0 ? '0%' : `${(index / Math.max(1, options.length - 1)) * 100}%` }} /></div>
        {options.map((option, position) => (
          <button key={option.code} type="button" className={`zrv-hr-exp__stop${index >= 0 && position < index ? ' zrv-hr-is-passed' : ''}`} aria-pressed={position === index}
            onClick={() => onChange(value === option.code ? '' : option.code)}>
            <span className="zrv-hr-exp__node" />{option.name}
          </button>
        ))}
      </div>
      {error && <small id={`${id}-error`} className="zrv-auth-field-error">{error}</small>}
    </div>
  )
}

// Free-text tags: Enter or comma adds, Backspace on an empty draft removes the last.
export function TagInput({ id, value, onChange, placeholder, invalid, describedBy }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = draft.replace(/,/g, '').trim().slice(0, 40)
    if (tag && !value.some((item) => item.toLowerCase() === tag.toLowerCase())) onChange([...value, tag])
    setDraft('')
  }
  return (
    <div className="zrv-hr-tags">
      {value.map((tag, index) => (
        <span key={tag} className="zrv-hr-tag">{tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((_, position) => position !== index))}><OrvexaIcon name="x" size={12} /></button>
        </span>
      ))}
      <input id={id} value={draft} placeholder={placeholder} autoComplete="off" aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={(event) => setDraft(event.target.value)} onBlur={() => draft.trim() && add()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add() }
          else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }} />
    </div>
  )
}

// Job-description attachments. Only file name and size are kept (in memory).
export function FileDrop({ files, onChange, onRemove, canRemoveSaved = false, disabled = false }) {
  const [over, setOver] = useState(false)
  const text = REQUISITION_TEXT.files
  const add = (list) => onChange([...files, ...[...list].map((file) => ({ fileName: file.name, sizeBytes: file.size, file }))])
  return (
    <div>
      <label className={`zrv-hr-drop${over ? ' zrv-hr-is-over' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setOver(true) }} onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); if (!disabled) add(event.dataTransfer.files) }}>
        <span className="zrv-hr-bubble"><OrvexaIcon name="upload" size={18} /></span>
        <span><b>{text.title}</b><small>{text.hint}</small></span>
        <input type="file" multiple disabled={disabled} accept=".jpg,.jpeg,.png,.gif,.txt,.doc,.docx,.pdf,.xls,.xlsx,.csv,.html,.ppt,.pptx,.odt" className="zrv-hr-sr" onChange={(event) => { add(event.target.files); event.target.value = '' }} />
      </label>
      <p className="zrv-admin-hint">{text.uploadNote}</p>
      {files.length > 0 && (
        <ul className="zrv-hr-files">
          {files.map((file, index) => (
            <li key={`${file.fileName}-${index}`} className="zrv-hr-file">
              <span className="zrv-hr-bubble"><OrvexaIcon name="file-text" size={16} /></span>
          <span className="zrv-hr-file__name">{file.fileName}</span>{file.file && <small>{text.size(Math.round(file.sizeBytes / 1024))}</small>}
              {(file.file || canRemoveSaved) && <button type="button" disabled={file.file ? disabled : !canRemoveSaved} aria-label={text.remove(file.fileName)} onClick={() => {
                if (file.file) onChange(files.filter((_, position) => position !== index))
                else onRemove?.(file)
              }}><OrvexaIcon name="trash-2" size={15} /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Answer summary; missing answers are flagged.
export function Review({ rows }) {
  return (
    <dl className="zrv-hr-review">
      {rows.map(([label, value, missing]) => (
        <div key={label}><dt>{label}</dt><dd className={missing ? 'zrv-hr-is-missing' : undefined}>{missing ? COMMON_TEXT.notAnswered : value}</dd></div>
      ))}
    </dl>
  )
}

// A <select> of lookup options.
export function LookupSelect({ id, value, onChange, options, placeholder = COMMON_TEXT.select, required = false, error, hint }) {
  return (
    <select {...fieldProps(id, { error, hint })} className="ux-select zrv-hr-input" value={value} onChange={onChange} aria-required={required || undefined}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select>
  )
}
