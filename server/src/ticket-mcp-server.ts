import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { TicketStore } from './ticket-engine/index.js';
import type { TicketServerMessage, TicketPriority } from '../../shared/ticket-types.js';

export function createTicketMcpServer(
  ticketStore: TicketStore,
  onTicketChange: (message: TicketServerMessage) => void
) {
  const broadcastTicketList = () => {
    const tickets = ticketStore.list();
    const readyTickets = ticketStore.getReady();
    const blockedTickets = ticketStore.getBlocked();
    onTicketChange({
      type: 'ticket_list_response',
      tickets,
      readyTickets,
      blockedTickets
    });
  };

  return createSdkMcpServer({
    name: 'ticket-manager',
    version: '1.0.0',
    tools: [
      tool(
        'ticket_write',
        `Manage project tickets (create, update, start, close, reopen, delete, add dependencies, add notes, list).

This tool manages a graph-based ticket tracking system stored as markdown files with YAML frontmatter in .tickets/*.md.

Use this tool proactively to track work items, bugs, features, and tasks.

ACTIONS:
- "create": Create a new ticket. Requires: title. Optional: body, type, priority, deps, assignee.
- "update": Update an existing ticket. Requires: ticketId. Optional: title, body, type, priority, assignee.
- "start": Mark a ticket as in_progress. Requires: ticketId.
- "close": Mark a ticket as closed. Requires: ticketId.
- "reopen": Reopen a closed ticket. Requires: ticketId.
- "delete": Delete a ticket. Requires: ticketId.
- "add_dep": Add a dependency to a ticket. Requires: ticketId, depId.
- "remove_dep": Remove a dependency from a ticket. Requires: ticketId, depId.
- "add_note": Add a note to a ticket. Requires: ticketId, note.
- "list": List all tickets. Returns an array of all tickets.

TICKET TYPES:
- "feature": A new feature request
- "bug": A bug fix
- "task": A general task
- "chore": Maintenance work
- "epic": Large feature spanning multiple tickets

PRIORITY (0-4):
- 0: Critical (urgent fixes, blockers)
- 1: High (important features, significant bugs)
- 2: Medium (normal priority, default)
- 3: Low (nice to have)
- 4: Backlog (future consideration)

STATUSES:
- "open": Newly created, not started
- "in_progress": Currently being worked on
- "closed": Completed or resolved

DEPENDENCIES:
- Use "deps" when creating or "add_dep" action to specify ticket dependencies
- Dependencies create a directed graph of ticket relationships
- A ticket is blocked by its dependencies (must wait for them to complete)

EXAMPLES:
1. Create a feature ticket:
   action: "create", title: "Add dark mode", type: "feature", priority: 1

2. Start working on a ticket:
   action: "start", ticketId: "T-001"

3. Add a note:
   action: "add_note", ticketId: "T-001", note: "Implemented toggle component"

4. Close a ticket:
   action: "close", ticketId: "T-001"

5. Create a dependent ticket:
   action: "create", title: "Add theme tests", type: "task", deps: ["T-001"]

6. List all tickets:
   action: "list"`,
        {
          action: z.enum(['create', 'update', 'start', 'close', 'reopen', 'delete', 'add_dep', 'remove_dep', 'add_note', 'list']),
          title: z.string().optional(),
          body: z.string().optional(),
          ticketId: z.string().optional(),
          type: z.enum(['feature', 'bug', 'task', 'chore', 'epic']).optional(),
          priority: z.number().min(0).max(4).optional(),
          assignee: z.string().optional(),
          deps: z.array(z.string()).optional(),
          depId: z.string().optional(),
          note: z.string().optional(),
        },
        async (args) => {
          switch (args.action) {
            case 'create': {
              if (!args.title) {
                return { content: [{ type: 'text', text: 'Error: title is required for create action' }] };
              }
              const ticket = ticketStore.create({
                title: args.title,
                body: args.body,
                type: args.type || 'task',
                priority: (args.priority ?? 2) as TicketPriority,
                assignee: args.assignee,
                deps: args.deps || [],
              });
              onTicketChange({ type: 'ticket_created', ticket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Created ticket ${ticket.id}: ${ticket.title}\nStatus: ${ticket.status}\nPriority: ${ticket.priority}\nType: ${ticket.type}`
                }]
              };
            }

            case 'update': {
              if (!args.ticketId) {
                return { content: [{ type: 'text', text: 'Error: ticketId is required for update action' }] };
              }
              const existing = ticketStore.get(args.ticketId);
              if (!existing) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              if (args.title !== undefined) existing.title = args.title;
              if (args.body !== undefined) existing.body = args.body;
              if (args.type !== undefined) existing.type = args.type;
              if (args.priority !== undefined) existing.priority = args.priority as TicketPriority;
              if (args.assignee !== undefined) existing.assignee = args.assignee;

              ticketStore.update(existing);
              onTicketChange({ type: 'ticket_updated', ticket: existing });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Updated ticket ${existing.id}: ${existing.title}`
                }]
              };
            }

            case 'start': {
              if (!args.ticketId) {
                return { content: [{ type: 'text', text: 'Error: ticketId is required for start action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              ticket.status = 'in_progress';
              ticketStore.update(ticket);
              onTicketChange({ type: 'ticket_updated', ticket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Started ticket ${ticket.id}: ${ticket.title}`
                }]
              };
            }

            case 'close': {
              if (!args.ticketId) {
                return { content: [{ type: 'text', text: 'Error: ticketId is required for close action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              ticket.status = 'closed';
              ticketStore.update(ticket);
              onTicketChange({ type: 'ticket_updated', ticket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Closed ticket ${ticket.id}: ${ticket.title}`
                }]
              };
            }

            case 'reopen': {
              if (!args.ticketId) {
                return { content: [{ type: 'text', text: 'Error: ticketId is required for reopen action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              ticket.status = 'open';
              ticketStore.update(ticket);
              onTicketChange({ type: 'ticket_updated', ticket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Reopened ticket ${ticket.id}: ${ticket.title}`
                }]
              };
            }

            case 'delete': {
              if (!args.ticketId) {
                return { content: [{ type: 'text', text: 'Error: ticketId is required for delete action' }] };
              }
              ticketStore.delete(args.ticketId);
              onTicketChange({ type: 'ticket_deleted', ticketId: args.ticketId });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Deleted ticket ${args.ticketId}`
                }]
              };
            }

            case 'add_dep': {
              if (!args.ticketId || !args.depId) {
                return { content: [{ type: 'text', text: 'Error: ticketId and depId are required for add_dep action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              const depTicket = ticketStore.get(args.depId);
              if (!depTicket) {
                return { content: [{ type: 'text', text: `Error: Dependency ticket ${args.depId} not found` }] };
              }
              if (!ticket.deps.includes(args.depId)) {
                ticket.deps.push(args.depId);
                ticketStore.update(ticket);
                onTicketChange({ type: 'ticket_updated', ticket });
                broadcastTicketList();
              }
              return {
                content: [{
                  type: 'text',
                  text: `Added dependency ${args.depId} to ticket ${args.ticketId}`
                }]
              };
            }

            case 'remove_dep': {
              if (!args.ticketId || !args.depId) {
                return { content: [{ type: 'text', text: 'Error: ticketId and depId are required for remove_dep action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              ticket.deps = ticket.deps.filter(id => id !== args.depId);
              ticketStore.update(ticket);
              onTicketChange({ type: 'ticket_updated', ticket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Removed dependency ${args.depId} from ticket ${args.ticketId}`
                }]
              };
            }

            case 'add_note': {
              if (!args.ticketId || !args.note) {
                return { content: [{ type: 'text', text: 'Error: ticketId and note are required for add_note action' }] };
              }
              const ticket = ticketStore.get(args.ticketId);
              if (!ticket) {
                return { content: [{ type: 'text', text: `Error: Ticket ${args.ticketId} not found` }] };
              }
              ticketStore.addNote(args.ticketId, args.note);
              const updatedTicket = ticketStore.get(args.ticketId)!;
              onTicketChange({ type: 'ticket_updated', ticket: updatedTicket });
              broadcastTicketList();
              return {
                content: [{
                  type: 'text',
                  text: `Added note to ticket ${args.ticketId}`
                }]
              };
            }

            case 'list': {
              const tickets = ticketStore.list();
              const ticketSummary = tickets.map(t =>
                `${t.id}: [${t.status}] ${t.title} (${t.type}, priority: ${t.priority})`
              ).join('\n');
              return {
                content: [{
                  type: 'text',
                  text: tickets.length > 0
                    ? `Total tickets: ${tickets.length}\n\n${ticketSummary}`
                    : 'No tickets found'
                }]
              };
            }

            default:
              return { content: [{ type: 'text', text: `Error: Unknown action ${args.action}` }] };
          }
        }
      )
    ]
  });
}
