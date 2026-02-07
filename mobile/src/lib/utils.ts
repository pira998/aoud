/**
 * Simple utility function to merge CSS classes
 * Filters out falsy values and joins with spaces
 */
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
