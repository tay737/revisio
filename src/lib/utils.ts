import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merge. The one helper every component reaches for. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
