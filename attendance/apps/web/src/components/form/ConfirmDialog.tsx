// Confirmation for destructive actions (client AdminUi ConfirmDialog markup).
import { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { Dialog } from '../Dialog';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };
  return (
    <Dialog title={title} description={description} onClose={onClose} busy={pending}>
      {error && (
        <p className="zrv-admin-feedback zrv-admin-feedback--error" role="alert">
          {error}
        </p>
      )}
      <div className="zrv-dialog__actions">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn-primary${danger ? ' zrv-admin-danger' : ''}`}
          onClick={() => void confirm()}
          disabled={pending}
          data-autofocus
        >
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
