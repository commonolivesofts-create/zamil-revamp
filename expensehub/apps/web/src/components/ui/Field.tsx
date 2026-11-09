// UI-UX §8: every input has a visible label; errors are linked with aria-describedby.
import { CircleAlert } from 'lucide-react';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** One input element; receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>;
  labelAction?: ReactNode;
}

export function Field({ label, error, hint, children, labelAction }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {labelAction}
      </div>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-xs font-medium text-block">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="text-xs text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}
