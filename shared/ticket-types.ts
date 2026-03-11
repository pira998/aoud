// Shared ticket types between server and mobile client
// Inspired by h2oai/tk - graph-based ticket tracker for AI agents

// ============================================
// Core Ticket Types
// ============================================

export type TicketStatus = 'open' | 'in_progress' | 'closed';
export type TicketType = 'bug' | 'feature' | 'task' | 'epic' | 'chore';
export type TicketPriority = 0 | 1 | 2 | 3 | 4;

export interface Ticket {
  id: string;
  status: TicketStatus;
  deps: string[];           // IDs of tickets that block this one
  links: string[];           // Bidirectional related tickets
  created: string;           // ISO 8601
  type: TicketType;
  priority: TicketPriority;  // 0=critical, 1=high, 2=medium, 3=low, 4=backlog
  assignee?: string;
  externalRef?: string;      // e.g., gh-123
  parent?: string;           // Parent ticket ID
  title: string;
  body: string;
}

export interface BlockedTicket {
  ticket: Ticket;
  blockers: string[];        // IDs of unresolved blocking tickets
}

export interface DepTreeNode {
  id: string;
  status: TicketStatus;
  title: string;
  children: DepTreeNode[];
  isCycle?: boolean;
}

// ============================================
// Priority helpers
// ============================================

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low',
  4: 'Backlog',
};

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  0: 'red',
  1: 'orange',
  2: 'yellow',
  3: 'blue',
  4: 'gray',
};

export const TYPE_LABELS: Record<TicketType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  task: 'Task',
  epic: 'Epic',
  chore: 'Chore',
};

// ============================================
// Mobile → Server Messages
// ============================================

export interface TicketListRequest {
  type: 'ticket_list';
}

export interface TicketCreateRequest {
  type: 'ticket_create';
  title: string;
  body?: string;
  ticketType?: TicketType;
  priority?: TicketPriority;
  deps?: string[];
  links?: string[];
  parent?: string;
  assignee?: string;
}

export interface TicketUpdateRequest {
  type: 'ticket_update';
  ticketId: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  title?: string;
  body?: string;
  ticketType?: TicketType;
  assignee?: string;
}

export interface TicketDeleteRequest {
  type: 'ticket_delete';
  ticketId: string;
}

export interface TicketStartRequest {
  type: 'ticket_start';
  ticketId: string;
}

export interface TicketCloseRequest {
  type: 'ticket_close';
  ticketId: string;
}

export interface TicketReopenRequest {
  type: 'ticket_reopen';
  ticketId: string;
}

export interface TicketAddDepRequest {
  type: 'ticket_add_dep';
  ticketId: string;
  depId: string;
}

export interface TicketRemoveDepRequest {
  type: 'ticket_remove_dep';
  ticketId: string;
  depId: string;
}

export interface TicketAddLinkRequest {
  type: 'ticket_add_link';
  ticketId: string;
  linkId: string;
}

export interface TicketRemoveLinkRequest {
  type: 'ticket_remove_link';
  ticketId: string;
  linkId: string;
}

export interface TicketAddNoteRequest {
  type: 'ticket_add_note';
  ticketId: string;
  note: string;
}

export interface TicketGetDepTreeRequest {
  type: 'ticket_dep_tree';
  ticketId: string;
}

export type TicketClientMessage =
  | TicketListRequest
  | TicketCreateRequest
  | TicketUpdateRequest
  | TicketDeleteRequest
  | TicketStartRequest
  | TicketCloseRequest
  | TicketReopenRequest
  | TicketAddDepRequest
  | TicketRemoveDepRequest
  | TicketAddLinkRequest
  | TicketRemoveLinkRequest
  | TicketAddNoteRequest
  | TicketGetDepTreeRequest;

// ============================================
// Server → Mobile Messages
// ============================================

export interface TicketListMessage {
  type: 'ticket_list_response';
  tickets: Ticket[];
  readyTickets: Ticket[];
  blockedTickets: BlockedTicket[];
}

export interface TicketCreatedMessage {
  type: 'ticket_created';
  ticket: Ticket;
}

export interface TicketUpdatedMessage {
  type: 'ticket_updated';
  ticket: Ticket;
}

export interface TicketDeletedMessage {
  type: 'ticket_deleted';
  ticketId: string;
}

export interface TicketDepTreeMessage {
  type: 'ticket_dep_tree_response';
  rootId: string;
  tree: DepTreeNode;
}

export interface TicketErrorMessage {
  type: 'ticket_error';
  error: string;
  requestType: string;
}

export type TicketServerMessage =
  | TicketListMessage
  | TicketCreatedMessage
  | TicketUpdatedMessage
  | TicketDeletedMessage
  | TicketDepTreeMessage
  | TicketErrorMessage;
