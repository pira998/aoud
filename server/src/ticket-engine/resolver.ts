import type { Ticket } from '../../../shared/ticket-types.js';

/**
 * Resolve a partial ticket ID to a full ID.
 * Supports:
 * - Exact match: "cmb-a3f2" → "cmb-a3f2"
 * - Partial match: "a3f2" → "cmb-a3f2"
 * - Prefix match: "cmb-a" → "cmb-a3f2" (if unique)
 *
 * Throws if:
 * - No match found
 * - Multiple matches found (ambiguous)
 */
export function resolveTicketId(partialId: string, tickets: Ticket[]): string {
  // Try exact match first
  const exact = tickets.find(t => t.id === partialId);
  if (exact) return exact.id;

  // Try partial matching (substring)
  const matches = tickets.filter(t => t.id.includes(partialId));

  if (matches.length === 0) {
    throw new TicketNotFoundError(partialId);
  }

  if (matches.length > 1) {
    throw new TicketAmbiguousError(partialId, matches.map(t => t.id));
  }

  return matches[0].id;
}

/**
 * Resolve a partial ID, returning null instead of throwing.
 */
export function tryResolveTicketId(partialId: string, tickets: Ticket[]): string | null {
  try {
    return resolveTicketId(partialId, tickets);
  } catch {
    return null;
  }
}

export class TicketNotFoundError extends Error {
  constructor(public readonly partialId: string) {
    super(`No ticket found matching "${partialId}"`);
    this.name = 'TicketNotFoundError';
  }
}

export class TicketAmbiguousError extends Error {
  constructor(
    public readonly partialId: string,
    public readonly matchingIds: string[]
  ) {
    super(`Ambiguous ID "${partialId}" matches: ${matchingIds.join(', ')}`);
    this.name = 'TicketAmbiguousError';
  }
}
