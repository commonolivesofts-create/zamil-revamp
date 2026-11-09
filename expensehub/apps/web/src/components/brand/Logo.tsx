// Placeholder brand mark until the ZPI logo arrives (OQ-34).
import { ReceiptText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

/** full = mark + name · mark = icon only · responsive = name from lg up (sidebar rail). */
export function Logo({
  variant = 'full',
  inverse = false,
}: {
  variant?: 'full' | 'mark' | 'responsive';
  inverse?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-input bg-brand-solid text-brand-fg shadow-card">
        <ReceiptText aria-hidden className="size-[18px]" strokeWidth={2} />
      </span>
      {variant !== 'mark' && (
        <span
          className={cn(
            'flex-col leading-none',
            variant === 'responsive' ? 'hidden lg:flex' : 'flex',
          )}
        >
          <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
          <span className={cn('mt-0.5 text-[11px]', inverse ? 'text-hero-muted' : 'text-muted')}>
            {t('app.company')}
          </span>
        </span>
      )}
    </div>
  );
}
