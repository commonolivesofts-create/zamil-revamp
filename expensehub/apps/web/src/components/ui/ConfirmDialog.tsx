// UI-UX §7: destructive actions need confirmation.
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
  tone = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: 'danger' | 'primary';
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
        <Dialog.Content className="fixed inset-x-4 top-[20vh] z-50 mx-auto max-w-md rounded-card border border-border bg-surface p-6 text-ink shadow-raised motion-safe:animate-pop">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {body ? (
            <Dialog.Description className="mt-2 text-sm text-muted">{body}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">{t('setup.cancel')}</Button>
            </Dialog.Close>
            <Button variant={tone} loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
