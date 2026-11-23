// Modal dialog and form field (markup and behaviour of client AdminUi Dialog / Field): focus moves
// in, Tab stays inside, Escape and the backdrop close it unless busy, focus returns on close.
import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  title,
  description,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // Latest values for the native listeners below.
  const state = useRef({ busy, onClose });
  useEffect(() => {
    state.current = { busy, onClose };
  }, [busy, onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const target =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(FOCUSABLE) ??
      node;
    target?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  // Native listeners: Escape / Tab trap on the dialog, pointer close on the backdrop
  // (keyboard users close with Escape).
  useEffect(() => {
    const dialog = ref.current;
    const backdrop = backdropRef.current;
    if (!dialog || !backdrop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!state.current.busy) state.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.target === backdrop && !state.current.busy) state.current.onClose();
    };
    dialog.addEventListener('keydown', onKeyDown);
    backdrop.addEventListener('mousedown', onMouseDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      backdrop.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  return (
    <div ref={backdropRef} className="zrv-dialog-backdrop">
      <div
        ref={ref}
        className={`zrv-dialog${wide ? ' zrv-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {description && (
          <p id={descriptionId} className="zrv-dialog__description">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field zrv-admin-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <small id={`${id}-hint`} className="zrv-admin-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="zrv-auth-field-error">
          {error}
        </small>
      )}
    </div>
  );
}
