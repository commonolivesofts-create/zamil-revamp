// UI-UX §5.3 / §6 Drawer: slides in from the end side, 560 px (full screen on mobile).
// Radix Dialog gives focus trap, Esc, scroll lock and aria wiring.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
        <Dialog.Content className="fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-border bg-surface text-ink shadow-raised outline-none motion-safe:animate-drawer-in sm:max-w-[560px]">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={t('common.close')}
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
