import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OrvexaIcon from "@/components/icons/OrvexaIcon.jsx";
import { Field } from "@/features/security-administration/components/AdminUi.jsx";
import { fieldProps } from "@/features/security-administration/adminForms.js";
import { COMMON_TEXT, REQUISITION_TEXT } from "../../hrRecruitmentText.js";

// The shared <Field> (label, hint, linked error) in the recruitment grid.
// `wide` spans the whole row; `required` adds the visual marker (inputs carry
// aria-required themselves).
export function HrField({
  id,
  label,
  required = false,
  hint,
  error,
  wide = false,
  children,
}) {
  return (
    <div
      className={`zrv-hr-field${wide ? " zrv-hr-is-wide" : ""}${error ? " zrv-hr-is-bad" : ""}`}
    >
      <Field
        id={id}
        label={
          <>
            {label}
            {required && (
              <i className="zrv-hr-req" aria-hidden="true">
                *
              </i>
            )}
          </>
        }
        hint={hint}
        error={error}
      >
        {children}
      </Field>
    </div>
  );
}

// Large single-choice cards (aria-pressed buttons in a labelled group).
// Choosing the selected card again clears it.
export function ChoiceCards({
  label,
  options,
  value,
  onChange,
  compact = false,
  error,
}) {
  const id = useId();
  return (
    <div className={error ? "zrv-hr-is-bad" : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>
        {label}
      </span>
      <div
        className={`zrv-hr-choices${compact ? " zrv-hr-is-compact" : ""}`}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`zrv-hr-choice${option.tone ? ` zrv-hr-is-${option.tone}` : ""}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(value === option.value ? "" : option.value)}
          >
            <span className="zrv-hr-bubble">
              <OrvexaIcon name={option.icon} size={18} />
            </span>
            <span>
              <b>{option.title}</b>
              {option.desc && <small>{option.desc}</small>}
            </span>
            <span className="zrv-hr-choice__tick">
              <OrvexaIcon name="check" size={13} />
            </span>
          </button>
        ))}
      </div>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

// Single choice as a radio group of cards (native radios: Tab enters the group,
// arrow keys move the choice). `options`: { value, title, desc?, meta?, icon?, tone?, lang? }.
export function RadioCards({
  name,
  label,
  options,
  value,
  onChange,
  error,
  variant = "choice",
}) {
  const id = useId();
  return (
    <div className={error ? "zrv-hr-is-bad" : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>
        {label}
      </span>
      <div
        className={`zrv-hr-radios zrv-hr-radios--${variant}`}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`zrv-hr-radio${option.tone ? ` zrv-hr-is-${option.tone}` : ""}${value === option.value ? " zrv-hr-is-on" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.icon && (
              <span className="zrv-hr-bubble">
                <OrvexaIcon name={option.icon} size={18} />
              </span>
            )}
            <span className="zrv-hr-radio__t">
              <b>{option.title}</b>
              {option.desc && (
                <small
                  lang={option.lang}
                  dir={option.lang === "ar" ? "rtl" : undefined}
                >
                  {option.desc}
                </small>
              )}
              {option.meta && <em>{option.meta}</em>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

// Multiple choice tiles with a level meter.
export function MultiTiles({ label, options, value, onChange, error }) {
  const id = useId();
  return (
    <div className={error ? "zrv-hr-is-bad" : undefined}>
      <span className="zrv-hr-label" id={`${id}-label`}>
        {label}
      </span>
      <div
        className="zrv-hr-tiles"
        role="group"
        aria-labelledby={`${id}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {options.map((option) => {
          const on = value.includes(option.code);
          return (
            <button
              key={option.code}
              type="button"
              className="zrv-hr-tile"
              aria-pressed={on}
              onClick={() =>
                onChange(
                  on
                    ? value.filter((code) => code !== option.code)
                    : [...value, option.code],
                )
              }
            >
              <span className="zrv-hr-tile__lvl" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((n) => (
                  <i
                    key={n}
                    className={n <= option.level ? "zrv-hr-is-on" : ""}
                  />
                ))}
              </span>
              <b>{option.name}</b>
            </button>
          );
        })}
      </div>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

// Ordered experience bands on a rail.
export function ExpTrack({ label, options, value, onChange, error }) {
  const id = useId();
  const index = options.findIndex((option) => option.code === value);
  return (
    <div
      className={`zrv-hr-exp${error ? " zrv-hr-is-bad" : ""}`}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <span className="zrv-hr-label" id={`${id}-label`}>
        {label}
      </span>
      <div className="zrv-hr-exp__track" style={{ "--n": options.length }}>
        <div className="zrv-hr-exp__rail">
          <i
            style={{
              width:
                index < 0
                  ? "0%"
                  : `${(index / Math.max(1, options.length - 1)) * 100}%`,
            }}
          />
        </div>
        {options.map((option, position) => (
          <button
            key={option.code}
            type="button"
            className={`zrv-hr-exp__stop${index >= 0 && position < index ? " zrv-hr-is-passed" : ""}`}
            aria-pressed={position === index}
            onClick={() => onChange(value === option.code ? "" : option.code)}
          >
            <span className="zrv-hr-exp__node" />
            {option.name}
          </button>
        ))}
      </div>
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}

// Free-text tags: Enter or comma adds, Backspace on an empty draft removes the last.
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  invalid,
  describedBy,
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.replace(/,/g, "").trim().slice(0, 40);
    if (tag && !value.some((item) => item.toLowerCase() === tag.toLowerCase()))
      onChange([...value, tag]);
    setDraft("");
  };
  return (
    <div className="zrv-hr-tags">
      {value.map((tag, index) => (
        <span key={tag} className="zrv-hr-tag">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() =>
              onChange(value.filter((_, position) => position !== index))
            }
          >
            <OrvexaIcon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => draft.trim() && add()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          } else if (event.key === "Backspace" && !draft && value.length)
            onChange(value.slice(0, -1));
        }}
      />
    </div>
  );
}

// Job-description attachments. Only file name and size are kept (in memory).
// `text` replaces the requisition wording (title, hint, uploadNote, remove, size).
export function FileDrop({
  files,
  onChange,
  onRemove,
  canRemoveSaved = false,
  disabled = false,
  text = REQUISITION_TEXT.files,
}) {
  const [over, setOver] = useState(false);
  const add = (list) =>
    onChange([
      ...files,
      ...[...list].map((file) => ({
        fileName: file.name,
        sizeBytes: file.size,
        file,
      })),
    ]);
  return (
    <div>
      <label
        className={`zrv-hr-drop${over ? " zrv-hr-is-over" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) add(event.dataTransfer.files);
        }}
      >
        <span className="zrv-hr-bubble">
          <OrvexaIcon name="upload" size={18} />
        </span>
        <span>
          <b>{text.title}</b>
          <small>{text.hint}</small>
        </span>
        <input
          type="file"
          multiple
          disabled={disabled}
          accept=".jpg,.jpeg,.png,.gif,.txt,.doc,.docx,.pdf,.xls,.xlsx,.csv,.html,.ppt,.pptx,.odt"
          className="zrv-hr-sr"
          onChange={(event) => {
            add(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <p className="zrv-admin-hint">{text.uploadNote}</p>
      {files.length > 0 && (
        <ul className="zrv-hr-files">
          {files.map((file, index) => (
            <li key={`${file.fileName}-${index}`} className="zrv-hr-file">
              <span className="zrv-hr-bubble">
                <OrvexaIcon name="file-text" size={16} />
              </span>
              <span className="zrv-hr-file__name">{file.fileName}</span>
              {file.file && (
                <small>{text.size(Math.round(file.sizeBytes / 1024))}</small>
              )}
              {(file.file || canRemoveSaved) && (
                <button
                  type="button"
                  disabled={file.file ? disabled : !canRemoveSaved}
                  aria-label={text.remove(file.fileName)}
                  onClick={() => {
                    if (file.file)
                      onChange(
                        files.filter((_, position) => position !== index),
                      );
                    else onRemove?.(file);
                  }}
                >
                  <OrvexaIcon name="trash-2" size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Form profile for the final review. The legacy `rows` mode remains available
// to the other recruitment forms that use the compact answer summary.
export function Review({ rows, sections, complete = 0, total = 0, reference, approvalStatus }) {
  if (!sections) {
    return (
      <dl className="zrv-hr-review">
        {rows.map(([label, value, missing]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={missing ? "zrv-hr-is-missing" : undefined}>
              {missing ? COMMON_TEXT.notAnswered : value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  const ready = total > 0 && complete === total;
  return (
    <div className="zrv-hr-review-profile">
      <div className="zrv-hr-review-profile__identity">
        <div><span>PERSONNEL REQUISITION</span><strong>Form profile</strong></div>
        <dl>
          <div><dt>Reference number</dt><dd>{reference || "New requisition"}</dd></div>
          <div><dt>Approval status</dt><dd>{approvalStatus || "Not saved"}</dd></div>
        </dl>
      </div>
      <header className={`zrv-hr-review-profile__summary${ready ? " zrv-hr-is-ready" : " zrv-hr-needs-attention"}`}>
        <span className="zrv-hr-review-profile__seal" aria-hidden="true">{ready ? "✓" : "!"}</span>
        <div className="zrv-hr-review-profile__summary-copy">
          <strong>{ready ? "Ready for submission" : "Review required information"}</strong>
          <span>{ready ? "All required details are complete." : `${total - complete} required ${total - complete === 1 ? "item needs" : "items need"} attention before saving.`}</span>
        </div>
        <div className="zrv-hr-review-profile__count" aria-label={`${complete} of ${total} required items complete`}>
          <b>{complete}/{total}</b><span>required</span>
        </div>
      </header>
      <div className="zrv-hr-review-profile__meter" role="progressbar" aria-label="Required form completion" aria-valuemin={0} aria-valuemax={total} aria-valuenow={complete}>
        <span style={{ width: `${total ? Math.round((complete / total) * 100) : 0}%` }} />
      </div>

      <div className="zrv-hr-review-profile__legend" aria-label="Field status key">
        <span><i className="zrv-hr-review-dot zrv-hr-is-complete" /> Complete</span>
        <span><i className="zrv-hr-review-dot zrv-hr-is-missing" /> Required</span>
        <span><i className="zrv-hr-review-dot zrv-hr-is-optional" /> Optional</span>
      </div>

      <div className="zrv-hr-review-profile__sections">
        {sections.map((section, index) => {
          const required = section.rows.filter((row) => row.required);
          const sectionComplete = required.filter((row) => row.complete).length;
          const sectionReady = required.length === sectionComplete;
          return (
            <section className="zrv-hr-review-section" key={section.title}>
              <header className="zrv-hr-review-section__head">
                <span className="zrv-hr-review-section__number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{section.title}</h3>
                <span className={`zrv-hr-review-section__state${sectionReady ? " zrv-hr-is-ready" : " zrv-hr-is-open"}`}>
                  {required.length ? `${sectionComplete}/${required.length} required` : "Optional section"}
                </span>
              </header>
              <dl className="zrv-hr-review-section__fields">
                {section.rows.map((row) => {
                  const state = row.required
                    ? (row.complete ? "complete" : "missing")
                    : (row.hasValue ? "provided" : "optional");
                  const stateLabel = state === "complete" ? "Complete" : state === "missing" ? "Required · missing" : state === "provided" ? "Provided" : "Optional · not provided";
                  return (
                    <div className={`zrv-hr-review-field zrv-hr-is-${state}`} key={row.label}>
                      <dt>{row.label}{row.required && <span className="zrv-hr-review-required" aria-label="required"> *</span>}</dt>
                      <dd>{row.hasValue ? row.value : <span className="zrv-hr-review-field__empty">{row.required ? "Not provided" : "Not provided (optional)"}</span>}</dd>
                      <span className="zrv-hr-review-field__status"><i aria-hidden="true" />{stateLabel}</span>
                    </div>
                  );
                })}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// A <select> of lookup options.
export function LookupSelect({
  id,
  value,
  onChange,
  options,
  placeholder = COMMON_TEXT.select,
  required = false,
  error,
  hint,
  disabled = false,
  loading = false,
}) {
  return (
    <select
      {...fieldProps(id, { error, hint })}
      className="ux-select zrv-hr-input"
      value={value}
      onChange={onChange}
      aria-required={required || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

// Local searchable lookup for bounded option lists such as job titles and departments.
export function SearchableLookup({
  id,
  value,
  options,
  onChange,
  onInputChange,
  customValue = "",
  placeholder = COMMON_TEXT.select,
  required = false,
  error,
  disabled = false,
  loading = false,
  maxLength = 200,
  noResults = "No matching options",
}) {
  const listId = useId();
  const controlRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.code === value);
  const matches = searching
    ? options.filter((option) =>
        option.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      )
    : options;
  const displayedValue = open && searching
    ? query
    : selected?.name ?? customValue;

  const [popupStyle, setPopupStyle] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const positionPopup = () => {
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const openUp = below < 180 && above > below;
      setPopupStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 10000,
        maxHeight: Math.max(100, Math.min(280, openUp ? above : below)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      });
    };
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
    };
  }, [open]);

  const choose = (option) => {
    onChange(option);
    setOpen(false);
    setQuery("");
    setSearching(false);
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(matches.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setSearching(false);
      setQuery("");
    }
  };

  return (
    <div className={`zrv-hr-search-select${error ? " zrv-hr-is-bad" : ""}`}>
      <div className="zrv-hr-search-select__control" ref={controlRef}>
        <span aria-hidden="true" className="zrv-hr-search-select__icon" />
        <input
          {...fieldProps(id, { error })}
          role="combobox"
          className="ux-input zrv-hr-input"
          autoComplete="off"
          placeholder={loading ? "Loading options..." : placeholder}
          value={displayedValue}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          aria-busy={loading || undefined}
          maxLength={maxLength}
          aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].code}` : undefined}
          disabled={disabled || loading}
          onFocus={(event) => {
            setOpen(true);
            setQuery("");
            setSearching(false);
            setActive(0);
            event.currentTarget.select();
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setSearching(true);
            setOpen(true);
            setActive(0);
            onInputChange?.(next);
          }}
          onKeyDown={onKeyDown}
        />
        <span aria-hidden="true" className={`zrv-hr-search-select__chevron${open ? " zrv-hr-is-open" : ""}`} />
      </div>
      {open && popupStyle && createPortal(
        <ul className="zrv-hr-search-select__list" style={popupStyle} id={listId} role="listbox" aria-label={id}>
          {matches.map((option, index) => (
            <li
              key={option.code}
              id={`${listId}-${option.code}`}
              role="option"
              aria-selected={option.code === value}
              className={`${index === active ? "zrv-hr-is-active" : ""}${option.code === value ? " zrv-hr-is-selected" : ""}`}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
            >
              <span>{option.name}</span>
              {option.code === value && <OrvexaIcon name="check" size={15} />}
            </li>
          ))}
          {!matches.length && <li className="zrv-hr-search-select__empty" role="presentation">{noResults}</li>}
        </ul>,
        document.body,
      )}
    </div>
  );
}
