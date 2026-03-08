import fs from 'fs';
import path from 'path';
import { parseTicket, formatTicket, updateField } from './parser.js';
import { generateTicketId } from './id-generator.js';
import { resolveTicketId } from './resolver.js';
import { getReadyTickets, getBlockedTickets, buildDepTree, wouldCreateCycle } from './dependency-graph.js';
import type {
  Ticket,
  TicketStatus,
  TicketType,
  TicketPriority,
  BlockedTicket,
  DepTreeNode,
} from '../../../shared/ticket-types.js';
import { log } from '../logger.js';

const TICKETS_DIR = '.tickets';

/**
 * File-based ticket store.
 * Each ticket is stored as a markdown file: .tickets/<id>.md
 * Compatible with h2oai/tk file format.
 */
export class TicketStore {
  private ticketsDir: string;
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.ticketsDir = path.join(projectDir, TICKETS_DIR);
  }

  /**
   * Ensure .tickets directory exists.
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.ticketsDir)) {
      fs.mkdirSync(this.ticketsDir, { recursive: true });
    }
  }

  /**
   * Get the file path for a ticket.
   */
  private ticketPath(id: string): string {
    return path.join(this.ticketsDir, `${id}.md`);
  }

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Create a new ticket.
   */
  create(options: {
    title: string;
    body?: string;
    type?: TicketType;
    priority?: TicketPriority;
    deps?: string[];
    links?: string[];
    parent?: string;
    assignee?: string;
  }): Ticket {
    this.ensureDir();

    const existingIds = new Set(this.listIds());
    const id = generateTicketId(this.projectDir, existingIds);

    const ticket: Ticket = {
      id,
      status: 'open',
      deps: options.deps || [],
      links: options.links || [],
      created: new Date().toISOString(),
      type: options.type || 'task',
      priority: options.priority ?? 2,
      assignee: options.assignee,
      parent: options.parent,
      title: options.title,
      body: options.body || '',
    };

    // Atomic write: write to temp, then rename
    const content = formatTicket(ticket);
    const tmpPath = path.join(this.ticketsDir, `.tmp-${id}`);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, this.ticketPath(id));

    return ticket;
  }

  /**
   * Get a ticket by ID (supports partial matching).
   */
  get(idOrPartial: string): Ticket {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    return allTickets.find(t => t.id === resolvedId)!;
  }

  /**
   * List all tickets.
   */
  list(): Ticket[] {
    if (!fs.existsSync(this.ticketsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.ticketsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'));

    const tickets: Ticket[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(this.ticketsDir, file), 'utf-8');
        const ticket = parseTicket(content);
        tickets.push(ticket);
      } catch (err) {
        // Skip malformed tickets — graceful degradation
        log.warn('Tickets', `Skipping malformed ticket: ${file}`, err);
      }
    }

    return tickets;
  }

  /**
   * List all ticket IDs (fast — no parsing).
   */
  private listIds(): string[] {
    if (!fs.existsSync(this.ticketsDir)) {
      return [];
    }

    return fs.readdirSync(this.ticketsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))
      .map(f => f.replace('.md', ''));
  }

  /**
   * Update a ticket. Replaces the entire file.
   */
  update(ticket: Ticket): Ticket {
    this.ensureDir();

    const content = formatTicket(ticket);
    const tmpPath = path.join(this.ticketsDir, `.tmp-${ticket.id}`);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, this.ticketPath(ticket.id));

    return ticket;
  }

  /**
   * Update a single field atomically (preserves formatting).
   */
  updateStatus(id: string, status: TicketStatus): Ticket {
    const filePath = this.ticketPath(id);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Ticket ${id} not found`);
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    content = updateField(content, 'status', status);

    const tmpPath = path.join(this.ticketsDir, `.tmp-${id}`);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);

    return parseTicket(content);
  }

  /**
   * Delete a ticket.
   */
  delete(id: string): boolean {
    const filePath = this.ticketPath(id);
    if (!fs.existsSync(filePath)) {
      return false;
    }
    fs.unlinkSync(filePath);
    return true;
  }

  // ============================================
  // Status Transitions
  // ============================================

  /**
   * Start working on a ticket (open → in_progress).
   */
  start(idOrPartial: string): Ticket {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    return this.updateStatus(resolvedId, 'in_progress');
  }

  /**
   * Close a ticket (→ closed).
   */
  close(idOrPartial: string): Ticket {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    return this.updateStatus(resolvedId, 'closed');
  }

  /**
   * Reopen a ticket (closed → open).
   */
  reopen(idOrPartial: string): Ticket {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    return this.updateStatus(resolvedId, 'open');
  }

  // ============================================
  // Dependency Management
  // ============================================

  /**
   * Add a dependency: ticketId depends on depId.
   */
  addDep(ticketIdPartial: string, depIdPartial: string): Ticket {
    const allTickets = this.list();
    const ticketId = resolveTicketId(ticketIdPartial, allTickets);
    const depId = resolveTicketId(depIdPartial, allTickets);

    if (ticketId === depId) {
      throw new Error('A ticket cannot depend on itself');
    }

    if (wouldCreateCycle(ticketId, depId, allTickets)) {
      throw new Error(`Adding dependency would create a cycle: ${ticketId} → ${depId}`);
    }

    const ticket = allTickets.find(t => t.id === ticketId)!;
    if (ticket.deps.includes(depId)) {
      return ticket; // Already exists
    }

    ticket.deps.push(depId);
    return this.update(ticket);
  }

  /**
   * Remove a dependency.
   */
  removeDep(ticketIdPartial: string, depIdPartial: string): Ticket {
    const allTickets = this.list();
    const ticketId = resolveTicketId(ticketIdPartial, allTickets);
    const depId = resolveTicketId(depIdPartial, allTickets);

    const ticket = allTickets.find(t => t.id === ticketId)!;
    ticket.deps = ticket.deps.filter(d => d !== depId);
    return this.update(ticket);
  }

  // ============================================
  // Link Management
  // ============================================

  /**
   * Add a bidirectional link between two tickets.
   */
  addLink(id1Partial: string, id2Partial: string): [Ticket, Ticket] {
    const allTickets = this.list();
    const id1 = resolveTicketId(id1Partial, allTickets);
    const id2 = resolveTicketId(id2Partial, allTickets);

    if (id1 === id2) {
      throw new Error('A ticket cannot link to itself');
    }

    const ticket1 = allTickets.find(t => t.id === id1)!;
    const ticket2 = allTickets.find(t => t.id === id2)!;

    if (!ticket1.links.includes(id2)) {
      ticket1.links.push(id2);
      this.update(ticket1);
    }
    if (!ticket2.links.includes(id1)) {
      ticket2.links.push(id1);
      this.update(ticket2);
    }

    return [ticket1, ticket2];
  }

  /**
   * Remove a bidirectional link.
   */
  removeLink(id1Partial: string, id2Partial: string): [Ticket, Ticket] {
    const allTickets = this.list();
    const id1 = resolveTicketId(id1Partial, allTickets);
    const id2 = resolveTicketId(id2Partial, allTickets);

    const ticket1 = allTickets.find(t => t.id === id1)!;
    const ticket2 = allTickets.find(t => t.id === id2)!;

    ticket1.links = ticket1.links.filter(l => l !== id2);
    ticket2.links = ticket2.links.filter(l => l !== id1);

    this.update(ticket1);
    this.update(ticket2);

    return [ticket1, ticket2];
  }

  // ============================================
  // Notes
  // ============================================

  /**
   * Append a timestamped note to a ticket's body.
   */
  addNote(idOrPartial: string, note: string): Ticket {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    const ticket = allTickets.find(t => t.id === resolvedId)!;

    const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    const noteEntry = `\n\n**[${timestamp}]** ${note}`;

    ticket.body = (ticket.body || '') + noteEntry;
    return this.update(ticket);
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Get tickets ready to work on (all deps closed).
   */
  getReady(): Ticket[] {
    return getReadyTickets(this.list());
  }

  /**
   * Get blocked tickets with their blockers.
   */
  getBlocked(): BlockedTicket[] {
    return getBlockedTickets(this.list());
  }

  /**
   * Build a dependency tree from a root ticket.
   */
  getDepTree(idOrPartial: string): DepTreeNode {
    const allTickets = this.list();
    const resolvedId = resolveTicketId(idOrPartial, allTickets);
    return buildDepTree(resolvedId, allTickets);
  }

  /**
   * Get the project directory path.
   */
  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Check if the .tickets directory exists.
   */
  hasTicketsDir(): boolean {
    return fs.existsSync(this.ticketsDir);
  }
}
