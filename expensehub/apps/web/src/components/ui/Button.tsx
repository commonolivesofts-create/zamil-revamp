// UI-UX §6 Button — primary / secondary / ghost / danger (+ inverse for dark cards), loading state.
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

const buttonVariants = cva(
  [
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,color,box-shadow,transform] duration-150 ease-out',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand-solid text-brand-fg shadow-card hover:bg-brand-solid-hover',
        secondary: 'border border-border bg-surface text-ink shadow-card hover:bg-surface-2',
        ghost: 'text-ink hover:bg-surface-2',
        danger: 'bg-block text-white shadow-card hover:opacity-90',
        inverse: 'bg-white/10 text-hero-fg ring-1 ring-white/15 ring-inset hover:bg-white/15',
      },
      size: {
        sm: 'h-8 rounded-input px-3 text-sm',
        md: 'h-10 rounded-input px-4 text-sm',
        lg: 'h-11 rounded-input px-5 text-base',
        icon: 'size-9 rounded-input',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router Link) with button styling. */
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
