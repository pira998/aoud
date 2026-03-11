import path from 'path';
import { nanoid } from 'nanoid';
import fs from 'fs';

/**
 * Generate a project prefix from the directory name.
 * e.g., "aoud" → "ao"
 *       "my-project" → "mp"
 *       "toolkit" → "to"
 */
function generatePrefix(dirPath: string): string {
  const dirName = path.basename(dirPath);

  // Split on hyphens, underscores, and dots
  const segments = dirName.split(/[-_.]/);

  // Take first letter of each segment
  let prefix = segments
    .map((s) => {
      const match = s.match(/[a-zA-Z0-9]/);
      return match ? match[0] : '';
    })
    .filter(Boolean)
    .join('');

  // If no valid segments, take first 2-3 chars
  if (!prefix || prefix.length < 2) {
    prefix = dirName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
  }

  // Keep prefix 2-3 chars
  if (prefix.length > 3) {
    prefix = prefix.slice(0, 3);
  }

  return prefix.toLowerCase();
}

/**
 * Generate a unique ticket ID.
 * Format: <prefix>-<nanoid4>
 * e.g., "cmb-a3f2"
 */
export function generateTicketId(projectDir: string, existingIds: Set<string>): string {
  const prefix = generatePrefix(projectDir);
  let id: string;
  let attempts = 0;

  // Generate IDs until we find a unique one (collision is extremely unlikely)
  do {
    const suffix = nanoid(4).toLowerCase();
    id = `${prefix}-${suffix}`;
    attempts++;

    // Safety valve — should never happen with 36^4 = 1.6M combos
    if (attempts > 100) {
      throw new Error('Failed to generate unique ticket ID after 100 attempts');
    }
  } while (existingIds.has(id));

  return id;
}

/**
 * Get the project directory prefix for display.
 */
export function getProjectPrefix(projectDir: string): string {
  return generatePrefix(projectDir);
}
