// Edit / delete icon buttons for a table row (CI3: ti-edit / ti-trash).
import { OrvexaIcon } from './OrvexaIcon';

export function RowActions({
  label,
  onEdit,
  onDelete,
}: {
  /** What the row is, for screen readers, e.g. "shift Morning". */
  label: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <span className="zat-row-actions">
      {onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Edit ${label}`} title="Edit">
          <OrvexaIcon name="pencil" size={15} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="is-danger"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
          title="Delete"
        >
          <OrvexaIcon name="trash-2" size={15} />
        </button>
      )}
    </span>
  );
}
