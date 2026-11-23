import { createContext, useContext, useMemo } from 'react';

export type ToastKind = 'success' | 'error';

export const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(
  null,
);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return useMemo(
    () => ({
      success: (message: string) => show('success', message),
      error: (message: string) => show('error', message),
    }),
    [show],
  );
}
