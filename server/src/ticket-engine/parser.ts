import YAML from 'yaml';
import type { Ticket, TicketStatus, TicketType, TicketPriority } from '../../../shared/ticket-types.js';

/**
 * Parse a ticket markdown file (YAML frontmatter + markdown body).
 *
 * Expected format:
 * ---
 * id: cmb-a3f2
 * status: open
 * deps: [dep-id-1, dep-id-2]
 * ...
 * ---
 * # Ticket Title
 *
 * Ticket body text...
 */
export function parseTicket(content: string): Ticket {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid ticket format: missing YAML frontmatter');
  }

  const frontmatter = YAML.parse(match[1]);
  const markdownBody = match[2].trim();

  // Extract title from first heading
  const titleMatch = markdownBody.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const body = markdownBody.replace(/^#\s+.+\n*/, '').trim();

  return {
    id: frontmatter.id || '',
    status: (frontmatter.status || 'open') as TicketStatus,
    deps: Array.isArray(frontmatter.deps) ? frontmatter.deps : [],
    links: Array.isArray(frontmatter.links) ? frontmatter.links : [],
    created: frontmatter.created || new Date().toISOString(),
    type: (frontmatter.type || 'task') as TicketType,
    priority: (typeof frontmatter.priority === 'number' ? frontmatter.priority : 2) as TicketPriority,
    assignee: frontmatter.assignee || undefined,
    externalRef: frontmatter['external-ref'] || undefined,
    parent: frontmatter.parent || undefined,
    title,
    body,
  };
}

/**
 * Format a Ticket object into a markdown file with YAML frontmatter.
 */
export function formatTicket(ticket: Ticket): string {
  // Build frontmatter object — only include non-empty/non-default fields
  const fm: Record<string, unknown> = {
    id: ticket.id,
    status: ticket.status,
  };

  // Use flow-style arrays (like tk does)
  if (ticket.deps.length > 0) {
    fm.deps = ticket.deps;
  }
  if (ticket.links.length > 0) {
    fm.links = ticket.links;
  }

  fm.created = ticket.created;
  fm.type = ticket.type;
  fm.priority = ticket.priority;

  if (ticket.assignee) {
    fm.assignee = ticket.assignee;
  }
  if (ticket.externalRef) {
    fm['external-ref'] = ticket.externalRef;
  }
  if (ticket.parent) {
    fm.parent = ticket.parent;
  }

  const yamlStr = YAML.stringify(fm, {
    flowCollectionPadding: true,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
  }).trim();

  const parts = [`---`, yamlStr, `---`, `# ${ticket.title}`, ''];
  if (ticket.body) {
    parts.push(ticket.body);
  }
  parts.push(''); // trailing newline

  return parts.join('\n');
}

/**
 * Update a single field in the raw file content without re-formatting everything.
 * This preserves notes and custom formatting in the body.
 */
export function updateField(content: string, field: string, value: string): string {
  const regex = new RegExp(`^${field}:\\s*.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${field}: ${value}`);
  }
  // If field doesn't exist, add it before the closing ---
  return content.replace(/^---$/m, `${field}: ${value}\n---`);
}
