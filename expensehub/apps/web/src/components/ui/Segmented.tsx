// Small single-choice control (2–4 options), radio semantics.
import { cn } from '../../lib/cn';

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-input border border-border bg-surface-2 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 rounded-[6px] px-3 text-sm font-medium transition-colors',
              selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
