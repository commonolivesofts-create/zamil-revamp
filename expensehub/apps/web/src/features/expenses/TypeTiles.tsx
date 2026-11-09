// UI-UX §6 Tile — expense type picker (icon + name). A radiogroup with arrow-key navigation.
import type { ExpenseTypeDto } from '@expensehub/shared';
import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { EXPENSE_ICONS } from '../../lib/expense-icons';

export function TypeTiles({
  types,
  value,
  onChange,
  disabled,
  error,
}: {
  types: ExpenseTypeDto[];
  value: number | null;
  onChange: (typeId: number) => void;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = types.findIndex((x) => x.typeId === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const step =
      e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
        ? 1
        : e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + types.length) % types.length;
    refs.current[next]?.focus();
    onChange(types[next]!.typeId);
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t('expenses.form.type')}</legend>
      <div
        role="radiogroup"
        aria-label={t('expenses.form.type')}
        aria-invalid={error ? true : undefined}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4"
      >
        {types.map((type, i) => {
          const Icon = EXPENSE_ICONS[type.icon];
          const selected = type.typeId === value;
          return (
            <button
              key={type.typeId}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(type.typeId)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex min-h-14 items-center gap-2.5 rounded-input border px-3 py-2.5 text-start text-sm transition-[border-color,background-color,box-shadow]',
                'outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:opacity-60',
                selected
                  ? 'border-brand bg-brand/10 font-medium text-ink shadow-card'
                  : 'border-border bg-surface hover:border-muted/60',
              )}
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-input',
                  selected ? 'bg-brand-solid text-brand-fg' : 'bg-surface-2 text-muted',
                )}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 break-words leading-tight hyphens-auto">{type.name}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-block">{error}</p>}
    </fieldset>
  );
}
