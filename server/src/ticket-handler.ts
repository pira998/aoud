import { WebSocket } from 'ws';
import { TicketStore } from './ticket-engine/index.js';
import type {
  TicketClientMessage,
  TicketServerMessage,
  TicketListMessage,
  TicketCreatedMessage,
  TicketUpdatedMessage,
  TicketDeletedMessage,
  TicketDepTreeMessage,
  TicketErrorMessage,
} from '../../shared/ticket-types.js';

// Cache of TicketStore instances per project path
const ticketStores = new Map<string, TicketStore>();

/**
 * Get or create a TicketStore for a project directory.
 */
function getStore(projectDir: string): TicketStore {
  if (!projectDir) {
    throw new Error('No project directory specified');
  }

  let store = ticketStores.get(projectDir);
  if (!store) {
    store = new TicketStore(projectDir);
    ticketStores.set(projectDir, store);
  }
  return store;
}

/**
 * Send a ticket message to a specific client.
 */
function sendTicketMessage(ws: WebSocket, message: TicketServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send a ticket error response.
 */
function sendTicketError(ws: WebSocket, error: string, requestType: string): void {
  sendTicketMessage(ws, {
    type: 'ticket_error',
    error,
    requestType,
  });
}

/**
 * Build and send the full ticket list response (tickets + ready + blocked).
 */
function sendTicketList(ws: WebSocket, store: TicketStore): void {
  const tickets = store.list();
  const readyTickets = store.getReady();
  const blockedTickets = store.getBlocked();

  sendTicketMessage(ws, {
    type: 'ticket_list_response',
    tickets,
    readyTickets,
    blockedTickets,
  });
}

/**
 * Handle all ticket-related WebSocket messages.
 * Returns true if the message was handled, false otherwise.
 */
export async function handleTicketMessage(
  ws: WebSocket,
  message: any,
  projectDir: string,
  broadcast: (msg: TicketServerMessage) => void
): Promise<boolean> {
  const type = message.type;

  // Check if this is a ticket message
  if (!type || !type.startsWith('ticket_')) {
    return false;
  }

  try {
    const store = getStore(projectDir);

    switch (type) {
      case 'ticket_list': {
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_create': {
        const ticket = store.create({
          title: message.title,
          body: message.body,
          type: message.ticketType,
          priority: message.priority,
          deps: message.deps,
          links: message.links,
          parent: message.parent,
          assignee: message.assignee,
        });

        const createdMsg: TicketCreatedMessage = {
          type: 'ticket_created',
          ticket,
        };

        // Broadcast to all clients
        broadcast(createdMsg);

        // Also send updated list to requesting client
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_update': {
        const allTickets = store.list();
        const existing = allTickets.find(t => t.id === message.ticketId);
        if (!existing) {
          sendTicketError(ws, `Ticket ${message.ticketId} not found`, type);
          break;
        }

        // Apply updates
        if (message.status !== undefined) existing.status = message.status;
        if (message.priority !== undefined) existing.priority = message.priority;
        if (message.title !== undefined) existing.title = message.title;
        if (message.body !== undefined) existing.body = message.body;
        if (message.ticketType !== undefined) existing.type = message.ticketType;
        if (message.assignee !== undefined) existing.assignee = message.assignee;

        const updated = store.update(existing);

        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket: updated,
        };

        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_delete': {
        const deleted = store.delete(message.ticketId);
        if (!deleted) {
          sendTicketError(ws, `Ticket ${message.ticketId} not found`, type);
          break;
        }

        const deletedMsg: TicketDeletedMessage = {
          type: 'ticket_deleted',
          ticketId: message.ticketId,
        };

        broadcast(deletedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_start': {
        const ticket = store.start(message.ticketId);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_close': {
        const ticket = store.close(message.ticketId);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_reopen': {
        const ticket = store.reopen(message.ticketId);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_add_dep': {
        const ticket = store.addDep(message.ticketId, message.depId);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_remove_dep': {
        const ticket = store.removeDep(message.ticketId, message.depId);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_add_link': {
        const [t1, t2] = store.addLink(message.ticketId, message.linkId);
        broadcast({ type: 'ticket_updated', ticket: t1 });
        broadcast({ type: 'ticket_updated', ticket: t2 });
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_remove_link': {
        const [t1, t2] = store.removeLink(message.ticketId, message.linkId);
        broadcast({ type: 'ticket_updated', ticket: t1 });
        broadcast({ type: 'ticket_updated', ticket: t2 });
        sendTicketList(ws, store);
        break;
      }

      case 'ticket_add_note': {
        const ticket = store.addNote(message.ticketId, message.note);
        const updatedMsg: TicketUpdatedMessage = {
          type: 'ticket_updated',
          ticket,
        };
        broadcast(updatedMsg);
        break;
      }

      case 'ticket_dep_tree': {
        const tree = store.getDepTree(message.ticketId);
        const treeMsg: TicketDepTreeMessage = {
          type: 'ticket_dep_tree_response',
          rootId: message.ticketId,
          tree,
        };
        sendTicketMessage(ws, treeMsg);
        break;
      }

      default:
        return false;
    }

    return true;
  } catch (error: any) {
    sendTicketError(ws, error.message || 'Unknown error', type);
    return true;
  }
}

/**
 * Clear cached store for a project (useful when project changes).
 */
export function clearTicketStoreCache(projectDir?: string): void {
  if (projectDir) {
    ticketStores.delete(projectDir);
  } else {
    ticketStores.clear();
  }
}
