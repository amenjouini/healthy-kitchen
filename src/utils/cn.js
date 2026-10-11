import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names (later classes win). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
