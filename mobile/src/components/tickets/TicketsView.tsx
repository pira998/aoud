import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Rocket, GitBranch, Plus, RefreshCw, TicketIcon } from 'lucide-react';
import { useTicketStore } from '../../store/ticketStore';
import { TicketBoard } from './TicketBoard';
import { ReadyQueue } from './ReadyQueue';
import { DepGraph } from './DepGraph';
import { TicketDetail } from './TicketDetail';
import { CreateTicket } from './CreateTicket';
import type { TicketType, TicketPriority } from '../../../../shared/ticket-types';

interface TicketsViewProps {
  isConnected: boolean;
  sendMessage: (msg: any) => void;
  activeProjectId?: string;
}

const SUB_VIEWS = [
  { id: 'board' as const, label: 'Board', icon: LayoutGrid },
  { id: 'ready' as const, label: 'Ready', icon: Rocket },
  { id: 'graph' as const, label: 'Graph', icon: GitBranch },
];

export const TicketsView: React.FC<TicketsViewProps> = ({
  isConnected,
  sendMessage,
  activeProjectId,
}) => {
  const tickets = useTicketStore(s => s.tickets);
  const readyTickets = useTicketStore(s => s.readyTickets);
  const blockedTickets = useTicketStore(s => s.blockedTickets);
  const depTree = useTicketStore(s => s.depTree);
  const depTreeRootId = useTicketStore(s => s.depTreeRootId);
  const selectedTicketId = useTicketStore(s => s.selectedTicketId);
  const ticketSubView = useTicketStore(s => s.ticketSubView);
  const createDialogOpen = useTicketStore(s => s.createDialogOpen);
  const detailDialogOpen = useTicketStore(s => s.detailDialogOpen);
  const isLoading = useTicketStore(s => s.isLoading);
  const error = useTicketStore(s => s.error);
  const setSubView = useTicketStore(s => s.setSubView);
  const setCreateDialogOpen = useTicketStore(s => s.setCreateDialogOpen);
  const selectTicket = useTicketStore(s => s.selectTicket);
  const setDetailDialogOpen = useTicketStore(s => s.setDetailDialogOpen);
  const setError = useTicketStore(s => s.setError);

  const stats = useMemo(() => {
    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress').length;
    const closed = tickets.filter(t => t.status === 'closed').length;
    return { open, inProgress, closed, total: tickets.length };
  }, [tickets]);

  // Stable ref for sendMessage to avoid re-render loops
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;

  // Clear tickets and request fresh list when project changes
  useEffect(() => {
    // Always clear old tickets immediately so stale data from another project isn't shown
    useTicketStore.getState().setTickets([], [], []);

    if (isConnected) {
      sendRef.current({ type: 'ticket_list' });
    }
  }, [isConnected, activeProjectId]);

  // Actions
  const handleCreate = useCallback((data: {
    title: string;
    body?: string;
    ticketType?: TicketType;
    priority?: TicketPriority;
  }) => {
    sendMessage({
      type: 'ticket_create',
      ...data,
    });
  }, [sendMessage]);

  const handleStart = useCallback((ticketId: string) => {
    sendMessage({ type: 'ticket_start', ticketId });
  }, [sendMessage]);

  const handleClose = useCallback((ticketId: string) => {
    sendMessage({ type: 'ticket_close', ticketId });
  }, [sendMessage]);

  const handleReopen = useCallback((ticketId: string) => {
    sendMessage({ type: 'ticket_reopen', ticketId });
  }, [sendMessage]);

  const handleDelete = useCallback((ticketId: string) => {
    sendMessage({ type: 'ticket_delete', ticketId });
  }, [sendMessage]);

  const handleRequestDepTree = useCallback((ticketId: string) => {
    sendMessage({ type: 'ticket_dep_tree', ticketId });
  }, [sendMessage]);

  const handleRefresh = useCallback(() => {
    sendMessage({ type: 'ticket_list' });
  }, [sendMessage]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/50 bg-card/40 backdrop-blur-sm">
        {SUB_VIEWS.map(view => {
          const Icon = view.icon;
          return (
            <button
              key={view.id}
              onClick={() => setSubView(view.id)}
              className={`
                relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all font-medium
                ${ticketSubView === view.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              {view.label}
              {view.id === 'ready' && readyTickets.length > 0 && (
                <span className="text-[10px] px-1 py-0 rounded-full bg-green-500/20 text-green-400 font-bold">
                  {readyTickets.length}
                </span>
              )}
              {ticketSubView === view.id && (
                <motion.div
                  layoutId="ticketSubTab"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
            </button>
          );
        })}

        <div className="flex-1" />

        {/* Stats summary */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-2">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            {stats.open}
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            {stats.inProgress}
          </span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {stats.closed}
          </span>
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
          title="Refresh tickets"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
        </button>

        {/* Create button */}
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
            bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">dismiss</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="max-w-4xl mx-auto">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
              <TicketIcon className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">Not connected</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Connect to a bridge server to manage tickets</p>
          </div>
        ) : tickets.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <TicketIcon className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-sm text-foreground font-medium">No tickets yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
              Create your first ticket to start tracking work. Tickets are saved as markdown files in your project.
            </p>
            <button
              onClick={() => setCreateDialogOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Ticket
            </button>
          </div>
        ) : (
          <>
            {ticketSubView === 'board' && (
              <TicketBoard
                tickets={tickets}
                blockedTickets={blockedTickets}
                onSelect={(id) => selectTicket(id)}
                onStart={handleStart}
                onClose={handleClose}
              />
            )}

            {ticketSubView === 'ready' && (
              <ReadyQueue
                readyTickets={readyTickets}
                blockedTickets={blockedTickets}
                onSelect={(id) => selectTicket(id)}
                onStart={handleStart}
                onClose={handleClose}
              />
            )}

            {ticketSubView === 'graph' && (
              <DepGraph
                tickets={tickets}
                depTree={depTree}
                depTreeRootId={depTreeRootId}
                onRequestTree={handleRequestDepTree}
                onSelect={(id) => selectTicket(id)}
              />
            )}
          </>
        )}
        </div>
      </div>

      {/* Create Dialog */}
      <CreateTicket
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={handleCreate}
      />

      {/* Detail Dialog */}
      <TicketDetail
        ticket={selectedTicket}
        isOpen={detailDialogOpen}
        allTickets={tickets}
        onClose={() => setDetailDialogOpen(false)}
        onStart={handleStart}
        onCloseTicket={handleClose}
        onReopen={handleReopen}
        onDelete={handleDelete}
      />
    </div>
  );
};
