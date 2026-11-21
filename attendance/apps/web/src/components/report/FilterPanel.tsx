// Collapsible filter form (markup of client InsightReport filters). Edits stay in a draft until
// Apply; Reset applies the page's reset filters.
import { useState, type CSSProperties, type FormEvent } from 'react';
import { OrvexaIcon } from '../OrvexaIcon';
import type { FilterField, FilterValues } from './types';

export function FilterPanel<F extends FilterValues>({
  id,
  open,
  fields,
  applied,
  initial,
  onApply,
}: {
  id: string;
  open: boolean;
  fields: readonly FilterField<F>[];
  applied: F;
  initial: () => F;
  onApply: (filters: F) => void;
}) {
  const [draft, setDraft] = useState<F>(applied);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply(draft);
  };
  const reset = () => {
    const next = initial();
    setDraft(next);
    onApply(next);
  };
  const set = (key: keyof F & string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div
      id={`${id}-filters`}
      className={`zrv-ir-collapse${open ? ' zrv-ir-is-open' : ''}`}
      inert={!open}
    >
      <div className="zrv-ir-collapse__inner">
        <form
          className="zrv-ir-filters"
          style={{ '--fields': fields.length } as CSSProperties}
          onSubmit={submit}
          aria-label="Filters"
        >
          {fields.map((field) => {
            const inputId = `${id}-${field.key}`;
            const value = draft[field.key] ?? '';
            return (
              <label key={field.key} className="zrv-ir-field" htmlFor={inputId}>
                <span>{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    id={inputId}
                    value={value}
                    onChange={(event) => set(field.key, event.target.value)}
                  >
                    <option value="">{field.placeholder ?? 'All'}</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    type={field.type}
                    maxLength={field.type === 'text' ? 100 : undefined}
                    placeholder={field.placeholder}
                    value={value}
                    onChange={(event) => set(field.key, event.target.value)}
                  />
                )}
              </label>
            );
          })}
          <div className="zrv-ir-filters__actions">
            <button type="submit" className="zrv-ir-btn zrv-ir-btn--primary">
              <OrvexaIcon name="check" size={15} />
              Apply
            </button>
            <button type="button" className="zrv-ir-btn" onClick={reset}>
              <OrvexaIcon name="rotate-ccw" size={15} />
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
