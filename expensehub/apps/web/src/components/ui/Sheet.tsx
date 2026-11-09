// Bottom sheet (mobile "More" menu) on Radix Dialog: focus trap, Esc and scroll lock built in.
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 motion-safe:animate-sheet-up max-h-[85dvh] overflow-y-auto rounded-t-[20px] border-t border-border bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-raised"
          aria-describedby={undefined}
        >
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={t('common.close')}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
