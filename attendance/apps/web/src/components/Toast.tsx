// Toast notifications (zrv-admin-feedback markup). One region per app, auto-dismiss after 4 s.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { OrvexaIcon } from './OrvexaIcon';
import { ToastContext, type ToastKind } from './toastContext';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-2), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="zat-toast-region" aria-live="polite">
        {items.map((toast) => (
          <div
            key={toast.id}
            className={`zrv-admin-feedback zrv-admin-feedback--${toast.kind}`}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <OrvexaIcon
              name={toast.kind === 'success' ? 'circle-check' : 'circle-alert'}
              className="zrv-admin-feedback__icon"
            />
            <div>
              <p>{toast.message}</p>
            </div>
            <button
              type="button"
              className="zrv-admin-link"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss message"
            >
              <OrvexaIcon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
