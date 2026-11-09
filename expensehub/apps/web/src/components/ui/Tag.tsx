// UI-UX §6 Tag — status is never colour alone (§8): every tone carries an icon and text.
import { Circle, CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'pass' | 'warn' | 'block' | 'info' | 'neutral';

const toneClasses: Record<Tone, string> = {
  pass: 'bg-pass/10 text-pass-text ring-pass/25',
  warn: 'bg-warn/10 text-warn ring-warn/25',
  block: 'bg-block/10 text-block ring-block/25',
  info: 'bg-info/10 text-info ring-info/25',
  neutral: 'bg-surface-2 text-muted ring-border',
};

const toneIcons: Record<Tone, LucideIcon> = {
  pass: CircleCheck,
  warn: TriangleAlert,
  block: CircleX,
  info: Info,
  neutral: Circle,
};

export function Tag({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = toneIcons[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {children}
    </span>
  );
}
