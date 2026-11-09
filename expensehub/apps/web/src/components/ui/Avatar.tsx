import { cn } from '../../lib/cn';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-11 text-sm' };

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-brand/12 font-semibold text-brand-solid ring-1 ring-inset ring-brand/20 dark:text-brand',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
