// UI-UX §6 ReasonModal: reject / request information / reply — the text is mandatory (FR-APR-04).
import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  body,
  label,
  confirmLabel,
  tone = 'primary',
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: string;
  label: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  onConfirm: (text: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setTouched(false);
    }
  }, [open]);

  const missing = text.trim() === '';
  const submit = () => {
    setTouched(true);
    if (!missing) onConfirm(text.trim());
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
        <Dialog.Content className="fixed inset-x-4 top-[15vh] z-[60] mx-auto max-w-md rounded-card border border-border bg-surface p-6 text-ink shadow-raised motion-safe:animate-pop">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {body ? (
            <Dialog.Description className="mt-1.5 text-sm text-muted">{body}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <form
            className="mt-4 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor={id} className="text-sm font-medium">
              {label}
            </label>
            <textarea
              id={id}
              rows={4}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={touched && missing ? true : undefined}
              aria-describedby={touched && missing ? `${id}-error` : undefined}
              className="w-full rounded-input border border-border bg-surface px-3 py-2 text-sm shadow-card focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 aria-[invalid=true]:border-block"
            />
            {touched && missing && (
              <p id={`${id}-error`} className="text-xs font-medium text-block">
                {t('reports.reasonRequired')}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Dialog.Close asChild>
                <Button variant="ghost">{t('setup.cancel')}</Button>
              </Dialog.Close>
              <Button type="submit" variant={tone} loading={pending}>
                {confirmLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
