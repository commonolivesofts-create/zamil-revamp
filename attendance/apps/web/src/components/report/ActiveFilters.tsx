// CI3 renderActiveFilterPills: one removable chip per applied filter, plus "Clear All" (= Reset).
import { formatIsoDate } from '../../lib/format';
import { OrvexaIcon } from '../OrvexaIcon';
import type { FilterField, FilterValues } from './types';

function chipValue<F extends FilterValues>(field: FilterField<F>, value: string): string {
  if (field.type === 'select') return field.options?.find((o) => o.value === value)?.label ?? value;
  if (field.type === 'date') return formatIsoDate(value);
  return value;
}

export function ActiveFilters<F extends FilterValues>({
  fields,
  applied,
  onRemove,
  onClearAll,
}: {
  fields: readonly FilterField<F>[];
  applied: F;
  onRemove: (key: keyof F & string) => void;
  onClearAll: () => void;
}) {
  const active = fields.filter((field) => String(applied[field.key] ?? '').trim() !== '');
  if (active.length === 0) return null;
  return (
    <div className="zat-active-filters" role="group" aria-label="Active filters">
      <span className="zat-active-filters__title">Active Filters</span>
      {active.map((field) => (
        <span key={field.key} className="zat-chip">
          <span className="zat-chip__label">{field.label}</span>
          <span className="zat-chip__value">{chipValue(field, String(applied[field.key]))}</span>
          <button
            type="button"
            className="zat-chip__remove"
            aria-label={`Remove ${field.label} filter`}
            onClick={() => onRemove(field.key)}
          >
            <OrvexaIcon name="x" size={13} />
          </button>
        </span>
      ))}
      <button type="button" className="zat-active-filters__clear" onClick={onClearAll}>
        Clear All
      </button>
    </div>
  );
}
