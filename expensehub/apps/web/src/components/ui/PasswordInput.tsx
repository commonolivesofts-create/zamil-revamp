import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { inputClasses } from './styles';

export function PasswordInput({
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { ref?: Ref<HTMLInputElement> }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(inputClasses, 'pe-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-input text-muted transition-colors hover:text-ink"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}
