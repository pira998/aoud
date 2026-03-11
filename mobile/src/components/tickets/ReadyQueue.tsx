import React from 'react';
import { motion } from 'framer-motion';
import { Rocket, ShieldAlert, ArrowRight } from 'lucide-react';
import { TicketCard } from './TicketCard';
import type { Ticket, BlockedTicket } from '../../../../shared/ticket-types';

interface ReadyQueueProps {
  readyTickets: Ticket[];
  blockedTickets: BlockedTicket[];
  onSelect: (ticketId: string) => void;
  onStart: (ticketId: string) => void;
  onClose: (ticketId: string) => void;
}

export const ReadyQueue: React.FC<ReadyQueueProps> = ({
  readyTickets,
  blockedTickets,
  onSelect,
  onStart,
  onClose,
}) => {
  return (
    <div className="space-y-6">
      {/* Ready Section */}
      <div>
        <div className="flex items-center gap-2 px-1 py-2 mb-3">
          <Rocket className="w-4 h-4 text-green-400" />
          <span className="text-sm font-semibold text-foreground">Ready to Work On</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
            {readyTickets.length}
          </span>
        </div>

        {readyTickets.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-8 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <Rocket className="w-6 h-6 text-green-500/50" />
            </div>
            <p className="text-sm text-muted-foreground">No tickets ready</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create tickets or resolve blockers to see them here
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {readyTickets.map((ticket, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <TicketCard
                  ticket={ticket}
                  onSelect={onSelect}
                  onStart={onStart}
                  onClose={onClose}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Blocked Section */}
      {blockedTickets.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-1 py-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-foreground">Blocked</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">
              {blockedTickets.length}
            </span>
          </div>

          <div className="space-y-2">
            {blockedTickets.map(({ ticket, blockers }, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <TicketCard
                  ticket={ticket}
                  isBlocked={true}
                  blockers={blockers}
                  onSelect={onSelect}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
