import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our token names so e.g. `text-display` is not mistaken for a colour.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title'],
      radius: ['card', 'input', 'pill'],
      shadow: ['card', 'raised'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
