/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID() in secure contexts (https:// or localhost),
 * falls back to a polyfill for non-secure contexts (e.g., http://192.168.x.x)
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available (secure context)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: polyfill for non-secure contexts
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
