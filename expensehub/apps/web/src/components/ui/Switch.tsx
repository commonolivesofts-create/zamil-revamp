import { cn } from '../../lib/cn';

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Accessible name when there is no visible <label htmlFor>. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-solid' : 'bg-border dark:bg-surface-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow-card transition-transform duration-150',
          checked
            ? 'translate-x-[18px] rtl:-translate-x-[18px]'
            : 'translate-x-0.5 rtl:-translate-x-0.5',
        )}
      />
    </button>
  );
}
