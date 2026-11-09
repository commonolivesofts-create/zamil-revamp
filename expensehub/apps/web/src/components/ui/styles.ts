// Shared class lists (kept out of component files for fast refresh).
import { cn } from '../../lib/cn';

export const inputClasses = cn(
  'h-10 w-full rounded-input border border-border bg-surface px-3 text-sm text-ink shadow-card',
  'placeholder:text-muted transition-[border-color,box-shadow] duration-150',
  'hover:border-muted/60 focus-visible:border-brand focus-visible:outline-none',
  'focus-visible:ring-4 focus-visible:ring-brand/15',
  'aria-[invalid=true]:border-block aria-[invalid=true]:focus-visible:ring-block/15',
  'disabled:cursor-not-allowed disabled:opacity-60',
);
