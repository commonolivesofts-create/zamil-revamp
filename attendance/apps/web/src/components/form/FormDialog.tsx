// Generic create/edit dialog driven by a field list. Validates with the same zod schema as the API,
// shows field errors from either side inline, and keeps the dialog open on failure.
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { ApiError, errorMessage } from '../../lib/api';
import { Dialog, Field } from '../Dialog';
import { fieldErrorsFrom, type FieldErrors } from './fieldErrors';
import type { FormField, FormValues } from './types';

export function FormDialog<V extends FormValues>({
  title,
  description,
  fields,
  initial,
  schema,
  submitLabel,
  onSubmit,
  onClose,
  onFieldChange,
  children,
}: {
  title: string;
  description?: string;
  fields: readonly FormField<V>[];
  initial: V;
  schema: z.ZodType;
  submitLabel: string;
  /** Persists the values; throw ApiError to show server errors. */
  onSubmit: (values: V) => Promise<void>;
  onClose: () => void;
  /** Called after a field changes, e.g. to look up an employee name while the number is typed. */
  onFieldChange?: (name: keyof V & string, values: V, set: (patch: Partial<V>) => void) => void;
  children?: ReactNode;
}) {
  const id = useId().replace(/:/g, '');
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (patch: Partial<V>) => setValues((current) => ({ ...current, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(values);
    } catch (error) {
      const fieldErrors =
        error instanceof ApiError && error.code === 'VALIDATION'
          ? fieldErrorsFrom((error.details as { issues?: unknown } | undefined)?.issues)
          : {};
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog title={title} description={description} onClose={onClose} busy={pending} wide>
      <form className="zat-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="zat-form-grid">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              id={`${id}-${field.name}`}
              field={field}
              value={values[field.name]}
              error={errors[field.name]}
              disabled={pending}
              onChange={(value) => {
                const patch = { [field.name]: value } as Partial<V>;
                set(patch);
                onFieldChange?.(field.name, { ...values, ...patch }, set);
              }}
            />
          ))}
        </div>
        {children}
        {formError && (
          <p className="zrv-admin-feedback zrv-admin-feedback--error" role="alert">
            {formError}
          </p>
        )}
        <div className="zrv-dialog__actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldInput<V extends FormValues>({
  id,
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  field: FormField<V>;
  value: V[keyof V];
  error?: string;
  disabled: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const label = field.required ? `${field.label} *` : field.label;
  const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined;
  const common = {
    id,
    disabled: disabled || field.readOnly,
    readOnly: field.readOnly,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  };
  const text = typeof value === 'string' ? value : '';

  if (field.type === 'yesno' || field.type === 'multiselect') {
    const options = field.type === 'yesno' ? YES_NO_OPTIONS : (field.options ?? []);
    const selected: string[] = Array.isArray(value) ? value : [];
    return (
      <fieldset
        className={`zat-choice${field.wide ? ' zat-form-wide' : ''}`}
        aria-describedby={describedBy}
      >
        <legend>{label}</legend>
        <div className={field.type === 'multiselect' ? 'zat-choice__list' : 'zat-choice__row'}>
          {options.map((option) => (
            <label key={option.value} className="zat-choice__option">
              <input
                type={field.type === 'yesno' ? 'radio' : 'checkbox'}
                name={id}
                value={option.value}
                disabled={disabled}
                checked={
                  field.type === 'yesno' ? text === option.value : selected.includes(option.value)
                }
                onChange={(event) =>
                  onChange(
                    field.type === 'yesno'
                      ? option.value
                      : event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((v) => v !== option.value),
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
          {field.type === 'multiselect' && options.length === 0 && (
            <span className="zat-muted">No options available.</span>
          )}
        </div>
        {error && (
          <small id={`${id}-error`} className="zrv-auth-field-error">
            {error}
          </small>
        )}
      </fieldset>
    );
  }

  return (
    <div className={field.wide ? 'zat-form-wide' : undefined}>
      <Field id={id} label={label} hint={field.hint} error={error}>
        {field.type === 'select' ? (
          <select
            {...common}
            className="ux-select"
            value={text}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{field.placeholder ?? 'Select…'}</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            {...common}
            className="ux-textarea"
            rows={3}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            {...common}
            className="ux-input"
            type={field.type === 'number' ? 'text' : field.type}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
    </div>
  );
}

const YES_NO_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
] as const;
