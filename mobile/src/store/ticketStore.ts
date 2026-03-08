import { create } from 'zustand';
import type {
  Ticket,
  TicketStatus,
  TicketType,
  TicketPriority,
  BlockedTicket,
  DepTreeNode,
} from '../../../shared/ticket-types';

interface TicketStore {
  // Data
  tickets: Ticket[];
  readyTickets: Ticket[];
  blockedTickets: BlockedTicket[];
  depTree: DepTreeNode | null;
  depTreeRootId: string | null;

  // UI State
  selectedTicketId: string | null;
  ticketSubView: 'board' | 'ready' | 'graph';
  createDialogOpen: boolean;
  detailDialogOpen: boolean;
  filterStatus: TicketStatus | 'all';
  filterType: TicketType | 'all';
  filterPriority: TicketPriority | 'all';
  isLoading: boolean;
  error: string | null;

  // Actions - Data
  setTickets: (tickets: Ticket[], ready: Ticket[], blocked: BlockedTicket[]) => void;
  addTicket: (ticket: Ticket) => void;
  updateTicket: (ticket: Ticket) => void;
  removeTicket: (ticketId: string) => void;
  setDepTree: (rootId: string, tree: DepTreeNode) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;

  // Actions - UI
  selectTicket: (ticketId: string | null) => void;
  setSubView: (view: 'board' | 'ready' | 'graph') => void;
  setCreateDialogOpen: (open: boolean) => void;
  setDetailDialogOpen: (open: boolean) => void;
  setFilterStatus: (status: TicketStatus | 'all') => void;
  setFilterType: (type: TicketType | 'all') => void;
  setFilterPriority: (priority: TicketPriority | 'all') => void;

  // Computed helpers
  getTicketById: (id: string) => Ticket | undefined;
  getFilteredTickets: () => Ticket[];
  getOpenTickets: () => Ticket[];
  getInProgressTickets: () => Ticket[];
  getClosedTickets: () => Ticket[];
  getStats: () => { open: number; inProgress: number; closed: number; total: number };
}

export const useTicketStore = create<TicketStore>((set, get) => ({
  // Initial data
  tickets: [],
  readyTickets: [],
  blockedTickets: [],
  depTree: null,
  depTreeRootId: null,

  // Initial UI state
  selectedTicketId: null,
  ticketSubView: 'board',
  createDialogOpen: false,
  detailDialogOpen: false,
  filterStatus: 'all',
  filterType: 'all',
  filterPriority: 'all',
  isLoading: false,
  error: null,

  // Data actions
  setTickets: (tickets, ready, blocked) => set({
    tickets,
    readyTickets: ready,
    blockedTickets: blocked,
    isLoading: false,
  }),

  addTicket: (ticket) => set((state) => ({
    tickets: [...state.tickets, ticket],
  })),

  updateTicket: (ticket) => set((state) => ({
    tickets: state.tickets.map(t => t.id === ticket.id ? ticket : t),
  })),

  removeTicket: (ticketId) => set((state) => ({
    tickets: state.tickets.filter(t => t.id !== ticketId),
    selectedTicketId: state.selectedTicketId === ticketId ? null : state.selectedTicketId,
  })),

  setDepTree: (rootId, tree) => set({
    depTree: tree,
    depTreeRootId: rootId,
  }),

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ isLoading: loading }),

  // UI actions
  selectTicket: (ticketId) => set({
    selectedTicketId: ticketId,
    detailDialogOpen: ticketId !== null,
  }),

  setSubView: (view) => set({ ticketSubView: view }),
  setCreateDialogOpen: (open) => set({ createDialogOpen: open }),
  setDetailDialogOpen: (open) => set({
    detailDialogOpen: open,
    selectedTicketId: open ? get().selectedTicketId : null,
  }),

  setFilterStatus: (status) => set({ filterStatus: status }),
  setFilterType: (type) => set({ filterType: type }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),

  // Computed helpers
  getTicketById: (id) => get().tickets.find(t => t.id === id),

  getFilteredTickets: () => {
    const { tickets, filterStatus, filterType, filterPriority } = get();
    return tickets.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      return true;
    });
  },

  getOpenTickets: () => get().tickets.filter(t => t.status === 'open'),
  getInProgressTickets: () => get().tickets.filter(t => t.status === 'in_progress'),
  getClosedTickets: () => get().tickets.filter(t => t.status === 'closed'),

  getStats: () => {
    const tickets = get().tickets;
    return {
      open: tickets.filter(t => t.status === 'open').length,
      inProgress: tickets.filter(t => t.status === 'in_progress').length,
      closed: tickets.filter(t => t.status === 'closed').length,
      total: tickets.length,
    };
  },
}));
