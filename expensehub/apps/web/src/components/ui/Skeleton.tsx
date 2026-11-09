import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('rounded-input bg-surface-2 motion-safe:animate-pulse', className)}
    />
  );
}
