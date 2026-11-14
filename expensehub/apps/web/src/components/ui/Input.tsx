import type { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../../lib/cn';
import { inputClasses } from './styles';

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(inputClasses, className)} {...props} />;
}
