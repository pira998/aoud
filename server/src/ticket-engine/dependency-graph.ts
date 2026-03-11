import type { Ticket, BlockedTicket, DepTreeNode } from '../../../shared/ticket-types.js';

/**
 * Get tickets that are ready to work on:
 * - Status is 'open' (not started, not closed)
 * - All dependencies are 'closed'
 * - Sorted by priority (0=highest first), then by ID
 */
export function getReadyTickets(tickets: Ticket[]): Ticket[] {
  const statusMap = new Map(tickets.map(t => [t.id, t.status]));

  return tickets
    .filter(t => t.status === 'open')
    .filter(t => t.deps.every(depId => statusMap.get(depId) === 'closed'))
    .sort((a, b) => a.priority - b.priority || a.created.localeCompare(b.created));
}

/**
 * Get tickets that are blocked (have unresolved dependencies):
 * - Status is 'open' or 'in_progress'
 * - At least one dependency is not 'closed'
 * - Returns ticket + list of blocker IDs
 */
export function getBlockedTickets(tickets: Ticket[]): BlockedTicket[] {
  const statusMap = new Map(tickets.map(t => [t.id, t.status]));

  return tickets
    .filter(t => t.status !== 'closed')
    .map(t => ({
      ticket: t,
      blockers: t.deps.filter(depId => statusMap.get(depId) !== 'closed'),
    }))
    .filter(({ blockers }) => blockers.length > 0)
    .sort((a, b) => a.ticket.priority - b.ticket.priority);
}

/**
 * Build a dependency tree from a root ticket.
 * Uses iterative DFS with cycle detection.
 */
export function buildDepTree(rootId: string, tickets: Ticket[]): DepTreeNode {
  const ticketMap = new Map(tickets.map(t => [t.id, t]));

  function buildNode(id: string, visited: Set<string>): DepTreeNode {
    const ticket = ticketMap.get(id);

    if (!ticket) {
      return {
        id,
        status: 'open',
        title: `[missing: ${id}]`,
        children: [],
      };
    }

    // Cycle detection
    if (visited.has(id)) {
      return {
        id: ticket.id,
        status: ticket.status,
        title: ticket.title,
        children: [],
        isCycle: true,
      };
    }

    const newVisited = new Set(visited);
    newVisited.add(id);

    // Recursively build children (dependencies)
    const children = ticket.deps.map(depId => buildNode(depId, newVisited));

    // Sort children by depth (deepest subtree first) for cleaner display
    children.sort((a, b) => getTreeDepth(b) - getTreeDepth(a));

    return {
      id: ticket.id,
      status: ticket.status,
      title: ticket.title,
      children,
    };
  }

  return buildNode(rootId, new Set());
}

/**
 * Get the maximum depth of a tree node.
 */
function getTreeDepth(node: DepTreeNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getTreeDepth));
}

/**
 * Detect if adding a dependency would create a cycle.
 * Returns true if adding dep depId to ticketId would create a cycle.
 */
export function wouldCreateCycle(ticketId: string, depId: string, tickets: Ticket[]): boolean {
  // Check if depId depends (directly or transitively) on ticketId
  const ticketMap = new Map(tickets.map(t => [t.id, t]));
  const visited = new Set<string>();
  const stack = [depId];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current === ticketId) {
      return true; // Would create cycle
    }

    if (visited.has(current)) continue;
    visited.add(current);

    const ticket = ticketMap.get(current);
    if (ticket) {
      // Check what ticketId would look like with the new dep
      if (current === ticketId) {
        // This ticket would have depId as a dep
        stack.push(depId);
      }
      for (const dep of ticket.deps) {
        stack.push(dep);
      }
    }
  }

  return false;
}

/**
 * Get all children (direct and transitive) of a ticket.
 */
export function getChildTickets(parentId: string, tickets: Ticket[]): Ticket[] {
  const children: Ticket[] = [];
  const visited = new Set<string>();
  const stack = [parentId];

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    for (const t of tickets) {
      if (t.parent === currentId && !visited.has(t.id)) {
        children.push(t);
        stack.push(t.id);
      }
    }
  }

  return children;
}
