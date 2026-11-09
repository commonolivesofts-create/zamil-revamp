import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-title font-semibold sm:text-display">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
