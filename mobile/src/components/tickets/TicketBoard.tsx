import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, Loader2, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { TicketCard } from './TicketCard';
import type { Ticket, BlockedTicket } from '../../../../shared/ticket-types';

interface TicketBoardProps {
  tickets: Ticket[];
  blockedTickets: BlockedTicket[];
  onSelect: (ticketId: string) => void;
  onStart: (ticketId: string) => void;
  onClose: (ticketId: string) => void;
}

interface ColumnProps {
  title: string;
  icon: React.ReactNode;
  tickets: Ticket[];
  blockedTickets: BlockedTicket[];
  count: number;
  color: string;
  defaultOpen?: boolean;
  onSelect: (ticketId: string) => void;
  onStart?: (ticketId: string) => void;
  onClose?: (ticketId: string) => void;
}

const Column: React.FC<ColumnProps> = ({
  title,
  icon,
  tickets,
  blockedTickets,
  count,
  color,
  defaultOpen = true,
  onSelect,
  onStart,
  onClose,
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const blockerMap = new Map(
    blockedTickets.map(bt => [bt.ticket.id, bt.blockers])
  );

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-1 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {icon}
        <span>{title}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${color}`}>{count}</span>
        <div className="flex-1" />
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2 overflow-hidden"
          >
            {tickets.length === 0 ? (
              <div className="text-xs text-muted-foreground/50 py-3 text-center italic">
                No tickets
              </div>
            ) : (
              tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  isBlocked={blockerMap.has(ticket.id)}
                  blockers={blockerMap.get(ticket.id)}
                  onSelect={onSelect}
                  onStart={onStart}
                  onClose={onClose}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const TicketBoard: React.FC<TicketBoardProps> = ({
  tickets,
  blockedTickets,
  onSelect,
  onStart,
  onClose,
}) => {
  const openTickets = tickets
    .filter(t => t.status === 'open')
    .sort((a, b) => a.priority - b.priority);

  const inProgressTickets = tickets
    .filter(t => t.status === 'in_progress')
    .sort((a, b) => a.priority - b.priority);

  const closedTickets = tickets
    .filter(t => t.status === 'closed')
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    .slice(0, 10); // Show only 10 most recent

  return (
    <div className="space-y-1">
      <Column
        title="In Progress"
        icon={<Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
        tickets={inProgressTickets}
        blockedTickets={blockedTickets}
        count={inProgressTickets.length}
        color="bg-blue-500/20 text-blue-400"
        onSelect={onSelect}
        onClose={onClose}
      />

      <Column
        title="Open"
        icon={<Circle className="w-4 h-4 text-yellow-400" />}
        tickets={openTickets}
        blockedTickets={blockedTickets}
        count={openTickets.length}
        color="bg-yellow-500/20 text-yellow-400"
        onSelect={onSelect}
        onStart={onStart}
      />

      <Column
        title="Recently Closed"
        icon={<CheckCircle2 className="w-4 h-4 text-green-400" />}
        tickets={closedTickets}
        blockedTickets={[]}
        count={tickets.filter(t => t.status === 'closed').length}
        color="bg-green-500/20 text-green-400"
        defaultOpen={false}
        onSelect={onSelect}
      />
    </div>
  );
};
